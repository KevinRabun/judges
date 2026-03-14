/**
 * `judges monorepo` — Monorepo workspace evaluation.
 *
 * Discovers packages in a monorepo (lerna, pnpm-workspace, turbo, packages/,
 * apps/) and evaluates each one with its local `.judgesrc` cascading config.
 *
 * Usage:
 *   judges monorepo                       # Auto-detect and evaluate all packages
 *   judges monorepo --list                # List detected packages only
 *   judges monorepo --concurrency 4       # Evaluate 4 packages in parallel
 *   judges monorepo --format json         # JSON summary
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve, join, relative, basename } from "path";
import { loadCascadingConfig } from "../config.js";
import type { JudgesConfig } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MonorepoPackage {
  /** Package name (from package.json name or directory name) */
  name: string;
  /** Absolute path to the package */
  path: string;
  /** Relative path from root */
  relativePath: string;
  /** Has its own .judgesrc */
  hasLocalConfig: boolean;
  /** Resolved config (cascading merge) */
  config: JudgesConfig;
  /** Languages detected */
  languages: string[];
}

export interface MonorepoScanResult {
  /** Root directory */
  root: string;
  /** Monorepo tool detected */
  tool: "pnpm" | "lerna" | "turbo" | "nx" | "npm-workspaces" | "heuristic";
  /** Discovered packages */
  packages: MonorepoPackage[];
}

// ─── Package Discovery ─────────────────────────────────────────────────────

function readJsonSafe(filepath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return null;
  }
}

