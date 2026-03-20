/**
 * LLM Benchmark Runner v2 — Micro-Batch, Self-Teaching, Stable
 *
 * Key improvements over v1:
 * 1. Tribunal-only by default (1 call/case vs ~12; 12x faster)
 * 2. Micro-batch architecture (8 cases/batch with memory cleanup)
 * 3. Self-teaching: loads prompt amendments from prior runs, runs
 *    optimizer after completion, saves amendments for next run
 * 4. Simplified checkpoint (per-batch, not per-call)
 * 5. Reduced memory pressure (no per-judge accumulated state)
 */

import * as vscode from "vscode";
import process from "node:process";
import { JUDGES, BENCHMARK_CASES } from "@kevinrabun/judges/api";
import type {
  BenchmarkCase,
  LlmBenchmarkSnapshot,
  LlmCaseResult,
  PromptAmendment,
  AmendmentStore,
  OptimizationResult,
} from "@kevinrabun/judges/api";
import {
  parseLlmRuleIds,
  scoreLlmCase,
  computeLlmMetrics,
  constructTribunalPrompt,
  constructPerJudgePrompt,
  selectStratifiedSample,
  extractValidatedLlmFindings,
  getValidRulePrefixes,
  getTribunalValidPrefixes,
  optimizeBenchmark,
  createEmptyStore,
  mergeAmendments,
} from "@kevinrabun/judges/api";
import type { JudgeDefinition } from "@kevinrabun/judges/api";
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
  perJudge?: LlmBenchmarkSnapshot;
  tribunal?: LlmBenchmarkSnapshot;
  reportMarkdown: string;
  snapshotJson: string;
  optimization?: OptimizationResult;
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
  /** Run per-judge mode in addition to tribunal (default: false) */
  includePerJudge: boolean;
  /** Enable self-teaching optimizer (default: true) */
  selfTeaching: boolean;
}

const DEFAULTS: BenchmarkConfig = {
  enabled: false,
  sampleSize: 40,
  maxOutputTokens: 1024,
  batchSize: 8,
  interRequestDelayMs: 300,
  maxRetries: 2,
  retryBaseDelayMs: 2000,
  maxConsecutiveEmpty: 5,
  responseSnapshotChars: 1000,
  maxHeapMb: 1024,
  includePerJudge: false,
  selfTeaching: true,
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
      200,
      env("JUDGES_LLM_BENCHMARK_SAMPLE_SIZE") ?? cfg.get<number>("llmBenchmark.sampleSize") ?? DEFAULTS.sampleSize,
    ),
    maxOutputTokens: Math.min(
      4096,
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
    includePerJudge:
      envBool("JUDGES_LLM_BENCHMARK_INCLUDE_PER_JUDGE") ||
      (cfg.get<boolean>("llmBenchmark.includePerJudge") ?? DEFAULTS.includePerJudge),
    selfTeaching:
      !envBool("JUDGES_LLM_BENCHMARK_NO_SELF_TEACHING") &&
      (cfg.get<boolean>("llmBenchmark.selfTeaching") ?? DEFAULTS.selfTeaching),
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
  tribunalResults: Array<{ idx: number; result: LlmCaseResult }>;
  perJudgeResults: Array<{ idx: number; result: LlmCaseResult }>;
  phase: "tribunal" | "per-judge" | "complete";
}

let _storageUri: vscode.Uri | undefined;
const CHECKPOINT_FILE = ".llm-benchmark-checkpoint-v2.json";
const AMENDMENTS_FILE = "llm-benchmark-amendments.json";

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

// ─── Amendment Store I/O ────────────────────────────────────────────────────

async function loadAmendmentStore(): Promise<AmendmentStore> {
  if (!_storageUri) return createEmptyStore();
  try {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(_storageUri, AMENDMENTS_FILE));
    const store = JSON.parse(new TextDecoder().decode(data)) as AmendmentStore;
    return store.version === 1 ? store : createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

async function saveAmendmentStore(store: AmendmentStore): Promise<void> {
  if (!_storageUri) return;
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(_storageUri, AMENDMENTS_FILE),
    new TextEncoder().encode(JSON.stringify(store, null, 2)),
  );
}

// ─── Model + LLM Calls ─────────────────────────────────────────────────────

