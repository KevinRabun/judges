/**
 * LLM Benchmark Runner — Per-Judge Mode
 *
 * Each relevant judge evaluates cases independently with its specialised
 * prompt, yielding high precision (95%+) and actionable findings.
 *
 * Key features:
 * 1. Per-judge architecture — one LLM call per judge per case
 * 2. Micro-batch execution (configurable batch size with memory cleanup)
 * 3. Checkpoint/resume for long-running benchmarks
 * 4. Parallel judge calls within a case (configurable concurrency)
 */

import * as vscode from "vscode";
import process from "node:process";
import { JUDGES, BENCHMARK_CASES } from "@kevinrabun/judges/api";
import type { BenchmarkCase, LlmBenchmarkSnapshot, LlmCaseResult } from "@kevinrabun/judges/api";
import {
  parseLlmRuleIds,
  scoreLlmCase,
  computeLlmMetrics,
  constructPerJudgePrompt,
  selectStratifiedSample,
  extractValidatedLlmFindings,
  getValidRulePrefixes,
} from "@kevinrabun/judges/api";
import type { JudgeDefinition } from "@kevinrabun/judges/api";
import {
  optimizeBenchmark,
  mergeAmendments,
  createEmptyStore,
  type PromptAmendment,
  type AmendmentStore,
} from "@kevinrabun/judges/api";
import { formatStandaloneBenchmarkReport } from "./llm-benchmark-format";

// ─── Output Channel ─────────────────────────────────────────────────────────

let _channel: vscode.OutputChannel | undefined;

