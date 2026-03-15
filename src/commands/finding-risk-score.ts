/**
 * Finding-risk-score — Calculate composite risk scores for findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, Severity } from "../types.js";

// ─── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
  info: 1,
};

interface ScoredFinding {
  ruleId: string;
  severity: string;
  title: string;
  riskScore: number;
  factors: string[];
}

function scoreFinding(f: Finding): ScoredFinding {
  const factors: string[] = [];
  let score = SEVERITY_WEIGHT[f.severity] ?? 1;
  factors.push(`severity(${f.severity})=${SEVERITY_WEIGHT[f.severity] ?? 1}`);

  const conf = f.confidence ?? 0.5;
  score *= conf;
  factors.push(`confidence=${conf}`);

  if (f.patch !== undefined && f.patch !== null) {
    score *= 1.2;
    factors.push("has-patch(+20%)");
  }

  if (f.isAbsenceBased === true) {
    score *= 0.8;
    factors.push("absence-based(-20%)");
  }

  return {
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    riskScore: Math.round(score * 100) / 100,
    factors,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRiskScore(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const topIdx = argv.indexOf("--top");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const topN = topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-risk-score — Calculate composite risk scores

Usage:
  judges finding-risk-score --report <path> [--top <n>] [--format table|json]

Options:
  --report <path>  Report file with findings
  --top <n>        Show only top N riskiest findings
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help

Risk score factors: severity weight * confidence * patch bonus * absence penalty
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
    console.log("No findings to score.");
    return;
  }

  const scored = findings.map(scoreFinding);
  scored.sort((a, b) => b.riskScore - a.riskScore);

  const display = topN > 0 ? scored.slice(0, topN) : scored;

  if (format === "json") {
    console.log(JSON.stringify(display, null, 2));
    return;
  }

  console.log(`\nFinding Risk Scores`);
  console.log("═".repeat(70));
  console.log(`  ${"Rank".padEnd(6)} ${"Risk".padEnd(8)} ${"Severity".padEnd(10)} ${"Rule".padEnd(25)} Title`);
  console.log("  " + "─".repeat(65));

  for (let i = 0; i < display.length; i++) {
    const s = display[i];
    console.log(
      `  ${String(i + 1).padEnd(6)} ${String(s.riskScore).padEnd(8)} ${s.severity.padEnd(10)} ${s.ruleId.padEnd(25)} ${s.title}`,
    );
  }

  const totalRisk = scored.reduce((sum, s) => sum + s.riskScore, 0);
  console.log(`\n  Total risk: ${Math.round(totalRisk * 100) / 100} across ${scored.length} findings`);
  console.log("═".repeat(70));
}
