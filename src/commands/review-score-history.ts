/**
 * Review-score-history — Track review scores over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoreEntry {
  date: string;
  score: number;
  findingCount: number;
  source: string;
}

interface ScoreStore {
  version: string;
  entries: ScoreEntry[];
}

interface ScoreTrend {
  direction: "improving" | "declining" | "stable";
  avgScore: number;
  minScore: number;
  maxScore: number;
  recentAvg: number;
  totalEntries: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SCORE_FILE = join(".judges", "score-history.json");

function loadStore(): ScoreStore {
  if (!existsSync(SCORE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(SCORE_FILE, "utf-8")) as ScoreStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: ScoreStore): void {
  mkdirSync(dirname(SCORE_FILE), { recursive: true });
  writeFileSync(SCORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Trend Calculation ──────────────────────────────────────────────────────

function calculateTrend(entries: ScoreEntry[]): ScoreTrend {
  if (entries.length === 0) {
    return { direction: "stable", avgScore: 0, minScore: 0, maxScore: 0, recentAvg: 0, totalEntries: 0 };
  }

  const scores = entries.map((e) => e.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const recentCount = Math.min(5, entries.length);
  const recentScores = entries.slice(-recentCount).map((e) => e.score);
  const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

  let direction: "improving" | "declining" | "stable" = "stable";
  if (entries.length >= 3) {
    const oldAvg =
      entries.slice(0, Math.floor(entries.length / 2)).reduce((s, e) => s + e.score, 0) /
      Math.floor(entries.length / 2);
    const newAvg =
      entries.slice(Math.floor(entries.length / 2)).reduce((s, e) => s + e.score, 0) /
      (entries.length - Math.floor(entries.length / 2));
    if (newAvg - oldAvg > 0.5) direction = "improving";
    else if (oldAvg - newAvg > 0.5) direction = "declining";
  }

  return { direction, avgScore, minScore, maxScore, recentAvg, totalEntries: entries.length };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewScoreHistory(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-score-history — Track review scores over time

Usage:
  judges review-score-history                         Show score trend
  judges review-score-history add --score 8.5 --source "sprint-42"
  judges review-score-history list
  judges review-score-history clear

Subcommands:
  (default)             Show score trend analysis
  add                   Add a score entry
  list                  List all entries
  clear                 Clear score history

Options:
  --score <n>           Review score
  --source <text>       Source description
  --findings <n>        Number of findings
  --format json         JSON output
  --help, -h            Show this help

Score history stored in .judges/score-history.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const source = argv.find((_a: string, i: number) => argv[i - 1] === "--source") || "";
    const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);

    store.entries.push({ date: new Date().toISOString(), score, findingCount: findings, source });
    saveStore(store);
    console.log(`Added score ${score.toFixed(1)} to history.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Score history cleared.");
    return;
  }

  if (subcommand === "list") {
    if (store.entries.length === 0) {
      console.log("No score entries.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(store.entries, null, 2));
      return;
    }
    console.log("\nScore History:");
    console.log("─".repeat(60));
    for (const e of store.entries) {
      console.log(`  ${e.date.slice(0, 10)}  score=${e.score.toFixed(1)}  findings=${e.findingCount}  ${e.source}`);
    }
    console.log("─".repeat(60));
    return;
  }

  // Default: show trend
  if (store.entries.length === 0) {
    console.log("No score data. Use 'judges review-score-history add' to start tracking.");
    return;
  }

  const trend = calculateTrend(store.entries);

  if (format === "json") {
    console.log(JSON.stringify(trend, null, 2));
    return;
  }

  const directionIcon = trend.direction === "improving" ? "↗" : trend.direction === "declining" ? "↘" : "→";

  console.log("\nScore Trend Analysis:");
  console.log("═".repeat(50));
  console.log(`  Direction: ${trend.direction} ${directionIcon}`);
  console.log(`  Avg Score: ${trend.avgScore.toFixed(1)}  Recent Avg: ${trend.recentAvg.toFixed(1)}`);
  console.log(`  Min: ${trend.minScore.toFixed(1)}  Max: ${trend.maxScore.toFixed(1)}`);
  console.log(`  Total entries: ${trend.totalEntries}`);
  console.log("═".repeat(50));

  // Simple sparkline
  const last10 = store.entries.slice(-10);
  if (last10.length > 1) {
    console.log("\n  Recent scores:");
    for (const e of last10) {
      const bar = "█".repeat(Math.round(e.score));
      console.log(`  ${e.date.slice(0, 10)} ${bar} ${e.score.toFixed(1)}`);
    }
  }
}
