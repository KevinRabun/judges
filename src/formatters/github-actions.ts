// ─── GitHub Actions Workflow Annotations Formatter ────────────────────────────
// Outputs findings as GitHub Actions workflow commands (::error, ::warning,
// ::notice) so they appear inline in pull request file views.
//
// See: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-a-warning-message
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding, TribunalVerdict } from "../types.js";

/**
 * Map finding severity to a GitHub Actions annotation level.
 */
function severityToLevel(severity: string): "error" | "warning" | "notice" {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "notice";
  }
}

/**
 * Escape special characters for GitHub Actions workflow commands.
 * Newlines, carriage returns, and percent signs must be encoded.
 */
function escapeAnnotation(text: string): string {
  return text
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

/**
 * Format a single finding as a GitHub Actions annotation command.
 */
function formatFindingAnnotation(finding: Finding, filePath?: string): string {
  const level = severityToLevel(finding.severity);
  const title = `[${finding.ruleId}] ${finding.title}`;

  const params: string[] = [];
  if (filePath) params.push(`file=${escapeAnnotation(filePath)}`);
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    params.push(`line=${finding.lineNumbers[0]}`);
    if (finding.lineNumbers.length > 1) {
      params.push(`endLine=${finding.lineNumbers[finding.lineNumbers.length - 1]}`);
    }
  }
  params.push(`title=${escapeAnnotation(title)}`);

  const message = finding.description || finding.title;
  return `::${level} ${params.join(",")}::${escapeAnnotation(message)}`;
}

/**
 * Format a full tribunal verdict as GitHub Actions annotations.
 * Each finding becomes an ::error, ::warning, or ::notice command.
 */
export function verdictToGitHubActions(verdict: TribunalVerdict, filePath?: string): string {
  const lines: string[] = [];

  // Summary as a notice
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  lines.push(
    `::notice title=Judges Panel Summary::Score ${verdict.overallScore}/100 | ` +
      `${totalFindings} finding(s) | ${verdict.criticalCount} critical | ${verdict.highCount} high`,
  );

  // Individual findings
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  for (const finding of allFindings) {
    lines.push(formatFindingAnnotation(finding, filePath));
  }

  return lines.join("\n");
}
