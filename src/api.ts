/**
 * Judges Panel — Programmatic API
 *
 * Public entry-point for consuming judges as a library (not via MCP).
 *
 * ```ts
 * import { evaluateCode, evaluateProject, JUDGES } from "@kevinrabun/judges/api";
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
  SuppressionRecord,
  SuppressionResult,
  ExecutionTrace,
  RuleTrace,
  StreamingBatch,
  JudgeSelectionContext,
  JudgeSelectionResult,
  SessionContext,
} from "./types.js";

// ─── Errors ──────────────────────────────────────────────────────────────────
export { JudgesError, ConfigError, EvaluationError, ParseError } from "./errors.js";

// ─── Config ──────────────────────────────────────────────────────────────────
export {
  parseConfig,
  defaultConfig,
  mergeConfigs,
  discoverCascadingConfigs,
  loadCascadingConfig,
  loadConfigFile,
  expandEnvPlaceholders,
  loadPluginJudges,
  validatePluginSpecifiers,
  isValidJudgeDefinition,
  validateJudgeDefinition,
  applyOverridesForFile,
  applyLanguageProfile,
  resolveExtendsConfig,
} from "./config.js";

// ─── Language Detection ──────────────────────────────────────────────────────
export { EXT_TO_LANG, SUPPORTED_EXTENSIONS, detectLanguageFromPath } from "./ext-to-lang.js";

// ─── Judge Registry ──────────────────────────────────────────────────────────
export { JUDGES, getJudge, getJudgeSummaries } from "./judges/index.js";

// ─── Core Evaluation Functions ───────────────────────────────────────────────

export {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateWithTribunalStreaming,
  evaluateProject,
  evaluateDiff,
  analyzeDependencies,
  enrichWithPatches,
  crossEvaluatorDedup,
  crossFileDedup,
  diffFindings,
  formatFindingDiff,
  evaluateNetChangeGate,
  applyInlineSuppressions,
  applyInlineSuppressionsWithAudit,
  runAppBuilderWorkflow,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
  clearEvaluationCaches,
  scanProjectWideSecurityPatterns,
} from "./evaluators/index.js";
export type { FindingDiff, NetChangeGateOptions, NetChangeGateResult, EvaluationOptions } from "./evaluators/index.js";

// ─── Adaptive Judge Selection ────────────────────────────────────────────────
export { selectJudges } from "./evaluators/judge-selector.js";

// ─── Evaluation Session ─────────────────────────────────────────────────────
export { EvaluationSession, getGlobalSession, resetGlobalSession } from "./evaluation-session.js";

// ─── Presets ─────────────────────────────────────────────────────────────────
export { getPreset, composePresets, listPresets, PRESETS } from "./presets.js";
export type { Preset } from "./presets.js";

// ─── V2 Policy-Aware API ────────────────────────────────────────────────────
export { evaluateCodeV2, evaluateProjectV2, getSupportedPolicyProfiles } from "./evaluators/v2.js";

// ─── Cross-File Taint Analysis ───────────────────────────────────────────────
export { analyzeCrossFileTaint } from "./ast/cross-file-taint.js";

// ─── Deep Review Prompts ─────────────────────────────────────────────────────
export {
  buildSingleJudgeDeepReviewSection,
  buildTribunalDeepReviewSection,
  buildSimplifiedDeepReviewSection,
  formatRelatedFilesSection,
  isContentPolicyRefusal,
  DEEP_REVIEW_PROMPT_INTRO,
  DEEP_REVIEW_IDENTITY,
  DEFAULT_MAX_PROMPT_CHARS,
} from "./tools/deep-review.js";
export type { RelatedFileSnippet } from "./tools/deep-review.js";

// ─── Prompt Utilities ────────────────────────────────────────────────────────
export { getCondensedCriteria } from "./tools/prompts.js";

// ─── Feedback & Calibration ─────────────────────────────────────────────────
export {
  parseDismissedFindings,
  recordL2Feedback,
  loadFeedbackStore,
  saveFeedbackStore,
  addFeedback,
  computeFeedbackStats,
  getFpRateByRule,
  mergeFeedbackStores,
  computeTeamFeedbackStats,
  formatTeamStatsOutput,
} from "./commands/feedback.js";
export type {
  FeedbackVerdict,
  FeedbackEntry,
  FeedbackStore,
  FeedbackStats,
  DismissedFinding,
  TeamFeedbackStats,
  RuleTeamStats,
} from "./commands/feedback.js";

// ─── Cache Utilities ─────────────────────────────────────────────────────────
export { LRUCache, contentHash } from "./cache.js";
export { DiskCache, getSharedDiskCache, clearSharedDiskCache } from "./disk-cache.js";
export { clearProjectCache } from "./evaluators/project.js";

// ─── Formatters ──────────────────────────────────────────────────────────────
export { findingsToSarif, evaluationToSarif, verdictToSarif, validateSarifLog } from "./formatters/sarif.js";
export type { SarifValidationError } from "./formatters/sarif.js";
export { verdictToCsvRows, verdictsToCsv, findingsToCsv } from "./formatters/csv.js";
export { verdictToGitHubActions } from "./formatters/github-actions.js";

// ─── Escalation Protocol ────────────────────────────────────────────────────
export {
  evaluateEscalations,
  resolveEscalation,
  computeEscalationSummary,
  shouldBlockOnEscalations,
  enhanceReviewWithEscalations,
  loadEscalationStore,
  saveEscalationStore,
} from "./escalation.js";
export type {
  EscalatedFinding,
  EscalationStore,
  EscalationSummary,
  EscalationPolicy,
  EscalationReason,
  EscalationStatus,
  EscalationRouting,
} from "./escalation.js";

// ─── Audit Trail ─────────────────────────────────────────────────────────────
export {
  appendAuditEvent,
  readAuditTrail,
  verifyAuditIntegrity,
  recordEvaluationStart,
  recordEvaluationComplete,
  recordFindings,
  recordSuppression,
  recordOverride,
  recordEscalation,
  recordReviewDecision,
  recordTriageAction,
  computeAuditSummary,
  queryAuditTrail,
} from "./audit-trail.js";
export type { AuditEvent, AuditEventType, AuditPayload, AuditSummary } from "./audit-trail.js";

// ─── SAST Integration ────────────────────────────────────────────────────────
export {
  registerSastProvider,
  getSastProvider,
  listSastProviders,
  ingestSarifFile,
  ingestSarifContent,
  mergeSastFindings,
} from "./sast-integration.js";
export type { SastProvider } from "./sast-integration.js";

// ─── Multi-Turn Review Conversation ──────────────────────────────────────────
export {
  startReviewConversation,
  processMessage,
  getOutstandingFindings,
  isConversationResolved,
  exportConversationAsMarkdown,
} from "./review-conversation.js";
export type {
  ReviewConversation,
  ConversationMessage,
  ConversationRole,
  MessageIntent,
  ConversationState,
  DeveloperContext,
} from "./review-conversation.js";

// ─── A2A Protocol ────────────────────────────────────────────────────────────
export {
  getAgentCard,
  createTask,
  getTask,
  completeTask,
  failTask,
  listTasks,
  pruneTasks,
  handleA2ARequest,
} from "./a2a-protocol.js";
export type {
  AgentCard,
  AgentCapability,
  A2ATask,
  A2ATaskResult,
  TaskStatus,
  A2ARequest,
  A2AResponse,
} from "./a2a-protocol.js";

// ─── Fix-Outcome Feedback Loop ───────────────────────────────────────────────
export { runFeedbackLoop, formatFeedbackLoopReport } from "./feedback-loop.js";
export type { FeedbackLoopResult, ConfidenceAdjustment, FeedbackLoopStats } from "./feedback-loop.js";

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

// ─── Judge Registry ──────────────────────────────────────────────────────────
export { JudgeRegistry, defaultRegistry } from "./judge-registry.js";

// ─── Agent Markdown Loader ───────────────────────────────────────────────────
export {
  parseFrontmatter,
  validateFrontmatter,
  parseAgentFile,
  resolveEvaluator,
  agentToJudgeDefinition,
  loadAgentDirectory,
  loadAndRegisterAgents,
} from "./agent-loader.js";
export type { AgentFrontmatter, ParsedAgent } from "./agent-loader.js";

// ─── Skill Loader ───────────────────────────────────────────────────────────
export {
  parseSkillFrontmatter,
  validateSkillFrontmatter,
  parseSkillFile,
  loadSkillDirectory,
  listSkills,
  runSkill,
} from "./skill-loader.js";
export type { SkillFrontmatter, ParsedSkill } from "./skill-loader.js";

// ─── AI Code Fingerprinting ─────────────────────────────────────────────────
export { fingerprintCode, fingerprintToFindings } from "./fingerprint.js";
export type { AiFingerprint, AiSignal } from "./fingerprint.js";

// ─── Confidence Calibration ─────────────────────────────────────────────────
export { buildCalibrationProfile, calibrateFindings, autoCalibrateFindings } from "./calibration.js";
export type { CalibrationProfile } from "./calibration.js";
export {
  estimateFindingConfidence,
  estimateFindingConfidenceWithBasis,
  buildEvidenceChain,
  mapToOwaspLlmTop10,
} from "./scoring.js";
export type { EvidenceChain, EvidenceStep } from "./types.js";

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

// ─── Patch Application ─────────────────────────────────────────────────────
export {
  applyPatches,
  filterPatches,
  detectOverlaps,
  sortPatchesBottomUp,
  collectPatchSet,
  applyPatchSet,
} from "./commands/fix.js";
export type { PatchCandidate, PatchFilter, FilePatchGroup, PatchSet, PatchSetResult } from "./commands/fix.js";

// ─── Custom Rule Testing ────────────────────────────────────────────────────
export {
  testRule,
  runRuleTests,
  validateRuleTestSuite,
  formatRuleTestResults,
  deserializeRule,
} from "./commands/rule.js";
export type { RuleTestCase, RuleTestResult, RuleTestSuiteResult } from "./commands/rule.js";

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
export {
  runBenchmarkSuite,
  benchmarkGate,
  formatBenchmarkReport,
  formatBenchmarkMarkdown,
  analyzeL2Coverage,
  formatL2CoverageReport,
  ingestFindingsAsBenchmarkCases,
  deduplicateIngestCases,
  BENCHMARK_CASES,
} from "./commands/benchmark.js";
export type {
  BenchmarkCase,
  BenchmarkResult,
  BenchmarkGateOptions,
  BenchmarkGateResult,
  L2CoverageAnalysis,
  L2JudgeCoverage,
  L2CategoryCoverage,
} from "./commands/benchmark.js";

// ─── LLM Benchmark ──────────────────────────────────────────────────────────
export {
  parseLlmRuleIds,
  constructPerJudgePrompt,
  constructTribunalPrompt,
  selectStratifiedSample,
  scoreLlmCase,
  computeLlmMetrics,
  formatLlmSnapshotMarkdown,
  formatLayerComparisonMarkdown,
  extractValidatedLlmFindings,
  getValidRulePrefixes,
} from "./commands/llm-benchmark.js";
export type { LlmBenchmarkSnapshot, LlmCaseResult } from "./commands/llm-benchmark.js";
export type { LlmFinding, ValidationResult } from "./probabilistic/llm-response-validator.js";

// ─── LLM Benchmark Optimizer (Self-Teaching) ────────────────────────────────
export {
  optimizeBenchmark,
  formatAmendmentSection,
  createEmptyStore,
  mergeAmendments,
} from "./commands/llm-benchmark-optimizer.js";
export type {
  PromptAmendment,
  OptimizerInsight,
  OptimizationResult,
  AmendmentStore,
} from "./commands/llm-benchmark-optimizer.js";

// Review autopilot (GitHub App / scripts)
export { runReviewAutopilot, dedupeComments, filterAlreadyPostedComments } from "./commands/review.js";
export { buildContextSnippets } from "./context/context-snippets.js";
export { EmbeddingCache, FallbackEmbeddingProvider, getOrCreateEmbedding } from "./context/embedding-cache.js";

// ─── Config Sharing & Policy ─────────────────────────────────────────────────
export {
  exportTeamConfig,
  importTeamConfig,
  pullRemoteConfig,
  writePolicyLock,
  readPolicyLock,
  validatePolicyCompliance,
} from "./commands/config-share.js";
export type { TeamConfig, PolicyLock, PolicyValidationResult } from "./commands/config-share.js";

// ─── Language Packs ──────────────────────────────────────────────────────────
export { getLanguagePack, listLanguagePacks, suggestPack, LANGUAGE_PACKS } from "./commands/language-packs.js";
// ─── Doctor Diagnostics ──────────────────────────────────────────────────
export {
  runDoctorChecks,
  formatDoctorReport,
  checkNodeVersion,
  checkConfigFile,
  checkJudgesLoaded,
  checkPlugins,
  checkFeedbackStore,
  checkBaselineFile,
  checkPresets,
} from "./commands/doctor.js";
export type { DoctorCheck, DoctorReport, CheckStatus } from "./commands/doctor.js";

// ─── Language Coverage ──────────────────────────────────────────────────────
export { computeLanguageCoverage, formatCoverageReport, detectFileLanguage } from "./commands/coverage.js";
export type { LanguageCoverageReport, LanguageCoverageEntry } from "./commands/coverage.js";

// ─── Finding Snapshots & Trends ─────────────────────────────────────────────
export {
  createSnapshotStore,
  loadSnapshotStore,
  saveSnapshotStore,
  recordSnapshot,
  computeTrend,
  formatTrendReport,
  computeMetrics,
} from "./commands/snapshot.js";
export type {
  FindingSnapshot,
  SnapshotStore,
  TrendPoint,
  TrendReport,
  RuleMetric,
  MetricsSummary,
} from "./commands/snapshot.js";

// ─── Rule Hit Metrics ───────────────────────────────────────────────────────
export { findJudgeForRule, computeRuleHitMetrics, formatRuleHitReport } from "./commands/rule-metrics.js";
export type { RuleHitEntry, RuleHitMetrics } from "./commands/rule-metrics.js";

// ─── Project Auto-Detection ─────────────────────────────────────────────────
export {
  detectLanguages,
  detectFrameworksFromFiles,
  classifyProjectType,
  detectCI,
  detectMonorepo,
  detectProjectSignals,
  recommendPreset,
  formatProjectSummary,
  formatRecommendation,
} from "./commands/auto-detect.js";
export type { ProjectSignals, ProjectType, PresetRecommendation } from "./commands/auto-detect.js";
// ─── Smart Output ────────────────────────────────────────────────────────────
export { formatSmartOutput, formatSmartSingleJudge } from "./commands/smart-output.js";
export type { SmartOutputOptions } from "./commands/smart-output.js";

// ─── Project Context Detection ───────────────────────────────────────────────
export { detectProjectContext } from "./evaluators/shared.js";
export type { ProjectContext } from "./types.js";

// ─── Finding Lifecycle & Triage ──────────────────────────────────────────────
export {
  loadFindingStore,
  saveFindingStore,
  updateFindings,
  getFindingStats,
  generateFindingFingerprint,
  triageFinding,
  getTriagedFindings,
  triageToFeedbackEntries,
  getTriageBasedSuppressions,
  formatDelta,
  formatTriageSummary,
} from "./finding-lifecycle.js";
export type { TrackedFinding, FindingStore, FindingDelta, TriageStatus } from "./finding-lifecycle.js";

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

// ─── PR Review Narrative ─────────────────────────────────────────────────────

export { buildPRReviewNarrative, assessReviewCompleteness } from "./commands/review.js";
export type { ReviewCompleteness } from "./commands/review.js";

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

// ─── GitHub App ──────────────────────────────────────────────────────────────
export { handleWebhook, verifyWebhookSignature, loadAppConfig, startAppServer, runAppCommand } from "./github-app.js";
export type { GitHubAppConfig } from "./github-app.js";

// ─── Git Diff Evaluation ─────────────────────────────────────────────────────
export { evaluateGitDiff, evaluateUnifiedDiff, parseUnifiedDiffToChangedLines } from "./git-diff.js";
export type { FileChangedLines, GitDiffVerdict } from "./git-diff.js";

// ─── Cross-File Import Resolution ────────────────────────────────────────────
export { resolveImports, buildRelatedFilesContext } from "./import-resolver.js";
export type { ResolvedImport, ImportResolutionResult } from "./import-resolver.js";

// ─── Auto-Tune (Feedback-Driven Calibration) ────────────────────────────────
export { applyAutoTune, generateAutoTuneReport, formatAutoTuneReport, formatAutoTuneReportJson } from "./auto-tune.js";
export type { AutoTuneReport, AutoTuneOptions, AutoTuneAction } from "./auto-tune.js";
