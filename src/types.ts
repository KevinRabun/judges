import type { CodeStructure } from "./ast/types.js";
import type { TaintFlow } from "./ast/taint-tracker.js";

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
  /** Optional confidence score in range 0-1 indicating analyzer certainty */
  confidence?: number;
  /**
   * Whether this finding is absence-based — it checks for something missing
   * (e.g. "no rate limiting") rather than something present. Absence-based
   * findings are inherently lower confidence in single-file mode because the
   * missing capability may exist in another file.
   */
  isAbsenceBased?: boolean;
  /**
   * Provenance hint describing the evidence basis for this finding.
   * Examples: "regex-pattern-match", "ast-confirmed", "taint-flow",
   * "absence-of-pattern", "requires-project-context".
   */
  provenance?: string;
  /**
   * Machine-applicable patch for auto-fix. When present, tools can apply the
   * change automatically without human interpretation of `suggestedFix`.
   */
  patch?: Patch;
  /**
   * Confidence-based disclosure tier, set by the tribunal pipeline:
   * - "essential"     — confidence ≥ 0.8: always shown
   * - "important"     — confidence ≥ 0.6: shown by default
   * - "supplementary" — confidence < 0.6: shown on demand
   */
  confidenceTier?: "essential" | "important" | "supplementary";
  /**
   * Human-readable explanation of why the confidence score was assigned.
   * Lists the positive and negative evidence signals that contributed to
   * the final score, e.g. "AST-confirmed (+0.15), line-precise (+0.22)".
   */
  evidenceBasis?: string;
  /**
   * Structured evidence chain explaining why this finding matters in context.
   * Each step traces the reasoning from detected pattern to security impact.
   */
  evidenceChain?: EvidenceChain;
  /**
   * When true, this finding has confidence below the escalation threshold
   * and should be routed to a human reviewer rather than auto-actioned.
   */
  needsHumanReview?: boolean;
  /**
   * OWASP LLM Top 10 mapping when the finding relates to AI/LLM-generated code risks.
   * e.g. "LLM01: Prompt Injection", "LLM02: Insecure Output Handling"
   */
  owaspLlmTop10?: string;
}

/**
 * A single link in an evidence chain — one step in the reasoning from
 * detected pattern to security/quality impact.
 */
export interface EvidenceStep {
  /** What was observed (e.g., "User input read from req.body.email") */
  observation: string;
  /** Source of this evidence: pattern match, AST, taint-flow, cross-file, etc. */
  source:
    | "pattern-match"
    | "ast-confirmed"
    | "taint-flow"
    | "cross-file"
    | "framework-knowledge"
    | "absence-of-pattern";
  /** Optional line number where this evidence was observed */
  line?: number;
}

/**
 * Structured evidence chain for a finding — traces the reasoning path
 * from the initial detection signal to the concrete security/quality impact.
 */
export interface EvidenceChain {
  /** Ordered steps from trigger → impact */
  steps: EvidenceStep[];
  /** One-sentence summary of why this matters in this specific codebase */
  impactStatement: string;
}

/**
 * Audit record for a suppressed finding — captures what was suppressed,
 * how (which directive type), and where the suppression comment lives.
 */
export interface SuppressionRecord {
  /** The ruleId that was suppressed (e.g. "SEC-001") */
  ruleId: string;
  /** The severity of the suppressed finding */
  severity: Severity;
  /** The title of the suppressed finding */
  title: string;
  /** Which type of suppression directive matched */
  kind: "line" | "next-line" | "block" | "file";
  /** 1-based line number where the suppression comment appears */
  commentLine: number;
  /** 1-based line number(s) of the suppressed finding */
  findingLines?: number[];
  /** Optional reason provided in the suppression comment */
  reason?: string;
}

/**
 * Result of applying inline suppressions with full audit trail.
 */
export interface SuppressionResult {
  /** Findings that survived suppression */
  findings: Finding[];
  /** Audit trail of all suppressed findings */
  suppressed: SuppressionRecord[];
}

