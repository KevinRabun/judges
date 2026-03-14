/**
 * Review-checklist — Pre/post-review checklists for consistency.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface Checklist {
  version: string;
  name: string;
  items: ChecklistItem[];
}

interface ChecklistStore {
  version: string;
  checklists: Checklist[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CL_FILE = ".judges/checklists.json";

function loadStore(): ChecklistStore {
  if (!existsSync(CL_FILE)) return { version: "1.0.0", checklists: [] };
  try {
    return JSON.parse(readFileSync(CL_FILE, "utf-8")) as ChecklistStore;
  } catch {
    return { version: "1.0.0", checklists: [] };
  }
}

function saveStore(store: ChecklistStore): void {
  mkdirSync(dirname(CL_FILE), { recursive: true });
  writeFileSync(CL_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewChecklist(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-checklist — Pre/post-review checklists

Usage:
  judges review-checklist create --name pre-review --items "check tests,check lint,check types"
  judges review-checklist show --name pre-review
  judges review-checklist check --name pre-review --item 0
  judges review-checklist reset --name pre-review
  judges review-checklist list
  judges review-checklist remove --name pre-review

Subcommands:
  create                Create a checklist
  show                  Show a checklist
  check                 Toggle a checklist item
  reset                 Reset all items to unchecked
  list                  List all checklists
  remove                Remove a checklist

Options:
  --name <text>         Checklist name
  --items <csv>         Comma-separated checklist items
  --item <n>            Item index (0-based)
  --format json         JSON output
  --help, -h            Show this help

Checklists stored in .judges/checklists.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["create", "show", "check", "reset", "list", "remove"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "";

  if (subcommand === "create") {
    const itemsRaw = argv.find((_a: string, i: number) => argv[i - 1] === "--items") || "";
    const items = itemsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((label) => ({ label, checked: false }));
    if (!name || items.length === 0) {
      console.log("Specify --name and --items.");
      return;
    }
    store.checklists = store.checklists.filter((c) => c.name !== name);
    store.checklists.push({ version: "1.0.0", name, items });
    saveStore(store);
    console.log(`Checklist "${name}" created with ${items.length} items.`);
    return;
  }

  if (subcommand === "show") {
    const cl = store.checklists.find((c) => c.name === name);
    if (!cl) {
      console.log(`Checklist "${name}" not found.`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(cl, null, 2));
      return;
    }
    console.log(`\nChecklist: ${cl.name}`);
    console.log("─".repeat(40));
    cl.items.forEach((item, i) => {
      console.log(`  ${i}. [${item.checked ? "x" : " "}] ${item.label}`);
    });
    const done = cl.items.filter((i) => i.checked).length;
    console.log(`\n  ${done}/${cl.items.length} complete`);
    return;
  }

  if (subcommand === "check") {
    const cl = store.checklists.find((c) => c.name === name);
    if (!cl) {
      console.log(`Checklist "${name}" not found.`);
      return;
    }
    const idx = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--item") || "-1", 10);
    if (idx < 0 || idx >= cl.items.length) {
      console.log(`Invalid item index.`);
      return;
    }
    cl.items[idx].checked = !cl.items[idx].checked;
    saveStore(store);
    console.log(`${cl.items[idx].checked ? "Checked" : "Unchecked"}: ${cl.items[idx].label}`);
    return;
  }

  if (subcommand === "reset") {
    const cl = store.checklists.find((c) => c.name === name);
    if (!cl) {
      console.log(`Checklist "${name}" not found.`);
      return;
    }
    for (const item of cl.items) item.checked = false;
    saveStore(store);
    console.log(`Checklist "${name}" reset.`);
    return;
  }

  if (subcommand === "remove") {
    const before = store.checklists.length;
    store.checklists = store.checklists.filter((c) => c.name !== name);
    saveStore(store);
    console.log(before > store.checklists.length ? `Removed "${name}".` : `"${name}" not found.`);
    return;
  }

  // Default: list
  if (store.checklists.length === 0) {
    console.log("No checklists. Use 'judges review-checklist create' to add one.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.checklists, null, 2));
    return;
  }
  console.log("\nChecklists:");
  for (const cl of store.checklists) {
    const done = cl.items.filter((i) => i.checked).length;
    console.log(`  ${cl.name}: ${done}/${cl.items.length} complete`);
  }
}
