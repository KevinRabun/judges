/**
 * Finding-regression-check — Check for regressions by comparing current vs baseline findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RegressionResult {
  status: "regression" | "improvement" | "stable";
  newFindings: Array<{ ruleId: string; title: string; severity: string }>;
  resolvedFindings: Array<{ ruleId: string; title: string; severity: string }>;
  scoreDelta: number;
  verdictChanged: boolean;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function checkRegression(baseline: TribunalVerdict, current: TribunalVerdict): RegressionResult {
  const baselineRules = new Set(baseline.findings.map((f) => f.ruleId));
  const currentRules = new Set(current.findings.map((f) => f.ruleId));

  const newFindings = current.findings
    .filter((f) => !baselineRules.has(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: (f.severity || "medium").toLowerCase() }));

  const resolvedFindings = baseline.findings
    .filter((f) => !currentRules.has(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: (f.severity || "medium").toLowerCase() }));

  const scoreDelta = current.overallScore - baseline.overallScore;
  const verdictChanged = current.overallVerdict !== baseline.overallVerdict;

  const hasCriticalNew = newFindings.some((f) => f.severity === "critical" || f.severity === "high");
  let status: RegressionResult["status"] = "stable";
  if (hasCriticalNew || scoreDelta < -10) {
    status = "regression";
  } else if (scoreDelta > 5 || resolvedFindings.length > newFindings.length) {
    status = "improvement";
  }

  return { status, newFindings, resolvedFindings, scoreDelta, verdictChanged };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRegressionCheck(argv: string[]): void {
  const baselineIdx = argv.indexOf("--baseline");
  const currentIdx = argv.indexOf("--current");
  const formatIdx = argv.indexOf("--format");
  const baselinePath = baselineIdx >= 0 ? argv[baselineIdx + 1] : undefined;
  const currentPath = currentIdx >= 0 ? argv[currentIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-regression-check — Check for regressions

Usage:
  judges finding-regression-check --baseline <old.json> --current <new.json>
                                  [--format table|json]

Options:
  --baseline <path>    Path to baseline verdict JSON (required)
  --current <path>     Path to current verdict JSON (required)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!baselinePath || !currentPath) {
    console.error("Error: --baseline and --current required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(baselinePath)) {
    console.error(`Error: not found: ${baselinePath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(currentPath)) {
    console.error(`Error: not found: ${currentPath}`);
    process.exitCode = 1;
    return;
  }

  let baseline: TribunalVerdict;
  let current: TribunalVerdict;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in baseline");
    process.exitCode = 1;
    return;
  }
  try {
    current = JSON.parse(readFileSync(currentPath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON in current");
    process.exitCode = 1;
    return;
  }

  const result = checkRegression(baseline, current);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "regression") process.exitCode = 1;
    return;
  }

  const icon = result.status === "regression" ? "FAIL" : result.status === "improvement" ? "PASS" : "STABLE";
  console.log(`\nRegression Check: ${icon}`);
  console.log("═".repeat(65));
  console.log(`  Status: ${result.status.toUpperCase()}`);
  console.log(`  Score delta: ${result.scoreDelta > 0 ? "+" : ""}${result.scoreDelta}`);
  console.log(`  Verdict changed: ${result.verdictChanged}`);

  if (result.newFindings.length > 0) {
    console.log(`\n  New Findings (+${result.newFindings.length}):`);
    for (const f of result.newFindings) {
      console.log(`    + [${f.severity}] ${f.ruleId}: ${f.title}`);
    }
  }

  if (result.resolvedFindings.length > 0) {
    console.log(`\n  Resolved Findings (-${result.resolvedFindings.length}):`);
    for (const f of result.resolvedFindings) {
      console.log(`    - [${f.severity}] ${f.ruleId}: ${f.title}`);
    }
  }

  console.log("═".repeat(65));
  if (result.status === "regression") process.exitCode = 1;
}
