/**
 * Smart Output — Adaptive first-experience output formatting
 *
 * Provides contextual, actionable output that adapts to the user's environment
 * and experience level. Includes onboarding hints, quick-fix commands, and
 * progressive detail levels.
 */

import type { Finding, TribunalVerdict, JudgeEvaluation } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SmartOutputOptions {
  /** Whether this is the first evaluation in the session */
  isFirstRun?: boolean;
  /** Output width in columns (default: 80) */
  columns?: number;
  /** Show suggested next steps */
  showNextSteps?: boolean;
  /** Maximum number of findings to show inline */
  maxFindings?: number;
  /** Hide judges with no findings */
  hideCleanJudges?: boolean;
  /** Collapse passing judges into a count */
  collapsePassingJudges?: boolean;
  /** Show fix commands inline */
  showFixCommands?: boolean;
  /** Show time-to-fix estimates */
  showTimeEstimates?: boolean;
  /** CI environment (suppress decorations) */
  ci?: boolean;
}

export interface NextStep {
  label: string;
  command: string;
  description: string;
}

// ─── Time Estimates ──────────────────────────────────────────────────────────

const SEVERITY_TIME_MINUTES: Record<string, number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
  info: 2,
};

function estimateFixTime(findings: Finding[]): number {
  return findings.reduce((total, f) => total + (SEVERITY_TIME_MINUTES[f.severity] ?? 5), 0);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `~${hours}h ${rem}min` : `~${hours}h`;
}

// ─── Smart Verdict Output ────────────────────────────────────────────────────

/**
 * Generate smart, contextual output for a tribunal verdict.
 */
