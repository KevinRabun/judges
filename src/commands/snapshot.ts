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

// ─── HTML Trend Dashboard ────────────────────────────────────────────────────

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format a trend report as a self-contained HTML dashboard with inline
 * SVG charts, severity breakdown, and dark/light theme support.
 */
export function formatTrendReportHtml(report: TrendReport): string {
  const trendLabel = report.stats.trend;
  const trendIcon =
    trendLabel === "improving" ? "&#x1F4C9;" : trendLabel === "regressing" ? "&#x1F4C8;" : "&#x27A1;&#xFE0F;";
  const trendColor = trendLabel === "improving" ? "#16a34a" : trendLabel === "regressing" ? "#dc2626" : "#ca8a04";

  // Build chart data points
  const points = report.points;
  const maxFindings = Math.max(1, ...points.map((p) => p.totalFindings));
  const chartW = 800;
  const chartH = 300;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  function px(i: number): number {
    return padL + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  }
  function py(val: number): number {
    return padT + plotH - (val / maxFindings) * plotH;
  }

  // SVG polyline for total findings
  const totalLine = points.map((p, i) => `${px(i)},${py(p.totalFindings)}`).join(" ");
  const critLine = points.map((p, i) => `${px(i)},${py(p.critical)}`).join(" ");
  const highLine = points.map((p, i) => `${px(i)},${py(p.high)}`).join(" ");

  // Y-axis labels
  const ySteps = 5;
  const yLabels: string[] = [];
  for (let s = 0; s <= ySteps; s++) {
    const val = Math.round((maxFindings / ySteps) * s);
    const yPos = py(val);
    yLabels.push(
      `<text x="${padL - 8}" y="${yPos + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${val}</text>`,
    );
    yLabels.push(
      `<line x1="${padL}" y1="${yPos}" x2="${chartW - padR}" y2="${yPos}" stroke="var(--border)" stroke-dasharray="4"/>`,
    );
  }

  // X-axis labels (show up to 10 dates)
  const xLabels: string[] = [];
  const step = Math.max(1, Math.floor(points.length / 10));
  for (let i = 0; i < points.length; i += step) {
    const date = points[i].timestamp.slice(0, 10);
    xLabels.push(
      `<text x="${px(i)}" y="${chartH - 5}" text-anchor="middle" fill="var(--muted)" font-size="10">${escHtml(date)}</text>`,
    );
  }

  // Table rows
  const tableRows = points
    .map(
      (p) =>
        `<tr><td>${escHtml(p.timestamp.slice(0, 10))}</td><td>${p.totalFindings}</td><td style="color:#dc2626">${p.critical}</td><td style="color:#ea580c">${p.high}</td><td style="color:#ca8a04">${p.medium}</td><td style="color:#2563eb">${p.low}</td><td>${p.delta >= 0 ? "+" : ""}${p.delta}</td><td>${p.label ? escHtml(p.label) : ""}</td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Judges Panel — Findings Trend Dashboard</title>
<style>
  :root { --bg: #ffffff; --fg: #1a1a1a; --card: #f9fafb; --border: #e5e7eb; --muted: #6b7280; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f172a; --fg: #e2e8f0; --card: #1e293b; --border: #334155; --muted: #94a3b8; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
  .stat-card .label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; }
  .stat-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
  .chart-container { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 2rem; }
  .legend { display: flex; gap: 1.5rem; margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted); }
  .legend span::before { content: ""; display: inline-block; width: 12px; height: 3px; margin-right: 4px; vertical-align: middle; }
  .legend .total::before { background: #2563eb; }
  .legend .crit::before { background: #dc2626; }
  .legend .high::before { background: #ea580c; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
  th { font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: var(--muted); }
</style>
</head>
<body>
<h1>Judges Panel &mdash; Findings Trend Dashboard</h1>

<div class="stats">
  <div class="stat-card"><div class="label">Total Runs</div><div class="value">${report.stats.totalRuns}</div></div>
  <div class="stat-card"><div class="label">Current Findings</div><div class="value">${report.stats.currentTotal}</div></div>
  <div class="stat-card"><div class="label">Overall Delta</div><div class="value" style="color:${trendColor}">${report.stats.overallDelta >= 0 ? "+" : ""}${report.stats.overallDelta}</div></div>
  <div class="stat-card"><div class="label">Average / Run</div><div class="value">${report.stats.averageFindings}</div></div>
  <div class="stat-card"><div class="label">Trend</div><div class="value" style="color:${trendColor}">${trendIcon} ${escHtml(trendLabel)}</div></div>
</div>

<div class="chart-container">
<svg viewBox="0 0 ${chartW} ${chartH}" width="100%" preserveAspectRatio="xMidYMid meet">
  ${yLabels.join("\n  ")}
  ${xLabels.join("\n  ")}
  <polyline points="${totalLine}" fill="none" stroke="#2563eb" stroke-width="2"/>
  <polyline points="${critLine}" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4"/>
  <polyline points="${highLine}" fill="none" stroke="#ea580c" stroke-width="1.5" stroke-dasharray="4"/>
  ${points.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.totalFindings)}" r="3" fill="#2563eb"/>`).join("\n  ")}
