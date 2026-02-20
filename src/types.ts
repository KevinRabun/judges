/**
 * Severity levels for judge findings.
 */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * Verdict from a single judge — pass, fail, or warning.
 */
export type Verdict = "pass" | "fail" | "warning";

/**
 * A single finding raised by a judge during evaluation.
 */
export interface Finding {
  /** Unique rule identifier, e.g. "SEC-001" */
  ruleId: string;
  /** Severity of the finding */
  severity: Severity;
  /** Human-readable title */
  title: string;
  /** Detailed description of the issue found */
  description: string;
  /** Approximate line number(s) affected, if identifiable */
  lineNumbers?: number[];
  /** Concrete recommendation to fix the issue */
  recommendation: string;
  /** Reference link or standard (e.g. OWASP, CIS, etc.) */
  reference?: string;
  /** Suggested code fix — a corrected code snippet the developer can apply directly */
  suggestedFix?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Supported language families for multi-language analysis.
 */
export type LangFamily =
  | "javascript"
  | "typescript"
  | "python"
  | "rust"
  | "csharp"
  | "java"
  | "go"
  | "unknown";

/**
 * Per-rule configuration override.
 */
export interface RuleOverride {
  /** Disable this rule entirely */
  disabled?: boolean;
  /** Override the default severity */
  severity?: Severity;
}

/**
 * Project-level configuration (loaded from .judgesrc or .judgesrc.json).
 */
export interface JudgesConfig {
  /** Rules to suppress entirely */
  disabledRules?: string[];
  /** Per-rule overrides keyed by rule ID or prefix (e.g. "SEC-*" or "SEC-003") */
  ruleOverrides?: Record<string, RuleOverride>;
  /** Judges to skip entirely (by ID) */
  disabledJudges?: string[];
  /** Minimum severity to report — anything below is filtered out */
  minSeverity?: Severity;
  /** Languages to restrict analysis to (empty = all) */
  languages?: string[];
}

// ─── Project / Multi-file Types ──────────────────────────────────────────────

/**
 * A single file in a project submission.
 */
export interface ProjectFile {
  /** Relative file path */
  path: string;
  /** File content */
  content: string;
  /** Programming language */
  language: string;
}

/**
 * Result of analyzing a project (multiple files).
 */
export interface ProjectVerdict extends TribunalVerdict {
  /** Per-file breakdown */
  fileResults: Array<{
    path: string;
    language: string;
    findings: Finding[];
    score: number;
  }>;
  /** Cross-file/architectural findings */
  architecturalFindings: Finding[];
}

// ─── Diff Analysis Types ─────────────────────────────────────────────────────

/**
 * Result of evaluating only changed lines in a diff.
 */
export interface DiffVerdict {
  /** Number of changed lines analyzed */
  linesAnalyzed: number;
  /** Findings that match changed lines */
  findings: Finding[];
  /** Score based only on diff-scoped findings */
  score: number;
  /** Verdict based only on diff-scoped findings */
  verdict: Verdict;
  /** Summary */
  summary: string;
}

// ─── Dependency Analysis Types ───────────────────────────────────────────────

/**
 * A dependency entry parsed from a manifest file.
 */
export interface DependencyEntry {
  /** Package name */
  name: string;
  /** Version or version range */
  version: string;
  /** Whether it's a dev dependency */
  isDev: boolean;
  /** Source manifest file */
  source: string;
}

/**
 * Result of dependency/supply-chain analysis.
 */
export interface DependencyVerdict {
  /** Total dependencies found */
  totalDependencies: number;
  /** Findings about dependency issues */
  findings: Finding[];
  /** Parsed dependency list */
  dependencies: DependencyEntry[];
  /** Score */
  score: number;
  /** Verdict */
  verdict: Verdict;
  /** Summary */
  summary: string;
}

// ─── App Builder Workflow Types ─────────────────────────────────────────────

/**
 * High-level release recommendation for non-technical stakeholders.
 */
export type ReleaseDecision =
  | "ship-now"
  | "ship-with-caution"
  | "do-not-ship";

/**
 * Plain-language translation of a technical finding.
 */
export interface PlainLanguageFinding {
  /** Rule ID from the originating judge */
  ruleId: string;
  /** Original severity */
  severity: Severity;
  /** Human-readable issue title */
  title: string;
  /** What is wrong in plain language */
  whatIsWrong: string;
  /** Why this matters to users/business */
  whyItMatters: string;
  /** Single next action */
  nextAction: string;
}

/**
 * Prioritized remediation task item.
 */
export interface WorkflowTask {
  /** Priority bucket */
  priority: "P0" | "P1" | "P2";
  /** Suggested owner */
  owner: "ai" | "developer" | "product";
  /** Relative effort estimate */
  effort: "S" | "M" | "L";
  /** Rule ID for traceability */
  ruleId: string;
  /** Action-oriented task text */
  task: string;
  /** Acceptance criterion */
  doneWhen: string;
  /** Whether the task is suitable for AI-first implementation */
  aiFixable: boolean;
}

/**
 * End-to-end output for the non-technical app-builder workflow.
 */
export interface AppBuilderWorkflowResult {
  /** Source mode used for analysis */
  mode: "code" | "project" | "diff";
  /** Final tribunal/diff verdict */
  verdict: Verdict;
  /** Score in range 0-100 */
  score: number;
  /** Count of critical findings considered */
  criticalCount: number;
  /** Count of high findings considered */
  highCount: number;
  /** Count of medium findings considered */
  mediumCount: number;
  /** Release recommendation for decision makers */
  releaseDecision: ReleaseDecision;
  /** Concise recommendation summary */
  summary: string;
  /** Top findings translated for non-technical readers */
  plainLanguageFindings: PlainLanguageFinding[];
  /** Prioritized remediation tasks */
  tasks: WorkflowTask[];
  /** AI-fixable tasks at P0/P1 priority */
  aiFixableNow: WorkflowTask[];
}

/**
 * The complete evaluation result from a single judge.
 */
export interface JudgeEvaluation {
  /** The judge's identifier */
  judgeId: string;
  /** The judge's display name */
  judgeName: string;
  /** Overall verdict */
  verdict: Verdict;
  /** Numeric score 0-100 */
  score: number;
  /** Brief summary of the evaluation */
  summary: string;
  /** List of specific findings */
  findings: Finding[];
}

/**
 * The combined result from the full tribunal panel.
 */
export interface TribunalVerdict {
  /** Overall verdict — fails if any judge fails */
  overallVerdict: Verdict;
  /** Average score across all judges */
  overallScore: number;
  /** Executive summary of all evaluations */
  summary: string;
  /** Individual judge evaluations */
  evaluations: JudgeEvaluation[];
  /** Total number of critical/high findings */
  criticalCount: number;
  highCount: number;
  /** Timestamp of evaluation */
  timestamp: string;
}

/**
 * Definition of a judge — their identity, expertise, and evaluation criteria.
 */
export interface JudgeDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** The judge's area of expertise */
  domain: string;
  /** Short description of what this judge evaluates */
  description: string;
  /** The system prompt that defines this judge's persona and evaluation criteria */
  systemPrompt: string;
  /** Rule prefixes this judge uses (e.g. "SEC", "COST") */
  rulePrefix: string;
}