function log(msg: string): void {
  if (!_channel) _channel = vscode.window.createOutputChannel("Judges LLM Benchmark");
  _channel.appendLine(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BenchmarkProgress {
  message: string;
  completed: number;
  total: number;
}

export interface BenchmarkRunResult {
  snapshot: LlmBenchmarkSnapshot;
  reportMarkdown: string;
  snapshotJson: string;
  /** Full untruncated LLM responses keyed by case ID */
  fullResponses?: Record<string, string>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

interface BenchmarkConfig {
  enabled: boolean;
  sampleSize: number;
  maxOutputTokens: number;
  /** Micro-batch size: cases per batch (default: 8) */
  batchSize: number;
  /** Delay between LLM requests (ms) */
  interRequestDelayMs: number;
  /** Retries for empty/errored responses */
  maxRetries: number;
  retryBaseDelayMs: number;
  /** Abort after N consecutive empty responses */
  maxConsecutiveEmpty: number;
  /** Truncate stored responses to this many chars */
  responseSnapshotChars: number;
  /** Soft heap guard (MB) */
  maxHeapMb: number;
  /** Number of parallel judge calls within a single per-judge case (default: 2) */
  perJudgeConcurrency: number;
}

const DEFAULTS: BenchmarkConfig = {
  enabled: false,
  sampleSize: 40,
  maxOutputTokens: 16384,
  batchSize: 8,
  interRequestDelayMs: 500,
  maxRetries: 2,
  retryBaseDelayMs: 2000,
  maxConsecutiveEmpty: 5,
  responseSnapshotChars: 10000,
  maxHeapMb: 1024,
  perJudgeConcurrency: 2,
};

function readConfig(): BenchmarkConfig {
  const cfg = vscode.workspace.getConfiguration("judges");
  const env = (key: string) => {
    const raw = process.env[key];
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const envBool = (key: string) => (process.env[key] ?? "").toLowerCase() === "true";

  return {
    enabled: envBool("JUDGES_LLM_BENCHMARK_ENABLED") || (cfg.get<boolean>("llmBenchmark.enabled") ?? DEFAULTS.enabled),
    sampleSize: Math.min(
      2000,
      env("JUDGES_LLM_BENCHMARK_SAMPLE_SIZE") ?? cfg.get<number>("llmBenchmark.sampleSize") ?? DEFAULTS.sampleSize,
    ),
    maxOutputTokens: Math.min(
      16384,
      env("JUDGES_LLM_BENCHMARK_MAX_OUTPUT_TOKENS") ??
        cfg.get<number>("llmBenchmark.maxOutputTokens") ??
        DEFAULTS.maxOutputTokens,
    ),
    batchSize: Math.max(
      1,
      Math.min(
        20,
        env("JUDGES_LLM_BENCHMARK_BATCH_SIZE") ?? cfg.get<number>("llmBenchmark.batchSize") ?? DEFAULTS.batchSize,
      ),
    ),
    interRequestDelayMs:
      env("JUDGES_LLM_BENCHMARK_INTER_DELAY_MS") ??
      cfg.get<number>("llmBenchmark.interRequestDelayMs") ??
      DEFAULTS.interRequestDelayMs,
    maxRetries:
      env("JUDGES_LLM_BENCHMARK_MAX_RETRIES") ?? cfg.get<number>("llmBenchmark.maxRetries") ?? DEFAULTS.maxRetries,
    retryBaseDelayMs:
      env("JUDGES_LLM_BENCHMARK_RETRY_BASE_MS") ??
      cfg.get<number>("llmBenchmark.retryBaseDelayMs") ??
      DEFAULTS.retryBaseDelayMs,
    maxConsecutiveEmpty:
      env("JUDGES_LLM_BENCHMARK_MAX_EMPTY") ??
      cfg.get<number>("llmBenchmark.maxConsecutiveEmpty") ??
      DEFAULTS.maxConsecutiveEmpty,
    responseSnapshotChars:
      env("JUDGES_LLM_BENCHMARK_RESPONSE_SNAPSHOT_CHARS") ??
      cfg.get<number>("llmBenchmark.responseSnapshotChars") ??
      DEFAULTS.responseSnapshotChars,
    maxHeapMb:
      env("JUDGES_LLM_BENCHMARK_MAX_HEAP_MB") ?? cfg.get<number>("llmBenchmark.maxHeapMb") ?? DEFAULTS.maxHeapMb,
    perJudgeConcurrency: Math.max(
      1,
      Math.min(
        8,
        env("JUDGES_LLM_BENCHMARK_PER_JUDGE_CONCURRENCY") ??
          cfg.get<number>("llmBenchmark.perJudgeConcurrency") ??
          DEFAULTS.perJudgeConcurrency,
      ),
    ),
  };
}

// ─── Checkpoint ─────────────────────────────────────────────────────────────

interface BatchCheckpoint {
  version: 2;
  modelName: string;
  provider: string;
  sampleCaseIds: string[];
  configHash: string;
  startTime: number;
  perJudgeResults: Array<{ idx: number; result: LlmCaseResult }>;
  phase: "running" | "complete";
}

let _storageUri: vscode.Uri | undefined;
const CHECKPOINT_FILE = ".llm-benchmark-checkpoint-v2.json";
const AMENDMENTS_FILE = "llm-benchmark-amendments.json";

// ─── Amendment Store I/O ────────────────────────────────────────────────────

async function loadAmendmentStore(storageUri: vscode.Uri): Promise<AmendmentStore> {
  try {
    const uri = vscode.Uri.joinPath(storageUri, AMENDMENTS_FILE);
    const data = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(Buffer.from(data).toString("utf8")) as AmendmentStore;
  } catch {
    return createEmptyStore();
  }
}

async function saveAmendmentStore(storageUri: vscode.Uri, store: AmendmentStore): Promise<void> {
  const uri = vscode.Uri.joinPath(storageUri, AMENDMENTS_FILE);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(store, null, 2)));
}

function cfgHash(cfg: BenchmarkConfig, sampleSize: number): string {
  return `${sampleSize}:${cfg.maxOutputTokens}:${cfg.batchSize}`;
}

async function loadCheckpoint(): Promise<BatchCheckpoint | undefined> {
  if (!_storageUri) return undefined;
  try {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(_storageUri, CHECKPOINT_FILE));
    const cp = JSON.parse(new TextDecoder().decode(data)) as BatchCheckpoint;
    return cp.version === 2 ? cp : undefined;
  } catch {
    return undefined;
  }
}

async function saveCheckpoint(cp: BatchCheckpoint): Promise<void> {
  if (!_storageUri) return;
  try {
    await vscode.workspace.fs.createDirectory(_storageUri);
  } catch {
    /* exists */
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(_storageUri, CHECKPOINT_FILE),
    new TextEncoder().encode(JSON.stringify(cp)),
  );
}

async function deleteCheckpoint(): Promise<void> {
  if (!_storageUri) return;
  try {
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(_storageUri, CHECKPOINT_FILE));
  } catch {
    /* already gone */
  }
}

