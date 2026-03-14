/**
 * Review-branch-compare — Compare review results between git branches.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import type { TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentBranch(): string {
  try {
    return execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getBranchDiff(base: string, head: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${base}...${head}`, { encoding: "utf-8" });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function loadVerdict(path: string): TribunalVerdict | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBranchCompare(argv: string[]): void {
  const baseIdx = argv.indexOf("--base");
  const headIdx = argv.indexOf("--head");
  const baseVerdictIdx = argv.indexOf("--base-verdict");
  const headVerdictIdx = argv.indexOf("--head-verdict");
  const formatIdx = argv.indexOf("--format");
  const base = baseIdx >= 0 ? argv[baseIdx + 1] : "main";
  const head = headIdx >= 0 ? argv[headIdx + 1] : getCurrentBranch();
  const baseVerdictPath = baseVerdictIdx >= 0 ? argv[baseVerdictIdx + 1] : undefined;
  const headVerdictPath = headVerdictIdx >= 0 ? argv[headVerdictIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-branch-compare — Compare reviews between branches

Usage:
  judges review-branch-compare [--base <branch>] [--head <branch>]
                                [--base-verdict <path>] [--head-verdict <path>]
                                [--format table|json]

Options:
  --base <branch>        Base branch (default: main)
  --head <branch>        Head branch (default: current branch)
  --base-verdict <path>  Verdict JSON for base branch
  --head-verdict <path>  Verdict JSON for head branch
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help
`);
    return;
  }

  const changedFiles = getBranchDiff(base, head);

  const result: Record<string, unknown> = {
    base,
    head,
    changedFiles: changedFiles.length,
    fileList: changedFiles,
  };

  // If verdicts provided, compare them
  if (baseVerdictPath && headVerdictPath) {
    const baseVerdict = loadVerdict(baseVerdictPath);
    const headVerdict = loadVerdict(headVerdictPath);

    if (baseVerdict && headVerdict) {
      const baseKeys = new Set(baseVerdict.findings.map((f) => `${f.ruleId}:${f.title}`));
      const headKeys = new Set(headVerdict.findings.map((f) => `${f.ruleId}:${f.title}`));

      const newFindings = headVerdict.findings.filter((f) => !baseKeys.has(`${f.ruleId}:${f.title}`));
      const resolved = baseVerdict.findings.filter((f) => !headKeys.has(`${f.ruleId}:${f.title}`));

      result.scoreChange = headVerdict.overallScore - baseVerdict.overallScore;
      result.newFindings = newFindings.length;
      result.resolvedFindings = resolved.length;
      result.baseTotal = baseVerdict.findings.length;
      result.headTotal = headVerdict.findings.length;
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nBranch Comparison: ${base} → ${head}`);
  console.log("═".repeat(60));
  console.log(`Changed files: ${changedFiles.length}`);

  if (changedFiles.length > 0) {
    console.log("\nChanged files:");
    for (const f of changedFiles.slice(0, 20)) console.log(`  ${f}`);
    if (changedFiles.length > 20) console.log(`  ... and ${changedFiles.length - 20} more`);
  }

  if (result.scoreChange !== undefined) {
    console.log("\n" + "─".repeat(60));
    console.log("Verdict Comparison:");
    const dir = (result.scoreChange as number) >= 0 ? "+" : "";
    console.log(`  Score change: ${dir}${result.scoreChange}`);
    console.log(`  Base findings: ${result.baseTotal}`);
    console.log(`  Head findings: ${result.headTotal}`);
    console.log(`  New findings: ${result.newFindings}`);
    console.log(`  Resolved: ${result.resolvedFindings}`);
  }

  console.log("═".repeat(60));
}
