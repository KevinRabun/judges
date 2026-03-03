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
const PROD_ONLY_RULE_PREFIXES: string[] = [
  "RATE-", // rate limiting not expected in tests
  "SCALE-", // scalability not expected in tests
  "OBS-", // observability not expected in tests
  "CLOUD-", // cloud readiness not expected in tests
  "SOV-", // data sovereignty not relevant to tests
  "DOC-", // documentation quality not relevant in tests
  "MAINT-", // maintainability patterns not relevant in tests
  "COMP-", // compliance checks not relevant in tests
  "CICD-", // CI/CD infrastructure not relevant in tests
  "COST-", // cost optimization not relevant in tests
  "SWDEV-", // software dev practices not relevant in tests
  "AGENT-", // agent instructions not relevant to test code
  "AICS-", // AI code safety not relevant to test code
  "PERF-", // performance optimization noise in test code
  "PORTA-", // portability not relevant to test code
  "UX-", // user experience not relevant to test code
  "I18N-", // internationalization not relevant to test code
  "A11Y-", // accessibility not relevant to test code
  "LOGPRIV-", // logging privacy not relevant to test code
  "CACHE-", // caching strategy not relevant to test code
  "DATA-", // data security patterns noise in test assertions
  "API-", // API design not relevant in test code
];

/**
 * Rule IDs that target executable code and should NOT fire on configuration
 * or data files (YAML, JSON, TOML, INI, .env, etc.). These files contain
 * no executable logic, so code-quality rules produce false positives.
 */
