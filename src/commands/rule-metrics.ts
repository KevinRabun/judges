// ─── Rule Hit Metrics ────────────────────────────────────────────────────────
// Track which rules fire frequently, which never fire, and identify noisy or
// silent rules. Helps teams tune their judge configuration for best signal.
//
// Usage (programmatic):
//   const metrics = computeRuleHitMetrics(findings, judges);
//   console.log(formatRuleHitReport(metrics));
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding } from "../types.js";
import type { JudgeDefinition } from "../evaluators/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RuleHitEntry {
  /** The rule ID, e.g. "SEC-001" */
  ruleId: string;
  /** How many times this rule fired */
  hitCount: number;
  /** Severity distribution */
  bySeverity: Record<string, number>;
  /** Judge ID that owns this rule (if determinable from prefix) */
  judgeId?: string;
}

export interface RuleHitMetrics {
  /** Rules that fired at least once, sorted by hit count descending */
  activeRules: RuleHitEntry[];
  /** Rule prefixes from loaded judges that produced zero findings */
  silentJudges: Array<{ judgeId: string; name: string; rulePrefix: string }>;
  /** Total number of findings analyzed */
  totalFindings: number;
  /** Number of distinct rule IDs that fired */
  uniqueRulesTriggered: number;
  /** Top N noisiest rules */
  noisiest: RuleHitEntry[];
}

// ─── Computation ────────────────────────────────────────────────────────────

/**
 * Map a rule ID back to its owning judge by matching the prefix.
 */
export function findJudgeForRule(ruleId: string, judges: JudgeDefinition[]): JudgeDefinition | undefined {
  // Rule IDs look like "SEC-001", "AUTH-003". The prefix is everything before the dash+digits.
  const prefix = ruleId.replace(/-\d+$/, "");
  return judges.find((j) => j.rulePrefix === prefix);
}

/**
 * Compute metrics about which rules fired and which didn't.
 *
 * @param findings - All findings from one or more evaluation runs
 * @param judges   - The loaded judge definitions (to identify silent judges)
 * @param topN     - How many noisy rules to highlight (default: 5)
 */
export function computeRuleHitMetrics(
  findings: Finding[],
  judges: JudgeDefinition[],
  topN: number = 5,
): RuleHitMetrics {
  // Count hits per rule
  const hitMap = new Map<string, RuleHitEntry>();

  for (const f of findings) {
    let entry = hitMap.get(f.ruleId);
    if (!entry) {
      entry = {
        ruleId: f.ruleId,
        hitCount: 0,
        bySeverity: {},
        judgeId: findJudgeForRule(f.ruleId, judges)?.id,
      };
      hitMap.set(f.ruleId, entry);
    }
    entry.hitCount++;
    entry.bySeverity[f.severity] = (entry.bySeverity[f.severity] ?? 0) + 1;
  }

  // Sort by hit count descending
  const activeRules = [...hitMap.values()].sort((a, b) => b.hitCount - a.hitCount);

  // Identify judges whose prefix never appeared in any finding
  const triggeredPrefixes = new Set<string>();
  for (const ruleId of hitMap.keys()) {
    const prefix = ruleId.replace(/-\d+$/, "");
    triggeredPrefixes.add(prefix);
  }

  const silentJudges = judges
    .filter((j) => !triggeredPrefixes.has(j.rulePrefix))
    .map((j) => ({ judgeId: j.id, name: j.name, rulePrefix: j.rulePrefix }));

  return {
    activeRules,
    silentJudges,
    totalFindings: findings.length,
    uniqueRulesTriggered: hitMap.size,
    noisiest: activeRules.slice(0, topN),
  };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format rule hit metrics as a human-readable report.
 */
export function formatRuleHitReport(metrics: RuleHitMetrics): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Rule Hit Metrics                   ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  if (metrics.totalFindings === 0) {
    lines.push("  No findings to analyze. Run an evaluation first.");
    return lines.join("\n");
  }

  lines.push(`  Total findings      : ${metrics.totalFindings}`);
  lines.push(`  Unique rules fired  : ${metrics.uniqueRulesTriggered}`);
  lines.push(`  Silent judges       : ${metrics.silentJudges.length}`);
  lines.push("");

  // Noisiest rules
  if (metrics.noisiest.length > 0) {
    lines.push("  🔊 Noisiest Rules:");
    lines.push("  " + "─".repeat(50));
    for (const entry of metrics.noisiest) {
      const pct = ((entry.hitCount / metrics.totalFindings) * 100).toFixed(1);
      const judge = entry.judgeId ? ` (${entry.judgeId})` : "";
      lines.push(`    ${entry.ruleId.padEnd(16)} ${String(entry.hitCount).padStart(4)} hits  ${pct}%${judge}`);
    }
    lines.push("");
  }

  // Silent judges
  if (metrics.silentJudges.length > 0) {
    lines.push("  🔇 Silent Judges (zero findings):");
    lines.push("  " + "─".repeat(50));
    for (const j of metrics.silentJudges) {
      lines.push(`    ${j.rulePrefix.padEnd(10)} ${j.name}`);
    }
    lines.push("");
  }

  // Full breakdown
  if (metrics.activeRules.length > 0) {
    lines.push("  📋 All Active Rules:");
    lines.push("  " + "─".repeat(50));
    for (const entry of metrics.activeRules) {
      const sevParts: string[] = [];
      for (const [sev, count] of Object.entries(entry.bySeverity)) {
        sevParts.push(`${sev}:${count}`);
      }
      lines.push(`    ${entry.ruleId.padEnd(16)} ${String(entry.hitCount).padStart(4)} hits  [${sevParts.join(", ")}]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
