/**
 * `judges metrics` — Local-only ROI metrics.
 *
 * Computes time-saved, defect-catch, and adoption statistics from
 * local finding lifecycle data and feedback stores. No data leaves
 * the developer's machine.
 *
 * Usage:
 *   judges metrics                   # summary to stdout
 *   judges metrics --format json     # machine-readable
 *   judges metrics --since 30d       # last 30 days
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Severity } from "../types.js";
import type { FindingStore } from "../finding-lifecycle.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoiMetrics {
  /** Period covered by the metrics */
  period: { from: string; to: string };
  /** Finding statistics */
  findings: {
    totalDetected: number;
    totalFixed: number;
    totalOpen: number;
    totalAcceptedRisk: number;
    totalFalsePositive: number;
    fixRate: number;
    bySeverity: Record<string, { detected: number; fixed: number }>;
  };
  /** Auto-fix statistics */
  autoFix: {
    available: number;
    applied: number;
    adoptionRate: number;
  };
  /** Estimated time savings */
  timeSaved: {
    estimatedMinutes: number;
    estimatedHours: number;
    breakdown: {
      category: string;
      count: number;
      minutesPerItem: number;
      totalMinutes: number;
    }[];
  };
  /** Trend over the period */
  trend: {
    direction: "improving" | "stable" | "degrading";
    newFindingsPerRun: number;
    fixedFindingsPerRun: number;
  };
}

// ─── Time Estimates ─────────────────────────────────────────────────────────
// Conservative estimates for manual review time saved per finding category.
// Based on industry averages for manual code review discovery.

const MINUTES_PER_FINDING: Record<Severity, number> = {
  critical: 120, // Critical vulns take ~2 hours to discover manually
  high: 60, // High-severity issues ~1 hour
  medium: 30, // Medium issues ~30 minutes
  low: 15, // Low issues ~15 minutes
  info: 5, // Informational ~5 minutes
};

const MINUTES_PER_AUTOFIX = 20; // Each auto-fix saves ~20 min of manual patching

// ─── Data Loading ───────────────────────────────────────────────────────────

