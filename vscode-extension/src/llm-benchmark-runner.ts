/**
 * LLM Benchmark Runner — executes benchmark cases against the VS Code LM API.
 *
 * Uses the currently selected VS Code language model to evaluate benchmark
 * cases in both per-judge and tribunal modes. No API keys needed — the model
 * comes from `vscode.lm.selectChatModels()`.
 */

import * as vscode from "vscode";
import process from "node:process";
import { JUDGES, BENCHMARK_CASES } from "@kevinrabun/judges/api";
import type { BenchmarkCase, JudgeDefinition, LlmBenchmarkSnapshot, LlmCaseResult } from "@kevinrabun/judges/api";
import {
  parseLlmRuleIds,
  scoreLlmCase,
  computeLlmMetrics,
  constructPerJudgePrompt,
  constructTribunalPrompt,
  selectStratifiedSample,
  extractValidatedLlmFindings,
  getValidRulePrefixes,
} from "@kevinrabun/judges/api";
import { formatStandaloneBenchmarkReport } from "./llm-benchmark-format";

// ─── Output Channel ─────────────────────────────────────────────────────────
// Visible in VS Code "Output" panel so users can monitor benchmark health
// without opening Developer Tools.

let _outputChannel: vscode.OutputChannel | undefined;

function log(msg: string): void {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel("Judges LLM Benchmark");
  }
  const ts = new Date().toISOString().slice(11, 19);
  _outputChannel.appendLine(`[${ts}] ${msg}`);
}

// Throttle UI log spam to avoid listener growth in VS Code chat widgets
const logThrottles = new Map<string, number>();
function logOnce(key: string, msg: string, windowMs = 30_000): void {
  const now = Date.now();
  const last = logThrottles.get(key) ?? 0;
  if (now - last < windowMs) return;
  logThrottles.set(key, now);
  log(msg);
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
}

// ─── Checkpoint Types ───────────────────────────────────────────────────────

const CHECKPOINT_FILENAME = ".llm-benchmark-checkpoint.json";
const CHECKPOINT_SAVE_INTERVAL = 20; // save every N completed calls

interface PerJudgeEntry {
  caseIdx: number;
  judgeId: string;
  ruleIds: string[];
  response: string;
}

interface TribunalEntry {
  caseIdx: number;
  result: LlmCaseResult;
}

interface BenchmarkCheckpoint {
  version: 1;
  modelName: string;
  provider: string;
  sampleCaseIds: string[];
  /** snapshot of config used for this run to guard resume correctness */
  config?: Partial<BenchmarkConfig> & { sampleSize?: number; maxOutputTokens?: number; concurrency?: number };
  startTime: number;
  phase: "per-judge" | "tribunal" | "complete";
  perJudgeEntries: PerJudgeEntry[];
  perJudgeResults?: LlmCaseResult[];
  tribunalEntries: TribunalEntry[];
}

// ─── Checkpoint I/O ─────────────────────────────────────────────────────────

let _storageUri: vscode.Uri | undefined;

function getCheckpointUri(): vscode.Uri | undefined {
  if (!_storageUri) return undefined;
  return vscode.Uri.joinPath(_storageUri, CHECKPOINT_FILENAME);
}

async function loadCheckpoint(): Promise<BenchmarkCheckpoint | undefined> {
  const uri = getCheckpointUri();
  if (!uri) return undefined;
  try {
    const data = await vscode.workspace.fs.readFile(uri);
    const cp = JSON.parse(new TextDecoder().decode(data)) as BenchmarkCheckpoint;
    if (cp.version !== 1) return undefined;
    return cp;
  } catch {
    return undefined;
  }
}

async function saveCheckpoint(cp: BenchmarkCheckpoint): Promise<void> {
  const uri = getCheckpointUri();
  if (!uri) return;
  try {
    const dir = vscode.Uri.joinPath(uri, "..");
    await vscode.workspace.fs.createDirectory(dir);
  } catch {
    /* exists */
  }
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(cp)));
}

async function deleteCheckpoint(): Promise<void> {
  const uri = getCheckpointUri();
  if (!uri) return;
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    /* already gone */
  }
}

// ─── Model Resolution ───────────────────────────────────────────────────────

async function resolveModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat> {
  const models = await vscode.lm.selectChatModels();
  // Defensive: dispose any lingering handles to avoid listener accumulation
  try {
    vscode.lm.onDidChangeChatModels(() => undefined).dispose?.();
  } catch {
    /* ignore */
  }
  if (models.length === 0) {
    throw new Error(
      "No language model available. Make sure you have a Copilot subscription " + "and a model selected in VS Code.",
    );
  }
  // Prefer the first model (user's selected model)
  return models[0];
}

