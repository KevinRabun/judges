/**
 * Finding-false-positive-log — Log and track false positive findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FalsePositiveEntry {
  ruleId: string;
  title: string;
  reason: string;
  reportedAt: string;
  reportedBy: string;
}

interface FalsePositiveLog {
  version: number;
  entries: FalsePositiveEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadLog(logPath: string): FalsePositiveLog {
  if (!existsSync(logPath)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(logPath, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

function saveLog(logPath: string, log: FalsePositiveLog): void {
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(logPath, JSON.stringify(log, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFalsePositiveLog(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const logIdx = argv.indexOf("--log");
  const ruleIdx = argv.indexOf("--rule");
  const reasonIdx = argv.indexOf("--reason");
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const logPath = logIdx >= 0 ? argv[logIdx + 1] : ".judges-fp-log.json";
  const ruleId = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : "false positive";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-false-positive-log — Track false positives

Usage:
  judges finding-false-positive-log --action <action> [options]

Actions:
  list       List false positive entries (default)
  add        Add a false positive entry
  check      Check verdict for known false positives
  remove     Remove a false positive entry

Options:
  --action <act>     Action: list, add, check, remove
  --log <path>       Log file (default: .judges-fp-log.json)
  --rule <id>        Rule ID (for add/remove)
  --reason <text>    Reason for false positive (for add)
  --file <path>      Verdict JSON file (for check)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const log = loadLog(logPath);

  if (action === "add") {
    if (!ruleId) {
      console.error("Error: --rule required for add");
      process.exitCode = 1;
      return;
    }
    log.entries.push({
      ruleId,
      title: `FP: ${ruleId}`,
      reason,
      reportedAt: new Date().toISOString(),
      reportedBy: "local",
    });
    saveLog(logPath, log);
    console.log(`Added false positive: ${ruleId}`);
    return;
  }

  if (action === "remove") {
    if (!ruleId) {
      console.error("Error: --rule required for remove");
      process.exitCode = 1;
      return;
    }
    const idx = log.entries.findIndex((e) => e.ruleId === ruleId);
    if (idx < 0) {
      console.error(`Error: entry not found: ${ruleId}`);
      process.exitCode = 1;
      return;
    }
    log.entries.splice(idx, 1);
    saveLog(logPath, log);
    console.log(`Removed false positive: ${ruleId}`);
    return;
  }

  if (action === "check") {
    if (!filePath || !existsSync(filePath)) {
      console.error("Error: --file required for check");
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

    const fpRules = new Set(log.entries.map((e) => e.ruleId));
    const matched = verdict.findings.filter((f) => fpRules.has(f.ruleId));
    const clean = verdict.findings.filter((f) => !fpRules.has(f.ruleId));

    if (format === "json") {
      console.log(JSON.stringify({ falsePositives: matched.length, remaining: clean.length }, null, 2));
      return;
    }

    console.log(`\nFalse Positive Check`);
    console.log("═".repeat(55));
    console.log(`  Total findings: ${verdict.findings.length}`);
    console.log(`  Known FPs:      ${matched.length}`);
    console.log(`  Remaining:      ${clean.length}`);
    if (matched.length > 0) {
      console.log("─".repeat(55));
      console.log("  Matched FP rules:");
      for (const f of matched) {
        console.log(`    ${f.ruleId.padEnd(20)} ${f.title}`);
      }
    }
    console.log("═".repeat(55));
    return;
  }

  // default: list
  if (format === "json") {
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  console.log(`\nFalse Positive Log (${log.entries.length} entries)`);
  console.log("═".repeat(70));
  console.log(`${"Rule".padEnd(20)} ${"Reason".padEnd(25)} ${"Reported".padEnd(22)}`);
  console.log("─".repeat(70));

  for (const e of log.entries) {
    const rule = e.ruleId.length > 18 ? e.ruleId.slice(0, 18) + "…" : e.ruleId;
    const rsn = e.reason.length > 23 ? e.reason.slice(0, 23) + "…" : e.reason;
    console.log(`${rule.padEnd(20)} ${rsn.padEnd(25)} ${e.reportedAt.slice(0, 19).padEnd(22)}`);
  }
  console.log("═".repeat(70));
}
