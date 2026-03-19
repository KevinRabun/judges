/**
 * Local LLM Benchmark — runs the LLM benchmark scoring pipeline using
 * deterministic evaluators as the "LLM" layer. No API key required.
 *
 * This tests:
 * - P1: Fixed benchmark case expectedRuleIds
 * - P2: Meta-judge exclusion from tribunal (INTENT, COH, MFPR, FPR, OVER)
 * - P5: Scoring fix for dirty cases without unexpectedRuleIds
 * - Full LLM metrics pipeline (computeLlmMetrics)
 */
import { evaluateWithTribunal } from "../src/evaluators/index.js";
import { BENCHMARK_CASES } from "../src/commands/benchmark.js";
import {
  scoreLlmCase,
  computeLlmMetrics,
  selectStratifiedSample,
  TRIBUNAL_JUDGES,
} from "../src/commands/llm-benchmark.js";
import type { LlmCaseResult } from "../src/commands/llm-benchmark.js";
import type { BenchmarkCase } from "../src/commands/benchmark.js";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { parseArgs } from "util";

// ─── CLI args ───────────────────────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    "sample-size": { type: "string", default: "100" },
    "batch-size": { type: "string", default: "10" },
    full: { type: "boolean", default: false },
    output: { type: "string", default: "benchmarks" },
  },
});

const SAMPLE_SIZE = parseInt(values["sample-size"]!, 10);
const BATCH_SIZE = parseInt(values["batch-size"]!, 10);
const FULL = values["full"]!;
const OUTPUT_DIR = values["output"]!;

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

// ─── Main ───────────────────────────────────────────────────────────────────
const cases: BenchmarkCase[] = FULL ? [...BENCHMARK_CASES] : selectStratifiedSample(BENCHMARK_CASES, SAMPLE_SIZE);

console.log("\n+---------------------------------------------------+");
console.log("|   Local LLM Benchmark (deterministic evaluators)  |");
console.log("+---------------------------------------------------+\n");
console.log(`  Tribunal Judges:  ${TRIBUNAL_JUDGES.length}`);
console.log(`  Total Available:  ${BENCHMARK_CASES.length} cases`);
console.log(`  Selected:         ${cases.length} cases${FULL ? " (full)" : ` (stratified sample of ${SAMPLE_SIZE})`}`);
console.log(`  Batch Size:       ${BATCH_SIZE}`);
console.log(`  Output:           ${OUTPUT_DIR}\n`);

const startTime = Date.now();
const results: LlmCaseResult[] = [];
const totalBatches = Math.ceil(cases.length / BATCH_SIZE);

for (let i = 0; i < cases.length; i += BATCH_SIZE) {
  const batch = cases.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;

  for (const tc of batch) {
    // Run deterministic evaluators (the "LLM" proxy)
    const verdict = evaluateWithTribunal(tc.code, tc.language);
    const foundRuleIds = verdict.findings.map((f) => f.ruleId);

    // Build a simulated raw response (like an LLM would produce)
    const rawResponse =
      verdict.findings.length > 0
        ? verdict.findings.map((f) => `[${f.severity}] ${f.ruleId}: ${f.title}`).join("\n")
        : "No findings. PASS.";

    // Score using the LLM benchmark scoring function
    const result = scoreLlmCase(tc, foundRuleIds, rawResponse);
    results.push(result);
  }

  // ─── Intermediate report after each batch ──────────────────────────
  const completedCount = results.length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Compute running metrics
  let runTP = 0,
    runFN = 0,
    runFP = 0,
    _runDetected = 0;
  for (const r of results) {
    const tp = r.expectedRuleIds.length - r.missedRuleIds.length;
    runTP += tp;
    runFN += r.missedRuleIds.length;
    runFP += r.falsePositiveRuleIds.length;
    if (r.passed) _runDetected++;
  }
  const runP = runTP + runFP > 0 ? runTP / (runTP + runFP) : 1;
  const runR = runTP + runFN > 0 ? runTP / (runTP + runFN) : 1;
  const runF1 = runP + runR > 0 ? (2 * runP * runR) / (runP + runR) : 0;

  const statusChar = runF1 >= 0.9 ? "A" : runF1 >= 0.8 ? "B" : runF1 >= 0.7 ? "C" : runF1 >= 0.6 ? "D" : "F";
  const bar = "█".repeat(Math.round((completedCount / cases.length) * 30));
  const empty = "░".repeat(30 - Math.round((completedCount / cases.length) * 30));

  console.log(`  [${bar}${empty}] ${completedCount}/${cases.length} | Batch ${batchNum}/${totalBatches} | ${elapsed}s`);
  console.log(
    `    F1=${pct(runF1)} P=${pct(runP)} R=${pct(runR)} TP=${runTP} FP=${runFP} FN=${runFN} | Grade ${statusChar}`,
  );

  // Early stop check: if after 30+ cases the grade is F, warn
  if (completedCount >= 30 && statusChar === "F") {
    console.log(`\n  *** WARNING: Trending toward F after ${completedCount} cases. Continuing but flagging. ***\n`);
  }
}