/**
 * A structured, machine-applicable patch describing an exact text replacement
 * within a source file.
 */
export interface Patch {
  /** The original text to replace (exact match) */
  oldText: string;
  /** The corrected replacement text */
  newText: string;
  /** 1-based start line of the region to patch */
  startLine: number;
  /** 1-based end line (inclusive) of the region to patch */
  endLine: number;
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
  | "cpp"
  | "php"
  | "ruby"
  | "kotlin"
  | "swift"
  | "dart"
  | "bash"
  | "sql"
  | "powershell"
  | "terraform"
  | "bicep"
  | "arm"
  | "dockerfile"
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
  /**
   * Inherit from a base configuration. Can be:
   * - A relative or absolute file path to a .judgesrc / .judgesrc.json file
   * - An npm package name exporting a config (resolved via require/import)
   * Multiple values can be specified as an array; they are merged left-to-right
   * with this config applied last (highest priority).
   */
  extends?: string | string[];
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
  /** Glob patterns to exclude files from analysis */
  exclude?: string[];
  /** Glob patterns to include only matching files */
  include?: string[];
  /** Maximum number of files to analyze in directory mode */
  maxFiles?: number;
  /** Named preset to apply as a base (e.g. "strict", "security-only,performance") */
  preset?: string;
  /** Exit with code 1 when verdict is fail — useful for CI pipelines */
  failOnFindings?: boolean;
  /** Path to a baseline JSON file — findings matching the baseline are suppressed */
  baseline?: string;
  /** Default output format */
  format?: "text" | "json" | "sarif" | "markdown" | "html" | "junit" | "codeclimate";
  /** Plugin module specifiers to load custom judges (npm packages or relative paths) */
  plugins?: string[];
  /**
   * Minimum aggregated score (0-10) required for the run to pass.
   * When set, the CLI exits with code 1 if the score is below this threshold.
   * Complements `failOnFindings` with a score-based gate.
   */
  failOnScoreBelow?: number;
  /**
   * Weighted importance of each judge (by ID) when computing the aggregated score.
   * Judges not listed receive a default weight of 1.0.
   * Example: `{ "cybersecurity": 2.0, "documentation": 0.5 }`
   */
  judgeWeights?: Record<string, number>;
  /**
   * Path- or language-scoped config overrides. Each entry uses a glob pattern
   * (matched against the file path) and applies partial config on top of the
   * base config for matching files.
   *
   * Example:
   * ```json
   * { "overrides": [
   *   { "files": "src/legacy/**", "minSeverity": "high" },
   *   { "files": "**\/*.test.ts", "disabledJudges": ["documentation"] }
   * ]}
   * ```
   */
  overrides?: Array<{ files: string } & Partial<Omit<JudgesConfig, "overrides">>>;
  /**
   * Per-language evaluation profiles. Maps language families to partial config
   * overrides that are applied when evaluating files of that language.
   * This allows auto-disabling judges/rules that are irrelevant for certain
   * languages (e.g., disabling `documentation` for SQL, or `performance`
   * for config files).
   *
   * Example:
   * ```json
   * { "languageProfiles": {
   *   "python": { "disabledJudges": ["memory-safety"] },
   *   "sql":    { "disabledJudges": ["documentation", "testing"] }
   * }}
   * ```
   */
  languageProfiles?: Partial<Record<LangFamily, Partial<Omit<JudgesConfig, "languageProfiles" | "overrides">>>>;
  /**
   * Confidence threshold (0–1) below which findings are flagged for human review.
   * Findings with confidence below this value will have `needsHumanReview: true`.
   * Default: not set (no escalation tagging).
   */
  escalationThreshold?: number;
  /**
   * User-defined pattern-based rules for business logic validation.
   * Each entry defines a regex pattern to match, a rule ID, severity,
   * and descriptive text. These are evaluated alongside built-in judges.
   *
   * Example:
   * ```json
   * { "customRules": [
   *   { "id": "BIZ-001", "pattern": "price\\s*=\\s*0", "severity": "high",
   *     "title": "Zero-price assignment", "description": "Setting price to 0 may indicate a logic error" }
   * ]}
   * ```
   */
  customRules?: CustomRule[];
}

