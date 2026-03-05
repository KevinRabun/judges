/**
 * Finding Lifecycle Tracking
 *
 * Tracks individual findings across multiple evaluation runs, enabling:
 * - New vs. recurring finding classification
 * - "Fixed" detection when a finding disappears
 * - Finding trend statistics (are things getting better or worse?)
 * - Age tracking (how long has a finding been open?)
 *
 * Data stored in .judges-findings.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Finding, Severity } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrackedFinding {
  /** Stable fingerprint based on ruleId + file + code context */
  fingerprint: string;
  /** Rule that generated this finding */
  ruleId: string;
  /** Finding severity */
  severity: Severity;
  /** File where the finding was detected */
  filePath: string;
  /** Finding title for display */
  title: string;
  /** First seen timestamp */
  firstSeen: string;
  /** Last seen timestamp */
  lastSeen: string;
  /** Number of consecutive runs this finding has appeared */
  runCount: number;
  /** Whether this finding is currently active */
  status: "open" | "fixed";
  /** When the finding was resolved */
  fixedAt?: string;
}

export interface FindingStore {
  version: string;
  lastRunAt: string;
  runNumber: number;
  findings: TrackedFinding[];
}

export interface FindingDelta {
  /** Findings that appeared for the first time in this run */
  introduced: TrackedFinding[];
  /** Findings that are still present from previous runs */
  recurring: TrackedFinding[];
  /** Findings from previous runs that are no longer present */
  fixed: TrackedFinding[];
  /** Summary statistics */
  stats: {
    totalOpen: number;
    totalFixed: number;
    introduced: number;
    recurring: number;
    fixed: number;
    trend: "improving" | "stable" | "degrading";
  };
}

// ─── Fingerprinting ─────────────────────────────────────────────────────────

/**
 * Generate a stable fingerprint for a finding that survives minor code edits.
 * Based on ruleId + file path + approximate code location.
 */
export function generateFindingFingerprint(finding: Finding, filePath: string): string {
  // Use ruleId + file + line range bucket (groups of 5 lines to handle minor shifts)
  const lineBucket = finding.lineNumbers?.[0] ? Math.floor(finding.lineNumbers[0] / 5) * 5 : 0;

  // Simple hash-like string for fast comparison
  const key = `${finding.ruleId}::${filePath}::${lineBucket}::${finding.title.slice(0, 50)}`;
  return key;
}

// ─── Store I/O ───────────────────────────────────────────────────────────────

const FINDINGS_FILE = ".judges-findings.json";

export function loadFindingStore(dir: string = "."): FindingStore {
  const filePath = resolve(dir, FINDINGS_FILE);
  if (!existsSync(filePath)) {
    return {
      version: "1.0.0",
      lastRunAt: new Date().toISOString(),
      runNumber: 0,
      findings: [],
    };
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return {
      version: "1.0.0",
      lastRunAt: new Date().toISOString(),
      runNumber: 0,
      findings: [],
    };
  }
}

