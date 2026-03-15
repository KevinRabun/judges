import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-code-health-score ───────────────────────────────────────
   Compute an aggregated code health score from review verdicts,
   combining finding severity, density, confidence, and pass rates
   into a single actionable metric.
   ─────────────────────────────────────────────────────────────────── */

interface HealthScore {
  overall: number;
  grade: string;
  breakdown: {
    severityScore: number;
    densityScore: number;
    confidenceScore: number;
    passRateScore: number;
  };
  recommendations: string[];
}

function computeHealthScore(verdict: TribunalVerdict): HealthScore {
  const findings = verdict.findings ?? [];
  const total = findings.length;

  const severityWeights: Record<string, number> = {
    critical: 10,
    high: 7,
    medium: 4,
    low: 2,
    info: 0.5,
  };

  let severitySum = 0;
  let confidenceSum = 0;
  for (const f of findings) {
    severitySum += severityWeights[f.severity] ?? 1;
    confidenceSum += f.confidence ?? 0.5;
  }

  const maxSeverity = total * 10;
  const severityScore = maxSeverity > 0 ? Math.max(0, 100 - (severitySum / maxSeverity) * 100) : 100;

  const densityScore = total === 0 ? 100 : Math.max(0, 100 - total * 5);

  const avgConfidence = total > 0 ? confidenceSum / total : 1;
  const confidenceScore = avgConfidence * 100;

  const passRateScore = verdict.overallVerdict === "pass" ? 100 : verdict.overallVerdict === "warning" ? 60 : 20;

  const overall = Math.round(severityScore * 0.35 + densityScore * 0.25 + confidenceScore * 0.2 + passRateScore * 0.2);

  let grade: string;
  if (overall >= 90) grade = "A";
  else if (overall >= 80) grade = "B";
  else if (overall >= 70) grade = "C";
  else if (overall >= 60) grade = "D";
  else grade = "F";

  const recommendations: string[] = [];
  if (severityScore < 50) recommendations.push("Address critical/high severity findings urgently");
  if (densityScore < 50) recommendations.push("High finding density — consider breaking into smaller changes");
  if (confidenceScore < 60) recommendations.push("Low confidence findings — manual validation recommended");
  if (passRateScore < 50) recommendations.push("Review failing — resolve blockers before merge");
  if (overall >= 90) recommendations.push("Excellent code health — safe to proceed");

  return {
    overall,
    grade,
    breakdown: {
      severityScore: Math.round(severityScore),
      densityScore: Math.round(densityScore),
      confidenceScore: Math.round(confidenceScore),
      passRateScore: Math.round(passRateScore),
    },
    recommendations,
  };
}

export function runReviewCodeHealthScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-code-health-score [options]

Compute aggregated code health score from review verdicts.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
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
    console.log("Run a review first or provide --report.");
    return;
  }

  const verdict = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const health = computeHealthScore(verdict);

  if (format === "json") {
    console.log(JSON.stringify(health, null, 2));
    return;
  }

  console.log("\n=== Code Health Score ===\n");
  console.log(`Overall: ${health.overall}/100 (Grade: ${health.grade})\n`);
  console.log("Breakdown:");
  console.log(`  Severity:   ${health.breakdown.severityScore}/100`);
  console.log(`  Density:    ${health.breakdown.densityScore}/100`);
  console.log(`  Confidence: ${health.breakdown.confidenceScore}/100`);
  console.log(`  Pass Rate:  ${health.breakdown.passRateScore}/100`);
  console.log("\nRecommendations:");
  for (const r of health.recommendations) {
    console.log(`  → ${r}`);
  }
}
