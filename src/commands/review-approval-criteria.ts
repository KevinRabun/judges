import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-approval-criteria ───────────────────────────────────────
   Define and check approval criteria for reviews — configurable
   thresholds for score, severity counts, and pass rates that
   must be met before a change is approved.
   ─────────────────────────────────────────────────────────────────── */

interface ApprovalCriteria {
  minScore: number;
  maxCritical: number;
  maxHigh: number;
  requirePass: boolean;
}

interface ApprovalResult {
  approved: boolean;
  criteria: ApprovalCriteria;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
}

function checkApproval(verdict: TribunalVerdict, criteria: ApprovalCriteria): ApprovalResult {
  const checks: Array<{ check: string; passed: boolean; detail: string }> = [];

  const score = verdict.overallScore ?? 0;
  checks.push({
    check: "Minimum score",
    passed: score >= criteria.minScore,
    detail: `${score} >= ${criteria.minScore}`,
  });

  const criticalCount = verdict.criticalCount ?? 0;
  checks.push({
    check: "Critical findings limit",
    passed: criticalCount <= criteria.maxCritical,
    detail: `${criticalCount} <= ${criteria.maxCritical}`,
  });

  const highCount = verdict.highCount ?? 0;
  checks.push({
    check: "High findings limit",
    passed: highCount <= criteria.maxHigh,
    detail: `${highCount} <= ${criteria.maxHigh}`,
  });

  if (criteria.requirePass) {
    checks.push({
      check: "Overall verdict pass",
      passed: verdict.overallVerdict === "pass",
      detail: `verdict: ${verdict.overallVerdict}`,
    });
  }

  const approved = checks.every((c) => c.passed);
  return { approved, criteria, checks };
}

export function runReviewApprovalCriteria(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-approval-criteria [options]

Check review against approval criteria.

Options:
  --report <path>        Path to verdict JSON file
  --config <path>        Path to criteria config JSON
  --min-score <n>        Minimum score (default: 70)
  --max-critical <n>     Max critical findings (default: 0)
  --max-high <n>         Max high findings (default: 3)
  --require-pass         Require overall pass verdict
  --format <fmt>         Output format: table (default) or json
  -h, --help             Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  let criteria: ApprovalCriteria = {
    minScore: 70,
    maxCritical: 0,
    maxHigh: 3,
    requirePass: false,
  };

  const configIdx = argv.indexOf("--config");
  if (configIdx !== -1 && argv[configIdx + 1]) {
    const configPath = join(process.cwd(), argv[configIdx + 1]);
    if (existsSync(configPath)) {
      criteria = { ...criteria, ...JSON.parse(readFileSync(configPath, "utf-8")) };
    }
  }

  const minScoreIdx = argv.indexOf("--min-score");
  if (minScoreIdx !== -1 && argv[minScoreIdx + 1]) {
    criteria.minScore = parseInt(argv[minScoreIdx + 1], 10);
  }
  const maxCritIdx = argv.indexOf("--max-critical");
  if (maxCritIdx !== -1 && argv[maxCritIdx + 1]) {
    criteria.maxCritical = parseInt(argv[maxCritIdx + 1], 10);
  }
  const maxHighIdx = argv.indexOf("--max-high");
  if (maxHighIdx !== -1 && argv[maxHighIdx + 1]) {
    criteria.maxHigh = parseInt(argv[maxHighIdx + 1], 10);
  }
  if (argv.includes("--require-pass")) {
    criteria.requirePass = true;
  }

  const verdict = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const result = checkApproval(verdict, criteria);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n=== Approval Check: ${result.approved ? "APPROVED" : "BLOCKED"} ===\n`);
  for (const check of result.checks) {
    const icon = check.passed ? "✓" : "✗";
    console.log(`  ${icon} ${check.check}: ${check.detail}`);
  }
}
