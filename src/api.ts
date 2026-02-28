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
export { parseConfig, defaultConfig } from "./config.js";

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

// ─── Cache Utilities ─────────────────────────────────────────────────────────
export { LRUCache, contentHash } from "./cache.js";
export { clearProjectCache } from "./evaluators/project.js";

// ─── Formatters ──────────────────────────────────────────────────────────────
export { findingsToSarif, evaluationToSarif, verdictToSarif } from "./formatters/sarif.js";

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
