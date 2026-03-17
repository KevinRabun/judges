/**
 * LLM Benchmark Runner — executes benchmark cases against the VS Code LM API.
 *
 * Uses the currently selected VS Code language model to evaluate benchmark
 * cases in both per-judge and tribunal modes. No API keys needed — the model
 * comes from `vscode.lm.selectChatModels()`.
 */

import * as vscode from "vscode";
import { JUDGES, BENCHMARK_CASES } from "@kevinrabun/judges/api";
import type { BenchmarkCase, JudgeDefinition } from "@kevinrabun/judges/api";
import {
  parseLlmRuleIds,
  scoreLlmCase,
  computeLlmMetrics,
  constructPerJudgePrompt,
  constructTribunalPrompt,
  selectStratifiedSample,
} from "@kevinrabun/judges/api";
import type { LlmBenchmarkSnapshot, LlmCaseResult } from "@kevinrabun/judges/api";
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

  const expectedPrefixes = new Set(tc.expectedRuleIds.map((r) => r.split("-")[0]));

  return JUDGES.filter((j) => expectedPrefixes.has(j.rulePrefix));
}

// ─── Concurrency Limiter ────────────────────────────────────────────────────

/**
 * Default number of parallel LLM requests.
 * Set to 1 (sequential) because the VS Code LM API proxy does not
 * reliably support concurrent streaming requests — concurrent calls
 * return empty response streams.
 */
const DEFAULT_CONCURRENCY = 1;

/** Delay between sequential LLM requests to avoid rate limiting (ms) */
const INTER_REQUEST_DELAY_MS = 300;

/** Maximum retries for an empty LLM response */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff on retry (ms) */
const RETRY_BASE_DELAY_MS = 2000;

/** Abort the benchmark if this many consecutive calls return empty */
const MAX_CONSECUTIVE_EMPTY = 10;

/** Maximum output tokens to request from the model */
const MAX_OUTPUT_TOKENS = 4096;

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

  async function worker(): Promise<void> {
    while (!token.isCancellationRequested) {
      const idx = nextIndex++;
      if (idx >= tasks.length) break;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
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

  for (let attempt = 0; attempt < 3; attempt++) {
    if (token.isCancellationRequested) return false;
    try {
      const response = await model.sendRequest(messages, { modelOptions: { max_tokens: 32 } }, token);
      let text = "";
      for await (const chunk of response.text) {
        text += chunk;
      }
      if (text.trim().length > 0) {
        log(`Health check passed (attempt ${attempt + 1}): "${text.trim().slice(0, 80)}"`);
        return true;
      }
      log(`Health check: empty response on attempt ${attempt + 1}`);
      await delay(RETRY_BASE_DELAY_MS);
    } catch (error) {
      log(`Health check error on attempt ${attempt + 1}: ${error instanceof Error ? error.message : String(error)}`);
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (token.isCancellationRequested) return "";

    try {
      const response = await model.sendRequest(messages, { modelOptions: { max_tokens: MAX_OUTPUT_TOKENS } }, token);

      let text = "";
      for await (const chunk of response.text) {
        if (token.isCancellationRequested) break;
        text += chunk;
      }

      // If the model returned a non-empty response, accept it
      if (text.trim().length > 0) {
        _consecutiveEmpty = 0;
        // Small delay between requests to avoid overwhelming the API
        await delay(INTER_REQUEST_DELAY_MS);
        return text;
      }

      // Empty response — retry with backoff unless exhausted
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        log(`Empty response on attempt ${attempt + 1}/${MAX_RETRIES + 1}, retrying in ${backoff}ms…`);
        await delay(backoff);
      }
    } catch (error) {
      if (token.isCancellationRequested) return "";
      if (error instanceof vscode.CancellationError) return "";

      // Retry on transient errors (e.g. HTTP/2 protocol errors)
      if (attempt < MAX_RETRIES) {
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        log(
          `sendRequest error on attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${error instanceof Error ? error.message : String(error)}. Retrying in ${backoff}ms…`,
        );
        await delay(backoff);
      } else {
        log(
          `sendRequest failed after ${MAX_RETRIES + 1} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }
  }

  // All retries exhausted with empty responses
  _consecutiveEmpty++;
  _totalEmpty++;
  log(
    `All ${MAX_RETRIES + 1} retries returned empty (consecutive: ${_consecutiveEmpty}, total: ${_totalEmpty}/${_totalCalls})`,
  );

  if (_consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
    const msg =
      `Aborting: ${MAX_CONSECUTIVE_EMPTY} consecutive LLM calls returned empty responses. ` +
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

  const tasks = remainingPairs.map((p) => async () => {
    onProgress({
      message: `Per-judge: ${p.tc.id} → ${p.judge.name} (${completed + 1}/${totalCalls})`,
      completed,
      total: totalCalls,
    });

    const prompt = constructPerJudgePrompt(p.judge, p.tc.code, p.tc.language);
    const response = await sendPrompt(model, prompt, token);
    const ruleIds = parseLlmRuleIds(response);

    caseRuleIds[p.caseIdx].push(...ruleIds);
    const responseEntry = `[${p.judge.id}]: ${response}`;
    caseResponses[p.caseIdx].push(responseEntry);

    checkpoint.perJudgeEntries.push({
      caseIdx: p.caseIdx,
      judgeId: p.judge.id,
      ruleIds,
      response: responseEntry,
    });

    completed++;
    sinceLastSave++;

    if (sinceLastSave >= CHECKPOINT_SAVE_INTERVAL) {
      sinceLastSave = 0;
      await saveCheckpoint(checkpoint);
    }
  });

  await runWithConcurrency(tasks, DEFAULT_CONCURRENCY, token);

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

  const tasks = remaining.map((item) => async () => {
    const idx = ++completed;
    onProgress({
      message: `Tribunal: ${item.tc.id} (${idx}/${cases.length})`,
      completed: idx - 1,
      total: cases.length,
    });

    const prompt = constructTribunalPrompt(item.tc.code, item.tc.language);
    const response = await sendPrompt(model, prompt, token);
    const ruleIds = parseLlmRuleIds(response);
    const result = scoreLlmCase(item.tc, ruleIds, response);

    results[item.idx] = result;
    checkpoint.tribunalEntries.push({ caseIdx: item.idx, result });

    sinceLastSave++;
    if (sinceLastSave >= CHECKPOINT_SAVE_INTERVAL) {
      sinceLastSave = 0;
      await saveCheckpoint(checkpoint);
    }

    return result;
  });

  await runWithConcurrency(tasks, DEFAULT_CONCURRENCY, token);

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

  // 2. Select stratified sample
  const sampleSize = 200;
  const cases = selectStratifiedSample(BENCHMARK_CASES, sampleSize);
  const sampleCaseIds = cases.map((c) => c.id);

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
    // Verify same sample
    const sameModel = checkpoint.modelName === modelName;
    const sameSample =
      checkpoint.sampleCaseIds.length === sampleCaseIds.length &&
      checkpoint.sampleCaseIds.every((id, i) => id === sampleCaseIds[i]);

    if (sameModel && sameSample && checkpoint.phase !== "complete") {
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
      // Different model/sample or already complete — discard
      checkpoint = undefined;
    }
  }

  if (!checkpoint) {
    checkpoint = {
      version: 1,
      modelName,
      provider,
      sampleCaseIds,
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
