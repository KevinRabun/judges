import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-engagement-score ────────────────────────────────────────
   Score team engagement with code reviews by analyzing review
   frequency, finding resolution rates, and score improvements.
   All metrics computed from local history files.
   ─────────────────────────────────────────────────────────────────── */

interface EngagementMetrics {
  reviewFrequency: number;
  avgScore: number;
  scoreImprovement: number;
  findingResolutionRate: number;
  consistencyScore: number;
  overallEngagement: number;
  grade: string;
}

function computeEngagement(historyDir: string): EngagementMetrics {
  const defaults: EngagementMetrics = {
    reviewFrequency: 0,
    avgScore: 0,
    scoreImprovement: 0,
    findingResolutionRate: 0,
    consistencyScore: 0,
    overallEngagement: 0,
    grade: "F",
  };

  if (!existsSync(historyDir)) return defaults;

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return defaults;

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict);
    } catch {
      // Skip
    }
  }

  if (verdicts.length === 0) return defaults;

  // Review frequency: reviews per time span (normalized to per-week)
  const reviewFrequency = Math.min(verdicts.length, 100);

  // Average score
  const scores = verdicts.map((v) => v.overallScore ?? 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Score improvement (first half vs second half)
  const mid = Math.floor(scores.length / 2) || 1;
  const firstHalf = scores.slice(0, mid);
  const secondHalf = scores.slice(mid);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const scoreImprovement = Math.round(secondAvg - firstAvg);

  // Finding resolution: decreasing finding counts over time
  const findingCounts = verdicts.map((v) => (v.findings ?? []).length);
  const firstFindings = findingCounts.slice(0, mid);
  const secondFindings = findingCounts.slice(mid);
  const firstFindingAvg = firstFindings.reduce((a, b) => a + b, 0) / firstFindings.length;
  const secondFindingAvg = secondFindings.reduce((a, b) => a + b, 0) / secondFindings.length;
  const resolutionRate =
    firstFindingAvg > 0 ? Math.round(((firstFindingAvg - secondFindingAvg) / firstFindingAvg) * 100) : 0;

  // Consistency: standard deviation of scores (lower is more consistent)
  const mean = avgScore;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = Math.max(0, Math.round(100 - stdDev * 2));

  // Overall engagement: weighted composite
  const freqPoints = Math.min(reviewFrequency * 2, 25);
  const scorePoints = Math.min(Math.round(avgScore / 4), 25);
  const improvementPoints = Math.min(Math.max(scoreImprovement + 10, 0), 25);
  const consistPoints = Math.min(Math.round(consistencyScore / 4), 25);
  const overall = freqPoints + scorePoints + improvementPoints + consistPoints;

  let grade: string;
  if (overall >= 85) grade = "A";
  else if (overall >= 70) grade = "B";
  else if (overall >= 55) grade = "C";
  else if (overall >= 40) grade = "D";
  else grade = "F";

  return {
    reviewFrequency,
    avgScore,
    scoreImprovement,
    findingResolutionRate: Math.max(resolutionRate, 0),
    consistencyScore,
    overallEngagement: overall,
    grade,
  };
}

export function runReviewEngagementScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-engagement-score [options]

Score team engagement with code reviews.

Options:
  --history <path>     Path to review history directory
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  const metrics = computeEngagement(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(`\n=== Engagement Score: ${metrics.overallEngagement}/100 (Grade: ${metrics.grade}) ===\n`);
  console.log(`  Review Frequency:      ${metrics.reviewFrequency} reviews`);
  console.log(`  Average Score:         ${metrics.avgScore}/100`);
  console.log(`  Score Improvement:     ${metrics.scoreImprovement >= 0 ? "+" : ""}${metrics.scoreImprovement} points`);
  console.log(`  Finding Resolution:    ${metrics.findingResolutionRate}%`);
  console.log(`  Consistency:           ${metrics.consistencyScore}/100`);
}
