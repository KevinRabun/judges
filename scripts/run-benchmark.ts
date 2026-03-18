/**
 * Quick script to run the deterministic evaluators benchmark and print results.
 */
import { runBenchmarkSuite, BENCHMARK_CASES } from "../src/commands/benchmark.js";

function pct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function grade(f1: number): string {
  if (f1 >= 0.9) return "A";
  if (f1 >= 0.8) return "B";
  if (f1 >= 0.7) return "C";
  if (f1 >= 0.6) return "D";
  return "F";
}

console.log(`\nRunning deterministic evaluators benchmark (${BENCHMARK_CASES.length} cases)...\n`);

const start = Date.now();
const result = runBenchmarkSuite();
const duration = ((Date.now() - start) / 1000).toFixed(1);

console.log("=".repeat(60));
console.log(`  EVALUATORS BENCHMARK — Grade ${grade(result.f1Score)}`);
console.log("=".repeat(60));
console.log(`  Cases:          ${result.totalCases}`);
console.log(`  Detected:       ${result.detected} / ${result.totalCases} (${pct(result.detectionRate)})`);
console.log(`  True Positives: ${result.truePositives}`);
console.log(`  False Negatives:${result.falseNegatives}`);
console.log(`  False Positives:${result.falsePositives}`);
console.log(`  Precision:      ${pct(result.precision)}`);
console.log(`  Recall:         ${pct(result.recall)}`);
console.log(`  F1 Score:       ${pct(result.f1Score)}`);
console.log(`  Duration:       ${duration}s`);
console.log("");

// Strict metrics
console.log("  --- Strict (exact rule-ID match) ---");
console.log(`  Strict TP:      ${result.strictTruePositives}`);
console.log(`  Strict FN:      ${result.strictFalseNegatives}`);
console.log(`  Strict Precision: ${pct(result.strictPrecision)}`);
console.log(`  Strict Recall:    ${pct(result.strictRecall)}`);
console.log(`  Strict F1:        ${pct(result.strictF1Score)}`);
console.log("");

// Per-category
console.log("  --- Per Category ---");
const cats = Object.values(result.perCategory).sort((a, b) => a.f1Score - b.f1Score);
for (const cat of cats) {
  console.log(
    `  ${cat.category.padEnd(20)} F1=${pct(cat.f1Score).padEnd(7)} P=${pct(cat.precision).padEnd(7)} R=${pct(cat.recall).padEnd(7)} (${cat.total} cases)`,
  );
}
console.log("");

// Per-judge (worst precision first)
console.log("  --- Per Judge (worst precision first) ---");
const judges = Object.values(result.perJudge)
  .filter((j) => j.total >= 3)
  .sort((a, b) => a.precision - b.precision);
for (const j of judges.slice(0, 20)) {
  console.log(
    `  ${j.judgeId.padEnd(8)} P=${pct(j.precision).padEnd(7)} TP=${String(j.truePositives).padEnd(4)} FP=${String(j.falsePositives).padEnd(4)} total=${j.total}`,
  );
}
console.log("");

// Per-difficulty
console.log("  --- Per Difficulty ---");
const diffs = Object.values(result.perDifficulty);
for (const d of diffs) {
  console.log(`  ${d.difficulty.padEnd(12)} ${d.detected}/${d.total} (${pct(d.detectionRate)})`);
}
console.log("");

// Failed cases summary
const failed = result.cases.filter((c) => !c.passed);
if (failed.length > 0) {
  console.log(`  --- Failed Cases (${failed.length}) ---`);
  for (const c of failed.slice(0, 30)) {
    const missed = c.missedRuleIds.length > 0 ? `missed: ${c.missedRuleIds.join(",")}` : "";
    const fps = c.falsePositiveRuleIds.length > 0 ? `FP: ${c.falsePositiveRuleIds.join(",")}` : "";
    console.log(`  ${(c.caseId ?? "anon").substring(0, 30).padEnd(32)} ${c.category.padEnd(12)} ${missed} ${fps}`);
  }
  if (failed.length > 30) {
    console.log(`  ... and ${failed.length - 30} more`);
  }
}

console.log("\n" + "=".repeat(60));
console.log(`  FINAL GRADE: ${grade(result.f1Score)} (F1 = ${pct(result.f1Score)})`);
console.log("=".repeat(60) + "\n");
