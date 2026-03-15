/**
 * Review-threshold-tune — Tune review thresholds for optimal signal-to-noise.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ThresholdSuggestion {
  metric: string;
  currentValue: number;
  suggestedValue: number;
  rationale: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeThresholds(verdicts: TribunalVerdict[]): ThresholdSuggestion[] {
  if (verdicts.length === 0) return [];

  const scores = verdicts.map((v) => v.overallScore);
  const findingCounts = verdicts.map((v) => v.findings.length);
  const criticals = verdicts.map((v) => v.criticalCount);

  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const maxCritical = Math.max(...criticals);
  const passRate = Math.round((verdicts.filter((v) => v.overallVerdict === "pass").length / verdicts.length) * 100);

  const suggestions: ThresholdSuggestion[] = [];

  // score threshold
  const p25Score = scores.sort((a, b) => a - b)[Math.floor(scores.length * 0.25)];
  if (passRate < 30) {
    suggestions.push({
      metric: "min-score",
      currentValue: 70,
      suggestedValue: Math.max(30, p25Score - 5),
      rationale: `Pass rate is ${passRate}%. Lowering threshold to increase adoption.`,
    });
  } else if (passRate > 90) {
    suggestions.push({
      metric: "min-score",
      currentValue: 70,
      suggestedValue: Math.min(90, avgScore - 10),
      rationale: `Pass rate is ${passRate}%. Raising threshold for higher quality.`,
    });
  }

  // finding count threshold
  const avgFindingsActual = Math.round(findingCounts.reduce((a, b) => a + b, 0) / findingCounts.length);
  if (avgFindingsActual > 30) {
    suggestions.push({
      metric: "max-findings",
      currentValue: 50,
      suggestedValue: avgFindingsActual + 10,
      rationale: `Average findings: ${avgFindingsActual}. Adjusting max to reduce noise.`,
    });
  }

  // critical threshold
  if (maxCritical > 5) {
    suggestions.push({
      metric: "max-critical",
      currentValue: 0,
      suggestedValue: 2,
      rationale: `Max critical: ${maxCritical}. Allowing some criticals for gradual adoption.`,
    });
  }

  // severity filter suggestion
  const lowFindings = verdicts.reduce(
    (sum, v) => sum + v.findings.filter((f) => (f.severity || "medium").toLowerCase() === "low").length,
    0,
  );
  if (lowFindings > verdicts.length * 5) {
    suggestions.push({
      metric: "min-severity",
      currentValue: 0,
      suggestedValue: 1,
      rationale: `${lowFindings} low-severity findings across ${verdicts.length} reports. Consider filtering.`,
    });
  }

  return suggestions;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewThresholdTune(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-threshold-tune — Tune review thresholds

Usage:
  judges review-threshold-tune --dir <verdicts-dir> [--format table|json]
  judges review-threshold-tune --file <verdict.json> [--format table|json]

Options:
  --dir <path>       Directory of verdict JSON files
  --file <path>      Single verdict JSON file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const verdicts: TribunalVerdict[] = [];

  if (dirPath && existsSync(dirPath)) {
    const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        verdicts.push(JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")));
      } catch {
        // skip
      }
    }
  } else if (filePath && existsSync(filePath)) {
    try {
      verdicts.push(JSON.parse(readFileSync(filePath, "utf-8")));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Error: --dir or --file required");
    process.exitCode = 1;
    return;
  }

  const suggestions = analyzeThresholds(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  console.log(`\nThreshold Tuning Suggestions (${verdicts.length} reports analyzed)`);
  console.log("═".repeat(70));

  if (suggestions.length === 0) {
    console.log("  No threshold adjustments needed. Current settings look good.");
  } else {
    console.log(`${"Metric".padEnd(18)} ${"Current".padEnd(10)} ${"Suggested".padEnd(12)} Rationale`);
    console.log("─".repeat(70));
    for (const s of suggestions) {
      const rationale = s.rationale.length > 35 ? s.rationale.slice(0, 35) + "…" : s.rationale;
      console.log(
        `${s.metric.padEnd(18)} ${String(s.currentValue).padEnd(10)} ${String(s.suggestedValue).padEnd(12)} ${rationale}`,
      );
    }
  }
  console.log("═".repeat(70));
}
