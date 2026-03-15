/**
 * Review-quality-trend — Track quality trends across review runs.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualitySnapshot {
  timestamp: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

interface QualityStore {
  snapshots: QualitySnapshot[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewQualityTrend(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-quality-trend.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const lastN = argv.indexOf("--last");
  const lastCount = lastN >= 0 ? parseInt(argv[lastN + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-quality-trend — Track quality trends

Usage:
  judges review-quality-trend [--store <path>] [--last <n>] [--format table|json]

Options:
  --store <path>     Quality store (default: .judges-quality-trend.json)
  --last <n>         Show only the last N snapshots
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No quality trend data found at: ${storePath}`);
    console.log("Quality snapshots are recorded during reviews.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as QualityStore;
  let snapshots = store.snapshots;

  if (lastCount > 0) {
    snapshots = snapshots.slice(-lastCount);
  }

  if (format === "json") {
    console.log(JSON.stringify(snapshots, null, 2));
    return;
  }

  console.log(`\nQuality Trend (${snapshots.length} snapshots)`);
  console.log("═".repeat(70));
  console.log(`  ${"Date".padEnd(14)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} ${"Critical".padEnd(10)} High`);
  console.log("  " + "─".repeat(55));

  for (const s of snapshots) {
    console.log(
      `  ${s.timestamp.slice(0, 10).padEnd(14)} ${String(s.score).padEnd(8)} ${String(s.findingCount).padEnd(10)} ${String(s.criticalCount).padEnd(10)} ${s.highCount}`,
    );
  }

  if (snapshots.length >= 2) {
    const first = snapshots[0].score;
    const last = snapshots[snapshots.length - 1].score;
    const delta = last - first;
    const trend = delta > 0 ? "improving" : delta < 0 ? "declining" : "stable";
    console.log(`\n  Trend: ${trend} (${delta >= 0 ? "+" : ""}${delta} points)`);
  }
  console.log("═".repeat(70));
}
