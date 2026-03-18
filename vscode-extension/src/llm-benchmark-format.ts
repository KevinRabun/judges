/**
 * LLM Benchmark Report Formatter — generates a standalone markdown report
 * from per-judge and tribunal benchmark snapshots.
 *
 * This report is self-contained and published to the wiki alongside the
 * L1 benchmark report. It includes cross-mode comparison, per-judge
 * breakdown, per-category, per-difficulty, and failed case details.
 */

import type { LlmBenchmarkSnapshot, OptimizationResult } from "@kevinrabun/judges/api";

// ─── Helpers ────────────────────────────────────────────────────────────────

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function gradeFromF1(f1: number): { grade: string; emoji: string } {
  if (f1 >= 0.9) return { grade: "A", emoji: "🟢" };
  if (f1 >= 0.8) return { grade: "B", emoji: "🟡" };
  if (f1 >= 0.7) return { grade: "C", emoji: "🟠" };
  if (f1 >= 0.6) return { grade: "D", emoji: "🟠" };
  return { grade: "F", emoji: "🔴" };
}

// ─── Standalone Report ──────────────────────────────────────────────────────

/**
 * Generate a complete standalone LLM benchmark report.
 * Handles both modes being present, or only one.
 */
export function formatStandaloneBenchmarkReport(
  perJudge?: LlmBenchmarkSnapshot,
  tribunal?: LlmBenchmarkSnapshot,
  optimization?: OptimizationResult,
): string {
  const lines: string[] = [];
  const snapshot = perJudge ?? tribunal;
  if (!snapshot) return "# LLM Benchmark Report\n\nNo results available.\n";

  const timestamp = new Date(snapshot.timestamp).toLocaleString();
  const modelName = snapshot.model;

  lines.push("# LLM Benchmark Report");
  lines.push("");
  lines.push(`> **Model:** ${modelName} · **Generated:** ${timestamp} · **Version:** ${snapshot.version}`);
  lines.push("");

  // ─── Executive Summary ────────────────────────────────────────────────
  lines.push("## Executive Summary");
  lines.push("");

  if (perJudge && tribunal) {
    const pjGrade = gradeFromF1(perJudge.f1Score);
    const tGrade = gradeFromF1(tribunal.f1Score);
    lines.push("| Mode | Grade | F1 | Precision | Recall | Detection Rate | Cases |");
    lines.push("|------|-------|----|-----------|--------|----------------|-------|");
    lines.push(
      `| Per-Judge | ${pjGrade.emoji} **${pjGrade.grade}** | ${pct(perJudge.f1Score)} | ${pct(perJudge.precision)} | ${pct(perJudge.recall)} | ${pct(perJudge.detectionRate)} | ${perJudge.totalCases} |`,
    );
    lines.push(
      `| Tribunal | ${tGrade.emoji} **${tGrade.grade}** | ${pct(tribunal.f1Score)} | ${pct(tribunal.precision)} | ${pct(tribunal.recall)} | ${pct(tribunal.detectionRate)} | ${tribunal.totalCases} |`,
    );
    lines.push("");
    lines.push(`Total duration: ${perJudge.durationSeconds + tribunal.durationSeconds}s`);
  } else {
    const g = gradeFromF1(snapshot.f1Score);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Grade | ${g.emoji} **${g.grade}** |`);
    lines.push(`| F1 Score | ${pct(snapshot.f1Score)} |`);
    lines.push(`| Precision | ${pct(snapshot.precision)} |`);
    lines.push(`| Recall | ${pct(snapshot.recall)} |`);
    lines.push(`| Detection Rate | ${pct(snapshot.detectionRate)} |`);
    lines.push(`| Cases | ${snapshot.totalCases} |`);
    lines.push(`| Duration | ${snapshot.durationSeconds}s |`);
  }
  lines.push("");

  // ─── Per-Judge Mode Details ───────────────────────────────────────────
  if (perJudge) {
    lines.push(...formatModeSection(perJudge, "Per-Judge"));
  }

  // ─── Tribunal Mode Details ────────────────────────────────────────────
  if (tribunal) {
    lines.push(...formatModeSection(tribunal, "Tribunal"));
  }

  // ─── Cross-Mode Comparison ────────────────────────────────────────────
  if (perJudge && tribunal) {
    lines.push("## Cross-Mode Comparison");
    lines.push("");
    lines.push("| Metric | Per-Judge | Tribunal | Delta |");
    lines.push("|--------|----------|----------|-------|");

    const metrics: Array<{ label: string; pj: number; t: number; isPct: boolean }> = [
      { label: "F1 Score", pj: perJudge.f1Score, t: tribunal.f1Score, isPct: true },
      { label: "Precision", pj: perJudge.precision, t: tribunal.precision, isPct: true },
      { label: "Recall", pj: perJudge.recall, t: tribunal.recall, isPct: true },
      { label: "Detection Rate", pj: perJudge.detectionRate, t: tribunal.detectionRate, isPct: true },
      { label: "True Positives", pj: perJudge.truePositives, t: tribunal.truePositives, isPct: false },
      { label: "False Negatives", pj: perJudge.falseNegatives, t: tribunal.falseNegatives, isPct: false },
      { label: "False Positives", pj: perJudge.falsePositives, t: tribunal.falsePositives, isPct: false },
    ];

    for (const m of metrics) {
      const delta = m.t - m.pj;
      const deltaStr = m.isPct
        ? `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`
        : `${delta >= 0 ? "+" : ""}${delta}`;
      const pjStr = m.isPct ? pct(m.pj) : String(m.pj);
      const tStr = m.isPct ? pct(m.t) : String(m.t);
      lines.push(`| ${m.label} | ${pjStr} | ${tStr} | ${deltaStr} |`);
    }
    lines.push("");
  }

  // ─── Optimization Insights (Self-Teaching) ─────────────────────────────
  if (optimization) {
    lines.push(...formatOptimizationSection(optimization));
  }

  // ─── Methodology ──────────────────────────────────────────────────────
  lines.push("## Methodology");
  lines.push("");
  lines.push("### Scoring");
  lines.push(
    "- **Prefix-based matching**: Rule IDs are matched by prefix (e.g., CYBER-005 matches expected CYBER-001)",
  );
  lines.push("- **True Positive**: Expected prefix detected in LLM response");
  lines.push("- **False Negative**: Expected prefix not detected");
  lines.push("- **False Positive**: Unexpected prefix detected (from unexpectedRuleIds list)");
  lines.push("- **Detection Rate**: Percentage of cases where at least one expected rule prefix was found");
  lines.push("");
  lines.push("### Modes");
  lines.push("- **Per-Judge**: Each relevant judge evaluates cases independently with its specialized prompt");
  lines.push("- **Tribunal**: All 45 judges evaluate together in a single combined prompt");
  lines.push("");
  lines.push("### Sampling");
  lines.push("- Cases are stratified by category, difficulty, and clean/dirty split");
  lines.push("- Per-judge mode only invokes judges whose rule prefix matches expected findings (optimization)");
  lines.push("- Clean cases (no expected findings) are evaluated by all judges to test false positive rates");
  lines.push("");

  return lines.join("\n");
}

// ─── Mode Section ───────────────────────────────────────────────────────────

function formatModeSection(snapshot: LlmBenchmarkSnapshot, label: string): string[] {
  const lines: string[] = [];

  lines.push(`## ${label} Mode`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Test Cases | ${snapshot.totalCases} |`);
  lines.push(`| Detection Rate | ${pct(snapshot.detectionRate)} (${snapshot.detected}/${snapshot.totalCases}) |`);
  lines.push(`| Precision | ${pct(snapshot.precision)} |`);
  lines.push(`| Recall | ${pct(snapshot.recall)} |`);
  lines.push(`| F1 Score | ${pct(snapshot.f1Score)} |`);
  lines.push(`| True Positives | ${snapshot.truePositives} |`);
  lines.push(`| False Negatives | ${snapshot.falseNegatives} |`);
  lines.push(`| False Positives | ${snapshot.falsePositives} |`);
  lines.push(`| Duration | ${snapshot.durationSeconds}s |`);
  lines.push("");

  // Per-difficulty
  if (Object.keys(snapshot.perDifficulty).length > 0) {
    lines.push(`### ${label} — Detection by Difficulty`);
    lines.push("");
    lines.push("| Difficulty | Detected | Total | Rate |");
    lines.push("|------------|----------|-------|------|");
    for (const diff of ["easy", "medium", "hard"]) {
      const d = snapshot.perDifficulty[diff];
      if (d) {
        lines.push(`| ${diff} | ${d.detected} | ${d.total} | ${pct(d.detectionRate)} |`);
      }
    }
    lines.push("");
  }

  // Per-category
  if (Object.keys(snapshot.perCategory).length > 0) {
    lines.push(`### ${label} — Results by Category`);
    lines.push("");
    lines.push("| Category | Detected | Total | Precision | Recall | F1 |");
    lines.push("|----------|----------|-------|-----------|--------|-----|");
    for (const [cat, stats] of Object.entries(snapshot.perCategory).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        `| ${cat} | ${stats.detected} | ${stats.total} | ${pct(stats.precision)} | ${pct(stats.recall)} | ${pct(stats.f1Score)} |`,
      );
    }
    lines.push("");
  }

  // Per-judge
  if (Object.keys(snapshot.perJudge).length > 0) {
    lines.push(`### ${label} — Results by Judge`);
    lines.push("");
    lines.push("| Judge | Findings | TP | FP | Precision |");
    lines.push("|-------|----------|-----|-----|-----------|");
    for (const [judgeId, stats] of Object.entries(snapshot.perJudge).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        `| ${judgeId} | ${stats.total} | ${stats.truePositives} | ${stats.falsePositives} | ${pct(stats.precision)} |`,
      );
    }
    lines.push("");
  }

  // Failed cases
  const failed = snapshot.cases.filter((c) => !c.passed);
  if (failed.length > 0 && failed.length <= 50) {
    lines.push(`### ${label} — Failed Cases`);
    lines.push("");
    lines.push("| Case | Difficulty | Category | Missed Rules | False Positives |");
    lines.push("|------|------------|----------|--------------|-----------------|");
    for (const c of failed) {
      const missed = c.missedRuleIds.length > 0 ? c.missedRuleIds.join(", ") : "—";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "—";
      lines.push(`| ${c.caseId} | ${c.difficulty} | ${c.category} | ${missed} | ${fps} |`);
    }
    lines.push("");
  } else if (failed.length > 50) {
    lines.push(`### ${label} — Failed Cases`);
    lines.push("");
    lines.push(`${failed.length} cases failed — showing first 50:`);
    lines.push("");
    lines.push("| Case | Difficulty | Category | Missed Rules | False Positives |");
    lines.push("|------|------------|----------|--------------|-----------------|");
    for (const c of failed.slice(0, 50)) {
      const missed = c.missedRuleIds.length > 0 ? c.missedRuleIds.join(", ") : "—";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "—";
      lines.push(`| ${c.caseId} | ${c.difficulty} | ${c.category} | ${missed} | ${fps} |`);
    }
    lines.push("");
  }

  return lines;
}

