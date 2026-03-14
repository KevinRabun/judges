/**
 * Review-skip-rule — Quick skip/disable specific rules for a session.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkipStore {
  version: string;
  skippedRules: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SKIP_FILE = ".judges/skip-rules.json";

function loadStore(): SkipStore {
  if (!existsSync(SKIP_FILE)) return { version: "1.0.0", skippedRules: [] };
  try {
    return JSON.parse(readFileSync(SKIP_FILE, "utf-8")) as SkipStore;
  } catch {
    return { version: "1.0.0", skippedRules: [] };
  }
}

function saveStore(store: SkipStore): void {
  mkdirSync(dirname(SKIP_FILE), { recursive: true });
  writeFileSync(SKIP_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSkipRule(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-skip-rule — Quick skip/disable specific rules

Usage:
  judges review-skip-rule add --rule SEC-001
  judges review-skip-rule add --rules SEC-001,SEC-002,PERF-003
  judges review-skip-rule list
  judges review-skip-rule remove --rule SEC-001
  judges review-skip-rule clear

Subcommands:
  add                   Skip one or more rules
  list                  List skipped rules
  remove                Re-enable a rule
  clear                 Clear all skips

Options:
  --rule <id>           Single rule ID
  --rules <ids>         Comma-separated rule IDs
  --format json         JSON output
  --help, -h            Show this help

Skipped rules stored in .judges/skip-rules.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const single = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const multi = argv.find((_a: string, i: number) => argv[i - 1] === "--rules") || "";
    const rules = [
      ...(single ? [single] : []),
      ...multi
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
    ];

    if (rules.length === 0) {
      console.log("Specify --rule or --rules.");
      return;
    }

    let added = 0;
    for (const r of rules) {
      if (!store.skippedRules.includes(r)) {
        store.skippedRules.push(r);
        added++;
      }
    }
    saveStore(store);
    console.log(`Skipped ${added} rule(s). Total skipped: ${store.skippedRules.length}`);
    return;
  }

  if (subcommand === "remove") {
    const rule = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const before = store.skippedRules.length;
    store.skippedRules = store.skippedRules.filter((r) => r !== rule);
    saveStore(store);
    console.log(before > store.skippedRules.length ? `Re-enabled ${rule}.` : `${rule} was not skipped.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", skippedRules: [] });
    console.log("All rule skips cleared.");
    return;
  }

  // Default: list
  if (store.skippedRules.length === 0) {
    console.log("No rules skipped.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.skippedRules, null, 2));
    return;
  }
  console.log(`\nSkipped Rules (${store.skippedRules.length}):`);
  for (const r of store.skippedRules) {
    console.log(`  - ${r}`);
  }
}