function loadFindingStore(dir: string): FindingStore | undefined {
  const storePath = resolve(dir, ".judges-findings.json");
  if (!existsSync(storePath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf-8"));
    return raw as FindingStore;
  } catch {
    return undefined;
  }
}

interface FeedbackEntry {
  ruleId: string;
  verdict: "true-positive" | "false-positive";
  timestamp: string;
}

function _loadFeedbackEntries(dir: string): FeedbackEntry[] {
  const feedbackPath = resolve(dir, ".judges-feedback.json");
  if (!existsSync(feedbackPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(feedbackPath, "utf-8"));
    return (raw.entries ?? []) as FeedbackEntry[];
  } catch {
    return [];
  }
}

// ─── Metrics Computation ────────────────────────────────────────────────────

function parseSinceDays(since?: string): number | undefined {
  if (!since) return undefined;
  const m = /^(\d+)d$/.exec(since);
  return m ? parseInt(m[1], 10) : undefined;
}

function isWithinPeriod(timestamp: string, cutoff?: Date): boolean {
  if (!cutoff) return true;
  return new Date(timestamp) >= cutoff;
}

export function computeMetrics(dir: string, sinceDays?: number): RoiMetrics {
  const store = loadFindingStore(dir);
  const findings = store?.findings ?? [];

  const now = new Date();
  const cutoff = sinceDays ? new Date(now.getTime() - sinceDays * 86400000) : undefined;

  // Filter by period
  const relevant = cutoff
    ? findings.filter((f) => isWithinPeriod(f.lastSeen, cutoff) || isWithinPeriod(f.firstSeen, cutoff))
    : findings;

  const from =
    cutoff?.toISOString() ??
    (relevant.length > 0
      ? relevant.reduce((a, b) => (a.firstSeen < b.firstSeen ? a : b)).firstSeen
      : now.toISOString());
  const to = now.toISOString();

  // Categorize
  const fixed = relevant.filter((f) => f.status === "fixed");
  const open = relevant.filter((f) => f.status === "open");
  const acceptedRisk = relevant.filter(
    (f) => f.status === "accepted-risk" || f.status === "wont-fix" || f.status === "deferred",
  );
  const falsePositive = relevant.filter((f) => f.status === "false-positive");

  // By severity
  const bySeverity: Record<string, { detected: number; fixed: number }> = {};
  for (const f of relevant) {
    if (!bySeverity[f.severity]) bySeverity[f.severity] = { detected: 0, fixed: 0 };
    bySeverity[f.severity].detected++;
    if (f.status === "fixed") bySeverity[f.severity].fixed++;
  }

  // Auto-fix estimates: findings with fixes available approximate to findings with patches
  // We count findings that were fixed quickly (< 1 day from first seen) as likely auto-fixed
  const quickFixes = fixed.filter((f) => {
    if (!f.fixedAt) return false;
    const openDuration = new Date(f.fixedAt).getTime() - new Date(f.firstSeen).getTime();
    return openDuration < 86400000; // Fixed within 24 hours
  });

  // Time saved breakdown
  const breakdown: RoiMetrics["timeSaved"]["breakdown"] = [];
  for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    const count = bySeverity[sev]?.detected ?? 0;
    if (count > 0) {
      breakdown.push({
        category: `${sev} findings detected`,
        count,
        minutesPerItem: MINUTES_PER_FINDING[sev],
        totalMinutes: count * MINUTES_PER_FINDING[sev],
      });
    }
  }
  if (quickFixes.length > 0) {
    breakdown.push({
      category: "Auto-fixes applied",
      count: quickFixes.length,
      minutesPerItem: MINUTES_PER_AUTOFIX,
      totalMinutes: quickFixes.length * MINUTES_PER_AUTOFIX,
    });
  }

  const totalMinutes = breakdown.reduce((sum, b) => sum + b.totalMinutes, 0);

  // Trend: compare first half vs second half of findings by firstSeen
  const sorted = [...relevant].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  const mid = Math.floor(sorted.length / 2);
  const firstHalfOpen = sorted.slice(0, mid).filter((f) => f.status === "open").length;
  const secondHalfOpen = sorted.slice(mid).filter((f) => f.status === "open").length;
  const trend: RoiMetrics["trend"]["direction"] =
    sorted.length < 4
      ? "stable"
      : secondHalfOpen < firstHalfOpen * 0.8
        ? "improving"
        : secondHalfOpen > firstHalfOpen * 1.2
          ? "degrading"
          : "stable";

  const runCount = store?.runNumber ?? 1;

  return {
    period: { from, to },
    findings: {
      totalDetected: relevant.length,
      totalFixed: fixed.length,
      totalOpen: open.length,
      totalAcceptedRisk: acceptedRisk.length,
      totalFalsePositive: falsePositive.length,
      fixRate: relevant.length > 0 ? fixed.length / relevant.length : 0,
      bySeverity,
    },
    autoFix: {
      available: relevant.length, // All findings potentially have fixes
      applied: quickFixes.length,
      adoptionRate: relevant.length > 0 ? quickFixes.length / relevant.length : 0,
    },
    timeSaved: {
      estimatedMinutes: totalMinutes,
      estimatedHours: Math.round((totalMinutes / 60) * 10) / 10,
      breakdown,
    },
    trend: {
      direction: trend,
      newFindingsPerRun: runCount > 0 ? relevant.length / runCount : 0,
      fixedFindingsPerRun: runCount > 0 ? fixed.length / runCount : 0,
    },
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatMetricsText(m: RoiMetrics): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║              Judges — ROI Metrics (Local Only)              ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `Period: ${m.period.from.slice(0, 10)} → ${m.period.to.slice(0, 10)}`,
    "",
    "── Findings ────────────────────────────────────────────────────",
    `   Detected:       ${m.findings.totalDetected}`,
    `   Fixed:          ${m.findings.totalFixed}`,
    `   Open:           ${m.findings.totalOpen}`,
    `   Accepted risk:  ${m.findings.totalAcceptedRisk}`,
    `   False positive: ${m.findings.totalFalsePositive}`,
    `   Fix rate:       ${(m.findings.fixRate * 100).toFixed(1)}%`,
    "",
  ];

  if (Object.keys(m.findings.bySeverity).length > 0) {
    lines.push("   By severity:");
    for (const [sev, s] of Object.entries(m.findings.bySeverity)) {
      lines.push(`     ${sev.padEnd(10)} ${s.detected} detected, ${s.fixed} fixed`);
    }
    lines.push("");
  }

  lines.push("── Time Saved (estimated) ──────────────────────────────────");
  lines.push(`   Total: ~${m.timeSaved.estimatedHours} hours`);
  for (const b of m.timeSaved.breakdown) {
    lines.push(`     ${b.category}: ${b.count} × ${b.minutesPerItem}min = ${b.totalMinutes}min`);
  }
  lines.push("");

  lines.push("── Trend ───────────────────────────────────────────────────");
  const arrow = m.trend.direction === "improving" ? "↗" : m.trend.direction === "degrading" ? "↘" : "→";
  lines.push(`   Direction:        ${arrow} ${m.trend.direction}`);
  lines.push(`   Findings/run:     ${m.trend.newFindingsPerRun.toFixed(1)}`);
  lines.push(`   Fixed/run:        ${m.trend.fixedFindingsPerRun.toFixed(1)}`);
  lines.push("");

  return lines.join("\n");
}

// ─── CLI Entry ──────────────────────────────────────────────────────────────

export function runMetrics(argv: string[]): void {
  let format = "text";
  let since: string | undefined;
  let dir = ".";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format" && argv[i + 1]) format = argv[++i];
    else if (arg === "--since" && argv[i + 1]) since = argv[++i];
    else if (arg === "--dir" && argv[i + 1]) dir = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`
judges metrics — Local-only ROI metrics

Usage:
  judges metrics                   Summary to stdout
  judges metrics --format json     Machine-readable output
  judges metrics --since 30d       Last 30 days only
  judges metrics --dir ./project   Target project directory

Options:
  --format <fmt>   Output format: text (default), json
  --since <days>   Time window, e.g. 30d, 90d
  --dir <path>     Project directory (default: cwd)
  -h, --help       Show this help
`);
      process.exit(0);
    }
  }

  const sinceDays = parseSinceDays(since);
  const metrics = computeMetrics(resolve(dir), sinceDays);

  if (format === "json") {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log(formatMetricsText(metrics));
  }
}
