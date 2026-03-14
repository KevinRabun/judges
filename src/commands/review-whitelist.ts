/**
 * Review-whitelist — Allow-list safe patterns that should not be flagged.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WhitelistEntry {
  id: string;
  ruleId: string;
  pattern: string;
  reason: string;
  addedAt: string;
  addedBy: string;
}

interface WhitelistStore {
  version: string;
  entries: WhitelistEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const WHITELIST_FILE = join(".judges", "whitelist.json");

function loadWhitelist(): WhitelistStore {
  if (!existsSync(WHITELIST_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(WHITELIST_FILE, "utf-8")) as WhitelistStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveWhitelist(store: WhitelistStore): void {
  mkdirSync(dirname(WHITELIST_FILE), { recursive: true });
  writeFileSync(WHITELIST_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `wl-${Date.now().toString(36)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWhitelist(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-whitelist — Allow-list safe patterns

Usage:
  judges review-whitelist add --rule sql-injection --pattern "SELECT.*FROM config" --reason "Read-only config table"
  judges review-whitelist list
  judges review-whitelist remove --id wl-abc123
  judges review-whitelist check --rule sql-injection --code "SELECT name FROM config"
  judges review-whitelist clear

Subcommands:
  add                   Add a whitelist entry
  list                  List all whitelist entries
  remove                Remove a whitelist entry
  check                 Check if code matches a whitelist pattern
  clear                 Clear all whitelist data

Options:
  --rule <ruleId>       Rule ID to whitelist
  --pattern <regex>     Regex pattern to match safe code
  --reason <text>       Reason for whitelisting
  --by <name>           Who added the entry
  --id <id>             Whitelist entry ID
  --code <text>         Code snippet to check
  --format json         JSON output
  --help, -h            Show this help

Whitelist data stored in .judges/whitelist.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "remove", "check", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadWhitelist();

  if (subcommand === "add") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern") || "";
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    const addedBy = argv.find((_a: string, i: number) => argv[i - 1] === "--by") || "unknown";

    if (!ruleId || !pattern) {
      console.error("Error: --rule and --pattern are required.");
      process.exitCode = 1;
      return;
    }

    // Validate the regex pattern
    try {
      new RegExp(pattern);
    } catch {
      console.error("Error: --pattern is not a valid regex.");
      process.exitCode = 1;
      return;
    }

    const id = generateId();
    store.entries.push({ id, ruleId, pattern, reason, addedAt: new Date().toISOString(), addedBy });
    saveWhitelist(store);
    console.log(`Added whitelist entry ${id}: rule="${ruleId}" pattern="${pattern}"`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== id);
    if (store.entries.length === before) {
      console.error(`Error: Entry "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    saveWhitelist(store);
    console.log(`Removed whitelist entry ${id}.`);
    return;
  }

  if (subcommand === "check") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const code = argv.find((_a: string, i: number) => argv[i - 1] === "--code") || "";
    if (!ruleId || !code) {
      console.error("Error: --rule and --code are required.");
      process.exitCode = 1;
      return;
    }
    const matches = store.entries.filter((e) => {
      if (e.ruleId !== ruleId && e.ruleId !== "*") return false;
      try {
        return new RegExp(e.pattern).test(code);
      } catch {
        return false;
      }
    });
    if (matches.length > 0) {
      console.log(`✓ Code is whitelisted by ${matches.length} entry/entries:`);
      for (const m of matches) {
        console.log(`  ${m.id}: ${m.reason || "(no reason)"}`);
      }
    } else {
      console.log("✗ Code is NOT whitelisted for this rule.");
    }
    return;
  }

  if (subcommand === "clear") {
    saveWhitelist({ version: "1.0.0", entries: [] });
    console.log("Whitelist data cleared.");
    return;
  }

  // list
  if (store.entries.length === 0) {
    console.log("No whitelist entries. Use 'judges review-whitelist add' to start.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.entries, null, 2));
    return;
  }

  console.log("\nWhitelist Entries:");
  console.log("─".repeat(70));
  for (const e of store.entries) {
    console.log(`  ${e.id}  rule=${e.ruleId}  added=${e.addedAt.slice(0, 10)}`);
    console.log(`    Pattern: ${e.pattern}`);
    if (e.reason) console.log(`    Reason:  ${e.reason}`);
  }
  console.log("─".repeat(70));
  console.log(`  Total: ${store.entries.length} entry/entries`);
}
