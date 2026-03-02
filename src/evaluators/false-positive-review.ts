// ─── Deterministic False-Positive Heuristic Filter ──────────────────────────
// Post-processing step that reviews aggregated findings from all judges and
// removes those matching known false-positive patterns. This runs in the
// evaluateWithTribunal pipeline after per-judge evaluation and before final
// scoring, complementing the agentic FP review in the deep-review section.
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding } from "../types.js";
import { isCommentLine, isStringLiteralLine, isIaCTemplate, classifyFile } from "./shared.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FpFilterResult {
  /** Findings that survived the heuristic filter */
  filtered: Finding[];
  /** Findings removed as likely false positives */
  removed: Finding[];
}

// ─── Heuristic Rules ─────────────────────────────────────────────────────────

/**
 * Rule IDs that target application-runtime concerns and should NOT fire
 * on Infrastructure-as-Code templates (Terraform, CloudFormation, Bicep,
 * Ansible, Kubernetes YAML, Dockerfiles, Helm charts, etc.).
 */
const APP_ONLY_RULE_PREFIXES = [
  "CYBER-", // injection, XSS, CSRF — not relevant to declarative IaC
  "AUTH-", // authentication flow — not relevant to IaC
  "PERF-", // runtime performance — not relevant to IaC
  "RATE-", // rate limiting — not relevant to IaC
  "CACHE-", // caching strategy — not relevant to IaC
  "ERR-", // error handling — not relevant to IaC
  "UX-", // user experience — not relevant to IaC
  "A11Y-", // accessibility — not relevant to IaC
  "I18N-", // internationalization — not relevant to IaC
  "DB-", // database queries — not relevant to IaC
  "CONC-", // concurrency — not relevant to IaC
];

/**
 * Rule prefixes that target production-runtime concerns and should NOT fire
 * on test files (test_*, *.test.ts, spec/**, etc.).
 */
const PROD_ONLY_RULE_PREFIXES = [
  "RATE-", // rate limiting not expected in tests
  "SCALE-", // scalability not expected in tests
  "OBS-", // observability not expected in tests
  "CLOUD-", // cloud readiness not expected in tests
];

/**
 * Keywords commonly appearing in identifiers that collide with security
 * terms. Maps the triggering keyword to identifier patterns that neutralise
 * the match. If the finding's target line matches the identifier pattern,
 * the finding is a likely FP.
 */
const KEYWORD_IDENTIFIER_PATTERNS: Array<{
  /** Regex that detects the FP-prone keyword in a finding title or description */
  trigger: RegExp;
  /** Regex matching identifier contexts where the keyword is part of a name */
  identifierContext: RegExp;
}> = [
  {
    // "age" in cacheAge, maxAge, ttlAge, etc.
    trigger: /\bage\b/i,
    identifierContext: /(?:cache|max|ttl|min|avg|token|cookie|session|expir)\s*age|age\s*(?:out|limit|check)/i,
  },
  {
    // "delete" in deleteButton, onDelete, handleDelete, isDeleted
    trigger: /\bdelete\b/i,
    identifierContext:
      /(?:on|handle|is|can|should|will|did|set|get|btn|button|icon|modal|dialog|confirm)\s*delete|delete\s*(?:button|handler|modal|confirm|dialog|flag|status|action|event|click|icon)/i,
  },
  {
    // "exec" in execMode, execPath, execOptions, childExec
    trigger: /\bexec\b/i,
    identifierContext: /exec\s*(?:mode|path|option|config|result|status|type|name|id)|(?:child|fork|spawn)\s*exec/i,
  },
  {
    // "password" in passwordField, passwordInput, showPassword, passwordStrength
    trigger: /\bpassword\b/i,
    identifierContext:
      /password\s*(?:field|input|label|placeholder|strength|policy|rule|validator|visible|show|hide|toggle|confirm|match|min|max|length|reset|change|update|hash)/i,
  },
  {
    // "secret" in secretName, secretArn, secretRef, secretVersion
    trigger: /\bsecret\b/i,
    identifierContext:
      /secret\s*(?:name|arn|ref|version|id|key|path|manager|store|engine|backend|rotation|value)|(?:aws|azure|gcp|vault|k8s|kube)\s*secret/i,
  },
  {
    // "token" in tokenExpiry, refreshToken, tokenType identifier contexts
    trigger: /\btoken\b/i,
    identifierContext:
      /token\s*(?:type|name|expir|ttl|refresh|revoke|validate|verify|field|input|header|prefix|format|length)|(?:access|refresh|bearer|csrf|api|auth|jwt|session)\s*token/i,
  },
  {
    // "global" in Python's `global` keyword used for variable declarations
    trigger: /\bglobal\b.*\bstate\b|\bstate\b.*\bglobal\b/i,
    identifierContext: /^\s*global\s+\w+/,
  },
];

/**
 * Standard-library / framework calls that are safe but trigger pattern
 * matchers. Each entry maps a false-alarm pattern to the code context
 * that confirms it is a safe idiom.
 */
