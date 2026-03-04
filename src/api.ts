/**
 * Judges Panel — Programmatic API
 *
 * Public entry-point for consuming judges as a library (not via MCP).
 *
 * ```ts
 * import { evaluateCode, evaluateProject, getJudges } from "@kevinrabun/judges/api";
 * const result = evaluateCode("const x = eval(input);", "typescript");
 * ```
 */

// ─── Types (re-export everything consumers need) ────────────────────────────
export type {
  Severity,
  Verdict,
  Finding,
  Patch,
  LangFamily,
  JudgesConfig,
  RuleOverride,
  ProjectFile,
  ProjectVerdict,
  DiffVerdict,
  DependencyEntry,
  DependencyVerdict,
  JudgeEvaluation,
  TribunalVerdict,
  JudgeDefinition,
  EvaluationContextV2,
  EvidenceBundleV2,
  SpecializedFindingV2,
  TribunalVerdictV2,
  MustFixGateOptions,
  MustFixGateResult,
  AppBuilderWorkflowResult,
  PlainLanguageFinding,
  WorkflowTask,
  PolicyProfile,
} from "./types.js";

// ─── Errors ──────────────────────────────────────────────────────────────────
export { JudgesError, ConfigError, EvaluationError, ParseError } from "./errors.js";

// ─── Config ──────────────────────────────────────────────────────────────────
export { parseConfig, defaultConfig, mergeConfigs, discoverCascadingConfigs, loadCascadingConfig } from "./config.js";

// ─── Judge Registry ──────────────────────────────────────────────────────────
export { JUDGES, getJudge, getJudgeSummaries } from "./judges/index.js";

// ─── Core Evaluation Functions ───────────────────────────────────────────────

export {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateProject,
  evaluateDiff,
  analyzeDependencies,
  enrichWithPatches,
  crossEvaluatorDedup,
  applyInlineSuppressions,
  runAppBuilderWorkflow,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
  clearEvaluationCaches,
} from "./evaluators/index.js";

// ─── V2 Policy-Aware API ────────────────────────────────────────────────────
export { evaluateCodeV2, evaluateProjectV2, getSupportedPolicyProfiles } from "./evaluators/v2.js";

// ─── Cross-File Taint Analysis ───────────────────────────────────────────────
export { analyzeCrossFileTaint } from "./ast/cross-file-taint.js";

// ─── Deep Review Prompts ─────────────────────────────────────────────────────
export {
  buildSingleJudgeDeepReviewSection,
  buildTribunalDeepReviewSection,
  buildSimplifiedDeepReviewSection,
  isContentPolicyRefusal,
  DEEP_REVIEW_PROMPT_INTRO,
  DEEP_REVIEW_IDENTITY,
} from "./tools/deep-review.js";

// ─── Prompt Utilities ────────────────────────────────────────────────────────
export { getCondensedCriteria } from "./tools/prompts.js";

// ─── Cache Utilities ─────────────────────────────────────────────────────────
export { LRUCache, contentHash } from "./cache.js";
export { clearProjectCache } from "./evaluators/project.js";

// ─── Formatters ──────────────────────────────────────────────────────────────
export { findingsToSarif, evaluationToSarif, verdictToSarif, validateSarifLog } from "./formatters/sarif.js";
export type { SarifValidationError } from "./formatters/sarif.js";
export { verdictToCsvRows, verdictsToCsv, findingsToCsv } from "./formatters/csv.js";

// ─── CLI ─────────────────────────────────────────────────────────────────────
export { runCli } from "./cli.js";

// ─── Plugin API ──────────────────────────────────────────────────────────────
export {
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  getCustomRules,
  getPluginJudges,
  evaluateCustomRules,
  runBeforeHooks,
  runAfterHooks,
  clearPlugins,
} from "./plugins.js";
export type { CustomRule, JudgesPlugin, PluginRegistration } from "./plugins.js";

// ─── AI Code Fingerprinting ─────────────────────────────────────────────────
export { fingerprintCode, fingerprintToFindings } from "./fingerprint.js";
export type { AiFingerprint, AiSignal } from "./fingerprint.js";

// ─── Confidence Calibration ─────────────────────────────────────────────────
export { buildCalibrationProfile, calibrateFindings, autoCalibrateFindings } from "./calibration.js";
export type { CalibrationProfile } from "./calibration.js";

// ─── Feedback ────────────────────────────────────────────────────────────────
export { loadFeedbackStore, saveFeedbackStore, computeFeedbackStats, getFpRateByRule } from "./commands/feedback.js";
export type { FeedbackEntry, FeedbackStore, FeedbackVerdict, FeedbackStats } from "./commands/feedback.js";

// ─── Fix History / Learning ──────────────────────────────────────────────────
export {
  loadFixHistory,
  saveFixHistory,
  computeFixStats,
  recordFixAccepted,
  recordFixRejected,
  getFixAcceptanceRate,
  getLowAcceptanceRules,
} from "./fix-history.js";
export type { FixOutcome, FixHistory, FixStats } from "./fix-history.js";

