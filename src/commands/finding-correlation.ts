/**
 * Finding-correlation — Find correlations between findings across reports.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CorrelationPair {
  ruleA: string;
  ruleB: string;
  coOccurrences: number;
  totalReports: number;
  correlation: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function computeCorrelations(verdicts: TribunalVerdict[]): CorrelationPair[] {
  // count co-occurrences of rule pairs across reports
  const pairCounts = new Map<string, number>();
  const ruleCounts = new Map<string, number>();
  const totalReports = verdicts.length;

  for (const v of verdicts) {
    const rulesInReport = new Set(v.findings.map((f) => f.ruleId));
    const ruleList = [...rulesInReport].sort();

    for (const rule of ruleList) {
      ruleCounts.set(rule, (ruleCounts.get(rule) || 0) + 1);
    }

    for (let i = 0; i < ruleList.length; i++) {
      for (let j = i + 1; j < ruleList.length; j++) {
        const key = `${ruleList[i]}|||${ruleList[j]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  const correlations: CorrelationPair[] = [];

  for (const [key, coOccurrences] of pairCounts) {
    const [ruleA, ruleB] = key.split("|||");
    const countA = ruleCounts.get(ruleA) || 0;
    const countB = ruleCounts.get(ruleB) || 0;

    // Jaccard similarity as correlation proxy
    const union = countA + countB - coOccurrences;
    const correlation = union > 0 ? coOccurrences / union : 0;

    if (coOccurrences >= 2) {
      correlations.push({ ruleA, ruleB, coOccurrences, totalReports, correlation });
    }
  }

  correlations.sort((a, b) => b.correlation - a.correlation);
  return correlations;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCorrelation(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const limitIdx = argv.indexOf("--limit");
  const minIdx = argv.indexOf("--min-correlation");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : 20;
  const minCorrelation = minIdx >= 0 ? parseFloat(argv[minIdx + 1]) : 0.3;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-correlation — Find correlations between findings

Usage:
  judges finding-correlation --dir <verdicts-dir> [--format table|json]
                             [--limit <n>] [--min-correlation <0-1>]

Options:
  --dir <path>              Directory of verdict JSON files (required)
  --format <fmt>            Output format: table (default), json
  --limit <n>               Max results (default: 20)
  --min-correlation <n>     Minimum correlation threshold (default: 0.3)
  --help, -h                Show this help
`);
    return;
  }

  if (!dirPath || !existsSync(dirPath)) {
    console.error("Error: --dir required and must exist");
    process.exitCode = 1;
    return;
  }

  const verdicts: TribunalVerdict[] = [];
  const files = readdirSync(dirPath) as unknown as string[];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      verdicts.push(JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")));
    } catch {
      // skip invalid files
    }
  }

  if (verdicts.length < 2) {
    console.log("Need at least 2 verdict reports for correlation analysis");
    return;
  }

  let correlations = computeCorrelations(verdicts);
  correlations = correlations.filter((c) => c.correlation >= minCorrelation).slice(0, limit);

  if (format === "json") {
    console.log(JSON.stringify(correlations, null, 2));
    return;
  }

  console.log(`\nFinding Correlations (${verdicts.length} reports analyzed)`);
  console.log("═".repeat(75));
  console.log(`${"Rule A".padEnd(20)} ${"Rule B".padEnd(20)} ${"Co-occur".padEnd(10)} ${"Correlation".padEnd(14)}`);
  console.log("─".repeat(75));

  for (const c of correlations) {
    const rA = c.ruleA.length > 18 ? c.ruleA.slice(0, 18) + "…" : c.ruleA;
    const rB = c.ruleB.length > 18 ? c.ruleB.slice(0, 18) + "…" : c.ruleB;
    console.log(
      `${rA.padEnd(20)} ${rB.padEnd(20)} ${String(c.coOccurrences).padEnd(10)} ${c.correlation.toFixed(3).padEnd(14)}`,
    );
  }
  console.log("═".repeat(75));
}