// ─── Judge Relevance ────────────────────────────────────────────────────────

/**
 * For dirty cases (expectedRuleIds.length > 0), return only judges whose
 * rulePrefix matches an expected rule prefix. For clean cases, return all judges.
 */
function selectRelevantJudges(tc: BenchmarkCase): JudgeDefinition[] {
  if (tc.expectedRuleIds.length === 0) {
    // Clean case — all judges should ideally produce no findings
    return [...JUDGES];
  }

  const expectedPrefixes = new Set(tc.expectedRuleIds.map((r: string) => r.split("-")[0]));

  return JUDGES.filter((j: JudgeDefinition) => expectedPrefixes.has(j.rulePrefix));
}

// ─── Configuration ──────────────────────────────────────────────────────────

interface BenchmarkConfig {
  sampleSize: number;
  /** max tokens requested per call (output side) */
  maxOutputTokens: number;
  /** number of parallel LLM requests (1 recommended for streaming stability) */
  concurrency: number;
  /**
   * Optional guard to completely disable benchmark runs in CI/unstable hosts.
   * Allows VS Code settings to set to false to skip wiring UI commands.
   */
  enabled: boolean;

  /** delay between sequential requests to avoid throttling */
  interRequestDelayMs: number;
  /** retries for empty responses */
  maxRetries: number;
  retryBaseDelayMs: number;
  /** abort after N consecutive empty responses */
  maxConsecutiveEmpty: number;
  /** truncate raw response snapshots to this many chars to limit memory */
  responseSnapshotChars: number;
  /** abort if heap exceeds this many MB (soft guard) */
  maxHeapMb: number;
  /** log memory every N calls */
  logMemoryEvery: number;
}

const DEFAULT_CONFIG: BenchmarkConfig = {
  enabled: false, // default disabled to protect users; enable via settings/env explicitly
  sampleSize: 32, // was 64; lower default for safety
  maxOutputTokens: 1024, // was 2048
  concurrency: 1,
  interRequestDelayMs: 500,
  maxRetries: 2,
  retryBaseDelayMs: 2000,
  maxConsecutiveEmpty: 5,
  responseSnapshotChars: 1000,
  maxHeapMb: 1024, // ~1GiB guard for extension host; previously 1536
  logMemoryEvery: 20,
};

function readEnvInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? v : undefined;
}

function getBenchmarkConfig(): BenchmarkConfig {
  const cfg = vscode.workspace.getConfiguration("judges");
  // Settings override defaults
  const envEnabled = (process.env.JUDGES_LLM_BENCHMARK_ENABLED ?? "").toLowerCase() === "true";
  const settingEnabled = cfg.get<boolean>("llmBenchmark.enabled");
  const enabled = envEnabled || (settingEnabled ?? DEFAULT_CONFIG.enabled);
  const sampleSize =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_SAMPLE_SIZE) ??
    cfg.get<number>("llmBenchmark.sampleSize") ??
    DEFAULT_CONFIG.sampleSize;
  const maxOutputTokens =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_MAX_OUTPUT_TOKENS) ??
    cfg.get<number>("llmBenchmark.maxOutputTokens") ??
    DEFAULT_CONFIG.maxOutputTokens;
  const concurrency =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_CONCURRENCY) ??
    cfg.get<number>("llmBenchmark.concurrency") ??
    DEFAULT_CONFIG.concurrency;
  const interRequestDelayMs =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_INTER_DELAY_MS) ??
    cfg.get<number>("llmBenchmark.interRequestDelayMs") ??
    DEFAULT_CONFIG.interRequestDelayMs;
  const maxRetries =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_MAX_RETRIES) ??
    cfg.get<number>("llmBenchmark.maxRetries") ??
    DEFAULT_CONFIG.maxRetries;
  const retryBaseDelayMs =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_RETRY_BASE_MS) ??
    cfg.get<number>("llmBenchmark.retryBaseDelayMs") ??
    DEFAULT_CONFIG.retryBaseDelayMs;
  const maxConsecutiveEmpty =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_MAX_EMPTY) ??
    cfg.get<number>("llmBenchmark.maxConsecutiveEmpty") ??
    DEFAULT_CONFIG.maxConsecutiveEmpty;
  const responseSnapshotChars =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_RESPONSE_SNAPSHOT_CHARS) ??
    cfg.get<number>("llmBenchmark.responseSnapshotChars") ??
    DEFAULT_CONFIG.responseSnapshotChars;
  const maxHeapMb =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_MAX_HEAP_MB) ??
    cfg.get<number>("llmBenchmark.maxHeapMb") ??
    DEFAULT_CONFIG.maxHeapMb;
  const logMemoryEvery =
    readEnvInt(process.env.JUDGES_LLM_BENCHMARK_LOG_MEMORY_EVERY) ??
    cfg.get<number>("llmBenchmark.logMemoryEvery") ??
    DEFAULT_CONFIG.logMemoryEvery;

  return {
    enabled,
    sampleSize,
    maxOutputTokens,
    concurrency: Math.max(1, concurrency), // guard bad input
    interRequestDelayMs,
    maxRetries,
    retryBaseDelayMs,
    maxConsecutiveEmpty,
    responseSnapshotChars,
    maxHeapMb,
    logMemoryEvery,
  } satisfies BenchmarkConfig;
}