// ─── IDE Diagnostics ─────────────────────────────────────────────────────────
export {
  findingToDiagnostic,
  findingsToDiagnostics,
  findingsToCodeActions,
  formatForProblemMatcher,
  formatAsJsonRpc,
} from "./formatters/diagnostics.js";
export type {
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
  CodeAction,
  PublishDiagnosticsParams,
} from "./formatters/diagnostics.js";

// ─── Comparison Benchmarks ───────────────────────────────────────────────────
export {
  compareCapabilities,
  formatComparisonReport,
  formatFullComparisonMatrix,
  TOOL_PROFILES,
  CAPABILITY_MATRIX,
} from "./comparison.js";
export type { ToolProfile, ToolCapability, ComparisonResult } from "./comparison.js";

// ─── Benchmark Gate ──────────────────────────────────────────────────────────
export { runBenchmarkSuite, benchmarkGate, formatBenchmarkReport } from "./commands/benchmark.js";
export type { BenchmarkResult, BenchmarkGateOptions, BenchmarkGateResult } from "./commands/benchmark.js";

// ─── Language Packs ──────────────────────────────────────────────────────────
export { getLanguagePack, listLanguagePacks, suggestPack, LANGUAGE_PACKS } from "./commands/language-packs.js";

// ─── Smart Output ────────────────────────────────────────────────────────────
export { formatSmartOutput, formatSmartSingleJudge } from "./commands/smart-output.js";
export type { SmartOutputOptions } from "./commands/smart-output.js";

// ─── Convenience Aliases ─────────────────────────────────────────────────────

import { evaluateWithTribunal, evaluateWithJudge } from "./evaluators/index.js";
import type { EvaluationOptions } from "./evaluators/index.js";
import type { JudgeEvaluation, TribunalVerdict } from "./types.js";
import { getJudge } from "./judges/index.js";
import { EvaluationError } from "./errors.js";

/**
 * Evaluate code against the full panel of judges (convenience wrapper).
 *
 * @param code     - Source code to evaluate
 * @param language - Programming language (e.g. "typescript", "python")
 * @param options  - Optional config, context, target judges, etc.
 * @returns Full tribunal verdict with per-judge evaluations and overall score
 */
export function evaluateCode(code: string, language: string, options?: EvaluationOptions): TribunalVerdict {
  return evaluateWithTribunal(code, language, undefined, options);
}

/**
 * Evaluate code with a single judge by name (convenience wrapper).
 *
 * @param judgeId  - The judge identifier (e.g. "cybersecurity", "performance")
 * @param code     - Source code to evaluate
 * @param language - Programming language
 * @param options  - Optional config
 * @returns Single-judge evaluation with findings and score
 */
export function evaluateCodeSingleJudge(
  judgeId: string,
  code: string,
  language: string,
  options?: EvaluationOptions,
): JudgeEvaluation {
  const judge = getJudge(judgeId);
  if (!judge) {
    throw new EvaluationError(`Unknown judge: "${judgeId}"`, judgeId);
  }
  return evaluateWithJudge(judge, code, language, undefined, options);
}

// ─── False-Positive Heuristic Filter ─────────────────────────────────────────

export { filterFalsePositiveHeuristics } from "./evaluators/false-positive-review.js";
export type { FpFilterResult } from "./evaluators/false-positive-review.js";

// ─── Streaming / Async API ──────────────────────────────────────────────────

export interface FileInput {
  /** Relative or absolute file path */
  path: string;
  /** Source code content */
  code: string;
  /** Programming language */
  language: string;
}

export interface FileEvaluationResult {
  /** File path that was evaluated */
  path: string;
  /** Tribunal verdict for this file */
  verdict: TribunalVerdict;
  /** Index in the input sequence */
  index: number;
}

/**
 * Async generator that evaluates files one at a time, yielding results
 * as they complete. Useful for progress reporting and streaming UIs.
 *
 * @example
 * ```ts
 * for await (const result of evaluateFilesStream(files)) {
 *   console.log(`${result.path}: ${result.verdict.overallScore}/100`);
 * }
 * ```
 */
export async function* evaluateFilesStream(
  files: FileInput[],
  options?: EvaluationOptions,
): AsyncGenerator<FileEvaluationResult> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const verdict = evaluateWithTribunal(file.code, file.language, undefined, options);
    yield { path: file.path, verdict, index: i };
  }
}

/**
 * Evaluate multiple files in parallel with bounded concurrency.
 * Returns results in the order files were provided.
 *
 * @param files       - Array of file inputs to evaluate
 * @param concurrency - Maximum parallel evaluations (default: 4)
 * @param options     - Evaluation options
 * @param onProgress  - Optional callback for progress reporting
 */
export async function evaluateFilesBatch(
  files: FileInput[],
  concurrency = 4,
  options?: EvaluationOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<FileEvaluationResult[]> {
  const results: FileEvaluationResult[] = new Array(files.length);
  let completed = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < files.length) {
      const i = nextIndex++;
      const file = files[i];
      const verdict = evaluateWithTribunal(file.code, file.language, undefined, options);
      results[i] = { path: file.path, verdict, index: i };
      completed++;
      onProgress?.(completed, files.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
