/**
 * Finding-recurrence-detect — Detect recurring findings across review runs.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecurrenceEntry {
  ruleId: string;
  title: string;
  severity: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRecurrenceDetect(argv: string[]): void {
  const historyIdx = argv.indexOf("--history");
  const historyPath = historyIdx >= 0 ? argv[historyIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minIdx = argv.indexOf("--min-occurrences");
  const minOccurrences = minIdx >= 0 ? parseInt(argv[minIdx + 1], 10) : 2;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-recurrence-detect — Detect recurring findings

Usage:
  judges finding-recurrence-detect --history <path> [--min-occurrences <n>] [--format table|json]

Options:
  --history <path>       Path to history JSON (array of {timestamp, findings})
  --min-occurrences <n>  Minimum occurrences to report (default: 2)
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help

The history file should be an array of objects with "timestamp" and "findings" fields.
`);
    return;
  }

  if (!historyPath || !existsSync(historyPath)) {
    console.error("Provide --history <path> to a valid history JSON file.");
    process.exitCode = 1;
    return;
  }

  const history = JSON.parse(readFileSync(historyPath, "utf-8")) as Array<{
    timestamp: string;
    findings: Finding[];
  }>;

  const ruleMap = new Map<string, RecurrenceEntry>();

  for (const run of history) {
    for (const f of run.findings) {
      const existing = ruleMap.get(f.ruleId);
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeen = run.timestamp;
      } else {
        ruleMap.set(f.ruleId, {
          ruleId: f.ruleId,
          title: f.title,
          severity: f.severity,
          occurrences: 1,
          firstSeen: run.timestamp,
          lastSeen: run.timestamp,
        });
      }
    }
  }

  const recurring = [...ruleMap.values()]
    .filter((e) => e.occurrences >= minOccurrences)
    .sort((a, b) => b.occurrences - a.occurrences);

  if (format === "json") {
    console.log(JSON.stringify(recurring, null, 2));
    return;
  }

  console.log(`\nRecurring Findings (min ${minOccurrences} occurrences)`);
  console.log("═".repeat(80));

  if (recurring.length === 0) {
    console.log("  No recurring findings detected.");
  } else {
    console.log(
      `  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(10)} ${"Count".padEnd(8)} ${"First Seen".padEnd(14)} Last Seen`,
    );
    console.log("  " + "─".repeat(75));

    for (const r of recurring) {
      console.log(
        `  ${r.ruleId.padEnd(25)} ${r.severity.padEnd(10)} ${String(r.occurrences).padEnd(8)} ${r.firstSeen.slice(0, 10).padEnd(14)} ${r.lastSeen.slice(0, 10)}`,
      );
    }
  }

  console.log(`\n  Recurring: ${recurring.length} | Runs analyzed: ${history.length}`);
  console.log("═".repeat(80));
}
