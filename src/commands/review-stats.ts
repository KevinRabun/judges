/**
 * Review-stats — Personal review statistics and improvement trends (local).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewRecord {
  timestamp: string;
  filesReviewed: number;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  score: number;
  verdict: string;
}

interface ReviewStats {
  totalReviews: number;
  totalFilesReviewed: number;
  totalFindings: number;
  averageScore: number;
  averageFindings: number;
  improvementTrend: number;
  bestScore: number;
  worstScore: number;
  mostCommonVerdict: string;
  records: ReviewRecord[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STATS_FILE = join(".judges", "stats", "review-stats.json");

function loadRecords(): ReviewRecord[] {
  if (!existsSync(STATS_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(STATS_FILE, "utf-8"));
    return (data.records || []) as ReviewRecord[];
  } catch {
    return [];
  }
}

function saveRecords(records: ReviewRecord[]): void {
  mkdirSync(dirname(STATS_FILE), { recursive: true });
  writeFileSync(STATS_FILE, JSON.stringify({ version: "1.0.0", records }, null, 2), "utf-8");
}

// ─── Statistics calculation ─────────────────────────────────────────────────

function calculateStats(records: ReviewRecord[]): ReviewStats {
  if (records.length === 0) {
    return {
      totalReviews: 0,
      totalFilesReviewed: 0,
      totalFindings: 0,
      averageScore: 0,
      averageFindings: 0,
      improvementTrend: 0,
      bestScore: 0,
      worstScore: 0,
      mostCommonVerdict: "none",
      records: [],
    };
  }

  const totalFindings = records.reduce((s, r) => s + r.totalFindings, 0);
  const totalFiles = records.reduce((s, r) => s + r.filesReviewed, 0);
  const scores = records.map((r) => r.score);
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  const avgFindings = totalFindings / records.length;

  // Improvement trend: compare last 5 vs previous 5
  let trend = 0;
  if (records.length >= 10) {
    const recent = records.slice(-5);
    const previous = records.slice(-10, -5);
    const recentAvg = recent.reduce((s, r) => s + r.score, 0) / 5;
    const previousAvg = previous.reduce((s, r) => s + r.score, 0) / 5;
    trend = recentAvg - previousAvg;
  } else if (records.length >= 4) {
    const half = Math.floor(records.length / 2);
    const recent = records.slice(half);
    const previous = records.slice(0, half);
    const recentAvg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
    const previousAvg = previous.reduce((s, r) => s + r.score, 0) / previous.length;
    trend = recentAvg - previousAvg;
  }

  // Most common verdict
  const verdictCounts = new Map<string, number>();
  for (const r of records) {
    verdictCounts.set(r.verdict, (verdictCounts.get(r.verdict) || 0) + 1);
  }
  const mostCommon = [...verdictCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "none";

  return {
    totalReviews: records.length,
    totalFilesReviewed: totalFiles,
    totalFindings: totalFindings,
    averageScore: Math.round(avgScore * 10) / 10,
    averageFindings: Math.round(avgFindings * 10) / 10,
    improvementTrend: Math.round(trend * 10) / 10,
    bestScore: Math.max(...scores),
    worstScore: Math.min(...scores),
    mostCommonVerdict: mostCommon,
    records,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewStats(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-stats — Personal review statistics

Usage:
  judges review-stats                       Show statistics
  judges review-stats record --score 85 --findings 3 --files 5
  judges review-stats reset                 Clear all records
  judges review-stats --format json         JSON output

Subcommands:
  show                 Display statistics (default)
  record               Record a review result
  reset                Clear all records

Options:
  --score <n>          Score to record (0-100)
  --findings <n>       Number of findings
  --files <n>          Number of files reviewed
  --verdict <v>        Verdict: pass, fail, warning
  --critical <n>       Critical findings count
  --high <n>           High findings count
  --medium <n>         Medium findings count
  --low <n>            Low findings count
  --last <n>           Show only last N records
  --format json        JSON output
  --help, -h           Show this help

Statistics are stored locally in .judges/stats/.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "reset"].includes(a)) || "show";

  if (subcommand === "reset") {
    saveRecords([]);
    console.log("Review statistics reset.");
    return;
  }

  if (subcommand === "record") {
    const scoreStr = argv.find((_a: string, i: number) => argv[i - 1] === "--score");
    const findingsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--findings");
    const filesStr = argv.find((_a: string, i: number) => argv[i - 1] === "--files");
    const verdict = argv.find((_a: string, i: number) => argv[i - 1] === "--verdict") || "pass";
    const criticalStr = argv.find((_a: string, i: number) => argv[i - 1] === "--critical");
    const highStr = argv.find((_a: string, i: number) => argv[i - 1] === "--high");
    const mediumStr = argv.find((_a: string, i: number) => argv[i - 1] === "--medium");
    const lowStr = argv.find((_a: string, i: number) => argv[i - 1] === "--low");

    const record: ReviewRecord = {
      timestamp: new Date().toISOString(),
      filesReviewed: parseInt(filesStr || "1", 10),
      totalFindings: parseInt(findingsStr || "0", 10),
      critical: parseInt(criticalStr || "0", 10),
      high: parseInt(highStr || "0", 10),
      medium: parseInt(mediumStr || "0", 10),
      low: parseInt(lowStr || "0", 10),
      score: parseInt(scoreStr || "100", 10),
      verdict,
    };

    const records = loadRecords();
    records.push(record);
    saveRecords(records);
    console.log(`Recorded review #${records.length} (score: ${record.score}, findings: ${record.totalFindings}).`);
    return;
  }

  // Show stats
  const records = loadRecords();
  const lastN = argv.find((_a: string, i: number) => argv[i - 1] === "--last");
  const displayRecords = lastN ? records.slice(-parseInt(lastN, 10)) : records;
  const stats = calculateStats(displayRecords);

  if (format === "json") {
    console.log(JSON.stringify({ ...stats, records: undefined }, null, 2));
    return;
  }

  console.log(`\n  Review Statistics\n  ─────────────────────────────`);
  console.log(`    Total reviews: ${stats.totalReviews}`);
  console.log(`    Total files reviewed: ${stats.totalFilesReviewed}`);
  console.log(`    Total findings: ${stats.totalFindings}`);
  console.log(`    Average score: ${stats.averageScore}/100`);
  console.log(`    Average findings: ${stats.averageFindings}`);
  console.log(`    Best score: ${stats.bestScore}`);
  console.log(`    Worst score: ${stats.worstScore}`);
  console.log(`    Most common verdict: ${stats.mostCommonVerdict}`);

  const trendIcon = stats.improvementTrend > 0 ? "📈" : stats.improvementTrend < 0 ? "📉" : "➡️";
  console.log(`    Improvement trend: ${trendIcon} ${stats.improvementTrend > 0 ? "+" : ""}${stats.improvementTrend}`);

  if (displayRecords.length > 0) {
    console.log(`\n    Recent Reviews (last ${Math.min(5, displayRecords.length)}):`);
    for (const r of displayRecords.slice(-5)) {
      const icon = r.verdict === "pass" ? "✅" : r.verdict === "fail" ? "❌" : "⚠️";
      console.log(`      ${icon} ${r.timestamp.slice(0, 10)} — score: ${r.score}, findings: ${r.totalFindings}`);
    }
  }

  console.log();
}
