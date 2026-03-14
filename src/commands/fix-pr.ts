/**
 * `judges fix-pr` — Create a GitHub PR with auto-fix patches.
 *
 * Evaluates files, collects findings with patches, applies them on a new branch,
 * and opens a pull request — like Dependabot but for code quality.
 *
 * Usage:
 *   judges fix-pr src/                                 # Fix all files in src/
 *   judges fix-pr src/app.ts                           # Fix a single file
 *   judges fix-pr . --branch judges/auto-fix           # Custom branch name
 *   judges fix-pr . --severity high                    # Only high+ fixes
 *   judges fix-pr . --dry-run                          # Preview without creating PR
 *
 * Requires: GITHUB_TOKEN or `gh` CLI authenticated.
 */

import { execFileSync, execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, extname, relative, join } from "path";
import { tmpdir } from "os";

import { evaluateWithTribunal } from "../evaluators/index.js";
import { applyPatches, type PatchCandidate } from "./fix.js";
import type { TribunalVerdict } from "../types.js";

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".h": "c",
  ".hpp": "cpp",
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXT_TO_LANG));

function detectLanguage(filePath: string): string {
  const base = filePath.toLowerCase();
  if (base.endsWith("dockerfile") || base.includes("dockerfile.")) return "dockerfile";
  return EXT_TO_LANG[extname(base)] || "typescript";
}

// ─── File Collection ────────────────────────────────────────────────────────

function collectFiles(dir: string, maxFiles = 200): string[] {
  const files: string[] = [];
  const stack = [resolve(dir)];

  while (stack.length > 0 && files.length < maxFiles) {
    const current = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === "build") continue;
      const fullPath = join(current, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          stack.push(fullPath);
        } else if (SUPPORTED_EXTENSIONS.has(extname(entry).toLowerCase())) {
          files.push(fullPath);
          if (files.length >= maxFiles) break;
        }
      } catch {
        continue;
      }
    }
  }
  return files;
}

// ─── GitHub Helpers ─────────────────────────────────────────────────────────

function getToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

function detectRepo(): string | undefined {
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    const sshMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (sshMatch) return sshMatch[1];
    const httpsMatch = remote.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (httpsMatch) return httpsMatch[1];
  } catch {
    // Not a git repo
  }
  return undefined;
}

function getCurrentBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "main";
  }
}

