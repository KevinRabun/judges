/**
 * Finding-impact-rank — Rank findings by estimated business impact.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, Severity } from "../types.js";

// ─── Impact model ───────────────────────────────────────────────────────────

const SEVERITY_IMPACT: Record<Severity, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
  info: 5,
};

interface RankedFinding {
  rank: number;
  ruleId: string;
  severity: string;
  title: string;
  impactScore: number;
  recommendation: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingImpactRank(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const topIdx = argv.indexOf("--top");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const topN = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-impact-rank — Rank findings by business impact

Usage:
  judges finding-impact-rank --report <path> [--top <n>] [--format table|json]

Options:
  --report <path>  Report file with findings
  --top <n>        Show only top N findings by impact
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (reportIdx < 0) {
    console.error("Missing --report <path>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = report.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to rank.");
    return;
  }

  const ranked: RankedFinding[] = findings.map((f) => {
    const baseImpact = SEVERITY_IMPACT[f.severity] ?? 5;
    const conf = f.confidence ?? 0.5;
    const impactScore = Math.round(baseImpact * conf);

    return {
      rank: 0,
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      impactScore,
      recommendation: f.recommendation,
    };
  });

  ranked.sort((a, b) => b.impactScore - a.impactScore);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  const display = topN > 0 ? ranked.slice(0, topN) : ranked;

  if (format === "json") {
    console.log(JSON.stringify(display, null, 2));
    return;
  }

  console.log(`\nFinding Impact Ranking`);
  console.log("═".repeat(75));
  console.log(`  ${"#".padEnd(5)} ${"Impact".padEnd(8)} ${"Severity".padEnd(10)} ${"Rule".padEnd(25)} Title`);
  console.log("  " + "─".repeat(70));

  for (const r of display) {
    console.log(
      `  ${String(r.rank).padEnd(5)} ${String(r.impactScore).padEnd(8)} ${r.severity.padEnd(10)} ${r.ruleId.padEnd(25)} ${r.title}`,
    );
  }

  const totalImpact = ranked.reduce((sum, r) => sum + r.impactScore, 0);
  const avgImpact = Math.round(totalImpact / ranked.length);
  console.log(`\n  Total impact: ${totalImpact} | Average: ${avgImpact} | Findings: ${ranked.length}`);
  console.log("═".repeat(75));
}
