/**
 * Review-ignore-path — Manage path ignore lists for reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IgnoreEntry {
  pattern: string;
  reason: string;
  addedAt: string;
}

interface IgnoreStore {
  version: string;
  paths: IgnoreEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const IGNORE_FILE = join(".judges", "ignore-paths.json");

function loadStore(): IgnoreStore {
  if (!existsSync(IGNORE_FILE)) return { version: "1.0.0", paths: [] };
  try {
    return JSON.parse(readFileSync(IGNORE_FILE, "utf-8")) as IgnoreStore;
  } catch {
    return { version: "1.0.0", paths: [] };
  }
}

function saveStore(store: IgnoreStore): void {
  mkdirSync(dirname(IGNORE_FILE), { recursive: true });
  writeFileSync(IGNORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function matchesPattern(filePath: string, pattern: string): boolean {
  // Simple glob matching
  if (pattern.endsWith("/**")) {
    return filePath.startsWith(pattern.slice(0, -3));
  }
  if (pattern.startsWith("**/")) {
    return filePath.includes(pattern.slice(3));
  }
  if (pattern.startsWith("*.")) {
    return filePath.endsWith(pattern.slice(1));
  }
  return filePath === pattern || filePath.includes(pattern);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIgnorePath(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ignore-path — Manage path ignore lists

Usage:
  judges review-ignore-path add --pattern "test/**" --reason "Test files"
  judges review-ignore-path add --pattern "*.min.js" --reason "Minified files"
  judges review-ignore-path list
  judges review-ignore-path check --file src/api.ts
  judges review-ignore-path remove --pattern "test/**"
  judges review-ignore-path clear

Subcommands:
  add                   Add an ignore pattern
  list                  List all ignore patterns
  check                 Check if a file matches any pattern
  remove                Remove an ignore pattern
  clear                 Clear all ignore patterns

Options:
  --pattern <glob>      Glob pattern to ignore
  --reason <text>       Reason for ignoring
  --file <path>         File to check
  --format json         JSON output
  --help, -h            Show this help

Ignore patterns stored in .judges/ignore-paths.json.
Supported patterns: dir/**, **/file, *.ext, exact/path.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "check", "remove", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern") || "";
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!pattern) {
      console.error("Error: --pattern is required.");
      process.exitCode = 1;
      return;
    }
    if (store.paths.some((p) => p.pattern === pattern)) {
      console.error(`Error: Pattern "${pattern}" already exists.`);
      process.exitCode = 1;
      return;
    }
    store.paths.push({ pattern, reason, addedAt: new Date().toISOString() });
    saveStore(store);
    console.log(`Added ignore pattern: ${pattern}`);
    return;
  }

  if (subcommand === "remove") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern") || "";
    if (!pattern) {
      console.error("Error: --pattern is required.");
      process.exitCode = 1;
      return;
    }
    const before = store.paths.length;
    store.paths = store.paths.filter((p) => p.pattern !== pattern);
    if (store.paths.length === before) {
      console.error(`Error: Pattern "${pattern}" not found.`);
      process.exitCode = 1;
      return;
    }
    saveStore(store);
    console.log(`Removed ignore pattern: ${pattern}`);
    return;
  }

  if (subcommand === "check") {
    const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    if (!filePath) {
      console.error("Error: --file is required.");
      process.exitCode = 1;
      return;
    }
    const matches = store.paths.filter((p) => matchesPattern(filePath, p.pattern));
    if (matches.length > 0) {
      console.log(`✓ "${filePath}" is ignored by ${matches.length} pattern(s):`);
      for (const m of matches) {
        console.log(`  ${m.pattern}${m.reason ? ` — ${m.reason}` : ""}`);
      }
    } else {
      console.log(`✗ "${filePath}" is NOT ignored.`);
    }
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", paths: [] });
    console.log("Ignore patterns cleared.");
    return;
  }

  // list
  if (store.paths.length === 0) {
    console.log("No ignore patterns. Use 'judges review-ignore-path add' to start.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.paths, null, 2));
    return;
  }

  console.log("\nIgnore Patterns:");
  console.log("─".repeat(60));
  for (const p of store.paths) {
    console.log(`  ${p.pattern.padEnd(30)} ${p.addedAt.slice(0, 10)}  ${p.reason || ""}`);
  }
  console.log("─".repeat(60));
  console.log(`  Total: ${store.paths.length} pattern(s)`);
}