export function saveFindingStore(store: FindingStore, dir: string = "."): void {
  const filePath = resolve(dir, FINDINGS_FILE);
  writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

// ─── Lifecycle Operations ────────────────────────────────────────────────────

/**
 * Update the finding store with results from a new evaluation run.
 * Returns a delta describing what changed since the last run.
 *
 * When `dirOrStore` is a string, reads/writes `.judges-findings.json` in that
 * directory.  When a `FindingStore` object is passed directly, operates
 * in-memory (useful for testing) and does NOT persist to disk.
 */
export function updateFindings(
  currentFindings: Array<{ finding: Finding; filePath: string }>,
  dirOrStore: string | FindingStore = ".",
): FindingDelta {
  const inMemory = typeof dirOrStore !== "string";
  const store = inMemory ? dirOrStore : loadFindingStore(dirOrStore);
  const now = new Date().toISOString();
  store.runNumber++;
  store.lastRunAt = now;

  // Build fingerprint → finding map for current run
  const currentMap = new Map<string, { finding: Finding; filePath: string }>();
  for (const entry of currentFindings) {
    const fp = generateFindingFingerprint(entry.finding, entry.filePath);
    currentMap.set(fp, entry);
  }

  // Build fingerprint → tracked finding map for existing store
  const existingMap = new Map<string, TrackedFinding>();
  for (const tracked of store.findings) {
    existingMap.set(tracked.fingerprint, tracked);
  }

  const delta: FindingDelta = {
    introduced: [],
    recurring: [],
    fixed: [],
    stats: {
      totalOpen: 0,
      totalFixed: 0,
      introduced: 0,
      recurring: 0,
      fixed: 0,
      trend: "stable",
    },
  };

  // Process current findings
  for (const [fp, entry] of currentMap) {
    const existing = existingMap.get(fp);

    if (existing) {
      // Recurring — update last seen and run count
      existing.lastSeen = now;
      existing.runCount++;
      existing.status = "open";
      existing.fixedAt = undefined;
      delta.recurring.push(existing);
    } else {
      // New finding
      const tracked: TrackedFinding = {
        fingerprint: fp,
        ruleId: entry.finding.ruleId,
        severity: entry.finding.severity,
        filePath: entry.filePath,
        title: entry.finding.title,
        firstSeen: now,
        lastSeen: now,
        runCount: 1,
        status: "open",
      };
      store.findings.push(tracked);
      delta.introduced.push(tracked);
    }
  }

  // Detect fixed findings (were open, no longer present)
  for (const tracked of store.findings) {
    if (tracked.status === "open" && !currentMap.has(tracked.fingerprint)) {
      tracked.status = "fixed";
      tracked.fixedAt = now;
      delta.fixed.push(tracked);
    }
  }

  // Compute stats
  const openFindings = store.findings.filter((f) => f.status === "open");
  const fixedFindings = store.findings.filter((f) => f.status === "fixed");

  delta.stats.totalOpen = openFindings.length;
  delta.stats.totalFixed = fixedFindings.length;
  delta.stats.introduced = delta.introduced.length;
  delta.stats.recurring = delta.recurring.length;
  delta.stats.fixed = delta.fixed.length;

  // Determine trend
  if (delta.fixed.length > delta.introduced.length) {
    delta.stats.trend = "improving";
  } else if (delta.introduced.length > delta.fixed.length) {
    delta.stats.trend = "degrading";
  } else {
    delta.stats.trend = "stable";
  }

  // Prune very old fixed findings (> 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  store.findings = store.findings.filter((f) => f.status === "open" || (f.fixedAt && f.fixedAt > thirtyDaysAgo));

  if (!inMemory) {
    saveFindingStore(store, dirOrStore as string);
  }
  return delta;
}

/**
 * Get summary statistics from the finding store.
 */
export function getFindingStats(dirOrStore: string | FindingStore = "."): {
  totalOpen: number;
  totalFixed: number;
  oldestOpen: string | undefined;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  avgAge: number;
  runCount: number;
} {
  const store = typeof dirOrStore === "string" ? loadFindingStore(dirOrStore) : dirOrStore;
  const openFindings = store.findings.filter((f) => f.status === "open");
  const fixedFindings = store.findings.filter((f) => f.status === "fixed");

  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  let totalAgeDays = 0;

  for (const f of openFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    const age = (Date.now() - new Date(f.firstSeen).getTime()) / (1000 * 60 * 60 * 24);
    totalAgeDays += age;
  }

  const sortedOpen = [...openFindings].sort(
    (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime(),
  );

  return {
    totalOpen: openFindings.length,
    totalFixed: fixedFindings.length,
    oldestOpen: sortedOpen[0]?.firstSeen,
    bySeverity,
    byRule,
    avgAge: openFindings.length > 0 ? totalAgeDays / openFindings.length : 0,
    runCount: store.runNumber,
  };
}

/**
 * Format finding delta as a human-readable summary for CLI output.
 */
export function formatDelta(delta: FindingDelta): string {
  const trendEmoji = delta.stats.trend === "improving" ? "📈" : delta.stats.trend === "degrading" ? "📉" : "➡️";
  const lines = [
    `  Finding Lifecycle: ${trendEmoji} ${delta.stats.trend}`,
    `  Open: ${delta.stats.totalOpen} | Fixed: ${delta.stats.totalFixed}`,
  ];

  if (delta.stats.introduced > 0) {
    lines.push(`  🆕 New: ${delta.stats.introduced}`);
    for (const f of delta.introduced.slice(0, 5)) {
      lines.push(`     + [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    if (delta.introduced.length > 5) {
      lines.push(`     ... and ${delta.introduced.length - 5} more`);
    }
  }

  if (delta.stats.fixed > 0) {
    lines.push(`  ✅ Fixed: ${delta.stats.fixed}`);
    for (const f of delta.fixed.slice(0, 5)) {
      lines.push(`     - [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    if (delta.fixed.length > 5) {
      lines.push(`     ... and ${delta.fixed.length - 5} more`);
    }
  }

  if (delta.stats.recurring > 0) {
    lines.push(`  🔄 Recurring: ${delta.stats.recurring}`);
  }

  return lines.join("\n");
}
