/**
 * Review-merge-check — Pre-merge review validation.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MergeCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface MergeCheckResult {
  canMerge: boolean;
  checks: MergeCheck[];
  verdict: string;
  score: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMergeCheck(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const strictIdx = argv.indexOf("--strict");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const strict = strictIdx >= 0;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-merge-check — Pre-merge review validation

Usage:
  judges review-merge-check --file <verdict.json> [--strict] [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --strict           Enable strict mode (no critical or high findings)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const checks: MergeCheck[] = [];

  // Check 1: No critical findings
  checks.push({
    name: "No critical findings",
    passed: verdict.criticalCount === 0,
    detail: verdict.criticalCount === 0 ? "No critical findings" : `${verdict.criticalCount} critical finding(s)`,
  });

  // Check 2: Score above threshold
  const scoreThreshold = strict ? 70 : 40;
  checks.push({
    name: `Score ≥ ${scoreThreshold}`,
    passed: verdict.overallScore >= scoreThreshold,
    detail: `Score: ${verdict.overallScore}`,
  });

  // Check 3: Verdict is not fail (in unstrict mode)
  checks.push({
    name: "Verdict is not fail",
    passed: verdict.overallVerdict !== "fail",
    detail: `Verdict: ${verdict.overallVerdict}`,
  });

  // Check 4: (strict) No high findings
  if (strict) {
    checks.push({
      name: "No high findings",
      passed: verdict.highCount === 0,
      detail: verdict.highCount === 0 ? "No high findings" : `${verdict.highCount} high finding(s)`,
    });
  }

  // Check 5: (strict) Limited total findings
  if (strict) {
    checks.push({
      name: "Total findings ≤ 10",
      passed: verdict.findings.length <= 10,
      detail: `${verdict.findings.length} total finding(s)`,
    });
  }

  const canMerge = checks.every((c) => c.passed);
  const result: MergeCheckResult = { canMerge, checks, verdict: verdict.overallVerdict, score: verdict.overallScore };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nMerge Check Results${strict ? " (strict)" : ""}`);
  console.log("═".repeat(55));

  for (const c of checks) {
    const icon = c.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${c.name}`);
    console.log(`         ${c.detail}`);
  }

  console.log("═".repeat(55));
  console.log(`\nResult: ${canMerge ? "MERGE ALLOWED" : "MERGE BLOCKED"}`);

  if (!canMerge) {
    process.exitCode = 1;
  }
}