const SAFE_IDIOM_PATTERNS: Array<{
  /** Regex matching the finding title / ruleId that fires */
  findingPattern: RegExp;
  /** Regex matching the source line proving it's a safe idiom */
  safeContext: RegExp;
}> = [
  {
    // dict.get() flagged as HTTP fetch
    findingPattern: /unvalidated.*fetch|http.*get|unsafe.*request/i,
    safeContext: /\.get\s*\(\s*["'`]\w+["'`]\s*[,)]/,
  },
  {
    // json.dumps / JSON.stringify flagged as data export/leak
    findingPattern: /data\s*(?:export|exfiltrat|leak)/i,
    safeContext: /json\.dumps\s*\(|JSON\.stringify\s*\(/i,
  },
  {
    // os.path.join / path.join flagged as path traversal when inputs are literals
    findingPattern: /path\s*travers/i,
    safeContext: /(?:os\.path\.join|path\.join|Path\.Combine)\s*\(\s*["'`]/,
  },
];

// ─── Core Filter Function ───────────────────────────────────────────────────

/**
 * Apply deterministic heuristics to remove likely false positives from
 * an aggregated set of findings. This is called in the tribunal pipeline
 * after all judges have run.
 *
 * The function is conservative — it only removes findings that match
 * well-established FP patterns. When in doubt, it keeps the finding.
 *
 * @param findings – All findings from all judges (post-dedup)
 * @param code     – The source code that was analyzed
 * @param language – The programming language
 * @returns Filtered findings and removed findings
 */
export function filterFalsePositiveHeuristics(findings: Finding[], code: string, language: string): FpFilterResult {
  if (findings.length === 0) {
    return { filtered: [], removed: [] };
  }

  const lines = code.split("\n");
  const isIaC = isIaCTemplate(code);
  const fileCategory = classifyFile(code, language);

  const filtered: Finding[] = [];
  const removed: Finding[] = [];

  for (const finding of findings) {
    const reason = getFpReason(finding, lines, isIaC, fileCategory);
    if (reason) {
      removed.push({ ...finding, description: `${finding.description}\n\n**FP Heuristic:** ${reason}` });
    } else {
      filtered.push(finding);
    }
  }

  return { filtered, removed };
}

// ─── Individual Heuristic Checks ─────────────────────────────────────────────

/**
 * Returns a short explanation if the finding is a likely FP, or null if it
 * should be kept.
 */
function getFpReason(finding: Finding, lines: string[], isIaC: boolean, fileCategory: string): string | null {
  // ── 1. IaC template gating: app-only rules on IaC files ──
  if (isIaC) {
    const isAppOnly = APP_ONLY_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isAppOnly) {
      return `Application-runtime rule ${finding.ruleId} does not apply to Infrastructure-as-Code templates.`;
    }
  }

  // ── 2. Test file gating: prod-only rules on test files ──
  if (fileCategory === "test" || fileCategory === "config-test") {
    const isProdOnly = PROD_ONLY_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isProdOnly) {
      return `Production-only rule ${finding.ruleId} does not apply to test files.`;
    }
  }

  // ── 3. All target lines are comments ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const allComments = finding.lineNumbers.every((ln) => {
      const line = lines[ln - 1];
      return line !== undefined && isCommentLine(line);
    });
    if (allComments) {
      return "All flagged lines are comments — the pattern appears in documentation, not executable code.";
    }
  }

  // ── 4. All target lines are string literals ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const allStrings = finding.lineNumbers.every((ln) => {
      const line = lines[ln - 1];
      return line !== undefined && isStringLiteralLine(line);
    });
    if (allStrings) {
      return "All flagged lines are string literal values — the keyword appears in data, not code.";
    }
  }

  // ── 5. Import / type-only line ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const allImportsOrTypes = finding.lineNumbers.every((ln) => {
      const line = lines[ln - 1];
      if (!line) return false;
      const trimmed = line.trim();
      return (
        /^import\s/.test(trimmed) ||
        /^from\s/.test(trimmed) ||
        /^export\s+(?:type|interface|abstract)\s/.test(trimmed) ||
        /^(?:type|interface)\s+\w+/.test(trimmed) ||
        /^using\s/.test(trimmed)
      );
    });
    if (allImportsOrTypes) {
      return "Finding targets import/type declarations — no runtime behavior to evaluate.";
    }
  }

  // ── 6. Keyword-in-identifier collision ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc = `${finding.title} ${finding.description}`;
    for (const { trigger, identifierContext } of KEYWORD_IDENTIFIER_PATTERNS) {
      if (trigger.test(titleAndDesc)) {
        const anyLineIsIdentifier = finding.lineNumbers.some((ln) => {
          const line = lines[ln - 1];
          return line !== undefined && identifierContext.test(line);
        });
        if (anyLineIsIdentifier) {
          return "Keyword appears as part of an identifier name, not as a dangerous operation.";
        }
      }
    }
  }

  // ── 7. Safe standard-library idiom ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    for (const { findingPattern, safeContext } of SAFE_IDIOM_PATTERNS) {
      if (findingPattern.test(finding.title) || findingPattern.test(finding.ruleId)) {
        const hasSafeCtx = finding.lineNumbers.some((ln) => {
          const line = lines[ln - 1];
          return line !== undefined && safeContext.test(line);
        });
        if (hasSafeCtx) {
          return "Flagged pattern is a safe standard-library/framework idiom, not a vulnerability.";
        }
      }
    }
  }

  // ── 8. Absence-based finding in single fragment ──
  // Very low confidence absence-based findings are likely FPs in partial reviews
  if (finding.isAbsenceBased && finding.confidence !== undefined && finding.confidence < 0.35) {
    return "Absence-based finding with very low confidence — likely a false positive in partial code review.";
  }

  return null;
}
