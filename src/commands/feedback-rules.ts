/**
 * `judges feedback-rules` — Feedback-to-Rule Pipeline
 *
 * Analyzes feedback data and auto-suggests (or auto-writes) suppression rules
 * to `.judgesrc` when feedback reaches consensus (≥N entries mark as FP).
 *
 * Usage:
 *   judges feedback-rules                # analyze and suggest rules
 *   judges feedback-rules --apply        # auto-write suppression rules to .judgesrc
 *   judges feedback-rules --threshold 3  # require 3+ FP verdicts (default: 3)
 *   judges feedback-rules --fp-rate 0.7  # require 70%+ FP rate (default: 0.75)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { loadFeedbackStore, type FeedbackStore, type FeedbackEntry } from "./feedback.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RuleSuggestion {
  ruleId: string;
  action: "disable" | "downgrade-severity";
  fpRate: number;
  fpCount: number;
  totalCount: number;
  reason: string;
  /** Sample FP comments from feedback */
  sampleComments: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

export function analyzeFeedbackForRules(
  store: FeedbackStore,
  options?: { minSamples?: number; fpRateThreshold?: number },
): RuleSuggestion[] {
  const minSamples = options?.minSamples ?? 3;
  const fpThreshold = options?.fpRateThreshold ?? 0.75;

  // Aggregate feedback by rule ID
  const byRule = new Map<string, FeedbackEntry[]>();
  for (const entry of store.entries) {
    const entries = byRule.get(entry.ruleId) ?? [];
    entries.push(entry);
    byRule.set(entry.ruleId, entries);
  }

  const suggestions: RuleSuggestion[] = [];

  for (const [ruleId, entries] of byRule) {
    if (entries.length < minSamples) continue;

    const fpCount = entries.filter((e) => e.verdict === "fp").length;
    const fpRate = fpCount / entries.length;

    if (fpRate >= fpThreshold) {
      // High FP rate — suggest disabling
      const comments = entries
        .filter((e) => e.verdict === "fp" && e.comment)
        .map((e) => e.comment!)
        .slice(0, 3);

      suggestions.push({
        ruleId,
        action: "disable",
        fpRate,
        fpCount,
        totalCount: entries.length,
        reason: `${fpCount}/${entries.length} feedback entries (${Math.round(fpRate * 100)}%) marked as false positive`,
        sampleComments: comments,
      });
    } else if (fpRate >= 0.5) {
      // Moderate FP rate — suggest severity downgrade instead of full disable
      const comments = entries
        .filter((e) => e.verdict === "fp" && e.comment)
        .map((e) => e.comment!)
        .slice(0, 3);

      suggestions.push({
        ruleId,
        action: "downgrade-severity",
        fpRate,
        fpCount,
        totalCount: entries.length,
        reason: `${fpCount}/${entries.length} feedback entries (${Math.round(fpRate * 100)}%) marked as false positive — moderate FP rate suggests downgrade rather than disable`,
        sampleComments: comments,
      });
    }
  }

  // Sort by FP rate descending
  suggestions.sort((a, b) => b.fpRate - a.fpRate);
  return suggestions;
}

// ─── Apply to .judgesrc ────────────────────────────────────────────────────

function applyToConfig(suggestions: RuleSuggestion[], configPath: string): { added: string[]; skipped: string[] } {
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      config = {};
    }
  }

  const disabledRules = new Set<string>((config.disabledRules as string[]) ?? []);
  const added: string[] = [];
  const skipped: string[] = [];

  for (const s of suggestions) {
    if (s.action === "disable") {
      if (disabledRules.has(s.ruleId)) {
        skipped.push(s.ruleId);
      } else {
        disabledRules.add(s.ruleId);
        added.push(s.ruleId);
      }
    }
    // downgrade-severity is informational only — doesn't modify config
  }

  if (added.length > 0) {
    config.disabledRules = [...disabledRules].sort();
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  return { added, skipped };
}

// ─── CLI Command ────────────────────────────────────────────────────────────

export function runFeedbackRules(argv: string[]): void {
  let apply = false;
  let threshold = 3;
  let fpRate = 0.75;
  let feedbackPath: string | undefined;

  for (let i = 3; i < argv.length; i++) {
    switch (argv[i]) {
      case "--apply":
        apply = true;
        break;
      case "--threshold":
        threshold = parseInt(argv[++i], 10) || 3;
        break;
      case "--fp-rate":
        fpRate = parseFloat(argv[++i]) || 0.75;
        break;
      case "--feedback":
        feedbackPath = argv[++i];
        break;
    }
  }

  const store = loadFeedbackStore(feedbackPath);

  if (store.entries.length === 0) {
    console.log("\n  No feedback data found. Submit feedback with `judges feedback add` first.\n");
    return;
  }

  const suggestions = analyzeFeedbackForRules(store, {
    minSamples: threshold,
    fpRateThreshold: fpRate,
  });

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Judges Panel — Feedback→Rule Analysis                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Feedback entries : ${store.entries.length}`);
  console.log(`  Threshold        : ≥${threshold} entries, ≥${Math.round(fpRate * 100)}% FP rate`);
  console.log(`  Suggestions      : ${suggestions.length}`);
  console.log("");

  if (suggestions.length === 0) {
    console.log("  ✅ No rules have reached the FP consensus threshold.\n");
    return;
  }

  console.log("  Suggested Rule Changes:");
  console.log("  " + "─".repeat(58));
  for (const s of suggestions) {
    const icon = s.action === "disable" ? "🚫" : "⬇️ ";
    console.log(
      `  ${icon} ${s.ruleId.padEnd(14)} ${s.action.padEnd(20)} ${Math.round(s.fpRate * 100)}% FP (${s.fpCount}/${s.totalCount})`,
    );
    if (s.sampleComments.length > 0) {
      console.log(`     Comment: "${s.sampleComments[0].slice(0, 60)}"`);
    }
  }
  console.log("");

  if (apply) {
    const configPath = resolve(".", ".judgesrc");
    const result = applyToConfig(suggestions, configPath);
    if (result.added.length > 0) {
      console.log(`  ✅ Added ${result.added.length} rule(s) to .judgesrc disabledRules:`);
      for (const r of result.added) {
        console.log(`     + ${r}`);
      }
    }
    if (result.skipped.length > 0) {
      console.log(`  ⬜ ${result.skipped.length} rule(s) already disabled`);
    }
    console.log("");
  } else {
    console.log("  Run with --apply to write changes to .judgesrc\n");
  }
}
