/**
 * Review-team-dashboard — Team-level review dashboard with aggregated metrics.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamMetrics {
  totalReviews: number;
  totalFindings: number;
  avgScore: number;
  passRate: number;
  topIssues: Array<{ ruleId: string; count: number }>;
  severityTrend: Record<string, number>;
  reviewsPerDay: Record<string, number>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTeamDashboard(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-team-dashboard — Team review dashboard

Usage:
  judges review-team-dashboard [--dir <path>] [--format table|json]

Options:
  --dir <path>     Directory with review JSON files (default: cwd)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!existsSync(dirPath)) {
    console.error(`Error: directory not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter(
    (f) => typeof f === "string" && f.endsWith(".json"),
  );

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    try {
      const v = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
      if (v.overallVerdict !== undefined && v.findings !== undefined) {
        verdicts.push(v);
      }
    } catch {
      // skip
    }
  }

  if (verdicts.length === 0) {
    console.log("No review files found. Generate reviews first.");
    return;
  }

  const ruleCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  const dateCounts: Record<string, number> = {};
  let scoreSum = 0;
  let passCount = 0;

  for (const v of verdicts) {
    scoreSum += v.overallScore;
    if (v.overallVerdict === "pass") passCount++;

    const date = v.timestamp ? v.timestamp.split("T")[0] : "unknown";
    dateCounts[date] = (dateCounts[date] ?? 0) + 1;

    for (const f of v.findings) {
      ruleCounts[f.ruleId] = (ruleCounts[f.ruleId] ?? 0) + 1;
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    }
  }

  const metrics: TeamMetrics = {
    totalReviews: verdicts.length,
    totalFindings: verdicts.reduce((s, v) => s + v.findings.length, 0),
    avgScore: Math.round((scoreSum / verdicts.length) * 100) / 100,
    passRate: Math.round((passCount / verdicts.length) * 100),
    topIssues: Object.entries(ruleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ruleId, count]) => ({ ruleId, count })),
    severityTrend: severityCounts,
    reviewsPerDay: dateCounts,
  };

  if (format === "json") {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(`\nTeam Review Dashboard`);
  console.log("═".repeat(55));
  console.log(`  Reviews:      ${metrics.totalReviews}`);
  console.log(`  Findings:     ${metrics.totalFindings}`);
  console.log(`  Avg Score:    ${metrics.avgScore}`);
  console.log(`  Pass Rate:    ${metrics.passRate}%`);

  console.log(`\n  Severity Distribution:`);
  for (const [sev, count] of Object.entries(metrics.severityTrend)) {
    const bar = "█".repeat(Math.min(count, 30));
    console.log(`    ${sev.padEnd(10)} ${String(count).padStart(4)} ${bar}`);
  }

  if (metrics.topIssues.length > 0) {
    console.log(`\n  Top Issues:`);
    for (const issue of metrics.topIssues) {
      console.log(`    ${issue.ruleId.padEnd(25)} ${issue.count}`);
    }
  }

  console.log("═".repeat(55));
}
