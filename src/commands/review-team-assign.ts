/**
 * Review-team-assign — Assign findings to team members.
 *
 * Manages team member assignments for findings based on
 * expertise areas, load balancing, or manual assignment.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamMember {
  name: string;
  expertise: string[];
  assignedCount: number;
}

interface Assignment {
  ruleId: string;
  title: string;
  severity: string;
  assignee: string;
  assignedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function teamFile(): string {
  return join(process.cwd(), ".judges", "team-config.json");
}

function assignmentFile(): string {
  return join(process.cwd(), ".judges", "team-assignments.json");
}

function loadTeam(): TeamMember[] {
  const f = teamFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveTeam(team: TeamMember[]): void {
  const f = teamFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(team, null, 2));
}

function loadAssignments(): Assignment[] {
  const f = assignmentFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveAssignments(assignments: Assignment[]): void {
  const f = assignmentFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(assignments, null, 2));
}

function assignByExpertise(team: TeamMember[], ruleId: string): TeamMember | null {
  const rulePrefix = ruleId.split("/")[0].toLowerCase();
  // Find member with matching expertise (prefer least loaded)
  const candidates = team
    .filter((m) =>
      m.expertise.some((e) => rulePrefix.includes(e.toLowerCase()) || e.toLowerCase().includes(rulePrefix)),
    )
    .sort((a, b) => a.assignedCount - b.assignedCount);
  if (candidates.length > 0) return candidates[0];
  // Fall back to least loaded member
  const sorted = [...team].sort((a, b) => a.assignedCount - b.assignedCount);
  return sorted.length > 0 ? sorted[0] : null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTeamAssign(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-team-assign — Assign findings to team members

Usage:
  judges review-team-assign add-member --name <name> [--expertise <areas>]
  judges review-team-assign remove-member --name <name>
  judges review-team-assign list-team
  judges review-team-assign auto-assign --file <verdict.json>
  judges review-team-assign show-assignments [--format table|json]
  judges review-team-assign clear

Options:
  --name <name>         Team member name
  --expertise <areas>   Comma-separated expertise areas
  --file <path>         Verdict JSON file for auto-assignment
  --format <fmt>        Output format: table (default), json
  --help, -h            Show this help
`);
    return;
  }

  const args = argv.slice(1);

  if (sub === "add-member") {
    const nameIdx = args.indexOf("--name");
    const expIdx = args.indexOf("--expertise");
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const expertise = expIdx >= 0 ? args[expIdx + 1].split(",") : [];
    const team = loadTeam();
    if (team.some((m) => m.name === name)) {
      console.log(`Member already exists: ${name}`);
      return;
    }
    team.push({ name, expertise, assignedCount: 0 });
    saveTeam(team);
    console.log(`Added team member: ${name} (expertise: ${expertise.join(", ") || "general"})`);
  } else if (sub === "remove-member") {
    const nameIdx = args.indexOf("--name");
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const team = loadTeam().filter((m) => m.name !== name);
    saveTeam(team);
    console.log(`Removed: ${name}`);
  } else if (sub === "list-team") {
    const team = loadTeam();
    if (team.length === 0) {
      console.log("No team members configured.");
      return;
    }
    console.log(`\nTeam (${team.length} members)`);
    console.log("═".repeat(50));
    for (const m of team) {
      console.log(`  ${m.name} — expertise: ${m.expertise.join(", ") || "general"} (${m.assignedCount} assigned)`);
    }
    console.log("═".repeat(50));
  } else if (sub === "auto-assign") {
    const fileIdx = args.indexOf("--file");
    const filePath = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    const team = loadTeam();
    if (team.length === 0) {
      console.error("Error: no team members. Use add-member first.");
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }

    const assignments = loadAssignments();
    let newCount = 0;
    for (const f of verdict.findings) {
      const member = assignByExpertise(team, f.ruleId);
      if (member) {
        assignments.push({
          ruleId: f.ruleId,
          title: f.title,
          severity: f.severity || "medium",
          assignee: member.name,
          assignedAt: new Date().toISOString(),
        });
        member.assignedCount++;
        newCount++;
      }
    }
    saveAssignments(assignments);
    saveTeam(team);
    console.log(`Auto-assigned ${newCount} findings to ${team.length} team members.`);
  } else if (sub === "show-assignments") {
    const formatIdx = args.indexOf("--format");
    const format = formatIdx >= 0 ? args[formatIdx + 1] : "table";
    const assignments = loadAssignments();
    if (assignments.length === 0) {
      console.log("No assignments.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(assignments, null, 2));
      return;
    }

    console.log(`\nAssignments (${assignments.length})`);
    console.log("═".repeat(70));
    console.log(`${"Assignee".padEnd(20)} ${"Severity".padEnd(10)} Title`);
    console.log("─".repeat(70));
    for (const a of assignments) {
      const title = a.title.length > 35 ? a.title.slice(0, 35) + "…" : a.title;
      console.log(`${a.assignee.padEnd(20)} ${a.severity.padEnd(10)} ${title}`);
    }
    console.log("═".repeat(70));
  } else if (sub === "clear") {
    saveAssignments([]);
    console.log("Assignments cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
