/**
 * Review-lock — Lock reviews to prevent accidental re-runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LockEntry {
  file: string;
  lockedAt: string;
  reason: string;
}

interface LockStore {
  version: string;
  locks: LockEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const LOCK_FILE = ".judges/review-locks.json";

function loadStore(): LockStore {
  if (!existsSync(LOCK_FILE)) return { version: "1.0.0", locks: [] };
  try {
    return JSON.parse(readFileSync(LOCK_FILE, "utf-8")) as LockStore;
  } catch {
    return { version: "1.0.0", locks: [] };
  }
}

function saveStore(store: LockStore): void {
  mkdirSync(dirname(LOCK_FILE), { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewLock(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-lock — Lock reviews to prevent re-runs

Usage:
  judges review-lock add --file src/app.ts --reason "approved"
  judges review-lock check --file src/app.ts
  judges review-lock list
  judges review-lock remove --file src/app.ts
  judges review-lock clear

Subcommands:
  add                   Lock a file
  check                 Check if a file is locked
  list                  List all locks
  remove                Unlock a file
  clear                 Clear all locks

Options:
  --file <path>         File path
  --reason <text>       Lock reason
  --format json         JSON output
  --help, -h            Show this help

Locks stored in .judges/review-locks.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "check", "list", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!file) {
      console.log("Specify --file.");
      return;
    }
    store.locks = store.locks.filter((l) => l.file !== file);
    store.locks.push({ file, lockedAt: new Date().toISOString(), reason });
    saveStore(store);
    console.log(`Locked: ${file}`);
    return;
  }

  if (subcommand === "check") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const lock = store.locks.find((l) => l.file === file);
    if (lock) {
      console.log(`LOCKED: ${file} — ${lock.reason} (${lock.lockedAt.slice(0, 10)})`);
    } else {
      console.log(`Not locked: ${file}`);
    }
    return;
  }

  if (subcommand === "remove") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const before = store.locks.length;
    store.locks = store.locks.filter((l) => l.file !== file);
    saveStore(store);
    console.log(before > store.locks.length ? `Unlocked: ${file}` : `${file} was not locked.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", locks: [] });
    console.log("All locks cleared.");
    return;
  }

  // Default: list
  if (store.locks.length === 0) {
    console.log("No review locks.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.locks, null, 2));
    return;
  }
  console.log(`\nReview Locks (${store.locks.length}):`);
  console.log("─".repeat(50));
  for (const l of store.locks) {
    console.log(`  ${l.file}  ${l.lockedAt.slice(0, 10)}  ${l.reason}`);
  }
  console.log("─".repeat(50));
}