// ─── Optimization Section ───────────────────────────────────────────────────

function formatOptimizationSection(opt: OptimizationResult): string[] {
  const lines: string[] = [];

  lines.push("## Self-Teaching Optimization");
  lines.push("");
  lines.push(
    `> Projected F1 improvement: **+${(opt.projectedF1Improvement * 100).toFixed(1)}pp** ` +
      `(${pct(opt.summary.currentF1)} → ${pct(opt.summary.projectedF1)})`,
  );
  lines.push("");

  // Summary
  if (opt.summary.worstJudges.length > 0) {
    lines.push(`**Worst judges:** ${opt.summary.worstJudges.join(", ")}`);
  }
  if (opt.summary.weakCategories.length > 0) {
    lines.push(`**Weak categories:** ${opt.summary.weakCategories.join(", ")}`);
  }
  lines.push("");

  // Insights table
  if (opt.insights.length > 0) {
    lines.push("### Insights");
    lines.push("");
    lines.push("| Severity | Target | Issue | Metric | Recommendation |");
    lines.push("|----------|--------|-------|--------|----------------|");
    for (const i of opt.insights) {
      const sev = i.severity === "critical" ? "🔴 critical" : i.severity === "high" ? "🟠 high" : "🟡 medium";
      lines.push(`| ${sev} | ${i.target} | ${i.category} | ${pct(i.metric)} | ${i.recommendation} |`);
    }
    lines.push("");
  }

  // Amendments
  if (opt.amendments.length > 0) {
    lines.push("### Prompt Amendments (applied next run)");
    lines.push("");
    for (const a of opt.amendments) {
      lines.push(`- **${a.judgePrefix}** (FP rate: ${pct(a.fpRate)}): ${a.reason}`);
    }
    lines.push("");
  }

  return lines;
}
