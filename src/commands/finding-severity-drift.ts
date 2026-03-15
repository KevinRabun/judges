/**
 * Finding-severity-drift — Detect severity changes across review runs.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DriftEntry {
  ruleId: string;
  title: string;
  previousSeverity: string;
  currentSeverity: string;
  direction: "escalated" | "de-escalated" | "unchanged";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function detectDrift(previous: Finding[], current: Finding[]): DriftEntry[] {
  const prevMap = new Map<string, Finding>();
  for (const f of previous) {
    prevMap.set(f.ruleId, f);
  }

  const results: DriftEntry[] = [];
  for (const f of current) {
    const prev = prevMap.get(f.ruleId);
    if (prev) {
      const prevOrder = SEVERITY_ORDER[prev.severity] ?? 0;
      const currOrder = SEVERITY_ORDER[f.severity] ?? 0;
      const direction = currOrder > prevOrder ? "escalated" : currOrder < prevOrder ? "de-escalated" : "unchanged";
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        previousSeverity: prev.severity,
        currentSeverity: f.severity,
        direction,
      });
    }
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityDrift(argv: string[]): void {
  const prevIdx = argv.indexOf("--previous");
  const prevPath = prevIdx >= 0 ? argv[prevIdx + 1] : "";
  const currIdx = argv.indexOf("--current");
  const currPath = currIdx >= 0 ? argv[currIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const changedOnly = argv.includes("--changed-only");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-severity-drift — Detect severity changes

Usage:
  judges finding-severity-drift --previous <path> --current <path> [--changed-only] [--format table|json]

Options:
  --previous <path>   Path to previous findings JSON
  --current <path>    Path to current findings JSON
  --changed-only      Only show findings with severity changes
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (!prevPath || !existsSync(prevPath)) {
    console.error("Provide --previous <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  if (!currPath || !existsSync(currPath)) {
    console.error("Provide --current <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  const previous = JSON.parse(readFileSync(prevPath, "utf-8")) as Finding[];
  const current = JSON.parse(readFileSync(currPath, "utf-8")) as Finding[];
  let results = detectDrift(previous, current);

  if (changedOnly) {
    results = results.filter((r) => r.direction !== "unchanged");
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nSeverity Drift Analysis (${results.length} findings)`);
  console.log("═".repeat(80));
  console.log(`  ${"Rule ID".padEnd(25)} ${"Previous".padEnd(12)} ${"Current".padEnd(12)} Direction`);
  console.log("  " + "─".repeat(60));

  for (const r of results) {
    console.log(
      `  ${r.ruleId.padEnd(25)} ${r.previousSeverity.padEnd(12)} ${r.currentSeverity.padEnd(12)} ${r.direction}`,
    );
  }

  const escalated = results.filter((r) => r.direction === "escalated").length;
  const deEscalated = results.filter((r) => r.direction === "de-escalated").length;
  console.log(
    `\n  Escalated: ${escalated} | De-escalated: ${deEscalated} | Unchanged: ${results.length - escalated - deEscalated}`,
  );
  console.log("═".repeat(80));
}
