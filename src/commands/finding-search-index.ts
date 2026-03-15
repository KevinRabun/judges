/**
 * Finding-search-index — Build and query a local search index of findings.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IndexEntry {
  ruleId: string;
  title: string;
  severity: string;
  description: string;
  recommendation: string;
  source: string;
  indexedAt: string;
}

interface SearchIndex {
  entries: IndexEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSearchIndex(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-search-index.json";
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const queryIdx = argv.indexOf("--query");
  const query = queryIdx >= 0 ? argv[queryIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const buildMode = argv.includes("--build");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-search-index — Build and search findings index

Usage:
  judges finding-search-index --build --findings <path> [--store <path>]
  judges finding-search-index --query <text> [--store <path>] [--format table|json]

Options:
  --store <path>      Index file (default: .judges-search-index.json)
  --build             Build/update the search index
  --findings <path>   Path to findings JSON (with --build)
  --query <text>      Search query text
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (buildMode) {
    if (!findingsPath || !existsSync(findingsPath)) {
      console.error("Provide --findings <path> to a valid findings JSON file.");
      process.exitCode = 1;
      return;
    }

    const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
    const index: SearchIndex = existsSync(storePath)
      ? (JSON.parse(readFileSync(storePath, "utf-8")) as SearchIndex)
      : { entries: [], lastUpdated: new Date().toISOString() };

    let added = 0;
    for (const f of findings) {
      const exists = index.entries.some((e) => e.ruleId === f.ruleId && e.source === findingsPath);
      if (!exists) {
        index.entries.push({
          ruleId: f.ruleId,
          title: f.title,
          severity: f.severity,
          description: f.description,
          recommendation: f.recommendation,
          source: findingsPath,
          indexedAt: new Date().toISOString(),
        });
        added++;
      }
    }

    index.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(index, null, 2));
    console.log(`Indexed ${added} new findings. Total: ${index.entries.length}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No search index found at: ${storePath}`);
    console.log("Run with --build to create one.");
    return;
  }

  const index = JSON.parse(readFileSync(storePath, "utf-8")) as SearchIndex;

  let results = index.entries;
  if (query) {
    const q = query.toLowerCase();
    results = index.entries.filter(
      (e) =>
        e.ruleId.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.recommendation.toLowerCase().includes(q),
    );
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nSearch Results (${results.length})`);
  console.log("═".repeat(80));

  if (results.length === 0) {
    console.log("  No matching findings.");
  } else {
    console.log(`  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(10)} ${"Title".padEnd(30)} Source`);
    console.log("  " + "─".repeat(75));

    for (const e of results) {
      const title = e.title.length > 28 ? e.title.slice(0, 25) + "..." : e.title;
      const source = e.source.length > 15 ? "..." + e.source.slice(-12) : e.source;
      console.log(`  ${e.ruleId.padEnd(25)} ${e.severity.padEnd(10)} ${title.padEnd(30)} ${source}`);
    }
  }

  console.log(`\n  Index size: ${index.entries.length} | Matched: ${results.length}`);
  console.log("═".repeat(80));
}
