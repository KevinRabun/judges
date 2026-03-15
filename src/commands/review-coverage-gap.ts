/**
 * Review-coverage-gap — Identify gaps in review coverage.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoverageGap {
  type: "missing-judge" | "uncovered-lines" | "low-confidence";
  detail: string;
  severity: string;
  suggestion: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function findCoverageGaps(verdict: TribunalVerdict): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const judges = defaultRegistry.getJudges();
  const activeJudgeIds = new Set(verdict.evaluations.map((e) => e.judgeId));

  // Missing judge coverage
  for (const j of judges) {
    if (!activeJudgeIds.has(j.id)) {
      gaps.push({
        type: "missing-judge",
        detail: `Judge ${j.id} (${j.domain}) did not participate`,
        severity: "medium",
        suggestion: `Enable judge ${j.id} for broader coverage`,
      });
    }
  }

  // Low confidence findings
  const lowConf = verdict.findings.filter(
    (f) => f.confidence !== undefined && f.confidence !== null && f.confidence < 0.5,
  );
  if (lowConf.length > 0) {
    gaps.push({
      type: "low-confidence",
      detail: `${lowConf.length} findings have confidence < 50%`,
      severity: "low",
      suggestion: "Review low-confidence findings manually for accuracy",
    });
  }

  // Uncovered line ranges (findings with no line numbers)
  const noLines = verdict.findings.filter((f) => !f.lineNumbers || f.lineNumbers.length === 0);
  if (noLines.length > 0) {
    gaps.push({
      type: "uncovered-lines",
      detail: `${noLines.length} findings have no line number information`,
      severity: "low",
      suggestion: "Some findings lack precise location data",
    });
  }

  // Low evaluation scores
  const lowScoreEvals = verdict.evaluations.filter((e) => e.score < 40);
  for (const e of lowScoreEvals) {
    gaps.push({
      type: "low-confidence",
      detail: `Judge ${e.judgeId} gave score ${e.score}`,
      severity: "high",
      suggestion: `Investigate why ${e.judgeId} rated code so poorly`,
    });
  }

  return gaps.sort((a, b) => {
    const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCoverageGap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-coverage-gap — Identify review coverage gaps

Usage:
  judges review-coverage-gap --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
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

  const gaps = findCoverageGaps(verdict);

  if (format === "json") {
    console.log(JSON.stringify(gaps, null, 2));
    return;
  }

  console.log(`\nCoverage Gaps (${gaps.length} found)`);
  console.log("═".repeat(70));
  console.log(`${"Type".padEnd(18)} ${"Severity".padEnd(10)} Detail`);
  console.log("─".repeat(70));

  for (const g of gaps) {
    const detail = g.detail.length > 38 ? g.detail.slice(0, 38) + "…" : g.detail;
    console.log(`${g.type.padEnd(18)} ${g.severity.padEnd(10)} ${detail}`);
  }

  if (gaps.length > 0) {
    console.log(`\n  Suggestions:`);
    const seen = new Set<string>();
    for (const g of gaps) {
      if (!seen.has(g.suggestion)) {
        seen.add(g.suggestion);
        console.log(`    - ${g.suggestion}`);
      }
    }
  }
  console.log("═".repeat(70));
}
