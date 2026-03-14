/**
 * Finding-category — Categorize findings into custom groups.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryMapping {
  ruleId: string;
  category: string;
}

interface CategoryStore {
  version: string;
  mappings: CategoryMapping[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CAT_FILE = ".judges/finding-categories.json";

function loadStore(): CategoryStore {
  if (!existsSync(CAT_FILE)) return { version: "1.0.0", mappings: [] };
  try {
    return JSON.parse(readFileSync(CAT_FILE, "utf-8")) as CategoryStore;
  } catch {
    return { version: "1.0.0", mappings: [] };
  }
}

function saveStore(store: CategoryStore): void {
  mkdirSync(dirname(CAT_FILE), { recursive: true });
  writeFileSync(CAT_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCategory(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-category — Categorize findings into custom groups

Usage:
  judges finding-category set --rule SEC-001 --category "auth"
  judges finding-category list
  judges finding-category list --category "auth"
  judges finding-category remove --rule SEC-001
  judges finding-category clear

Subcommands:
  set                   Set category for a rule
  list                  List all mappings
  remove                Remove a mapping
  clear                 Clear all mappings

Options:
  --rule <id>           Rule ID
  --category <name>     Category name
  --format json         JSON output
  --help, -h            Show this help

Mappings stored in .judges/finding-categories.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["set", "list", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "set") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category") || "";
    if (!ruleId || !category) {
      console.log("Specify --rule and --category.");
      return;
    }
    const existing = store.mappings.find((m) => m.ruleId === ruleId);
    if (existing) {
      existing.category = category;
    } else {
      store.mappings.push({ ruleId, category });
    }
    saveStore(store);
    console.log(`${ruleId} → category "${category}"`);
    return;
  }

  if (subcommand === "remove") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const before = store.mappings.length;
    store.mappings = store.mappings.filter((m) => m.ruleId !== ruleId);
    saveStore(store);
    console.log(before > store.mappings.length ? `Removed ${ruleId}.` : `${ruleId} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", mappings: [] });
    console.log("Category mappings cleared.");
    return;
  }

  // Default: list
  const categoryFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--category") || "";
  const mappings = categoryFilter ? store.mappings.filter((m) => m.category === categoryFilter) : store.mappings;

  if (mappings.length === 0) {
    console.log("No category mappings.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(mappings, null, 2));
    return;
  }

  // Group by category
  const groups = new Map<string, string[]>();
  for (const m of mappings) {
    const list = groups.get(m.category) || [];
    list.push(m.ruleId);
    groups.set(m.category, list);
  }

  console.log("\nFinding Categories:");
  console.log("─".repeat(40));
  for (const [cat, rules] of groups) {
    console.log(`  ${cat}: ${rules.join(", ")}`);
  }
  console.log("─".repeat(40));
}
