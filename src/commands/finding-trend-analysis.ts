/**
 * Finding-trend-analysis — Analyze finding trends across multiple reports.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendPoint {
  timestamp: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

interface TrendAnalysis {
  points: TrendPoint[];
  direction: "improving" | "degrading" | "stable";
  avgScoreChange: number;
  avgFindingsChange: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeTrends(verdicts: TrendPoint[]): TrendAnalysis {
  const sorted = [...verdicts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (sorted.length < 2) {
    return { points: sorted, direction: "stable", avgScoreChange: 0, avgFindingsChange: 0 };
  }

  const scoreChanges: number[] = [];
  const findingsChanges: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    scoreChanges.push(sorted[i].score - sorted[i - 1].score);
    findingsChanges.push(sorted[i].findingCount - sorted[i - 1].findingCount);
  }

  const avgScoreChange = scoreChanges.reduce((a, b) => a + b, 0) / scoreChanges.length;
  const avgFindingsChange = findingsChanges.reduce((a, b) => a + b, 0) / findingsChanges.length;

  let direction: TrendAnalysis["direction"] = "stable";
  if (avgScoreChange > 2) direction = "improving";
  else if (avgScoreChange < -2) direction = "degrading";

  return {
    points: sorted,
    direction,
    avgScoreChange: Math.round(avgScoreChange * 10) / 10,
    avgFindingsChange: Math.round(avgFindingsChange * 10) / 10,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTrendAnalysis(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-trend-analysis — Analyze finding trends

Usage:
  judges finding-trend-analysis --dir <verdicts-dir> [--format table|json]

Options:
  --dir <path>       Directory of verdict JSON files (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const points: TrendPoint[] = [];

  for (const file of files) {
    try {
      const v = JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")) as TribunalVerdict;
      points.push({
        timestamp: v.timestamp || file.replace(".json", ""),
        score: v.overallScore,
        findingCount: v.findings.length,
        criticalCount: v.criticalCount,
        highCount: v.highCount,
      });
    } catch {
      // skip
    }
  }

  const analysis = analyzeTrends(points);

  if (format === "json") {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const icon = analysis.direction === "improving" ? "UP" : analysis.direction === "degrading" ? "DOWN" : "FLAT";
  console.log(`\nFinding Trend Analysis — ${icon}`);
  console.log("═".repeat(70));
  console.log(
    `  Direction: ${analysis.direction}  |  Avg Score Δ: ${analysis.avgScoreChange}  |  Avg Findings Δ: ${analysis.avgFindingsChange}`,
  );
  console.log("─".repeat(70));
  console.log(`${"Timestamp".padEnd(24)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} ${"Critical".padEnd(10)} High`);
  console.log("─".repeat(70));

  for (const p of analysis.points) {
    const ts = p.timestamp.length > 22 ? p.timestamp.slice(0, 22) + "…" : p.timestamp;
    console.log(
      `${ts.padEnd(24)} ${String(p.score).padEnd(8)} ${String(p.findingCount).padEnd(10)} ${String(p.criticalCount).padEnd(10)} ${p.highCount}`,
    );
  }
  console.log("═".repeat(70));
}
