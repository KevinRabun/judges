/**
 * Review-history-compare — Compare review results over time.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Comparison {
  beforeFile: string;
  afterFile: string;
  scoreDelta: number;
  findingDelta: number;
  newFindings: Array<{ ruleId: string; severity: string; title: string }>;
  resolvedFindings: Array<{ ruleId: string; severity: string; title: string }>;
  persistentFindings: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewHistoryCompare(argv: string[]): void {
  const beforeIdx = argv.indexOf("--before");
  const afterIdx = argv.indexOf("--after");
  const formatIdx = argv.indexOf("--format");
  const beforeFile = beforeIdx >= 0 ? argv[beforeIdx + 1] : undefined;
  const afterFile = afterIdx >= 0 ? argv[afterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-history-compare — Compare review results over time

Usage:
  judges review-history-compare --before <old.json> --after <new.json>
                                [--format table|json]

Options:
  --before <path>   Earlier review result JSON
  --after <path>    Later review result JSON
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (!beforeFile || !afterFile) {
    console.error("Error: --before and --after are required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(beforeFile)) {
    console.error(`Error: file not found: ${beforeFile}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(afterFile)) {
    console.error(`Error: file not found: ${afterFile}`);
    process.exitCode = 1;
    return;
  }

  let before: TribunalVerdict;
  let after: TribunalVerdict;
  try {
    before = JSON.parse(readFileSync(beforeFile, "utf-8")) as TribunalVerdict;
    after = JSON.parse(readFileSync(afterFile, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: failed to parse review files");
    process.exitCode = 1;
    return;
  }

  const beforeKeys = new Set(before.findings.map((f) => `${f.ruleId}|${f.title}`));
  const afterKeys = new Set(after.findings.map((f) => `${f.ruleId}|${f.title}`));

  const comparison: Comparison = {
    beforeFile,
    afterFile,
    scoreDelta: after.overallScore - before.overallScore,
    findingDelta: after.findings.length - before.findings.length,
    newFindings: after.findings
      .filter((f) => !beforeKeys.has(`${f.ruleId}|${f.title}`))
      .map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title })),
    resolvedFindings: before.findings
      .filter((f) => !afterKeys.has(`${f.ruleId}|${f.title}`))
      .map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title })),
    persistentFindings: after.findings.filter((f) => beforeKeys.has(`${f.ruleId}|${f.title}`)).length,
  };

  if (format === "json") {
    console.log(JSON.stringify(comparison, null, 2));
    return;
  }

  const scoreTrend = comparison.scoreDelta > 0 ? "↑" : comparison.scoreDelta < 0 ? "↓" : "→";
  console.log(`\nReview History Comparison`);
  console.log("═".repeat(55));
  console.log(
    `  Score:    ${before.overallScore} → ${after.overallScore} (${scoreTrend}${Math.abs(comparison.scoreDelta).toFixed(1)})`,
  );
  console.log(
    `  Findings: ${before.findings.length} → ${after.findings.length} (${comparison.findingDelta >= 0 ? "+" : ""}${comparison.findingDelta})`,
  );
  console.log(`  Persistent: ${comparison.persistentFindings}`);

  if (comparison.newFindings.length > 0) {
    console.log(`\n  New Findings (${comparison.newFindings.length}):`);
    for (const f of comparison.newFindings) {
      console.log(`    + [${f.severity}] ${f.ruleId}: ${f.title}`);
    }
  }

  if (comparison.resolvedFindings.length > 0) {
    console.log(`\n  Resolved Findings (${comparison.resolvedFindings.length}):`);
    for (const f of comparison.resolvedFindings) {
      console.log(`    - [${f.severity}] ${f.ruleId}: ${f.title}`);
    }
  }

  console.log("═".repeat(55));
}
