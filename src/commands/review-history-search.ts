/**
 * Review-history-search — Search through past review history.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  date: string;
  source: string;
  score: number;
  findingCount: number;
  tags: string[];
  notes: string;
}

interface HistoryStore {
  version: string;
  entries: HistoryEntry[];
}

interface SearchResult {
  entry: HistoryEntry;
  matchField: string;
  matchText: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const HISTORY_FILE = join(".judges", "review-history.json");

function loadHistory(): HistoryStore {
  if (!existsSync(HISTORY_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, "utf-8")) as HistoryStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveHistory(store: HistoryStore): void {
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `hist-${Date.now().toString(36)}`;
}

// ─── Search ─────────────────────────────────────────────────────────────────

function searchEntries(entries: HistoryEntry[], query: string): SearchResult[] {
  const lower = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const entry of entries) {
    if (entry.source.toLowerCase().includes(lower)) {
      results.push({ entry, matchField: "source", matchText: entry.source });
    } else if (entry.notes.toLowerCase().includes(lower)) {
      results.push({ entry, matchField: "notes", matchText: entry.notes });
    } else if (entry.tags.some((t) => t.toLowerCase().includes(lower))) {
      const tag = entry.tags.find((t) => t.toLowerCase().includes(lower)) || "";
      results.push({ entry, matchField: "tag", matchText: tag });
    } else if (entry.id.toLowerCase().includes(lower)) {
      results.push({ entry, matchField: "id", matchText: entry.id });
    }
  }

  return results;
}

// ─── Auto-index ─────────────────────────────────────────────────────────────

function autoIndex(): number {
  const judgesDir = ".judges";
  if (!existsSync(judgesDir)) return 0;

  const store = loadHistory();
  const existingIds = new Set(store.entries.map((e) => e.id));
  let added = 0;

  try {
    const files = readdirSync(judgesDir) as unknown as string[];
    for (const file of files) {
      const fStr = file as string;
      if (!fStr.endsWith(".json")) continue;
      if (fStr === "review-history.json") continue;

      const fullPath = join(judgesDir, fStr);
      try {
        const content = JSON.parse(readFileSync(fullPath, "utf-8"));
        if (content.timestamp && content.findings) {
          const id = `hist-${fStr.replace(".json", "")}`;
          if (!existingIds.has(id)) {
            store.entries.push({
              id,
              date: content.timestamp || new Date().toISOString(),
              source: fStr,
              score: content.overallScore || 0,
              findingCount: Array.isArray(content.findings) ? content.findings.length : 0,
              tags: [],
              notes: "",
            });
            added++;
          }
        }
      } catch {
        // Skip non-parseable files
      }
    }
  } catch {
    // Skip if directory unreadable
  }

  if (added > 0) saveHistory(store);
  return added;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewHistorySearch(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-history-search — Search past review history

Usage:
  judges review-history-search --query "sql injection"
  judges review-history-search add --source report.json --score 7.5 --notes "Sprint 42 review"
  judges review-history-search list
  judges review-history-search index                      Auto-index .judges/ files
  judges review-history-search clear

Subcommands:
  (default)             Search history
  add                   Add a history entry
  list                  List all history entries
  index                 Auto-index review files in .judges/
  clear                 Clear history

Options:
  --query <text>        Search query
  --source <text>       Source file or description
  --score <n>           Review score
  --notes <text>        Notes for the entry
  --tags <t1,t2>        Comma-separated tags
  --after <date>        Filter entries after date (YYYY-MM-DD)
  --before <date>       Filter entries before date (YYYY-MM-DD)
  --format json         JSON output
  --help, -h            Show this help

History stored locally in .judges/review-history.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "index", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadHistory();

  if (subcommand === "index") {
    const added = autoIndex();
    console.log(added > 0 ? `Indexed ${added} new review file(s).` : "No new review files to index.");
    return;
  }

  if (subcommand === "add") {
    const source = argv.find((_a: string, i: number) => argv[i - 1] === "--source") || "";
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const notes = argv.find((_a: string, i: number) => argv[i - 1] === "--notes") || "";
    const tagsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--tags") || "";
    const tags = tagsArg
      ? tagsArg
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (!source) {
      console.error("Error: --source is required.");
      process.exitCode = 1;
      return;
    }

    const id = generateId();
    store.entries.push({ id, date: new Date().toISOString(), source, score, findingCount: 0, tags, notes });
    saveHistory(store);
    console.log(`Added history entry ${id}.`);
    return;
  }

  if (subcommand === "clear") {
    saveHistory({ version: "1.0.0", entries: [] });
    console.log("Review history cleared.");
    return;
  }

  if (subcommand === "list") {
    const after = argv.find((_a: string, i: number) => argv[i - 1] === "--after") || "";
    const before = argv.find((_a: string, i: number) => argv[i - 1] === "--before") || "";
    let entries = store.entries;
    if (after) entries = entries.filter((e) => e.date >= after);
    if (before) entries = entries.filter((e) => e.date <= before);

    if (entries.length === 0) {
      console.log("No history entries.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }
    console.log("\nReview History:");
    console.log("─".repeat(70));
    for (const e of entries) {
      console.log(
        `  ${e.id}  ${e.date.slice(0, 10)}  score=${e.score.toFixed(1)}  findings=${e.findingCount}  ${e.source}`,
      );
      if (e.notes) console.log(`    Note: ${e.notes}`);
    }
    console.log("─".repeat(70));
    console.log(`  Total: ${entries.length} entry/entries`);
    return;
  }

  // Default: search
  const query = argv.find((_a: string, i: number) => argv[i - 1] === "--query") || "";
  if (!query) {
    console.error("Error: --query is required for search. Use 'list' to see all entries.");
    process.exitCode = 1;
    return;
  }

  const results = searchEntries(store.entries, query);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No matches for "${query}".`);
    return;
  }

  console.log(`\nSearch results for "${query}" (${results.length} match(es)):`);
  console.log("─".repeat(70));
  for (const r of results) {
    console.log(`  ${r.entry.id}  ${r.entry.date.slice(0, 10)}  score=${r.entry.score.toFixed(1)}  [${r.matchField}]`);
    console.log(`    Source: ${r.entry.source}`);
    console.log(`    Match:  ${r.matchText}`);
  }
  console.log("─".repeat(70));
}
