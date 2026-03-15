/**
 * Review-interactive — Interactive review session with step-by-step finding walkthrough.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatFinding(f: Finding, index: number): string {
  const lines: string[] = [];
  lines.push(`\n── Finding ${index + 1} ──────────────────────────────────────`);
  lines.push(`  Rule:       ${f.ruleId}`);
  lines.push(`  Severity:   ${f.severity}`);
  lines.push(`  Title:      ${f.title}`);
  lines.push(`  Details:    ${f.description}`);
  if (f.lineNumbers !== undefined && f.lineNumbers.length > 0) {
    lines.push(`  Lines:      ${f.lineNumbers.join(", ")}`);
  }
  lines.push(`  Fix:        ${f.recommendation}`);
  if (f.confidence !== undefined) {
    lines.push(`  Confidence: ${(f.confidence * 100).toFixed(0)}%`);
  }
  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewInteractive(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const severityIdx = argv.indexOf("--severity");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const severityFilter = severityIdx >= 0 ? argv[severityIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-interactive — Interactive finding walkthrough

Usage:
  judges review-interactive --file <review.json> [--severity <level>]
                            [--format table|json]

Options:
  --file <path>       Review result JSON file
  --severity <level>  Filter: critical, high, medium, low, info
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings;
  if (severityFilter) {
    findings = findings.filter((f) => f.severity === severityFilter);
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
    return;
  }

  console.log(`\nInteractive Review: ${findings.length} findings`);
  console.log(`Overall: ${verdict.overallVerdict} (score: ${verdict.overallScore})`);
  console.log("═".repeat(55));

  if (findings.length === 0) {
    console.log("  No findings match the current filter.");
    return;
  }

  for (let i = 0; i < findings.length; i++) {
    console.log(formatFinding(findings[i], i));
  }

  console.log("\n" + "═".repeat(55));
  console.log(`Reviewed ${findings.length} finding(s). Use --severity to filter.`);
}