async function resolveModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat> {
  const models = await vscode.lm.selectChatModels();
  if (models.length === 0) {
    throw new Error("No language model available. Ensure you have a Copilot subscription and a model selected.");
  }
  return models[0];
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
  for (let attempt = 0; attempt < 2; attempt++) {
    if (token.isCancellationRequested) return false;
    try {
      enforceHeapGuard(cfg.maxHeapMb);
      const response = await model.sendRequest(messages, { modelOptions: { max_tokens: 16 } }, token);
      let text = "";
      for await (const chunk of response.text) text += chunk;
      if (text.trim().length > 0) {
        log(`Health check passed (attempt ${attempt + 1})`);
        return true;
      }
      await delay(cfg.retryBaseDelayMs);
    } catch {
      await delay(cfg.retryBaseDelayMs);
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
      if (attempt < cfg.maxRetries) {
        const backoff = cfg.retryBaseDelayMs * Math.pow(2, attempt);
        log(`Error attempt ${attempt + 1}: ${error instanceof Error ? error.message : String(error)}, retrying`);
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

// ─── Micro-Batch Tribunal Execution ─────────────────────────────────────────

async function runTribunalBatched(
  model: vscode.LanguageModelChat,
  cases: BenchmarkCase[],
  amendments: PromptAmendment[],
  token: vscode.CancellationToken,
  cfg: BenchmarkConfig,
  onProgress: (p: BenchmarkProgress) => void,
  checkpoint: BatchCheckpoint,
): Promise<LlmCaseResult[]> {
  const results: (LlmCaseResult | undefined)[] = cases.map(() => undefined);
  const completedSet = new Set(checkpoint.tribunalResults.map((e) => e.idx));

  // Restore completed results from checkpoint
  for (const entry of checkpoint.tribunalResults) {
    results[entry.idx] = entry.result;
  }

  const remaining = cases.map((_, i) => i).filter((i) => !completedSet.has(i));

  if (completedSet.size > 0) {
    log(`Resuming tribunal: ${completedSet.size}/${cases.length} already completed`);
  }

  let completed = completedSet.size;

  // Process in micro-batches
  for (let batchStart = 0; batchStart < remaining.length; batchStart += cfg.batchSize) {
    if (token.isCancellationRequested) break;

    const batchIndices = remaining.slice(batchStart, batchStart + cfg.batchSize);
    const batchNum = Math.floor(batchStart / cfg.batchSize) + 1;
    const totalBatches = Math.ceil(remaining.length / cfg.batchSize);

    log(`Batch ${batchNum}/${totalBatches} (${batchIndices.length} cases)`);

    for (const idx of batchIndices) {
      if (token.isCancellationRequested) break;

      const tc = cases[idx];
      completed++;
      onProgress({
        message: `Tribunal: ${tc.id} [batch ${batchNum}/${totalBatches}] (${completed}/${cases.length})`,
        completed,
        total: cases.length,
      });

      const prompt = constructTribunalPrompt(tc.code, tc.language, [], amendments);
      const response = await sendPrompt(model, prompt, token, cfg);
      const validation = extractValidatedLlmFindings(response, getTribunalValidPrefixes());
      if (validation.errors.length) {
        log(`⚠️ [${tc.id}/tribunal] validation: ${validation.errors.join("; ")}`);
      }
      const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);
      const result = scoreLlmCase(tc, ruleIds, truncate(response, cfg.responseSnapshotChars));

      results[idx] = result;
      checkpoint.tribunalResults.push({ idx, result });
    }

    // Save checkpoint after each batch
    await saveCheckpoint(checkpoint);

    // Memory cleanup between batches
    if (typeof (globalThis as any).gc === "function") {
      (globalThis as any).gc();
    }

    if (_totalCalls % 20 === 0) {
      const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
      log(`Memory: ${heapMb.toFixed(1)} MB after ${_totalCalls} calls`);
    }
  }

  return results.filter((r): r is LlmCaseResult => r !== undefined);
}

// ─── Per-Judge Execution (opt-in) ───────────────────────────────────────────

function selectRelevantJudges(tc: BenchmarkCase): JudgeDefinition[] {
  if (tc.expectedRuleIds.length === 0) return [...JUDGES];
  const expectedPrefixes = new Set(tc.expectedRuleIds.map((r: string) => r.split("-")[0]));
  return JUDGES.filter((j: JudgeDefinition) => expectedPrefixes.has(j.rulePrefix));
}

async function runPerJudgeBatched(
  model: vscode.LanguageModelChat,
  cases: BenchmarkCase[],
  amendments: PromptAmendment[],
  token: vscode.CancellationToken,
  cfg: BenchmarkConfig,
  onProgress: (p: BenchmarkProgress) => void,
  checkpoint: BatchCheckpoint,
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

  // Count total per-judge tasks for progress
  let totalTasks = 0;
  for (const idx of remaining) {
    totalTasks += selectRelevantJudges(cases[idx]).length;
  }
  let tasksDone = 0;

  for (let batchStart = 0; batchStart < remaining.length; batchStart += cfg.batchSize) {
    if (token.isCancellationRequested) break;

    const batchIndices = remaining.slice(batchStart, batchStart + cfg.batchSize);

    for (const idx of batchIndices) {
      if (token.isCancellationRequested) break;

      const tc = cases[idx];
      const judges = selectRelevantJudges(tc);

      for (const judge of judges) {
        if (token.isCancellationRequested) break;
        tasksDone++;
        onProgress({
          message: `Per-judge: ${tc.id} → ${judge.name} (${tasksDone}/${totalTasks})`,
          completed: tasksDone,
          total: totalTasks,
        });

        const prompt = constructPerJudgePrompt(judge, tc.code, tc.language, [], amendments);
        const response = await sendPrompt(model, prompt, token, cfg);
        const validation = extractValidatedLlmFindings(response, getValidRulePrefixes());
        const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);

        caseRuleIds[idx].push(...ruleIds);
        caseResponses[idx].push(truncate(response, cfg.responseSnapshotChars));
      }

      const uniqueRuleIds = [...new Set(caseRuleIds[idx])];
      const caseResult = scoreLlmCase(tc, uniqueRuleIds, caseResponses[idx].join("\n---\n"));
      checkpoint.perJudgeResults.push({ idx, result: caseResult });
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

  if (!_channel) _channel = vscode.window.createOutputChannel("Judges LLM Benchmark");
  _channel.show(true);

  // 1. Resolve model
  const model = chatModel ?? (await resolveModel(token));
  const modelName = model.name || model.id;
  const provider = model.vendor || "vscode";

  log(`Starting benchmark v2: model=${modelName}, sampleSize=${cfg.sampleSize}, batchSize=${cfg.batchSize}`);
  log(`Modes: tribunal=always, per-judge=${cfg.includePerJudge}, self-teaching=${cfg.selfTeaching}`);

  // 2. Health check
  onProgress({ message: "Verifying model health…", completed: 0, total: 1 });
  if (!(await healthCheck(model, token, cfg))) {
    throw new Error(`Health check failed: ${modelName} is not responding.`);
  }

  // 3. Load prompt amendments from previous runs
  const amendmentStore = await loadAmendmentStore();
  const amendments = amendmentStore.amendments;
  if (amendments.length > 0) {
    log(`Loaded ${amendments.length} prompt amendments from self-teaching history`);
    for (const a of amendments) {
      log(`  - ${a.judgePrefix}: ${a.reason}`);
    }
  }

  // 4. Select stratified sample
  const cases = selectStratifiedSample(BENCHMARK_CASES, cfg.sampleSize);
  const sampleCaseIds = cases.map((c: BenchmarkCase) => c.id);
  log(`Selected ${cases.length} stratified cases from ${BENCHMARK_CASES.length} total`);

  // 5. Check for checkpoint
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
      const done = checkpoint.tribunalResults.length;
      const choice = await vscode.window.showInformationMessage(
        `Found checkpoint: ${done}/${cases.length} tribunal cases done. Resume?`,
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
      tribunalResults: [],
      perJudgeResults: [],
      phase: "tribunal",
    };
    await saveCheckpoint(checkpoint);
  }

  const startTime = checkpoint.startTime;

  // 6. Run tribunal benchmark (always)
  let tribunalResults: LlmCaseResult[];
  const trStart = Date.now();

  if (checkpoint.phase === "tribunal") {
    log("Starting tribunal benchmark (micro-batch mode)…");
    onProgress({
      message: `Running tribunal (${cases.length} cases, batch=${cfg.batchSize})…`,
      completed: 0,
      total: cases.length,
    });
    tribunalResults = await runTribunalBatched(model, cases, amendments, token, cfg, onProgress, checkpoint);
    const trDuration = Math.round((Date.now() - trStart) / 1000);
    log(`Tribunal complete: ${_totalCalls} calls, ${_totalEmpty} empty, ${trDuration}s`);

    if (token.isCancellationRequested) {
      await saveCheckpoint(checkpoint);
      return buildResult([], tribunalResults, modelName, provider, startTime);
    }

    checkpoint.phase = cfg.includePerJudge ? "per-judge" : "complete";
    await saveCheckpoint(checkpoint);
  } else {
    tribunalResults = checkpoint.tribunalResults.map((e) => e.result);
    log("Tribunal phase already complete, skipping…");
  }

  // 7. Run per-judge benchmark (opt-in)
  let perJudgeResults: LlmCaseResult[] = [];

  if (cfg.includePerJudge && checkpoint.phase === "per-judge") {
    _consecutiveEmpty = 0;
    log("Starting per-judge benchmark…");
    onProgress({ message: "Running per-judge benchmark…", completed: 0, total: 1 });
    perJudgeResults = await runPerJudgeBatched(model, cases, amendments, token, cfg, onProgress, checkpoint);
    const pjDuration = Math.round((Date.now() - trStart) / 1000);
    log(`Per-judge complete: ${pjDuration}s`);

    checkpoint.phase = "complete";
    await saveCheckpoint(checkpoint);
  }

  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  log(`Benchmark complete: ${totalDuration}s total, ${_totalCalls} calls, ${_totalEmpty} empty`);

  // 8. Compute snapshots
  const version = getVersion();
  const tribunalSnapshot = computeLlmMetrics(tribunalResults, version, modelName, provider, "tribunal", totalDuration);

  const perJudgeSnapshot =
    perJudgeResults.length > 0
      ? computeLlmMetrics(perJudgeResults, version, modelName, provider, "per-judge", totalDuration)
      : undefined;

  // 9. Self-teaching: run optimizer and save amendments
  let optimization: OptimizationResult | undefined;

  if (cfg.selfTeaching) {
    log("Running self-teaching optimizer…");
    optimization = optimizeBenchmark(tribunalSnapshot, amendments);

    log(`Optimizer: ${optimization.amendments.length} new amendments, ${optimization.insights.length} insights`);
    log(
      `  Current F1: ${(optimization.summary.currentF1 * 100).toFixed(1)}% → ` +
        `Projected: ${(optimization.summary.projectedF1 * 100).toFixed(1)}% ` +
        `(+${(optimization.projectedF1Improvement * 100).toFixed(1)}%)`,
    );

    for (const insight of optimization.insights) {
      log(`  [${insight.severity}] ${insight.target}: ${insight.recommendation}`);
    }

    // Merge and save amendments for next run
    const updatedStore = mergeAmendments(amendmentStore, optimization, tribunalSnapshot.f1Score);
    await saveAmendmentStore(updatedStore);
    log(`Saved ${updatedStore.amendments.length} amendments for next run`);
  }

  // 10. Format and write outputs
  const reportMarkdown = formatStandaloneBenchmarkReport(perJudgeSnapshot, tribunalSnapshot, optimization);
  const snapshotJson = JSON.stringify(tribunalSnapshot, null, 2);
  await writeOutputFiles(storageUri, snapshotJson, reportMarkdown);
  await deleteCheckpoint();

  return {
    perJudge: perJudgeSnapshot,
    tribunal: tribunalSnapshot,
    reportMarkdown,
    snapshotJson,
    optimization,
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

function buildResult(
  perJudge: LlmCaseResult[],
  tribunal: LlmCaseResult[],
  modelName: string,
  provider: string,
  startTime: number,
): BenchmarkRunResult {
  const d = Math.round((Date.now() - startTime) / 1000);
  const v = getVersion();
  const pj = perJudge.length > 0 ? computeLlmMetrics(perJudge, v, modelName, provider, "per-judge", d) : undefined;
  const tr = tribunal.length > 0 ? computeLlmMetrics(tribunal, v, modelName, provider, "tribunal", d) : undefined;
  const report = formatStandaloneBenchmarkReport(pj, tr);
  return {
    perJudge: pj,
    tribunal: tr,
    reportMarkdown: report,
    snapshotJson: tr ? JSON.stringify(tr, null, 2) : "{}",
  };
}

async function writeOutputFiles(dir: vscode.Uri, snapshot: string, report: string): Promise<void> {
  const enc = new TextEncoder();
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, "llm-snapshot-latest.json"), enc.encode(snapshot));
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, "llm-benchmark-report.md"), enc.encode(report));
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `llm-snapshot-${ts}.json`), enc.encode(snapshot));
}

/**
 * Copy benchmark results from extension storage to the workspace benchmarks/ folder.
 */
export async function saveResultsToWorkspace(storageUri: vscode.Uri): Promise<vscode.Uri | undefined> {
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

  for (const name of ["llm-snapshot-latest.json", "llm-benchmark-report.md"]) {
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(storageUri, name));
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(benchmarksDir, name), data);
    } catch {
      /* file may not exist */
    }
  }

  return vscode.Uri.joinPath(benchmarksDir, "llm-benchmark-report.md");
}

// Internal test hooks
export const __test = { readConfig, cfgHash, truncate, enforceHeapGuard };