function truncateResponse(response: string, maxChars: number): string {
  if (response.length <= maxChars) return response;
  return `${response.slice(0, maxChars)}\n…(truncated ${response.length - maxChars} chars)`;
}

function logMemory(prefix: string): void {
  try {
    const mem = process.memoryUsage();
    const heapMb = mem.heapUsed / 1024 / 1024;
    const rssMb = mem.rss / 1024 / 1024;
    log(`${prefix} | heapUsed=${heapMb.toFixed(1)} MB rss=${rssMb.toFixed(1)} MB`);
  } catch {
    /* ignore */
  }
}

function enforceHeapGuard(maxHeapMb: number): void {
  try {
    const mem = process.memoryUsage();
    const heapMb = mem.heapUsed / 1024 / 1024;
    if (heapMb >= maxHeapMb) {
      throw new Error(
        `Aborting benchmark: heap usage ${heapMb.toFixed(1)} MB exceeded guard (${maxHeapMb} MB). ` +
          `Adjust settings via judges.llmBenchmark.maxHeapMb or env JUDGES_LLM_BENCHMARK_MAX_HEAP_MB.`,
      );
    }
  } catch (err) {
    if (err instanceof Error) throw err;
  }
}

function maybeGc(): void {
  try {
    // Only works if VS Code ran extension host with --expose-gc (not guaranteed)
    (globalThis as any).gc?.();
  } catch {
    /* ignore */
  }
}

// ─── Concurrency Limiter ────────────────────────────────────────────────────

/**
 * Default number of parallel LLM requests.
 * Set to 1 (sequential) because the VS Code LM API proxy does not
 * reliably support concurrent streaming requests — concurrent calls
 * return empty response streams.
 */
const DEFAULT_CONCURRENCY = DEFAULT_CONFIG.concurrency;

/** Delay between sequential LLM requests to avoid rate limiting (ms) */
const INTER_REQUEST_DELAY_MS = DEFAULT_CONFIG.interRequestDelayMs;

/** Maximum retries for an empty LLM response */
const MAX_RETRIES = DEFAULT_CONFIG.maxRetries;

/** Base delay for exponential backoff on retry (ms) */
const RETRY_BASE_DELAY_MS = DEFAULT_CONFIG.retryBaseDelayMs;

/** Abort the benchmark if this many consecutive calls return empty */
const MAX_CONSECUTIVE_EMPTY = DEFAULT_CONFIG.maxConsecutiveEmpty;

/** Maximum output tokens to request from the model */
const MAX_OUTPUT_TOKENS = DEFAULT_CONFIG.maxOutputTokens;

/** How many raw response chars to store in memory */
const MAX_RESPONSE_SNAPSHOT_CHARS = DEFAULT_CONFIG.responseSnapshotChars;

/** Soft heap guard (MB) */
const DEFAULT_MAX_HEAP_MB = DEFAULT_CONFIG.maxHeapMb;

/** Log memory for every N calls */
const DEFAULT_LOG_MEMORY_EVERY = DEFAULT_CONFIG.logMemoryEvery;

// Current run config (populated at runtime inside runLlmBenchmark)
let _config: BenchmarkConfig = DEFAULT_CONFIG;

// ─── Empty Response Tracking ────────────────────────────────────────────────

let _consecutiveEmpty = 0;
let _totalEmpty = 0;
let _totalCalls = 0;

/**
 * Run async tasks with bounded concurrency.
 * Returns results in the same order as the input tasks.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  token: vscode.CancellationToken,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  // Cap concurrency to avoid listener thundering herd; safety max = 2
  const boundedConcurrency = Math.min(Math.max(1, concurrency), 2);

  async function worker(): Promise<void> {
    while (!token.isCancellationRequested) {
      const idx = nextIndex++;
      if (idx >= tasks.length) break;
      enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(boundedConcurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Single LLM Call ────────────────────────────────────────────────────────

/** Simple delay helper */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify the model can respond before burning hours on a full run.
 * Sends a trivial prompt and checks for a non-empty response.
 */