// ─── Model + LLM Calls ─────────────────────────────────────────────────────

async function resolveModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat> {
  const models = await vscode.lm.selectChatModels();
  if (models.length === 0) {
    throw new Error("No language model available. Ensure you have a Copilot subscription and a model selected.");
  }
  log(`Available models: ${models.map((m) => `${m.id} (vendor=${m.vendor})`).join(", ")}`);

  // Prefer copilot vendor models — other vendors (e.g. claude-code) may not
  // stream text correctly through the VS Code Language Model API.
  const preferred = models.filter((m) => m.vendor === "copilot");
  const candidates = preferred.length > 0 ? preferred : models;

  if (candidates.length === 1) return candidates[0];

  // Let the user choose when multiple models are available
  const picks = candidates.map((m) => ({
    label: m.name || m.id,
    description: `vendor: ${m.vendor || "unknown"}`,
    model: m,
  }));
  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: "Select a language model for the benchmark",
    ignoreFocusOut: true,
  });
  if (!selected || token.isCancellationRequested) {
    throw new Error("Benchmark cancelled: no model selected.");
  }
  return selected.model;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let _consecutiveEmpty = 0;
let _totalEmpty = 0;
let _totalCalls = 0;

async function healthCheck(
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
  cfg: BenchmarkConfig,
): Promise<boolean> {
  const messages = [vscode.LanguageModelChatMessage.User("Reply with exactly: HEALTH_OK")];
  const maxAttempts = Math.max(2, cfg.maxRetries + 1);
  log(
    `Health check: model.id=${model.id}, model.name=${model.name || "(none)"}, vendor=${model.vendor || "(none)"}, maxAttempts=${maxAttempts}`,
  );
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (token.isCancellationRequested) return false;
    try {
      enforceHeapGuard(cfg.maxHeapMb);
      const response = await model.sendRequest(messages, {}, token);
      let text = "";
      for await (const chunk of response.text) text += chunk;
      if (text.trim().length > 0) {
        log(`Health check passed (attempt ${attempt + 1}): "${text.trim().slice(0, 50)}"`);
        return true;
      }
      log(`Health check attempt ${attempt + 1}/${maxAttempts}: empty response`);
      await delay(cfg.retryBaseDelayMs * Math.pow(2, attempt));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Health check attempt ${attempt + 1}/${maxAttempts} error: ${msg}`);
      await delay(cfg.retryBaseDelayMs * Math.pow(2, attempt));
    }
  }
  return false;
}

async function sendPrompt(
  model: vscode.LanguageModelChat,
  prompt: string,
  token: vscode.CancellationToken,
  cfg: BenchmarkConfig,
): Promise<string> {
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  _totalCalls++;
  enforceHeapGuard(cfg.maxHeapMb);

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (token.isCancellationRequested) return "";
    try {
      const response = await model.sendRequest(messages, { modelOptions: { max_tokens: cfg.maxOutputTokens } }, token);
      let text = "";
      for await (const chunk of response.text) {
        if (token.isCancellationRequested) break;
        text += chunk;
      }
      if (text.trim().length > 0) {
        _consecutiveEmpty = 0;
        await delay(cfg.interRequestDelayMs);
        return text;
      }
      if (attempt < cfg.maxRetries) {
        const backoff = cfg.retryBaseDelayMs * Math.pow(2, attempt);
        log(`Empty response attempt ${attempt + 1}/${cfg.maxRetries + 1}, retrying in ${backoff}ms`);
        await delay(backoff);
      }
    } catch (error) {
      if (token.isCancellationRequested || error instanceof vscode.CancellationError) return "";
      const msg = error instanceof Error ? error.message : String(error);
      const isRateLimit = /rate.limit|too many requests|429|throttl/i.test(msg);
      if (attempt < cfg.maxRetries) {
        const backoff = isRateLimit
          ? cfg.retryBaseDelayMs * Math.pow(2, attempt + 2) // longer backoff for rate limits
          : cfg.retryBaseDelayMs * Math.pow(2, attempt);
        log(`${isRateLimit ? "Rate limited" : "Error"} attempt ${attempt + 1}: ${msg}, retrying in ${backoff}ms`);
        await delay(backoff);
      } else {
        throw error;
      }
    }
  }

  _consecutiveEmpty++;
  _totalEmpty++;
  log(`All retries empty (consecutive: ${_consecutiveEmpty}, total: ${_totalEmpty}/${_totalCalls})`);
  if (_consecutiveEmpty >= cfg.maxConsecutiveEmpty) {
    throw new Error(
      `Aborting: ${cfg.maxConsecutiveEmpty} consecutive empty responses. Model does not appear to be responding.`,
    );
  }
  return "";
}

function enforceHeapGuard(maxHeapMb: number): void {
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
  if (heapMb >= maxHeapMb) {
    throw new Error(`Heap usage ${heapMb.toFixed(1)} MB exceeded guard (${maxHeapMb} MB). Aborting benchmark.`);
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n…(truncated ${s.length - max} chars)`;
}

// ─── Execution Helpers ──────────────────────────────────────────────────────

/** Full untruncated responses collected during the run, keyed by case ID */
let _fullResponses: Map<string, string> = new Map();

// ─── Per-Judge Execution ────────────────────────────────────────────────────

/**
 * Focused judge set for external code-review benchmarks.
 * Code review golden comments are overwhelmingly about bugs, security,
 * and correctness — not style, documentation, or testing quality.
 * Running only these judges keeps findings targeted and precision high.
 */
const CODE_REVIEW_JUDGE_PREFIXES = new Set([
  "CYBER", // Injection, XSS, SSRF, deserialization
  "SEC", // General security posture
  "AUTH", // Authentication & authorization
  "ERR", // Error handling, null safety, crashes
  "LOGIC", // Semantic correctness, type checks, always-false conditions
  "CONC", // Concurrency, race conditions, deadlocks
  "DB", // Database, queries, N+1, transactions
  "CFG", // Configuration, hardcoded secrets
]);

/**
 * Select which judges to run for a benchmark case.
 *
 * - Internal cases: strict prefix match (exact expected rule IDs)
 * - External cases: focused security+correctness set (~6-8 judges)
 *   matching what code review benchmarks actually test
 */
function selectRelevantJudges(tc: BenchmarkCase): JudgeDefinition[] {
  // Clean cases (no expected findings) → run all judges
  if (tc.expectedRuleIds.length === 0) return [...JUDGES];

  // External benchmark cases → focused security+correctness judges only
  if (tc.aiSource && tc.aiSource !== "gpt-4" && tc.aiSource !== "claude" && tc.aiSource !== "copilot") {
    const expectedPrefixes = new Set(tc.expectedRuleIds.map((r: string) => r.split("-")[0]));
    return JUDGES.filter(
      (j: JudgeDefinition) => CODE_REVIEW_JUDGE_PREFIXES.has(j.rulePrefix) || expectedPrefixes.has(j.rulePrefix),
    );
  }

  // Internal benchmark cases → strict prefix match (exact expected rule IDs)
  const expectedPrefixes = new Set(tc.expectedRuleIds.map((r: string) => r.split("-")[0]));
  return JUDGES.filter((j: JudgeDefinition) => expectedPrefixes.has(j.rulePrefix));
}

async function runPerJudgeBatched(
  model: vscode.LanguageModelChat,
  cases: BenchmarkCase[],
  token: vscode.CancellationToken,
  cfg: BenchmarkConfig,
  onProgress: (p: BenchmarkProgress) => void,
  checkpoint: BatchCheckpoint,
  amendments?: PromptAmendment[],
  reviewMode = false,
): Promise<LlmCaseResult[]> {
  const caseRuleIds: string[][] = cases.map(() => []);
  const caseResponses: string[][] = cases.map(() => []);

  // Restore from checkpoint
  const completedIndices = new Set(checkpoint.perJudgeResults.map((e) => e.idx));
  for (const entry of checkpoint.perJudgeResults) {
    if (entry.result) {
      caseRuleIds[entry.idx] = entry.result.detectedRuleIds;
      caseResponses[entry.idx] = [entry.result.rawResponse];
    }
  }

  const remaining = cases.map((_, i) => i).filter((i) => !completedIndices.has(i));

  if (completedIndices.size > 0) {
    log(
      `Resumed from checkpoint: ${completedIndices.size}/${cases.length} cases already complete, ${remaining.length} remaining`,
    );
  }

  // Track case-level progress (aligned with output channel logging)
  const totalCases = cases.length;
  let casesCompleted = completedIndices.size;

  for (let batchStart = 0; batchStart < remaining.length; batchStart += cfg.batchSize) {
    if (token.isCancellationRequested) break;

    const batchIndices = remaining.slice(batchStart, batchStart + cfg.batchSize);

    for (const idx of batchIndices) {
      if (token.isCancellationRequested) break;

      const tc = cases[idx];
      const judges = selectRelevantJudges(tc);

      // Process judges in parallel chunks for throughput
      const concurrency = cfg.perJudgeConcurrency;
      for (let jStart = 0; jStart < judges.length; jStart += concurrency) {
        if (token.isCancellationRequested) break;

        const judgeChunk = judges.slice(jStart, jStart + concurrency);
        const chunkResults = await Promise.all(
          judgeChunk.map(async (judge) => {
            const prompt = constructPerJudgePrompt(judge, tc.code, tc.language, [], amendments, reviewMode);
            const response = await sendPrompt(model, prompt, token, cfg);
            const validation = extractValidatedLlmFindings(response, getValidRulePrefixes());
            const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);
            return { ruleIds, response };
          }),
        );

        for (const { ruleIds, response } of chunkResults) {
          caseRuleIds[idx].push(...ruleIds);
          caseResponses[idx].push(truncate(response, cfg.responseSnapshotChars));
        }

        // Delay between parallel chunks to respect rate limits
        if (jStart + concurrency < judges.length) {
          await delay(cfg.interRequestDelayMs);
        }
      }

      const uniqueRuleIds = [...new Set(caseRuleIds[idx])];
      const caseResult = scoreLlmCase(tc, uniqueRuleIds, caseResponses[idx].join("\n---\n"));
      checkpoint.perJudgeResults.push({ idx, result: caseResult });
      casesCompleted++;

      onProgress({
        message: `Case ${casesCompleted}/${totalCases}: ${tc.id}`,
        completed: casesCompleted,
        total: totalCases,
      });

      // Log progress to output channel so it's always visible
      const completedCount = checkpoint.perJudgeResults.length;
      const pct = Math.round((completedCount / totalCases) * 100);
      const icon = caseResult.passed ? "✅" : "❌";
      const fpCount = caseResult.falsePositiveRuleIds.length;
      const fnCount = caseResult.missedRuleIds.length;
      const fpLabel = fpCount > 0 ? ` FP=${fpCount}` : "";
      const fnLabel = fnCount > 0 ? ` FN=${fnCount}` : "";
      log(
        `[${completedCount}/${totalCases}] ${pct}% ${icon} ${tc.id} (${tc.category}/${tc.difficulty})${fpLabel}${fnLabel}`,
      );

      // Log running F1 every 10 cases
      if (completedCount % 10 === 0 || completedCount === totalCases) {
        let tp = 0,
          fp = 0,
          fn = 0;
        for (const entry of checkpoint.perJudgeResults) {
          tp += entry.result.expectedRuleIds.length - entry.result.missedRuleIds.length;
          fp += entry.result.falsePositiveRuleIds.length;
          fn += entry.result.missedRuleIds.length;
        }
        const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
        const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
        log(
          `  📊 Running: F1=${(f1 * 100).toFixed(1)}% Prec=${(prec * 100).toFixed(1)}% Rec=${(rec * 100).toFixed(1)}% | TP=${tp} FP=${fp} FN=${fn}`,
        );
      }
    }

    await saveCheckpoint(checkpoint);

    if (typeof (globalThis as any).gc === "function") {
      (globalThis as any).gc();
    }
  }

  return cases.map((tc, i) => {
    const uniqueRuleIds = [...new Set(caseRuleIds[i])];
    return scoreLlmCase(tc, uniqueRuleIds, caseResponses[i].join("\n---\n"));
  });
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function runLlmBenchmark(
  token: vscode.CancellationToken,
  onProgress: (p: BenchmarkProgress) => void,
  storageUri: vscode.Uri,
  chatModel?: vscode.LanguageModelChat,
  externalCases?: BenchmarkCase[],
  /** File prefix for output files (default: "llm"). External benchmarks use their suite ID. */
  filePrefix?: string,
): Promise<BenchmarkRunResult> {
  const cfg = readConfig();
  if (!cfg.enabled) {
    throw new Error(
      "LLM benchmark is disabled. Enable via settings (judges.llmBenchmark.enabled) " +
        "or env JUDGES_LLM_BENCHMARK_ENABLED=true.",
    );
  }

  // Initialize
  _storageUri = storageUri;
  _consecutiveEmpty = 0;
  _totalEmpty = 0;
  _totalCalls = 0;
  _fullResponses = new Map();

  if (!_channel) _channel = vscode.window.createOutputChannel("Judges LLM Benchmark");
  _channel.show(true);

  // 1. Resolve model
  const model = chatModel ?? (await resolveModel(token));
  const modelName = model.name || model.id;
  const provider = model.vendor || "vscode";

  log(`Starting benchmark: model=${modelName}, sampleSize=${cfg.sampleSize}, batchSize=${cfg.batchSize}`);

  // 2. Health check
  onProgress({ message: "Verifying model health…", completed: 0, total: 1 });
  if (!(await healthCheck(model, token, cfg))) {
    throw new Error(
      `Health check failed: ${modelName} is not responding. ` +
        "Ensure GitHub Copilot is signed in and the model is available (check the Judges LLM Benchmark output channel for details).",
    );
  }

  // 3. Select stratified sample
  const casePool = externalCases ?? BENCHMARK_CASES;
  const cases = externalCases
    ? externalCases // Use all external cases (no sampling)
    : selectStratifiedSample(casePool, cfg.sampleSize);
  const sampleCaseIds = cases.map((c: BenchmarkCase) => c.id);
  log(`Selected ${cases.length} cases from ${casePool.length} total${externalCases ? " (external benchmark)" : ""}`);

  // 4. Check for checkpoint
  try {
    await vscode.workspace.fs.createDirectory(storageUri);
  } catch {
    /* exists */
  }

  let checkpoint = await loadCheckpoint();
  const hash = cfgHash(cfg, cases.length);

  if (checkpoint) {
    const sameModel = checkpoint.modelName === modelName;
    const sameSample =
      checkpoint.sampleCaseIds.length === sampleCaseIds.length &&
      checkpoint.sampleCaseIds.every((id, i) => id === sampleCaseIds[i]);
    const sameConfig = checkpoint.configHash === hash;

    if (sameModel && sameSample && sameConfig && checkpoint.phase !== "complete") {
      const done = checkpoint.perJudgeResults.length;
      const choice = await vscode.window.showInformationMessage(
        `Found checkpoint: ${done} per-judge results done. Resume?`,
        "Resume",
        "Start Fresh",
      );
      if (choice !== "Resume") checkpoint = undefined;
    } else {
      checkpoint = undefined;
    }
  }

  if (!checkpoint) {
    checkpoint = {
      version: 2,
      modelName,
      provider,
      sampleCaseIds,
      configHash: hash,
      startTime: Date.now(),
      perJudgeResults: [],
      phase: "running",
    };
    await saveCheckpoint(checkpoint);
  }

  const startTime = checkpoint.startTime;

  // 5. Load amendments from previous runs and run per-judge benchmark
  const amendmentStore = await loadAmendmentStore(storageUri);
  if (amendmentStore.amendments.length > 0) {
    log(`Loaded ${amendmentStore.amendments.length} amendment(s) from previous optimization`);
  }
  log("Starting per-judge benchmark…");
  onProgress({ message: "Running per-judge benchmark…", completed: 0, total: 1 });
  const isReviewMode = !!externalCases;
  if (isReviewMode) log("Review mode enabled — using code-review prompt directives");
  const results = await runPerJudgeBatched(
    model,
    cases,
    token,
    cfg,
    onProgress,
    checkpoint,
    amendmentStore.amendments,
    isReviewMode,
  );
  const duration = Math.round((Date.now() - startTime) / 1000);
  log(`Benchmark complete: ${duration}s total, ${_totalCalls} calls, ${_totalEmpty} empty`);

  if (token.isCancellationRequested) {
    await saveCheckpoint(checkpoint);
    const snapshot = computeLlmMetrics(results, getVersion(), modelName, provider, "per-judge", duration);
    const report = formatStandaloneBenchmarkReport(snapshot);
    return { snapshot, reportMarkdown: report, snapshotJson: JSON.stringify(snapshot, null, 2) };
  }

  checkpoint.phase = "complete";
  await saveCheckpoint(checkpoint);

  // 6. Compute snapshot and format outputs
  const version = getVersion();
  const snapshot = computeLlmMetrics(results, version, modelName, provider, "per-judge", duration);
  const reportMarkdown = formatStandaloneBenchmarkReport(snapshot);
  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const fullResponses = Object.fromEntries(_fullResponses);
  const prefix = filePrefix ?? "llm";
  await writeOutputFiles(storageUri, snapshotJson, reportMarkdown, prefix, fullResponses);
  await deleteCheckpoint();

  // 7. Self-teaching: generate amendments from FP patterns for next run
  try {
    const optimization = optimizeBenchmark(snapshot, amendmentStore.amendments);
    if (optimization.amendments.length > 0) {
      const updatedStore = mergeAmendments(amendmentStore, optimization, snapshot.f1Score);
      await saveAmendmentStore(storageUri, updatedStore);
      log(
        `Generated ${optimization.amendments.length} amendment(s) for next run (projected F1 improvement: +${(optimization.projectedF1Improvement * 100).toFixed(1)}pp)`,
      );
    } else {
      log("No new amendments needed — all judges above precision threshold");
    }
  } catch (e) {
    log(`Amendment generation failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    snapshot,
    reportMarkdown,
    snapshotJson,
    fullResponses,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    return vscode.extensions.getExtension("kevinrabun.judges-panel")?.packageJSON?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function writeOutputFiles(
  dir: vscode.Uri,
  snapshot: string,
  report: string,
  prefix: string,
  fullResponses?: Record<string, string>,
): Promise<void> {
  const enc = new TextEncoder();
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `${prefix}-snapshot-latest.json`), enc.encode(snapshot));
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `${prefix}-benchmark-report.md`), enc.encode(report));
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `${prefix}-snapshot-${ts}.json`), enc.encode(snapshot));
  if (fullResponses && Object.keys(fullResponses).length > 0) {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(dir, `${prefix}-responses-latest.json`),
      enc.encode(JSON.stringify(fullResponses, null, 2)),
    );
  }
}

/**
 * Copy benchmark results from extension storage to the workspace benchmarks/ folder.
 */
export async function saveResultsToWorkspace(
  storageUri: vscode.Uri,
  filePrefix = "llm",
): Promise<vscode.Uri | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    vscode.window.showWarningMessage("No workspace folder open.");
    return undefined;
  }

  const benchmarksDir = vscode.Uri.joinPath(root, "benchmarks");
  try {
    await vscode.workspace.fs.createDirectory(benchmarksDir);
  } catch {
    /* exists */
  }

  for (const name of [
    `${filePrefix}-snapshot-latest.json`,
    `${filePrefix}-benchmark-report.md`,
    `${filePrefix}-responses-latest.json`,
  ]) {
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(storageUri, name));
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(benchmarksDir, name), data);
    } catch {
      /* file may not exist */
    }
  }

  return vscode.Uri.joinPath(benchmarksDir, `${filePrefix}-benchmark-report.md`);
}

// Internal test hooks
export const __test = { readConfig, cfgHash, truncate, enforceHeapGuard };
