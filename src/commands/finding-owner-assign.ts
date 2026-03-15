/**
 * Finding-owner-assign — Assign ownership of findings based on configurable rules.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnerRule {
  pattern: string;
  owner: string;
}

interface OwnerAssignment {
  ruleId: string;
  title: string;
  severity: string;
  owner: string;
  matchedPattern: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadOwnerRules(configPath: string): OwnerRule[] {
  if (!existsSync(configPath)) return [];
  try {
    const data = JSON.parse(readFileSync(configPath, "utf-8"));
    if (Array.isArray(data.rules)) {
      return data.rules as OwnerRule[];
    }
    return [];
  } catch {
    return [];
  }
}

function assignOwners(verdict: TribunalVerdict, rules: OwnerRule[]): OwnerAssignment[] {
  const assignments: OwnerAssignment[] = [];

  for (const f of verdict.findings) {
    let owner = "unassigned";
    let matchedPattern = "";

    for (const rule of rules) {
      const ruleIdLower = f.ruleId.toLowerCase();
      const titleLower = f.title.toLowerCase();
      const patLower = rule.pattern.toLowerCase();

      if (ruleIdLower.includes(patLower) || titleLower.includes(patLower)) {
        owner = rule.owner;
        matchedPattern = rule.pattern;
        break;
      }
    }

    // fallback: assign by severity
    if (owner === "unassigned") {
      const sev = (f.severity || "medium").toLowerCase();
      if (sev === "critical" || sev === "high") {
        owner = "security-team";
        matchedPattern = `severity:${sev}`;
      }
    }

    assignments.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      owner,
      matchedPattern,
    });
  }

  return assignments;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingOwnerAssign(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const configIdx = argv.indexOf("--config");
  const formatIdx = argv.indexOf("--format");
  const outIdx = argv.indexOf("--output");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-owners.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const outputPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-owner-assign — Assign finding owners

Usage:
  judges finding-owner-assign --file <verdict.json> [--config <owners.json>]
                              [--format table|json] [--output <file>]

Options:
  --file <path>      Path to verdict JSON file (required)
  --config <path>    Owner rules config (default: .judges-owners.json)
  --format <fmt>     Output format: table (default), json
  --output <path>    Write assignments to file
  --help, -h         Show this help

Config format:
  { "rules": [{ "pattern": "AUTH", "owner": "security-team" }] }
`);
    return;
  }

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

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const rules = loadOwnerRules(configPath);
  const assignments = assignOwners(verdict, rules);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(assignments, null, 2));
    console.log(`Wrote ${assignments.length} assignments to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(assignments, null, 2));
    return;
  }

  // group by owner
  const byOwner = new Map<string, OwnerAssignment[]>();
  for (const a of assignments) {
    const arr = byOwner.get(a.owner) || [];
    arr.push(a);
    byOwner.set(a.owner, arr);
  }

  console.log(`\nFinding Owner Assignments (${assignments.length} findings)`);
  console.log("═".repeat(75));

  for (const [owner, items] of byOwner) {
    console.log(`\n  Owner: ${owner} (${items.length} findings)`);
    console.log("  " + "─".repeat(70));
    console.log(`  ${"Rule".padEnd(20)} ${"Severity".padEnd(10)} Title`);

    for (const a of items) {
      const rule = a.ruleId.length > 18 ? a.ruleId.slice(0, 18) + "…" : a.ruleId;
      const title = a.title.length > 35 ? a.title.slice(0, 35) + "…" : a.title;
      console.log(`  ${rule.padEnd(20)} ${a.severity.padEnd(10)} ${title}`);
    }
  }
  console.log("\n" + "═".repeat(75));
}
