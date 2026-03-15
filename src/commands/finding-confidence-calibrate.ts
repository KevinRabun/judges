/**
 * Finding-confidence-calibrate — Calibrate finding confidence thresholds.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalibrationResult {
  totalFindings: number;
  distribution: Array<{ range: string; count: number; percentage: number }>;
  suggestedThreshold: number;
  belowThreshold: number;
  aboveThreshold: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingConfidenceCalibrate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const thresholdIdx = argv.indexOf("--threshold");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const threshold = thresholdIdx >= 0 ? parseFloat(argv[thresholdIdx + 1]) : 0.7;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-confidence-calibrate — Calibrate confidence thresholds

Usage:
  judges finding-confidence-calibrate --file <review.json>
                                      [--threshold <0.0-1.0>] [--output <file>]
                                      [--format table|json]

Options:
  --file <path>       Review result JSON file
  --threshold <n>     Confidence threshold (default: 0.7)
  --output <path>     Write calibration results to file
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const confidences = verdict.findings.filter((f) => f.confidence !== undefined).map((f) => f.confidence as number);

  if (confidences.length === 0) {
    console.log("No findings with confidence scores found.");
    return;
  }

  // Build distribution
  const ranges = [
    { range: "0.0-0.2", min: 0.0, max: 0.2, count: 0 },
    { range: "0.2-0.4", min: 0.2, max: 0.4, count: 0 },
    { range: "0.4-0.6", min: 0.4, max: 0.6, count: 0 },
    { range: "0.6-0.8", min: 0.6, max: 0.8, count: 0 },
    { range: "0.8-1.0", min: 0.8, max: 1.01, count: 0 },
  ];

  for (const c of confidences) {
    for (const r of ranges) {
      if (c >= r.min && c < r.max) {
        r.count++;
        break;
      }
    }
  }

  const below = confidences.filter((c) => c < threshold).length;
  const above = confidences.length - below;

  // Suggest threshold at median
  const sorted = [...confidences].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const suggestedThreshold = Math.round(median * 100) / 100;

  const result: CalibrationResult = {
    totalFindings: confidences.length,
    distribution: ranges.map((r) => ({
      range: r.range,
      count: r.count,
      percentage: Math.round((r.count / confidences.length) * 100),
    })),
    suggestedThreshold,
    belowThreshold: below,
    aboveThreshold: above,
  };

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Calibration results written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nConfidence Calibration`);
  console.log("═".repeat(55));
  console.log(`  Findings with confidence: ${result.totalFindings}`);
  console.log(`  Current threshold: ${threshold}`);
  console.log(`  Suggested threshold: ${result.suggestedThreshold}`);
  console.log(`  Below threshold: ${result.belowThreshold}  Above: ${result.aboveThreshold}`);

  console.log(`\n  Distribution:`);
  for (const d of result.distribution) {
    const bar = "█".repeat(Math.min(d.count, 30));
    console.log(`    ${d.range}  ${String(d.count).padStart(4)} (${String(d.percentage).padStart(3)}%)  ${bar}`);
  }

  console.log("═".repeat(55));
}
