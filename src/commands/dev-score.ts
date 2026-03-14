/**
 * Developer growth score — track individual developer improvement
 * based on finding patterns over time.
 *
 * Stored locally in .judges-scores/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoreEntry {
  date: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  resolvedCount: number;
  commitCount: number;
}

interface WeaknessArea {
  rulePrefix: string;
  category: string;
  count: number;
  trend: "improving" | "stable" | "worsening";
}

export interface DevScore {
  author: string;
  currentScore: number; // 0-100
  history: ScoreEntry[];
  weaknesses: WeaknessArea[];
  streak: number; // consecutive clean scans
  totalFindings: number;
  totalResolved: number;
  avgFindingsPerCommit: number;
  trend: "improving" | "stable" | "declining";
  lastUpdated: string;
}

const SCORES_DIR = ".judges-scores";

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(SCORES_DIR)) mkdirSync(SCORES_DIR, { recursive: true });
}

function sanitizeFilename(author: string): string {
  return author.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

function loadScore(author: string): DevScore {
  ensureDir();
  const file = join(SCORES_DIR, `${sanitizeFilename(author)}.json`);
  if (!existsSync(file)) {
    return {
      author,
      currentScore: 100,
      history: [],
      weaknesses: [],
      streak: 0,
      totalFindings: 0,
      totalResolved: 0,
      avgFindingsPerCommit: 0,
      trend: "stable",
      lastUpdated: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveScore(score: DevScore): void {
  ensureDir();
  const file = join(SCORES_DIR, `${sanitizeFilename(score.author)}.json`);
  writeFileSync(file, JSON.stringify(score, null, 2));
}

function computeScore(history: ScoreEntry[]): number {
  if (history.length === 0) return 100;

  // Score based on recent finding rate and resolution rate
  const recent = history.slice(-10);
  const avgFindings = recent.reduce((s, e) => s + e.findingsCount, 0) / recent.length;
  const avgResolved = recent.reduce((s, e) => s + e.resolvedCount, 0) / recent.length;
  const avgCritical = recent.reduce((s, e) => s + e.criticalCount, 0) / recent.length;

  let score = 100;
  score -= avgFindings * 3; // penalty per finding
  score -= avgCritical * 10; // extra penalty for critical
  score += avgResolved * 2; // bonus for resolving
  score = Math.max(0, Math.min(100, Math.round(score)));

  return score;
}

function computeTrend(history: ScoreEntry[]): DevScore["trend"] {
  if (history.length < 5) return "stable";
  const recent = history.slice(-5);
  const older = history.slice(-10, -5);
  if (older.length < 3) return "stable";

  const recentAvg = recent.reduce((s, e) => s + e.findingsCount, 0) / recent.length;
  const olderAvg = older.reduce((s, e) => s + e.findingsCount, 0) / older.length;

  if (recentAvg < olderAvg * 0.8) return "improving";
  if (recentAvg > olderAvg * 1.2) return "declining";
  return "stable";
}

export function recordScan(
  author: string,
  findingsCount: number,
  criticalCount: number,
  highCount: number,
  resolvedCount: number,
  commitCount: number,
): DevScore {
  const score = loadScore(author);

  score.history.push({
    date: new Date().toISOString().split("T")[0],
    findingsCount,
    criticalCount,
    highCount,
    resolvedCount,
    commitCount,
  });

  score.totalFindings += findingsCount;
  score.totalResolved += resolvedCount;
  score.streak = findingsCount === 0 ? score.streak + 1 : 0;
  score.currentScore = computeScore(score.history);
  score.trend = computeTrend(score.history);

  const totalCommits = score.history.reduce((s, e) => s + e.commitCount, 0);
  score.avgFindingsPerCommit = totalCommits > 0 ? Math.round((score.totalFindings / totalCommits) * 100) / 100 : 0;

  score.lastUpdated = new Date().toISOString();
  saveScore(score);
  return score;
}

export function getScore(author: string): DevScore {
  return loadScore(author);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDevScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges dev-score — Developer growth and improvement tracking

Usage:
  judges dev-score --author "jane@company.com"
  judges dev-score --record "jane@company.com" --findings 3 --critical 0 --high 1 --resolved 5 --commits 12
  judges dev-score --leaderboard
  judges dev-score --author "jane@company.com" --history

Options:
  --author <email>       Developer email/identifier
  --record <email>       Record a scan for a developer
    --findings <n>       Number of findings
    --critical <n>       Critical findings
    --high <n>           High findings
    --resolved <n>       Resolved findings
    --commits <n>        Commits in period
  --leaderboard          Show team leaderboard
  --history              Show score history for author
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Record scan
  const recordAuthor = argv.find((_a: string, i: number) => argv[i - 1] === "--record");
  if (recordAuthor) {
    const getNum = (flag: string): number => {
      const val = argv.find((_a: string, i: number) => argv[i - 1] === flag);
      return val ? parseInt(val, 10) : 0;
    };

    const score = recordScan(
      recordAuthor,
      getNum("--findings"),
      getNum("--critical"),
      getNum("--high"),
      getNum("--resolved"),
      getNum("--commits"),
    );

    if (format === "json") {
      console.log(JSON.stringify(score, null, 2));
    } else {
      const icon = score.trend === "improving" ? "📈" : score.trend === "declining" ? "📉" : "➡️";
      console.log(`  ✅ Scan recorded for ${recordAuthor}`);
      console.log(`     Score: ${score.currentScore}/100 ${icon} Streak: ${score.streak} clean scans`);
    }
    return;
  }

  // Show author score
  const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
  if (author) {
    const score = getScore(author);

    if (argv.includes("--history")) {
      if (format === "json") {
        console.log(JSON.stringify(score.history, null, 2));
      } else if (score.history.length === 0) {
        console.log(`\n  No history for ${author}.\n`);
      } else {
        console.log(`\n  Score History — ${author}\n  ────────────────────────`);
        for (const h of score.history.slice(-20)) {
          console.log(
            `    ${h.date}  findings: ${h.findingsCount} (C:${h.criticalCount} H:${h.highCount}) resolved: ${h.resolvedCount}`,
          );
        }
        console.log("");
      }
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(score, null, 2));
    } else {
      const icon = score.trend === "improving" ? "📈" : score.trend === "declining" ? "📉" : "➡️";
      console.log(`\n  Developer Score — ${author}`);
      console.log(`  ──────────────────────────`);
      console.log(`  Score:             ${score.currentScore}/100 ${icon}`);
      console.log(`  Trend:             ${score.trend}`);
      console.log(`  Clean scan streak: ${score.streak}`);
      console.log(`  Total findings:    ${score.totalFindings}`);
      console.log(`  Total resolved:    ${score.totalResolved}`);
      console.log(`  Findings/commit:   ${score.avgFindingsPerCommit}`);
      console.log(`  Scans recorded:    ${score.history.length}\n`);
    }
    return;
  }

  // Leaderboard
  if (argv.includes("--leaderboard")) {
    ensureDir();
    const { readdirSync: rds } = require("fs");
    const files: string[] = rds(SCORES_DIR).filter((f: string) => f.endsWith(".json"));
    const scores: DevScore[] = files.map((f: string) => JSON.parse(readFileSync(join(SCORES_DIR, f), "utf-8")));
    scores.sort((a: DevScore, b: DevScore) => b.currentScore - a.currentScore);

    if (format === "json") {
      console.log(
        JSON.stringify(
          scores.map((s: DevScore) => ({ author: s.author, score: s.currentScore, trend: s.trend })),
          null,
          2,
        ),
      );
    } else if (scores.length === 0) {
      console.log("\n  No scores recorded. Use --record to start tracking.\n");
    } else {
      console.log(`\n  Leaderboard (${scores.length} developers)\n  ─────────────`);
      scores.forEach((s: DevScore, i: number) => {
        const icon = s.trend === "improving" ? "📈" : s.trend === "declining" ? "📉" : "➡️";
        console.log(
          `    ${String(i + 1).padStart(2)}. ${s.author.padEnd(25)} ${String(s.currentScore).padStart(3)}/100 ${icon} streak: ${s.streak}`,
        );
      });
      console.log("");
    }
    return;
  }

  console.log("  Use --author <email> to view a score, or --record to log a scan. --help for usage.");
}
