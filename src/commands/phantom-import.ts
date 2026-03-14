/**
 * Phantom import — detect hallucinated imports, non-existent modules, and wrong export names.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, dirname, resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PhantomIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Exports Index ──────────────────────────────────────────────────────────

function buildExportsMap(files: string[]): Map<string, Set<string>> {
  const exports = new Map<string, Set<string>>();
  for (const filepath of files) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }
    const names = new Set<string>();
    // export function/class/const/let/var/type/interface/enum
    for (const m of content.matchAll(
      /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g,
    )) {
      names.add(m[1]);
    }
    // export { ... }
    for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const name of m[1].split(",")) {
        const cleaned = name
          .trim()
          .split(/\s+as\s+/)[0]
          .trim();
        if (cleaned) names.add(cleaned);
      }
    }
    // export default
    if (/export\s+default\s/.test(content)) names.add("default");
    exports.set(filepath, names);
  }
  return exports;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, exportsMap: Map<string, Set<string>>, projectDir: string): PhantomIssue[] {
  const issues: PhantomIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // import from relative path
    const relImport = line.match(/import\s+(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"](\.[^'"]+)['"]/);
    if (relImport) {
      const importPath = relImport[1];
      const dir = dirname(filepath);
      const candidates = [
        resolve(dir, importPath),
        resolve(dir, importPath + ".ts"),
        resolve(dir, importPath + ".tsx"),
        resolve(dir, importPath + ".js"),
        resolve(dir, importPath + ".jsx"),
        resolve(dir, importPath, "index.ts"),
        resolve(dir, importPath, "index.js"),
      ];
      const resolved = candidates.find((c) => existsSync(c));
      if (!resolved) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Import resolves to non-existent file",
          severity: "high",
          detail: `\`${importPath}\` does not exist — AI may have hallucinated this module path`,
        });
      } else {
        // Check named imports exist in target
        const namedMatch = line.match(/import\s*\{([^}]+)\}\s*from/);
        if (namedMatch) {
          const targetExports = exportsMap.get(resolved);
          if (targetExports) {
            const imported = namedMatch[1]
              .split(",")
              .map((n) =>
                n
                  .trim()
                  .split(/\s+as\s+/)[0]
                  .trim(),
              )
              .filter(Boolean);
            for (const name of imported) {
              if (!targetExports.has(name)) {
                issues.push({
                  file: filepath,
                  line: i + 1,
                  issue: "Named import does not exist in target",
                  severity: "high",
                  detail: `\`${name}\` is not exported from \`${importPath}\` — may be a hallucinated export name`,
                });
              }
            }
          }
        }
      }
    }

    // Common hallucinated npm packages (AI often invents package names)
    const npmImport = line.match(/import\s+.*\s+from\s+['"]([a-z@][a-z0-9./_-]*)['"]/);
    if (npmImport && !npmImport[1].startsWith(".")) {
      const pkg = npmImport[1]
        .split("/")
        .slice(0, npmImport[1].startsWith("@") ? 2 : 1)
        .join("/");
      // Check if package exists in node_modules
      const nmPath = join(projectDir, "node_modules", pkg);
      if (!existsSync(nmPath)) {
        // Check if it's in package.json
        try {
          const pkgJson = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8"));
          const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies, ...pkgJson.peerDependencies };
          if (!allDeps[pkg]) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Import from uninstalled package",
              severity: "high",
              detail: `\`${pkg}\` is not in package.json or node_modules — may be a hallucinated package`,
            });
          }
        } catch {
          /* skip */
        }
      }
    }

    // require() of non-existent relative path
    const requireMatch = line.match(/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const reqPath = requireMatch[1];
      const dir = dirname(filepath);
      const candidates = [
        resolve(dir, reqPath),
        resolve(dir, reqPath + ".ts"),
        resolve(dir, reqPath + ".js"),
        resolve(dir, reqPath + ".json"),
        resolve(dir, reqPath, "index.js"),
      ];
      if (!candidates.some((c) => existsSync(c))) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "require() of non-existent module",
          severity: "high",
          detail: `\`${reqPath}\` does not resolve to any file — may be hallucinated`,
        });
      }
    }

    // Importing from deprecated / removed Node.js APIs
    const deprecatedImport = line.match(
      /(?:import|require)\s*(?:\(?\s*['"])(sys|_linklist|constants|punycode|domain|v8\/tools|node:sys)['"](?:\))?/,
    );
    if (deprecatedImport) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Import of deprecated Node.js module",
        severity: "medium",
        detail: `\`${deprecatedImport[1]}\` is deprecated or removed — AI may be referencing outdated API`,
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPhantomImport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges phantom-import — Detect hallucinated imports and non-existent modules

Usage:
  judges phantom-import [dir]
  judges phantom-import src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: non-existent relative imports, hallucinated named exports, uninstalled packages,
deprecated Node.js modules, require() of missing files.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";
  const projectDir = resolve(dir);

  const files = collectFiles(dir);
  const exportsMap = buildExportsMap(files);
  const allIssues: PhantomIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, exportsMap, projectDir));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 15 - medCount * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ CLEAN" : score >= 50 ? "⚠️  SUSPECT" : "❌ PHANTOMS";
    console.log(`\n  Phantom Import: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No phantom imports detected.\n");
      return;
    }
    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);
    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