// ─── Final Metrics ──────────────────────────────────────────────────────────
const duration = Math.round((Date.now() - startTime) / 1000);
const snapshot = computeLlmMetrics(results, "local-eval", "deterministic-evaluators", "local", "tribunal", duration);

console.log("\n" + "=".repeat(60));
console.log(`  LOCAL LLM BENCHMARK — Grade ${grade(snapshot.f1Score)}`);
console.log("=".repeat(60));
console.log(`  Cases:          ${snapshot.totalCases}`);
console.log(`  Detected:       ${snapshot.detected} / ${snapshot.totalCases} (${pct(snapshot.detectionRate)})`);
console.log(`  True Positives: ${snapshot.truePositives}`);
console.log(`  False Negatives:${snapshot.falseNegatives}`);
console.log(`  False Positives:${snapshot.falsePositives}`);
console.log(`  Precision:      ${pct(snapshot.precision)}`);
console.log(`  Recall:         ${pct(snapshot.recall)}`);
console.log(`  F1 Score:       ${pct(snapshot.f1Score)}`);
console.log(`  Duration:       ${duration}s`);
console.log("");

// Per-category
console.log("  --- Per Category (worst F1 first) ---");
const cats = Object.values(snapshot.perCategory).sort((a, b) => a.f1Score - b.f1Score);
for (const cat of cats) {
  console.log(
    `  ${cat.category.padEnd(24)} F1=${pct(cat.f1Score).padEnd(7)} P=${pct(cat.precision).padEnd(7)} R=${pct(cat.recall).padEnd(7)} (${cat.total} cases)`,
  );
}
console.log("");

// Per-judge (worst precision first)
console.log("  --- Per Judge (worst precision first, min 3 findings) ---");
const judges = Object.values(snapshot.perJudge)
  .filter((j) => j.total >= 3)
  .sort((a, b) => a.precision - b.precision);
for (const j of judges.slice(0, 25)) {
  console.log(
    `  ${j.judgeId.padEnd(8)} P=${pct(j.precision).padEnd(7)} R=${pct(j.recall).padEnd(7)} TP=${String(j.truePositives).padEnd(4)} FP=${String(j.falsePositives).padEnd(4)} total=${j.total}`,
  );
}
console.log("");

// Per-difficulty
console.log("  --- Per Difficulty ---");
for (const diff of ["easy", "medium", "hard"]) {
  const d = snapshot.perDifficulty[diff];
  if (d) console.log(`  ${diff.padEnd(12)} ${d.detected}/${d.total} (${pct(d.detectionRate)})`);
}
console.log("");

// Failed cases
const failed = snapshot.cases.filter((c) => !c.passed);
if (failed.length > 0) {
  console.log(`  --- Failed Cases (${failed.length} of ${snapshot.totalCases}) ---`);
  for (const c of failed.slice(0, 30)) {
    const missed = c.missedRuleIds.length > 0 ? `missed=${c.missedRuleIds.join(",")}` : "";
    const fps = c.falsePositiveRuleIds.length > 0 ? `FP=${c.falsePositiveRuleIds.join(",")}` : "";
    console.log(`  ${c.caseId.substring(0, 35).padEnd(37)} ${c.category.padEnd(14)} ${missed} ${fps}`);
  }
  if (failed.length > 30) console.log(`  ... and ${failed.length - 30} more`);
}

// Save snapshot
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(resolve(OUTPUT_DIR, "local-llm-benchmark.json"), JSON.stringify(snapshot, null, 2));

console.log("\n" + "=".repeat(60));
console.log(`  FINAL GRADE: ${grade(snapshot.f1Score)} (F1 = ${pct(snapshot.f1Score)})`);
console.log("=".repeat(60) + "\n");
console.log(`  Snapshot saved to ${OUTPUT_DIR}/local-llm-benchmark.json\n`);