</svg>
<div class="legend">
  <span class="total">Total</span>
  <span class="crit">Critical</span>
  <span class="high">High</span>
</div>
</div>

<table>
<thead><tr><th>Date</th><th>Total</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Delta</th><th>Label</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>

<div class="footer">Generated by Judges Panel &mdash; ${escHtml(new Date().toISOString().slice(0, 10))}</div>
</body>
</html>`;
}

// ─── Metrics & Aggregation ──────────────────────────────────────────────────

export interface RuleMetric {
  ruleId: string;
  /** Number of snapshots where this rule appeared */
  occurrences: number;
  /** First seen timestamp */
  firstSeen: string;
  /** Last seen timestamp */
  lastSeen: string;
  /** Whether rule appeared in the most recent snapshot */
  isActive: boolean;
}

export interface MetricsSummary {
  /** Top offender rule IDs ranked by total occurrence count */
  topOffenders: RuleMetric[];
  /** Severity breakdown averaged across all snapshots */
  averageBySeverity: Record<Severity, number>;
  /** Number of distinct rules ever seen */
  distinctRules: number;
  /** Rules that were present early but disappeared (resolved) */
  resolvedRules: string[];
  /** Rules introduced in the most recent snapshot */
  newRules: string[];
}

/**
 * Compute aggregated metrics and top-offender analysis from snapshot history.
 */
export function computeMetrics(store: SnapshotStore): MetricsSummary {
  if (store.snapshots.length === 0) {
    return {
      topOffenders: [],
      averageBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      distinctRules: 0,
      resolvedRules: [],
      newRules: [],
    };
  }

  const sorted = [...store.snapshots].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const ruleMap = new Map<string, RuleMetric>();

  for (const snap of sorted) {
    for (const ruleId of snap.ruleIds) {
      const existing = ruleMap.get(ruleId);
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = snap.timestamp;
      } else {
        ruleMap.set(ruleId, {
          ruleId,
          occurrences: 1,
          firstSeen: snap.timestamp,
          lastSeen: snap.timestamp,
          isActive: false,
        });
      }
    }
  }

  // Mark rules active if present in most recent snapshot
  const lastSnapshot = sorted[sorted.length - 1];
  const lastRuleSet = new Set(lastSnapshot.ruleIds);
  for (const [id, metric] of ruleMap) {
    metric.isActive = lastRuleSet.has(id);
  }

  // Top offenders — sorted by occurrence count desc
  const topOffenders = [...ruleMap.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, 20);

  // Average severity breakdown
  const avgBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const snap of sorted) {
    for (const sev of Object.keys(avgBySeverity) as Severity[]) {
      avgBySeverity[sev] += snap.bySeverity[sev] ?? 0;
    }
  }
  const count = sorted.length;
  for (const sev of Object.keys(avgBySeverity) as Severity[]) {
    avgBySeverity[sev] = Math.round((avgBySeverity[sev] / count) * 10) / 10;
  }

  // Resolved rules: appeared in earlier snapshots but NOT in the last one
  const resolvedRules = [...ruleMap.values()]
    .filter((m) => !m.isActive && m.occurrences > 0)
    .map((m) => m.ruleId)
    .sort();

  // New rules: appeared first in the most recent snapshot
  const newRules = [...ruleMap.values()]
    .filter((m) => m.firstSeen === lastSnapshot.timestamp && m.occurrences === 1)
    .map((m) => m.ruleId)
    .sort();

  return {
    topOffenders,
    averageBySeverity: avgBySeverity,
    distinctRules: ruleMap.size,
    resolvedRules,
    newRules,
  };
}
