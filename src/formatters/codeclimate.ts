// ─── CodeClimate JSON Formatter ──────────────────────────────────────────────
// Converts a TribunalVerdict into GitLab Code Quality / CodeClimate format.
// Compatible with GitLab CI Code Quality widget.
// Spec: https://docs.gitlab.com/ee/ci/testing/code_quality.html
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import type { TribunalVerdict, Finding, Severity } from "../types.js";

/**
 * CodeClimate issue severity mapping.
 * CodeClimate uses: info, minor, major, critical, blocker
 */
function mapSeverity(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "blocker";
    case "high":
      return "critical";
    case "medium":
      return "major";
    case "low":
      return "minor";
    case "info":
      return "info";
    default:
      return "minor";
  }
}

interface CodeClimateIssue {
  type: "issue";
  check_name: string;
  description: string;
  content: { body: string };
  categories: string[];
  severity: string;
  fingerprint: string;
  location: {
    path: string;
    lines: { begin: number; end: number };
  };
}

function findingToCategories(finding: Finding): string[] {
  const cats: string[] = [];
  const rid = finding.ruleId.toUpperCase();

  if (rid.startsWith("SEC") || rid.startsWith("AUTH") || rid.startsWith("CYBER")) cats.push("Security");
  if (rid.startsWith("PERF") || rid.startsWith("CACHE")) cats.push("Performance");
  if (rid.startsWith("ERR") || rid.startsWith("RESIL")) cats.push("Bug Risk");
  if (rid.startsWith("STYLE") || rid.startsWith("CODE") || rid.startsWith("DOC")) cats.push("Style");
  if (rid.startsWith("COMPAT") || rid.startsWith("API")) cats.push("Compatibility");
  if (rid.startsWith("COST")) cats.push("Performance");
  if (rid.startsWith("DATA") || rid.startsWith("PRIV")) cats.push("Security");

  if (cats.length === 0) cats.push("Bug Risk");
  return cats;
}

/**
 * Convert a TribunalVerdict into CodeClimate / GitLab Code Quality JSON.
 */
export function verdictToCodeClimate(verdict: TribunalVerdict, filePath?: string): CodeClimateIssue[] {
  const issues: CodeClimateIssue[] = [];
  const path = filePath || "unknown";

  for (const evaluation of verdict.evaluations) {
    for (const finding of evaluation.findings) {
      const beginLine = finding.lineNumbers?.[0] ?? 1;
      const endLine = finding.lineNumbers?.[finding.lineNumbers.length - 1] ?? beginLine;

      // Deterministic fingerprint
      const fingerprint = createHash("md5")
        .update(`${finding.ruleId}:${path}:${beginLine}:${finding.title}`)
        .digest("hex");

      issues.push({
        type: "issue",
        check_name: finding.ruleId,
        description: finding.title,
        content: {
          body: `${finding.description}\n\n**Recommendation:** ${finding.recommendation}${finding.reference ? `\n\n**Reference:** ${finding.reference}` : ""}`,
        },
        categories: findingToCategories(finding),
        severity: mapSeverity(finding.severity),
        fingerprint,
        location: {
          path,
          lines: { begin: beginLine, end: endLine },
        },
      });
    }
  }

  return issues;
}