async function healthCheckModel(model: vscode.LanguageModelChat, token: vscode.CancellationToken): Promise<boolean> {
  const messages = [vscode.LanguageModelChatMessage.User("Reply with exactly: HEALTH_OK")];

  for (let attempt = 0; attempt < 2; attempt++) {
    if (token.isCancellationRequested) return false;
    // Guard in case host is already near OOM
    try {
      enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);
    } catch (err) {
      logOnce("health-oom", `Health check aborted: ${String((err as Error).message ?? err)}`);
      return false;
    }
    try {
      const response = await model.sendRequest(messages, { modelOptions: { max_tokens: 16 } }, token);
      let text = "";
      for await (const chunk of response.text) {
        text += chunk;
      }
      if (text.trim().length > 0) {
        logOnce("health-ok", `Health check passed (attempt ${attempt + 1}): "${text.trim().slice(0, 80)}"`);
        return true;
      }
      logOnce("health-empty", `Health check: empty response on attempt ${attempt + 1}`);
      await delay(RETRY_BASE_DELAY_MS);
    } catch (error) {
      logOnce(
        "health-error",
        `Health check error on attempt ${attempt + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await delay(RETRY_BASE_DELAY_MS);
    }
  }
  return false;
}

async function sendPrompt(
  model: vscode.LanguageModelChat,
  prompt: string,
  token: vscode.CancellationToken,
): Promise<string> {
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  _totalCalls++;

  // Early guard to avoid entering LLM stream if heap is already high
  enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);

  const maxRetries = _config.maxRetries ?? MAX_RETRIES;
  const maxTokens = _config.maxOutputTokens ?? MAX_OUTPUT_TOKENS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (token.isCancellationRequested) return "";

    try {
      const response = await model.sendRequest(
        messages,
        {
          modelOptions: { max_tokens: Math.min(maxTokens, _config.maxOutputTokens ?? MAX_OUTPUT_TOKENS) },
        },
        token,
      );

      // Try to dispose of response listeners proactively
      const disposables: vscode.Disposable[] = [];
      const cleanup = () => disposables.forEach((d) => d.dispose());
      let text = "";
      try {
        for await (const chunk of response.text) {
          if (token.isCancellationRequested) break;
          text += chunk;
        }
      } finally {
        cleanup();
      }

      // If the model returned a non-empty response, accept it
      if (text.trim().length > 0) {
        _consecutiveEmpty = 0;
        // Small delay between requests to avoid overwhelming the API
        await delay(_config.interRequestDelayMs ?? INTER_REQUEST_DELAY_MS);
        return text;
      }

      // Empty response — retry with backoff unless exhausted
      if (attempt < maxRetries) {
        const backoff = (_config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS) * Math.pow(2, attempt);
        log(`Empty response on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoff}ms…`);
        await delay(backoff);
      }
    } catch (error) {
      if (token.isCancellationRequested) return "";
      if (error instanceof vscode.CancellationError) return "";

      // Retry on transient errors (e.g. HTTP/2 protocol errors)
      if (attempt < maxRetries) {
        const backoff = (_config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS) * Math.pow(2, attempt);
        log(
          `sendRequest error on attempt ${attempt + 1}/${maxRetries + 1}: ${error instanceof Error ? error.message : String(error)}. Retrying in ${backoff}ms…`,
        );
        await delay(backoff);
      } else {
        log(
          `sendRequest failed after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }

  // All retries exhausted with empty responses
  _consecutiveEmpty++;
  _totalEmpty++;
  log(
    `All ${maxRetries + 1} retries returned empty (consecutive: ${_consecutiveEmpty}, total: ${_totalEmpty}/${_totalCalls})`,
  );

  const maxEmpty = _config.maxConsecutiveEmpty ?? MAX_CONSECUTIVE_EMPTY;
  if (_consecutiveEmpty >= maxEmpty) {
    const msg =
      `Aborting: ${maxEmpty} consecutive LLM calls returned empty responses. ` +
      `The model (${model.name || model.id}) does not appear to be responding. ` +
      `Check the "Judges LLM Benchmark" output channel and VS Code developer console for details.`;
    log(msg);
    throw new Error(msg);
  }

  return "";
}

// ─── Per-Judge Benchmark ────────────────────────────────────────────────────

