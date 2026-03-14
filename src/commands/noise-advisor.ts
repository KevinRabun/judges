/**
 * Noise advisor — analyze finding feedback history and rule performance
 * to recommend tuning actions (disable rules, adjust severity, etc.).
 *
 * Uses local false-negative and suppression data — no external services.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuleStats {
  ruleId: string;
  totalFindings: number;
  suppressedCount: number;
  falseNegativeCount: number;
  fpRate: number;
  avgConfidence: number;
}

export interface NoiseRecommendation {
  ruleId: string;
  action: "disable" | "raise-threshold" | "lower-severity" | "keep" | "investigate";
  reason: string;
  fpRate: number;
  findingCount: number;
  confidence: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function loadJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

interface FindingEntry {
  ruleId: string;
  severity: string;
  confidence?: number;
  title: string;
}

interface FalseNegEntry {
  category?: string;
  ruleId?: string;
  resolved?: boolean;
}

interface SuppressionEntry {
  rulePrefix?: string;
  ruleIds?: string[];
  active?: boolean;
}

export function analyzeNoise(opts?: {
  resultsPath?: string;
  triagePath?: string;
  fnPath?: string;
  suppressionPath?: string;
}): NoiseRecommendation[] {
  const resultsPath = opts?.resultsPath;
  const fnPath = opts?.fnPath || ".judges-false-negatives.json";
  const suppressionPath = opts?.suppressionPath || ".judges-suppressions.json";

  // Gather findings from results
  const ruleMap = new Map<string, { total: number; confidences: number[]; severities: string[] }>();

  if (resultsPath && existsSync(resultsPath)) {
    const data = JSON.parse(readFileSync(resultsPath, "utf-8"));
    const findings: FindingEntry[] = data.evaluations
      ? data.evaluations.flatMap((e: { findings?: FindingEntry[] }) => e.findings || [])
      : data.findings || [];

    for (const f of findings) {
      const existing = ruleMap.get(f.ruleId) || { total: 0, confidences: [], severities: [] };
      existing.total++;
      if (f.confidence !== undefined) existing.confidences.push(f.confidence);
      existing.severities.push(f.severity);
      ruleMap.set(f.ruleId, existing);
    }
  }

  // Count suppressed findings per rule
  const suppressedByRule = new Map<string, number>();
  const suppressionDb = loadJsonSafe<{ rules?: SuppressionEntry[] }>(suppressionPath);
  if (suppressionDb?.rules) {
    for (const r of suppressionDb.rules) {
      if (!r.active) continue;
      if (r.ruleIds) {
        for (const id of r.ruleIds) {
          suppressedByRule.set(id, (suppressedByRule.get(id) || 0) + 1);
        }
      }
      if (r.rulePrefix) {
        // Count as affecting all matching rules
        for (const ruleId of ruleMap.keys()) {
          if (ruleId.startsWith(r.rulePrefix)) {
            suppressedByRule.set(ruleId, (suppressedByRule.get(ruleId) || 0) + 1);
          }
        }
      }
    }
  }

  // Count false negatives
  const fnByRule = new Map<string, number>();
  const fnDb = loadJsonSafe<{ entries?: FalseNegEntry[] }>(fnPath);
  if (fnDb?.entries) {
    for (const e of fnDb.entries) {
      const key = e.ruleId || e.category || "unknown";
      fnByRule.set(key, (fnByRule.get(key) || 0) + 1);
    }
  }

  // Generate recommendations
  const recommendations: NoiseRecommendation[] = [];

  for (const [ruleId, stats] of ruleMap) {
    const suppressed = suppressedByRule.get(ruleId) || 0;
    const fnCount = fnByRule.get(ruleId) || 0;
    const total = stats.total + suppressed;
    const fpRate = total > 0 ? suppressed / total : 0;
    const avgConf =
      stats.confidences.length > 0 ? stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length : 0.5;

    let action: NoiseRecommendation["action"] = "keep";
    let reason = "Rule performs within acceptable parameters.";

    if (fpRate > 0.6 && total >= 3) {
      action = "disable";
      reason = `${(fpRate * 100).toFixed(0)}% false-positive rate across ${total} findings. Consider disabling.`;
    } else if (fpRate > 0.4 && total >= 3) {
      action = "raise-threshold";
      reason = `${(fpRate * 100).toFixed(0)}% FP rate. Raise confidence threshold to reduce noise.`;
    } else if (avgConf < 0.4 && stats.total >= 3) {
      action = "lower-severity";
      reason = `Average confidence ${(avgConf * 100).toFixed(0)}%. Lower severity or add to review queue.`;
    } else if (fnCount > 0 && suppressed > 0) {
      action = "investigate";
      reason = `Rule has both false negatives (${fnCount}) and suppressions (${suppressed}). Needs calibration review.`;
    }

    recommendations.push({
      ruleId,
      action,
      reason,
      fpRate: Math.round(fpRate * 1000) / 1000,
      findingCount: total,
      confidence: Math.round(avgConf * 1000) / 1000,
    });
  }

  // Sort by actionability (disable first, then raise-threshold, etc.)
  const actionOrder: Record<string, number> = {
    disable: 0,
    "raise-threshold": 1,
    "lower-severity": 2,
    investigate: 3,
    keep: 4,
  };
  recommendations.sort((a, b) => (actionOrder[a.action] ?? 5) - (actionOrder[b.action] ?? 5));

  return recommendations;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runNoiseAdvisor(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges noise-advisor — Analyze rule performance and recommend tuning

Usage:
  judges noise-advisor --input results.json
  judges noise-advisor --input results.json --format json

Analyzes findings, suppressions, and false-negative feedback to recommend:
  - Rules to disable (high FP rate)
  - Rules needing threshold adjustment
  - Rules requiring calibration review

Options:
  --input <path>        Results JSON file
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");

  const recs = analyzeNoise({ resultsPath: inputPath || undefined });

  if (recs.length === 0) {
    console.log("\n  No data to analyze. Run an evaluation first or provide --input.\n");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(recs, null, 2));
    return;
  }

  const actionable = recs.filter((r) => r.action !== "keep");
  const keep = recs.filter((r) => r.action === "keep");

  console.log(
    `\n  Noise Analysis — ${recs.length} rules analyzed, ${actionable.length} need attention\n  ─────────────────`,
  );

  if (actionable.length > 0) {
    console.log("\n  Recommendations:");
    for (const r of actionable) {
      const icon =
        r.action === "disable"
          ? "🔴"
          : r.action === "raise-threshold"
            ? "🟡"
            : r.action === "lower-severity"
              ? "🟠"
              : "🔍";
      console.log(
        `    ${icon} ${r.ruleId.padEnd(15)} ${r.action.padEnd(18)} FP: ${(r.fpRate * 100).toFixed(0)}% (${r.findingCount} total)`,
      );
      console.log(`       ${r.reason}`);
    }
  }

  if (keep.length > 0) {
    console.log(`\n  ${keep.length} rule(s) performing well — no changes needed.`);
  }
  console.log("");
}
