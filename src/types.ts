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
