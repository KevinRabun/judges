/**
 * Copilot LLM Benchmark Harness
 *
 * Phase 1: Generate stratified sample cases for Copilot evaluation.
 * Phase 2: Score Copilot's responses (run after collecting responses).
 *
 * Usage:
 *   npx tsx scripts/copilot-llm-benchmark.ts generate --sample-size 40
 *   npx tsx scripts/copilot-llm-benchmark.ts score
 */
import { BENCHMARK_CASES } from "../src/commands/benchmark.js";
import {
  constructTribunalPrompt,
  selectStratifiedSample,
  scoreLlmCase,
  computeLlmMetrics,
  extractValidatedLlmFindings,
  parseLlmRuleIds,
  getValidRulePrefixes,
  getTribunalValidPrefixes,
  TRIBUNAL_JUDGES,
} from "../src/commands/llm-benchmark.js";
import type { BenchmarkCase } from "../src/commands/benchmark.js";
import type { LlmCaseResult } from "../src/commands/llm-benchmark.js";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { parseArgs } from "util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "sample-size": { type: "string", default: "40" },
    output: { type: "string", default: "benchmarks/copilot-llm" },
  },
});

const command = positionals[0] ?? "generate";
const SAMPLE_SIZE = parseInt(values["sample-size"]!, 10);
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

