/**
 * Finding-compare-runs — Compare findings across different review runs.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComparisonResult {
  newFindings: Array<{ ruleId: string; title: string; severity: string }>;
  resolvedFindings: Array<{ ruleId: string; title: string; severity: string }>;
  persistentFindings: Array<{ ruleId: string; title: string; severity: string }>;
  scoreChange: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadVerdict(path: string): TribunalVerdict | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function compareRuns(before: TribunalVerdict, after: TribunalVerdict): ComparisonResult {
  const beforeKeys = new Set(before.findings.map((f) => `${f.ruleId}:${f.title}`));
  const afterKeys = new Set(after.findings.map((f) => `${f.ruleId}:${f.title}`));

  const newFindings = after.findings
    .filter((f) => !beforeKeys.has(`${f.ruleId}:${f.title}`))
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity || "medium" }));

  const resolvedFindings = before.findings
    .filter((f) => !afterKeys.has(`${f.ruleId}:${f.title}`))
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity || "medium" }));

  const persistentFindings = after.findings
    .filter((f) => beforeKeys.has(`${f.ruleId}:${f.title}`))
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity || "medium" }));

  return {
    newFindings,
    resolvedFindings,
    persistentFindings,
    scoreChange: after.overallScore - before.overallScore,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCompareRuns(argv: string[]): void {
  const beforeIdx = argv.indexOf("--before");
  const afterIdx = argv.indexOf("--after");
  const formatIdx = argv.indexOf("--format");
  const beforePath = beforeIdx >= 0 ? argv[beforeIdx + 1] : undefined;
  const afterPath = afterIdx >= 0 ? argv[afterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-compare-runs — Compare findings across runs

Usage:
  judges finding-compare-runs --before <v1.json> --after <v2.json>
                               [--format table|json]

Options:
  --before <path>    Earlier verdict JSON file (required)
  --after <path>     Later verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!beforePath || !afterPath) {
    console.error("Error: --before and --after required");
    process.exitCode = 1;
    return;
  }

  const before = loadVerdict(beforePath);
  const after = loadVerdict(afterPath);
  if (!before) {
    console.error(`Error: cannot load ${beforePath}`);
    process.exitCode = 1;
    return;
  }
  if (!after) {
    console.error(`Error: cannot load ${afterPath}`);
    process.exitCode = 1;
    return;
  }

  const result = compareRuns(before, after);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\nRun Comparison");
  console.log("═".repeat(60));
  const scoreDir = result.scoreChange >= 0 ? "+" : "";
  console.log(`Score change: ${scoreDir}${result.scoreChange}`);
  console.log(`Before: ${before.findings.length} findings | After: ${after.findings.length} findings`);
  console.log("─".repeat(60));

  if (result.newFindings.length > 0) {
    console.log(`\nNew (${result.newFindings.length}):`);
    for (const f of result.newFindings) console.log(`  + [${f.severity}] ${f.title}`);
  }

  if (result.resolvedFindings.length > 0) {
    console.log(`\nResolved (${result.resolvedFindings.length}):`);
    for (const f of result.resolvedFindings) console.log(`  - [${f.severity}] ${f.title}`);
  }

  if (result.persistentFindings.length > 0) {
    console.log(`\nPersistent (${result.persistentFindings.length}):`);
    for (const f of result.persistentFindings.slice(0, 10)) console.log(`  = [${f.severity}] ${f.title}`);
    if (result.persistentFindings.length > 10) console.log(`  ... and ${result.persistentFindings.length - 10} more`);
  }

  console.log("\n" + "═".repeat(60));
}
