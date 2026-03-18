#!/usr/bin/env npx tsx
/**
 * Headless LLM Benchmark Hill-Climber
 *
 * Runs the LLM benchmark against the Anthropic API in a tight loop,
 * using the self-teaching optimizer to iteratively improve prompts
 * until F1 reaches grade A (≥90%).
 *
 * Usage:
 *   $env:ANTHROPIC_API_KEY = "sk-..."
 *   npx tsx scripts/hill-climb-benchmark.ts [options]
 *
 * Options:
 *   --max-iterations N   Max hill-climb iterations (default: 5)
 *   --sample-size N      Benchmark cases per run (default: 40)
 *   --target-f1 N        Target F1 score 0-1 (default: 0.90)
 *   --model NAME         Anthropic model (default: claude-sonnet-4-20250514)
 *   --concurrency N      Parallel requests (default: 4)
 *   --output DIR         Output directory (default: benchmarks)
 *   --dry-run            Show config and exit
 *
 * The API key is ONLY read from the environment variable.
 * It is never written to any file, log, or output.
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  BENCHMARK_CASES,
  JUDGES,
  parseLlmRuleIds,
  scoreLlmCase,
  computeLlmMetrics,
  constructTribunalPrompt,
  selectStratifiedSample,
  extractValidatedLlmFindings,
  getValidRulePrefixes,
  optimizeBenchmark,
  createEmptyStore,
  mergeAmendments,
  formatAmendmentSection,
} from "../src/api.js";

import type {
  BenchmarkCase,
  LlmBenchmarkSnapshot,
  LlmCaseResult,
  PromptAmendment,
  AmendmentStore,
  OptimizationResult,
} from "../src/api.js";

// ─── CLI Parsing ────────────────────────────────────────────────────────────

const { values: opts } = parseArgs({
  options: {
    "max-iterations": { type: "string", default: "5" },
    "sample-size": { type: "string", default: "40" },
    "target-f1": { type: "string", default: "0.90" },
    model: { type: "string", default: "claude-sonnet-4-20250514" },
    concurrency: { type: "string", default: "4" },
    output: { type: "string", default: "benchmarks" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const MAX_ITERATIONS = parseInt(opts["max-iterations"]!, 10);
const SAMPLE_SIZE = Math.min(200, parseInt(opts["sample-size"]!, 10));
const TARGET_F1 = parseFloat(opts["target-f1"]!);
const MODEL = opts.model!;
const CONCURRENCY = Math.max(1, Math.min(10, parseInt(opts.concurrency!, 10)));
const OUTPUT_DIR = resolve(opts.output!);
const DRY_RUN = opts["dry-run"]!;
const MAX_TOKENS = 4096;

// ─── Helpers ────────────────────────────────────────────────────────────────

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const grade = (f1: number) =>
  f1 >= 0.9 ? "A [PASS]" : f1 >= 0.8 ? "B [OK]" : f1 >= 0.7 ? "C [WARN]" : f1 >= 0.6 ? "D [WARN]" : "F [FAIL]";

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Amendment Store I/O ────────────────────────────────────────────────────

const STORE_PATH = resolve(OUTPUT_DIR, "hill-climb-amendments.json");
const CHECKPOINT_PATH = resolve(OUTPUT_DIR, "hill-climb-checkpoint.json");
const CASES_PATH = resolve(OUTPUT_DIR, "hill-climb-cases.json");

interface BatchCheckpoint {
  iteration: number;
  completedBatches: number;
  results: LlmCaseResult[];
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  startTime: number;
  caseIds: string[];
}

// ─── Persisted Case Selection ───────────────────────────────────────────────
// Ensures re-starts use the exact same case IDs so checkpoint can resume.

function loadPersistedCases(): BenchmarkCase[] | null {
  if (existsSync(CASES_PATH)) {
    try {
      const ids = JSON.parse(readFileSync(CASES_PATH, "utf-8")) as string[];
      const caseMap = new Map(BENCHMARK_CASES.map((c) => [c.id ?? c.code.slice(0, 40), c]));
      const matched = ids.map((id) => caseMap.get(id)).filter(Boolean) as BenchmarkCase[];
      if (matched.length === ids.length) {
        return matched;
      }
    } catch {
      /* corrupted, will be re-created */
    }
  }
  return null;
}

