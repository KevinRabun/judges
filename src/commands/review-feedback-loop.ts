/**
 * Review-feedback-loop — Track review feedback and improvement over time.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedbackEntry {
  timestamp: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  verdict: string;
}

interface FeedbackLog {
  version: number;
  entries: FeedbackEntry[];
}

interface FeedbackAnalysis {
  total: number;
  trend: "improving" | "declining" | "stable";
  avgScore: number;
  recentAvgScore: number;
  scoreDelta: number;
  avgFindings: number;
  recentAvgFindings: number;
  findingDelta: number;
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function loadLog(path: string): FeedbackLog {
  if (!existsSync(path)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

function analyze(log: FeedbackLog): FeedbackAnalysis {
  const total = log.entries.length;
  if (total === 0) {
    return {
      total: 0,
      trend: "stable",
      avgScore: 0,
      recentAvgScore: 0,
      scoreDelta: 0,
      avgFindings: 0,
      recentAvgFindings: 0,
      findingDelta: 0,
    };
  }

  const scores = log.entries.map((e) => e.score);
  const findings = log.entries.map((e) => e.findingCount);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / total);
  const avgFindings = Math.round(findings.reduce((a, b) => a + b, 0) / total);

  const recentCount = Math.min(5, total);
  const recentScores = scores.slice(-recentCount);
  const recentFindings = findings.slice(-recentCount);
  const recentAvgScore = Math.round(recentScores.reduce((a, b) => a + b, 0) / recentCount);
  const recentAvgFindings = Math.round(recentFindings.reduce((a, b) => a + b, 0) / recentCount);

  const scoreDelta = recentAvgScore - avgScore;
  const findingDelta = recentAvgFindings - avgFindings;

  let trend: FeedbackAnalysis["trend"] = "stable";
  if (scoreDelta > 5) trend = "improving";
  else if (scoreDelta < -5) trend = "declining";

  return { total, trend, avgScore, recentAvgScore, scoreDelta, avgFindings, recentAvgFindings, findingDelta };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFeedbackLoop(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const logIdx = argv.indexOf("--log");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const logPath = logIdx >= 0 ? argv[logIdx + 1] : ".judges-feedback.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-feedback-loop — Track review feedback over time

Usage:
  judges review-feedback-loop [--file <verdict.json>] [--log <path>]
                              [--format table|json]

Options:
  --file <path>      Add verdict to feedback log
  --log <path>       Feedback log file (default: .judges-feedback.json)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const log = loadLog(logPath);

  // Add mode
  if (filePath) {
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

    log.entries.push({
      timestamp: new Date().toISOString(),
      score: verdict.overallScore,
      findingCount: verdict.findings.length,
      criticalCount: verdict.criticalCount,
      verdict: verdict.overallVerdict,
    });

    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`Added entry to feedback log (${log.entries.length} total)`);
    return;
  }

  // Analyze mode
  const result = analyze(log);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nFeedback Loop Analysis (${result.total} entries)`);
  console.log("═".repeat(50));
  console.log(`  Trend:            ${result.trend}`);
  console.log(
    `  Avg Score:        ${result.avgScore} (recent: ${result.recentAvgScore}, Δ${result.scoreDelta >= 0 ? "+" : ""}${result.scoreDelta})`,
  );
  console.log(
    `  Avg Findings:     ${result.avgFindings} (recent: ${result.recentAvgFindings}, Δ${result.findingDelta >= 0 ? "+" : ""}${result.findingDelta})`,
  );
  console.log("═".repeat(50));
}
