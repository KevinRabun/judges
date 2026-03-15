/**
 * Finding-trend-forecast — Forecast finding trends from historical data.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HistoryEntry {
  period: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  passRate: number;
}

interface Forecast {
  nextPeriod: string;
  predictedFindings: number;
  predictedCritical: number;
  predictedHigh: number;
  trend: "improving" | "stable" | "declining";
  confidence: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTrendForecast(argv: string[]): void {
  const historyIdx = argv.indexOf("--history");
  const periodsIdx = argv.indexOf("--periods");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const forecastPeriods = periodsIdx >= 0 ? parseInt(argv[periodsIdx + 1], 10) : 1;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-trend-forecast — Forecast finding trends

Usage:
  judges finding-trend-forecast --history <path> [--periods <n>]
                                [--format table|json]

Options:
  --history <path>  History file with periodic data
  --periods <n>     Number of periods to forecast (default: 1)
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help

History file format (JSON array):
  [{"period":"2026-W10","totalFindings":50,"criticalCount":2,"highCount":8,"passRate":85}, ...]
`);
    return;
  }

  if (historyIdx < 0) {
    console.error("Missing --history <path>");
    process.exitCode = 1;
    return;
  }

  const historyPath = argv[historyIdx + 1];
  if (!existsSync(historyPath)) {
    console.error(`History file not found: ${historyPath}`);
    process.exitCode = 1;
    return;
  }

  const entries = JSON.parse(readFileSync(historyPath, "utf-8")) as HistoryEntry[];

  if (entries.length < 2) {
    console.log("Need at least 2 historical data points for forecasting.");
    return;
  }

  // Simple linear regression on totalFindings
  const forecasts: Forecast[] = [];
  const n = entries.length;

  for (let p = 0; p < forecastPeriods; p++) {
    const xValues = entries.map((_, i) => i);
    const yTotal = entries.map((e) => e.totalFindings);
    const yCritical = entries.map((e) => e.criticalCount);
    const yHigh = entries.map((e) => e.highCount);

    const slopeTotal = linearSlope(xValues, yTotal);
    const slopeCritical = linearSlope(xValues, yCritical);
    const slopeHigh = linearSlope(xValues, yHigh);

    const predictedFindings = Math.max(0, Math.round(yTotal[n - 1] + slopeTotal * (p + 1)));
    const predictedCritical = Math.max(0, Math.round(yCritical[n - 1] + slopeCritical * (p + 1)));
    const predictedHigh = Math.max(0, Math.round(yHigh[n - 1] + slopeHigh * (p + 1)));

    let trend: "improving" | "stable" | "declining";
    if (slopeTotal < -1) trend = "improving";
    else if (slopeTotal > 1) trend = "declining";
    else trend = "stable";

    const confidence = Math.max(0.3, Math.min(0.95, 1 - p * 0.15));

    forecasts.push({
      nextPeriod: `${entries[n - 1].period}+${p + 1}`,
      predictedFindings,
      predictedCritical,
      predictedHigh,
      trend,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  if (format === "json") {
    console.log(JSON.stringify(forecasts, null, 2));
    return;
  }

  console.log(`\nFinding Trend Forecast`);
  console.log("═".repeat(70));

  // Historical
  console.log("  Historical:");
  for (const e of entries) {
    console.log(
      `    ${e.period.padEnd(15)} ${String(e.totalFindings).padEnd(8)} findings (${e.criticalCount} critical, ${e.highCount} high)`,
    );
  }

  console.log("\n  Forecast:");
  for (const f of forecasts) {
    console.log(
      `    ${f.nextPeriod.padEnd(15)} ${String(f.predictedFindings).padEnd(8)} findings (${f.predictedCritical} critical, ${f.predictedHigh} high)`,
    );
    console.log(`${"".padEnd(20)} Trend: ${f.trend}, Confidence: ${f.confidence}`);
  }

  console.log("═".repeat(70));
}

function linearSlope(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}