async function runPerJudgeBenchmark(
  model: vscode.LanguageModelChat,
  cases: BenchmarkCase[],
  token: vscode.CancellationToken,
  onProgress: (p: BenchmarkProgress) => void,
  checkpoint: BenchmarkCheckpoint,
): Promise<LlmCaseResult[]> {
  // Build a flat list of (case, judge) pairs so we can parallelize across all of them
  const pairs: { tc: BenchmarkCase; judge: JudgeDefinition; caseIdx: number }[] = [];
  for (let ci = 0; ci < cases.length; ci++) {
    for (const judge of selectRelevantJudges(cases[ci])) {
      pairs.push({ tc: cases[ci], judge, caseIdx: ci });
    }
  }

  // Determine which pairs are already completed from checkpoint
  const completedKeys = new Set(checkpoint.perJudgeEntries.map((e) => `${e.caseIdx}:${e.judgeId}`));

  // Restore accumulated state from checkpoint
  const caseRuleIds: string[][] = cases.map(() => []);
  const caseResponses: string[][] = cases.map(() => []);
  for (const entry of checkpoint.perJudgeEntries) {
    caseRuleIds[entry.caseIdx].push(...entry.ruleIds);
    caseResponses[entry.caseIdx].push(entry.response);
  }

  const remainingPairs = pairs.filter((p) => !completedKeys.has(`${p.caseIdx}:${p.judge.id}`));

  const totalCalls = pairs.length;
  let completed = pairs.length - remainingPairs.length;
  let sinceLastSave = 0;

  if (completed > 0) {
    onProgress({
      message: `Per-judge: resuming — ${completed} of ${totalCalls} already done`,
      completed,
      total: totalCalls,
    });
  }

  const tasks = remainingPairs.map((p: { tc: BenchmarkCase; judge: JudgeDefinition; caseIdx: number }) => async () => {
    onProgress({
      message: `Per-judge: ${p.tc.id} → ${p.judge.name} (${completed + 1}/${totalCalls})`,
      completed,
      total: totalCalls,
    });

    const prompt = constructPerJudgePrompt(p.judge, p.tc.code, p.tc.language);
    const response = await sendPrompt(model, prompt, token);
    const validation = extractValidatedLlmFindings(response, getValidRulePrefixes());
    if (validation.errors.length) {
      log(`⚠️ [${p.tc.id}/${p.judge.id}] LLM validation warnings: ${validation.errors.join("; ")}`);
    }
    const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);

    caseRuleIds[p.caseIdx].push(...ruleIds);
    const responseEntry = `[${p.judge.id}]: ${truncateResponse(response, _config.responseSnapshotChars ?? MAX_RESPONSE_SNAPSHOT_CHARS)}`;
    caseResponses[p.caseIdx].push(responseEntry);

    // Persist a minimal checkpoint entry to limit memory usage
    checkpoint.perJudgeEntries.push({
      caseIdx: p.caseIdx,
      judgeId: p.judge.id,
      ruleIds,
      response: responseEntry,
    });

    completed++;
    sinceLastSave++;

    // Soft heap guard & telemetry every N calls
    if (_totalCalls > 0 && _totalCalls % (_config.logMemoryEvery ?? DEFAULT_LOG_MEMORY_EVERY) === 0) {
      logMemory(`Memory after ${_totalCalls} calls`);
      enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);
      maybeGc();
    }

    if (sinceLastSave >= CHECKPOINT_SAVE_INTERVAL) {
      sinceLastSave = 0;
      await saveCheckpoint(checkpoint);
    }
  });

  await runWithConcurrency(tasks, _config.concurrency ?? DEFAULT_CONCURRENCY, token);

  // Final save after per-judge completes
  await saveCheckpoint(checkpoint);

  // Score each case from its accumulated results
  return cases.map((tc, i) => {
    const uniqueRuleIds = [...new Set(caseRuleIds[i])];
    return scoreLlmCase(tc, uniqueRuleIds, caseResponses[i].join("\n\n---\n\n"));
  });
}

// ─── Tribunal Benchmark ─────────────────────────────────────────────────────

