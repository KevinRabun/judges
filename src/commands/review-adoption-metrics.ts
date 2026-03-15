/**
 * Review-adoption-metrics — Track Judges adoption metrics across a team/org.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdoptionData {
  period: string;
  reviewsRun: number;
  uniqueUsers: number;
  findingsFixed: number;
  avgScore: number;
  passRate: number;
}

interface AdoptionStore {
  entries: AdoptionData[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAdoptionMetrics(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const addIdx = argv.indexOf("--add");
  const reviewsIdx = argv.indexOf("--reviews");
  const usersIdx = argv.indexOf("--users");
  const fixedIdx = argv.indexOf("--fixed");
  const scoreIdx = argv.indexOf("--score");
  const passIdx = argv.indexOf("--pass-rate");
  const formatIdx = argv.indexOf("--format");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-adoption.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-adoption-metrics — Track adoption metrics

Usage:
  judges review-adoption-metrics [--store <path>] [--add <period>]
                                 [--reviews <n>] [--users <n>] [--fixed <n>]
                                 [--score <n>] [--pass-rate <n>]
                                 [--format table|json]

Options:
  --store <path>     Metrics store file (default: .judges-adoption.json)
  --add <period>     Add entry for period (e.g., 2026-W12, 2026-03)
  --reviews <n>      Number of reviews run
  --users <n>        Number of unique users
  --fixed <n>        Number of findings fixed
  --score <n>        Average review score
  --pass-rate <n>    Pass rate percentage
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  let store: AdoptionStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as AdoptionStore;
  } else {
    store = { entries: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add new entry
  if (addIdx >= 0) {
    const period = argv[addIdx + 1];
    const entry: AdoptionData = {
      period,
      reviewsRun: reviewsIdx >= 0 ? parseInt(argv[reviewsIdx + 1], 10) : 0,
      uniqueUsers: usersIdx >= 0 ? parseInt(argv[usersIdx + 1], 10) : 0,
      findingsFixed: fixedIdx >= 0 ? parseInt(argv[fixedIdx + 1], 10) : 0,
      avgScore: scoreIdx >= 0 ? parseFloat(argv[scoreIdx + 1]) : 0,
      passRate: passIdx >= 0 ? parseFloat(argv[passIdx + 1]) : 0,
    };

    const existingIdx = store.entries.findIndex((e) => e.period === period);
    if (existingIdx >= 0) {
      store.entries[existingIdx] = entry;
    } else {
      store.entries.push(entry);
    }

    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Added metrics for period: ${period}`);
    return;
  }

  // Display
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nAdoption Metrics`);
  console.log("═".repeat(75));

  if (store.entries.length === 0) {
    console.log("  No adoption data recorded. Use --add <period> to add entries.");
    console.log("═".repeat(75));
    return;
  }

  console.log(
    `  ${"Period".padEnd(15)} ${"Reviews".padEnd(10)} ${"Users".padEnd(8)} ${"Fixed".padEnd(8)} ${"Score".padEnd(8)} Pass%`,
  );
  console.log("  " + "─".repeat(60));

  for (const e of store.entries) {
    console.log(
      `  ${e.period.padEnd(15)} ${String(e.reviewsRun).padEnd(10)} ${String(e.uniqueUsers).padEnd(8)} ${String(e.findingsFixed).padEnd(8)} ${String(e.avgScore).padEnd(8)} ${e.passRate}%`,
    );
  }

  // Trend
  if (store.entries.length >= 2) {
    const first = store.entries[0];
    const last = store.entries[store.entries.length - 1];
    const reviewGrowth =
      first.reviewsRun > 0 ? Math.round(((last.reviewsRun - first.reviewsRun) / first.reviewsRun) * 100) : 0;
    console.log(`\n  Trend: ${reviewGrowth >= 0 ? "+" : ""}${reviewGrowth}% review volume growth`);
  }

  console.log("═".repeat(75));
}