function persistCases(cases: BenchmarkCase[]): void {
  const ids = cases.map((c) => c.id ?? c.code.slice(0, 40));
  writeFileSync(CASES_PATH, JSON.stringify(ids, null, 2));
}

function clearPersistedCases(): void {
  if (existsSync(CASES_PATH)) {
    try {
      unlinkSync(CASES_PATH);
    } catch {
      /* ok */
    }
  }
}

function loadCheckpoint(): BatchCheckpoint | null {
  if (existsSync(CHECKPOINT_PATH)) {
    try {
      return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as BatchCheckpoint;
    } catch {
      return null;
    }
  }
  return null;
}

function saveCheckpoint(cp: BatchCheckpoint): void {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

function clearCheckpoint(): void {
  if (existsSync(CHECKPOINT_PATH)) {
    try {
      unlinkSync(CHECKPOINT_PATH);
    } catch {
      /* ok */
    }
  }
}

function loadStore(): AmendmentStore {
  if (existsSync(STORE_PATH)) {
    try {
      const raw = readFileSync(STORE_PATH, "utf-8");
      const store = JSON.parse(raw) as AmendmentStore;
      if (store.version === 1) return store;
    } catch {
      /* corrupted, start fresh */
    }
  }
  return createEmptyStore();
}

function saveStore(store: AmendmentStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// ─── Anthropic API Caller ───────────────────────────────────────────────────

let _client: Anthropic;
let _totalCalls = 0;
let _totalInputTokens = 0;
let _totalOutputTokens = 0;

async function sendPrompt(prompt: string, retries = 2): Promise<string> {
  _totalCalls++;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await _client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      _totalInputTokens += response.usage?.input_tokens ?? 0;
      _totalOutputTokens += response.usage?.output_tokens ?? 0;

      if (text.trim().length > 0) return text;

      if (attempt < retries) {
        log(`  Empty response attempt ${attempt + 1}/${retries + 1}, retrying...`);
        await delay(2000 * Math.pow(2, attempt));
      }
    } catch (error) {
      if (attempt < retries) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`  Error attempt ${attempt + 1}: ${msg}, retrying...`);
        await delay(3000 * Math.pow(2, attempt));
      } else {
        throw error;
      }
    }
  }

  return "";
}

// ─── Batch LLM Execution ───────────────────────────────────────────────────

async function runTribunalBenchmark(
  cases: BenchmarkCase[],
  amendments: PromptAmendment[],
  iteration: number,
): Promise<LlmCaseResult[]> {
  const validPrefixes = getValidRulePrefixes();
  const totalBatches = Math.ceil(cases.length / CONCURRENCY);

  // Check for checkpoint to resume from
  const cp = loadCheckpoint();
  let results: LlmCaseResult[] = [];
  let startBatch = 0;

  if (
    cp &&
    cp.iteration === iteration &&
    cp.caseIds.join(",") === cases.map((c) => c.id ?? c.code.slice(0, 40)).join(",")
  ) {
    results = cp.results;
    startBatch = cp.completedBatches;
    _totalCalls = cp.totalCalls;
    _totalInputTokens = cp.totalInputTokens;
    _totalOutputTokens = cp.totalOutputTokens;
    log(
      `  Resuming from checkpoint: ${startBatch}/${totalBatches} batches already complete (${results.length} results)`,
    );
  }

  // Process in concurrent batches
  for (let i = startBatch * CONCURRENCY; i < cases.length; i += CONCURRENCY) {
    const batch = cases.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;

    log(`  Batch ${batchNum}/${totalBatches} (${batch.length} cases)...`);

    const batchResults = await Promise.all(
      batch.map(async (tc) => {
        const prompt = constructTribunalPrompt(tc.code, tc.language, [], amendments);
        const response = await sendPrompt(prompt);
        const validation = extractValidatedLlmFindings(response, validPrefixes);
        const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);
        const truncated = response.length > 1000 ? response.slice(0, 1000) + "..." : response;
        return scoreLlmCase(tc, ruleIds, truncated);
      }),
    );

    results.push(...batchResults);

    // Save checkpoint after EVERY batch
    saveCheckpoint({
      iteration,
      completedBatches: batchNum,
      results,
      totalCalls: _totalCalls,
      totalInputTokens: _totalInputTokens,
      totalOutputTokens: _totalOutputTokens,
      startTime: Date.now(),
      caseIds: cases.map((c) => c.id ?? c.code.slice(0, 40)),
    });
    log(`    ✓ Checkpoint saved (${results.length}/${cases.length} results)`);

    // Brief delay between batches to respect rate limits
    if (i + CONCURRENCY < cases.length) {
      await delay(500);
    }
  }

  // Clear checkpoint on successful completion
  clearCheckpoint();
  return results;
}

