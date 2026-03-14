/**
 * Per-judge reputation tracking — FP rates, confidence calibration,
 * historical accuracy metrics for each judge.
 *
 * Stored locally in .judges-reputation.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedbackEntry {
  findingId: string;
  verdict: "true-positive" | "false-positive";
  timestamp: string;
}

export interface JudgeReputation {
  judgeId: string;
  totalFindings: number;
  truePositives: number;
  falsePositives: number;
  fpRate: number;
  accuracy: number;
  avgConfidence: number;
  confidenceCalibration: number; // how well confidence predicts accuracy
  trend: "improving" | "stable" | "declining";
  lastUpdated: string;
  feedback: FeedbackEntry[];
}

interface ReputationDb {
  judges: JudgeReputation[];
}

const REPUTATION_FILE = ".judges-reputation.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(): ReputationDb {
  if (!existsSync(REPUTATION_FILE)) return { judges: [] };
  return JSON.parse(readFileSync(REPUTATION_FILE, "utf-8"));
}

function saveDb(db: ReputationDb): void {
  writeFileSync(REPUTATION_FILE, JSON.stringify(db, null, 2));
}

function computeTrend(feedback: FeedbackEntry[]): JudgeReputation["trend"] {
  if (feedback.length < 10) return "stable";

  const recent = feedback.slice(-10);
  const older = feedback.slice(-20, -10);
  if (older.length < 5) return "stable";

  const recentFpRate = recent.filter((f) => f.verdict === "false-positive").length / recent.length;
  const olderFpRate = older.filter((f) => f.verdict === "false-positive").length / older.length;

  if (recentFpRate < olderFpRate - 0.1) return "improving";
  if (recentFpRate > olderFpRate + 0.1) return "declining";
  return "stable";
}

export function recordFeedback(
  judgeId: string,
  findingId: string,
  verdict: "true-positive" | "false-positive",
  confidence?: number,
): JudgeReputation {
  const db = loadDb();
  let judge = db.judges.find((j) => j.judgeId === judgeId);

  if (!judge) {
    judge = {
      judgeId,
      totalFindings: 0,
      truePositives: 0,
      falsePositives: 0,
      fpRate: 0,
      accuracy: 1,
      avgConfidence: 0,
      confidenceCalibration: 0,
      trend: "stable",
      lastUpdated: new Date().toISOString(),
      feedback: [],
    };
    db.judges.push(judge);
  }

  judge.feedback.push({ findingId, verdict, timestamp: new Date().toISOString() });
  judge.totalFindings = judge.feedback.length;
  judge.truePositives = judge.feedback.filter((f) => f.verdict === "true-positive").length;
  judge.falsePositives = judge.feedback.filter((f) => f.verdict === "false-positive").length;
  judge.fpRate = Math.round((judge.falsePositives / judge.totalFindings) * 100) / 100;
  judge.accuracy = Math.round((judge.truePositives / judge.totalFindings) * 100) / 100;
  judge.trend = computeTrend(judge.feedback);
  judge.lastUpdated = new Date().toISOString();

  if (confidence !== undefined) {
    // Running average of confidence
    const prevTotal = judge.totalFindings - 1;
    judge.avgConfidence =
      Math.round(((judge.avgConfidence * prevTotal + confidence) / judge.totalFindings) * 100) / 100;
    // Calibration: |accuracy - avgConfidence| — lower is better
    judge.confidenceCalibration = Math.round(Math.abs(judge.accuracy - judge.avgConfidence) * 100) / 100;
  }

  saveDb(db);
  return judge;
}

export function getReputations(): JudgeReputation[] {
  return loadDb().judges;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runJudgeReputation(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges judge-reputation — Per-judge accuracy and FP tracking

Usage:
  judges judge-reputation --record <judgeId> --finding <id> --verdict tp
  judges judge-reputation --record <judgeId> --finding <id> --verdict fp --confidence 0.8
  judges judge-reputation --list
  judges judge-reputation --rank
  judges judge-reputation --judge <id>
  judges judge-reputation --flagged

Options:
  --record <judgeId>   Record feedback for a judge
  --finding <id>       Finding ID
  --verdict <v>        tp (true-positive) | fp (false-positive)
  --confidence <n>     Finding confidence (0.0–1.0)
  --list               List all judge reputations
  --rank               Rank judges by accuracy
  --judge <id>         Show details for a specific judge
  --flagged            Show judges with FP rate > 30%
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Record feedback
  const recordJudge = argv.find((_a: string, i: number) => argv[i - 1] === "--record");
  const findingId = argv.find((_a: string, i: number) => argv[i - 1] === "--finding");
  const verdictStr = argv.find((_a: string, i: number) => argv[i - 1] === "--verdict");
  const confStr = argv.find((_a: string, i: number) => argv[i - 1] === "--confidence");

  if (recordJudge && findingId && verdictStr) {
    const verdict = verdictStr === "fp" ? "false-positive" : "true-positive";
    const confidence = confStr ? parseFloat(confStr) : undefined;
    const rep = recordFeedback(recordJudge, findingId, verdict, confidence);
    if (format === "json") {
      console.log(JSON.stringify(rep, null, 2));
    } else {
      console.log(`  ✅ Recorded ${verdict} for ${recordJudge}`);
      console.log(
        `     Accuracy: ${(rep.accuracy * 100).toFixed(0)}%, FP rate: ${(rep.fpRate * 100).toFixed(0)}%, Trend: ${rep.trend}`,
      );
    }
    return;
  }

  const db = loadDb();

  // Show specific judge
  const judgeId = argv.find((_a: string, i: number) => argv[i - 1] === "--judge");
  if (judgeId) {
    const judge = db.judges.find((j) => j.judgeId === judgeId);
    if (!judge) {
      console.error(`  ❌ No reputation data for judge "${judgeId}"`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(judge, null, 2));
    } else {
      console.log(`\n  Judge: ${judge.judgeId}`);
      console.log(`  ──────────────────────`);
      console.log(`  Total findings:  ${judge.totalFindings}`);
      console.log(`  True positives:  ${judge.truePositives}`);
      console.log(`  False positives: ${judge.falsePositives}`);
      console.log(`  Accuracy:        ${(judge.accuracy * 100).toFixed(1)}%`);
      console.log(`  FP rate:         ${(judge.fpRate * 100).toFixed(1)}%`);
      console.log(`  Avg confidence:  ${(judge.avgConfidence * 100).toFixed(1)}%`);
      console.log(`  Calibration:     ${(judge.confidenceCalibration * 100).toFixed(1)}%`);
      console.log(`  Trend:           ${judge.trend}`);
      console.log(`  Last updated:    ${judge.lastUpdated}\n`);
    }
    return;
  }

  // Flagged judges (FP > 30%)
  if (argv.includes("--flagged")) {
    const flagged = db.judges.filter((j) => j.fpRate > 0.3 && j.totalFindings >= 5);
    if (format === "json") {
      console.log(JSON.stringify(flagged, null, 2));
    } else if (flagged.length === 0) {
      console.log("\n  No flagged judges (all under 30% FP rate).\n");
    } else {
      console.log(`\n  Flagged Judges — FP Rate > 30% (${flagged.length})\n  ──────────────────────────────────`);
      for (const j of flagged) {
        console.log(
          `    ⚠️  ${j.judgeId.padEnd(20)} FP: ${(j.fpRate * 100).toFixed(0)}% (${j.falsePositives}/${j.totalFindings}) ${j.trend}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Rank by accuracy
  if (argv.includes("--rank")) {
    const ranked = [...db.judges].sort((a, b) => b.accuracy - a.accuracy);
    if (format === "json") {
      console.log(JSON.stringify(ranked, null, 2));
    } else {
      console.log(`\n  Judge Rankings (${ranked.length})\n  ────────────────`);
      ranked.forEach((j, i) => {
        const icon = j.trend === "improving" ? "📈" : j.trend === "declining" ? "📉" : "➡️";
        console.log(
          `    ${String(i + 1).padStart(2)}. ${j.judgeId.padEnd(20)} accuracy: ${(j.accuracy * 100).toFixed(0)}% FP: ${(j.fpRate * 100).toFixed(0)}% ${icon}`,
        );
      });
      console.log("");
    }
    return;
  }

  // List all
  if (db.judges.length === 0) {
    console.log("\n  No reputation data. Use --record to log feedback.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(db.judges, null, 2));
  } else {
    console.log(`\n  Judge Reputations (${db.judges.length})\n  ───────────────────`);
    for (const j of db.judges) {
      const icon = j.trend === "improving" ? "📈" : j.trend === "declining" ? "📉" : "➡️";
      console.log(
        `    ${j.judgeId.padEnd(20)} acc: ${(j.accuracy * 100).toFixed(0)}% FP: ${(j.fpRate * 100).toFixed(0)}% (${j.totalFindings} total) ${icon}`,
      );
    }
    console.log("");
  }
}
