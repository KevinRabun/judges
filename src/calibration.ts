/**
 * Confidence Calibration System
 *
 * Uses historical feedback data (from `judges feedback`) to dynamically
 * adjust finding confidence scores based on observed false-positive rates.
 *
 * When a rule has a known high FP rate from user feedback, its confidence
 * is reduced proportionally. When a rule has a proven high TP rate, its
 * confidence is boosted.
 */

import type { Finding } from "./types.js";
import type { SuppressionRecord } from "./types.js";
import { loadFeedbackStore, type FeedbackStore } from "./commands/feedback.js";
import { triageToFeedbackEntries } from "./finding-lifecycle.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CalibrationProfile {
  /** Name of the calibration profile */
  name: string;
  /** FP rate lookup by rule ID */
  fpRateByRule: Map<string, number>;
  /** FP rate lookup by rule prefix (judge-level) */
  fpRateByPrefix: Map<string, number>;
  /** Whether calibration is active (has enough data) */
  isActive: boolean;
  /** Total feedback entries used for calibration */
  feedbackCount: number;
}

export interface CalibrationOptions {
  /** Path to feedback store file */
  feedbackPath?: string;
  /** Minimum feedback entries for a rule before calibration applies */
  minSamples?: number;
  /** Maximum confidence reduction from calibration (default: 0.3) */
  maxReduction?: number;
  /** Maximum confidence boost from calibration (default: 0.15) */
  maxBoost?: number;
}

// ─── Calibration Engine ─────────────────────────────────────────────────────

const DEFAULT_MIN_SAMPLES = 3;
const DEFAULT_MAX_REDUCTION = 0.3;
const DEFAULT_MAX_BOOST = 0.15;

/**
 * Load a calibration profile from the feedback store.
 */
export function loadCalibrationProfile(options?: CalibrationOptions): CalibrationProfile {
  const store = loadFeedbackStore(options?.feedbackPath);
  return buildCalibrationProfile(store, options);
}

/**
 * Build a calibration profile from a feedback store.
 */
export function buildCalibrationProfile(store: FeedbackStore, options?: CalibrationOptions): CalibrationProfile {
  const minSamples = options?.minSamples ?? DEFAULT_MIN_SAMPLES;
  const fpRateByRule = new Map<string, number>();
  const fpRateByPrefix = new Map<string, number>();

  // Group entries by rule ID
  const byRule = new Map<string, { tp: number; fp: number; total: number }>();
  const byPrefix = new Map<string, { tp: number; fp: number; total: number }>();

  for (const entry of store.entries) {
    // Per-rule aggregation
    const ruleStats = byRule.get(entry.ruleId) || { tp: 0, fp: 0, total: 0 };
    ruleStats.total++;
    if (entry.verdict === "tp") ruleStats.tp++;
    else if (entry.verdict === "fp") ruleStats.fp++;
    byRule.set(entry.ruleId, ruleStats);

    // Per-prefix aggregation
    const prefix = entry.ruleId.split("-")[0];
    if (prefix) {
      const prefixStats = byPrefix.get(prefix) || { tp: 0, fp: 0, total: 0 };
      prefixStats.total++;
      if (entry.verdict === "tp") prefixStats.tp++;
      else if (entry.verdict === "fp") prefixStats.fp++;
      byPrefix.set(prefix, prefixStats);
    }
  }

  // Compute FP rates for rules with enough data
  for (const [ruleId, stats] of byRule) {
    if (stats.total >= minSamples) {
      fpRateByRule.set(ruleId, stats.fp / stats.total);
    }
  }

  for (const [prefix, stats] of byPrefix) {
    if (stats.total >= minSamples) {
      fpRateByPrefix.set(prefix, stats.fp / stats.total);
    }
  }

  return {
    name: "feedback-calibrated",
    fpRateByRule,
    fpRateByPrefix,
    isActive: fpRateByRule.size > 0 || fpRateByPrefix.size > 0,
    feedbackCount: store.entries.length,
  };
}

