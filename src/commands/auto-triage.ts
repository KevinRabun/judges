/**
 * Confidence auto-triage — automatically suppress findings below
 * a configurable confidence threshold, reducing noise for teams
 * that want higher-signal reviews.
 *
 * Findings below the threshold are marked as "auto-suppressed"
 * rather than removed, preserving auditability.
 */

import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TriageConfig {
  /** Minimum confidence to keep (0-1). Default: 0.7 */
  minConfidence: number;
  /** Per-severity overrides: e.g., { critical: 0.3, high: 0.5 } */
  severityThresholds?: Record<string, number>;
  /** Never suppress these rule IDs */
  alwaysKeep?: string[];
  /** Always suppress these rule IDs */
  alwaysSuppress?: string[];
}

export interface TriageResult {
  kept: Finding[];
  suppressed: Finding[];
  stats: {
    total: number;
    kept: number;
    suppressed: number;
    byReason: Record<string, number>;
  };
}

// ─── Triage Logic ───────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.7;

export function autoTriage(findings: Finding[], config: Partial<TriageConfig> = {}): TriageResult {
  const minConfidence = config.minConfidence ?? DEFAULT_THRESHOLD;
  const severityThresholds = config.severityThresholds || {};
  const alwaysKeep = new Set(config.alwaysKeep || []);
  const alwaysSuppress = new Set(config.alwaysSuppress || []);

  const kept: Finding[] = [];
  const suppressed: Finding[] = [];
  const byReason: Record<string, number> = {};

  for (const f of findings) {
    // Always-keep rules bypass all thresholds
    if (alwaysKeep.has(f.ruleId)) {
      kept.push(f);
      continue;
    }

    // Always-suppress rules
    if (alwaysSuppress.has(f.ruleId)) {
      suppressed.push(f);
      byReason["always-suppress"] = (byReason["always-suppress"] || 0) + 1;
      continue;
    }

    // Determine threshold for this finding
    const threshold = severityThresholds[f.severity] ?? minConfidence;
    const confidence = (f as Finding & { confidence?: number }).confidence ?? 1.0;

    if (confidence < threshold) {
      suppressed.push(f);
      byReason["below-threshold"] = (byReason["below-threshold"] || 0) + 1;
    } else {
      kept.push(f);
    }
  }

  return {
    kept,
    suppressed,
    stats: {
      total: findings.length,
      kept: kept.length,
      suppressed: suppressed.length,
      byReason,
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAutoTriage(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges auto-triage — Automatically suppress low-confidence findings

Usage:
  judges auto-triage --input results.json                  Triage with default threshold (0.7)
  judges auto-triage --input results.json --threshold 0.5  Custom threshold
  judges auto-triage --input results.json --keep SEC-001   Always keep specific rules

Options:
  --input <path>          JSON results file (required)
  --threshold <0-1>       Minimum confidence to keep (default: 0.7)
  --keep <rules>          Comma-separated rules to always keep
  --suppress <rules>      Comma-separated rules to always suppress
  --format json           JSON output
  --help, -h              Show this help

Findings below the confidence threshold are marked as suppressed
rather than removed, preserving audit trail.
`);
    return;
  }

  const { readFileSync, existsSync } = require("fs");

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (!inputPath || !existsSync(inputPath)) {
    console.error("Error: --input <path> required");
    process.exit(1);
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const thresholdStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
  const keepStr = argv.find((_a: string, i: number) => argv[i - 1] === "--keep");
  const suppressStr = argv.find((_a: string, i: number) => argv[i - 1] === "--suppress");

  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const findings: Finding[] = data.evaluations
    ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
    : data.findings || data;

  const config: Partial<TriageConfig> = {};
  if (thresholdStr) config.minConfidence = parseFloat(thresholdStr);
  if (keepStr) config.alwaysKeep = keepStr.split(",").map((s: string) => s.trim());
  if (suppressStr) config.alwaysSuppress = suppressStr.split(",").map((s: string) => s.trim());

  const result = autoTriage(findings, config);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Auto-Triage Results\n`);
  console.log(`  Total:      ${result.stats.total}`);
  console.log(`  Kept:       ${result.stats.kept}`);
  console.log(`  Suppressed: ${result.stats.suppressed}\n`);

  if (Object.keys(result.stats.byReason).length > 0) {
    console.log(`  By reason:`);
    for (const [reason, count] of Object.entries(result.stats.byReason)) {
      console.log(`    ${reason}: ${count}`);
    }
    console.log("");
  }

  if (result.kept.length > 0) {
    console.log(`  Kept findings:`);
    for (const f of result.kept.slice(0, 20)) {
      const conf = (f as Finding & { confidence?: number }).confidence;
      const confStr = conf !== undefined ? ` (${(conf * 100).toFixed(0)}%)` : "";
      console.log(`    ${f.severity.padEnd(8)} ${f.ruleId}: ${f.title.slice(0, 70)}${confStr}`);
    }
    if (result.kept.length > 20) console.log(`    ... and ${result.kept.length - 20} more`);
    console.log("");
  }
}