const CODE_ONLY_RULE_PREFIXES = [
  "CYBER-", // injection, XSS — no executable code in config
  "AUTH-", // authentication flow — no executable code in config
  "PERF-", // runtime performance — no runtime in config
  "RATE-", // rate limiting — no middleware in config
  "CACHE-", // caching strategy — no runtime in config
  "ERR-", // error handling — no try/catch in config
  "UX-", // user experience — not applicable to config
  "A11Y-", // accessibility — not applicable to config
  "I18N-", // internationalization — not applicable to config
  "DB-", // database queries — no SQL in config
  "CONC-", // concurrency — no threads in config
  "SOV-", // sovereignty — declarative config, no data flow
  "MAINT-", // maintainability — not applicable to data files
  "SWDEV-", // software practices — not applicable to data files
  "DOC-", // documentation — not applicable to data files
  "TEST-", // testing — not applicable to data files
  "SCALE-", // scalability — no runtime in config
  "CICD-", // CI/CD infra — not a code concern on data files
  "COST-", // cost — not applicable to data files
  "COMP-", // compliance — not code-level concern on data files
  "CLOUD-", // cloud readiness — not applicable to data files
  "PORTA-", // portability — not applicable to data files
  "DATA-", // data security — no data flow in config
  "OBS-", // observability — no runtime in config
  "AICS-", // AI code safety — no executable code in config
  "REL-", // reliability — no runtime in config
  "LOGPRIV-", // logging privacy — no logging in config
  "API-", // API design — no endpoints in config
  "DEPS-", // dependency health — package files handled separately
  "AGENT-", // agent instructions — not applicable to data files
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
    // "age" in cacheAge, maxAge, ttlAge, cache-age log, etc.
    trigger: /\bage\b/i,
    identifierContext:
      /(?:cache|max|ttl|min|avg|token|cookie|session|expir|stale|fresh)\s*[-_]?\s*age|age\s*[-_]?\s*(?:out|limit|check|seconds|minutes|hours|days|ms|header)|\bcache[_-]age\b|\bmax[_-]age\b/i,
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
  {
    // json.dumps / JSON.stringify flagged as data export/transfer by SOV judges
    findingPattern: /data\s*(?:export|transfer|egress)|export\s*path|SOV-003/i,
    safeContext: /json\.dumps\s*\(|JSON\.stringify\s*\(|json\.dump\s*\(/i,
  },
  {
    // Connection string in env var fallback (os.environ.get / process.env)
    findingPattern: /hardcoded.*(?:connection|database|db|redis|mongo|postgres|mysql)|connection.*string.*code|DB-001/i,
    safeContext:
      /os\.environ\.get\s*\(|os\.getenv\s*\(|process\.env\.|System\.getenv\s*\(|Environment\.GetEnvironmentVariable\s*\(/i,
  },
  {
    // Justified type: ignore / noqa suppression comments — not reckless suppression
    findingPattern: /suppress|type.*ignore|noqa|lint.*disabl|SWDEV-001|CICD-003/i,
    safeContext:
      /(?:#\s*type:\s*ignore|#\s*noqa|(?:\/\/|#)\s*eslint-disable).*(?:--|—|because|reason|\bfor\b|\bdue\b|\bruntyped\b|\bstubs\b|\bno\s+stubs)/i,
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
export function filterFalsePositiveHeuristics(
  findings: Finding[],
  code: string,
  language: string,
  filePath?: string,
): FpFilterResult {
  if (findings.length === 0) {
    return { filtered: [], removed: [] };
  }

  const lines = code.split("\n");
  const isIaC = isIaCTemplate(code);
  const fileCategory = classifyFile(code, language, filePath);

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

  // ── 2b. Config/data file gating: code-quality rules on YAML/JSON/config ──
  if (fileCategory === "config") {
    const isCodeOnly = CODE_ONLY_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isCodeOnly) {
      return `Code-quality rule ${finding.ruleId} does not apply to configuration/data files.`;
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

  // ── 8. Absence-based finding with low confidence ──
  // Absence-based findings with low confidence are likely FPs in partial reviews.
  // The upstream pipeline caps absence-based confidence at 0.6, so values near
  // or below 0.45 indicate very weak signal.
  if (finding.isAbsenceBased && finding.confidence !== undefined && finding.confidence < 0.45) {
    return "Absence-based finding with low confidence — likely a false positive in partial code review.";
  }

  // ── 9. Web-only rules on non-web code ──
  // Accessibility, UX, and i18n rendering rules are only meaningful on files
  // that contain web-facing patterns (HTML, JSX, routes, templates, CSS).
  const WEB_ONLY_PREFIXES = ["A11Y-", "UX-", "I18N-"];
  const isWebOnly = WEB_ONLY_PREFIXES.some((p) => finding.ruleId.startsWith(p));
  if (isWebOnly) {
    const hasWebPatterns =
      /<\w+[\s>]|className=|style=|href=|jsx|tsx|\.html|\.css|render\s*\(|dangerouslySetInnerHTML|innerHTML|document\.|window\.|querySelector|getElementById/i.test(
        lines.join("\n"),
      );
    if (!hasWebPatterns) {
      return `Web-only rule ${finding.ruleId} does not apply — no HTML, JSX, or DOM patterns detected.`;
    }
  }

  // ── 10. Findings targeting empty / whitespace-only lines ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const allBlank = finding.lineNumbers.every((ln) => {
      const line = lines[ln - 1];
      return line !== undefined && line.trim().length === 0;
    });
    if (allBlank) {
      return "All flagged lines are empty or whitespace — no code to evaluate.";
    }
  }

  // ── 11. Absence-based findings on trivially small files ──
  // Files under 10 substantive lines are usually stubs, barrel exports, or
  // minimal utilities where absence-based rules generate noise.
  if (finding.isAbsenceBased) {
    const substantiveLines = lines.filter((l) => {
      const t = l.trim();
      return t.length > 0 && !/^\s*(?:\/\/|\/\*|\*|#|$)/.test(t);
    }).length;
    if (substantiveLines < 10) {
      return "Absence-based finding on trivially small file — likely a false positive.";
    }
  }

  // ── 12. Distributed lock presence suppresses local-lock scaling findings ──
  // SCALE-001 flags local file/process locks, but if the same file implements
  // distributed locking (Redlock, Redis lock, etcd, Consul, ZooKeeper), the
  // local lock is a documented single-instance fallback, not a scaling issue.
  if (
    /^SCALE-/.test(finding.ruleId) &&
    /local.*lock|process.*lock|file.*lock|asyncio\.Lock|threading\.Lock/i.test(finding.title)
  ) {
    const fullCode = lines.join("\n");
    const hasDistributedLock =
      /\bredlock\b|\bredis.*lock\b|\bdistributed.*lock\b|\betcd\b.*lock|\bconsul\b.*lock|\bzookeeper\b.*lock|\bLock\s*\(.*redis/i.test(
        fullCode,
      );
    if (hasDistributedLock) {
      return "Local lock is a fallback — distributed locking (Redlock/Redis) is implemented in the same module.";
    }
  }

  // ── 13. Retry/backoff/fallback suppresses resilience-pattern-absence findings ──
  // SOV-001 and REL- rules flag missing circuit breakers, but if the code
  // implements retry with backoff and/or a multi-tier fallback chain, it has
  // equivalent or better resilience than a simple circuit breaker.
  if (
    /^(?:SOV-001|REL-)/.test(finding.ruleId) &&
    /circuit.?breaker|resilience|without.*(?:retry|fallback)/i.test(finding.title)
  ) {
    const fullCode = lines.join("\n");
    const hasRetryPattern =
      /\bretry\b.*\b(?:backoff|exponential|delay)\b|\bbackoff\b.*\bretry\b|\btenacity\b|\bretrying\b|@retry\b|with_retry\b|fetch.*retry|retry.*fetch/i.test(
        fullCode,
      );
    const hasFallbackChain =
      /\bfallback\b.*\b(?:cache|bundled|default|local|offline)\b|(?:cache|bundled|default|local|offline)\b.*\bfallback\b/i.test(
        fullCode,
      );
    if (hasRetryPattern || hasFallbackChain) {
      return "Retry/backoff and/or fallback chain detected — equivalent resilience pattern is implemented.";
    }
  }

  // ── 14. Constant definitions suppress I18N hardcoded-string findings ──
  // I18N-001 flags hardcoded strings, but constant definitions like
  // _F_TITLE = 'title' are JSON field-name keys, not user-facing text.
  if (/^I18N-/.test(finding.ruleId) && /hardcoded.*string/i.test(finding.title)) {
    if (finding.lineNumbers && finding.lineNumbers.length > 0) {
      const allConstants = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        const trimmed = line.trim();
        // Python/JS/TS constant definitions: ALL_CAPS_NAME = "value" or const NAME = "value"
        return (
          /^[A-Z_][A-Z_0-9]*\s*=\s*["']/.test(trimmed) ||
          /^(?:const|final|static\s+final)\s+\w+\s*=\s*["']/.test(trimmed) ||
          /^_[A-Z_][A-Z_0-9]*\s*=\s*["']/.test(trimmed)
        );
      });
      if (allConstants) {
        return "Flagged strings are constant definitions (field-name keys), not user-facing text.";
      }
    }
  }

  // ── 15. Bounded-dataset tree traversal suppresses O(n²) nested-loop findings ──
  // PERF-002/COST-001 flag nested loops as O(n²), but tree traversals
  // (chapters → sections → articles) iterate each item once — O(n total).
  if (/^(?:PERF|COST)-/.test(finding.ruleId) && /nested.*loop|O\(n[²2]\)|quadratic/i.test(finding.title)) {
    const fullCode = lines.join("\n");
    // Detect documented bounded datasets or tree-traversal patterns
    const hasBoundedDatasetDoc =
      /\bbounded\b.*\b(?:dataset|corpus|data|size)\b|\bfixed[- ]size\b|\bO\(n\)\b|\bO\(total_/i.test(fullCode);
    const hasTreeTraversal = /\bchapter|\bsection|\barticle|\bnode|\bchild(?:ren)?|\btree|\btravers/i.test(fullCode);
    if (hasBoundedDatasetDoc || hasTreeTraversal) {
      return "Nested iteration is a tree traversal over a bounded dataset — total work is O(n), not O(n²).";
    }
  }

  // ── 16. Read-only content fetch suppresses cross-border data egress findings ──
  // SOV-002 flags external API calls as cross-border data egress, but read-only
  // fetches of public regulatory/reference content are not personal data transfers.
  if (/^SOV-002/.test(finding.ruleId) && /cross.?border|data.*egress|jurisdiction/i.test(finding.title)) {
    const fullCode = lines.join("\n");
    const isReadOnlyFetch =
      /\bfetch\b.*\b(?:regulation|reference|content|static|public|gdpr|law)\b|\breadonly\b|\bread[_-]only\b/i.test(
        fullCode,
      );
    const noPersonalData = !/\buser[_-]?data\b|\bpersonal[_-]?data\b|\bpii\b|\bprofile\b.*\bdata\b/i.test(fullCode);
    if (isReadOnlyFetch && noPersonalData) {
      return "Read-only fetch of public/regulatory content — no personal data egress detected.";
    }
  }

  // ── 17. Cache-age / TTL context suppresses compliance age-verification findings ──
  // COMP-001 flags "age" as age-verification concern, but in cache/TTL contexts
  // (cache_age, max_age, stale), "age" refers to data freshness, not user age.
  if (/^COMP-/.test(finding.ruleId) && /\bage\b/i.test(finding.title)) {
    const fullCode = lines.join("\n");
    const isCacheAgeContext =
      /\bcache[_-]?age\b|\bmax[_-]?age\b|\bttl\b.*\bage\b|\bstale\b.*\bage\b|\bage\b.*\bseconds\b|\bage\b.*\bexpir/i.test(
        fullCode,
      );
    const noUserAgeContext = !/\bdate[_-]?of[_-]?birth\b|\bdob\b|\bminor\b|\bparental\b|\bage[_-]?verif/i.test(
      fullCode,
    );
    if (isCacheAgeContext && noUserAgeContext) {
      return "Term 'age' appears in cache/TTL context (data freshness), not user age verification.";
    }
  }

  return null;
}
