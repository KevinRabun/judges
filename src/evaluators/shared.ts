import {
  JudgeDefinition,
  JudgeEvaluation,
  TribunalVerdict,
  Finding,
  Severity,
  Verdict,
} from "../types.js";

// ─── Shared Utilities ────────────────────────────────────────────────────────
// Helper functions used by all analyzer modules and the evaluation engine.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Find line numbers in source code that match a given regex pattern.
 */
export function getLineNumbers(code: string, pattern: RegExp): number[] {
  const lines = code.split("\n");
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push(i + 1);
    }
  }
  return matches;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function calculateScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    switch (f.severity) {
      case "critical":
        score -= 30;
        break;
      case "high":
        score -= 18;
        break;
      case "medium":
        score -= 10;
        break;
      case "low":
        score -= 5;
        break;
      case "info":
        score -= 2;
        break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

export function deriveVerdict(findings: Finding[], score: number): Verdict {
  if (findings.some((f) => f.severity === "critical")) return "fail";
  if (score < 60) return "fail";
  if (findings.some((f) => f.severity === "high") || findings.some((f) => f.severity === "medium") || score < 80) return "warning";
  return "pass";
}

// ─── Summary Builders ────────────────────────────────────────────────────────

export function buildSummary(
  judge: JudgeDefinition,
  findings: Finding[],
  score: number,
  verdict: Verdict
): string {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  let summary = `**${judge.name}** — ${judge.domain}\n`;
  summary += `Verdict: **${verdict.toUpperCase()}** | Score: **${score}/100**\n`;
  summary += `Findings: ${critical} critical, ${high} high, ${medium} medium, ${low} low\n\n`;

  if (findings.length === 0) {
    summary += "No pattern-based issues detected. Heuristic analysis has inherent limits — absence of findings does not guarantee the code is free of defects. Manual expert review is strongly recommended.";
  } else {
    summary += "Key issues:\n";
    for (const f of findings.filter((f) =>
      ["critical", "high"].includes(f.severity)
    )) {
      summary += `- [${f.ruleId}] (${f.severity}) ${f.title}: ${f.description}\n`;
    }
  }

  return summary;
}

export function buildTribunalSummary(
  evaluations: JudgeEvaluation[],
  verdict: Verdict,
  score: number,
  criticalCount: number,
  highCount: number
): string {
  let summary = `# Judges Panel — Verdict\n\n`;
  summary += `**Overall Verdict: ${verdict.toUpperCase()}** | **Score: ${score}/100**\n`;
  summary += `Total critical findings: ${criticalCount} | Total high findings: ${highCount}\n\n`;
  summary += `## Individual Judge Results\n\n`;

  for (const e of evaluations) {
    const icon =
      e.verdict === "pass" ? "✅" : e.verdict === "warning" ? "⚠️" : "❌";
    summary += `${icon} **${e.judgeName}** (${e.verdict.toUpperCase()}, ${e.score}/100) — ${e.findings.length} finding(s)\n`;
  }

  summary += `\n---\n\n`;

  // Add details for each judge
  for (const e of evaluations) {
    summary += e.summary + "\n\n";
  }

  return summary;
}

// ─── Markdown Formatters ─────────────────────────────────────────────────────

/**
 * Format a full tribunal verdict as a readable Markdown string.
 */
export function formatVerdictAsMarkdown(verdict: TribunalVerdict): string {
  let md = verdict.summary;

  md += `\n## Detailed Findings\n\n`;

  for (const evaluation of verdict.evaluations) {
    for (const finding of evaluation.findings) {
      const severityBadge =
        finding.severity === "critical"
          ? "🔴 CRITICAL"
          : finding.severity === "high"
          ? "🟠 HIGH"
          : finding.severity === "medium"
          ? "🟡 MEDIUM"
          : finding.severity === "low"
          ? "🔵 LOW"
          : "ℹ️ INFO";

      md += `### ${severityBadge} — [${finding.ruleId}] ${finding.title}\n\n`;
      md += `${finding.description}\n\n`;
      if (finding.lineNumbers && finding.lineNumbers.length > 0) {
        md += `**Lines affected:** ${finding.lineNumbers.join(", ")}\n\n`;
      }
      md += `**Recommendation:** ${finding.recommendation}\n\n`;
      if (finding.reference) {
        md += `**Reference:** ${finding.reference}\n\n`;
      }
      md += `---\n\n`;
    }
  }

  return md;
}

/**
 * Format a single judge evaluation as a readable Markdown string.
 */
export function formatEvaluationAsMarkdown(evaluation: JudgeEvaluation): string {
  let md = evaluation.summary + "\n\n";

  md += `## Detailed Findings\n\n`;

  for (const finding of evaluation.findings) {
    const severityBadge =
      finding.severity === "critical"
        ? "🔴 CRITICAL"
        : finding.severity === "high"
        ? "🟠 HIGH"
        : finding.severity === "medium"
        ? "🟡 MEDIUM"
        : finding.severity === "low"
        ? "🔵 LOW"
        : "ℹ️ INFO";

    md += `### ${severityBadge} — [${finding.ruleId}] ${finding.title}\n\n`;
    md += `${finding.description}\n\n`;
    if (finding.lineNumbers && finding.lineNumbers.length > 0) {
      md += `**Lines affected:** ${finding.lineNumbers.join(", ")}\n\n`;
    }
    md += `**Recommendation:** ${finding.recommendation}\n\n`;
    if (finding.reference) {
      md += `**Reference:** ${finding.reference}\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}