async function runTribunalBenchmark(
  model: vscode.LanguageModelChat,
  cases: BenchmarkCase[],
  token: vscode.CancellationToken,
  onProgress: (p: BenchmarkProgress) => void,
  checkpoint: BenchmarkCheckpoint,
): Promise<LlmCaseResult[]> {
  const completedIndices = new Set(checkpoint.tribunalEntries.map((e) => e.caseIdx));

  // Pre-fill results array from checkpoint
  const results: (LlmCaseResult | undefined)[] = cases.map(() => undefined);
  for (const entry of checkpoint.tribunalEntries) {
    results[entry.caseIdx] = entry.result;
  }

  const remaining = cases.map((tc, i) => ({ tc, idx: i })).filter((item) => !completedIndices.has(item.idx));

  let completed = cases.length - remaining.length;
  let sinceLastSave = 0;

  if (completed > 0) {
    onProgress({
      message: `Tribunal: resuming — ${completed} of ${cases.length} already done`,
      completed,
      total: cases.length,
    });
  }

  const tasks = remaining.map((item: { tc: BenchmarkCase; idx: number }) => async () => {
    const idx = ++completed;
    onProgress({
      message: `Tribunal: ${item.tc.id} (${idx}/${cases.length})`,
      completed: idx - 1,
      total: cases.length,
    });

    const prompt = constructTribunalPrompt(item.tc.code, item.tc.language);
    const response = await sendPrompt(model, prompt, token);
    const validation = extractValidatedLlmFindings(response, getValidRulePrefixes());
    if (validation.errors.length) {
      log(`⚠️ [${item.tc.id}/tribunal] LLM validation warnings: ${validation.errors.join("; ")}`);
    }
    const ruleIds = validation.ruleIds.length ? validation.ruleIds : parseLlmRuleIds(response);
    const result = scoreLlmCase(
      item.tc,
      ruleIds,
      truncateResponse(response, _config.responseSnapshotChars ?? MAX_RESPONSE_SNAPSHOT_CHARS),
    );

    results[item.idx] = result;
    checkpoint.tribunalEntries.push({ caseIdx: item.idx, result });

    sinceLastSave++;

    // Soft heap guard & telemetry every N calls
    if (_totalCalls > 0 && _totalCalls % (_config.logMemoryEvery ?? DEFAULT_LOG_MEMORY_EVERY) === 0) {
      logMemory(`Memory after ${_totalCalls} calls (tribunal phase)`);
      enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);
      maybeGc();
    }

    if (sinceLastSave >= CHECKPOINT_SAVE_INTERVAL) {
      sinceLastSave = 0;
      await saveCheckpoint(checkpoint);
    }

    return result;
  });

  await runWithConcurrency(tasks, _config.concurrency ?? DEFAULT_CONCURRENCY, token);

  // Final save
  await saveCheckpoint(checkpoint);

  return results.filter((r): r is LlmCaseResult => r !== undefined);
}

// ─── Full Benchmark ─────────────────────────────────────────────────────────

/**
 * Run the full LLM benchmark against the currently selected VS Code model.
 * Evaluates cases in both per-judge and tribunal modes, writes output files.
 * Supports checkpoint/resume — if interrupted, re-running picks up where it left off.
 */
