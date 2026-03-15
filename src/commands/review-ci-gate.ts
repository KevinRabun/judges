/**
 * Review-ci-gate — CI gate integration checks for review verdicts.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict, Verdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GatePolicy {
  maxCritical: number;
  maxHigh: number;
  minScore: number;
  requiredVerdict: Verdict;
}

interface GateResult {
  passed: boolean;
  policy: GatePolicy;
  actual: {
    criticalCount: number;
    highCount: number;
    score: number;
    verdict: string;
  };
  violations: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function evaluateGate(verdict: TribunalVerdict, policy: GatePolicy): GateResult {
  const violations: string[] = [];

  if (verdict.criticalCount > policy.maxCritical) {
    violations.push(`Critical findings: ${verdict.criticalCount} > ${policy.maxCritical}`);
  }
  if (verdict.highCount > policy.maxHigh) {
    violations.push(`High findings: ${verdict.highCount} > ${policy.maxHigh}`);
  }
  if (verdict.overallScore < policy.minScore) {
    violations.push(`Score: ${verdict.overallScore} < ${policy.minScore}`);
  }

  const verdictOrder = ["pass", "warning", "fail"];
  const actualIdx = verdictOrder.indexOf(verdict.overallVerdict);
  const requiredIdx = verdictOrder.indexOf(policy.requiredVerdict);
  if (actualIdx > requiredIdx) {
    violations.push(`Verdict: ${verdict.overallVerdict} worse than required ${policy.requiredVerdict}`);
  }

  return {
    passed: violations.length === 0,
    policy,
    actual: {
      criticalCount: verdict.criticalCount,
      highCount: verdict.highCount,
      score: verdict.overallScore,
      verdict: verdict.overallVerdict,
    },
    violations,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCiGate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const maxCritIdx = argv.indexOf("--max-critical");
  const maxHighIdx = argv.indexOf("--max-high");
  const minScoreIdx = argv.indexOf("--min-score");
  const reqVerdictIdx = argv.indexOf("--required-verdict");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const maxCritical = maxCritIdx >= 0 ? parseInt(argv[maxCritIdx + 1], 10) : 0;
  const maxHigh = maxHighIdx >= 0 ? parseInt(argv[maxHighIdx + 1], 10) : 3;
  const minScore = minScoreIdx >= 0 ? parseInt(argv[minScoreIdx + 1], 10) : 60;
  const requiredVerdict = reqVerdictIdx >= 0 ? (argv[reqVerdictIdx + 1] as Verdict) : ("warning" as Verdict);
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ci-gate — CI gate integration

Usage:
  judges review-ci-gate --file <verdict.json> [--max-critical <n>]
                        [--max-high <n>] [--min-score <n>]
                        [--required-verdict pass|warning|fail]
                        [--format table|json]

Options:
  --file <path>              Path to verdict JSON file (required)
  --max-critical <n>         Maximum critical findings allowed (default: 0)
  --max-high <n>             Maximum high findings allowed (default: 3)
  --min-score <n>            Minimum passing score (default: 60)
  --required-verdict <v>     Required verdict level (default: warning)
  --format <fmt>             Output format: table (default), json
  --help, -h                 Show this help
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

  const policy: GatePolicy = { maxCritical, maxHigh, minScore, requiredVerdict };
  const result = evaluateGate(verdict, policy);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`\nCI Gate: ${result.passed ? "PASSED ✓" : "FAILED ✗"}`);
  console.log("═".repeat(55));
  console.log(`  Score:    ${result.actual.score} (min: ${policy.minScore})`);
  console.log(`  Verdict:  ${result.actual.verdict} (required: ${policy.requiredVerdict})`);
  console.log(`  Critical: ${result.actual.criticalCount} (max: ${policy.maxCritical})`);
  console.log(`  High:     ${result.actual.highCount} (max: ${policy.maxHigh})`);

  if (result.violations.length > 0) {
    console.log(`\n  Violations:`);
    for (const v of result.violations) {
      console.log(`    - ${v}`);
    }
  }
  console.log("═".repeat(55));

  if (!result.passed) {
    process.exitCode = 1;
  }
}
