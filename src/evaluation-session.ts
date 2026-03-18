/**
 * Evaluation session — persistent context that survives across multiple
 * evaluation calls within the same session (MCP connection, VS Code
 * extension lifetime, or CLI watch mode).
 *
 * Avoids redundant framework detection, capability scanning, and feedback
 * loading. Tracks verdict evolution per file for stability detection.
 */

import type { SessionContext, TribunalVerdict } from "./types.js";
import { contentHash } from "./cache.js";

/**
 * An evaluation session that accumulates project knowledge across calls.
 */
export class EvaluationSession {
  private ctx: SessionContext;

  constructor() {
    this.ctx = {
      frameworks: [],
      capabilities: new Set(),
      verdictHistory: new Map(),
      evaluatedFiles: new Map(),
      startedAt: new Date().toISOString(),
      evaluationCount: 0,
      feedbackTally: new Map(),
    };
  }

  /** Get the current session context (read-only snapshot). */
  getContext(): Readonly<SessionContext> {
    return this.ctx;
  }

  /** Number of evaluations performed. */
  get evaluationCount(): number {
    return this.ctx.evaluationCount;
  }

  /** Record detected frameworks (deduplicated). */
  addFrameworks(frameworks: string[]): void {
    const existing = new Set(this.ctx.frameworks);
    for (const fw of frameworks) {
      if (!existing.has(fw)) {
        this.ctx.frameworks.push(fw);
        existing.add(fw);
      }
    }
  }

  /** Record detected project capabilities (e.g. "rate-limiting", "auth"). */
  addCapabilities(caps: Iterable<string>): void {
    for (const cap of caps) {
      this.ctx.capabilities.add(cap);
    }
  }

  /** Get accumulated capabilities for absence-based finding suppression. */
  getCapabilities(): Set<string> {
    return this.ctx.capabilities;
  }

  /**
   * Record an evaluation result for a file. Tracks verdict history
   * so repeated evaluations can detect stability (converging scores).
   */
  recordEvaluation(filePath: string, code: string, verdict: TribunalVerdict): void {
    this.ctx.evaluationCount++;
    const hash = contentHash(code, filePath);
    this.ctx.evaluatedFiles.set(hash, filePath);

    const history = this.ctx.verdictHistory.get(filePath) ?? [];
    history.push({
      score: verdict.overallScore,
      findingCount: verdict.findings.length,
      timestamp: verdict.timestamp,
    });
    // Keep last 10 evaluations per file
    if (history.length > 10) history.shift();
    this.ctx.verdictHistory.set(filePath, history);
  }

  /**
   * Check if a file's verdict is stable — same score and finding count
   * across the last N evaluations. Returns true if stable (skip re-eval).
   */
  isVerdictStable(filePath: string, minRuns: number = 3): boolean {
    const history = this.ctx.verdictHistory.get(filePath);
    if (!history || history.length < minRuns) return false;

    const recent = history.slice(-minRuns);
    const firstScore = recent[0].score;
    const firstCount = recent[0].findingCount;
    return recent.every((h) => h.score === firstScore && h.findingCount === firstCount);
  }

  /**
   * Check if a file has already been evaluated with the same content.
   */
  hasEvaluated(filePath: string, code: string): boolean {
    const hash = contentHash(code, filePath);
    return this.ctx.evaluatedFiles.has(hash);
  }

  /**
   * Get verdict history for a file — most recent first.
   */
  getVerdictHistory(filePath: string): Array<{ score: number; findingCount: number; timestamp: string }> {
    return [...(this.ctx.verdictHistory.get(filePath) ?? [])].reverse();
  }

  /** Reset the session (clear all accumulated context). */
  reset(): void {
    this.ctx = {
      frameworks: [],
      capabilities: new Set(),
      verdictHistory: new Map(),
      evaluatedFiles: new Map(),
      startedAt: new Date().toISOString(),
      evaluationCount: 0,
      feedbackTally: new Map(),
    };
  }

  /**
   * Record user feedback for a finding rule.
   * tp = true positive, fp = false positive, wontfix = acknowledged but skipped.
   */
  recordFeedback(ruleId: string, verdict: "tp" | "fp" | "wontfix"): void {
    const existing = this.ctx.feedbackTally.get(ruleId) ?? { tp: 0, fp: 0, wontfix: 0 };
    existing[verdict]++;
    this.ctx.feedbackTally.set(ruleId, existing);
  }

  /**
   * Get a confidence penalty for a rule based on accumulated FP feedback.
   * Returns a multiplier in (0, 1] — 1.0 means no penalty, lower means
   * the rule has been flagged as FP frequently and confidence should be reduced.
   *
   * Formula: 1 / (1 + fpCount) — degrades smoothly as FP reports accumulate.
   * A single FP report halves confidence; two reports reduce it to 1/3, etc.
   */
  getConfidencePenalty(ruleId: string): number {
    const tally = this.ctx.feedbackTally.get(ruleId);
    if (!tally || tally.fp === 0) return 1.0;
    return 1 / (1 + tally.fp);
  }

  /** Get the raw feedback tally for all rules. */
  getFeedbackTally(): ReadonlyMap<string, { tp: number; fp: number; wontfix: number }> {
    return this.ctx.feedbackTally;
  }
}

// ─── Singleton for MCP Server / Extension lifetime ──────────────────────────

let _globalSession: EvaluationSession | undefined;

/** Get or create the global evaluation session (shared across MCP calls). */
export function getGlobalSession(): EvaluationSession {
  if (!_globalSession) {
    _globalSession = new EvaluationSession();
  }
  return _globalSession;
}

/** Reset the global session (for testing or explicit reset). */
export function resetGlobalSession(): void {
  _globalSession?.reset();
  _globalSession = undefined;
}