// ─── GENERATE ───────────────────────────────────────────────────────────────
if (command === "generate") {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const cases = selectStratifiedSample(BENCHMARK_CASES, SAMPLE_SIZE);

  console.log(`Selected ${cases.length} stratified cases from ${BENCHMARK_CASES.length} total`);
  console.log(`Tribunal judges: ${TRIBUNAL_JUDGES.length}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Save case manifest (what we expect)
  const manifest = cases.map((tc, i) => ({
    index: i,
    id: tc.id,
    category: tc.category,
    difficulty: tc.difficulty,
    language: tc.language,
    expectedRuleIds: tc.expectedRuleIds,
    unexpectedRuleIds: tc.unexpectedRuleIds ?? [],
    codePreview: tc.code.substring(0, 80).replace(/\n/g, "\\n"),
  }));
  writeFileSync(resolve(OUTPUT_DIR, "case-manifest.json"), JSON.stringify(manifest, null, 2));

  // Save full cases (needed for scoring)
  const fullCases = cases.map((tc, i) => ({
    index: i,
    id: tc.id,
    category: tc.category,
    difficulty: tc.difficulty,
    language: tc.language,
    code: tc.code,
    expectedRuleIds: tc.expectedRuleIds,
    unexpectedRuleIds: tc.unexpectedRuleIds ?? [],
  }));
  writeFileSync(resolve(OUTPUT_DIR, "cases.json"), JSON.stringify(fullCases, null, 2));

  // Generate prompts for each case
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const prompt = constructTribunalPrompt(tc.code, tc.language, []);
    writeFileSync(resolve(OUTPUT_DIR, `prompt-${String(i).padStart(3, "0")}.txt`), prompt);
  }

  // Create empty responses file for Copilot to fill
  const emptyResponses: Record<string, string> = {};
  for (let i = 0; i < cases.length; i++) {
    emptyResponses[String(i)] = "";
  }
  writeFileSync(resolve(OUTPUT_DIR, "responses.json"), JSON.stringify(emptyResponses, null, 2));

  // Print summary for easy review
  console.log("Case Summary:");
  console.log("─".repeat(80));
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const expected = tc.expectedRuleIds.length > 0 ? tc.expectedRuleIds.join(", ") : "(clean)";
    console.log(
      `  [${String(i).padStart(3)}] ${tc.id.padEnd(40)} ${tc.category.padEnd(20)} ${tc.difficulty.padEnd(8)} → ${expected}`,
    );
  }
  console.log("\n─".repeat(80));
  console.log(`\nGenerated ${cases.length} prompts in ${OUTPUT_DIR}/prompt-*.txt`);
  console.log(
    `Fill responses in ${OUTPUT_DIR}/responses.json, then run: npx tsx scripts/copilot-llm-benchmark.ts score\n`,
  );
}

// ─── SCORE ──────────────────────────────────────────────────────────────────
else if (command === "score") {
  const casesPath = resolve(OUTPUT_DIR, "cases.json");
  const responsesPath = resolve(OUTPUT_DIR, "responses.json");

  if (!existsSync(casesPath) || !existsSync(responsesPath)) {
    console.error("Missing cases.json or responses.json. Run 'generate' first.");
    process.exit(1);
  }

  const cases: Array<BenchmarkCase & { index: number }> = JSON.parse(readFileSync(casesPath, "utf-8"));
  const responses: Record<string, string> = JSON.parse(readFileSync(responsesPath, "utf-8"));
  const validPrefixes = getTribunalValidPrefixes();

  console.log(`\nScoring ${cases.length} cases...\n`);

  const results: LlmCaseResult[] = [];
  let answered = 0;
  let skipped = 0;

  for (const tc of cases) {
    const response = responses[String(tc.index)] ?? "";
    if (!response.trim()) {
      skipped++;
      continue;
    }
    answered++;

    const validation = extractValidatedLlmFindings(response, validPrefixes);
    const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);
    const result = scoreLlmCase(tc, ruleIds, response.substring(0, 1000));
    results.push(result);
  }

  if (results.length === 0) {
    console.error("No responses found. Fill responses.json first.");
    process.exit(1);
  }

  const snapshot = computeLlmMetrics(results, "copilot-eval", "copilot-claude-opus-4", "vscode-copilot", "tribunal", 0);

  console.log("=".repeat(60));
  console.log(`  COPILOT LLM BENCHMARK — Grade ${grade(snapshot.f1Score)}`);
  console.log("=".repeat(60));
  console.log(`  Cases Scored:   ${answered} (${skipped} skipped)`);
  console.log(`  Detected:       ${snapshot.detected} / ${snapshot.totalCases} (${pct(snapshot.detectionRate)})`);
  console.log(`  True Positives: ${snapshot.truePositives}`);
  console.log(`  False Negatives:${snapshot.falseNegatives}`);
  console.log(`  False Positives:${snapshot.falsePositives}`);
  console.log(`  Precision:      ${pct(snapshot.precision)}`);
  console.log(`  Recall:         ${pct(snapshot.recall)}`);
  console.log(`  F1 Score:       ${pct(snapshot.f1Score)}`);
  console.log("");

  // Per-judge
  const judges = Object.values(snapshot.perJudge)
    .filter((j) => j.total >= 2)
    .sort((a, b) => a.precision - b.precision);
  if (judges.length > 0) {
    console.log("  --- Per Judge (worst precision first) ---");
    for (const j of judges.slice(0, 20)) {
      console.log(
        `  ${j.judgeId.padEnd(8)} P=${pct(j.precision).padEnd(7)} TP=${String(j.truePositives).padEnd(4)} FP=${String(j.falsePositives).padEnd(4)} total=${j.total}`,
      );
    }
    console.log("");
  }

  // Failed cases
  const failed = snapshot.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    console.log(`  --- Failed Cases (${failed.length}) ---`);
    for (const c of failed.slice(0, 25)) {
      const missed = c.missedRuleIds.length > 0 ? `missed=${c.missedRuleIds.join(",")}` : "";
      const fps = c.falsePositiveRuleIds.length > 0 ? `FP=${c.falsePositiveRuleIds.join(",")}` : "";
      console.log(`  ${c.caseId.substring(0, 35).padEnd(37)} ${c.category.padEnd(14)} ${missed} ${fps}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  FINAL GRADE: ${grade(snapshot.f1Score)} (F1 = ${pct(snapshot.f1Score)})`);
  console.log("=".repeat(60) + "\n");

  writeFileSync(resolve(OUTPUT_DIR, "copilot-snapshot.json"), JSON.stringify(snapshot, null, 2));
  console.log(`  Snapshot saved to ${OUTPUT_DIR}/copilot-snapshot.json\n`);
}

// ─── SCORE-INLINE — score from inline responses embedded in a single file ──
else if (command === "score-inline") {
  const inlinePath = resolve(OUTPUT_DIR, "inline-responses.json");
  if (!existsSync(inlinePath)) {
    console.error(`Missing ${inlinePath}`);
    process.exit(1);
  }
  // Same as score but reads inline-responses.json
  const data: Array<{ index: number; ruleIds: string[] }> = JSON.parse(readFileSync(inlinePath, "utf-8"));
  const casesRaw: Array<BenchmarkCase & { index: number }> = JSON.parse(
    readFileSync(resolve(OUTPUT_DIR, "cases.json"), "utf-8"),
  );

  const results: LlmCaseResult[] = [];
  for (const entry of data) {
    const tc = casesRaw.find((c) => c.index === entry.index);
    if (!tc) continue;
    const result = scoreLlmCase(tc, entry.ruleIds, entry.ruleIds.join(", "));
    results.push(result);
  }

  const snapshot = computeLlmMetrics(results, "copilot-eval", "copilot-claude-opus-4", "vscode-copilot", "tribunal", 0);

  console.log("=".repeat(60));
  console.log(`  COPILOT LLM BENCHMARK — Grade ${grade(snapshot.f1Score)}`);
  console.log("=".repeat(60));
  console.log(`  Cases:          ${snapshot.totalCases}`);
  console.log(`  Detected:       ${snapshot.detected} / ${snapshot.totalCases} (${pct(snapshot.detectionRate)})`);
  console.log(`  True Positives: ${snapshot.truePositives}`);
  console.log(`  False Negatives:${snapshot.falseNegatives}`);
  console.log(`  False Positives:${snapshot.falsePositives}`);
  console.log(`  Precision:      ${pct(snapshot.precision)}`);
  console.log(`  Recall:         ${pct(snapshot.recall)}`);
  console.log(`  F1 Score:       ${pct(snapshot.f1Score)}`);

  const failed = snapshot.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    console.log(`\n  --- Failed Cases (${failed.length}) ---`);
    for (const c of failed) {
      const missed = c.missedRuleIds.length > 0 ? `missed=${c.missedRuleIds.join(",")}` : "";
      const fps = c.falsePositiveRuleIds.length > 0 ? `FP=${c.falsePositiveRuleIds.join(",")}` : "";
      console.log(`  ${c.caseId.substring(0, 35).padEnd(37)} ${c.category.padEnd(14)} ${missed} ${fps}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  FINAL GRADE: ${grade(snapshot.f1Score)} (F1 = ${pct(snapshot.f1Score)})`);
  console.log("=".repeat(60) + "\n");

  writeFileSync(resolve(OUTPUT_DIR, "copilot-snapshot.json"), JSON.stringify(snapshot, null, 2));
} else {
  console.error(`Unknown command: ${command}. Use 'generate', 'score', or 'score-inline'.`);
  process.exit(1);
}
