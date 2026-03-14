/**
 * Finding assignment — assign findings to team members for resolution.
 *
 * Uses a local assignment database (.judges-assignments.json) to track
 * who is responsible for fixing each finding, enabling team workflows
 * without requiring an external service.
 */

import { createHash } from "crypto";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Assignment {
  id: string;
  findingRuleId: string;
  findingTitle: string;
  severity: string;
  assignee: string;
  assignedAt: string;
  status: "open" | "in-progress" | "fixed" | "wont-fix";
  resolvedAt?: string;
  notes?: string;
}

export interface AssignmentDb {
  assignments: Assignment[];
  version: string;
}

// ─── Database ───────────────────────────────────────────────────────────────

const DB_FILE = ".judges-assignments.json";

function loadDb(): AssignmentDb {
  const { readFileSync, existsSync } = require("fs");
  if (existsSync(DB_FILE)) {
    try {
      return JSON.parse(readFileSync(DB_FILE, "utf-8"));
    } catch {
      /* corrupt */
    }
  }
  return { assignments: [], version: "1.0" };
}

function saveDb(db: AssignmentDb): void {
  const { writeFileSync } = require("fs");
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export function assignFinding(finding: Finding, assignee: string): Assignment {
  const db = loadDb();
  const assignment: Assignment = {
    id: createHash("sha256")
      .update(finding.ruleId + finding.title + Date.now())
      .digest("hex")
      .slice(0, 10),
    findingRuleId: finding.ruleId,
    findingTitle: finding.title,
    severity: finding.severity,
    assignee,
    assignedAt: new Date().toISOString(),
    status: "open",
  };
  db.assignments.push(assignment);
  saveDb(db);
  return assignment;
}

export function resolveAssignment(id: string, status: "fixed" | "wont-fix"): boolean {
  const db = loadDb();
  const assignment = db.assignments.find((a) => a.id === id);
  if (!assignment) return false;
  assignment.status = status;
  assignment.resolvedAt = new Date().toISOString();
  saveDb(db);
  return true;
}

export function getAssignmentStats(db: AssignmentDb): {
  total: number;
  open: number;
  fixed: number;
  byAssignee: Record<string, { open: number; fixed: number }>;
  bySeverity: Record<string, number>;
} {
  const byAssignee: Record<string, { open: number; fixed: number }> = {};
  const bySeverity: Record<string, number> = {};
  let open = 0;
  let fixed = 0;

  for (const a of db.assignments) {
    if (a.status === "open" || a.status === "in-progress") open++;
    if (a.status === "fixed") fixed++;
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;

    if (!byAssignee[a.assignee]) byAssignee[a.assignee] = { open: 0, fixed: 0 };
    if (a.status === "open" || a.status === "in-progress") byAssignee[a.assignee].open++;
    if (a.status === "fixed") byAssignee[a.assignee].fixed++;
  }

  return { total: db.assignments.length, open, fixed, byAssignee, bySeverity };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAssignFindings(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges assign — Assign findings to team members

Usage:
  judges assign --input results.json --assignee alice   Assign all findings
  judges assign --resolve <id> --status fixed           Resolve an assignment
  judges assign --list                                  Show all assignments
  judges assign --stats                                 Show assignment stats

Options:
  --input <path>        JSON results file to assign findings from
  --assignee <name>     Team member to assign to
  --severity <level>    Only assign findings of this severity+
  --resolve <id>        Resolve an assignment
  --status <status>     Resolution status: fixed, wont-fix
  --list                List all assignments
  --stats               Show assignment statistics
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const { readFileSync, existsSync } = require("fs");

  // Resolve
  const resolveId = argv.find((_a: string, i: number) => argv[i - 1] === "--resolve");
  if (resolveId) {
    const status = (argv.find((_a: string, i: number) => argv[i - 1] === "--status") || "fixed") as
      | "fixed"
      | "wont-fix";
    if (resolveAssignment(resolveId, status)) {
      console.log(`  ✅ Assignment ${resolveId} marked as ${status}`);
    } else {
      console.error(`  Error: assignment ${resolveId} not found`);
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const db = loadDb();
    const stats = getAssignmentStats(db);

    if (format === "json") {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log(`\n  Assignment Statistics\n`);
    console.log(`  Total: ${stats.total} | Open: ${stats.open} | Fixed: ${stats.fixed}\n`);

    console.log("  By Assignee:");
    for (const [name, counts] of Object.entries(stats.byAssignee)) {
      console.log(`    ${name.padEnd(20)} open: ${counts.open}  fixed: ${counts.fixed}`);
    }
    console.log("");
    return;
  }

  // List
  if (argv.includes("--list")) {
    const db = loadDb();
    if (format === "json") {
      console.log(JSON.stringify(db.assignments, null, 2));
      return;
    }

    console.log(`\n  Assignments (${db.assignments.length})\n`);
    for (const a of db.assignments) {
      const status = a.status === "open" ? "🔴" : a.status === "in-progress" ? "🟡" : "✅";
      console.log(
        `    ${status} ${a.id}  ${a.severity.padEnd(8)} ${a.assignee.padEnd(15)} ${a.findingTitle.slice(0, 40)}`,
      );
    }
    console.log("");
    return;
  }

  // Assign
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const assignee = argv.find((_a: string, i: number) => argv[i - 1] === "--assignee");

  if (!inputPath || !assignee) {
    console.error("Error: --input and --assignee required. Use --help for usage.");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const findings: Finding[] = data.evaluations
    ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
    : data.findings || data;

  const severityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  let filtered = findings;
  if (severityFilter) {
    const idx = severityOrder.indexOf(severityFilter);
    if (idx >= 0) {
      const allowed = new Set(severityOrder.slice(0, idx + 1));
      filtered = findings.filter((f) => allowed.has(f.severity));
    }
  }

  let assigned = 0;
  for (const f of filtered) {
    assignFinding(f, assignee);
    assigned++;
  }

  console.log(`  ✅ Assigned ${assigned} findings to ${assignee}`);
}
