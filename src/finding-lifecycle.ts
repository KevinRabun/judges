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
  /**
   * Finding status:
   * - "open"          — actively flagged, not yet addressed
   * - "fixed"         — finding no longer detected in code
   * - "accepted-risk" — acknowledged but intentionally retained
   * - "deferred"      — will be addressed later
   * - "wont-fix"      — team decided not to address
   * - "false-positive" — confirmed FP (feeds back into calibration)
   */
  status: "open" | "fixed" | "accepted-risk" | "deferred" | "wont-fix" | "false-positive";
  /** When the finding was resolved */
  fixedAt?: string;
  /** When the finding was triaged (for non-open/fixed states) */
  triagedAt?: string;
  /** Who triaged this finding */
  triagedBy?: string;
  /** Reason for the triage decision */
  triageReason?: string;
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
  // Triaged findings (accepted-risk, deferred, wont-fix, false-positive) are
  // NOT auto-marked as fixed — their triage decision is preserved.
  const triageStatuses = new Set(["accepted-risk", "deferred", "wont-fix", "false-positive"]);
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
  const triageStatusSet = new Set(["accepted-risk", "deferred", "wont-fix", "false-positive"]);
  store.findings = store.findings.filter(
    (f) => f.status === "open" || triageStatusSet.has(f.status) || (f.fixedAt && f.fixedAt > thirtyDaysAgo),
  );

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
  totalTriaged: number;
  byTriageStatus: Record<string, number>;
  oldestOpen: string | undefined;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  avgAge: number;
  runCount: number;
} {
  const store = typeof dirOrStore === "string" ? loadFindingStore(dirOrStore) : dirOrStore;
  const openFindings = store.findings.filter((f) => f.status === "open");
  const fixedFindings = store.findings.filter((f) => f.status === "fixed");
  const triageStatuses = new Set(["accepted-risk", "deferred", "wont-fix", "false-positive"]);
  const triagedFindings = store.findings.filter((f) => triageStatuses.has(f.status));

  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const byTriageStatus: Record<string, number> = {};
  let totalAgeDays = 0;

  for (const f of openFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    const age = (Date.now() - new Date(f.firstSeen).getTime()) / (1000 * 60 * 60 * 24);
    totalAgeDays += age;
  }

  for (const f of triagedFindings) {
    byTriageStatus[f.status] = (byTriageStatus[f.status] || 0) + 1;
  }

  const sortedOpen = [...openFindings].sort(
    (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime(),
  );

  return {
    totalOpen: openFindings.length,
    totalFixed: fixedFindings.length,
    totalTriaged: triagedFindings.length,
    byTriageStatus,
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

// ─── Triage Operations ──────────────────────────────────────────────────────

export type TriageStatus = "accepted-risk" | "deferred" | "wont-fix" | "false-positive";

/**
 * Triage a finding by its fingerprint or ruleId+filePath.
 * Returns the triaged finding, or null if not found.
 */
export function triageFinding(
  dirOrStore: string | FindingStore,
  match: { fingerprint?: string; ruleId?: string; filePath?: string },
  status: TriageStatus,
  reason?: string,
  triagedBy?: string,
): TrackedFinding | null {
  const inMemory = typeof dirOrStore !== "string";
  const store = inMemory ? dirOrStore : loadFindingStore(dirOrStore);
  const now = new Date().toISOString();

  let target: TrackedFinding | undefined;

  if (match.fingerprint) {
    target = store.findings.find((f) => f.fingerprint === match.fingerprint && f.status === "open");
  } else if (match.ruleId) {
    target = store.findings.find(
      (f) => f.ruleId === match.ruleId && f.status === "open" && (!match.filePath || f.filePath === match.filePath),
    );
  }

  if (!target) return null;

  target.status = status;
  target.triagedAt = now;
  target.triagedBy = triagedBy;
  target.triageReason = reason;

  if (!inMemory) {
    saveFindingStore(store, dirOrStore as string);
  }

  return target;
}

/**
 * List all findings with a specific triage status.
 */
export function getTriagedFindings(dirOrStore: string | FindingStore, status?: TriageStatus): TrackedFinding[] {
  const store = typeof dirOrStore === "string" ? loadFindingStore(dirOrStore) : dirOrStore;
  const triageStatuses = new Set<string>(["accepted-risk", "deferred", "wont-fix", "false-positive"]);

  return store.findings.filter((f) => (status ? f.status === status : triageStatuses.has(f.status)));
}

/**
 * Format triaged findings as a human-readable summary.
 */
export function formatTriageSummary(dirOrStore: string | FindingStore): string {
  const store = typeof dirOrStore === "string" ? loadFindingStore(dirOrStore) : dirOrStore;
  const triageStatuses = new Set<string>(["accepted-risk", "deferred", "wont-fix", "false-positive"]);
  const triaged = store.findings.filter((f) => triageStatuses.has(f.status));

  if (triaged.length === 0) {
    return "  No triaged findings.";
  }

  const lines: string[] = [`  Triaged Findings: ${triaged.length}`, ""];

  const grouped = new Map<string, TrackedFinding[]>();
  for (const f of triaged) {
    const list = grouped.get(f.status) || [];
    list.push(f);
    grouped.set(f.status, list);
  }

  const statusLabels: Record<string, string> = {
    "accepted-risk": "⚠️  Accepted Risk",
    deferred: "⏳ Deferred",
    "wont-fix": "🚫 Won't Fix",
    "false-positive": "❌ False Positive",
  };

  for (const [status, findings] of grouped) {
    lines.push(`  ${statusLabels[status] || status} (${findings.length}):`);
    for (const f of findings.slice(0, 10)) {
      lines.push(`    [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
      if (f.triageReason) {
        lines.push(`      Reason: ${f.triageReason}`);
      }
    }
    if (findings.length > 10) {
      lines.push(`    ... and ${findings.length - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Triage → Auto-Tune Bridge ──────────────────────────────────────────────

/**
 * Convert triage decisions from the finding store into feedback entries
 * suitable for auto-tune. This bridges lifecycle triage (users marking
 * findings as false-positive, wont-fix, etc.) into the calibration loop.
 *
 * - false-positive → verdict "fp"
 * - wont-fix → verdict "fp" (not useful enough to keep)
 * - accepted-risk → verdict "tp" (real finding, intentionally accepted)
 * - deferred → verdict "tp" (real finding, just not fixing now)
 */
export function triageToFeedbackEntries(
  dirOrStore: string | FindingStore,
): Array<{ ruleId: string; verdict: "tp" | "fp"; severity: Severity; timestamp: string }> {
  const store = typeof dirOrStore === "string" ? loadFindingStore(dirOrStore) : dirOrStore;
  const entries: Array<{ ruleId: string; verdict: "tp" | "fp"; severity: Severity; timestamp: string }> = [];

  for (const f of store.findings) {
    if (f.status === "false-positive" || f.status === "wont-fix") {
      entries.push({
        ruleId: f.ruleId,
        verdict: "fp",
        severity: f.severity,
        timestamp: f.triagedAt || f.lastSeen,
      });
    } else if (f.status === "accepted-risk" || f.status === "deferred") {
      entries.push({
        ruleId: f.ruleId,
        verdict: "tp",
        severity: f.severity,
        timestamp: f.triagedAt || f.lastSeen,
      });
    }
  }

  return entries;
}

/**
 * Get the set of rule IDs that should be auto-suppressed based on
 * accumulated triage history. Uses a simple threshold: if ≥ `threshold`
 * fraction of triaged findings for a rule are FP/wont-fix, suppress it.
 */
export function getTriageBasedSuppressions(
  dirOrStore: string | FindingStore,
  options: { threshold?: number; minSamples?: number } = {},
): Set<string> {
  const threshold = options.threshold ?? 0.8;
  const minSamples = options.minSamples ?? 3;
  const entries = triageToFeedbackEntries(dirOrStore);

  const byRule = new Map<string, { fp: number; total: number }>();
  for (const e of entries) {
    const stats = byRule.get(e.ruleId) ?? { fp: 0, total: 0 };
    stats.total++;
    if (e.verdict === "fp") stats.fp++;
    byRule.set(e.ruleId, stats);
  }

  const suppressed = new Set<string>();
  for (const [ruleId, stats] of byRule) {
    if (stats.total >= minSamples && stats.fp / stats.total >= threshold) {
      suppressed.add(ruleId);
    }
  }

  return suppressed;
}
