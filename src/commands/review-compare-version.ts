/**
 * Review-compare-version — Compare review results between code versions.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VersionResult {
  score: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  findings: string[];
}

interface Comparison {
  before: VersionResult;
  after: VersionResult;
  scoreDelta: number;
  newFindings: string[];
  resolvedFindings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadResult(filePath: string): VersionResult | null {
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    const findings: string[] = Array.isArray(data.findings)
      ? data.findings.map((f: { ruleId?: string; title?: string }) => `${f.ruleId || ""}:${f.title || ""}`)
      : [];
    return {
      score: typeof data.overallScore === "number" ? data.overallScore : 0,
      findingCount: findings.length,
      criticalCount: typeof data.criticalCount === "number" ? data.criticalCount : 0,
      highCount: typeof data.highCount === "number" ? data.highCount : 0,
      findings,
    };
  } catch {
    return null;
  }
}

function compare(before: VersionResult, after: VersionResult): Comparison {
  const beforeSet = new Set(before.findings);
  const afterSet = new Set(after.findings);
  const newFindings = after.findings.filter((f) => !beforeSet.has(f));
  const resolvedFindings = before.findings.filter((f) => !afterSet.has(f));

  return {
    before,
    after,
    scoreDelta: after.score - before.score,
    newFindings,
    resolvedFindings,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCompareVersion(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compare-version — Compare review results between code versions

Usage:
  judges review-compare-version --before results-v1.json --after results-v2.json

Options:
  --before <path>       Path to the earlier review result (JSON)
  --after <path>        Path to the later review result (JSON)
  --format json         JSON output
  --help, -h            Show this help

Compares two review result files and shows:
  - Score change
  - New findings introduced
  - Findings resolved
  - Critical/high count changes
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const beforePath = argv.find((_a: string, i: number) => argv[i - 1] === "--before") || "";
  const afterPath = argv.find((_a: string, i: number) => argv[i - 1] === "--after") || "";

  if (!beforePath || !afterPath) {
    console.log("Specify --before and --after result file paths.");
    return;
  }

  const before = loadResult(beforePath);
  const after = loadResult(afterPath);

  if (!before) {
    console.log(`Cannot load before file: ${beforePath}`);
    return;
  }
  if (!after) {
    console.log(`Cannot load after file: ${afterPath}`);
    return;
  }

  const result = compare(before, after);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const arrow = result.scoreDelta > 0 ? "↗" : result.scoreDelta < 0 ? "↘" : "→";

  console.log("\nVersion Comparison:");
  console.log("═".repeat(55));
  console.log(
    `  Score: ${before.score.toFixed(1)} → ${after.score.toFixed(1)}  (${result.scoreDelta > 0 ? "+" : ""}${result.scoreDelta.toFixed(1)} ${arrow})`,
  );
  console.log(`  Findings: ${before.findingCount} → ${after.findingCount}`);
  console.log(`  Critical: ${before.criticalCount} → ${after.criticalCount}`);
  console.log(`  High: ${before.highCount} → ${after.highCount}`);

  if (result.newFindings.length > 0) {
    console.log(`\n  New Findings (${result.newFindings.length}):`);
    for (const f of result.newFindings.slice(0, 10)) {
      console.log(`    + ${f}`);
    }
    if (result.newFindings.length > 10) console.log(`    ... and ${result.newFindings.length - 10} more`);
  }

  if (result.resolvedFindings.length > 0) {
    console.log(`\n  Resolved Findings (${result.resolvedFindings.length}):`);
    for (const f of result.resolvedFindings.slice(0, 10)) {
      console.log(`    - ${f}`);
    }
    if (result.resolvedFindings.length > 10) console.log(`    ... and ${result.resolvedFindings.length - 10} more`);
  }

  console.log("═".repeat(55));
}