function readYamlWorkspaces(filepath: string): string[] {
  try {
    const content = readFileSync(filepath, "utf-8");
    const patterns: string[] = [];
    // Simple extraction — lines starting with "  - " under "packages:"
    let inPackages = false;
    for (const line of content.split("\n")) {
      if (/^packages:/i.test(line.trim())) {
        inPackages = true;
        continue;
      }
      if (inPackages && line.match(/^\s+-\s+/)) {
        patterns.push(
          line
            .replace(/^\s+-\s+/, "")
            .replace(/['"]/g, "")
            .trim(),
        );
      } else if (inPackages && !line.match(/^\s/)) {
        inPackages = false;
      }
    }
    return patterns;
  } catch {
    return [];
  }
}

function expandGlobDirs(root: string, patterns: string[]): string[] {
  const dirs: string[] = [];
  for (const pattern of patterns) {
    const clean = pattern.replace(/\/\*$/, "").replace(/\*\*$/, "");
    const base = join(root, clean);
    if (!existsSync(base) || !statSync(base).isDirectory()) continue;

    // If pattern ends with * — list subdirectories
    if (pattern.endsWith("/*") || pattern.endsWith("/**")) {
      try {
        for (const entry of readdirSync(base)) {
          const full = join(base, entry);
          if (statSync(full).isDirectory()) dirs.push(full);
        }
      } catch {
        /* skip */
      }
    } else {
      dirs.push(base);
    }
  }
  return dirs;
}

function detectLanguagesInDir(dir: string): string[] {
  const langs = new Set<string>();
  const EXT_MAP: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".c": "c",
    ".h": "c",
  };

  try {
    const entries = readdirSync(dir, { recursive: true, withFileTypes: false }) as string[];
    for (const entry of entries.slice(0, 500)) {
      const ext = entry.substring(entry.lastIndexOf(".")).toLowerCase();
      if (EXT_MAP[ext]) langs.add(EXT_MAP[ext]);
    }
  } catch {
    /* skip */
  }

  return [...langs];
}

export function discoverPackages(root: string): MonorepoScanResult {
  const absRoot = resolve(root);
  let tool: MonorepoScanResult["tool"] = "heuristic";
  let packageDirs: string[] = [];

  // 1. pnpm-workspace.yaml
  const pnpmWs = join(absRoot, "pnpm-workspace.yaml");
  if (existsSync(pnpmWs)) {
    tool = "pnpm";
    const patterns = readYamlWorkspaces(pnpmWs);
    packageDirs = expandGlobDirs(absRoot, patterns);
  }

  // 2. lerna.json
  if (packageDirs.length === 0) {
    const lernaPath = join(absRoot, "lerna.json");
    if (existsSync(lernaPath)) {
      tool = "lerna";
      const lerna = readJsonSafe(lernaPath);
      const patterns = (lerna?.packages as string[]) || ["packages/*"];
      packageDirs = expandGlobDirs(absRoot, patterns);
    }
  }

  // 3. turbo.json — check root package.json workspaces
  if (packageDirs.length === 0 && existsSync(join(absRoot, "turbo.json"))) {
    tool = "turbo";
    const rootPkg = readJsonSafe(join(absRoot, "package.json"));
    const workspaces = (rootPkg?.workspaces as string[]) || [];
    packageDirs = expandGlobDirs(absRoot, workspaces.length > 0 ? workspaces : ["packages/*", "apps/*"]);
  }

  // 4. npm workspaces (package.json "workspaces" field)
  if (packageDirs.length === 0) {
    const rootPkg = readJsonSafe(join(absRoot, "package.json"));
    if (rootPkg?.workspaces) {
      tool = "npm-workspaces";
      const workspaces = Array.isArray(rootPkg.workspaces)
        ? (rootPkg.workspaces as string[])
        : (rootPkg.workspaces as Record<string, string[]>).packages || [];
      packageDirs = expandGlobDirs(absRoot, workspaces);
    }
  }

  // 5. nx.json
  if (packageDirs.length === 0 && existsSync(join(absRoot, "nx.json"))) {
    tool = "nx";
    packageDirs = expandGlobDirs(absRoot, ["packages/*", "apps/*", "libs/*"]);
  }

  // 6. Heuristic — look for packages/ and apps/ directories
  if (packageDirs.length === 0) {
    packageDirs = expandGlobDirs(absRoot, ["packages/*", "apps/*"]);
  }

  // Build package metadata
  const packages: MonorepoPackage[] = packageDirs
    .filter((dir) => existsSync(dir) && statSync(dir).isDirectory())
    .map((dir) => {
      const pkg = readJsonSafe(join(dir, "package.json"));
      const hasLocalConfig = existsSync(join(dir, ".judgesrc"));
      const config = loadCascadingConfig(dir, absRoot);
      const name = (pkg?.name as string) || basename(dir);

      return {
        name,
        path: dir,
        relativePath: relative(absRoot, dir),
        hasLocalConfig,
        config,
        languages: detectLanguagesInDir(dir),
      };
    });

  return { root: absRoot, tool, packages };
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runMonorepoCommand(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges monorepo — Monorepo workspace evaluation

Usage:
  judges monorepo [root]                    Auto-detect and list packages
  judges monorepo --list                    List detected packages only
  judges monorepo --format json             JSON output

Supports:
  • pnpm-workspace.yaml
  • lerna.json
  • turbo.json
  • npm workspaces (package.json "workspaces")
  • nx.json
  • Heuristic (packages/, apps/ directories)

Each package inherits its .judgesrc config via cascading config resolution.

Options:
  --list                List packages only (no evaluation)
  --format <fmt>        Output format: text, json
  --help, -h            Show this help
`);
    return;
  }

  const root = argv.find((a, i) => i > 1 && !a.startsWith("-") && argv[i - 1] !== "--format") || ".";
  const format = argv.find((_a, i) => argv[i - 1] === "--format") || "text";

  console.log(`\n  Scanning for monorepo packages in ${resolve(root)}...\n`);
  const result = discoverPackages(resolve(root));

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Text output
  console.log(`  Monorepo tool: ${result.tool}`);
  console.log(`  Packages found: ${result.packages.length}\n`);

  if (result.packages.length === 0) {
    console.log("  No packages detected. Run from a monorepo root or use manual package paths.\n");
    return;
  }

  const nameWidth = Math.max(12, ...result.packages.map((p) => p.name.length));

  console.log(`  ${"PACKAGE".padEnd(nameWidth)}  ${"PATH".padEnd(30)}  ${"CONFIG"}  LANGUAGES`);
  console.log(`  ${"─".repeat(nameWidth)}  ${"─".repeat(30)}  ${"──────"}  ${"─".repeat(20)}`);

  for (const pkg of result.packages) {
    const configStatus = pkg.hasLocalConfig ? "local " : "inherit";
    console.log(
      `  ${pkg.name.padEnd(nameWidth)}  ${pkg.relativePath.padEnd(30)}  ${configStatus}  ${pkg.languages.join(", ") || "—"}`,
    );
  }

  console.log("");
}
