import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-stale-finding-clean ─────────────────────────────────────
   Clean up stale findings that no longer apply — compare current
   findings against a previous baseline to identify findings that
   have been resolved and can be archived.
   ─────────────────────────────────────────────────────────────────── */

interface StaleResult {
  resolved: Array<{ ruleId: string; severity: string; title: string }>;
  persisting: Array<{ ruleId: string; severity: string; title: string }>;
  newFindings: Array<{ ruleId: string; severity: string; title: string }>;
}

function findStale(current: Finding[], baseline: Finding[]): StaleResult {
  const currentRules = new Set(current.map((f) => f.ruleId));
  const baselineRules = new Set(baseline.map((f) => f.ruleId));

  const resolved = baseline
    .filter((f) => !currentRules.has(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title }));

  const persisting = current
    .filter((f) => baselineRules.has(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title }));

  const newFindings = current
    .filter((f) => !baselineRules.has(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title }));

  return { resolved, persisting, newFindings };
}

export function runReviewStaleFindingClean(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-stale-finding-clean [options]

Clean up stale findings by comparing against baseline.

Options:
  --current <path>     Path to current verdict JSON
  --baseline <path>    Path to baseline verdict JSON
  --export <path>      Export resolved findings to file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const currentIdx = argv.indexOf("--current");
  const currentPath =
    currentIdx !== -1 && argv[currentIdx + 1]
      ? join(process.cwd(), argv[currentIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const baselineIdx = argv.indexOf("--baseline");
  const baselinePath =
    baselineIdx !== -1 && argv[baselineIdx + 1]
      ? join(process.cwd(), argv[baselineIdx + 1])
      : join(process.cwd(), ".judges", "baseline-verdict.json");

  if (!existsSync(currentPath)) {
    console.log(`Current verdict not found: ${currentPath}`);
    return;
  }
  if (!existsSync(baselinePath)) {
    console.log(`Baseline verdict not found: ${baselinePath}`);
    console.log("Provide --baseline or place baseline at .judges/baseline-verdict.json");
    return;
  }

  const currentData = JSON.parse(readFileSync(currentPath, "utf-8")) as TribunalVerdict;
  const baselineData = JSON.parse(readFileSync(baselinePath, "utf-8")) as TribunalVerdict;

  const result = findStale(currentData.findings ?? [], baselineData.findings ?? []);

  const exportIdx = argv.indexOf("--export");
  if (exportIdx !== -1 && argv[exportIdx + 1]) {
    const exportPath = join(process.cwd(), argv[exportIdx + 1]);
    writeFileSync(exportPath, JSON.stringify(result, null, 2));
    console.log(`Stale finding report exported to: ${exportPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n=== Stale Finding Cleanup ===\n");
  console.log(`Resolved: ${result.resolved.length}`);
  console.log(`Persisting: ${result.persisting.length}`);
  console.log(`New: ${result.newFindings.length}\n`);

  if (result.resolved.length > 0) {
    console.log("Resolved (can be archived):");
    for (const f of result.resolved) {
      console.log(`  ✓ ${f.ruleId} (${f.severity}): ${f.title}`);
    }
    console.log();
  }

  if (result.newFindings.length > 0) {
    console.log("New findings:");
    for (const f of result.newFindings) {
      console.log(`  ★ ${f.ruleId} (${f.severity}): ${f.title}`);
    }
  }
}
