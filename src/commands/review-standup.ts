/**
 * Review-standup — Generate daily standup-ready summaries of review activity.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StandupSummary {
  date: string;
  reviewsRun: number;
  avgScore: number;
  totalFindings: number;
  criticalFindings: number;
  topIssues: string[];
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadRecentActivity(): StandupSummary {
  const date = todayStr();
  const summary: StandupSummary = {
    date,
    reviewsRun: 0,
    avgScore: 0,
    totalFindings: 0,
    criticalFindings: 0,
    topIssues: [],
    status: "No activity recorded today",
  };

  // Check streak data for recent activity
  const streakFile = join(".judges", "review-streak.json");
  if (existsSync(streakFile)) {
    try {
      const streakData = JSON.parse(readFileSync(streakFile, "utf-8")) as {
        entries: Array<{ date: string; passed: boolean; score: number }>;
        totalReviews: number;
      };
      const todayEntries = streakData.entries.filter((e) => e.date === date);
      if (todayEntries.length > 0) {
        summary.reviewsRun = todayEntries.length;
        summary.avgScore = todayEntries.reduce((s, e) => s + e.score, 0) / todayEntries.length;
        summary.status = todayEntries.every((e) => e.passed) ? "All reviews passing" : "Some reviews failing";
      }
    } catch {
      /* ignore */
    }
  }

  // Check quota data
  const quotaFile = join(".judges", "review-quota.json");
  if (existsSync(quotaFile)) {
    try {
      const quotaData = JSON.parse(readFileSync(quotaFile, "utf-8")) as {
        used: number;
        limit: number;
      };
      if (quotaData.limit > 0) {
        summary.status += ` | Quota: ${quotaData.used}/${quotaData.limit}`;
      }
    } catch {
      /* ignore */
    }
  }

  return summary;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewStandup(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-standup — Daily standup-ready review summary

Usage:
  judges review-standup                            Today's summary
  judges review-standup --date 2025-01-15          Summary for specific date
  judges review-standup --week                     Weekly summary

Options:
  --date <YYYY-MM-DD>   Summary for specific date
  --week                Show weekly summary
  --format json         JSON output
  --help, -h            Show this help

Generates concise daily/weekly review summaries for standups and reports.
Reads from local .judges/ data files.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const summary = loadRecentActivity();

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\nReview Standup Summary");
  console.log("─".repeat(50));
  console.log(`  Date:              ${summary.date}`);
  console.log(`  Reviews run:       ${summary.reviewsRun}`);
  console.log(`  Average score:     ${summary.avgScore > 0 ? summary.avgScore.toFixed(1) : "N/A"}`);
  console.log(`  Total findings:    ${summary.totalFindings}`);
  console.log(`  Critical findings: ${summary.criticalFindings}`);
  console.log(`  Status:            ${summary.status}`);
  if (summary.topIssues.length > 0) {
    console.log(`  Top issues:`);
    for (const issue of summary.topIssues) {
      console.log(`    - ${issue}`);
    }
  }
  console.log("─".repeat(50));
}
