/**
 * Auto-Tuning Engine
 *
 * Extends the confidence calibration system with:
 *
 * 1. **Time-Decay Weighting** — Recent feedback counts more than old feedback.
 *    A half-life of 30 days means feedback from 30 days ago counts 50%.
 *
 * 2. **Auto-Suppression** — Rules with FP rate ≥ 80% (after sufficient
 *    samples) are automatically suppressed entirely.
 *
 * 3. **Severity Auto-Downgrade** — Rules with moderate FP rates (50–80%)
 *    are downgraded by one severity level (critical→high, high→medium, etc.).
 *
 * 4. **Adaptive Thresholds** — As feedback volume grows, the calibration
 *    system becomes more aggressive (lower minSamples, tighter thresholds).
 *
 * 5. **Tuning Report** — `judges feedback tune` shows recommended actions.
 *
 * Used by the evaluation pipeline when `--calibrate` is enabled, and by the
 * `judges feedback tune` subcommand for interactive tuning guidance.
 */

import type { Finding, Severity } from "./types.js";
import type { FeedbackStore, FeedbackEntry } from "./commands/feedback.js";
import { computeFeedbackStats } from "./commands/feedback.js";
import { buildCalibrationProfile, calibrateFindings } from "./calibration.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoTuneOptions {
  /** FP rate threshold for auto-suppression (default: 0.8 = 80%) */
  suppressionThreshold?: number;
  /** FP rate threshold for severity downgrade (default: 0.5 = 50%) */
  downgradeThreshold?: number;
  /** Half-life in days for time-decay weighting (default: 30) */
  halfLifeDays?: number;
  /** Minimum samples before any auto-tuning applies (default: 5) */
  minSamples?: number;
  /** Enable time-decay weighting (default: true) */
  enableDecay?: boolean;
  /** Maximum number of rules to auto-suppress (safety cap, default: 20) */
  maxSuppressed?: number;
}

export interface AutoTuneAction {
  /** The rule ID affected */
  ruleId: string;
  /** The action recommended */
  action: "suppress" | "downgrade" | "boost" | "monitor";
  /** Human-readable reason */
  reason: string;
  /** FP rate (time-decay weighted if enabled) */
  fpRate: number;
  /** Number of feedback entries for this rule */
  sampleCount: number;
  /** New severity if action is "downgrade" */
  newSeverity?: Severity;
  /** Current (most-common) severity */
  currentSeverity?: Severity;
  /** Confidence adjustment amount (for boost actions) */
  confidenceAdjustment?: number;
}

export interface AutoTuneReport {
  /** Timestamp of the report */
  timestamp: string;
  /** Total feedback entries analyzed */
  totalFeedback: number;
  /** Time-decay enabled */
  decayEnabled: boolean;
  /** Rules recommended for auto-suppression */
  suppressions: AutoTuneAction[];
  /** Rules recommended for severity downgrade */
  downgrades: AutoTuneAction[];
  /** Rules with proven high TP rate (boosted confidence) */
  boosts: AutoTuneAction[];
  /** Rules being monitored (approaching a threshold) */
  monitored: AutoTuneAction[];
  /** Rules auto-suppressed (applied, not just recommended) */
  appliedSuppressions: string[];
  /** Summary statistics */
  summary: {
    totalRulesAnalyzed: number;
    suppressed: number;
    downgraded: number;
    boosted: number;
    monitored: number;
  };
}

