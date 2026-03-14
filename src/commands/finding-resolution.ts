/**
 * Finding-resolution — Track finding resolution status.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

type ResolutionStatus = "open" | "fixed" | "wont-fix" | "deferred" | "false-positive";

interface ResolutionEntry {
  id: string;
  ruleId: string;
  title: string;
  status: ResolutionStatus;
  resolvedBy: string;
  resolvedAt: string;
  note: string;
}

interface ResolutionStore {
  version: string;
  entries: ResolutionEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const RES_FILE = ".judges/finding-resolutions.json";

function loadStore(): ResolutionStore {
  if (!existsSync(RES_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(RES_FILE, "utf-8")) as ResolutionStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: ResolutionStore): void {
  mkdirSync(dirname(RES_FILE), { recursive: true });
  writeFileSync(RES_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const VALID_STATUSES: ResolutionStatus[] = ["open", "fixed", "wont-fix", "deferred", "false-positive"];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingResolution(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-resolution — Track finding resolution status

Usage:
  judges finding-resolution set --rule SEC-001 --status fixed --by "dev"
  judges finding-resolution list
  judges finding-resolution list --status open
  judges finding-resolution stats
  judges finding-resolution remove --id <id>
  judges finding-resolution clear

Subcommands:
  set                   Set resolution status for a finding
  list                  List resolutions (optionally filter by status)
  stats                 Show resolution statistics
  remove                Remove a resolution entry
  clear                 Clear all resolutions

Status values: open, fixed, wont-fix, deferred, false-positive

Options:
  --rule <id>           Rule ID
  --title <text>        Finding title
  --status <status>     Resolution status
  --by <name>           Who resolved it
  --note <text>         Resolution note
  --format json         JSON output
  --help, -h            Show this help

Resolutions stored in .judges/finding-resolutions.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["set", "list", "stats", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "set") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || "";
    const status = argv.find((_a: string, i: number) => argv[i - 1] === "--status") as ResolutionStatus | undefined;
    const resolvedBy = argv.find((_a: string, i: number) => argv[i - 1] === "--by") || "";
    const note = argv.find((_a: string, i: number) => argv[i - 1] === "--note") || "";

    if (!status || !VALID_STATUSES.includes(status)) {
      console.log(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
      return;
    }

    const entry: ResolutionEntry = {
      id: generateId(),
      ruleId,
      title,
      status,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
      note,
    };
    store.entries.push(entry);
    saveStore(store);
    console.log(`Resolution set: ${ruleId} → ${status}`);
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
    console.log("Resolutions cleared.");
    return;
  }

  if (subcommand === "stats") {
    if (store.entries.length === 0) {
      console.log("No resolutions tracked.");
      return;
    }
    const byStatus = new Map<string, number>();
    for (const e of store.entries) {
      byStatus.set(e.status, (byStatus.get(e.status) || 0) + 1);
    }
    if (format === "json") {
      console.log(JSON.stringify({ total: store.entries.length, byStatus: Object.fromEntries(byStatus) }, null, 2));
      return;
    }
    console.log(`\nResolution Stats: ${store.entries.length} total`);
    console.log("─".repeat(40));
    for (const [s, c] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = ((c / store.entries.length) * 100).toFixed(0);
      console.log(`  ${s.padEnd(16)} ${c} (${pct}%)`);
    }
    return;
  }

  // Default: list
  const statusFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--status") || "";
  const entries = statusFilter ? store.entries.filter((e) => e.status === statusFilter) : store.entries;

  if (entries.length === 0) {
    console.log("No resolutions found.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  console.log(`\nFinding Resolutions (${entries.length}):`);
  console.log("─".repeat(60));
  for (const e of entries) {
    console.log(`  ${e.id}  ${e.ruleId}  [${e.status}]  ${e.title}`);
    if (e.note) console.log(`    note: ${e.note}`);
  }
  console.log("─".repeat(60));
}
