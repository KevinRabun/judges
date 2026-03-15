/**
 * Review-dashboard-data — Generate dashboard-ready data from verdict reports.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  summary: {
    totalReports: number;
    avgScore: number;
    passRate: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
  };
  trends: Array<{ timestamp: string; score: number; findings: number }>;
  topRules: Array<{ ruleId: string; count: number; severity: string }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function generateDashboard(verdicts: Array<{ verdict: TribunalVerdict; timestamp: string }>): DashboardData {
  const totalReports = verdicts.length;
  let totalScore = 0;
  let passCount = 0;
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  const ruleCounts = new Map<string, { count: number; severity: string }>();

  const trends: DashboardData["trends"] = [];

  for (const v of verdicts) {
    totalScore += v.verdict.overallScore;
    if (v.verdict.overallVerdict === "pass") passCount++;
    totalFindings += v.verdict.findings.length;
    criticalCount += v.verdict.criticalCount;
    highCount += v.verdict.highCount;

    trends.push({
      timestamp: v.timestamp,
      score: v.verdict.overallScore,
      findings: v.verdict.findings.length,
    });

    for (const f of v.verdict.findings) {
      const existing = ruleCounts.get(f.ruleId);
      if (existing) {
        existing.count++;
      } else {
        ruleCounts.set(f.ruleId, {
          count: 1,
          severity: (f.severity || "medium").toLowerCase(),
        });
      }
    }
  }

  const topRules = [...ruleCounts.entries()]
    .map(([ruleId, data]) => ({ ruleId, count: data.count, severity: data.severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    summary: {
      totalReports,
      avgScore: totalReports > 0 ? Math.round(totalScore / totalReports) : 0,
      passRate: totalReports > 0 ? Math.round((passCount / totalReports) * 100) : 0,
      totalFindings,
      criticalCount,
      highCount,
    },
    trends: trends.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    topRules,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDashboardData(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const fileIdx = argv.indexOf("--file");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-dashboard-data — Generate dashboard data

Usage:
  judges review-dashboard-data --dir <verdicts-dir> [--output <file>]
                               [--format table|json]
  judges review-dashboard-data --file <verdict.json> [--format table|json]

Options:
  --dir <path>       Directory of verdict JSON files
  --file <path>      Single verdict JSON file
  --output <path>    Write dashboard data to file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const verdicts: Array<{ verdict: TribunalVerdict; timestamp: string }> = [];

  if (dirPath && existsSync(dirPath)) {
    const files = readdirSync(dirPath) as unknown as string[];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const v = JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")) as TribunalVerdict;
        verdicts.push({ verdict: v, timestamp: v.timestamp || file.replace(".json", "") });
      } catch {
        // skip
      }
    }
  } else if (filePath && existsSync(filePath)) {
    try {
      const v = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
      verdicts.push({ verdict: v, timestamp: v.timestamp || new Date().toISOString() });
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Error: --dir or --file required");
    process.exitCode = 1;
    return;
  }

  const dashboard = generateDashboard(verdicts);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(dashboard, null, 2));
    console.log(`Dashboard data written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(dashboard, null, 2));
    return;
  }

  console.log(`\nDashboard Summary`);
  console.log("═".repeat(50));
  console.log(`  Reports:   ${dashboard.summary.totalReports}`);
  console.log(`  Avg Score: ${dashboard.summary.avgScore}`);
  console.log(`  Pass Rate: ${dashboard.summary.passRate}%`);
  console.log(`  Findings:  ${dashboard.summary.totalFindings}`);
  console.log(`  Critical:  ${dashboard.summary.criticalCount}`);
  console.log(`  High:      ${dashboard.summary.highCount}`);

  if (dashboard.topRules.length > 0) {
    console.log(`\n  Top Rules:`);
    console.log("  " + "─".repeat(45));
    for (const r of dashboard.topRules.slice(0, 10)) {
      console.log(`    ${r.ruleId.padEnd(20)} ×${String(r.count).padEnd(5)} [${r.severity}]`);
    }
  }
  console.log("═".repeat(50));
}
