/**
 * Review-archive-search — Search through archived review reports.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchiveEntry {
  id: string;
  file: string;
  verdict: string;
  score: number;
  findingCount: number;
  timestamp: string;
  tags: string[];
}

interface ArchiveStore {
  entries: ArchiveEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewArchiveSearch(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-archive.json";
  const queryIdx = argv.indexOf("--query");
  const query = queryIdx >= 0 ? argv[queryIdx + 1] : "";
  const verdictIdx = argv.indexOf("--verdict");
  const verdictFilter = verdictIdx >= 0 ? argv[verdictIdx + 1] : "";
  const tagIdx = argv.indexOf("--tag");
  const tagFilter = tagIdx >= 0 ? argv[tagIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-archive-search — Search archived reviews

Usage:
  judges review-archive-search [--query <text>] [--verdict <v>] [--tag <t>] [--store <path>] [--format table|json]

Options:
  --store <path>     Archive store (default: .judges-archive.json)
  --query <text>     Search in file names
  --verdict <v>      Filter by verdict (pass, fail, warning)
  --tag <t>          Filter by tag
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No archive store found at: ${storePath}`);
    console.log("Archives are created by review-report-archive.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as ArchiveStore;
  let entries = store.entries;

  if (query) {
    const q = query.toLowerCase();
    entries = entries.filter((e) => e.file.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }

  if (verdictFilter) {
    entries = entries.filter((e) => e.verdict === verdictFilter);
  }

  if (tagFilter) {
    entries = entries.filter((e) => e.tags.includes(tagFilter));
  }

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nArchive Search Results (${entries.length})`);
  console.log("═".repeat(80));

  if (entries.length === 0) {
    console.log("  No matching archives found.");
  } else {
    console.log(
      `  ${"ID".padEnd(12)} ${"File".padEnd(25)} ${"Verdict".padEnd(10)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} Date`,
    );
    console.log("  " + "─".repeat(75));

    for (const e of entries) {
      const fileName = e.file.length > 23 ? "..." + e.file.slice(-20) : e.file;
      console.log(
        `  ${e.id.padEnd(12)} ${fileName.padEnd(25)} ${e.verdict.padEnd(10)} ${String(e.score).padEnd(8)} ${String(e.findingCount).padEnd(10)} ${e.timestamp.slice(0, 10)}`,
      );
    }
  }

  console.log(`\n  Total archives: ${store.entries.length} | Matched: ${entries.length}`);
  console.log("═".repeat(80));
}
