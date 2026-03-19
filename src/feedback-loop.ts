/**
 * Fix-Outcome Feedback Loop
 *
 * Closes the feedback loop between fix acceptance/rejection data and
 * the calibration system. When developers accept or reject suggested
 * fixes, that signal feeds back into confidence calibration:
 *
 * - Accepted fixes → "true positive" signal → boost confidence for that rule
 * - Rejected fixes → possible FP signal → reduce confidence for that rule
 * - Reverted fixes → strong FP signal → significantly reduce confidence
 *
 * This module runs periodically (or on-demand) to:
 * 1. Read fix history outcomes
 * 2. Convert them into calibration-compatible feedback entries
 * 3. Update the feedback store so calibration picks them up
 * 4. Compute per-rule confidence adjustments
 * 5. Generate a summary report of the feedback loop's impact
 */

import { loadFixHistory, computeFixStats, type FixStats } from "./fix-history.js";
import { loadFeedbackStore, saveFeedbackStore, type FeedbackEntry } from "./commands/feedback.js";
import { loadCalibrationProfile, type CalibrationProfile, type CalibrationOptions } from "./calibration.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeedbackLoopResult {
  /** Number of fix outcomes processed */
  outcomesProcessed: number;
  /** Number of new feedback entries created */
  feedbackEntriesCreated: number;
  /** Per-rule confidence adjustments recommended */
  adjustments: ConfidenceAdjustment[];
  /** Summary statistics */
  stats: FeedbackLoopStats;
  /** Calibration profile after updates */
  calibrationProfile: CalibrationProfile;
}

export interface ConfidenceAdjustment {
  ruleId: string;
  currentConfidence: number;
  recommendedConfidence: number;
  direction: "boost" | "reduce" | "stable";
  reason: string;
  sampleCount: number;
}

export interface FeedbackLoopStats {
  totalOutcomes: number;
  accepted: number;
  rejected: number;
  reverted: number;
  rulesWithPositiveSignal: number;
  rulesWithNegativeSignal: number;
  netCalibrationImpact: "positive" | "negative" | "neutral";
}

// ─── Feedback Loop Engine ────────────────────────────────────────────────────

/**
 * Process fix history and generate calibration feedback.
 * This is the main entry point for the feedback loop.
 */
export function runFeedbackLoop(options?: {
  fixHistoryDir?: string;
  feedbackDir?: string;
  calibrationOptions?: CalibrationOptions;
  dryRun?: boolean;
}): FeedbackLoopResult {
  const fixHistory = loadFixHistory(options?.fixHistoryDir || ".");
  const feedbackStore = loadFeedbackStore(options?.feedbackDir);
  const fixStats = computeFixStats(fixHistory);

  // Track which outcomes have already been converted to feedback
  const existingFeedbackKeys = new Set(
    feedbackStore.entries
      .filter((e) => e.comment?.startsWith("[fix-outcome]"))
      .map((e) => `${e.ruleId}::${e.timestamp}`),
  );

  // Convert new fix outcomes to feedback entries
  const newEntries: FeedbackEntry[] = [];
  for (const outcome of fixHistory.outcomes) {
    const key = `${outcome.ruleId}::${outcome.timestamp}`;
    if (existingFeedbackKeys.has(key)) continue;

    const verdict = outcomeToVerdict(outcome.accepted, outcome.reverted);
    newEntries.push({
      ruleId: outcome.ruleId,
      verdict,
      timestamp: outcome.timestamp,
      source: "manual",
      comment: `[fix-outcome] ${outcome.reason || (outcome.reverted ? "Fix was reverted" : outcome.accepted ? "Fix accepted" : "Fix rejected")}`,
      filePath: outcome.filePath,
    });
  }

  // Add new entries to feedback store
  if (newEntries.length > 0 && !options?.dryRun) {
    feedbackStore.entries.push(...newEntries);
    saveFeedbackStore(feedbackStore, options?.feedbackDir);
  }

  // Compute confidence adjustments from fix stats
  const adjustments = computeAdjustments(fixStats);

  // Load updated calibration profile
  const calibrationProfile = loadCalibrationProfile(options?.calibrationOptions);

  // Compute summary stats
  const stats = computeLoopStats(fixStats, adjustments);

  return {
    outcomesProcessed: fixHistory.outcomes.length,
    feedbackEntriesCreated: newEntries.length,
    adjustments,
    stats,
    calibrationProfile,
  };
}

/**
 * Generate a markdown report of the feedback loop results.
 */