// ─── Snapshot Formatting ────────────────────────────────────────────────────

function formatReport(snapshot: LlmBenchmarkSnapshot, iteration: number, opt?: OptimizationResult): string {
  const lines: string[] = [];
  lines.push(`# Hill-Climb Benchmark — Iteration ${iteration}`);
  lines.push("");
  lines.push(
    `> **Model:** ${snapshot.model} · **Time:** ${new Date().toISOString()} · **Cases:** ${snapshot.totalCases}`,
  );
  lines.push("");
  lines.push(`## Results: Grade ${grade(snapshot.f1Score)}`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| F1 Score | **${pct(snapshot.f1Score)}** |`);
  lines.push(`| Precision | ${pct(snapshot.precision)} |`);
  lines.push(`| Recall | ${pct(snapshot.recall)} |`);
  lines.push(`| Detection Rate | ${pct(snapshot.detectionRate)} |`);
  lines.push(`| True Positives | ${snapshot.truePositives} |`);
  lines.push(`| False Negatives | ${snapshot.falseNegatives} |`);
  lines.push(`| False Positives | ${snapshot.falsePositives} |`);
  lines.push(`| API Calls | ${_totalCalls} |`);
  lines.push(`| Tokens (in/out) | ${_totalInputTokens.toLocaleString()} / ${_totalOutputTokens.toLocaleString()} |`);
  lines.push(`| Duration | ${snapshot.durationSeconds}s |`);
  lines.push("");

  // Per-judge FP table (sorted by precision ascending — worst first)
  const judgeEntries = Object.entries(snapshot.perJudge)
    .filter(([, s]) => s.total >= 3)
    .sort(([, a], [, b]) => a.precision - b.precision);

  if (judgeEntries.length > 0) {
    lines.push("## Per-Judge Precision (worst first)");
    lines.push("");
    lines.push("| Judge | Findings | TP | FP | Precision |");
    lines.push("|-------|----------|-----|-----|-----------|");
    for (const [prefix, stats] of judgeEntries.slice(0, 20)) {
      lines.push(
        `| ${prefix} | ${stats.total} | ${stats.truePositives} | ${stats.falsePositives} | ${pct(stats.precision)} |`,
      );
    }
    lines.push("");
  }

  // Failed cases
  const failed = snapshot.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    lines.push("## Failed Cases");
    lines.push("");
    lines.push("| Case | Category | Missed | False Positives |");
    lines.push("|------|----------|--------|-----------------|");
    for (const c of failed.slice(0, 30)) {
      const missed = c.missedRuleIds.length > 0 ? c.missedRuleIds.join(", ") : "—";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "—";
      lines.push(`| ${c.caseId} | ${c.category} | ${missed} | ${fps} |`);
    }
    lines.push("");
  }

  // Optimizer insights
  if (opt) {
    lines.push("## Self-Teaching Insights");
    lines.push("");
    lines.push(`Projected improvement: +${pct(opt.projectedF1Improvement)} → ${pct(opt.summary.projectedF1)}`);
    lines.push("");
    if (opt.insights.length > 0) {
      for (const i of opt.insights) {
        lines.push(`- **[${i.severity}] ${i.target}**: ${i.recommendation}`);
      }
      lines.push("");
    }
    if (opt.amendments.length > 0) {
      lines.push("### New Amendments");
      lines.push("");
      for (const a of opt.amendments) {
        lines.push(`- **${a.judgePrefix}** (FP rate ${pct(a.fpRate)}): ${a.reason}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Main Hill-Climb Loop ───────────────────────────────────────────────────

async function main() {
  console.log("\n+----------------------------------------------+");
  console.log("|   Judges Panel -- Hill-Climb LLM Benchmark   |");
  console.log("+----------------------------------------------+\n");
  console.log(`  Model:          ${MODEL}`);
  console.log(`  Sample Size:    ${SAMPLE_SIZE} cases`);
  console.log(`  Concurrency:    ${CONCURRENCY} parallel`);
  console.log(`  Target F1:      ${pct(TARGET_F1)} (grade A)`);
  console.log(`  Max Iterations: ${MAX_ITERATIONS}`);
  console.log(`  Output:         ${OUTPUT_DIR}`);
  console.log(`  Total Cases:    ${BENCHMARK_CASES.length} available\n`);

  if (DRY_RUN) {
    console.log("  [dry-run] Exiting before API calls.\n");
    process.exit(0);
  }

  // Validate API key from environment only — after dry-run check
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ERROR: ANTHROPIC_API_KEY environment variable is not set.");
    console.error("Set it with: $env:ANTHROPIC_API_KEY = 'sk-ant-...'");
    process.exit(1);
  }

  if (apiKey.length < 20) {
    console.error("ERROR: ANTHROPIC_API_KEY appears invalid (too short).");
    process.exit(1);
  }

  const redactedKey = apiKey.slice(0, 10) + "..." + apiKey.slice(-4);
  console.log(`  API Key:        ${redactedKey}\n`);

  // Initialize
  _client = new Anthropic({ apiKey });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let store = loadStore();
  let bestF1 = 0;
  let bestSnapshot: LlmBenchmarkSnapshot | undefined;

  // Resume persisted case selection, or create new one.
  // This ensures restarts use the EXACT same cases so checkpoints can resume.
  let cases = loadPersistedCases();
  if (cases) {
    log(`Resumed ${cases.length} persisted cases from previous run`);
  } else {
    cases = selectStratifiedSample(BENCHMARK_CASES, SAMPLE_SIZE);
    persistCases(cases);
    log(`Selected ${cases.length} stratified cases (persisted for resume)`);
  }

  // SIGINT handler: save checkpoint gracefully on Ctrl+C / kill
  let interrupted = false;
  const onSignal = () => {
    if (interrupted) return; // prevent double-fire
    interrupted = true;
    log("INTERRUPTED -- saving checkpoint and exiting gracefully...");
    // Checkpoint is already saved after every batch inside runTribunalBenchmark.
    // Store is saved after every iteration. Just log and exit.
    saveStore(store);
    log("Checkpoint and store saved. Re-run the same command to resume.");
    process.exit(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  ITERATION ${iteration}/${MAX_ITERATIONS}`);
    console.log(`  Active amendments: ${store.amendments.length}`);
    console.log(`${"=".repeat(50)}\n`);

    _totalCalls = 0;
    _totalInputTokens = 0;
    _totalOutputTokens = 0;
    const startTime = Date.now();

    // 1. Run benchmark
    log(`Running tribunal benchmark (${cases.length} cases, concurrency=${CONCURRENCY})...`);
    const results = await runTribunalBenchmark(cases, store.amendments, iteration);
    const duration = Math.round((Date.now() - startTime) / 1000);

    // 2. Compute metrics
    const snapshot = computeLlmMetrics(results, "hill-climb", MODEL, "anthropic", "tribunal", duration);

    log(`Results: F1=${pct(snapshot.f1Score)} P=${pct(snapshot.precision)} R=${pct(snapshot.recall)}`);
    log(`  TP=${snapshot.truePositives} FP=${snapshot.falsePositives} FN=${snapshot.falseNegatives}`);
    log(`  Grade: ${grade(snapshot.f1Score)}`);
    log(`  ${_totalCalls} API calls, ${_totalInputTokens + _totalOutputTokens} tokens, ${duration}s`);

    // 3. Check if we've reached the target
    if (snapshot.f1Score >= TARGET_F1) {
      console.log(
        `\n*** TARGET REACHED! F1=${pct(snapshot.f1Score)} >= ${pct(TARGET_F1)} (Grade ${grade(snapshot.f1Score)})`,
      );
      bestF1 = snapshot.f1Score;
      bestSnapshot = snapshot;

      // Save final results
      const report = formatReport(snapshot, iteration);
      writeFileSync(resolve(OUTPUT_DIR, "hill-climb-report.md"), report);
      writeFileSync(resolve(OUTPUT_DIR, "hill-climb-snapshot.json"), JSON.stringify(snapshot, null, 2));
      saveStore(store);
      clearPersistedCases();
      clearCheckpoint();
      break;
    }

    // 4. Run optimizer to generate amendments
    log("Running self-teaching optimizer...");
    const optimization = optimizeBenchmark(snapshot, store.amendments);

    log(`  ${optimization.insights.length} insights, ${optimization.amendments.length} new amendments`);
    log(`  Projected: ${pct(optimization.summary.currentF1)} → ${pct(optimization.summary.projectedF1)}`);

    for (const insight of optimization.insights.slice(0, 5)) {
      log(`  [${insight.severity}] ${insight.target}: ${insight.recommendation.slice(0, 100)}`);
    }

    // 5. Merge amendments into store
    store = mergeAmendments(store, optimization, snapshot.f1Score);
    saveStore(store);
    log(`Amendment store: ${store.amendments.length} active, ${store.history.length} iterations recorded`);

    // 6. Save iteration results
    const report = formatReport(snapshot, iteration, optimization);
    writeFileSync(resolve(OUTPUT_DIR, `hill-climb-iter-${iteration}.md`), report);
    writeFileSync(resolve(OUTPUT_DIR, `hill-climb-snapshot-iter-${iteration}.json`), JSON.stringify(snapshot, null, 2));

    // Track best
    if (snapshot.f1Score > bestF1) {
      bestF1 = snapshot.f1Score;
      bestSnapshot = snapshot;
      writeFileSync(resolve(OUTPUT_DIR, "hill-climb-report.md"), report);
      writeFileSync(resolve(OUTPUT_DIR, "hill-climb-snapshot.json"), JSON.stringify(snapshot, null, 2));
    }

    // 7. Log amendment summaries
    if (store.amendments.length > 0) {
      log("Active amendments for next iteration:");
      for (const a of store.amendments) {
        log(`  - ${a.judgePrefix}: ${a.reason}`);
      }
    }
  }

  // ─── Final Summary ────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`);
  console.log("  HILL-CLIMB COMPLETE");
  console.log(`${"=".repeat(50)}\n`);

  if (bestSnapshot) {
    console.log(`  Best F1:     ${pct(bestSnapshot.f1Score)} (${grade(bestSnapshot.f1Score)})`);
    console.log(`  Precision:   ${pct(bestSnapshot.precision)}`);
    console.log(`  Recall:      ${pct(bestSnapshot.recall)}`);
    console.log(`  Amendments:  ${store.amendments.length} active`);
    console.log(`  Reports:     ${OUTPUT_DIR}\n`);

    if (bestSnapshot.f1Score < TARGET_F1) {
      console.log(`  WARNING: Did not reach target F1=${pct(TARGET_F1)} after ${MAX_ITERATIONS} iterations.`);
      console.log(
        `  Consider: --max-iterations ${MAX_ITERATIONS + 3} or --sample-size ${Math.min(200, SAMPLE_SIZE + 20)}\n`,
      );
    }
  } else {
    console.log("  No results produced.\n");
  }

  // Save final store and clean up case list (run completed normally)
  saveStore(store);
  clearPersistedCases();
  clearCheckpoint();
}

main().catch((err) => {
  // Save amendment store on fatal error so progress is not lost
  try {
    saveStore(loadStore());
  } catch {
    /* best effort */
  }
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  console.error("Checkpoint and store have been saved. Re-run the same command to resume.");
  process.exit(1);
});
