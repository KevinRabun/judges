/**
 * Finding-false-positive — Track and manage false positive findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FalsePositiveEntry {
  id: string;
  ruleId: string;
  title: string;
  reason: string;
  date: string;
  file: string;
}

interface FPStore {
  version: string;
  entries: FalsePositiveEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const FP_FILE = ".judges/false-positives.json";

function loadStore(): FPStore {
  if (!existsSync(FP_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(FP_FILE, "utf-8")) as FPStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: FPStore): void {
  mkdirSync(dirname(FP_FILE), { recursive: true });
  writeFileSync(FP_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFalsePositive(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-false-positive — Track and manage false positive findings

Usage:
  judges finding-false-positive add --rule SEC-001 --title "Not a real XSS" --reason "sanitized upstream"
  judges finding-false-positive list
  judges finding-false-positive check --rule SEC-001 --file src/app.ts
  judges finding-false-positive remove --id <id>
  judges finding-false-positive clear
  judges finding-false-positive stats

Subcommands:
  add                   Mark a finding as false positive
  list                  List all false positives
  check                 Check if a rule/file combo is marked FP
  remove                Remove a false positive by ID
  clear                 Clear all false positives
  stats                 Show false positive statistics

Options:
  --rule <id>           Rule ID
  --title <text>        Finding title
  --reason <text>       Reason for marking as FP
  --file <path>         Related file path
  --format json         JSON output
  --help, -h            Show this help

Stored locally in .judges/false-positives.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "check", "remove", "clear", "stats"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || "";
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";

    const entry: FalsePositiveEntry = { id: generateId(), ruleId, title, reason, date: new Date().toISOString(), file };
    store.entries.push(entry);
    saveStore(store);
    console.log(`Marked as false positive (${entry.id}): ${ruleId} — ${title}`);
    return;
  }

  if (subcommand === "check") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const match = store.entries.find((e) => e.ruleId === ruleId && (!file || e.file === file));
    if (match) {
      console.log(`FP match found: ${match.id} — ${match.reason}`);
    } else {
      console.log("No false positive match.");
    }
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.entries.length;
    store.entries = store.entries.filter((e) => e.id !== id);
    saveStore(store);
    console.log(before > store.entries.length ? `Removed ${id}.` : `${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("False positives cleared.");
    return;
  }

  if (subcommand === "stats") {
    if (store.entries.length === 0) {
      console.log("No false positives recorded.");
      return;
    }
    const byRule = new Map<string, number>();
    for (const e of store.entries) {
      byRule.set(e.ruleId, (byRule.get(e.ruleId) || 0) + 1);
    }
    if (format === "json") {
      console.log(JSON.stringify({ total: store.entries.length, byRule: Object.fromEntries(byRule) }, null, 2));
      return;
    }
    console.log(`\nFalse Positive Stats: ${store.entries.length} total`);
    console.log("─".repeat(40));
    for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rule}: ${count}`);
    }
    return;
  }

  // Default: list
  if (store.entries.length === 0) {
    console.log("No false positives. Use 'judges finding-false-positive add' to mark findings.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.entries, null, 2));
    return;
  }
  console.log("\nFalse Positives:");
  console.log("─".repeat(60));
  for (const e of store.entries) {
    console.log(`  ${e.id}  ${e.ruleId}  ${e.title}`);
    console.log(`    reason: ${e.reason}  file: ${e.file || "(any)"}`);
  }
  console.log("─".repeat(60));
}
