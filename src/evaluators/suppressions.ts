// ── Inline suppression comment support ──────────────────────────────────────
// Extracted from evaluators/index.ts to keep that file focused on
// tribunal orchestration and scoring.
// ────────────────────────────────────────────────────────────────────────────

import type { Finding, SuppressionRecord, SuppressionResult } from "../types.js";

/**
 * Metadata captured per suppression directive during parsing.
 */
export interface SuppressionDirective {
  /** Normalised rule ID (uppercased) or "*" */
  ruleId: string;
  /** Type of directive that created this suppression */
  kind: "line" | "next-line" | "block" | "file";
  /** 1-based line number of the suppression comment itself */
  commentLine: number;
  /** Optional reason text extracted from the comment */
  reason?: string;
}

/**
 * Parsed result of inline suppression comments in source code.
 *
 * Supports five directive styles:
 *   // judges-ignore RULE-ID              → suppress on same line
 *   // judges-ignore-next-line RULE-ID    → suppress on the next line
 *   // judges-ignore-block RULE-ID        → suppress until matching end
 *   // judges-end-block                   → ends block suppression
 *   // judges-file-ignore RULE-ID         → suppress across entire file
 *
 * All directive styles also accept # and /* comment prefixes for
 * Python/YAML/CSS compatibility.
 *
 * An optional reason can be appended after " -- ":
 *   // judges-ignore SEC-001 -- legacy code, tracked in JIRA-123
 */
export function parseInlineSuppressions(code: string): {
  lineSuppressed: Map<number, SuppressionDirective[]>;
  globalSuppressed: SuppressionDirective[];
} {
  const lines = code.split("\n");
  const lineSuppressed = new Map<number, SuppressionDirective[]>();
  const globalSuppressed: SuppressionDirective[] = [];

  // Active block suppressions: ruleId → { commentLine, reason }
  const activeBlocks = new Map<string, { commentLine: number; reason?: string }>();

  // Pattern: // judges-ignore[-next-line|-block] RULE-ID [, RULE-ID ...] [-- reason]
  const endBlockPattern = /(?:\/\/|#|\/\*)\s*judges-end-block/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-indexed

    // Check for block-end
    if (endBlockPattern.test(line)) {
      activeBlocks.clear();
    }

    // Apply any active block suppressions to this line
    for (const [ruleId, meta] of activeBlocks) {
      const arr = lineSuppressed.get(lineNum) ?? [];
      arr.push({ ruleId, kind: "block", commentLine: meta.commentLine, reason: meta.reason });
      lineSuppressed.set(lineNum, arr);
    }

    // Parse suppression directives (string-based to avoid regex redos)
    const ignoreIdx = line.indexOf("judges-ignore");
    if (ignoreIdx >= 0) {
      const before = line.substring(0, ignoreIdx).trimEnd();
      if (before.endsWith("//") || before.endsWith("#") || before.endsWith("/*")) {
        let rest = line.substring(ignoreIdx + "judges-ignore".length);
        let modifier: string | undefined;
        if (rest.toLowerCase().startsWith("-next-line")) {
          modifier = "next-line";
          rest = rest.substring("-next-line".length);
        } else if (rest.toLowerCase().startsWith("-block")) {
          modifier = "block";
          rest = rest.substring("-block".length);
        }
        const trimmedRest = rest.trimStart();
        if (trimmedRest.length < rest.length && trimmedRest.length > 0) {
          let rawContent = trimmedRest;
          if (rawContent.trimEnd().endsWith("*/")) {
            rawContent = rawContent.replace("*/", "").trimEnd();
          }
          const dashSplit = rawContent.split(" -- ");
          const ruleIds = dashSplit[0].split(/[, \t]+/).filter(Boolean);
          const reason = dashSplit[1]?.trim() || undefined;

          const kind: SuppressionDirective["kind"] =
            modifier === "next-line" ? "next-line" : modifier === "block" ? "block" : "line";
          const targetLine = kind === "next-line" ? lineNum + 1 : lineNum;

          for (const rawId of ruleIds) {
            const ruleId = rawId === "*" ? "*" : rawId.toUpperCase();

            if (kind === "block") {
              // Start block suppression — applies to all subsequent lines until end-block
              activeBlocks.set(ruleId, { commentLine: lineNum, reason });
            } else {
              const arr = lineSuppressed.get(targetLine) ?? [];
              arr.push({ ruleId, kind, commentLine: lineNum, reason });
              lineSuppressed.set(targetLine, arr);
            }
          }
        }
      }
    }

    // File-level suppression: // judges-file-ignore RULE-ID [-- reason]
    const fileIgnoreIdx = line.indexOf("judges-file-ignore");
    if (fileIgnoreIdx >= 0) {
      const beforeFile = line.substring(0, fileIgnoreIdx).trimEnd();
      if (beforeFile.endsWith("//") || beforeFile.endsWith("#") || beforeFile.endsWith("/*")) {
        const fileRest = line.substring(fileIgnoreIdx + "judges-file-ignore".length);
        const fileTrimmedRest = fileRest.trimStart();
        if (fileTrimmedRest.length < fileRest.length && fileTrimmedRest.length > 0) {
          let rawFileContent = fileTrimmedRest;
          if (rawFileContent.trimEnd().endsWith("*/")) {
            rawFileContent = rawFileContent.replace("*/", "").trimEnd();
          }
          const fileDashSplit = rawFileContent.split(" -- ");
          const ruleIds = fileDashSplit[0].split(/[, \t]+/).filter(Boolean);
          const reason = fileDashSplit[1]?.trim() || undefined;
          for (const rawId of ruleIds) {
            const ruleId = rawId === "*" ? "*" : rawId.toUpperCase();
            globalSuppressed.push({ ruleId, kind: "file", commentLine: lineNum, reason });
          }
        }
      }
    }
  }

  return { lineSuppressed, globalSuppressed };
}

