/**
 * Finding-suppression-log — Log and track suppressed findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionEntry {
  ruleId: string;
  title: string;
  severity: string;
  suppressedAt: string;
  reason: string;
  suppressedBy: string;
}

interface SuppressionLog {
  version: number;
  entries: SuppressionEntry[];
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOG_PATH = ".judges/suppression-log.json";

function loadLog(): SuppressionLog {
  if (!existsSync(LOG_PATH)) {
    return { version: 1, entries: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(LOG_PATH, "utf-8"));
  } catch {
    return { version: 1, entries: [], lastUpdated: new Date().toISOString() };
  }
}

function saveLog(log: SuppressionLog): void {
  const dir = LOG_PATH.substring(0, LOG_PATH.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  log.lastUpdated = new Date().toISOString();
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSuppressionLog(argv: string[]): void {
  const sub = argv[0];

  if (argv.includes("--help") || argv.includes("-h") || !sub) {
    console.log(`
judges finding-suppression-log — Log suppressed findings

Usage:
  judges finding-suppression-log add --file <verdict.json> --rule <ruleId>
                                  --reason <text> [--by <name>]
  judges finding-suppression-log show [--format table|json]
  judges finding-suppression-log clear [--rule <ruleId>]
  judges finding-suppression-log stats

Subcommands:
  add       Suppress a finding from a verdict file
  show      Show suppression log
  clear     Clear suppressions (all or by rule)
  stats     Show suppression statistics

Options:
  --file <path>      Verdict JSON file (for add)
  --rule <ruleId>    Rule ID to suppress/clear
  --reason <text>    Reason for suppression
  --by <name>        Who suppressed (default: "user")
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const fileIdx = argv.indexOf("--file");
  const ruleIdx = argv.indexOf("--rule");
  const reasonIdx = argv.indexOf("--reason");
  const byIdx = argv.indexOf("--by");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const ruleId = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : "no reason given";
  const by = byIdx >= 0 ? argv[byIdx + 1] : "user";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (sub === "add") {
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!ruleId) {
      console.error("Error: --rule required");
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

    const matching = verdict.findings.filter((f) => f.ruleId === ruleId);
    if (matching.length === 0) {
      console.error(`No findings with rule: ${ruleId}`);
      process.exitCode = 1;
      return;
    }

    const log = loadLog();
    for (const f of matching) {
      log.entries.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity || "medium",
        suppressedAt: new Date().toISOString(),
        reason,
        suppressedBy: by,
      });
    }
    saveLog(log);
    console.log(`Suppressed ${matching.length} finding(s) for rule ${ruleId}`);
    return;
  }

  if (sub === "show") {
    const log = loadLog();
    if (log.entries.length === 0) {
      console.log("No suppressions logged.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(log, null, 2));
      return;
    }

    console.log(`\nSuppression Log (${log.entries.length} entries)`);
    console.log("═".repeat(70));
    console.log(`${"Rule".padEnd(25)} ${"Severity".padEnd(10)} ${"By".padEnd(10)} Date`);
    console.log("─".repeat(70));

    for (const e of log.entries) {
      console.log(
        `${e.ruleId.padEnd(25)} ${e.severity.padEnd(10)} ${e.suppressedBy.padEnd(10)} ${e.suppressedAt.slice(0, 10)}`,
      );
      console.log(`  Reason: ${e.reason}`);
    }
    console.log("═".repeat(70));
    return;
  }

  if (sub === "clear") {
    const log = loadLog();
    if (ruleId) {
      const before = log.entries.length;
      log.entries = log.entries.filter((e) => e.ruleId !== ruleId);
      saveLog(log);
      console.log(`Cleared ${before - log.entries.length} suppression(s) for ${ruleId}`);
    } else {
      log.entries = [];
      saveLog(log);
      console.log("Cleared all suppressions.");
    }
    return;
  }

  if (sub === "stats") {
    const log = loadLog();
    if (log.entries.length === 0) {
      console.log("No suppressions logged.");
      return;
    }

    const byRule = new Map<string, number>();
    const bySev = new Map<string, number>();

    for (const e of log.entries) {
      byRule.set(e.ruleId, (byRule.get(e.ruleId) || 0) + 1);
      bySev.set(e.severity, (bySev.get(e.severity) || 0) + 1);
    }

    console.log(`\nSuppression Stats (${log.entries.length} total)`);
    console.log("═".repeat(40));
    console.log("By severity:");
    for (const [sev, count] of bySev) {
      console.log(`  ${sev}: ${count}`);
    }
    console.log("\nBy rule:");
    for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rule}: ${count}`);
    }
    console.log("═".repeat(40));
    return;
  }

  console.error(`Error: unknown subcommand: ${sub}`);
  process.exitCode = 1;
}
