/**
 * Finding-blast-radius — Estimate the blast radius of findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BlastRadiusEntry {
  ruleId: string;
  title: string;
  severity: string;
  lineSpan: number;
  affectedLines: number[];
  radius: "contained" | "moderate" | "widespread";
  riskScore: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function estimateBlastRadius(verdict: TribunalVerdict): BlastRadiusEntry[] {
  const entries: BlastRadiusEntry[] = [];

  for (const f of verdict.findings) {
    const lines = f.lineNumbers || [];
    const lineSpan = lines.length > 1 ? lines[lines.length - 1] - lines[0] + 1 : lines.length;

    const sev = (f.severity || "medium").toLowerCase();
    const sevWeight = sev === "critical" ? 4 : sev === "high" ? 3 : sev === "medium" ? 2 : 1;

    let radius: BlastRadiusEntry["radius"] = "contained";
    if (lineSpan > 50 || sevWeight >= 3) {
      radius = "widespread";
    } else if (lineSpan > 10 || sevWeight >= 2) {
      radius = "moderate";
    }

    const riskScore = sevWeight * Math.max(1, Math.ceil(lineSpan / 10));

    entries.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: sev,
      lineSpan,
      affectedLines: lines,
      radius,
      riskScore,
    });
  }

  return entries.sort((a, b) => b.riskScore - a.riskScore);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingBlastRadius(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-blast-radius — Estimate finding blast radius

Usage:
  judges finding-blast-radius --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
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

  const entries = estimateBlastRadius(verdict);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nBlast Radius Analysis (${entries.length} findings)`);
  console.log("═".repeat(70));
  console.log(`${"Rule".padEnd(20)} ${"Severity".padEnd(10)} ${"Span".padEnd(8)} ${"Radius".padEnd(14)} Risk`);
  console.log("─".repeat(70));

  for (const e of entries) {
    const rule = e.ruleId.length > 18 ? e.ruleId.slice(0, 18) + "…" : e.ruleId;
    console.log(
      `${rule.padEnd(20)} ${e.severity.padEnd(10)} ${String(e.lineSpan).padEnd(8)} ${e.radius.padEnd(14)} ${e.riskScore}`,
    );
  }

  const widespread = entries.filter((e) => e.radius === "widespread").length;
  const moderate = entries.filter((e) => e.radius === "moderate").length;
  const contained = entries.filter((e) => e.radius === "contained").length;
  console.log("─".repeat(70));
  console.log(`  Widespread: ${widespread}  |  Moderate: ${moderate}  |  Contained: ${contained}`);
  console.log("═".repeat(70));
}