/**
 * A user-defined pattern-based rule for business logic validation.
 */
export interface CustomRule {
  /** Rule ID (e.g. "BIZ-001") */
  id: string;
  /** Regex pattern to match against source code */
  pattern: string;
  /** Severity level */
  severity: Severity;
  /** Short title for the finding */
  title: string;
  /** Description of why this pattern is flagged */
  description: string;
  /** Optional recommendation for fixing */
  recommendation?: string;
  /** Optional file glob; when set, rule only applies to matching file paths */
  files?: string;
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
export type ReleaseDecision = "ship-now" | "ship-with-caution" | "do-not-ship";

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

// ─── V2 Evaluation Types ────────────────────────────────────────────────────

/**
 * Policy profile for domain-specific governance overlays.
 */
export type PolicyProfile = "default" | "startup" | "regulated" | "healthcare" | "fintech" | "public-sector";

/**
 * Optional context used to improve semantic relevance of judge feedback.
 */
export interface EvaluationContextV2 {
  /** Short architecture summary or ADR excerpt */
  architectureNotes?: string;
  /** Business-critical constraints (SLO, latency budget, regulatory scope) */
  constraints?: string[];
  /** Team standards or coding conventions */
  standards?: string[];
  /** Known risks/incidents relevant to this review */
  knownRisks?: string[];
  /** Optional tenancy or data-boundary model notes */
  dataBoundaryModel?: string;
}

/**
 * Runtime and operational evidence used to calibrate findings.
 */
export interface EvidenceBundleV2 {
  /** Unit/integration/e2e summary (human-readable) */
  testSummary?: string;
  /** Line coverage percentage */
  coveragePercent?: number;
  /** p95 request latency in ms */
  p95LatencyMs?: number;
  /** Error rate over recent observation window */
  errorRatePercent?: number;
  /** Number of known dependency vulnerabilities */
  dependencyVulnerabilityCount?: number;
  /** Deployment target/runtime notes */
  deploymentNotes?: string;
}

/**
 * Enriched finding with confidence and specialization metadata.
 */
export interface SpecializedFindingV2 extends Finding {
  /** Judge specialty area for this rule */
  specialtyArea: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Primary evidence basis (array form for V2) */
  evidenceBasisList: string[];
}

/**
 * Aggregated specialty feedback block.
 */
export interface SpecialtyFeedbackV2 {
  /** Judge ID */
  judgeId: string;
  /** Judge display name */
  judgeName: string;
  /** Specialty domain */
  domain: string;
  /** Findings for this specialty */
  findings: SpecializedFindingV2[];
  /** Specialty confidence score 0.0-1.0 */
  confidence: number;
}

/**
 * Uncertainty report for transparency and escalation.
 */
export interface UncertaintyReportV2 {
  /** Assumptions made during evaluation */
  assumptions: string[];
  /** Missing artifacts that would improve confidence */
  missingEvidence: string[];
  /** Recommendations to reduce uncertainty */
  escalationRecommendations: string[];
}

/**
 * V2 tribunal output with context/evidence-aware calibration.
 */
export interface TribunalVerdictV2 {
  /** Policy profile used for this run */
  policyProfile: PolicyProfile;
  /** Base tribunal verdict from pattern/AST engine */
  baseVerdict: TribunalVerdict;
  /** Final calibrated verdict */
  calibratedVerdict: Verdict;
  /** Final calibrated score */
  calibratedScore: number;
  /** Aggregated enriched findings */
  findings: SpecializedFindingV2[];
  /** Per-specialty feedback */
  specialtyFeedback: SpecialtyFeedbackV2[];
  /** Confidence summary score 0.0-1.0 */
  confidence: number;
  /** Uncertainty and missing evidence report */
  uncertainty: UncertaintyReportV2;
  /** Evaluation summary */
  summary: string;
  /** Timestamp */
  timestamp: string;
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
  /** Audit trail of findings suppressed by inline comments for this judge */
  suppressions?: SuppressionRecord[];
  /** Execution time for this judge in milliseconds */
  durationMs?: number;
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
  /** Deduplicated cross-evaluator findings (same issue on same line merged) */
  findings: Finding[];
  /** Total number of critical/high findings (after cross-evaluator dedup) */
  criticalCount: number;
  highCount: number;
  /** Timestamp of evaluation */
  timestamp: string;
  /** Optional high-confidence must-fix gate outcome */
  mustFixGate?: MustFixGateResult;
  /** Audit trail of inline-suppressed findings (present when suppressions exist) */
  suppressions?: SuppressionRecord[];
  /** Per-judge timing metrics (present when timing is recorded) */
  timing?: {
    totalMs: number;
    perJudge: Array<{ judgeId: string; judgeName: string; durationMs: number }>;
  };
}

/**
 * Must-fix gate configuration for high-risk findings.
 */
export interface MustFixGateOptions {
  /** Enable must-fix evaluation and verdict override */
  enabled?: boolean;
  /** Minimum confidence required for a finding to trigger the gate (0-1) */
  minConfidence?: number;
  /** Rule prefixes considered dangerous for must-fix gating (e.g. AUTH-, CYBER-) */
  dangerousRulePrefixes?: string[];
}

/**
 * Outcome of running the must-fix gate.
 */
export interface MustFixGateResult {
  enabled: boolean;
  triggered: boolean;
  minConfidence: number;
  matchedCount: number;
  matchedRuleIds: string[];
  summary: string;
}

// ─── Project Context ─────────────────────────────────────────────────────────

/**
 * Inferred project-level context injected into L2 prompts so the LLM
 * understands the runtime, framework, and architectural role of the file.
 */
export interface ProjectContext {
  /** Detected framework(s), e.g. ["express", "helmet"] */
  frameworks: string[];
  /** Framework version hints found in code or manifests */
  frameworkVersions: string[];
  /** Architectural role of the file, e.g. "api-controller", "middleware", "cli" */
  entryPointType: string;
  /** Runtime environment hint, e.g. "node", "browser", "serverless", "container" */
  runtime: string;
  /** Key dependencies detected from imports/requires */
  dependencies: string[];
  /** Project type hint, e.g. "web-api", "cli-tool", "library", "full-stack" */
  projectType: string;
}

/**
 * Definition of a judge — their identity, expertise, and evaluation criteria.
 */
/**
 * Optional context passed to judge analyze functions. Provides pre-computed
 * AST structure and taint flows so evaluators can make scope-aware, import-
 * aware, and data-flow-aware decisions without re-parsing.
 */
export interface AnalyzeContext {
  /** Pre-computed AST structure (functions, imports, classes, decorators, etc.) */
  ast?: CodeStructure;
  /** Pre-computed taint flows (source → sink data-flow chains) */
  taintFlows?: TaintFlow[];
}

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
  /** Rule prefixes this judge uses (e.g. "SEC", "CYBER") */
  rulePrefix: string;
  /** Short focus-area keywords for documentation tables (e.g. "Encryption, PII handling, secrets management") */
  tableDescription: string;
  /** Human-readable prompt description for documentation (e.g. "Deep data security review") */
  promptDescription: string;
  /**
   * The analyzer function for this judge. Each judge carries its own analysis
   * logic, eliminating the need for a central dispatch switch. Wired up
   * automatically in the judge registry (judges/index.ts).
   *
   * The optional third parameter provides pre-computed AST data (structure,
   * taint flows) so evaluators can make scope-aware decisions without re-parsing.
   */
  analyze?: (code: string, language: string, context?: AnalyzeContext) => Finding[];
}
