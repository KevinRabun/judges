/**
 * Finding-filter-view — Filter and view findings by multiple criteria.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFilterView(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const severityIdx = argv.indexOf("--severity");
  const ruleIdx = argv.indexOf("--rule");
  const minConfIdx = argv.indexOf("--min-confidence");
  const lineIdx = argv.indexOf("--line-range");
  const formatIdx = argv.indexOf("--format");
  const limitIdx = argv.indexOf("--limit");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-filter-view — Filter findings by multiple criteria

Usage:
  judges finding-filter-view --file <review.json> [options]

Options:
  --file <path>          Review result JSON file
  --severity <level>     Filter by severity (critical, high, medium, low, info)
  --rule <prefix>        Filter by rule ID prefix
  --min-confidence <n>   Minimum confidence (0.0-1.0)
  --line-range <s-e>     Filter by line range (e.g., 10-50)
  --limit <n>            Maximum findings to show
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help
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

  let findings: Finding[] = [...verdict.findings];

  // Apply severity filter
  if (severityIdx >= 0) {
    const sev = argv[severityIdx + 1];
    findings = findings.filter((f) => f.severity === sev);
  }

  // Apply rule prefix filter
  if (ruleIdx >= 0) {
    const prefix = argv[ruleIdx + 1];
    findings = findings.filter((f) => f.ruleId.startsWith(prefix));
  }

  // Apply min confidence filter
  if (minConfIdx >= 0) {
    const minConf = parseFloat(argv[minConfIdx + 1]);
    findings = findings.filter((f) => f.confidence !== undefined && f.confidence >= minConf);
  }

  // Apply line range filter
  if (lineIdx >= 0) {
    const rangeStr = argv[lineIdx + 1];
    const parts = rangeStr.split("-");
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      findings = findings.filter((f) => {
        if (f.lineNumbers === undefined || f.lineNumbers.length === 0) return false;
        return f.lineNumbers.some((ln) => ln >= start && ln <= end);
      });
    }
  }

  // Apply limit
  if (limitIdx >= 0) {
    const limit = parseInt(argv[limitIdx + 1], 10);
    findings = findings.slice(0, limit);
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, findings }, null, 2));
    return;
  }

  console.log(`\nFiltered Findings: ${findings.length} of ${verdict.findings.length}`);
  console.log("═".repeat(70));

  if (findings.length === 0) {
    console.log("  No findings match the current filters.");
    console.log("═".repeat(70));
    return;
  }

  for (const f of findings) {
    const conf = f.confidence !== undefined ? ` (${(f.confidence * 100).toFixed(0)}%)` : "";
    const lines = f.lineNumbers !== undefined && f.lineNumbers.length > 0 ? ` L${f.lineNumbers.join(",")}` : "";
    console.log(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}${lines}${conf}`);
    console.log(`           ${f.title}`);
  }

  console.log("═".repeat(70));
}
