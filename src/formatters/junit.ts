// ─── JUnit XML Formatter ─────────────────────────────────────────────────────
// Converts a TribunalVerdict into JUnit XML format for CI/CD integration.
// Compatible with Jenkins, Azure DevOps, GitHub Actions, GitLab CI, etc.
// ──────────────────────────────────────────────────────────────────────────────

import type { TribunalVerdict, Finding } from "../types.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert a TribunalVerdict into JUnit XML format.
 * Each judge becomes a test suite; each finding becomes a test case failure.
 */
export function verdictToJUnit(verdict: TribunalVerdict, filePath?: string): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();
  const totalTests = verdict.evaluations.reduce((s, e) => s + Math.max(e.findings.length, 1), 0);
  const totalFailures = verdict.evaluations.reduce(
    (s, e) => s + e.findings.filter((f) => f.severity === "critical" || f.severity === "high").length,
    0,
  );
  const totalErrors = 0;
  const suiteName = filePath ? `judges:${filePath}` : "judges";

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="${escapeXml(suiteName)}" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" timestamp="${timestamp}">`,
  );

  for (const evaluation of verdict.evaluations) {
    const suiteFailures = evaluation.findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
    const suiteTests = Math.max(evaluation.findings.length, 1);

    lines.push(
      `  <testsuite name="${escapeXml(evaluation.judgeName)}" tests="${suiteTests}" failures="${suiteFailures}" errors="0">`,
    );

    if (evaluation.findings.length === 0) {
      // No findings = passing test
      lines.push(
        `    <testcase name="${escapeXml(evaluation.judgeName)}: pass" classname="${escapeXml(evaluation.judgeName)}" />`,
      );
    } else {
      for (const finding of evaluation.findings) {
        const testName = `${finding.ruleId}: ${finding.title}`;
        const className = evaluation.judgeName;
        const isFail = finding.severity === "critical" || finding.severity === "high";

        lines.push(`    <testcase name="${escapeXml(testName)}" classname="${escapeXml(className)}">`);

        if (isFail) {
          lines.push(`      <failure message="${escapeXml(finding.title)}" type="${escapeXml(finding.severity)}">`);
          lines.push(escapeXml(formatFindingMessage(finding)));
          lines.push("      </failure>");
        } else {
          // medium/low/info become system-out warnings rather than failures
          lines.push("      <system-out>");
          lines.push(escapeXml(formatFindingMessage(finding)));
          lines.push("      </system-out>");
        }

        lines.push("    </testcase>");
      }
    }

    lines.push("  </testsuite>");
  }

  lines.push("</testsuites>");
  return lines.join("\n");
}

function formatFindingMessage(f: Finding): string {
  const parts = [`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`, f.description];
  if (f.lineNumbers && f.lineNumbers.length > 0) {
    parts.push(`Lines: ${f.lineNumbers.join(", ")}`);
  }
  parts.push(`Recommendation: ${f.recommendation}`);
  if (f.reference) parts.push(`Reference: ${f.reference}`);
  return parts.join("\n");
}