export function formatSmartOutput(
  verdict: TribunalVerdict,
  filePath?: string,
  options: SmartOutputOptions = {},
): string {
  const {
    isFirstRun = false,
    columns = 80,
    showNextSteps = true,
    maxFindings = 15,
    hideCleanJudges = true,
    collapsePassingJudges = true,
    showFixCommands = true,
    showTimeEstimates = true,
    ci = false,
  } = options;

  const lines: string[] = [];
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);

  // ─── Header ────────────────────────────────────────────────────────────

  if (!ci) {
    const icon = verdict.overallVerdict === "pass" ? "✅" : verdict.overallVerdict === "warning" ? "⚠️" : "❌";
    lines.push(
      `${icon}  ${verdict.overallVerdict.toUpperCase()}  ${verdict.overallScore}/100  ` +
        `(${totalFindings} finding${totalFindings !== 1 ? "s" : ""} from ${verdict.evaluations.length} judges)`,
    );
    if (filePath) {
      lines.push(`   ${filePath}`);
    }
    lines.push("");
  } else {
    // CI-friendly one-liner
    lines.push(
      `[judges] ${verdict.overallVerdict.toUpperCase()} ${verdict.overallScore}/100 ` +
        `(${totalFindings} findings, ${verdict.criticalCount} critical, ${verdict.highCount} high)`,
    );
    lines.push("");
  }

  // ─── Critical / High Findings (always shown) ──────────────────────────

  const critical = allFindings.filter((f) => f.severity === "critical");
  const high = allFindings.filter((f) => f.severity === "high");
  const urgent = [...critical, ...high].slice(0, maxFindings);

  if (urgent.length > 0) {
    lines.push("  Must Fix:");
    lines.push("  " + "─".repeat(Math.min(columns - 4, 60)));
    for (const f of urgent) {
      const sevIcon = f.severity === "critical" ? "🔴" : "🟠";
      const lineRef = f.lineNumbers?.[0] ? ` (line ${f.lineNumbers[0]})` : "";
      lines.push(`  ${sevIcon} ${f.ruleId}: ${f.title}${lineRef}`);
      if (f.suggestedFix) {
        lines.push(`     💡 ${f.suggestedFix.slice(0, columns - 8)}`);
      }
    }
    lines.push("");
  }

  // ─── Medium / Low Summary ─────────────────────────────────────────────

  const medium = allFindings.filter((f) => f.severity === "medium");
  const low = allFindings.filter((f) => f.severity === "low" || f.severity === "info");
  if (medium.length + low.length > 0) {
    lines.push(`  Also: ${medium.length} medium, ${low.length} low/info findings`);
    lines.push("");
  }

  // ─── Judge Summary ────────────────────────────────────────────────────

  if (collapsePassingJudges) {
    const failing = verdict.evaluations.filter((e) => e.verdict !== "pass");
    const passing = verdict.evaluations.filter((e) => e.verdict === "pass");

    if (failing.length > 0) {
      lines.push("  Judges with findings:");
      for (const e of failing) {
        const icon = e.verdict === "fail" ? "❌" : "⚠️";
        lines.push(
          `  ${icon} ${e.judgeName.padEnd(28)} ${String(e.score).padStart(3)}/100  ${e.findings.length} finding(s)`,
        );
      }
    }
    if (passing.length > 0) {
      lines.push(`  ✅ ${passing.length} judges passed with no findings`);
    }
    lines.push("");
  }

  // ─── Time Estimate ────────────────────────────────────────────────────

  if (showTimeEstimates && totalFindings > 0) {
    const totalMinutes = estimateFixTime(allFindings);
    lines.push(`  ⏱  Estimated fix time: ${formatDuration(totalMinutes)}`);
    lines.push("");
  }

  // ─── Next Steps ───────────────────────────────────────────────────────

  if (showNextSteps && !ci) {
    const steps = suggestNextSteps(verdict, filePath);
    if (steps.length > 0) {
      lines.push("  Next steps:");
      for (const step of steps.slice(0, 3)) {
        lines.push(`    → ${step.label}: ${step.command}`);
      }
      lines.push("");
    }
  }

  // ─── First Run Onboarding ─────────────────────────────────────────────

  if (isFirstRun && !ci) {
    lines.push("  💡 Tips:");
    lines.push("    • Use --format json for machine-readable output");
    lines.push("    • Use judges fix <file> --apply to auto-fix issues");
    lines.push("    • Use judges init to set up a .judgesrc config");
    lines.push("    • Use --preset security-only to focus on security");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Next Step Suggestions ───────────────────────────────────────────────────

function suggestNextSteps(verdict: TribunalVerdict, filePath?: string): NextStep[] {
  const steps: NextStep[] = [];
  const fileArg = filePath ? ` ${filePath}` : " <file>";
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const hasPatches = allFindings.some((f) => f.patch);

  if (hasPatches) {
    steps.push({
      label: "Auto-fix",
      command: `judges fix${fileArg} --apply`,
      description: "Automatically apply suggested patches",
    });
  }

  if (verdict.overallVerdict === "fail") {
    steps.push({
      label: "Security audit",
      command: `judges eval --judge cybersecurity${fileArg}`,
      description: "Deep-dive into security findings",
    });
  }

  steps.push({
    label: "SARIF report",
    command: `judges eval --format sarif${fileArg}`,
    description: "Generate SARIF for IDE or CI integration",
  });

  if (verdict.criticalCount > 0) {
    steps.push({
      label: "Baseline",
      command: `judges baseline create --file${fileArg}`,
      description: "Create a baseline to track new findings only",
    });
  }

  return steps;
}

// ─── Smart Single-Judge Output ───────────────────────────────────────────────

export function formatSmartSingleJudge(
  evaluation: JudgeEvaluation,
  filePath?: string,
  options: SmartOutputOptions = {},
): string {
  const { ci = false, showFixCommands = true } = options;
  const lines: string[] = [];

  const icon = evaluation.verdict === "pass" ? "✅" : evaluation.verdict === "warning" ? "⚠️" : "❌";
  lines.push(`${icon}  ${evaluation.judgeName}  ${evaluation.score}/100  (${evaluation.findings.length} findings)`);
  if (filePath) lines.push(`   ${filePath}`);
  lines.push("");

  for (const f of evaluation.findings) {
    const sevIcon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : "🟡";
    const lineRef = f.lineNumbers?.[0] ? ` (line ${f.lineNumbers[0]})` : "";
    lines.push(`  ${sevIcon} ${f.ruleId}: ${f.title}${lineRef}`);
    if (showFixCommands && f.suggestedFix) {
      lines.push(`     💡 ${f.suggestedFix.slice(0, 100)}`);
    }
  }

  if (evaluation.findings.length === 0) {
    lines.push("  No issues found — clean code!");
  }
  lines.push("");

  return lines.join("\n");
}
