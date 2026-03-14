/**
 * Finding-priority-queue — Queue findings by priority for resolution.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueEntry {
  id: string;
  ruleId: string;
  title: string;
  priority: number;
  addedAt: string;
  status: "queued" | "in-progress" | "done";
}

interface QueueStore {
  version: string;
  entries: QueueEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const QUEUE_FILE = ".judges/priority-queue.json";

function loadStore(): QueueStore {
  if (!existsSync(QUEUE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, "utf-8")) as QueueStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: QueueStore): void {
  mkdirSync(dirname(QUEUE_FILE), { recursive: true });
  writeFileSync(QUEUE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `pq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPriorityQueue(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-priority-queue — Queue findings by priority

Usage:
  judges finding-priority-queue add --rule SEC-001 --title "XSS risk" --priority 1
  judges finding-priority-queue list
  judges finding-priority-queue next
  judges finding-priority-queue done --id <id>
  judges finding-priority-queue remove --id <id>
  judges finding-priority-queue clear

Subcommands:
  add                   Add finding to queue
  list                  List queued findings (sorted by priority)
  next                  Show the next highest-priority item
  done                  Mark an item as done
  remove                Remove from queue
  clear                 Clear queue

Options:
  --rule <id>           Rule ID
  --title <text>        Finding title
  --priority <n>        Priority (1=highest)
  --format json         JSON output
  --help, -h            Show this help

Queue stored in .judges/priority-queue.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "next", "done", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || "";
    const priority = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--priority") || "5", 10);

    store.entries.push({
      id: generateId(),
      ruleId,
      title,
      priority,
      addedAt: new Date().toISOString(),
      status: "queued",
    });
    store.entries.sort((a, b) => a.priority - b.priority);
    saveStore(store);
    console.log(`Queued: ${ruleId} — ${title} (priority=${priority})`);
    return;
  }

  if (subcommand === "next") {
    const next = store.entries.find((e) => e.status === "queued");
    if (!next) {
      console.log("Queue is empty.");
      return;
    }
    next.status = "in-progress";
    saveStore(store);
    console.log(`Next: ${next.id}  ${next.ruleId} — ${next.title} (priority=${next.priority})`);
    return;
  }

  if (subcommand === "done") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const entry = store.entries.find((e) => e.id === id);
    if (!entry) {
      console.log(`${id} not found.`);
      return;
    }
    entry.status = "done";
    saveStore(store);
    console.log(`Done: ${entry.ruleId} — ${entry.title}`);
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
    console.log("Priority queue cleared.");
    return;
  }

  // Default: list
  if (store.entries.length === 0) {
    console.log("Priority queue is empty.");
    return;
  }
  const queued = store.entries.filter((e) => e.status !== "done");
  if (format === "json") {
    console.log(JSON.stringify(queued, null, 2));
    return;
  }
  console.log(`\nPriority Queue (${queued.length} active):`);
  console.log("─".repeat(60));
  for (const e of queued) {
    const marker = e.status === "in-progress" ? ">>>" : "   ";
    console.log(`  ${marker} P${e.priority}  ${e.id}  ${e.ruleId} — ${e.title}  [${e.status}]`);
  }
  console.log("─".repeat(60));
}
