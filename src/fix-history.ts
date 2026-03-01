/**
 * Learning from Fixes — Track which auto-fix patches are accepted or rejected
 *
 * Records fix application outcomes to improve patch quality over time.
 * Integrates with the feedback system to correlate fix acceptance with
 * finding accuracy.
 *
 * Data stored in .judges-fix-history.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FixOutcome {
  /** Which rule generated the fix */
  ruleId: string;
  /** Whether the fix was applied */
  accepted: boolean;
  /** Whether it was later reverted */
  reverted?: boolean;
  /** File that was fixed */
  filePath?: string;
  /** Timestamp */
  timestamp: string;
  /** Optional reason for rejection */
  reason?: string;
}

export interface FixHistory {
  version: string;
  outcomes: FixOutcome[];
}

export interface FixStats {
  totalFixes: number;
  accepted: number;
  rejected: number;
  reverted: number;
  acceptanceRate: number;
  /** Per-rule acceptance rates */
  byRule: Record<string, { total: number; accepted: number; rate: number }>;
}

// ─── Fix History I/O ─────────────────────────────────────────────────────────

const FIX_HISTORY_FILE = ".judges-fix-history.json";

export function loadFixHistory(dir: string = "."): FixHistory {
  const filePath = resolve(dir, FIX_HISTORY_FILE);
  if (!existsSync(filePath)) {
    return { version: "1.0.0", outcomes: [] };
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return { version: "1.0.0", outcomes: [] };
  }
}

export function saveFixHistory(history: FixHistory, dir: string = "."): void {
  const filePath = resolve(dir, FIX_HISTORY_FILE);
  writeFileSync(filePath, JSON.stringify(history, null, 2) + "\n", "utf-8");
}

// ─── Recording Outcomes ──────────────────────────────────────────────────────

/**
 * Record that a fix was accepted (applied).
 */
export function recordFixAccepted(ruleId: string, filePath?: string, dir?: string): void {
  const history = loadFixHistory(dir);
  history.outcomes.push({
    ruleId,
    accepted: true,
    filePath,
    timestamp: new Date().toISOString(),
  });
  saveFixHistory(history, dir);
}

/**
 * Record that a fix was rejected (skipped).
 */
export function recordFixRejected(ruleId: string, reason?: string, filePath?: string, dir?: string): void {
  const history = loadFixHistory(dir);
  history.outcomes.push({
    ruleId,
    accepted: false,
    reason,
    filePath,
    timestamp: new Date().toISOString(),
  });
  saveFixHistory(history, dir);
}

/**
 * Record that a previously applied fix was reverted.
 */
export function recordFixReverted(ruleId: string, filePath?: string, dir?: string): void {
  const history = loadFixHistory(dir);
  history.outcomes.push({
    ruleId,
    accepted: true,
    reverted: true,
    filePath,
    timestamp: new Date().toISOString(),
  });
  saveFixHistory(history, dir);
}

// ─── Statistics ──────────────────────────────────────────────────────────────

/**
 * Compute fix acceptance statistics from history.
 */
export function computeFixStats(history?: FixHistory, dir?: string): FixStats {
  const h = history || loadFixHistory(dir);

  const accepted = h.outcomes.filter((o) => o.accepted && !o.reverted).length;
  const rejected = h.outcomes.filter((o) => !o.accepted).length;
  const reverted = h.outcomes.filter((o) => o.reverted).length;
  const total = h.outcomes.length;

  // Per-rule stats
  const byRule: FixStats["byRule"] = {};
  for (const outcome of h.outcomes) {
    if (!byRule[outcome.ruleId]) {
      byRule[outcome.ruleId] = { total: 0, accepted: 0, rate: 0 };
    }
    byRule[outcome.ruleId].total++;
    if (outcome.accepted && !outcome.reverted) {
      byRule[outcome.ruleId].accepted++;
    }
  }

  // Compute per-rule rates
  for (const stats of Object.values(byRule)) {
    stats.rate = stats.total > 0 ? stats.accepted / stats.total : 0;
  }

  return {
    totalFixes: total,
    accepted,
    rejected,
    reverted,
    acceptanceRate: total > 0 ? accepted / total : 0,
    byRule,
  };
}

/**
 * Get fix acceptance rate for a specific rule.
 * Returns undefined if no data available for that rule.
 */
export function getFixAcceptanceRate(ruleId: string, dir?: string): number | undefined {
  const stats = computeFixStats(undefined, dir);
  const ruleStats = stats.byRule[ruleId];
  if (!ruleStats || ruleStats.total === 0) return undefined;
  return ruleStats.rate;
}

/**
 * Get rules with low acceptance rates (potential problematic patches).
 */
export function getLowAcceptanceRules(
  threshold: number = 0.5,
  minSamples: number = 3,
  dir?: string,
): Array<{ ruleId: string; rate: number; total: number }> {
  const stats = computeFixStats(undefined, dir);
  return Object.entries(stats.byRule)
    .filter(([, s]) => s.total >= minSamples && s.rate < threshold)
    .map(([ruleId, s]) => ({ ruleId, rate: s.rate, total: s.total }))
    .sort((a, b) => a.rate - b.rate);
}