export async function runLlmBenchmark(
  token: vscode.CancellationToken,
  onProgress: (p: BenchmarkProgress) => void,
  storageUri: vscode.Uri,
  chatModel?: vscode.LanguageModelChat,
): Promise<BenchmarkRunResult> {
  // 0. Load config (settings/env)
  _config = getBenchmarkConfig();
  if (!_config.enabled) {
    const msg =
      "LLM benchmark is disabled by default to protect the VS Code extension host. Enable via settings (judges.llmBenchmark.enabled) or env JUDGES_LLM_BENCHMARK_ENABLED=true.";
    logOnce("benchmark-disabled", msg, 60_000);
    throw new Error(msg);
  }
  // guard against extreme values
  if (_config.sampleSize > 200) {
    const warn = `sampleSize ${_config.sampleSize} is high; capping to 200 for stability.`;
    logOnce("cap-sample", warn, 60_000);
    _config.sampleSize = 200;
  }
  if (_config.maxOutputTokens > 4096) {
    const warn = `maxOutputTokens ${_config.maxOutputTokens} is high; capping to 4096 for stability.`;
    logOnce("cap-tokens", warn, 60_000);
    _config.maxOutputTokens = 4096;
  }

  // 1. Resolve model
  const model = chatModel ?? (await resolveModel(token));
  const modelName = model.name || model.id;
  const provider = model.vendor || "vscode";

  // Reset tracking counters
  _consecutiveEmpty = 0;
  _totalEmpty = 0;
  _totalCalls = 0;

  // Show output channel
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel("Judges LLM Benchmark");
  }
  _outputChannel.show(true);
  log(`Starting benchmark: model=${modelName}, provider=${provider}, maxOutputTokens=${MAX_OUTPUT_TOKENS}`);
  log(
    `Model details: id=${model.id}, family=${model.family}, vendor=${model.vendor}, version=${model.version}, maxInputTokens=${model.maxInputTokens}`,
  );
  log(
    `Benchmark config: enabled=${_config.enabled}, sampleSize=${_config.sampleSize}, maxOutputTokens=${_config.maxOutputTokens}, concurrency=${_config.concurrency}, interDelayMs=${_config.interRequestDelayMs}, maxRetries=${_config.maxRetries}, maxHeapMb=${_config.maxHeapMb}`,
  );
  if (_config.concurrency > 1) {
    logOnce(
      "concurrency-warning",
      "Using concurrency >1 may trigger listener leak warnings in VS Code chat UI; consider sticking to 1.",
    );
  }

  // 1b. Health check — verify the model responds before burning hours
  onProgress({ message: "Verifying model health…", completed: 0, total: 1 });
  const healthy = await healthCheckModel(model, token);
  if (!healthy) {
    const msg =
      `Model health check failed: ${modelName} returned empty responses for all 3 test prompts. ` +
      `Check the "Judges LLM Benchmark" output channel for details.`;
    log(msg);
    vscode.window.showErrorMessage(msg);
    throw new Error(msg);
  }

  // 2. Select stratified sample (configurable)
  const sampleSize = Math.min(_config.sampleSize ?? DEFAULT_CONFIG.sampleSize, BENCHMARK_CASES.length);
  const cases = selectStratifiedSample(BENCHMARK_CASES, sampleSize);
  const sampleCaseIds = cases.map((c: BenchmarkCase) => c.id);
  log(`Selected stratified sample of ${sampleSize} cases (configurable via judges.llmBenchmark.sampleSize).`);
  enforceHeapGuard(_config.maxHeapMb ?? DEFAULT_MAX_HEAP_MB);

  // 3. Set storage URI and check for existing checkpoint
  _storageUri = storageUri;
  try {
    await vscode.workspace.fs.createDirectory(storageUri);
  } catch {
    /* exists */
  }

  let checkpoint = await loadCheckpoint();
  let resumed = false;

  if (checkpoint) {
    // Verify same sample AND same config snapshot (guard against config changes between runs)
    const sameModel = checkpoint.modelName === modelName;
    const sameSample =
      checkpoint.sampleCaseIds.length === sampleCaseIds.length &&
      checkpoint.sampleCaseIds.every((id, i) => id === sampleCaseIds[i]);
    const configSnap = checkpoint.config || {};
    const sameConfig =
      (configSnap.sampleSize ?? _config.sampleSize) === _config.sampleSize &&
      (configSnap.maxOutputTokens ?? _config.maxOutputTokens) === _config.maxOutputTokens &&
      (configSnap.concurrency ?? _config.concurrency) === _config.concurrency;

    if (sameModel && sameSample && sameConfig && checkpoint.phase !== "complete") {
      const pjDone = checkpoint.perJudgeEntries.length;
      const trDone = checkpoint.tribunalEntries.length;
      const choice = await vscode.window.showInformationMessage(
        `Found checkpoint: ${pjDone} per-judge calls, ${trDone} tribunal calls completed (phase: ${checkpoint.phase}). Resume?`,
        "Resume",
        "Start Fresh",
      );

      if (choice === "Resume") {
        resumed = true;
      } else {
        checkpoint = undefined;
      }
    } else {
      // Different model/sample/config or already complete — discard
      checkpoint = undefined;
    }
  }

  if (!checkpoint) {
    checkpoint = {
      version: 1,
      modelName,
      provider,
      sampleCaseIds,
      config: {
        sampleSize: _config.sampleSize,
        maxOutputTokens: _config.maxOutputTokens,
        concurrency: _config.concurrency,
      },
      startTime: Date.now(),
      phase: "per-judge",
      perJudgeEntries: [],
      tribunalEntries: [],
    };
    await saveCheckpoint(checkpoint);
  }

  const startTime = checkpoint.startTime;

  onProgress({
    message: resumed
      ? `Resuming benchmark (${cases.length} cases, model: ${modelName})`
      : `Selected ${cases.length} stratified cases from ${BENCHMARK_CASES.length} total`,
    completed: 0,
    total: 1,
  });

  // 4. Run per-judge benchmark (skip if already completed in checkpoint)
  let perJudgeResults: LlmCaseResult[];
  let perJudgeDuration = 0;

  if (checkpoint.phase === "per-judge") {
    const pjStart = Date.now();
    log("Starting per-judge benchmark…");
    onProgress({ message: "Starting per-judge benchmark…", completed: 0, total: 1 });
    perJudgeResults = await runPerJudgeBenchmark(model, cases, token, onProgress, checkpoint);
    perJudgeDuration = Math.round((Date.now() - pjStart) / 1000);

    log(`Per-judge complete: ${_totalCalls} calls, ${_totalEmpty} empty, duration ${perJudgeDuration}s`);

    if (token.isCancellationRequested) {
      await saveCheckpoint(checkpoint);
      return buildPartialResult(perJudgeResults, [], modelName, provider, startTime);
    }

    // Advance phase
    checkpoint.phase = "tribunal";
    checkpoint.perJudgeResults = perJudgeResults;
    await saveCheckpoint(checkpoint);
  } else {
    // Phase is "tribunal" — per-judge already done
    perJudgeResults = checkpoint.perJudgeResults!;
    onProgress({ message: "Per-judge phase already complete, skipping…", completed: 1, total: 1 });
  }

  // Reset per-phase counters
  _consecutiveEmpty = 0;
  const tribunalEmptyBefore = _totalEmpty;

  // 5. Run tribunal benchmark
  const trStart = Date.now();
  log("Starting tribunal benchmark…");
  onProgress({ message: "Starting tribunal benchmark…", completed: 0, total: 1 });
  const tribunalResults = await runTribunalBenchmark(model, cases, token, onProgress, checkpoint);
  const tribunalDuration = Math.round((Date.now() - trStart) / 1000);

  log(`Tribunal complete: ${_totalEmpty - tribunalEmptyBefore} empty, duration ${tribunalDuration}s`);

  if (token.isCancellationRequested) {
    await saveCheckpoint(checkpoint);
    return buildPartialResult(perJudgeResults, tribunalResults, modelName, provider, startTime);
  }

  const totalDuration = Math.round((Date.now() - startTime) / 1000);
  log(`Benchmark complete: total duration ${totalDuration}s, total calls ${_totalCalls}, total empty ${_totalEmpty}`);

  // 6. Compute snapshots
  const version = getVersion();

  const perJudgeSnapshot = computeLlmMetrics(
    perJudgeResults,
    version,
    modelName,
    provider,
    "per-judge",
    perJudgeDuration || totalDuration,
  );

  const tribunalSnapshot = computeLlmMetrics(
    tribunalResults,
    version,
    modelName,
    provider,
    "tribunal",
    tribunalDuration,
  );

  // 7. Format outputs
  const reportMarkdown = formatStandaloneBenchmarkReport(perJudgeSnapshot, tribunalSnapshot);
  const snapshotJson = JSON.stringify(perJudgeSnapshot, null, 2);

  // 8. Write output files to extension storage and clean up checkpoint
  await writeOutputFiles(storageUri, snapshotJson, reportMarkdown);
  await deleteCheckpoint();

  return {
    perJudge: perJudgeSnapshot,
    tribunal: tribunalSnapshot,
    reportMarkdown,
    snapshotJson,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    const ext = vscode.extensions.getExtension("kevinrabun.judges-panel");
    return ext?.packageJSON?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function buildPartialResult(
  perJudgeResults: LlmCaseResult[],
  tribunalResults: LlmCaseResult[],
  modelName: string,
  provider: string,
  startTime: number,
): BenchmarkRunResult {
  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  const version = getVersion();

  const perJudge =
    perJudgeResults.length > 0
      ? computeLlmMetrics(perJudgeResults, version, modelName, provider, "per-judge", durationSeconds)
      : undefined;

  const tribunal =
    tribunalResults.length > 0
      ? computeLlmMetrics(tribunalResults, version, modelName, provider, "tribunal", durationSeconds)
      : undefined;

  const reportMarkdown = formatStandaloneBenchmarkReport(perJudge, tribunal);
  const snapshotJson = perJudge ? JSON.stringify(perJudge, null, 2) : "{}";

  return { perJudge, tribunal, reportMarkdown, snapshotJson };
}

async function writeOutputFiles(storageDir: vscode.Uri, snapshotJson: string, reportMarkdown: string): Promise<void> {
  const encoder = new TextEncoder();

  // Write latest snapshot
  const latestUri = vscode.Uri.joinPath(storageDir, "llm-snapshot-latest.json");
  await vscode.workspace.fs.writeFile(latestUri, encoder.encode(snapshotJson));

  // Write standalone report
  const reportUri = vscode.Uri.joinPath(storageDir, "llm-benchmark-report.md");
  await vscode.workspace.fs.writeFile(reportUri, encoder.encode(reportMarkdown));

  // Write timestamped archive
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archiveUri = vscode.Uri.joinPath(storageDir, `llm-snapshot-${timestamp}.json`);
  await vscode.workspace.fs.writeFile(archiveUri, encoder.encode(snapshotJson));
}

/**
 * Copy benchmark results from extension storage to the workspace benchmarks/ folder.
 * Used for committing results to the repo (dev workflow).
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

  const filesToCopy = ["llm-snapshot-latest.json", "llm-benchmark-report.md"];

  for (const name of filesToCopy) {
    const src = vscode.Uri.joinPath(storageUri, name);
    const dst = vscode.Uri.joinPath(benchmarksDir, name);
    try {
      const data = await vscode.workspace.fs.readFile(src);
      await vscode.workspace.fs.writeFile(dst, data);
    } catch {
      // file may not exist yet
    }
  }

  const reportUri = vscode.Uri.joinPath(benchmarksDir, "llm-benchmark-report.md");
  return reportUri;
}

// Internal test hooks (not part of public extension API)
export const __test = {
  truncateResponse,
  enforceHeapGuard,
  getBenchmarkConfig,
  logMemory,
  maybeGc,
};
