/**
 * Finding-prioritize — Prioritize findings by estimated business impact.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
  info: 1,
};

const IMPACT_KEYWORDS: Record<string, number> = {
  "data loss": 10,
  injection: 9,
  authentication: 9,
  authorization: 8,
  credential: 9,
  "remote code": 10,
  "denial of service": 7,
  "memory leak": 6,
  "race condition": 7,
  "privilege escalation": 9,
  "information disclosure": 6,
  "cross-site": 8,
  deserialization: 8,
  "path traversal": 7,
  "buffer overflow": 9,
  ssrf: 8,
  performance: 3,
  style: 1,
  naming: 1,
  formatting: 1,
};

function computePriority(finding: Finding): number {
  let score = SEVERITY_WEIGHTS[finding.severity] || 4;

  // Boost by keyword matches
  const text = `${finding.title || ""} ${finding.description || ""}`.toLowerCase();
  for (const [kw, weight] of Object.entries(IMPACT_KEYWORDS)) {
    if (text.includes(kw)) score += weight;
  }

  // Confidence boost
  if (finding.confidence !== undefined && finding.confidence !== null) {
    score += finding.confidence * 2;
  }

  return Math.round(score * 10) / 10;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPrioritize(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-prioritize — Prioritize findings by business impact

Usage:
  judges finding-prioritize --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --top <n>          Show only top N findings (default: all)
  --min-score <n>    Minimum priority score to include (default: 0)
  --format json      JSON output
  --help, -h         Show this help

Computes priority scores based on severity, keywords, and confidence.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const topStr = argv.find((_a: string, i: number) => argv[i - 1] === "--top");
  const minStr = argv.find((_a: string, i: number) => argv[i - 1] === "--min-score");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  let scored = findings.map((f) => ({ ...f, priorityScore: computePriority(f) }));
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  if (minStr) {
    const min = parseFloat(minStr);
    scored = scored.filter((s) => s.priorityScore >= min);
  }

  const top = topStr ? parseInt(topStr, 10) : scored.length;
  const display = scored.slice(0, top);

  if (format === "json") {
    console.log(
      JSON.stringify({ totalFindings: findings.length, prioritized: display.length, findings: display }, null, 2),
    );
    return;
  }

  console.log(`\nPrioritized Findings:`);
  console.log("═".repeat(70));
  console.log(`  ${display.length} findings ranked by priority score`);
  console.log("─".repeat(70));

  for (let i = 0; i < display.length && i < 25; i++) {
    const f = display[i];
    const rank = String(i + 1).padStart(3);
    const score = String(f.priorityScore).padStart(5);
    console.log(`  ${rank}. [${score}] ${(f.severity || "medium").toUpperCase().padEnd(9)} ${f.ruleId || "unknown"}`);
    console.log(`       ${f.title || "Untitled"}`);
  }

  if (display.length > 25) console.log(`\n  ... and ${display.length - 25} more`);
  console.log("═".repeat(70));
}
