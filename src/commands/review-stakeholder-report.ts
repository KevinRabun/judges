/**
 * Review-stakeholder-report — Generate stakeholder-facing summaries of review outcomes.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewStakeholderReport(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const reportPath = reportIdx >= 0 ? argv[reportIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const audience = argv.includes("--executive") ? "executive" : "technical";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-stakeholder-report — Generate stakeholder summaries

Usage:
  judges review-stakeholder-report --report <path> [--executive] [--format table|json]

Options:
  --report <path>   Path to tribunal verdict JSON
  --executive       Executive-level summary (fewer details)
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (!reportPath || !existsSync(reportPath)) {
    console.error("Provide --report <path> to a valid verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  const verdict = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  const severityCounts: Record<string, number> = {};
  for (const f of verdict.findings) {
    severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
  }

  const summary = {
    verdict: verdict.overallVerdict,
    score: verdict.overallScore,
    totalFindings: verdict.findings.length,
    critical: verdict.criticalCount,
    high: verdict.highCount,
    severityBreakdown: severityCounts,
    judgesRun: verdict.evaluations.length,
    summary: verdict.summary,
    timestamp: verdict.timestamp,
  };

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\nStakeholder Report");
  console.log("═".repeat(60));

  if (audience === "executive") {
    const statusLabel =
      verdict.overallVerdict === "pass" ? "PASS" : verdict.overallVerdict === "fail" ? "FAIL" : "WARNING";
    console.log(`  Status:    ${statusLabel}`);
    console.log(`  Score:     ${verdict.overallScore}/100`);
    console.log(`  Critical:  ${verdict.criticalCount}`);
    console.log(`  High:      ${verdict.highCount}`);
    console.log(`  Total:     ${verdict.findings.length} findings`);
    console.log(`\n  ${verdict.summary}`);
  } else {
    console.log(`  Verdict:   ${verdict.overallVerdict}`);
    console.log(`  Score:     ${verdict.overallScore}/100`);
    console.log(`  Judges:    ${verdict.evaluations.length}`);
    console.log(`  Findings:  ${verdict.findings.length}`);
    console.log(`\n  Severity Breakdown:`);
    for (const [sev, count] of Object.entries(severityCounts)) {
      console.log(`    ${sev.padEnd(12)} ${count}`);
    }
    console.log(`\n  Summary: ${verdict.summary}`);
  }

  console.log("═".repeat(60));
}
