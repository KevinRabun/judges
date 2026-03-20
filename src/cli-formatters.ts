import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

import { formatVerdictAsMarkdown } from "./evaluators/index.js";
import { verdictToSarif } from "./formatters/sarif.js";
import { verdictToGitHubActions } from "./formatters/github-actions.js";
import type { TribunalVerdict, JudgeEvaluation } from "./types.js";

export type OutputFormat =
  | "text"
  | "json"
  | "sarif"
  | "markdown"
  | "html"
  | "pdf"
  | "junit"
  | "codeclimate"
  | "github-actions";

export function formatTribunalOutput(verdict: TribunalVerdict, format: OutputFormat, filePath?: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(verdict, null, 2);
    case "sarif": {
      const sarif = verdictToSarif(verdict, filePath);
      return JSON.stringify(sarif, null, 2);
    }
    case "markdown":
      return formatVerdictAsMarkdown(verdict);
    case "html":
      // HTML is handled separately in runCli (needs async import)
      return formatTextOutput(verdict);
    case "github-actions":
      return verdictToGitHubActions(verdict, filePath);
    case "text":
    default:
      return formatTextOutput(verdict);
  }
}

export function writeOutputIfSpecified(outputPath: string | undefined, contents: string): void {
  if (!outputPath) return;
  const dir = dirname(outputPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // directory may already exist
  }
  writeFileSync(outputPath, contents, "utf-8");
}

export function formatTextOutput(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  const fixableCount = verdict.evaluations.reduce((s, e) => s + e.findings.filter((f) => f.patch).length, 0);

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║              Judges Panel — Evaluation Result               ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Verdict  : ${verdict.overallVerdict.toUpperCase()}`);
  lines.push(`  Score    : ${verdict.overallScore}/100`);
  lines.push(`  Critical : ${verdict.criticalCount}`);
  lines.push(`  High     : ${verdict.highCount}`);
  lines.push(`  Findings : ${totalFindings}${fixableCount > 0 ? ` (${fixableCount} auto-fixable)` : ""}`);
  lines.push(`  Judges   : ${verdict.evaluations.length}`);
  lines.push("");

  // Per-judge table
  lines.push("  Per-Judge Breakdown:");
  lines.push("  " + "─".repeat(60));
  for (const evaluation of verdict.evaluations) {
    const icon = evaluation.verdict === "pass" ? "✅" : evaluation.verdict === "warning" ? "⚠️ " : "❌";
    const name = evaluation.judgeName.padEnd(28);
    const score = String(evaluation.score).padStart(3);
    const findings = String(evaluation.findings.length).padStart(2);
    const timing = evaluation.durationMs !== undefined ? `  ${evaluation.durationMs}ms` : "";
    lines.push(`  ${icon} ${name} ${score}/100   ${findings} finding(s)${timing}`);
  }
  lines.push("");

  // Timing summary
  if (verdict.timing) {
    lines.push(`  Total evaluation time: ${verdict.timing.totalMs}ms`);
    const sorted = [...verdict.timing.perJudge].sort((a, b) => b.durationMs - a.durationMs);
    const slowest = sorted.slice(0, 5);
    if (slowest.length > 0) {
      lines.push("  Slowest judges:");
      for (const j of slowest) {
        lines.push(`    ${j.judgeName.padEnd(28)} ${j.durationMs}ms`);
      }
    }
    lines.push("");
  }

  // Suppression metrics
  if (verdict.suppressions && verdict.suppressions.length > 0) {
    const supps = verdict.suppressions;
    const byKind = { line: 0, "next-line": 0, block: 0, file: 0 };
    const byRule = new Map<string, number>();
    for (const s of supps) {
      byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      byRule.set(s.ruleId, (byRule.get(s.ruleId) ?? 0) + 1);
    }
    lines.push(`  Suppressed Findings: ${supps.length}`);
    const kinds = Object.entries(byKind)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`);
    lines.push(`    By type: ${kinds.join(", ")}`);
    const topRules = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topRules.length > 0) {
      lines.push(`    Top suppressed rules: ${topRules.map(([r, c]) => `${r} (${c})`).join(", ")}`);
    }
    lines.push("");
  }

  // Top findings
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const critical = allFindings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (critical.length > 0) {
    lines.push("  Critical & High Findings:");
    lines.push("  " + "─".repeat(60));
    for (const f of critical.slice(0, 20)) {
      const fixTag = f.patch ? " 🔧" : "";
      const confTag = f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}% confidence)` : "";
      lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}${fixTag}${confTag}`);
      if (f.lineNumbers && f.lineNumbers.length > 0) {
        lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 100)}`);
      }
      if (f.provenance) {
        lines.push(`             Evidence: ${f.provenance}`);
      }
      if (f.evidenceBasis) {
        lines.push(`             Basis: ${f.evidenceBasis}`);
      }
      if (f.evidenceChain && f.evidenceChain.steps.length > 0) {
        lines.push(`             Impact: ${f.evidenceChain.impactStatement}`);
        for (const step of f.evidenceChain.steps.slice(0, 3)) {
          const loc = step.line ? ` (L${step.line})` : "";
          lines.push(`               → [${step.source}]${loc} ${step.observation}`);
        }
      }
      if (f.cweIds && f.cweIds.length > 0) {
        lines.push(`             CWE: ${f.cweIds.join(", ")}`);
      }
      if (f.owaspLlmTop10) {
        lines.push(`             OWASP LLM: ${f.owaspLlmTop10}`);
      }
      if (f.learnMoreUrl) {
        lines.push(`             📖 Learn more: ${f.learnMoreUrl}`);
      }
    }
    if (critical.length > 20) {
      lines.push(`  ... and ${critical.length - 20} more critical/high findings`);
    }
    lines.push("");
  }

  // Exit guidance
  if (verdict.overallVerdict === "fail") {
    lines.push("  ⛔ FAIL — This code has issues that should be addressed before shipping.");
  } else if (verdict.overallVerdict === "warning") {
    lines.push("  ⚠️  WARNING — Review findings above before proceeding.");
  } else {
    lines.push("  ✅ PASS — No critical issues detected.");
  }

  if (fixableCount > 0) {
    lines.push(`  🔧 ${fixableCount} finding(s) can be auto-fixed. Run: judges eval <file> --fix`);
  }
  lines.push("");

  return lines.join("\n");
}

export function formatSingleJudgeTextOutput(evaluation: JudgeEvaluation): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push(`║  Judge: ${evaluation.judgeName.padEnd(49)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Verdict  : ${evaluation.verdict.toUpperCase()}`);
  lines.push(`  Score    : ${evaluation.score}/100`);
  lines.push(`  Findings : ${evaluation.findings.length}`);
  lines.push("");

  for (const f of evaluation.findings) {
    const confTag = f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}%)` : "";
    lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}${confTag}`);
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 120)}`);
    }
    if (f.provenance) {
      lines.push(`             Evidence: ${f.provenance}`);
    }
    if (f.evidenceChain && f.evidenceChain.steps.length > 0) {
      lines.push(`             Impact: ${f.evidenceChain.impactStatement}`);
    }
    if (f.suggestedFix) {
      lines.push(`             Fix: ${f.suggestedFix.slice(0, 120)}`);
    }
    if (f.learnMoreUrl) {
      lines.push(`             📖 ${f.learnMoreUrl}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
