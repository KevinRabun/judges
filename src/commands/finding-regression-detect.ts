import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-regression-detect ──────────────────────────────────────
   Compare current findings against a previous verdict to detect
   regressions — new findings that did not exist before.
   ─────────────────────────────────────────────────────────────────── */

interface RegressionResult {
  newFindings: { ruleId: string; title: string; severity: string }[];
  resolvedFindings: { ruleId: string; title: string; severity: string }[];
  persistingFindings: number;
  regressionCount: number;
  improvementCount: number;
}

function detectRegressions(current: Finding[], previous: Finding[]): RegressionResult {
  const prevKeys = new Set(previous.map((f) => `${f.ruleId}::${f.title}`));
  const currKeys = new Set(current.map((f) => `${f.ruleId}::${f.title}`));

  const newFindings: { ruleId: string; title: string; severity: string }[] = [];
  for (const f of current) {
    const key = `${f.ruleId}::${f.title}`;
    if (!prevKeys.has(key)) {
      newFindings.push({ ruleId: f.ruleId, title: f.title, severity: f.severity });
    }
  }

  const resolved: { ruleId: string; title: string; severity: string }[] = [];
  for (const f of previous) {
    const key = `${f.ruleId}::${f.title}`;
    if (!currKeys.has(key)) {
      resolved.push({ ruleId: f.ruleId, title: f.title, severity: f.severity });
    }
  }

  const persisting = current.length - newFindings.length;

  return {
    newFindings,
    resolvedFindings: resolved,
    persistingFindings: persisting,
    regressionCount: newFindings.length,
    improvementCount: resolved.length,
  };
}

export function runFindingRegressionDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-regression-detect [options]

Detect regressions by comparing current and previous verdicts.

Options:
  --report <path>      Path to current verdict JSON
  --previous <path>    Path to previous verdict JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const prevIdx = argv.indexOf("--previous");
  const prevPath =
    prevIdx !== -1 && argv[prevIdx + 1]
      ? join(process.cwd(), argv[prevIdx + 1])
      : join(process.cwd(), ".judges", "previous-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No current report found at: ${reportPath}`);
    return;
  }

  if (!existsSync(prevPath)) {
    console.log(`No previous report found at: ${prevPath}`);
    console.log("Cannot detect regressions without a comparison baseline.");
    return;
  }

  const current = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const previous = JSON.parse(readFileSync(prevPath, "utf-8")) as TribunalVerdict;

  const result = detectRegressions(current.findings ?? [], previous.findings ?? []);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n=== Regression Analysis ===\n");
  console.log(`New findings (regressions): ${result.regressionCount}`);
  console.log(`Resolved findings (improvements): ${result.improvementCount}`);
  console.log(`Persisting findings: ${result.persistingFindings}\n`);

  if (result.newFindings.length > 0) {
    console.log("Regressions:");
    for (const f of result.newFindings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    console.log();
  }

  if (result.resolvedFindings.length > 0) {
    console.log("Resolved:");
    for (const f of result.resolvedFindings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    console.log();
  }
}
