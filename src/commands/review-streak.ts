/**
 * Review-streak — Track consecutive clean review streaks to encourage habitual use.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StreakEntry {
  date: string;
  passed: boolean;
  score: number;
  criticalCount: number;
}

interface StreakStore {
  version: string;
  currentStreak: number;
  longestStreak: number;
  totalReviews: number;
  totalPassed: number;
  entries: StreakEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STREAK_FILE = join(".judges", "review-streak.json");

function loadStore(): StreakStore {
  if (!existsSync(STREAK_FILE))
    return { version: "1.0.0", currentStreak: 0, longestStreak: 0, totalReviews: 0, totalPassed: 0, entries: [] };
  try {
    return JSON.parse(readFileSync(STREAK_FILE, "utf-8")) as StreakStore;
  } catch {
    return { version: "1.0.0", currentStreak: 0, longestStreak: 0, totalReviews: 0, totalPassed: 0, entries: [] };
  }
}

function saveStore(store: StreakStore): void {
  mkdirSync(dirname(STREAK_FILE), { recursive: true });
  writeFileSync(STREAK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function recalcStreak(entries: StreakEntry[]): { current: number; longest: number } {
  let longest = 0;
  let streak = 0;
  for (const e of entries) {
    if (e.passed) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 0;
    }
  }
  return { current: streak, longest };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewStreak(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-streak — Track consecutive clean review streaks

Usage:
  judges review-streak show                       Show current streak
  judges review-streak record --score 8.5         Record a review result
  judges review-streak record --pass              Record a passing review
  judges review-streak record --fail              Record a failing review
  judges review-streak reset                      Reset streak data
  judges review-streak history                    Show full history

Options:
  --score <n>           Review score (pass if >= 7.0)
  --pass                Record as passing
  --fail                Record as failing
  --threshold <n>       Custom pass threshold (default: 7.0)
  --format json         JSON output
  --help, -h            Show this help

Tracks daily review streaks to encourage consistent code review habits.
Data stored locally in .judges/review-streak.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "reset", "history"].includes(a)) || "show";
  const store = loadStore();

  if (subcommand === "record") {
    const threshold = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--threshold") || "7.0");
    const scoreArg = argv.find((_a: string, i: number) => argv[i - 1] === "--score");
    const score = scoreArg ? parseFloat(scoreArg) : 0;
    let passed = score >= threshold;
    if (argv.includes("--pass")) passed = true;
    if (argv.includes("--fail")) passed = false;

    const today = todayStr();
    const existing = store.entries.findIndex((e) => e.date === today);
    const entry: StreakEntry = { date: today, passed, score, criticalCount: 0 };
    if (existing >= 0) {
      store.entries[existing] = entry;
    } else {
      store.entries.push(entry);
    }
    store.entries.sort((a, b) => a.date.localeCompare(b.date));

    store.totalReviews++;
    if (passed) store.totalPassed++;
    const { current, longest } = recalcStreak(store.entries);
    store.currentStreak = current;
    store.longestStreak = longest;
    saveStore(store);
    console.log(`Recorded ${passed ? "PASS" : "FAIL"} for ${today}. Current streak: ${current} day(s).`);
    return;
  }

  if (subcommand === "reset") {
    saveStore({ version: "1.0.0", currentStreak: 0, longestStreak: 0, totalReviews: 0, totalPassed: 0, entries: [] });
    console.log("Streak data reset.");
    return;
  }

  if (subcommand === "history") {
    if (store.entries.length === 0) {
      console.log("No review history recorded yet.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(store.entries, null, 2));
      return;
    }
    console.log("\nReview History:");
    console.log("─".repeat(50));
    for (const e of store.entries) {
      const status = e.passed ? "PASS" : "FAIL";
      console.log(`  ${e.date}  ${status}  score=${e.score.toFixed(1)}`);
    }
    console.log("─".repeat(50));
    return;
  }

  // show
  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          currentStreak: store.currentStreak,
          longestStreak: store.longestStreak,
          totalReviews: store.totalReviews,
          totalPassed: store.totalPassed,
          passRate: store.totalReviews > 0 ? ((store.totalPassed / store.totalReviews) * 100).toFixed(1) + "%" : "N/A",
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\n🔥 Review Streak Dashboard");
  console.log("─".repeat(40));
  console.log(`  Current streak:  ${store.currentStreak} day(s)`);
  console.log(`  Longest streak:  ${store.longestStreak} day(s)`);
  console.log(`  Total reviews:   ${store.totalReviews}`);
  console.log(
    `  Pass rate:       ${store.totalReviews > 0 ? ((store.totalPassed / store.totalReviews) * 100).toFixed(1) + "%" : "N/A"}`,
  );
  console.log("─".repeat(40));

  if (store.currentStreak >= 30) console.log("  Achievement: Platinum — 30+ day streak!");
  else if (store.currentStreak >= 14) console.log("  Achievement: Gold — 14+ day streak!");
  else if (store.currentStreak >= 7) console.log("  Achievement: Silver — 7+ day streak!");
  else if (store.currentStreak >= 3) console.log("  Achievement: Bronze — 3+ day streak!");
  console.log();
}
