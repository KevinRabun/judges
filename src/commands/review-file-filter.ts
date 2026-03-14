/**
 * Review-file-filter — Filter which files to include/exclude in reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileFilter {
  type: "include" | "exclude";
  pattern: string;
  reason: string;
}

interface FilterStore {
  version: string;
  filters: FileFilter[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/file-filters.json";

function loadStore(): FilterStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", filters: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as FilterStore;
  } catch {
    return { version: "1.0.0", filters: [] };
  }
}

function saveStore(store: FilterStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFileFilter(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-file-filter — Filter files for review

Usage:
  judges review-file-filter add --pattern <glob> --type <include|exclude> [--reason <text>]
  judges review-file-filter list
  judges review-file-filter test --file <path>
  judges review-file-filter remove --pattern <glob>
  judges review-file-filter clear

Options:
  --pattern <glob>    File glob pattern (e.g., "*.test.ts", "vendor/*")
  --type <type>       include or exclude (default: exclude)
  --reason <text>     Reason for filter
  --file <path>       Test if a file matches filters
  --format json       JSON output
  --help, -h          Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "test", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    const type = (argv.find((_a: string, i: number) => argv[i - 1] === "--type") || "exclude") as FileFilter["type"];
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    store.filters.push({ type, pattern, reason });
    saveStore(store);
    console.log(`Added ${type} filter: '${pattern}'`);
    return;
  }

  if (subcommand === "remove") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    const before = store.filters.length;
    store.filters = store.filters.filter((f) => f.pattern !== pattern);
    saveStore(store);
    console.log(`Removed ${before - store.filters.length} filter(s).`);
    return;
  }

  if (subcommand === "test") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    const excludes = store.filters.filter((f) => f.type === "exclude");
    const includes = store.filters.filter((f) => f.type === "include");
    const isExcluded = excludes.some((f) => globToRegex(f.pattern).test(file));
    const isIncluded = includes.length === 0 || includes.some((f) => globToRegex(f.pattern).test(file));
    const result = !isExcluded && isIncluded ? "included" : "excluded";
    if (format === "json") {
      console.log(JSON.stringify({ file, result }, null, 2));
      return;
    }
    console.log(`${file}: ${result}`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", filters: [] });
    console.log("All file filters cleared.");
    return;
  }

  // Default: list
  if (store.filters.length === 0) {
    console.log("No file filters defined.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.filters, null, 2));
    return;
  }
  console.log(`\nFile Filters (${store.filters.length}):`);
  console.log("═".repeat(55));
  for (const f of store.filters) {
    console.log(`  [${f.type.padEnd(7)}] ${f.pattern}${f.reason ? ` — ${f.reason}` : ""}`);
  }
  console.log("═".repeat(55));
}
