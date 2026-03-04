// ─── Finding Snapshot & Trend Tracking ───────────────────────────────────────
// Persist evaluation results per run and compute trends over time.
// Enables teams to track whether code quality is improving or regressing.
//
// Usage (programmatic):
//   const store = loadSnapshotStore(".judges-snapshots.json");
//   recordSnapshot(store, verdict, "main", "abc1234");
//   saveSnapshotStore(store, ".judges-snapshots.json");
//   const trend = computeTrend(store);
//   console.log(formatTrendReport(trend));
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "fs";
import type { Finding, Severity } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FindingSnapshot {
  /** ISO timestamp of the evaluation run */
  timestamp: string;
  /** Optional branch name */
  branch?: string;
  /** Optional commit hash */
  commit?: string;
  /** Total number of findings in this run */
  totalFindings: number;
  /** Breakdown by severity */
  bySeverity: Record<Severity, number>;
  /** Unique rule IDs that appeared */
  ruleIds: string[];
  /** Optional label for identifying the run */
  label?: string;
}

export interface SnapshotStore {
  version: 1;
  snapshots: FindingSnapshot[];
  metadata: {
    createdAt: string;
    lastUpdated: string;
    totalRuns: number;
  };
}

export interface TrendPoint {
  timestamp: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  delta: number;
  label?: string;
}

export interface TrendReport {
  points: TrendPoint[];
  stats: {
    totalRuns: number;
    firstRun: string;
    lastRun: string;
    currentTotal: number;
    previousTotal: number;
    overallDelta: number;
    trend: "improving" | "stable" | "regressing";
    averageFindings: number;
  };
}

// ─── Store Management ───────────────────────────────────────────────────────

/**
 * Create a new empty snapshot store.
 */
export function createSnapshotStore(): SnapshotStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    snapshots: [],
    metadata: {
      createdAt: now,
      lastUpdated: now,
      totalRuns: 0,
    },
  };
}

/**
 * Load a snapshot store from disk. Returns a new store if file doesn't exist.
 */
export function loadSnapshotStore(filePath: string): SnapshotStore {
  if (!existsSync(filePath)) return createSnapshotStore();
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SnapshotStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.snapshots)) {
      return createSnapshotStore();
    }
    return parsed;
  } catch {
    return createSnapshotStore();
  }
}

/**
 * Save a snapshot store to disk.
 */
export function saveSnapshotStore(store: SnapshotStore, filePath: string): void {
  store.metadata.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Recording ──────────────────────────────────────────────────────────────

/**
 * Record a snapshot of findings from an evaluation run.
 *
 * @param store    - The snapshot store to append to
 * @param findings - The findings from this run
 * @param branch   - Optional branch name
 * @param commit   - Optional commit hash
 * @param label    - Optional label for the run
 */
export function recordSnapshot(
  store: SnapshotStore,
  findings: Finding[],
  branch?: string,
  commit?: string,
  label?: string,
): FindingSnapshot {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const ruleIdSet = new Set<string>();

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    ruleIdSet.add(f.ruleId);
  }

  const snapshot: FindingSnapshot = {
    timestamp: new Date().toISOString(),
    branch,
    commit,
    totalFindings: findings.length,
    bySeverity,
    ruleIds: [...ruleIdSet].sort(),
    label,
  };

  store.snapshots.push(snapshot);
  store.metadata.totalRuns = store.snapshots.length;
  store.metadata.lastUpdated = snapshot.timestamp;

  return snapshot;
}

// ─── Trend Analysis ─────────────────────────────────────────────────────────

/**
 * Compute a trend report from snapshot history.
 * Identifies whether findings are improving, stable, or regressing over time.
 */
export function computeTrend(store: SnapshotStore): TrendReport {
  if (store.snapshots.length === 0) {
    const now = new Date().toISOString();
    return {
      points: [],
      stats: {
        totalRuns: 0,
        firstRun: now,
        lastRun: now,
        currentTotal: 0,
        previousTotal: 0,
        overallDelta: 0,
        trend: "stable",
        averageFindings: 0,
      },
    };
  }

  // Sort by timestamp
  const sorted = [...store.snapshots].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const points: TrendPoint[] = [];
  let prevTotal = 0;

  for (const snap of sorted) {
    points.push({
      timestamp: snap.timestamp,
      totalFindings: snap.totalFindings,
      critical: snap.bySeverity.critical ?? 0,
      high: snap.bySeverity.high ?? 0,
      medium: snap.bySeverity.medium ?? 0,
      low: snap.bySeverity.low ?? 0,
      delta: snap.totalFindings - prevTotal,
      label: snap.label,
    });
    prevTotal = snap.totalFindings;
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const overallDelta = last.totalFindings - first.totalFindings;
  const average = sorted.reduce((sum, s) => sum + s.totalFindings, 0) / sorted.length;

  // Determine trend: compare last 3 runs to first 3 runs (or fewer if not enough data)
  let trend: "improving" | "stable" | "regressing" = "stable";
  if (sorted.length >= 2) {
    const recentCount = Math.min(3, Math.floor(sorted.length / 2));
    const recentAvg = sorted.slice(-recentCount).reduce((sum, s) => sum + s.totalFindings, 0) / recentCount;
    const earlyAvg = sorted.slice(0, recentCount).reduce((sum, s) => sum + s.totalFindings, 0) / recentCount;

    if (recentAvg < earlyAvg * 0.9) trend = "improving";
    else if (recentAvg > earlyAvg * 1.1) trend = "regressing";
  }

  return {
    points,
    stats: {
      totalRuns: sorted.length,
      firstRun: first.timestamp,
      lastRun: last.timestamp,
      currentTotal: last.totalFindings,
      previousTotal: sorted.length >= 2 ? sorted[sorted.length - 2].totalFindings : 0,
      overallDelta,
      trend,
      averageFindings: Math.round(average * 10) / 10,
    },
  };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const TREND_ICON: Record<string, string> = {
  improving: "📉",
  stable: "➡️",
  regressing: "📈",
};

/**
 * Format a trend report as human-readable text.
 */
export function formatTrendReport(report: TrendReport): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Findings Trend Report              ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  if (report.points.length === 0) {
    lines.push("  No snapshot data available. Run evaluations to collect trend data.");
    return lines.join("\n");
  }

  lines.push(`  Runs analyzed   : ${report.stats.totalRuns}`);
  lines.push(`  Current total   : ${report.stats.currentTotal} finding(s)`);
  lines.push(`  Overall delta   : ${report.stats.overallDelta >= 0 ? "+" : ""}${report.stats.overallDelta}`);
  lines.push(`  Average         : ${report.stats.averageFindings} findings/run`);
  lines.push(`  Trend           : ${TREND_ICON[report.stats.trend]} ${report.stats.trend}`);
  lines.push("");

  lines.push("  Run History:");
  lines.push("  " + "─".repeat(55));
  for (const point of report.points) {
    const date = point.timestamp.slice(0, 10);
    const delta = point.delta >= 0 ? `+${point.delta}` : `${point.delta}`;
    const label = point.label ? ` [${point.label}]` : "";
    lines.push(`    ${date}  ${String(point.totalFindings).padStart(4)} findings  (${delta})${label}`);
  }
  lines.push("");

  return lines.join("\n");
}