function ghCliAvailable(): boolean {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── Severity Filter ────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function meetsMinSeverity(severity: string, minSeverity: string): boolean {
  return (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[minSeverity] ?? 0);
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

export interface FixPrResult {
  filesFixed: number;
  patchesApplied: number;
  branch: string;
  prUrl?: string;
}

export async function runFixPr(argv: string[]): Promise<void> {
  // Parse args
  const target =
    argv.find(
      (a, i) =>
        i > 1 &&
        !a.startsWith("-") &&
        argv[i - 1] !== "--branch" &&
        argv[i - 1] !== "--severity" &&
        argv[i - 1] !== "--repo",
    ) || ".";
  const branch = argv.find((_a, i) => argv[i - 1] === "--branch") || `judges/auto-fix-${Date.now()}`;
  const minSeverity = argv.find((_a, i) => argv[i - 1] === "--severity") || "low";
  const repo = argv.find((_a, i) => argv[i - 1] === "--repo") || detectRepo();
  const dryRun = argv.includes("--dry-run") || argv.includes("-n");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges fix-pr — Create a PR with auto-fix patches

Usage:
  judges fix-pr <path>                        Fix all files and create PR
  judges fix-pr <path> --dry-run              Preview fixes without creating PR
  judges fix-pr <path> --branch <name>        Custom branch name
  judges fix-pr <path> --severity <level>     Only apply fixes at or above severity
  judges fix-pr <path> --repo <owner/repo>    Target repository

Options:
  --dry-run, -n          Preview changes without pushing
  --branch <name>        Branch name (default: judges/auto-fix-<timestamp>)
  --severity <level>     Minimum severity: critical, high, medium, low, info
  --repo <owner/repo>    GitHub repository (auto-detected from git remote)
  --help, -h             Show this help

Environment:
  GITHUB_TOKEN           GitHub token for API access
  GH_TOKEN               Alternative token variable

Requires: git, and either GITHUB_TOKEN or gh CLI authenticated.
`);
    return;
  }

  const token = getToken();
  if (!token && !ghCliAvailable() && !dryRun) {
    console.error("Error: GITHUB_TOKEN not set and gh CLI not available.");
    console.error("Set GITHUB_TOKEN or authenticate with: gh auth login");
    process.exit(1);
  }

  if (!repo && !dryRun) {
    console.error("Error: Could not detect GitHub repository. Use --repo owner/repo.");
    process.exit(1);
  }

  // Collect files
  const resolvedTarget = resolve(target);
  let files: string[];
  if (statSync(resolvedTarget).isDirectory()) {
    files = collectFiles(resolvedTarget);
  } else {
    files = [resolvedTarget];
  }

  console.log(`\n  Scanning ${files.length} file(s) for auto-fixable findings...\n`);

  // Evaluate and collect patches per file
  const fileFixes: Array<{ path: string; relPath: string; originalCode: string; fixedCode: string; applied: number }> =
    [];
  let totalPatches = 0;

  for (const filePath of files) {
    const code = readFileSync(filePath, "utf-8");
    const lang = detectLanguage(filePath);
    const verdict: TribunalVerdict = evaluateWithTribunal(code, lang);

    const fixable: PatchCandidate[] = verdict.findings
      .filter((f) => f.patch && meetsMinSeverity(f.severity, minSeverity))
      .map((f) => ({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        patch: f.patch!,
        lineNumbers: f.lineNumbers,
      }));

    if (fixable.length === 0) continue;

    const result = applyPatches(code, fixable);
    if (result.applied === 0) continue;

    const relPath = relative(process.cwd(), filePath);
    fileFixes.push({
      path: filePath,
      relPath,
      originalCode: code,
      fixedCode: result.result,
      applied: result.applied,
    });
    totalPatches += result.applied;

    console.log(`  ✓ ${relPath}: ${result.applied} fix(es) applied`);
  }

  if (fileFixes.length === 0) {
    console.log("\n  No auto-fixable findings found. Nothing to do.\n");
    return;
  }

  console.log(`\n  Total: ${totalPatches} fix(es) across ${fileFixes.length} file(s)\n`);

  if (dryRun) {
    console.log("  --dry-run: No PR will be created.\n");
    // Show diff preview
    for (const fix of fileFixes) {
      console.log(`  --- ${fix.relPath}`);
      console.log(`  +++ ${fix.relPath} (${fix.applied} fixes)`);
    }
    return;
  }

  // Create branch, apply fixes, commit, push, create PR
  const baseBranch = getCurrentBranch();

  try {
    // Create and checkout new branch
    execSync(`git checkout -b ${branch}`, { stdio: "pipe" });

    // Write fixed files
    for (const fix of fileFixes) {
      writeFileSync(fix.path, fix.fixedCode, "utf-8");
    }

    // Stage and commit
    execSync("git add -A", { stdio: "pipe" });
    const commitMsg = `fix: auto-fix ${totalPatches} finding(s) across ${fileFixes.length} file(s)\n\nApplied by Judges Panel auto-fix.\n\nFixes applied:\n${fileFixes.map((f) => `- ${f.relPath}: ${f.applied} fix(es)`).join("\n")}`;
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { stdio: "pipe" });

    // Push
    execSync(`git push origin ${branch}`, { stdio: "pipe" });

    console.log(`  ✓ Pushed branch: ${branch}`);

    // Create PR
    const prTitle = `fix: Judges Panel auto-fix — ${totalPatches} finding(s)`;
    const prBody = [
      "## 🔧 Auto-Fix by Judges Panel",
      "",
      `Applied **${totalPatches}** automated fix(es) across **${fileFixes.length}** file(s).`,
      "",
      "### Files Fixed",
      "",
      ...fileFixes.map((f) => `- \`${f.relPath}\` — ${f.applied} fix(es)`),
      "",
      "---",
      "",
      "*This PR was generated automatically by [Judges Panel](https://github.com/KevinRabun/judges). Review the changes before merging.*",
    ].join("\n");

    if (ghCliAvailable()) {
      try {
        const output = execFileSync(
          "gh",
          ["pr", "create", "--title", prTitle, "--body", prBody, "--base", baseBranch, "--head", branch],
          { encoding: "utf-8" },
        ).trim();
        console.log(`  ✓ PR created: ${output}`);
      } catch (err) {
        console.error(`  ✗ Failed to create PR via gh CLI: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (token && repo) {
      const tmpFile = join(tmpdir(), `.judges-fix-pr-${process.pid}.json`);
      const body = { title: prTitle, body: prBody, head: branch, base: baseBranch };
      writeFileSync(tmpFile, JSON.stringify(body), "utf-8");

      try {
        const curlArgs = [
          "-s",
          "-X",
          "POST",
          "-H",
          `Authorization: Bearer ${token}`,
          "-H",
          "Accept: application/vnd.github.v3+json",
          "-H",
          "Content-Type: application/json",
          "-d",
          `@${tmpFile}`,
          `https://api.github.com/repos/${repo}/pulls`,
        ];
        const output = execFileSync("curl", curlArgs, { encoding: "utf-8" }).trim();
        try {
          const parsed = JSON.parse(output);
          if (parsed.html_url) {
            console.log(`  ✓ PR created: ${parsed.html_url}`);
          } else {
            console.error(`  ✗ PR creation response: ${output.slice(0, 300)}`);
          }
        } catch {
          console.error(`  ✗ Failed to parse PR response`);
        }
      } finally {
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync(tmpFile);
        } catch {
          // ignore cleanup
        }
      }
    }
  } catch (err) {
    console.error(`  ✗ Git error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Return to original branch
    try {
      execSync(`git checkout ${baseBranch}`, { stdio: "pipe" });
    } catch {
      // If checkout fails, we're still on the fix branch
    }
  }
}
