/**
 * Review-bulk-action — Apply bulk actions across multiple findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BulkActionRecord {
  id: string;
  action: string;
  ruleIds: string[];
  appliedAt: string;
  count: number;
}

interface BulkStore {
  version: string;
  actions: BulkActionRecord[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const BULK_FILE = ".judges/bulk-actions.json";

function loadStore(): BulkStore {
  if (!existsSync(BULK_FILE)) return { version: "1.0.0", actions: [] };
  try {
    return JSON.parse(readFileSync(BULK_FILE, "utf-8")) as BulkStore;
  } catch {
    return { version: "1.0.0", actions: [] };
  }
}

function saveStore(store: BulkStore): void {
  mkdirSync(dirname(BULK_FILE), { recursive: true });
  writeFileSync(BULK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `ba-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBulkAction(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-bulk-action — Apply bulk actions across multiple findings

Usage:
  judges review-bulk-action dismiss --rules SEC-001,SEC-002
  judges review-bulk-action suppress --rules "PERF-*"
  judges review-bulk-action approve --rules SEC-001
  judges review-bulk-action history
  judges review-bulk-action undo --id <id>
  judges review-bulk-action clear

Subcommands:
  dismiss               Dismiss findings by rule IDs
  suppress              Suppress findings by rule pattern
  approve               Mark findings as approved
  history               Show bulk action history
  undo                  Undo a bulk action
  clear                 Clear bulk action history

Options:
  --rules <ids>         Comma-separated rule IDs or pattern
  --format json         JSON output
  --help, -h            Show this help

History stored in .judges/bulk-actions.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["dismiss", "suppress", "approve", "history", "undo", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "dismiss" || subcommand === "suppress" || subcommand === "approve") {
    const rulesRaw = argv.find((_a: string, i: number) => argv[i - 1] === "--rules") || "";
    const ruleIds = rulesRaw
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (ruleIds.length === 0) {
      console.log("No rules specified. Use --rules SEC-001,SEC-002");
      return;
    }

    const record: BulkActionRecord = {
      id: generateId(),
      action: subcommand,
      ruleIds,
      appliedAt: new Date().toISOString(),
      count: ruleIds.length,
    };
    store.actions.push(record);
    saveStore(store);
    console.log(`Bulk ${subcommand}: ${ruleIds.length} rule(s) — ${ruleIds.join(", ")}`);
    return;
  }

  if (subcommand === "undo") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.actions.length;
    store.actions = store.actions.filter((a) => a.id !== id);
    saveStore(store);
    console.log(before > store.actions.length ? `Undone ${id}.` : `${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", actions: [] });
    console.log("Bulk action history cleared.");
    return;
  }

  // Default: history
  if (store.actions.length === 0) {
    console.log("No bulk actions recorded.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.actions, null, 2));
    return;
  }
  console.log("\nBulk Action History:");
  console.log("─".repeat(60));
  for (const a of store.actions) {
    console.log(`  ${a.id}  ${a.action}  ${a.appliedAt.slice(0, 10)}  rules: ${a.ruleIds.join(", ")}`);
  }
  console.log("─".repeat(60));
}
