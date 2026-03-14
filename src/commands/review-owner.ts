/**
 * Review-owner — Assign review ownership to team members.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnerAssignment {
  id: string;
  path: string;
  owner: string;
  assignedAt: string;
}

interface OwnerStore {
  version: string;
  assignments: OwnerAssignment[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const OWNER_FILE = ".judges/review-owners.json";

function loadStore(): OwnerStore {
  if (!existsSync(OWNER_FILE)) return { version: "1.0.0", assignments: [] };
  try {
    return JSON.parse(readFileSync(OWNER_FILE, "utf-8")) as OwnerStore;
  } catch {
    return { version: "1.0.0", assignments: [] };
  }
}

function saveStore(store: OwnerStore): void {
  mkdirSync(dirname(OWNER_FILE), { recursive: true });
  writeFileSync(OWNER_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOwner(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-owner — Assign review ownership to team members

Usage:
  judges review-owner assign --path src/auth --owner alice
  judges review-owner list
  judges review-owner check --path src/auth/login.ts
  judges review-owner remove --id <id>
  judges review-owner clear

Subcommands:
  assign                Assign an owner to a path
  list                  List all assignments
  check                 Check who owns a path
  remove                Remove an assignment
  clear                 Clear all assignments

Options:
  --path <path>         File or directory path
  --owner <name>        Owner name
  --format json         JSON output
  --help, -h            Show this help

Ownership stored in .judges/review-owners.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["assign", "list", "check", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "assign") {
    const path = argv.find((_a: string, i: number) => argv[i - 1] === "--path") || "";
    const owner = argv.find((_a: string, i: number) => argv[i - 1] === "--owner") || "";

    if (!path || !owner) {
      console.log("Specify --path and --owner.");
      return;
    }

    // Update existing or add new
    const existing = store.assignments.find((a) => a.path === path);
    if (existing) {
      existing.owner = owner;
      existing.assignedAt = new Date().toISOString();
    } else {
      store.assignments.push({ id: generateId(), path, owner, assignedAt: new Date().toISOString() });
    }
    saveStore(store);
    console.log(`Assigned ${path} → ${owner}`);
    return;
  }

  if (subcommand === "check") {
    const path = argv.find((_a: string, i: number) => argv[i - 1] === "--path") || "";
    if (!path) {
      console.log("Specify --path.");
      return;
    }

    // Find best match (longest matching prefix)
    let bestMatch: OwnerAssignment | null = null;
    for (const a of store.assignments) {
      if (path.startsWith(a.path)) {
        if (!bestMatch || a.path.length > bestMatch.path.length) {
          bestMatch = a;
        }
      }
    }

    if (bestMatch) {
      console.log(`Owner of ${path}: ${bestMatch.owner} (via ${bestMatch.path})`);
    } else {
      console.log(`No owner assigned for ${path}.`);
    }
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.assignments.length;
    store.assignments = store.assignments.filter((a) => a.id !== id);
    saveStore(store);
    console.log(before > store.assignments.length ? `Removed ${id}.` : `${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", assignments: [] });
    console.log("Ownership assignments cleared.");
    return;
  }

  // Default: list
  if (store.assignments.length === 0) {
    console.log("No ownership assignments. Use 'judges review-owner assign' to add one.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(store.assignments, null, 2));
    return;
  }
  console.log(`\nReview Ownership (${store.assignments.length}):`);
  console.log("─".repeat(50));
  for (const a of store.assignments) {
    console.log(`  ${a.path} → ${a.owner}`);
  }
  console.log("─".repeat(50));
}
