/**
 * Finding-resolution-tracker — Track finding resolution status over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ResolutionEntry {
  ruleId: string;
  title: string;
  status: "open" | "resolved" | "wont-fix" | "false-positive";
  firstSeen: string;
  lastSeen: string;
  resolvedAt?: string;
}

interface ResolutionLog {
  version: number;
  entries: ResolutionEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadLog(logPath: string): ResolutionLog {
  if (!existsSync(logPath)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(logPath, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

function saveLog(logPath: string, log: ResolutionLog): void {
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(logPath, JSON.stringify(log, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingResolutionTracker(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const logIdx = argv.indexOf("--log");
  const fileIdx = argv.indexOf("--file");
  const ruleIdx = argv.indexOf("--rule");
  const statusIdx = argv.indexOf("--status");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "list";
  const logPath = logIdx >= 0 ? argv[logIdx + 1] : ".judges-resolutions.json";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const ruleId = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const newStatus = statusIdx >= 0 ? argv[statusIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-resolution-tracker — Track finding resolutions

Usage:
  judges finding-resolution-tracker --action <action> [options]

Actions:
  list       List resolution entries (default)
  sync       Sync with verdict file (updates open/resolved)
  update     Update status of a specific rule
  summary    Show resolution summary

Options:
  --action <act>     Action: list, sync, update, summary
  --log <path>       Resolution log (default: .judges-resolutions.json)
  --file <path>      Verdict JSON file (for sync)
  --rule <id>        Rule ID (for update)
  --status <s>       New status: resolved, wont-fix, false-positive (for update)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const log = loadLog(logPath);
  const now = new Date().toISOString();

  if (action === "sync") {
    if (!filePath || !existsSync(filePath)) {
      console.error("Error: --file required for sync");
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

    const currentRules = new Set(verdict.findings.map((f) => f.ruleId));

    // mark resolved if no longer in findings
    for (const entry of log.entries) {
      if (entry.status === "open" && !currentRules.has(entry.ruleId)) {
        entry.status = "resolved";
        entry.resolvedAt = now;
      }
    }

    // add new findings
    for (const f of verdict.findings) {
      const existing = log.entries.find((e) => e.ruleId === f.ruleId);
      if (existing) {
        existing.lastSeen = now;
        if (existing.status === "resolved") {
          existing.status = "open";
          existing.resolvedAt = undefined;
        }
      } else {
        log.entries.push({
          ruleId: f.ruleId,
          title: f.title,
          status: "open",
          firstSeen: now,
          lastSeen: now,
        });
      }
    }

    saveLog(logPath, log);
    console.log(`Synced ${verdict.findings.length} findings. Log: ${logPath}`);
    return;
  }

  if (action === "update") {
    if (!ruleId || !newStatus) {
      console.error("Error: --rule and --status required for update");
      process.exitCode = 1;
      return;
    }
    const entry = log.entries.find((e) => e.ruleId === ruleId);
    if (!entry) {
      console.error(`Error: entry not found: ${ruleId}`);
      process.exitCode = 1;
      return;
    }
    entry.status = newStatus as ResolutionEntry["status"];
    if (newStatus === "resolved") entry.resolvedAt = now;
    saveLog(logPath, log);
    console.log(`Updated ${ruleId} → ${newStatus}`);
    return;
  }

  if (action === "summary") {
    const counts = { open: 0, resolved: 0, "wont-fix": 0, "false-positive": 0 };
    for (const e of log.entries) {
      counts[e.status]++;
    }

    if (format === "json") {
      console.log(JSON.stringify(counts, null, 2));
      return;
    }

    console.log(`\nResolution Summary`);
    console.log("═".repeat(40));
    for (const [status, count] of Object.entries(counts)) {
      console.log(`  ${status.padEnd(20)} ${count}`);
    }
    console.log(`  ${"total".padEnd(20)} ${log.entries.length}`);
    console.log("═".repeat(40));
    return;
  }

  // list
  if (format === "json") {
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  console.log(`\nResolution Tracker (${log.entries.length} entries)`);
  console.log("═".repeat(75));
  console.log(`${"Rule".padEnd(22)} ${"Status".padEnd(16)} ${"First Seen".padEnd(22)} Last Seen`);
  console.log("─".repeat(75));

  for (const e of log.entries) {
    const rule = e.ruleId.length > 20 ? e.ruleId.slice(0, 20) + "…" : e.ruleId;
    console.log(
      `${rule.padEnd(22)} ${e.status.padEnd(16)} ${e.firstSeen.slice(0, 19).padEnd(22)} ${e.lastSeen.slice(0, 19)}`,
    );
  }
  console.log("═".repeat(75));
}
