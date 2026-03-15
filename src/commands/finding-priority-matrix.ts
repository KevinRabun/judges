/**
 * Finding-priority-matrix — Create a priority matrix (urgency × impact) for findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, Severity } from "../types.js";

// ─── Matrix model ───────────────────────────────────────────────────────────

const URGENCY: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

interface MatrixEntry {
  ruleId: string;
  title: string;
  severity: string;
  urgency: number;
  impact: number;
  priority: string;
  score: number;
}

function classifyPriority(score: number): string {
  if (score >= 20) return "P0-Immediate";
  if (score >= 12) return "P1-High";
  if (score >= 6) return "P2-Medium";
  if (score >= 3) return "P3-Low";
  return "P4-Backlog";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPriorityMatrix(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const priorityIdx = argv.indexOf("--priority");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const priorityFilter = priorityIdx >= 0 ? argv[priorityIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-priority-matrix — Create urgency × impact priority matrix

Usage:
  judges finding-priority-matrix --report <path> [--priority <level>]
                                 [--format table|json]

Options:
  --report <path>      Report file with findings
  --priority <level>   Filter: P0-Immediate, P1-High, P2-Medium, P3-Low, P4-Backlog
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (reportIdx < 0) {
    console.error("Missing --report <path>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = report.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to prioritize.");
    return;
  }

  const entries: MatrixEntry[] = findings.map((f) => {
    const urgency = URGENCY[f.severity] ?? 1;
    const conf = f.confidence ?? 0.5;
    const impact = Math.round(urgency * conf * 2);
    const score = urgency * impact;

    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      urgency,
      impact,
      priority: classifyPriority(score),
      score,
    };
  });

  entries.sort((a, b) => b.score - a.score);

  const display = priorityFilter.length > 0 ? entries.filter((e) => e.priority === priorityFilter) : entries;

  if (format === "json") {
    console.log(JSON.stringify(display, null, 2));
    return;
  }

  console.log(`\nPriority Matrix`);
  console.log("═".repeat(80));
  console.log(
    `  ${"Priority".padEnd(15)} ${"Score".padEnd(7)} ${"Urgency".padEnd(9)} ${"Impact".padEnd(8)} ${"Rule".padEnd(22)} Title`,
  );
  console.log("  " + "─".repeat(75));

  for (const e of display) {
    console.log(
      `  ${e.priority.padEnd(15)} ${String(e.score).padEnd(7)} ${String(e.urgency).padEnd(9)} ${String(e.impact).padEnd(8)} ${e.ruleId.padEnd(22)} ${e.title}`,
    );
  }

  // Summary counts
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.priority] = (counts[e.priority] ?? 0) + 1;
  }

  console.log(`\n  Summary:`);
  for (const [p, c] of Object.entries(counts).sort()) {
    console.log(`    ${p.padEnd(15)} ${c} finding(s)`);
  }

  console.log("═".repeat(80));
}