/**
 * Check whether a rule ID matches a set of suppression directives.
 * Supports exact match, wildcard "*", and prefix wildcards like "AUTH-*".
 */
export function matchesSuppression(
  ruleUpper: string,
  directives: SuppressionDirective[],
): SuppressionDirective | undefined {
  for (const d of directives) {
    if (d.ruleId === "*" || d.ruleId === ruleUpper) {
      return d;
    }
    if (d.ruleId.endsWith("-*") && ruleUpper.startsWith(d.ruleId.slice(0, -1))) {
      return d;
    }
  }
  return undefined;
}

/**
 * Apply inline suppression comments and return both filtered findings
 * and a full audit trail of what was suppressed.
 */
export function applyInlineSuppressionsWithAudit(findings: Finding[], code: string): SuppressionResult {
  const { lineSuppressed, globalSuppressed } = parseInlineSuppressions(code);

  if (lineSuppressed.size === 0 && globalSuppressed.length === 0) {
    return { findings, suppressed: [] };
  }

  const kept: Finding[] = [];
  const suppressed: SuppressionRecord[] = [];

  for (const f of findings) {
    const ruleUpper = f.ruleId.toUpperCase();

    // Check file-level suppression
    const globalMatch = matchesSuppression(ruleUpper, globalSuppressed);
    if (globalMatch) {
      suppressed.push({
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        kind: globalMatch.kind,
        commentLine: globalMatch.commentLine,
        findingLines: f.lineNumbers,
        reason: globalMatch.reason,
      });
      continue;
    }

    // Check line-level suppressions
    let wasLineSuppressed = false;
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      for (const lineNum of f.lineNumbers) {
        const directives = lineSuppressed.get(lineNum);
        if (directives) {
          const lineMatch = matchesSuppression(ruleUpper, directives);
          if (lineMatch) {
            suppressed.push({
              ruleId: f.ruleId,
              severity: f.severity,
              title: f.title,
              kind: lineMatch.kind,
              commentLine: lineMatch.commentLine,
              findingLines: f.lineNumbers,
              reason: lineMatch.reason,
            });
            wasLineSuppressed = true;
            break;
          }
        }
      }
    }

    if (!wasLineSuppressed) {
      kept.push(f);
    }
  }

  return { findings: kept, suppressed };
}

/**
 * Filter findings based on inline suppression comments in the source code.
 * Drop-in backward-compatible wrapper around `applyInlineSuppressionsWithAudit`.
 */
export function applyInlineSuppressions(findings: Finding[], code: string): Finding[] {
  return applyInlineSuppressionsWithAudit(findings, code).findings;
}
