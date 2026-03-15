import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-merge-readiness ─────────────────────────────────────────
   Evaluate whether a review is merge-ready based on configurable
   criteria: finding counts, score thresholds, verdict status.
   ─────────────────────────────────────────────────────────────────── */

interface ReadinessCriteria {
  requirePassVerdict: boolean;
  maxCritical: number;
  maxHigh: number;
  minScore: number;
}

interface ReadinessResult {
  ready: boolean;
  verdict: string;
  score: number;
  criticalCount: number;
  highCount: number;
  checks: { check: string; passed: boolean; detail: string }[];
}

function evaluateReadiness(data: TribunalVerdict, criteria: ReadinessCriteria): ReadinessResult {
  const checks: { check: string; passed: boolean; detail: string }[] = [];

  if (criteria.requirePassVerdict) {
    const passed = data.overallVerdict === "pass";
    checks.push({
      check: "Verdict is pass",
      passed,
      detail: `Verdict: ${data.overallVerdict}`,
    });
  }

  const critOk = data.criticalCount <= criteria.maxCritical;
  checks.push({
    check: `Critical findings ≤ ${criteria.maxCritical}`,
    passed: critOk,
    detail: `Found: ${data.criticalCount}`,
  });

  const highOk = data.highCount <= criteria.maxHigh;
  checks.push({
    check: `High findings ≤ ${criteria.maxHigh}`,
    passed: highOk,
    detail: `Found: ${data.highCount}`,
  });

  const scoreOk = data.overallScore >= criteria.minScore;
  checks.push({
    check: `Score ≥ ${criteria.minScore}`,
    passed: scoreOk,
    detail: `Score: ${data.overallScore}`,
  });

  const ready = checks.every((c) => c.passed);

  return {
    ready,
    verdict: data.overallVerdict,
    score: data.overallScore,
    criticalCount: data.criticalCount,
    highCount: data.highCount,
    checks,
  };
}

export function runReviewMergeReadiness(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-merge-readiness [options]

Evaluate merge readiness of a review.

Options:
  --report <path>      Path to verdict JSON file
  --criteria <path>    Path to merge criteria JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const critIdx = argv.indexOf("--criteria");
  const critPath =
    critIdx !== -1 && argv[critIdx + 1]
      ? join(process.cwd(), argv[critIdx + 1])
      : join(process.cwd(), ".judges", "merge-criteria.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  let criteria: ReadinessCriteria;
  if (existsSync(critPath)) {
    criteria = JSON.parse(readFileSync(critPath, "utf-8")) as ReadinessCriteria;
  } else {
    criteria = { requirePassVerdict: true, maxCritical: 0, maxHigh: 2, minScore: 70 };
  }

  const result = evaluateReadiness(data, criteria);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const status = result.ready ? "READY TO MERGE" : "NOT READY";
  console.log(`\n=== Merge Readiness: ${status} ===\n`);
  console.log(`Verdict: ${result.verdict} | Score: ${result.score}`);
  console.log(`Critical: ${result.criticalCount} | High: ${result.highCount}\n`);

  for (const c of result.checks) {
    const icon = c.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${c.check} — ${c.detail}`);
  }
  console.log();
}
