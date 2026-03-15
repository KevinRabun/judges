/**
 * Review-quality-score — Compute a quality score from multiple dimensions.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualityDimension {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface QualityReport {
  overallQuality: number;
  grade: string;
  dimensions: QualityDimension[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function computeQuality(verdict: TribunalVerdict): QualityReport {
  const dimensions: QualityDimension[] = [];

  // Security dimension
  const secFindings = verdict.findings.filter((f) => {
    const combined = `${f.ruleId} ${f.title}`.toLowerCase();
    return (
      combined.includes("auth") ||
      combined.includes("inject") ||
      combined.includes("xss") ||
      combined.includes("crypt") ||
      combined.includes("vuln") ||
      combined.includes("secret")
    );
  });
  const secScore = secFindings.length === 0 ? 100 : Math.max(0, 100 - secFindings.length * 15);
  dimensions.push({
    name: "Security",
    score: secScore,
    weight: 3,
    detail: `${secFindings.length} security findings`,
  });

  // Reliability dimension
  const relScore = Math.max(0, 100 - verdict.criticalCount * 25 - verdict.highCount * 10);
  dimensions.push({
    name: "Reliability",
    score: relScore,
    weight: 2,
    detail: `${verdict.criticalCount} critical, ${verdict.highCount} high`,
  });

  // Maintainability dimension
  const totalFindings = verdict.findings.length;
  const maintScore = totalFindings === 0 ? 100 : Math.max(0, 100 - totalFindings * 3);
  dimensions.push({
    name: "Maintainability",
    score: maintScore,
    weight: 2,
    detail: `${totalFindings} total findings`,
  });

  // Judge coverage dimension
  const uniqueJudges = new Set(verdict.evaluations.map((e) => e.judgeId));
  const coverageScore = Math.min(100, uniqueJudges.size * 15);
  dimensions.push({
    name: "Coverage",
    score: coverageScore,
    weight: 1,
    detail: `${uniqueJudges.size} unique judges`,
  });

  // Verdict confidence dimension
  const avgEvalScore =
    verdict.evaluations.length > 0
      ? verdict.evaluations.reduce((s, e) => s + e.score, 0) / verdict.evaluations.length
      : 50;
  dimensions.push({
    name: "Confidence",
    score: Math.round(avgEvalScore),
    weight: 1,
    detail: `avg eval score: ${Math.round(avgEvalScore)}`,
  });

  // weighted average
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
  const overallQuality = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight);

  const grade =
    overallQuality >= 90
      ? "A"
      : overallQuality >= 80
        ? "B"
        : overallQuality >= 70
          ? "C"
          : overallQuality >= 60
            ? "D"
            : "F";

  return { overallQuality, grade, dimensions };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewQualityScore(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-quality-score — Compute multi-dimension quality score

Usage:
  judges review-quality-score --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const report = computeQuality(verdict);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nQuality Score: ${report.overallQuality}/100 (Grade: ${report.grade})`);
  console.log("═".repeat(60));
  console.log(`${"Dimension".padEnd(18)} ${"Score".padEnd(8)} ${"Weight".padEnd(8)} Detail`);
  console.log("─".repeat(60));

  for (const d of report.dimensions) {
    console.log(`${d.name.padEnd(18)} ${String(d.score).padEnd(8)} ×${String(d.weight).padEnd(7)} ${d.detail}`);
  }
  console.log("═".repeat(60));
}
