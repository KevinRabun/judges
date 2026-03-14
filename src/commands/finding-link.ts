/**
 * Finding-link — Link related findings across files.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingLink {
  id: string;
  sourceRule: string;
  sourceFile: string;
  targetRule: string;
  targetFile: string;
  relationship: string;
  createdAt: string;
}

interface LinkStore {
  version: string;
  links: FindingLink[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const LINK_FILE = ".judges/finding-links.json";

function loadStore(): LinkStore {
  if (!existsSync(LINK_FILE)) return { version: "1.0.0", links: [] };
  try {
    return JSON.parse(readFileSync(LINK_FILE, "utf-8")) as LinkStore;
  } catch {
    return { version: "1.0.0", links: [] };
  }
}

function saveStore(store: LinkStore): void {
  mkdirSync(dirname(LINK_FILE), { recursive: true });
  writeFileSync(LINK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `lnk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingLink(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-link — Link related findings across files

Usage:
  judges finding-link add --source-rule SEC-001 --source-file a.ts --target-rule SEC-002 --target-file b.ts
  judges finding-link list
  judges finding-link find --rule SEC-001
  judges finding-link remove --id <id>
  judges finding-link clear

Subcommands:
  add                   Create a finding link
  list                  List all links
  find                  Find links for a rule
  remove                Remove a link
  clear                 Clear all links

Options:
  --source-rule <id>    Source finding rule ID
  --source-file <path>  Source file path
  --target-rule <id>    Target finding rule ID
  --target-file <path>  Target file path
  --relationship <text> Relationship type (e.g. "root-cause", "related", "duplicate")
  --rule <id>           Rule to search for in find subcommand
  --format json         JSON output
  --help, -h            Show this help

Links stored in .judges/finding-links.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "find", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const sourceRule = argv.find((_a: string, i: number) => argv[i - 1] === "--source-rule") || "";
    const sourceFile = argv.find((_a: string, i: number) => argv[i - 1] === "--source-file") || "";
    const targetRule = argv.find((_a: string, i: number) => argv[i - 1] === "--target-rule") || "";
    const targetFile = argv.find((_a: string, i: number) => argv[i - 1] === "--target-file") || "";
    const relationship = argv.find((_a: string, i: number) => argv[i - 1] === "--relationship") || "related";

    const link: FindingLink = {
      id: generateId(),
      sourceRule,
      sourceFile,
      targetRule,
      targetFile,
      relationship,
      createdAt: new Date().toISOString(),
    };
    store.links.push(link);
    saveStore(store);
    console.log(`Linked ${sourceRule} (${sourceFile}) → ${targetRule} (${targetFile}) [${relationship}]`);
    return;
  }

  if (subcommand === "find") {
    const rule = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const matches = store.links.filter((l) => l.sourceRule === rule || l.targetRule === rule);
    if (matches.length === 0) {
      console.log(`No links found for rule ${rule}.`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(matches, null, 2));
      return;
    }
    console.log(`\nLinks for ${rule}:`);
    for (const m of matches) {
      console.log(
        `  ${m.id}  ${m.sourceRule}(${m.sourceFile}) → ${m.targetRule}(${m.targetFile})  [${m.relationship}]`,
      );
    }
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.links.length;
    store.links = store.links.filter((l) => l.id !== id);
    saveStore(store);
    console.log(before > store.links.length ? `Removed ${id}.` : `${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", links: [] });
    console.log("Finding links cleared.");
    return;
  }

  // Default: list
  if (store.links.length === 0) {
    console.log("No finding links. Use 'judges finding-link add' to create one.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.links, null, 2));
    return;
  }
  console.log("\nFinding Links:");
  console.log("─".repeat(70));
  for (const l of store.links) {
    console.log(`  ${l.id}  ${l.sourceRule}(${l.sourceFile}) → ${l.targetRule}(${l.targetFile})  [${l.relationship}]`);
  }
  console.log("─".repeat(70));
  console.log(`${store.links.length} link(s).`);
}