export interface DecayWeightedStats {
  ruleId: string;
  /** Time-decay weighted FP rate */
  weightedFpRate: number;
  /** Raw (unweighted) FP rate */
  rawFpRate: number;
  /** Total weighted samples */
  weightedTotal: number;
  /** Raw total */
  rawTotal: number;
  /** Feedback trend direction */
  trend: "improving" | "worsening" | "stable";
  /** Most-common severity seen */
  commonSeverity?: Severity;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SUPPRESSION_THRESHOLD = 0.8;
const DEFAULT_DOWNGRADE_THRESHOLD = 0.5;
const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_MAX_SUPPRESSED = 20;

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

// ─── Time-Decay Weighting ───────────────────────────────────────────────────

/**
 * Compute exponential decay weight for a feedback entry based on its age.
 *
 * weight = 0.5 ^ (ageDays / halfLifeDays)
 *
 * - Entry from today: weight ≈ 1.0
 * - Entry from halfLifeDays ago: weight = 0.5
 * - Entry from 2× halfLifeDays ago: weight = 0.25
 */
export function computeDecayWeight(entryTimestamp: string, now: Date, halfLifeDays: number): number {
  const entryDate = new Date(entryTimestamp);
  const ageDays = (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Compute time-decay weighted FP rates per rule.
 */
export function computeDecayWeightedStats(
  store: FeedbackStore,
  options?: AutoTuneOptions,
): Map<string, DecayWeightedStats> {
  const halfLife = options?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = new Date();

  // Group by rule
  const byRule = new Map<string, FeedbackEntry[]>();
  for (const entry of store.entries) {
    const entries = byRule.get(entry.ruleId) ?? [];
    entries.push(entry);
    byRule.set(entry.ruleId, entries);
  }

  const result = new Map<string, DecayWeightedStats>();

  for (const [ruleId, entries] of byRule) {
    let weightedFp = 0;
    let weightedTotal = 0;
    let rawFp = 0;
    const severityCounts: Record<string, number> = {};

    // Split entries into recent half and older half for trend detection
    const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const midpoint = Math.floor(sorted.length / 2);
    let olderFpRate = 0;
    let recentFpRate = 0;

    if (sorted.length >= 4) {
      const older = sorted.slice(0, midpoint);
      const recent = sorted.slice(midpoint);
      const olderFp = older.filter((e) => e.verdict === "fp").length;
      const recentFp = recent.filter((e) => e.verdict === "fp").length;
      olderFpRate = older.length > 0 ? olderFp / older.length : 0;
      recentFpRate = recent.length > 0 ? recentFp / recent.length : 0;
    }

    for (const entry of entries) {
      const weight = computeDecayWeight(entry.timestamp, now, halfLife);
      weightedTotal += weight;
      if (entry.verdict === "fp") {
        weightedFp += weight;
        rawFp++;
      }
      if (entry.severity) {
        severityCounts[entry.severity] = (severityCounts[entry.severity] ?? 0) + 1;
      }
    }

    const weightedFpRate = weightedTotal > 0 ? weightedFp / weightedTotal : 0;
    const rawFpRate = entries.length > 0 ? rawFp / entries.length : 0;

    // Determine trend
    let trend: "improving" | "worsening" | "stable" = "stable";
    if (sorted.length >= 4) {
      const delta = recentFpRate - olderFpRate;
      if (delta < -0.1) trend = "improving";
      else if (delta > 0.1) trend = "worsening";
    }

    // Find most common severity
    let commonSeverity: Severity | undefined;
    let maxCount = 0;
    for (const [sev, count] of Object.entries(severityCounts)) {
      if (count > maxCount) {
        maxCount = count;
        commonSeverity = sev as Severity;
      }
    }

    result.set(ruleId, {
      ruleId,
      weightedFpRate,
      rawFpRate,
      weightedTotal,
      rawTotal: entries.length,
      trend,
      commonSeverity,
    });
  }

  return result;
}

// ─── Severity Downgrade ─────────────────────────────────────────────────────

/**
 * Downgrade a severity by one level.
 */
export function downgradeSeverity(severity: Severity): Severity {
  const idx = SEVERITY_ORDER.indexOf(severity);
  if (idx < 0 || idx >= SEVERITY_ORDER.length - 1) return severity;
  return SEVERITY_ORDER[idx + 1];
}

// ─── Auto-Tune Engine ───────────────────────────────────────────────────────

/**
 * Generate an auto-tune report from accumulated feedback data.
 *
 * This analyzes the feedback store with time-decay weighting and produces
 * a report of recommended actions: suppressions, downgrades, boosts, and
 * rules to monitor.
 */
export function generateAutoTuneReport(store: FeedbackStore, options?: AutoTuneOptions): AutoTuneReport {
  const suppressionThreshold = options?.suppressionThreshold ?? DEFAULT_SUPPRESSION_THRESHOLD;
  const downgradeThreshold = options?.downgradeThreshold ?? DEFAULT_DOWNGRADE_THRESHOLD;
  const minSamples = options?.minSamples ?? DEFAULT_MIN_SAMPLES;
  const maxSuppressed = options?.maxSuppressed ?? DEFAULT_MAX_SUPPRESSED;
  const enableDecay = options?.enableDecay !== false;

  const suppressions: AutoTuneAction[] = [];
  const downgrades: AutoTuneAction[] = [];
  const boosts: AutoTuneAction[] = [];
  const monitored: AutoTuneAction[] = [];

  // Compute stats (with or without decay)
  const decayStats = enableDecay ? computeDecayWeightedStats(store, options) : null;

  const rawStats = computeFeedbackStats(store);

  for (const [ruleId, ruleStats] of rawStats.perRule) {
    const sampleCount = ruleStats.total;
    if (sampleCount < minSamples) continue;

    // Use decay-weighted rate if available, else raw
    const ds = decayStats?.get(ruleId);
    const effectiveFpRate = ds ? ds.weightedFpRate : ruleStats.fpRate;
    const trend = ds?.trend ?? "stable";
    const commonSeverity = ds?.commonSeverity;

    // Auto-suppress: FP rate ≥ suppressionThreshold
    if (effectiveFpRate >= suppressionThreshold) {
      suppressions.push({
        ruleId,
        action: "suppress",
        reason: `FP rate ${(effectiveFpRate * 100).toFixed(0)}% (≥ ${(suppressionThreshold * 100).toFixed(0)}% threshold) with ${sampleCount} samples${trend === "improving" ? " — trending ↓ improving" : trend === "worsening" ? " — trending ↑ worsening" : ""}`,
        fpRate: effectiveFpRate,
        sampleCount,
        currentSeverity: commonSeverity,
      });
      continue;
    }

    // Auto-downgrade: FP rate ≥ downgradeThreshold
    if (effectiveFpRate >= downgradeThreshold && commonSeverity) {
      const newSev = downgradeSeverity(commonSeverity);
      if (newSev !== commonSeverity) {
        downgrades.push({
          ruleId,
          action: "downgrade",
          reason: `FP rate ${(effectiveFpRate * 100).toFixed(0)}% (≥ ${(downgradeThreshold * 100).toFixed(0)}% threshold) — downgrade ${commonSeverity} → ${newSev}`,
          fpRate: effectiveFpRate,
          sampleCount,
          currentSeverity: commonSeverity,
          newSeverity: newSev,
        });
        continue;
      }
    }

    // Boost: FP rate < 15% with enough data → high confidence rule
    if (effectiveFpRate < 0.15 && sampleCount >= minSamples) {
      const adjustment = 0.15 * ((0.15 - effectiveFpRate) / 0.15);
      boosts.push({
        ruleId,
        action: "boost",
        reason: `FP rate ${(effectiveFpRate * 100).toFixed(0)}% — proven high-TP rule, confidence boosted by +${(adjustment * 100).toFixed(0)}%`,
        fpRate: effectiveFpRate,
        sampleCount,
        currentSeverity: commonSeverity,
        confidenceAdjustment: adjustment,
      });
      continue;
    }

    // Monitor: FP rate between 35–50% (approaching downgrade threshold)
    if (effectiveFpRate >= 0.35 && effectiveFpRate < downgradeThreshold) {
      monitored.push({
        ruleId,
        action: "monitor",
        reason: `FP rate ${(effectiveFpRate * 100).toFixed(0)}% — approaching downgrade threshold${trend === "worsening" ? " ⚠ trending up" : ""}`,
        fpRate: effectiveFpRate,
        sampleCount,
        currentSeverity: commonSeverity,
      });
    }
  }

  // Sort suppressions by FP rate descending and cap
  suppressions.sort((a, b) => b.fpRate - a.fpRate);
  const appliedSuppressions = suppressions.slice(0, maxSuppressed).map((s) => s.ruleId);

  return {
    timestamp: new Date().toISOString(),
    totalFeedback: store.entries.length,
    decayEnabled: enableDecay,
    suppressions,
    downgrades,
    boosts,
    monitored,
    appliedSuppressions,
    summary: {
      totalRulesAnalyzed: rawStats.perRule.size,
      suppressed: suppressions.length,
      downgraded: downgrades.length,
      boosted: boosts.length,
      monitored: monitored.length,
    },
  };
}

// ─── Apply Auto-Tune to Findings ────────────────────────────────────────────

/**
 * Apply auto-tune adjustments to a list of findings:
 *
 * 1. Suppress findings whose rules are auto-suppressed
 * 2. Downgrade severity for rules with moderate FP rates
 * 3. Apply confidence calibration (via existing calibration engine)
 *
 * Returns the filtered and adjusted findings plus suppression count.
 */
export function applyAutoTune(
  findings: Finding[],
  store: FeedbackStore,
  options?: AutoTuneOptions,
): { findings: Finding[]; suppressed: number; downgraded: number; report: AutoTuneReport } {
  const report = generateAutoTuneReport(store, options);
  const suppressedSet = new Set(report.appliedSuppressions);
  const downgradeMap = new Map<string, Severity>();
  for (const d of report.downgrades) {
    if (d.newSeverity) downgradeMap.set(d.ruleId, d.newSeverity);
  }

  let suppressed = 0;
  let downgraded = 0;

  // Step 1: Suppress and downgrade
  let adjusted = findings.filter((f) => {
    if (suppressedSet.has(f.ruleId)) {
      suppressed++;
      return false;
    }
    return true;
  });

  adjusted = adjusted.map((f) => {
    const newSev = downgradeMap.get(f.ruleId);
    if (newSev && f.severity !== newSev) {
      downgraded++;
      return {
        ...f,
        severity: newSev,
        provenance: f.provenance ? `${f.provenance}, auto-tuned-downgrade` : "auto-tuned-downgrade",
      };
    }
    return f;
  });

  // Step 2: Apply confidence calibration
  const profile = buildCalibrationProfile(store);
  if (profile.isActive) {
    adjusted = calibrateFindings(adjusted, profile);
  }

  return { findings: adjusted, suppressed, downgraded, report };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format an auto-tune report as a human-readable string.
 */
export function formatAutoTuneReport(report: AutoTuneReport): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║        Judges Panel — Auto-Tune Report                     ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Feedback entries    : ${report.totalFeedback}`);
  lines.push(`  Rules analyzed      : ${report.summary.totalRulesAnalyzed}`);
  lines.push(`  Time-decay          : ${report.decayEnabled ? "enabled (30-day half-life)" : "disabled"}`);
  lines.push("");

  // Suppressions
  if (report.suppressions.length > 0) {
    lines.push("  🔇 Auto-Suppressed Rules (FP rate ≥ 80%):");
    lines.push("  " + "─".repeat(55));
    for (const s of report.suppressions) {
      const rate = `${(s.fpRate * 100).toFixed(0)}%`.padStart(5);
      lines.push(
        `    ${s.ruleId.padEnd(14)} FP: ${rate}  (${s.sampleCount} samples)  ${s.reason.includes("trending") ? (s.reason.split("—")[1]?.trim() ?? "") : ""}`,
      );
    }
    lines.push("");
  }

  // Downgrades
  if (report.downgrades.length > 0) {
    lines.push("  📉 Severity Downgrades (FP rate 50–80%):");
    lines.push("  " + "─".repeat(55));
    for (const d of report.downgrades) {
      const rate = `${(d.fpRate * 100).toFixed(0)}%`.padStart(5);
      lines.push(`    ${d.ruleId.padEnd(14)} FP: ${rate}  ${d.currentSeverity} → ${d.newSeverity}`);
    }
    lines.push("");
  }

  // Boosts
  if (report.boosts.length > 0) {
    lines.push("  📈 Confidence Boosts (FP rate < 15%):");
    lines.push("  " + "─".repeat(55));
    for (const b of report.boosts) {
      const rate = `${(b.fpRate * 100).toFixed(0)}%`.padStart(5);
      const adj = b.confidenceAdjustment ? `+${(b.confidenceAdjustment * 100).toFixed(0)}%` : "";
      lines.push(`    ${b.ruleId.padEnd(14)} FP: ${rate}  confidence ${adj}  (${b.sampleCount} samples)`);
    }
    lines.push("");
  }

  // Monitored
  if (report.monitored.length > 0) {
    lines.push("  👁️  Monitored Rules (FP rate 35–50%, approaching threshold):");
    lines.push("  " + "─".repeat(55));
    for (const m of report.monitored) {
      const rate = `${(m.fpRate * 100).toFixed(0)}%`.padStart(5);
      const badge = m.reason.includes("trending up") ? " ⚠" : "";
      lines.push(`    ${m.ruleId.padEnd(14)} FP: ${rate}  (${m.sampleCount} samples)${badge}`);
    }
    lines.push("");
  }

  // Summary
  if (
    report.suppressions.length === 0 &&
    report.downgrades.length === 0 &&
    report.boosts.length === 0 &&
    report.monitored.length === 0
  ) {
    lines.push("  ✅ No tuning actions needed — all rules within healthy FP rates.");
    lines.push("");
  }

  // Config suggestion
  if (report.appliedSuppressions.length > 0) {
    lines.push("  📄 Suggested .judgesrc.json additions:");
    lines.push("");
    const cfg = {
      disabledRules: report.appliedSuppressions,
      ruleOverrides: Object.fromEntries(report.downgrades.map((d) => [d.ruleId, { severity: d.newSeverity }])),
    };
    for (const line of JSON.stringify(cfg, null, 2).split("\n")) {
      lines.push(`     ${line}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format auto-tune report as JSON.
 */
export function formatAutoTuneReportJson(report: AutoTuneReport): string {
  return JSON.stringify(
    {
      ...report,
      summary: report.summary,
    },
    null,
    2,
  );
}
