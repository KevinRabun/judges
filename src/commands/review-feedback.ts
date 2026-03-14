/**
 * Review-feedback — Collect user feedback on review quality.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedbackEntry {
  id: string;
  date: string;
  rating: number;
  comment: string;
  findingId: string;
  helpful: boolean;
}

interface FeedbackStore {
  version: string;
  entries: FeedbackEntry[];
}

interface FeedbackSummary {
  totalEntries: number;
  avgRating: number;
  helpfulPct: number;
  recentAvgRating: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const FEEDBACK_FILE = join(".judges", "feedback.json");

function loadStore(): FeedbackStore {
  if (!existsSync(FEEDBACK_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(FEEDBACK_FILE, "utf-8")) as FeedbackStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: FeedbackStore): void {
  mkdirSync(dirname(FEEDBACK_FILE), { recursive: true });
  writeFileSync(FEEDBACK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Summary ────────────────────────────────────────────────────────────────

function summarize(entries: FeedbackEntry[]): FeedbackSummary {
  if (entries.length === 0) {
    return { totalEntries: 0, avgRating: 0, helpfulPct: 0, recentAvgRating: 0 };
  }

  const ratings = entries.map((e) => e.rating);
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const helpfulCount = entries.filter((e) => e.helpful).length;
  const helpfulPct = (helpfulCount / entries.length) * 100;

  const recentCount = Math.min(10, entries.length);
  const recentRatings = entries.slice(-recentCount).map((e) => e.rating);
  const recentAvgRating = recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length;

  return { totalEntries: entries.length, avgRating, helpfulPct, recentAvgRating };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFeedback(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-feedback — Collect user feedback on review quality

Usage:
  judges review-feedback                              Show feedback summary
  judges review-feedback add --rating 4 --comment "useful"
  judges review-feedback list
  judges review-feedback remove --id <id>
  judges review-feedback clear

Subcommands:
  (default)             Show feedback summary
  add                   Add feedback entry
  list                  List all feedback
  remove                Remove feedback by ID
  clear                 Clear all feedback

Options:
  --rating <1-5>        Rating (1=poor, 5=excellent)
  --comment <text>      Feedback comment
  --finding <id>        Related finding ID
  --helpful             Mark finding as helpful (flag)
  --format json         JSON output
  --help, -h            Show this help

Feedback stored locally in .judges/feedback.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const rating = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--rating") || "3", 10);
    const comment = argv.find((_a: string, i: number) => argv[i - 1] === "--comment") || "";
    const findingId = argv.find((_a: string, i: number) => argv[i - 1] === "--finding") || "";
    const helpful = argv.includes("--helpful");

    const clampedRating = Math.max(1, Math.min(5, rating));
    const entry: FeedbackEntry = {
      id: generateId(),
      date: new Date().toISOString(),
      rating: clampedRating,
      comment,
      findingId,
      helpful,
    };

    store.entries.push(entry);
    saveStore(store);
    console.log(`Feedback recorded (${entry.id}): rating=${clampedRating}/5`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== id);
    saveStore(store);
    console.log(before > store.entries.length ? `Removed feedback ${id}.` : `Feedback ${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Feedback cleared.");
    return;
  }

  if (subcommand === "list") {
    if (store.entries.length === 0) {
      console.log("No feedback entries.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(store.entries, null, 2));
      return;
    }
    console.log("\nFeedback Entries:");
    console.log("─".repeat(60));
    for (const e of store.entries) {
      const stars = "★".repeat(e.rating) + "☆".repeat(5 - e.rating);
      const helpfulTag = e.helpful ? " [helpful]" : "";
      console.log(`  ${e.id}  ${e.date.slice(0, 10)}  ${stars}${helpfulTag}`);
      if (e.comment) console.log(`    "${e.comment}"`);
    }
    console.log("─".repeat(60));
    return;
  }

  // Default: show summary
  if (store.entries.length === 0) {
    console.log("No feedback collected. Use 'judges review-feedback add' to start.");
    return;
  }

  const summary = summarize(store.entries);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const stars = "★".repeat(Math.round(summary.avgRating)) + "☆".repeat(5 - Math.round(summary.avgRating));

  console.log("\nFeedback Summary:");
  console.log("═".repeat(50));
  console.log(`  Total feedback: ${summary.totalEntries}`);
  console.log(`  Avg rating:     ${summary.avgRating.toFixed(1)}/5 ${stars}`);
  console.log(`  Recent avg:     ${summary.recentAvgRating.toFixed(1)}/5`);
  console.log(`  Helpful:        ${summary.helpfulPct.toFixed(0)}%`);
  console.log("═".repeat(50));
}
