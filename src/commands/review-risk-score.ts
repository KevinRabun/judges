/**
 * Review-risk-score — Calculate aggregate project risk score from recent reviews.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RiskBreakdown {
  category: string;
  score: number;
  weight: number;
  contribution: number;
  details: string;
}

interface RiskReport {
  overallRisk: number;
  riskLevel: string;
  breakdown: RiskBreakdown[];
  recommendations: string[];
}

// ─── Risk Calculation ───────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 1,
};

function calculateRisk(verdicts: TribunalVerdict[]): RiskReport {
  const breakdown: RiskBreakdown[] = [];
  const recommendations: string[] = [];

  // Finding severity score (weight: 40%)
  let severityScore = 0;
  let totalFindings = 0;
  for (const v of verdicts) {
    for (const f of v.findings || []) {
      totalFindings++;
      severityScore += SEVERITY_WEIGHTS[String(f.severity)] || 4;
    }
  }
  const normalizedSeverity = totalFindings > 0 ? Math.min(severityScore / totalFindings, 10) : 0;
  breakdown.push({
    category: "Finding Severity",
    score: normalizedSeverity,
    weight: 0.4,
    contribution: normalizedSeverity * 0.4,
    details: `${totalFindings} findings, avg severity weight: ${totalFindings > 0 ? (severityScore / totalFindings).toFixed(1) : "0"}`,
  });

  // Critical density (weight: 30%)
  let totalCriticals = 0;
  for (const v of verdicts) {
    totalCriticals += v.criticalCount || 0;
  }
  const criticalDensity = Math.min(totalCriticals * 2, 10);
  breakdown.push({
    category: "Critical Density",
    score: criticalDensity,
    weight: 0.3,
    contribution: criticalDensity * 0.3,
    details: `${totalCriticals} critical findings across ${verdicts.length} review(s)`,
  });
  if (totalCriticals > 0) {
    recommendations.push(`Address ${totalCriticals} critical finding(s) immediately`);
  }

  // Review score trend (weight: 20%)
  const scores = verdicts.map((v) => v.overallScore || 0).filter((s) => s > 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;
  const scoreRisk = Math.max(0, 10 - avgScore);
  breakdown.push({
    category: "Score Deficit",
    score: scoreRisk,
    weight: 0.2,
    contribution: scoreRisk * 0.2,
    details: `Average score: ${avgScore.toFixed(1)}/10`,
  });
  if (avgScore < 7) {
    recommendations.push("Improve review scores above 7.0 threshold");
  }

  // Finding volume (weight: 10%)
  const volumeRisk = Math.min(totalFindings / 5, 10);
  breakdown.push({
    category: "Finding Volume",
    score: volumeRisk,
    weight: 0.1,
    contribution: volumeRisk * 0.1,
    details: `${totalFindings} total findings`,
  });

  const overallRisk = breakdown.reduce((s, b) => s + b.contribution, 0);
  let riskLevel = "Low";
  if (overallRisk >= 7) riskLevel = "Critical";
  else if (overallRisk >= 5) riskLevel = "High";
  else if (overallRisk >= 3) riskLevel = "Medium";

  if (recommendations.length === 0) {
    recommendations.push("Risk levels are manageable — continue regular reviews");
  }

  return { overallRisk, riskLevel, breakdown, recommendations };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRiskScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-risk-score — Calculate aggregate project risk score

Usage:
  judges review-risk-score --file verdict.json     Score from single verdict
  judges review-risk-score --files v1.json,v2.json Score from multiple verdicts

Options:
  --file <path>         Single verdict JSON file
  --files <paths>       Comma-separated verdict files
  --format json         JSON output
  --help, -h            Show this help

Calculates a weighted risk score from review findings and scores.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const singleFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const multiFiles = argv.find((_a: string, i: number) => argv[i - 1] === "--files");

  const files: string[] = [];
  if (singleFile) files.push(singleFile);
  if (multiFiles) files.push(...multiFiles.split(",").map((f) => f.trim()));

  if (files.length === 0) {
    console.error("Error: --file or --files is required.");
    process.exitCode = 1;
    return;
  }

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`Warning: File not found: ${file}`);
      continue;
    }
    try {
      verdicts.push(JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict);
    } catch {
      console.error(`Warning: Failed to parse: ${file}`);
    }
  }

  if (verdicts.length === 0) {
    console.error("Error: No valid verdict files provided.");
    process.exitCode = 1;
    return;
  }

  const report = calculateRisk(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nProject Risk Assessment:");
  console.log("─".repeat(60));
  console.log(`  Overall Risk: ${report.overallRisk.toFixed(1)}/10  [${report.riskLevel}]`);
  console.log();
  console.log("  Breakdown:");
  for (const b of report.breakdown) {
    const bar = "█".repeat(Math.round(b.score));
    console.log(
      `    ${b.category.padEnd(18)} ${b.score.toFixed(1).padEnd(6)} (w=${(b.weight * 100).toFixed(0)}%)  ${bar}`,
    );
    console.log(`      ${b.details}`);
  }
  console.log();
  console.log("  Recommendations:");
  for (const r of report.recommendations) {
    console.log(`    - ${r}`);
  }
  console.log("─".repeat(60));
}