/**
 * Apply confidence calibration to a list of findings based on
 * historical feedback data.
 *
 * - High FP rate → confidence is reduced
 * - Low FP rate (high TP rate) → confidence is boosted
 * - Neutral (FP rate ~50%) → no change
 *
 * Calibration threshold: FP rate > 0.5 → reduce, FP rate < 0.2 → boost
 */
export function calibrateFindings(
  findings: Finding[],
  profile: CalibrationProfile,
  options?: CalibrationOptions,
): Finding[] {
  if (!profile.isActive) return findings;

  const maxReduction = options?.maxReduction ?? DEFAULT_MAX_REDUCTION;
  const maxBoost = options?.maxBoost ?? DEFAULT_MAX_BOOST;

  return findings.map((f) => {
    const currentConf = f.confidence ?? 0.5;

    // Look up FP rate: prefer rule-specific, fall back to prefix
    const ruleFpRate = profile.fpRateByRule.get(f.ruleId);
    const prefix = f.ruleId.split("-")[0];
    const prefixFpRate = profile.fpRateByPrefix.get(prefix);
    const fpRate = ruleFpRate ?? prefixFpRate;

    if (fpRate === undefined) return f;

    let adjustment = 0;

    if (fpRate > 0.5) {
      // High FP rate: reduce confidence proportionally
      // FP rate 0.5 → 0% reduction, FP rate 1.0 → maxReduction
      adjustment = -maxReduction * ((fpRate - 0.5) / 0.5);
    } else if (fpRate < 0.2) {
      // Low FP rate: boost confidence
      // FP rate 0.2 → 0% boost, FP rate 0.0 → maxBoost
      adjustment = maxBoost * ((0.2 - fpRate) / 0.2);
    }

    if (adjustment === 0) return f;

    const calibratedConf = Math.max(0.05, Math.min(1.0, currentConf + adjustment));
    return {
      ...f,
      confidence: calibratedConf,
      provenance: f.provenance ? `${f.provenance}, confidence-calibrated` : "confidence-calibrated",
    };
  });
}

/**
 * Convenience: load feedback, build profile, and calibrate findings in one call.
 */
export function autoCalibrateFindings(findings: Finding[], options?: CalibrationOptions): Finding[] {
  const profile = loadCalibrationProfile(options);
  return calibrateFindings(findings, profile, options);
}

// ─── Passive Calibration ────────────────────────────────────────────────────

/**
 * Build a calibration profile that passively learns from:
 * 1. Explicit feedback (from `judges feedback`)
 * 2. Inline suppressions (`judges-ignore` directives → implicit FP signal)
 * 3. Triage history (from finding lifecycle store)
 *
 * This allows calibration to improve over time without requiring explicit
 * feedback commands — every suppression directive is a passive signal.
 */
export function buildPassiveCalibrationProfile(
  options?: CalibrationOptions & {
    /** Suppression records from the current evaluation run */
    suppressions?: SuppressionRecord[];
    /** Directory containing .judges-findings.json for triage history */
    findingsDir?: string;
  },
): CalibrationProfile {
  const store = loadFeedbackStore(options?.feedbackPath);

  // Merge in suppression signals as implicit FP entries
  if (options?.suppressions) {
    for (const s of options.suppressions) {
      store.entries.push({
        ruleId: s.ruleId,
        verdict: "fp",
        timestamp: new Date().toISOString(),
        severity: s.severity,
        title: s.title,
        source: "manual",
        comment: `Passive: inline suppression (${s.kind})${s.reason ? ` — ${s.reason}` : ""}`,
      });
    }
  }

  // Merge in triage history signals
  if (options?.findingsDir) {
    const triageEntries = triageToFeedbackEntries(options.findingsDir);
    for (const t of triageEntries) {
      store.entries.push({
        ruleId: t.ruleId,
        verdict: t.verdict,
        timestamp: t.timestamp,
        severity: t.severity,
        source: "manual",
        comment: "Passive: triage history",
      });
    }
  }

  return buildCalibrationProfile(store, options);
}
