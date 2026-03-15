/**
 * Finding-quality-gate — Define and enforce quality gates on findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualityGate {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  description: string;
}

interface GateResult {
  allPassed: boolean;
  gates: QualityGate[];
  verdict: string;
  score: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingQualityGate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const maxCritIdx = argv.indexOf("--max-critical");
  const maxHighIdx = argv.indexOf("--max-high");
  const maxTotalIdx = argv.indexOf("--max-total");
  const minScoreIdx = argv.indexOf("--min-score");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const maxCritical = maxCritIdx >= 0 ? parseInt(argv[maxCritIdx + 1], 10) : 0;
  const maxHigh = maxHighIdx >= 0 ? parseInt(argv[maxHighIdx + 1], 10) : 5;
  const maxTotal = maxTotalIdx >= 0 ? parseInt(argv[maxTotalIdx + 1], 10) : 50;
  const minScore = minScoreIdx >= 0 ? parseInt(argv[minScoreIdx + 1], 10) : 40;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-quality-gate — Enforce quality gates on findings

Usage:
  judges finding-quality-gate --file <verdict.json>
        [--max-critical <n>] [--max-high <n>]
        [--max-total <n>] [--min-score <n>]
        [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --max-critical <n>   Max critical findings allowed (default: 0)
  --max-high <n>       Max high findings allowed (default: 5)
  --max-total <n>      Max total findings allowed (default: 50)
  --min-score <n>      Minimum score required (default: 40)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const gates: QualityGate[] = [
    {
      name: "Max Critical",
      passed: verdict.criticalCount <= maxCritical,
      actual: verdict.criticalCount,
      threshold: maxCritical,
      description: `Critical findings ≤ ${maxCritical}`,
    },
    {
      name: "Max High",
      passed: verdict.highCount <= maxHigh,
      actual: verdict.highCount,
      threshold: maxHigh,
      description: `High findings ≤ ${maxHigh}`,
    },
    {
      name: "Max Total",
      passed: verdict.findings.length <= maxTotal,
      actual: verdict.findings.length,
      threshold: maxTotal,
      description: `Total findings ≤ ${maxTotal}`,
    },
    {
      name: "Min Score",
      passed: verdict.overallScore >= minScore,
      actual: verdict.overallScore,
      threshold: minScore,
      description: `Score ≥ ${minScore}`,
    },
  ];

  const allPassed = gates.every((g) => g.passed);
  const result: GateResult = { allPassed, gates, verdict: verdict.overallVerdict, score: verdict.overallScore };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nQuality Gate Results`);
  console.log("═".repeat(60));

  for (const g of gates) {
    const icon = g.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${g.name}: ${g.actual} (threshold: ${g.threshold})`);
    console.log(`         ${g.description}`);
  }

  console.log("═".repeat(60));
  console.log(`\nOverall: ${allPassed ? "ALL GATES PASSED" : "GATES FAILED"}`);

  if (!allPassed) {
    process.exitCode = 1;
  }
}
