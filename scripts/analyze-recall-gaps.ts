/**
 * Recall Improvement Analysis
 *
 * Analyzes benchmark false negatives to identify which judge categories
 * and rule prefixes have the weakest recall, then provides targeted
 * improvement recommendations.
 *
 * Usage:
 *   npx tsx scripts/analyze-recall-gaps.ts           # Full analysis
 *   npx tsx scripts/analyze-recall-gaps.ts --verbose  # With code snippets
 */

import { evaluateWithTribunal } from "../src/evaluators/index.js";
import { runBenchmarkSuite, type BenchmarkCase } from "../src/commands/benchmark.js";

interface RecallGap {
  /** Rule prefix that was missed (e.g. "HALLU") */
  prefix: string;
  /** Total expected across all cases */
  totalExpected: number;
  /** Number of times detected */
  detected: number;
  /** Number of times missed */
  missed: number;
  /** Recall rate for this prefix */
  recall: number;
  /** Case IDs where detection failed */
  missedCaseIds: string[];
  /** Categories of missed cases */
  categories: Set<string>;
  /** Languages of missed cases */
  languages: Set<string>;
}

async function analyzeRecallGaps(): Promise<void> {
  const verbose = process.argv.includes("--verbose");

  console.log("Running full benchmark suite...\n");
  const result = runBenchmarkSuite();

  console.log(`Total cases: ${result.totalCases}`);
  console.log(`Detection rate: ${(result.detectionRate * 100).toFixed(1)}%`);
  console.log(`Precision: ${(result.precision * 100).toFixed(1)}%`);
  console.log(`Recall: ${(result.recall * 100).toFixed(1)}%`);
  console.log(`F1: ${(result.f1Score * 100).toFixed(1)}%`);
  console.log(`False Negatives: ${result.falseNegatives}`);
  console.log(`False Positives: ${result.falsePositives}\n`);

  // Analyze per-category recall
  console.log("=== Per-Category Recall ===\n");
  const sortedCategories = Object.entries(result.perCategory).sort(([, a], [, b]) => (a.recall ?? 1) - (b.recall ?? 1));

  for (const [category, catResult] of sortedCategories) {
    const recall = catResult.recall ?? 1;
    const marker = recall < 0.8 ? "❌" : recall < 0.9 ? "⚠️" : "✅";
    console.log(
      `${marker} ${category}: recall=${(recall * 100).toFixed(1)}% ` +
        `(${catResult.truePositives ?? 0} TP, ${catResult.falseNegatives ?? 0} FN, ${catResult.falsePositives ?? 0} FP)`,
    );
  }

  // Analyze per-judge recall
  console.log("\n=== Per-Judge Recall (lowest first) ===\n");
  const sortedJudges = Object.entries(result.perJudge)
    .filter(([, j]) => (j.totalExpected ?? 0) > 0)
    .sort(([, a], [, b]) => (a.recall ?? 1) - (b.recall ?? 1));

  for (const [judgeId, judgeResult] of sortedJudges) {
    const recall = judgeResult.recall ?? 1;
    const marker = recall < 0.7 ? "❌" : recall < 0.85 ? "⚠️" : "✅";
    console.log(
      `${marker} ${judgeId}: recall=${(recall * 100).toFixed(1)}% ` +
        `(${judgeResult.truePositives ?? 0}/${judgeResult.totalExpected ?? 0} detected)`,
    );
  }

  // Analyze per-difficulty recall
  console.log("\n=== Per-Difficulty Recall ===\n");
  for (const [difficulty, diffResult] of Object.entries(result.perDifficulty)) {
    console.log(
      `${difficulty}: recall=${((diffResult.recall ?? 1) * 100).toFixed(1)}% ` +
        `(${diffResult.truePositives ?? 0} TP, ${diffResult.falseNegatives ?? 0} FN)`,
    );
  }

  // Generate improvement recommendations
  console.log("\n=== Improvement Recommendations ===\n");

  const weakCategories = sortedCategories.filter(([, c]) => (c.recall ?? 1) < 0.85);
  if (weakCategories.length > 0) {
    console.log(`${weakCategories.length} categories with recall < 85%:`);
    for (const [category, catResult] of weakCategories) {
      const fn = catResult.falseNegatives ?? 0;
      console.log(`  - ${category}: +${fn} detections would raise recall to 100%`);
    }
  }

  const weakJudges = sortedJudges.filter(([, j]) => (j.recall ?? 1) < 0.85);
  if (weakJudges.length > 0) {
    console.log(`\n${weakJudges.length} judges with recall < 85%:`);
    for (const [judgeId, judgeResult] of weakJudges) {
      const fn = judgeResult.falseNegatives ?? 0;
      const total = judgeResult.totalExpected ?? 0;
      console.log(`  - ${judgeId}: missing ${fn}/${total} expected findings`);
    }
  }

  console.log("\nDone.");
}

analyzeRecallGaps().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
