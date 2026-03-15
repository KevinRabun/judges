/**
 * Finding-suppression-list — Manage finding suppression lists.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionEntry {
  ruleId: string;
  reason: string;
  addedAt: string;
  expiresAt?: string;
}

interface SuppressionList {
  version: number;
  entries: SuppressionEntry[];
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function loadSuppressions(path: string): SuppressionList {
  if (!existsSync(path)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

function applySuppressions(verdict: TribunalVerdict, suppressions: SuppressionList) {
  const now = new Date().toISOString();
  const activeRules = new Set(
    suppressions.entries.filter((e) => !e.expiresAt || e.expiresAt > now).map((e) => e.ruleId),
  );

  const suppressed = verdict.findings.filter((f) => activeRules.has(f.ruleId));
  const remaining = verdict.findings.filter((f) => !activeRules.has(f.ruleId));

  return { suppressed, remaining, activeRules: [...activeRules] };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSuppressionList(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const listIdx = argv.indexOf("--list");
  const addIdx = argv.indexOf("--add");
  const reasonIdx = argv.indexOf("--reason");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const listPath = listIdx >= 0 ? argv[listIdx + 1] : ".judges-suppressions.json";
  const addRule = addIdx >= 0 ? argv[addIdx + 1] : undefined;
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : "manual suppression";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-suppression-list — Manage finding suppressions

Usage:
  judges finding-suppression-list --file <verdict.json> [--list <path>]
                                  [--add <ruleId>] [--reason <text>]
                                  [--format table|json]

Options:
  --file <path>      Path to verdict JSON file
  --list <path>      Suppression list file (default: .judges-suppressions.json)
  --add <ruleId>     Add rule to suppression list
  --reason <text>    Reason for suppression (used with --add)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const suppressions = loadSuppressions(listPath);

  // Add mode
  if (addRule) {
    const existing = suppressions.entries.find((e) => e.ruleId === addRule);
    if (existing) {
      console.log(`Rule ${addRule} already suppressed`);
      return;
    }
    suppressions.entries.push({
      ruleId: addRule,
      reason,
      addedAt: new Date().toISOString(),
    });
    writeFileSync(listPath, JSON.stringify(suppressions, null, 2));
    console.log(`Added ${addRule} to suppression list`);
    return;
  }

  // Apply mode (requires --file)
  if (filePath) {
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

    const result = applySuppressions(verdict, suppressions);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\nSuppression Results`);
    console.log("═".repeat(55));
    console.log(`  Active rules:    ${result.activeRules.length}`);
    console.log(`  Suppressed:      ${result.suppressed.length} findings`);
    console.log(`  Remaining:       ${result.remaining.length} findings`);
    if (result.suppressed.length > 0) {
      console.log(`\n  Suppressed findings:`);
      for (const f of result.suppressed.slice(0, 10)) {
        console.log(`    - ${f.ruleId}: ${f.title}`);
      }
    }
    console.log("═".repeat(55));
    return;
  }

  // List mode
  if (format === "json") {
    console.log(JSON.stringify(suppressions, null, 2));
    return;
  }

  console.log(`\nSuppression List (${suppressions.entries.length} entries)`);
  console.log("═".repeat(60));
  for (const e of suppressions.entries) {
    const expires = e.expiresAt ? ` (expires: ${e.expiresAt.slice(0, 10)})` : "";
    console.log(`  ${e.ruleId} — ${e.reason}${expires}`);
  }
  console.log("═".repeat(60));
}
