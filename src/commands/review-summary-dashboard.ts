/**
 * Review-summary-dashboard — Aggregate review dashboard with key metrics.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  totalReviews: number;
  totalFindings: number;
  verdictBreakdown: Record<string, number>;
  severityBreakdown: Record<string, number>;
  averageScore: number;
  topRules: Array<{ ruleId: string; count: number }>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSummaryDashboard(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const reviewDir = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-summary-dashboard — Aggregate review dashboard

Usage:
  judges review-summary-dashboard [--dir <path>] [--format table|json]

Options:
  --dir <path>     Directory with review JSON files (default: cwd)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!existsSync(reviewDir)) {
    console.error(`Error: directory not found: ${reviewDir}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(reviewDir) as unknown as string[]).filter(
    (f) => typeof f === "string" && f.endsWith(".json"),
  );

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    try {
      const v = JSON.parse(readFileSync(join(reviewDir, file), "utf-8")) as TribunalVerdict;
      if (v.overallVerdict !== undefined && v.findings !== undefined) {
        verdicts.push(v);
      }
    } catch {
      // skip non-review files
    }
  }

  if (verdicts.length === 0) {
    console.log("No review files found. Run reviews and save as JSON first.");
    return;
  }

  const dashboard: DashboardData = {
    totalReviews: verdicts.length,
    totalFindings: 0,
    verdictBreakdown: {},
    severityBreakdown: {},
    averageScore: 0,
    topRules: [],
  };

  let scoreSum = 0;
  const ruleCounts: Record<string, number> = {};

  for (const v of verdicts) {
    scoreSum += v.overallScore;
    dashboard.verdictBreakdown[v.overallVerdict] = (dashboard.verdictBreakdown[v.overallVerdict] ?? 0) + 1;

    for (const f of v.findings) {
      dashboard.totalFindings++;
      dashboard.severityBreakdown[f.severity] = (dashboard.severityBreakdown[f.severity] ?? 0) + 1;
      ruleCounts[f.ruleId] = (ruleCounts[f.ruleId] ?? 0) + 1;
    }
  }

  dashboard.averageScore = Math.round((scoreSum / verdicts.length) * 100) / 100;
  dashboard.topRules = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count }));

  if (format === "json") {
    console.log(JSON.stringify(dashboard, null, 2));
    return;
  }

  console.log(`\nReview Dashboard`);
  console.log("═".repeat(55));
  console.log(`  Reviews:    ${dashboard.totalReviews}`);
  console.log(`  Findings:   ${dashboard.totalFindings}`);
  console.log(`  Avg Score:  ${dashboard.averageScore}`);
  console.log(`\n  Verdict Breakdown:`);
  for (const [v, c] of Object.entries(dashboard.verdictBreakdown)) {
    console.log(`    ${v.padEnd(12)} ${c}`);
  }
  console.log(`\n  Severity Breakdown:`);
  for (const [s, c] of Object.entries(dashboard.severityBreakdown)) {
    console.log(`    ${s.padEnd(12)} ${c}`);
  }
  if (dashboard.topRules.length > 0) {
    console.log(`\n  Top Rules:`);
    for (const r of dashboard.topRules) {
      console.log(`    ${r.ruleId.padEnd(25)} ${r.count}`);
    }
  }
  console.log("═".repeat(55));
}
