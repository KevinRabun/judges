/**
 * Review-metric-export — Export review metrics for external dashboards.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricRow {
  timestamp: string;
  file: string;
  verdict: string;
  score: number;
  criticalCount: number;
  highCount: number;
  totalFindings: number;
  judgeCount: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMetricExport(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const reportPath = reportIdx >= 0 ? argv[reportIdx + 1] : "";
  const outputIdx = argv.indexOf("--output");
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "json";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-metric-export — Export review metrics

Usage:
  judges review-metric-export --report <path> [--output <path>] [--format json|csv]

Options:
  --report <path>    Path to verdict JSON (or directory of verdicts)
  --output <path>    Output file (prints to stdout if omitted)
  --format <fmt>     Output format: json (default), csv
  --help, -h         Show this help
`);
    return;
  }

  if (!reportPath || !existsSync(reportPath)) {
    console.error("Provide --report <path> to a valid verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  const verdict = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  const row: MetricRow = {
    timestamp: verdict.timestamp,
    file: reportPath,
    verdict: verdict.overallVerdict,
    score: verdict.overallScore,
    criticalCount: verdict.criticalCount,
    highCount: verdict.highCount,
    totalFindings: verdict.findings.length,
    judgeCount: verdict.evaluations.length,
  };

  let output: string;

  if (format === "csv") {
    const header = Object.keys(row).join(",");
    const values = Object.values(row)
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
      .join(",");
    output = `${header}\n${values}\n`;
  } else {
    output = JSON.stringify(row, null, 2);
  }

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`Metrics exported to: ${outputPath}`);
  } else {
    console.log(output);
  }
}
