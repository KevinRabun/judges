/**
 * Team knowledge base — store team decisions about rules, exceptions,
 * known patterns, and contextual knowledge that informs evaluations.
 *
 * Stored locally in .judges-kb.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KbEntry {
  id: string;
  /** Rule ID or prefix this applies to */
  rulePattern: string;
  /** Decision type */
  decision: "not-applicable" | "accepted-risk" | "deferred" | "exception" | "custom-guidance";
  /** Why the team made this decision */
  reason: string;
  /** Who approved this decision */
  approvedBy: string;
  /** When this decision was made */
  createdIso: string;
  /** Optional expiry date for temporary exceptions */
  expiresIso?: string;
  /** Scope (e.g., file glob or project area) */
  scope?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Active or archived */
  active: boolean;
}

interface KbDb {
  entries: KbEntry[];
}

const KB_FILE = ".judges-kb.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = KB_FILE): KbDb {
  if (!existsSync(file)) return { entries: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: KbDb, file = KB_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function genId(): string {
  return `kb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function addKbEntry(opts: {
  rulePattern: string;
  decision: KbEntry["decision"];
  reason: string;
  approvedBy: string;
  scope?: string;
  tags?: string[];
  expiresIn?: number; // days
}): KbEntry {
  const db = loadDb();
  const entry: KbEntry = {
    id: genId(),
    rulePattern: opts.rulePattern,
    decision: opts.decision,
    reason: opts.reason,
    approvedBy: opts.approvedBy,
    createdIso: new Date().toISOString(),
    scope: opts.scope,
    tags: opts.tags,
    active: true,
  };
  if (opts.expiresIn) {
    const exp = new Date();
    exp.setDate(exp.getDate() + opts.expiresIn);
    entry.expiresIso = exp.toISOString();
  }
  db.entries.push(entry);
  saveDb(db);
  return entry;
}

export function archiveKbEntry(id: string): boolean {
  const db = loadDb();
  const entry = db.entries.find((e) => e.id === id);
  if (!entry) return false;
  entry.active = false;
  saveDb(db);
  return true;
}

export function searchKb(query: string): KbEntry[] {
  const db = loadDb();
  const q = query.toLowerCase();
  return db.entries.filter(
    (e) =>
      e.active &&
      (e.rulePattern.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q) ||
        e.decision.includes(q) ||
        e.tags?.some((t) => t.toLowerCase().includes(q))),
  );
}

export function getApplicableEntries(ruleId: string): KbEntry[] {
  const db = loadDb();
  const now = Date.now();
  return db.entries.filter((e) => {
    if (!e.active) return false;
    if (e.expiresIso && new Date(e.expiresIso).getTime() < now) return false;
    return ruleId === e.rulePattern || ruleId.startsWith(e.rulePattern);
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runKnowledgeBase(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges kb — Team knowledge base for rule decisions and exceptions

Usage:
  judges kb --add --rule AUTH-003 --decision not-applicable --reason "Stateless microservices" --approved-by "Team Lead"
  judges kb --search AUTH               Search knowledge base
  judges kb --check SEC-001             Check if rule has KB entries
  judges kb --list                      List all active entries
  judges kb --archive <id>              Archive an entry
  judges kb --stats                     Show KB statistics

Options:
  --add                 Add new KB entry
  --rule <pattern>      Rule ID or prefix
  --decision <type>     not-applicable | accepted-risk | deferred | exception | custom-guidance
  --reason <text>       Reason for decision
  --approved-by <name>  Who approved
  --scope <glob>        File scope
  --tags <list>         Comma-separated tags
  --expires-in <days>   Auto-expire after N days
  --search <query>      Search KB
  --check <rule-id>     Check for KB entries on a rule
  --list                List all active entries
  --archive <id>        Archive an entry
  --stats               Show statistics
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Add entry
  if (argv.includes("--add")) {
    const rulePattern = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
    const decision = argv.find((_a: string, i: number) => argv[i - 1] === "--decision") as KbEntry["decision"];
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason");
    const approvedBy =
      argv.find((_a: string, i: number) => argv[i - 1] === "--approved-by") ||
      process.env.USER ||
      process.env.USERNAME ||
      "unknown";
    const scope = argv.find((_a: string, i: number) => argv[i - 1] === "--scope");
    const tagsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--tags");
    const expiresStr = argv.find((_a: string, i: number) => argv[i - 1] === "--expires-in");

    if (!rulePattern || !decision || !reason) {
      console.error("Error: --rule, --decision, and --reason required");
      process.exit(1);
    }

    const entry = addKbEntry({
      rulePattern,
      decision,
      reason,
      approvedBy,
      scope,
      tags: tagsStr ? tagsStr.split(",").map((s) => s.trim()) : undefined,
      expiresIn: expiresStr ? parseInt(expiresStr, 10) : undefined,
    });

    if (format === "json") {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(`  ✅ KB entry created: ${entry.id}`);
      console.log(`     ${entry.rulePattern}: ${entry.decision} — ${entry.reason}`);
    }
    return;
  }

  // Search
  const searchQuery = argv.find((_a: string, i: number) => argv[i - 1] === "--search");
  if (searchQuery) {
    const results = searchKb(searchQuery);
    if (format === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else if (results.length === 0) {
      console.log(`\n  No KB entries matching "${searchQuery}".\n`);
    } else {
      console.log(`\n  ${results.length} KB entry(ies) matching "${searchQuery}"\n  ──────────────────`);
      for (const e of results) {
        console.log(`    ${e.rulePattern.padEnd(15)} ${e.decision.padEnd(18)} ${e.reason}`);
        console.log(`      Approved by ${e.approvedBy} on ${e.createdIso.split("T")[0]}`);
      }
      console.log("");
    }
    return;
  }

  // Check specific rule
  const checkRule = argv.find((_a: string, i: number) => argv[i - 1] === "--check");
  if (checkRule) {
    const entries = getApplicableEntries(checkRule);
    if (format === "json") {
      console.log(JSON.stringify(entries, null, 2));
    } else if (entries.length === 0) {
      console.log(`\n  No KB entries for ${checkRule}.\n`);
    } else {
      console.log(`\n  KB entries for ${checkRule}:`);
      for (const e of entries) {
        console.log(`    ${e.decision}: ${e.reason} (${e.approvedBy})`);
      }
      console.log("");
    }
    return;
  }

  // Archive
  const archiveId = argv.find((_a: string, i: number) => argv[i - 1] === "--archive");
  if (archiveId) {
    if (archiveKbEntry(archiveId)) {
      console.log(`  Archived: ${archiveId}`);
    } else {
      console.error(`  Not found: ${archiveId}`);
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const db = loadDb();
    const active = db.entries.filter((e) => e.active);
    const byDecision: Record<string, number> = {};
    for (const e of active) {
      byDecision[e.decision] = (byDecision[e.decision] || 0) + 1;
    }
    if (format === "json") {
      console.log(JSON.stringify({ total: db.entries.length, active: active.length, byDecision }, null, 2));
    } else {
      console.log(`\n  Knowledge Base\n  ──────────────`);
      console.log(`  Total: ${db.entries.length} (${active.length} active)\n`);
      for (const [d, c] of Object.entries(byDecision)) {
        console.log(`    ${d.padEnd(20)} ${c}`);
      }
      console.log("");
    }
    return;
  }

  // Default: list all
  const db = loadDb();
  const active = db.entries.filter((e) => e.active);
  if (active.length === 0) {
    console.log("\n  Knowledge base is empty. Use --add to create an entry.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(active, null, 2));
  } else {
    console.log(`\n  Team Knowledge Base (${active.length} active)\n  ──────────────────────`);
    for (const e of active) {
      const exp = e.expiresIso ? ` (expires ${e.expiresIso.split("T")[0]})` : "";
      console.log(`    ${e.id}  ${e.rulePattern.padEnd(15)} ${e.decision}${exp}`);
      console.log(`      ${e.reason} — ${e.approvedBy}`);
    }
    console.log("");
  }
}
