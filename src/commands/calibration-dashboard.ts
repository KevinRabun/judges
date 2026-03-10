// ─── Calibration Dashboard Command ───────────────────────────────────────────
// Displays per-rule and per-judge confidence calibration data from feedback.
//
// Usage:
//   judges calibration-dashboard
//   judges calibration-dashboard --min-samples 5
//   judges calibration-dashboard --format json
// ──────────────────────────────────────────────────────────────────────────────

import { buildCalibrationProfile } from "../calibration.js";
import { loadFeedbackStore } from "./feedback.js";

export async function runCalibrationDashboard(argv: string[]): Promise<void> {
  let minSamples = 3;
  let format = "text";

  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--min-samples" && argv[i + 1]) {
      minSamples = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === "--format" && argv[i + 1]) {
      format = argv[i + 1];
      i++;
    }
  }

  const store = loadFeedbackStore();
  const profile = buildCalibrationProfile(store, { minSamples });

  if (format === "json") {
    const output = {
      name: profile.name,
      isActive: profile.isActive,
      feedbackCount: profile.feedbackCount,
      fpRateByRule: Object.fromEntries(profile.fpRateByRule),
      fpRateByPrefix: Object.fromEntries(profile.fpRateByPrefix),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ── Text output ──
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Judges — Confidence Calibration Dashboard          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Status:    ${profile.isActive ? "✅ Active" : "⚠️  Inactive (not enough feedback)"}`);
  console.log(`  Feedback:  ${profile.feedbackCount} entries (min ${minSamples} samples per rule)`);
  console.log("");

  if (!profile.isActive) {
    console.log("  No calibration data available. Use 'judges feedback' to provide");
    console.log("  true-positive / false-positive feedback on findings.");
    console.log("");
    return;
  }

  // ── Per-Judge (Prefix) FP Rates ──
  if (profile.fpRateByPrefix.size > 0) {
    console.log("  ─── Judge-Level FP Rates ───────────────────────────────────");
    console.log("");
    console.log("  " + "Judge Prefix".padEnd(16) + "FP Rate".padEnd(12) + "Assessment");
    console.log("  " + "─".repeat(48));

    const sortedPrefixes = [...profile.fpRateByPrefix.entries()].sort((a, b) => b[1] - a[1]);
    for (const [prefix, rate] of sortedPrefixes) {
      const pct = `${(rate * 100).toFixed(1)}%`;
      const icon = rate > 0.5 ? "🔴" : rate > 0.2 ? "🟡" : "🟢";
      const assessment = rate > 0.5 ? "Needs tuning" : rate > 0.2 ? "Acceptable" : "Well calibrated";
      console.log(`  ${icon} ${prefix.padEnd(14)} ${pct.padEnd(12)} ${assessment}`);
    }
    console.log("");
  }

  // ── Per-Rule FP Rates ──
  if (profile.fpRateByRule.size > 0) {
    console.log("  ─── Rule-Level FP Rates ────────────────────────────────────");
    console.log("");
    console.log("  " + "Rule ID".padEnd(20) + "FP Rate".padEnd(12) + "Assessment");
    console.log("  " + "─".repeat(52));

    const sortedRules = [...profile.fpRateByRule.entries()].sort((a, b) => b[1] - a[1]);
    for (const [ruleId, rate] of sortedRules) {
      const pct = `${(rate * 100).toFixed(1)}%`;
      const icon = rate > 0.5 ? "🔴" : rate > 0.2 ? "🟡" : "🟢";
      const assessment = rate > 0.5 ? "High FP — suppress or tune" : rate > 0.2 ? "Moderate FP" : "Low FP";
      console.log(`  ${icon} ${ruleId.padEnd(18)} ${pct.padEnd(12)} ${assessment}`);
    }
    console.log("");
  }

  // ── Recommendations ──
  const highFpRules = [...profile.fpRateByRule.entries()].filter(([, r]) => r > 0.5);
  if (highFpRules.length > 0) {
    console.log("  ─── Recommendations ────────────────────────────────────────");
    console.log("");
    console.log("  Rules with >50% FP rate should be reviewed:");
    for (const [ruleId, rate] of highFpRules) {
      console.log(`    • ${ruleId} (${(rate * 100).toFixed(0)}% FP) — consider disabling or adding exceptions`);
    }
    console.log("");
    console.log("  Add to .judgesrc to disable:");
    console.log(`    "disabledRules": [${highFpRules.map(([id]) => `"${id}"`).join(", ")}]`);
    console.log("");
  }
}
