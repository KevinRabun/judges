/**
 * `judges auto-calibrate` — Automatic threshold calibration from feedback.
 *
 * Analyzes accumulated feedback data (FP/TP verdicts) and generates
 * optimized calibration profiles. Shows what rules to suppress, downgrade,
 * or boost — and can apply changes automatically to .judgesrc.
 *
 * Usage:
 *   judges auto-calibrate                       # Show calibration report
 *   judges auto-calibrate --apply               # Apply changes to .judgesrc
 *   judges auto-calibrate --json                # JSON output
 *   judges auto-calibrate --min-samples 10      # Require more data before acting
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { loadFeedbackStore } from "./feedback.js";
import { generateAutoTuneReport, formatAutoTuneReport, type AutoTuneReport } from "../auto-tune.js";

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runAutoCalibrate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges auto-calibrate — Auto-tune confidence thresholds from feedback data

Usage:
  judges auto-calibrate                     Show calibration recommendations
  judges auto-calibrate --apply             Apply changes to .judgesrc
  judges auto-calibrate --json              JSON output
  judges auto-calibrate --min-samples <n>   Minimum feedback samples per rule (default: 5)
  judges auto-calibrate --threshold <n>     FP rate threshold for suppression (default: 0.8)

The auto-calibrator analyzes your feedback history (from 'judges feedback submit')
and recommends:
  • Suppress: rules with FP rate ≥ 80% (too noisy)
  • Downgrade: rules with FP rate 50-80% (reduce severity)
  • Boost: rules with FP rate ≤ 20% (increase confidence)
  • Monitor: rules approaching thresholds (watch for trend)

When --apply is used, suppressions and downgrades are written to .judgesrc
as ruleOverrides.
`);
    return;
  }

  const apply = argv.includes("--apply");
  const json = argv.includes("--json");
  const minSamples = parseInt(argv.find((_a, i) => argv[i - 1] === "--min-samples") || "5", 10);
  const threshold = parseFloat(argv.find((_a, i) => argv[i - 1] === "--threshold") || "0.8");

  // Load feedback data
  const store = loadFeedbackStore();

  if (store.entries.length === 0) {
    console.log("\n  No feedback data found. Use 'judges feedback submit' to build history.\n");
    return;
  }

  // Generate auto-tune report
  const report = generateAutoTuneReport(store, {
    suppressionThreshold: threshold,
    minSamples,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Display report
  console.log(formatAutoTuneReport(report));

  // Summary
  const total = report.suppressions.length + report.downgrades.length + report.boosts.length;
  if (total === 0) {
    console.log("  No calibration changes recommended yet. Continue providing feedback.\n");
    return;
  }

  console.log(
    `\n  Recommendations: ${report.suppressions.length} suppress, ${report.downgrades.length} downgrade, ${report.boosts.length} boost`,
  );

  // Apply changes to .judgesrc if requested
  if (apply) {
    applyCalibrationToConfig(report);
  } else {
    console.log("  Run with --apply to write changes to .judgesrc\n");
  }
}

// ─── Apply to Config ────────────────────────────────────────────────────────

function applyCalibrationToConfig(report: AutoTuneReport): void {
  const configPath = existsSync(".judgesrc") ? ".judgesrc" : existsSync(".judgesrc.json") ? ".judgesrc.json" : null;

  let config: Record<string, unknown> = {};
  if (configPath) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      console.error("  Error reading existing config. Creating new .judgesrc.\n");
    }
  }

  // Build ruleOverrides
  const overrides: Record<string, { disabled?: boolean; severity?: string }> =
    (config.ruleOverrides as Record<string, { disabled?: boolean; severity?: string }>) || {};

  // Apply suppressions
  for (const action of report.suppressions) {
    overrides[action.ruleId] = { ...overrides[action.ruleId], disabled: true };
  }

  // Apply downgrades
  for (const action of report.downgrades) {
    if (action.newSeverity) {
      overrides[action.ruleId] = { ...overrides[action.ruleId], severity: action.newSeverity };
    }
  }

  config.ruleOverrides = overrides;

  const outPath = configPath || ".judgesrc";
  writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(
    `\n  ✅ Applied ${report.suppressions.length + report.downgrades.length} calibration change(s) to ${outPath}\n`,
  );
}
