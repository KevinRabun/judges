/**
 * Rule ownership — map rules/categories to team owners for
 * accountability, escalation, and expertise routing.
 *
 * Stored locally in .judges-owners.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuleOwner {
  /** Rule ID or prefix (e.g., "SEC-001" or "SEC") */
  pattern: string;
  /** Owner name or team */
  owner: string;
  /** Contact (email/Slack handle) */
  contact?: string;
  /** Expertise level */
  expertise: "expert" | "familiar" | "learning";
  /** When assigned */
  assignedIso: string;
}

interface OwnerDb {
  owners: RuleOwner[];
}

const OWNER_FILE = ".judges-owners.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = OWNER_FILE): OwnerDb {
  if (!existsSync(file)) return { owners: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: OwnerDb, file = OWNER_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

export function assignOwner(
  pattern: string,
  owner: string,
  opts?: { contact?: string; expertise?: RuleOwner["expertise"] },
): RuleOwner {
  const db = loadDb();
  const existing = db.owners.find((o) => o.pattern === pattern);
  const entry: RuleOwner = {
    pattern,
    owner,
    contact: opts?.contact,
    expertise: opts?.expertise || "familiar",
    assignedIso: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    db.owners.push(entry);
  }
  saveDb(db);
  return entry;
}

export function removeOwner(pattern: string): boolean {
  const db = loadDb();
  const idx = db.owners.findIndex((o) => o.pattern === pattern);
  if (idx < 0) return false;
  db.owners.splice(idx, 1);
  saveDb(db);
  return true;
}

export function findOwner(ruleId: string): RuleOwner | undefined {
  const db = loadDb();
  // Exact match first, then prefix match (longest prefix wins)
  const exact = db.owners.find((o) => o.pattern === ruleId);
  if (exact) return exact;

  let best: RuleOwner | undefined;
  for (const o of db.owners) {
    if (ruleId.startsWith(o.pattern) && (!best || o.pattern.length > best.pattern.length)) {
      best = o;
    }
  }
  return best;
}

export function getOwnerStats(): {
  totalPatterns: number;
  byOwner: Record<string, number>;
  byExpertise: Record<string, number>;
} {
  const db = loadDb();
  const byOwner: Record<string, number> = {};
  const byExpertise: Record<string, number> = {};
  for (const o of db.owners) {
    byOwner[o.owner] = (byOwner[o.owner] || 0) + 1;
    byExpertise[o.expertise] = (byExpertise[o.expertise] || 0) + 1;
  }
  return { totalPatterns: db.owners.length, byOwner, byExpertise };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRuleOwner(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges rule-owner — Map rules to team owners for accountability

Usage:
  judges rule-owner --set SEC --owner "Security Team" --contact "#sec-channel"
  judges rule-owner --set AUTH-003 --owner "Alice" --expertise expert
  judges rule-owner --find SEC-001         Find who owns a rule
  judges rule-owner --list                 List all ownership mappings
  judges rule-owner --remove SEC           Remove ownership
  judges rule-owner --stats                Show ownership statistics

Options:
  --set <pattern>       Rule ID or prefix to assign
  --owner <name>        Owner name or team (required with --set)
  --contact <info>      Contact info (email/Slack)
  --expertise <level>   expert | familiar | learning
  --find <rule-id>      Find owner for a rule
  --remove <pattern>    Remove ownership mapping
  --list                List all mappings
  --stats               Show statistics
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Set ownership
  const setPattern = argv.find((_a: string, i: number) => argv[i - 1] === "--set");
  if (setPattern) {
    const owner = argv.find((_a: string, i: number) => argv[i - 1] === "--owner");
    if (!owner) {
      console.error("Error: --owner required with --set");
      process.exit(1);
    }
    const contact = argv.find((_a: string, i: number) => argv[i - 1] === "--contact");
    const expertise = argv.find((_a: string, i: number) => argv[i - 1] === "--expertise") as
      | RuleOwner["expertise"]
      | undefined;
    const entry = assignOwner(setPattern, owner, { contact, expertise });
    if (format === "json") {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(`  ✅ ${entry.pattern} → ${entry.owner} (${entry.expertise})`);
    }
    return;
  }

  // Find owner
  const findRule = argv.find((_a: string, i: number) => argv[i - 1] === "--find");
  if (findRule) {
    const owner = findOwner(findRule);
    if (!owner) {
      console.log(`  No owner found for ${findRule}`);
    } else if (format === "json") {
      console.log(JSON.stringify(owner, null, 2));
    } else {
      console.log(`  ${findRule} → ${owner.owner} (${owner.expertise})${owner.contact ? ` — ${owner.contact}` : ""}`);
    }
    return;
  }

  // Remove
  const removePattern = argv.find((_a: string, i: number) => argv[i - 1] === "--remove");
  if (removePattern) {
    if (removeOwner(removePattern)) {
      console.log(`  Removed: ${removePattern}`);
    } else {
      console.error(`  Not found: ${removePattern}`);
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const s = getOwnerStats();
    if (format === "json") {
      console.log(JSON.stringify(s, null, 2));
    } else {
      console.log(`\n  Rule Ownership\n  ──────────────`);
      console.log(`  Total mappings: ${s.totalPatterns}\n`);
      console.log("  By owner:");
      for (const [name, count] of Object.entries(s.byOwner)) {
        console.log(`    ${name.padEnd(20)} ${count} rule(s)`);
      }
      console.log("\n  By expertise:");
      for (const [level, count] of Object.entries(s.byExpertise)) {
        console.log(`    ${level.padEnd(12)} ${count}`);
      }
      console.log("");
    }
    return;
  }

  // Default: list all
  const db = loadDb();
  if (db.owners.length === 0) {
    console.log("\n  No ownership mappings. Use --set to add one.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(db.owners, null, 2));
  } else {
    console.log("\n  Rule Ownership Mappings\n  ──────────────────────");
    for (const o of db.owners) {
      console.log(`    ${o.pattern.padEnd(15)} → ${o.owner} (${o.expertise})${o.contact ? ` — ${o.contact}` : ""}`);
    }
    console.log("");
  }
}
