/**
 * Finding-ownership-map — Map findings to code owners.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnerMapping {
  pattern: string;
  owner: string;
}

interface OwnershipEntry {
  owner: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  ruleIds: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function parseCodeowners(path: string): OwnerMapping[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const mappings: OwnerMapping[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      mappings.push({ pattern: parts[0], owner: parts[1] });
    }
  }

  return mappings;
}

function mapOwnership(verdict: TribunalVerdict, owners: OwnerMapping[]): OwnershipEntry[] {
  const ownerMap = new Map<string, OwnershipEntry>();
  const defaultOwner = "unassigned";

  for (const f of verdict.findings) {
    // Use ruleId prefix as a rough domain-to-owner mapping
    let assignedOwner = defaultOwner;
    const rulePrefix = f.ruleId.split("-")[0];

    for (const o of owners) {
      if (o.pattern.includes(rulePrefix) || f.ruleId.includes(o.pattern.replace("*", ""))) {
        assignedOwner = o.owner;
        break;
      }
    }

    const existing = ownerMap.get(assignedOwner);
    const sev = (f.severity || "medium").toLowerCase();
    if (existing) {
      existing.findingCount++;
      if (sev === "critical") existing.criticalCount++;
      if (sev === "high") existing.highCount++;
      if (!existing.ruleIds.includes(f.ruleId)) existing.ruleIds.push(f.ruleId);
    } else {
      ownerMap.set(assignedOwner, {
        owner: assignedOwner,
        findingCount: 1,
        criticalCount: sev === "critical" ? 1 : 0,
        highCount: sev === "high" ? 1 : 0,
        ruleIds: [f.ruleId],
      });
    }
  }

  return [...ownerMap.values()].sort((a, b) => b.findingCount - a.findingCount);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingOwnershipMap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const ownersIdx = argv.indexOf("--codeowners");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const ownersPath = ownersIdx >= 0 ? argv[ownersIdx + 1] : "CODEOWNERS";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-ownership-map — Map findings to code owners

Usage:
  judges finding-ownership-map --file <verdict.json> [--codeowners <path>]
                               [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --codeowners <path>  Path to CODEOWNERS file (default: CODEOWNERS)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
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

  const owners = parseCodeowners(ownersPath);
  const entries = mapOwnership(verdict, owners);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nOwnership Map (${entries.length} owners)`);
  console.log("═".repeat(65));
  console.log(`${"Owner".padEnd(22)} ${"Findings".padEnd(10)} ${"Critical".padEnd(10)} ${"High".padEnd(8)} Rules`);
  console.log("─".repeat(65));

  for (const e of entries) {
    const owner = e.owner.length > 20 ? e.owner.slice(0, 20) + "…" : e.owner;
    const ruleStr = e.ruleIds.slice(0, 3).join(", ");
    console.log(
      `${owner.padEnd(22)} ${String(e.findingCount).padEnd(10)} ${String(e.criticalCount).padEnd(10)} ${String(e.highCount).padEnd(8)} ${ruleStr}`,
    );
  }
  console.log("═".repeat(65));
}