export function formatFeedbackLoopReport(result: FeedbackLoopResult): string {
  const lines: string[] = [
    "# Fix-Outcome Feedback Loop Report",
    "",
    `**Outcomes Processed**: ${result.outcomesProcessed}`,
    `**New Feedback Entries**: ${result.feedbackEntriesCreated}`,
    `**Net Impact**: ${result.stats.netCalibrationImpact}`,
    "",
    "## Statistics",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total outcomes | ${result.stats.totalOutcomes} |`,
    `| Accepted fixes | ${result.stats.accepted} |`,
    `| Rejected fixes | ${result.stats.rejected} |`,
    `| Reverted fixes | ${result.stats.reverted} |`,
    `| Rules with positive signal | ${result.stats.rulesWithPositiveSignal} |`,
    `| Rules with negative signal | ${result.stats.rulesWithNegativeSignal} |`,
    "",
  ];

  if (result.adjustments.length > 0) {
    lines.push("## Confidence Adjustments");
    lines.push("");
    lines.push("| Rule | Direction | Current | Recommended | Reason | Samples |");
    lines.push("|------|-----------|---------|-------------|--------|---------|");

    for (const adj of result.adjustments) {
      lines.push(
        `| ${adj.ruleId} | ${adj.direction} | ${(adj.currentConfidence * 100).toFixed(0)}% | ${(adj.recommendedConfidence * 100).toFixed(0)}% | ${adj.reason} | ${adj.sampleCount} |`,
      );
    }
  }

  if (result.calibrationProfile.isActive) {
    lines.push("");
    lines.push(`## Calibration Status`);
    lines.push("");
    lines.push(`Calibration is **active** with ${result.calibrationProfile.feedbackCount} feedback entries.`);
  }

  return lines.join("\n");
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function outcomeToVerdict(accepted: boolean, reverted?: boolean): "tp" | "fp" | "wontfix" {
  if (reverted) return "fp";
  return accepted ? "tp" : "fp";
}

function computeAdjustments(stats: FixStats): ConfidenceAdjustment[] {
  const adjustments: ConfidenceAdjustment[] = [];
  const MIN_SAMPLES = 3;

  for (const [ruleId, ruleStats] of Object.entries(stats.byRule)) {
    if (ruleStats.total < MIN_SAMPLES) continue;

    const acceptanceRate = ruleStats.rate;
    const currentConfidence = 0.7; // Default assumption

    if (acceptanceRate >= 0.8) {
      // High acceptance → boost confidence
      const boost = Math.min(0.15, (acceptanceRate - 0.7) * 0.5);
      adjustments.push({
        ruleId,
        currentConfidence,
        recommendedConfidence: Math.min(0.95, currentConfidence + boost),
        direction: "boost",
        reason: `${(acceptanceRate * 100).toFixed(0)}% fix acceptance rate`,
        sampleCount: ruleStats.total,
      });
    } else if (acceptanceRate < 0.4) {
      // Low acceptance → reduce confidence
      const reduction = Math.min(0.3, (0.5 - acceptanceRate) * 0.6);
      adjustments.push({
        ruleId,
        currentConfidence,
        recommendedConfidence: Math.max(0.1, currentConfidence - reduction),
        direction: "reduce",
        reason: `${(acceptanceRate * 100).toFixed(0)}% fix acceptance rate (likely FP-prone)`,
        sampleCount: ruleStats.total,
      });
    }
  }

  // Sort by impact (largest reduction first)
  adjustments.sort((a, b) => {
    const aImpact = Math.abs(a.currentConfidence - a.recommendedConfidence);
    const bImpact = Math.abs(b.currentConfidence - b.recommendedConfidence);
    return bImpact - aImpact;
  });

  return adjustments;
}

function computeLoopStats(fixStats: FixStats, adjustments: ConfidenceAdjustment[]): FeedbackLoopStats {
  const rulesWithPositiveSignal = adjustments.filter((a) => a.direction === "boost").length;
  const rulesWithNegativeSignal = adjustments.filter((a) => a.direction === "reduce").length;

  let netCalibrationImpact: "positive" | "negative" | "neutral";
  if (rulesWithPositiveSignal > rulesWithNegativeSignal) {
    netCalibrationImpact = "positive";
  } else if (rulesWithNegativeSignal > rulesWithPositiveSignal) {
    netCalibrationImpact = "negative";
  } else {
    netCalibrationImpact = "neutral";
  }

  return {
    totalOutcomes: fixStats.totalFixes,
    accepted: fixStats.accepted,
    rejected: fixStats.rejected,
    reverted: fixStats.reverted,
    rulesWithPositiveSignal,
    rulesWithNegativeSignal,
    netCalibrationImpact,
  };
}
