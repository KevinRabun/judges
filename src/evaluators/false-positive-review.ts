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
  "REL-", // reliability patterns not needed in tests
  "CONC-", // concurrency patterns not needed in tests
  "FW-", // framework rules triggered by test fixtures
  "ERR-", // error handling patterns differ in test code
  "STRUCT-", // structural rules less meaningful in test files
  "DB-", // database rules triggered by test fixtures
  "COMPAT-", // backwards compatibility not relevant in tests
  "CFG-", // configuration management not relevant in tests
  "ETHICS-", // ethics not relevant to test code
  "DEPS-", // dependency health triggered by test fixtures
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
 * Rule IDs targeting application-runtime / cloud-service concerns that
 * do NOT apply to code analysis tools (linters, security scanners,
 * judge definitions, evaluators, formatters, AST analyzers).
 *
 * Analysis tools necessarily contain the very patterns they detect
 * (regex patterns for auth, data export, PII, etc.) and are single-
 * process developer utilities, not production services.
 */
const ANALYSIS_TOOL_INAPPLICABLE_RULE_PREFIXES = [
  "SOV-", // data sovereignty — tool doesn't process user data
  "COMP-", // compliance — tool doesn't handle regulated data
  "CYBER-", // web security — tool has no endpoints
  "AUTH-", // authentication — tool has no auth system
  "DATA-", // data security — tool analyzes code, doesn't store data
  "SEC-", // security — detection patterns contain the keywords they detect, not real vulnerabilities
  "HALLU-", // hallucination — detection lists contain hallucinated API names by design
  "SCALE-", // scalability — single-process tool
  "CLOUD-", // cloud readiness — not a cloud service
  "RATE-", // rate limiting — not a service
  "DB-", // database — no database
  "API-", // API design — not an API service
  "A11Y-", // accessibility — not a UI
  "I18N-", // internationalization — not user-facing
  "UX-", // user experience — not a UI
  "OBS-", // observability — not a production service
  "LOGPRIV-", // logging privacy — no user data
  "AGENT-", // agent instructions — not an AI agent
  "AICS-", // AI code safety — analyzing code, not generating it
  "FW-", // framework rules — analysis tool, not framework consumer
  "CACHE-", // caching strategy — not a service
  "ETHICS-", // ethics/bias — tool doesn't make decisions about people
  "CONC-", // concurrency — single-threaded analysis
  "TEST-", // testing rules — analysis code isn't test code
  "CICD-", // CI/CD infrastructure — not applicable
  "DEPS-", // dependency health — not applicable to analysis patterns
  "COMPAT-", // backwards compat — internal tool
  "CFG-", // config management — analysis tool
  "REL-", // reliability patterns — not a service
];

/**
 * Rule IDs targeting cloud-service / web-server concerns that do NOT apply
 * to VS Code extensions (desktop plugins running in the editor process).
 */
const VSCODE_EXT_INAPPLICABLE_RULE_PREFIXES = [
  "SOV-", // data sovereignty — desktop app, no cross-border data
  "COMP-", // compliance — extension doesn't handle regulated data
  "SCALE-", // scalability — desktop extension
  "CLOUD-", // cloud readiness — desktop extension
  "RATE-", // rate limiting — desktop extension
  "DB-", // database — extensions use VS Code storage API
  "A11Y-", // accessibility — VS Code handles accessibility
  "I18N-", // internationalization — VS Code handles i18n
  "AGENT-", // agent instructions — not an AI agent
  "CACHE-", // caching — desktop extension
  "API-", // API design — extension API, not REST API
  "OBS-", // observability — desktop extension
  "CONC-", // concurrency — VS Code extension model handles this
  "ETHICS-", // ethics/bias — tool extension, not decision system
  "AICS-", // AI code safety — not generating code
  "CICD-", // CI/CD infrastructure — not applicable
  "COST-", // cost optimization — desktop extension
  "DEPS-", // dependency health — VS Code handles deps
  "TEST-", // testing patterns — not test code
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
    // "delete" in deleteButton, on_delete, handleDelete, isDeleted, softDelete, batchDelete, etc.
    trigger: /\bdelete\b/i,
    identifierContext:
      /(?:on|handle|is|can|should|will|did|set|get|btn|button|icon|modal|dialog|confirm|soft|hard|mark|pre|post|async|schedule)[-_]?delete|delete[-_]?(?:button|handler|modal|confirm|dialog|flag|status|action|event|click|icon|request|response|result|scheduled|pending|mark)/i,
  },
  {
    // "exec" in execMode, exec_path, execOptions, child_exec, asyncExec, remoteExec, etc.
    trigger: /\bexec\b/i,
    identifierContext:
      /exec[-_]?(?:mode|path|option|config|result|status|type|name|id|command|args|timeout|callback|handler|sync|async|promise|queue|batch|parallel|plan|strategy|context|env)|(?:child|fork|spawn|pre|post|async|remote|batch|parallel|deferred|safe|sandbox|shell|docker|container)[-_]?exec/i,
  },
  {
    // "password" in passwordField, password_input, showPassword, confirm_password, setPassword, etc.
    trigger: /\bpassword\b/i,
    identifierContext:
      /password[-_]?(?:field|input|label|placeholder|strength|policy|rule|validator|visible|show|hide|toggle|confirm|match|min|max|length|reset|change|update|hash|column|prop|param|check|verify|form|dialog|modal|error|expired|required|schema|type|view|prompt|attempts|manager|service|handler|helper|criteria|complexity|requirements|expiry|expiration|generator|display|store|clear|protect|encode|decode|constraint|icon|text|mask|regex|pattern|hint|enabled|disabled|protected)|(?:confirm|verify|validate|check|reset|new|old|current|previous|hashed|encrypted|forgot|enter|missing|invalid|has|is|no|require|set|get|save|store|update|change|manage|generate|submit|show|hide|reveal|create|remove|clear|compare|match|parse|decode|encode)[-_]?password/i,
  },
  {
    // "secret" in secretName, secret_arn, secretRef, client_secret, getSecret, etc.
    trigger: /\bsecret\b/i,
    identifierContext:
      /secret[-_]?(?:name|arn|ref|version|id|key|path|manager|store|engine|backend|rotation|value|error|invalid|missing|config|schema|type|provider|holder|service|handler|helper|resolver|loader|fetcher|reader|creator|generator|deleter|updater|sync|cache)|(?:aws|azure|gcp|vault|k8s|kube|client|app|has|is|no|missing|invalid|create|generate|list|get|set|read|fetch|load|resolve|lookup|delete|remove|update|clear|store|save|manage|rotate|renew|refresh|put|find|retrieve)[-_]?secret/i,
  },
  {
    // "token" in tokenExpiry, token_type, refreshToken, reset_token, getToken, etc.
    trigger: /\btoken\b/i,
    identifierContext:
      /token[-_]?(?:type|name|expir|ttl|refresh|revoke|validate|verify|field|input|header|prefix|format|length|bucket|count|limit|usage|error|invalid|missing|source|response|config|schema|manager|service|handler|provider|factory|builder|helper|store|cache|parser|encoder|decoder|generator|creator|issuer|resolver|refresher|interceptor)|(?:access|refresh|bearer|csrf|api|auth|jwt|session|reset|verification|missing|invalid|expired|has|is|no|decode|parse|get|set|create|generate|fetch|store|save|delete|clear|invalidate|blacklist|whitelist|validate|verify|revoke|renew|rotate|read|load|find|retrieve|extract|inspect|encode)[-_]?token/i,
  },
  {
    // "global" in Python's `global` keyword used for variable declarations
    trigger: /\bglobal\b.*\bstate\b|\bstate\b.*\bglobal\b/i,
    identifierContext: /^\s*global\s+\w+/,
  },
  {
    // "key" in apiKeyHeader, primaryKey, foreignKey, keyName, keyPath, key_vault
    // Note: api/encryption/signing/public/private prefixes require a suffix after "key"
    // (e.g. apiKeyHeader ✓, apiKey ✗) because "apiKey" alone often holds an actual key value.
    trigger: /\bkey\b/i,
    identifierContext:
      /(?:primary|foreign|partition|sort|composite|cache)\s*[-_]?\s*key|(?:api|encryption|signing|public|private)\s*[-_]?\s*key\w+|key\s*[-_]?\s*(?:name|path|id|vault|ring|store|pair|size|length|spec|ref|alias|header|prefix|column|field|index)|\bkey[_-]vault\b|\bKeyVault\b/i,
  },
  {
    // "hash" in fileHash, contentHash, checksumHash, hashCode — non-crypto contexts
    trigger: /\bhash\b/i,
    identifierContext:
      /(?:file|content|checksum|etag|commit|git|fingerprint|bucket|consistent)\s*[-_]?\s*hash|hash\s*[-_]?\s*(?:code|map|set|table|ring|key|value|function|sum|digest|string|name|id)|\bhashCode\b|\bhashMap\b|\bhashSet\b|\bgetHash\b|\bcomputeHash\b/i,
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
  /** Optional: if this matches the finding title/ruleId, do NOT apply this safe idiom */
  excludePattern?: RegExp;
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
  {
    // logger.error / log.warn / console.error containing security keywords in the message string
    // Exclude findings that are specifically ABOUT credential logging (LOGPRIV, LOG-*)
    findingPattern: /password|secret|token|credential|hardcoded/i,
    safeContext: /(?:logger|log|console|logging)\s*\.\s*(?:error|warn|warning|info|debug|critical|fatal)\s*\(/i,
    excludePattern: /\blog(?:ged|ging|s|file)?\b|LOGPRIV|^LOG-/i,
  },
  {
    // HTTP routing method app.delete() / router.delete() — "delete" is an HTTP verb, not data destruction
    findingPattern: /\bdelete\b.*(?:data|destruct|unprotect|unauthori)|dangerous.*delete/i,
    safeContext:
      /(?:app|router|server|express|fastify|hapi|koa)\s*\.\s*delete\s*\(\s*["'`/]|@(?:app|router)\s*\.\s*delete\s*\(/i,
  },
  {
    // Environment variable / config-lookup access for hardcoded credential findings
    // Broader than the DB-001 env-var pattern above — covers all credential keyword findings
    findingPattern: /hardcoded.*(?:password|secret|token|credential|key|api)|DATA-00|AUTH-00/i,
    safeContext:
      /(?:process\.env\b|os\.environ|os\.getenv\s*\(|System\.getenv\s*\(|Environment\.GetEnvironmentVariable\s*\(|env::var\s*\()/i,
  },
  {
    // Vault / secrets-manager SDK calls — credentials are fetched at runtime, not hardcoded
    findingPattern: /hardcoded.*(?:password|secret|token|credential|key)|DATA-00|AUTH-00|DSEC-/i,
    safeContext:
      /(?:vault|secretsmanager|SecretClient|KeyVaultSecret|ssm|parameterStore|keyring|credentialManager)\s*[.(]/i,
  },
  {
    // Hash/digest function calls — "password" or "secret" is being hashed, not stored in plaintext
    findingPattern: /plaintext|plain.?text|unencrypted|unhashed/i,
    safeContext:
      /(?:bcrypt|argon2|scrypt|pbkdf2|sha256|sha512|hashlib|crypto\.hash|passwordEncoder|hash_password|hashpw|createHash)\s*[.(]/i,
  },
  {
    // String concatenation / template literal for error or user-facing messages
    // Finding flags "password" keyword but it's in a UI label or validation message
    findingPattern: /hardcoded.*(?:password|secret|token|credential)|DSEC-/i,
    safeContext:
      /(?:placeholder|label|hint|title|message|msg|text|caption|tooltip|aria[_-]label)\s*[:=]\s*["'`].*\b(?:password|secret|token|credential)\b/i,
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
    const reason = getFpReason(finding, lines, isIaC, fileCategory, filePath);
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
function getFpReason(
  finding: Finding,
  lines: string[],
  isIaC: boolean,
  fileCategory: string,
  filePath?: string,
): string | null {
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

  // ── 2a. Analysis-tool test files: rules fire on code specimens ──
  // Test suites for code analysis tools necessarily embed template-literal
  // code samples in many languages. Pattern-based rules (TEST-*, SEC-*,
  // HALLU-*) inevitably match content inside those string specimens
  // rather than genuine issues in the test code itself.
  if (fileCategory === "test" && /^(?:TEST|SEC|HALLU)-/.test(finding.ruleId)) {
    const codeText = lines.join("\n");
    const isAnalysisToolTest =
      /\b(?:evaluateWith|scoreFindings|evaluateCode|filterFalsePositive|classifyFile|TribunalVerdict|JudgeDefinition|judgePanelEvaluate|evaluateWithTribunal)\b/.test(
        codeText,
      ) ||
      // Also detect tests for tool-routing, MCP tools, judge panels, etc.
      /\b(?:judges?\s*panel|tool[_-]?rout|mcp\s*tool|evaluate_code|analyze_code)\b/i.test(codeText);
    if (isAnalysisToolTest) {
      // Verify file is dominated by template literal code specimens
      const templateLiteralCount = (codeText.match(/`[^`]{50,}/g) || []).length;
      if (templateLiteralCount >= 3) {
        return `Rule ${finding.ruleId} triggered by patterns inside code specimens (template literal fixtures) in analysis-tool tests — not actual test code.`;
      }
    }
  }

  // ── 2b. Config/data file gating: code-quality rules on YAML/JSON/config ──
  if (fileCategory === "config") {
    const isCodeOnly = CODE_ONLY_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isCodeOnly) {
      return `Code-quality rule ${finding.ruleId} does not apply to configuration/data files.`;
    }
  }

  // ── 2c. Type-definition file gating: absence rules on pure type files ──
  // Pure type-definition files (interfaces, type aliases, enums) contain
  // no runtime logic. Absence-based findings like "missing error handling"
  // or "missing authentication" produce noise on these files.
  if (finding.isAbsenceBased && fileCategory === "types") {
    return "Absence-based rule does not apply to pure type-definition files — no runtime logic to evaluate.";
  }

  // ── 2d. Benchmark CLI files: SEC/HALLU on embedded code specimens ──
  // Benchmark files in the commands/ directory contain intentional
  // vulnerable-code snippets embedded as template literal strings. These
  // are test data, not real vulnerabilities.
  if (fileCategory === "cli" && filePath && /benchmark/i.test(filePath) && /^(?:SEC|HALLU)-/.test(finding.ruleId)) {
    const codeText = lines.join("\n");
    const templateLiteralCount = (codeText.match(/`[^`]{50,}/g) || []).length;
    if (templateLiteralCount >= 5) {
      return `Rule ${finding.ruleId} triggered by intentional code specimens in benchmark test data — not a real vulnerability.`;
    }
  }

  // ── 2e. CLI-tool file gating: server/cloud rules on CLI commands ──
  // CLI tools are short-lived processes that legitimately use process.exit(),
  // console.log for output, synchronous I/O, and in-memory data structures.
  // Scalability, observability infrastructure, structured logging, rate
  // limiting, and cloud-readiness rules are not applicable.
  if (fileCategory === "cli") {
    const CLI_INAPPLICABLE_RULE_PREFIXES = [
      "SCALE-", // CLI doesn't need horizontal scaling
      "RATE-", // CLI doesn't need rate limiting
      "CLOUD-", // CLI is not a cloud service
      "OBS-", // CLI doesn't need observability infrastructure
      "LOGPRIV-", // CLI console output is not production logging
      "A11Y-", // CLI is not a web UI
      "UX-", // CLI is not a web UI
      "I18N-", // CLI diagnostic counters don't need locale formatting
      "CACHE-", // CLI doesn't need caching strategy
      "SOV-", // CLI local tool, no data sovereignty concerns
      "COMP-", // CLI tool, no regulatory compliance concerns
      "AGENT-", // agent instructions not applicable to CLI
      "DATA-", // CLI tool doesn't handle sensitive data at rest
      "DB-", // CLI tool has no database concerns
      "API-", // CLI tool is not an API service
      "CYBER-", // CLI tool has no web endpoints
      "AUTH-", // CLI tool has no auth system
      "CONC-", // CLI is single-process short-lived
      "AICS-", // CLI tool is not generating AI code
      "ETHICS-", // CLI tool doesn't make decisions about people
      "FW-", // CLI tool is not a framework consumer
      "TEST-", // testing patterns not relevant to CLI commands
      "CICD-", // CI/CD infrastructure not applicable
      "DEPS-", // dependency health not applicable
      "COMPAT-", // backwards compatibility not applicable
      "CFG-", // config management patterns differ for CLI
      "REL-", // reliability patterns (circuit breakers) not needed in CLI
    ];
    const isCLIInapplicable = CLI_INAPPLICABLE_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isCLIInapplicable) {
      return `Rule ${finding.ruleId} does not apply to CLI tools — short-lived processes do not need cloud/server infrastructure.`;
    }

    // Suppress "abrupt process termination" findings — process.exit() is
    // the standard way for CLI tools to signal success/failure to the shell.
    const titleLower = finding.title.toLowerCase();
    if (
      titleLower.includes("process.exit") ||
      titleLower.includes("abrupt") ||
      titleLower.includes("hard process termination") ||
      (titleLower.includes("process") && titleLower.includes("termination"))
    ) {
      return "process.exit() is standard in CLI tools for reporting exit codes to the shell.";
    }

    // Suppress "console instead of structured logger" — console is the
    // correct output interface for CLI tools.
    if (
      titleLower.includes("console") &&
      (titleLower.includes("logger") || titleLower.includes("logging") || titleLower.includes("structured"))
    ) {
      return "Console output is the correct interface for CLI tools — structured logging is for services.";
    }

    // Suppress "unstructured logging" — same reasoning as above
    if (titleLower.includes("unstructured") && titleLower.includes("log")) {
      return "Console output is the correct interface for CLI tools — structured logging is for services.";
    }

    // Suppress "synchronous / blocking I/O" — CLI tools are single-threaded
    // short-lived processes where sync I/O is idiomatic and often preferred.
    if (
      (titleLower.includes("synchronous") || titleLower.includes("blocking")) &&
      (titleLower.includes("i/o") ||
        titleLower.includes("io") ||
        titleLower.includes("operation") ||
        titleLower.includes("file"))
    ) {
      return "Synchronous I/O is appropriate for CLI tools — short-lived processes do not need async concurrency.";
    }

    // Suppress "in-memory data store" — CLI tools don't need distributed state
    if (titleLower.includes("in-memory") && (titleLower.includes("store") || titleLower.includes("scale"))) {
      return "In-memory data structures are appropriate for CLI tools — no need for distributed state.";
    }

    // Suppress "numeric values formatted without locale" for CLI counter output
    if (titleLower.includes("locale") && titleLower.includes("numeric")) {
      return "CLI diagnostic counters do not need locale-aware formatting.";
    }

    // Suppress STRUCT deep nesting findings — CLI commands with complex
    // argument handling and output formatting have inherent nesting.
    if (/^STRUCT-/.test(finding.ruleId)) {
      return "CLI command logic has inherent nesting from argument handling and output formatting.";
    }

    // Suppress MAINT findings — CLI tools are self-contained scripts where
    // duplicate strings, magic numbers, and file length are acceptable.
    if (/^MAINT-/.test(finding.ruleId)) {
      return "Maintainability patterns differ for CLI tools — self-contained command scripts have different complexity budgets.";
    }

    // Suppress DOC findings — CLI command functions are documented by their
    // --help output, not JSDoc.
    if (/^DOC-/.test(finding.ruleId)) {
      return "CLI commands are documented through --help output, not JSDoc.";
    }

    // Suppress SWDEV findings about long functions, complexity — CLI commands
    // are often single long functions that handle the entire command flow.
    if (/^SWDEV-/.test(finding.ruleId)) {
      return "CLI command handlers are conventionally single functions covering the full command flow.";
    }

    // Suppress PERF/COST findings — CLI tools run once and exit, performance
    // optimizations target long-running services.
    if (/^(?:PERF|COST)-/.test(finding.ruleId)) {
      return "Performance/cost optimizations target long-running services — CLI tools run once and exit.";
    }

    // Suppress ERR findings — CLI tools use process.exit() for error
    // signaling and console.error for messages.
    if (/^ERR-/.test(finding.ruleId)) {
      return "CLI tools use process.exit() and console.error for error signaling — different pattern from services.";
    }

    // Suppress PORTA (portability) findings — CLI tools may use platform-specific paths
    if (/^PORTA-/.test(finding.ruleId)) {
      return "Portability patterns differ for CLI tools — platform-specific paths are often expected.";
    }

    // Suppress absence-based findings on CLI tools — CLI commands don't need
    // missing server infrastructure (rate limiting, monitoring, etc.)
    if (finding.isAbsenceBased) {
      return "Absence-based infrastructure rules do not apply to CLI commands.";
    }

    // Suppress SEC file-system-access findings — CLI tools are designed to
    // read/write files based on user-provided command-line arguments. File
    // system operations with argv/args paths are the tool's core purpose.
    if (/^SEC-/.test(finding.ruleId) && finding.title.toLowerCase().includes("file system access")) {
      return "File system access from CLI arguments is the tool's core purpose — not a vulnerability.";
    }

    // Suppress SEC database-related findings — CLI tools have no database
    // connections; "untrusted input in query" fires on function arguments
    // that are file paths, not SQL.
    if (/^SEC-/.test(finding.ruleId) && /database|sql|query construction/i.test(finding.title)) {
      return "CLI tools have no database connections — argument flow into internal functions is not SQL injection.";
    }
  }

  // ── 2f. Analysis-tool file gating ──
  // Code analysis tools (judge definitions, evaluators, linters, formatters,
  // AST analyzers) necessarily contain the very patterns they detect. They
  // are single-process developer utilities, not production web services.
  if (fileCategory === "analysis-tool") {
    const isInapplicable = ANALYSIS_TOOL_INAPPLICABLE_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isInapplicable) {
      return `Rule ${finding.ruleId} does not apply to code analysis tools — pattern definitions are not application logic.`;
    }

    // Suppress nested-loop/complexity findings — pattern matching requires
    // multi-level traversal and deep branching by design.
    const titleLower2e = finding.title.toLowerCase();
    if (
      /^(?:PERF|COST|STRUCT)-/.test(finding.ruleId) &&
      (titleLower2e.includes("nested") ||
        titleLower2e.includes("complex") ||
        titleLower2e.includes("depth") ||
        titleLower2e.includes("loop"))
    ) {
      return "Complex iteration and deep nesting are inherent to code analysis — pattern matching requires multi-level traversal.";
    }

    // Suppress STRUCT deep nesting findings specifically
    if (/^STRUCT-/.test(finding.ruleId)) {
      return "Deep code structure is inherent to analysis/evaluator logic — multi-level pattern matching requires extensive branching.";
    }

    // Suppress MAINT findings about duplicate strings, magic numbers, file length —
    // analysis patterns legitimately repeat keywords and use numeric thresholds.
    if (/^MAINT-/.test(finding.ruleId)) {
      return "Maintainability patterns in analysis tools reflect detection rule structure, not extractable constants.";
    }

    // Suppress DOC findings — internal analysis code documentation needs differ
    // from public API documentation requirements.
    if (/^DOC-/.test(finding.ruleId)) {
      return "Documentation rules have reduced applicability on internal analysis pattern code.";
    }

    // Suppress SWDEV/ERR findings about function length, error handling, complexity —
    // evaluation functions are necessarily complex.
    if (/^(?:SWDEV|ERR)-/.test(finding.ruleId)) {
      return "Analysis evaluation functions are necessarily complex — pattern matching requires extensive branching and error tolerance.";
    }

    // Suppress PERF/COST findings — analysis tools process single files, not
    // high-throughput production traffic.
    if (/^(?:PERF|COST)-/.test(finding.ruleId)) {
      return "Performance/cost optimizations target production services — analysis tools process single files.";
    }

    // Suppress PORTA (portability) findings — internal developer tool
    if (/^PORTA-/.test(finding.ruleId)) {
      return "Portability rules do not apply to internal code analysis tools.";
    }

    // Suppress absence-based findings — analysis tools don't need server infrastructure
    if (finding.isAbsenceBased) {
      return "Absence-based infrastructure rules do not apply to code analysis tools.";
    }
  }

  // ── 2g. VS Code extension file gating ──
  // VS Code extensions are desktop plugins running inside the editor process.
  // They use the VS Code API for I/O, diagnostics, and UI — cloud/service
  // rules are not applicable.
  if (fileCategory === "vscode-extension") {
    const isInapplicable = VSCODE_EXT_INAPPLICABLE_RULE_PREFIXES.some((p) => finding.ruleId.startsWith(p));
    if (isInapplicable) {
      return `Rule ${finding.ruleId} does not apply to VS Code extensions — desktop plugin, not a cloud service.`;
    }

    // Suppress absence-based findings — VS Code provides the host infrastructure
    if (finding.isAbsenceBased) {
      return "Absence-based infrastructure rules do not apply to VS Code extensions — the host provides the infrastructure.";
    }

    // Suppress findings about auth endpoints / session management —
    // VS Code extensions authenticate via the VS Code authentication API.
    const titleLower2f = finding.title.toLowerCase();
    if (
      /^(?:AUTH|CYBER)-/.test(finding.ruleId) &&
      (titleLower2f.includes("endpoint") || titleLower2f.includes("session") || titleLower2f.includes("middleware"))
    ) {
      return "VS Code extensions use the editor's authentication API — no HTTP endpoints or middleware.";
    }

    // Suppress STRUCT/MAINT/DOC/SWDEV/PERF/ERR findings on extension code —
    // extensions have different complexity profiles than web services
    if (/^(?:STRUCT|MAINT|DOC|SWDEV|PERF|ERR|PORTA)-/.test(finding.ruleId)) {
      return "VS Code extension code follows the editor's activation/dispose lifecycle pattern.";
    }

    // Suppress REL/CYBER/AUTH/DATA/FW/LOGPRIV findings on extension code
    if (/^(?:REL|CYBER|AUTH|DATA|FW|LOGPRIV)-/.test(finding.ruleId)) {
      return "VS Code extension code uses the editor's built-in infrastructure for reliability and security.";
    }

    // Suppress UX findings — VS Code extensions use the VS Code UI API
    if (/^UX-/.test(finding.ruleId)) {
      return "VS Code extensions use the editor's built-in UI components.";
    }
  }

  // ── 2h. Utility module gating ──
  // Utility modules are library code with no HTTP endpoints, no user-facing
  // UI, and no cloud-service responsibilities. Server-infrastructure and
  // cloud-readiness rules do not apply.
  if (fileCategory === "utility") {
    const UTILITY_INAPPLICABLE = [
      "SOV-", // no user data flow
      "COMP-", // no regulated data handling
      "RATE-", // no request rate
      "CLOUD-", // not a cloud service
      "UX-", // no user interface
      "OBS-", // no production observability need
      "AGENT-", // not an AI agent
      "FW-", // framework rules target app code
      "API-", // not an API service
      "DB-", // no database
      "SCALE-", // not a scalable service — CLI utilities use sync I/O legitimately
      "CFG-", // configuration management rules target deployed services
      "PORTA-", // portability rules target deployed apps, not internal tooling
    ];
    const isUtilityInapplicable = UTILITY_INAPPLICABLE.some((p) => finding.ruleId.startsWith(p));
    if (isUtilityInapplicable) {
      return `Rule ${finding.ruleId} does not apply to utility library modules — no cloud/service infrastructure.`;
    }

    // For path-confirmed utility modules (not content-based guesses),
    // also suppress code-quality rules that fire on internal CLI internals:
    // sync I/O, empty catches in cache cleanup, structural complexity in
    // data-aggregation code, etc.
    if (filePath) {
      const INTERNAL_UTILITY_INAPPLICABLE = [
        "PERF-", // sync I/O is idiomatic for single-threaded CLI utility internals
        "COST-", // same as PERF — sync I/O is the expected pattern
        "TEST-", // utility modules are tested indirectly through integration tests
        "COMPAT-", // internal data structures, not public API
        "ERR-", // utility modules use intentional swallowed errors (cache cleanup, etc.)
        "STRUCT-", // data-aggregation utilities have inherent branching complexity
      ];
      const isInternalInapplicable = INTERNAL_UTILITY_INAPPLICABLE.some((p) => finding.ruleId.startsWith(p));
      if (isInternalInapplicable) {
        return `Rule ${finding.ruleId} does not apply to internal utility modules — CLI internals have different patterns.`;
      }
    }

    // Suppress absence-based findings on utilities
    if (finding.isAbsenceBased) {
      return "Absence-based infrastructure rules do not apply to utility modules.";
    }
  }

  // ── 3. All target lines are comments ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    // AICS-003 specifically detects TODO/FIXME security placeholders in comments —
    // commenting IS the signal, so exempt it from this filter.
    // COMPAT-* detects renamed/removed fields via comments like "// Was: oldName" —
    // the comment IS the evidence of a breaking change.
    if (!finding.ruleId.startsWith("AICS-") && !finding.ruleId.startsWith("COMPAT-")) {
      const allComments = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        return line !== undefined && isCommentLine(line);
      });
      if (allComments) {
        return "All flagged lines are comments — the pattern appears in documentation, not executable code.";
      }
    }
  }

  // ── 4. All target lines are string literals ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    // DEPS-* rules specifically target dependency declarations in package manifests
    // where string literal values ARE the finding (e.g., '"express": "^3.0.0"').
    // COMP-* rules detect PII fields inside SQL/query strings — the string literal
    // IS the data-handling code, not inert data.
    if (!finding.ruleId.startsWith("DEPS-") && !finding.ruleId.startsWith("COMP-")) {
      const allStrings = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        return line !== undefined && isStringLiteralLine(line);
      });
      if (allStrings) {
        return "All flagged lines are string literal values — the keyword appears in data, not code.";
      }
    }
  }

  // ── 5. Import / type-only line ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    // DEPS-* rules specifically target import declarations of deprecated/risky packages —
    // import lines ARE the finding, so skip this filter for them.
    // HALLU-* rules detect dependency confusion via suspicious import specifiers —
    // import lines ARE the finding for hallucination/confusion checks.
    if (!finding.ruleId.startsWith("DEPS-") && !finding.ruleId.startsWith("HALLU-")) {
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
  }

  // ── 6. Keyword-in-identifier collision ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc = `${finding.title} ${finding.description}`;
    for (const { trigger, identifierContext } of KEYWORD_IDENTIFIER_PATTERNS) {
      if (trigger.test(titleAndDesc)) {
        const matchingLines = finding.lineNumbers.filter((ln) => {
          const line = lines[ln - 1];
          return line !== undefined && identifierContext.test(line);
        });
        // Require ALL flagged lines to match identifier context, not just any.
        // When cross-evaluator dedup merges line numbers from multiple findings,
        // a single inherited "foreign" line shouldn't suppress the entire finding.
        if (matchingLines.length > 0 && matchingLines.length >= finding.lineNumbers.length) {
          return "Keyword appears as part of an identifier name, not as a dangerous operation.";
        }
      }
    }
  }

  // ── 7. Safe standard-library idiom ──
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    for (const { findingPattern, safeContext, excludePattern } of SAFE_IDIOM_PATTERNS) {
      if (findingPattern.test(finding.title) || findingPattern.test(finding.ruleId)) {
        // Skip safe-idiom suppression when the finding is about the very thing we'd suppress
        if (excludePattern && (excludePattern.test(finding.title) || excludePattern.test(finding.ruleId))) {
          continue;
        }
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
  // Accessibility, UX rendering, and internationalization rules are only
  // meaningful on files that contain web-facing patterns (HTML, JSX, routes,
  // templates, CSS, or HTTP API responses).
  const WEB_ONLY_PREFIXES = ["A11Y-", "UX-", "I18N-"];
  const isWebOnly = WEB_ONLY_PREFIXES.some((p) => finding.ruleId.startsWith(p));
  if (isWebOnly) {
    const hasWebPatterns =
      /<\w+[\s>]|className=|style=|href=|jsx|tsx|\.html|\.css|render\s*\(|dangerouslySetInnerHTML|innerHTML|document\.|window\.|querySelector|getElementById|res\.(?:json|send|render|status)|app\.(?:get|post|put|delete|use)\s*\(|router\.(?:get|post|put|delete)\s*\(|@app\.route|@GetMapping|@PostMapping|@RequestMapping|http\.HandleFunc/i.test(
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
    (((finding.title.toLowerCase().includes("local") ||
      finding.title.toLowerCase().includes("process") ||
      finding.title.toLowerCase().includes("file")) &&
      finding.title.toLowerCase().includes("lock")) ||
      /asyncio\.Lock|threading\.Lock/i.test(finding.title))
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
    (/circuit.?breaker|resilience/i.test(finding.title) ||
      (finding.title.toLowerCase().includes("without") &&
        (finding.title.toLowerCase().includes("retry") || finding.title.toLowerCase().includes("fallback"))))
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
  if (
    /^I18N-/.test(finding.ruleId) &&
    finding.title.toLowerCase().includes("hardcoded") &&
    finding.title.toLowerCase().includes("string")
  ) {
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
  if (
    /^(?:PERF|COST)-/.test(finding.ruleId) &&
    ((finding.title.toLowerCase().includes("nested") && finding.title.toLowerCase().includes("loop")) ||
      /O\(n[²2]\)|quadratic/i.test(finding.title))
  ) {
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
  if (
    /^SOV-002/.test(finding.ruleId) &&
    (/cross.?border|jurisdiction/i.test(finding.title) ||
      (finding.title.toLowerCase().includes("data") && finding.title.toLowerCase().includes("egress")))
  ) {
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

  // ── 18. Barrel / re-export files suppress absence-based findings ──
  // Index files (index.ts, __init__.py, mod.rs) that primarily re-export
  // other modules trigger absence-based findings like "missing error handling"
  // or "missing validation" despite having no logic to validate.
  if (finding.isAbsenceBased) {
    const totalLines = lines.length;
    const reExportLines = lines.filter((l) => {
      const t = l.trim();
      return (
        /^export\s+\{/.test(t) ||
        /^export\s+\*\s+from\s/.test(t) ||
        /^export\s+(?:default\s+)?(?:type\s+)?\w+\s+from\s/.test(t) ||
        /^from\s+\S+\s+import\s/.test(t) ||
        /^import\s/.test(t) ||
        /^__all__\s*=/.test(t) ||
        /^pub\s+(?:mod|use)\s/.test(t) ||
        t.length === 0 ||
        /^\s*(?:\/\/|\/\*|\*|#|$)/.test(t)
      );
    }).length;
    if (totalLines > 0 && reExportLines / totalLines >= 0.8) {
      return "File is primarily re-exports/barrel — absence-based rules do not apply to aggregation modules.";
    }
  }

  // ── 19. Decorator/annotation security presence suppresses AUTH absence findings ──
  // If the file contains authentication/authorization decorators or annotations,
  // absence-based AUTH- findings claiming "missing authentication" are FPs —
  // the auth IS present via the decorator.
  if (/^AUTH-/.test(finding.ruleId) && finding.isAbsenceBased) {
    const fullCode = lines.join("\n");
    const hasSecurityDecorator =
      /@login_required|@requires_auth|@authenticated|@auth_required|@require_login|@jwt_required|\[Authorize\]|\[AllowAnonymous\]|@PreAuthorize|@Secured|@RolesAllowed|@PermitAll|@RequiresPermissions|@RequiresRoles|@Protected\b/i.test(
        fullCode,
      );
    if (hasSecurityDecorator) {
      return "Authentication decorator/annotation is present — auth is enforced via framework mechanism.";
    }
  }

  // ── 20. Enum / union type definitions suppress keyword collision findings ──
  // Enum values like `Action.DELETE`, `Method.POST`, or union types like
  // `type Method = "GET" | "DELETE"` contain security keywords as inert values.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const allEnumOrUnion = finding.lineNumbers.every((ln) => {
      const line = lines[ln - 1];
      if (!line) return false;
      const trimmed = line.trim();
      return (
        /^\s*(?:export\s+)?enum\s+\w+/.test(trimmed) ||
        /^\s*\w+\s*=\s*["']\w+["']\s*,?\s*(?:\/\/.*)?$/.test(trimmed) ||
        /^\s*(?:export\s+)?type\s+\w+\s*=\s*(?:["'].*["']\s*\|?\s*)+/.test(trimmed) ||
        /^\s*\|\s*["']/.test(trimmed)
      );
    });
    if (allEnumOrUnion) {
      // Require that the file actually contains an enum, type, or class declaration.
      // Without this, bare variable assignments like `password = "admin123"`
      // would incorrectly match the `WORD = "word"` enum-member pattern above.
      const hasEnumTypeContext = lines.some(
        (l) =>
          /^\s*(?:export\s+)?enum\s+\w+/.test(l.trim()) ||
          /^\s*(?:export\s+)?type\s+\w+\s*=/.test(l.trim()) ||
          /^\s*class\s+\w+/.test(l.trim()),
      );
      if (hasEnumTypeContext) {
        const titleAndDesc = `${finding.title} ${finding.description}`;
        const hasSecurityKeyword =
          /\bdelete\b|\bexec\b|\bpassword\b|\bsecret\b|\btoken\b|\bdrop\b|\bkill\b|\broot\b|\badmin\b/i.test(
            titleAndDesc,
          );
        if (hasSecurityKeyword) {
          return "Security keyword appears in an enum/union type definition — inert value, not a dangerous operation.";
        }
      }
    }
  }

  // ── 21. Log/error message strings with security keywords are informational ──
  // Findings triggered by keywords like "password", "token", "secret" inside
  // logging statements (logger.error("Failed to validate password")) are FPs —
  // the log describes the operation, it doesn't leak the actual credential.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc = `${finding.title} ${finding.description}`;
    const hasCredentialKeyword = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc);
    if (hasCredentialKeyword) {
      // Don't suppress findings that are specifically ABOUT credential logging —
      // those findings flag the log line itself as the problem (e.g. LOGPRIV-001).
      const isAboutLogging = /\blog(?:ged|ging|s|file)?\b/i.test(titleAndDesc) || /^LOG|LOGPRIV/i.test(finding.ruleId);
      if (!isAboutLogging) {
        const allLogLines = finding.lineNumbers.every((ln) => {
          const line = lines[ln - 1];
          if (!line) return false;
          return /(?:logger|log|console|logging)\s*\.\s*(?:error|warn|warning|info|debug|critical|fatal|log)\s*\(/i.test(
            line,
          );
        });
        if (allLogLines) {
          return "Security keyword appears inside a logging statement — describes the operation, not a credential leak.";
        }
      }
    }
  }

  // ── 22. Typed parameter/property declarations with security keywords ──
  // When a security keyword (password, token, secret, credential) appears as
  // a typed parameter name (e.g. `password: string`, `String secret`), it's
  // a declaration describing the input's purpose, not a hardcoded credential.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc22 = `${finding.title} ${finding.description}`;
    const hasCredentialKw22 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc22);
    if (hasCredentialKw22) {
      // Don't suppress findings specifically about credential LEAKAGE or LOGGING
      const isAboutExposure22 =
        /\b(?:leak|expos|log(?:ged|ging)?|print|display|transmit|send)\b/i.test(titleAndDesc22) ||
        /^LOG|LOGPRIV/i.test(finding.ruleId);
      if (!isAboutExposure22) {
        const allTypedDeclarations = finding.lineNumbers.every((ln) => {
          const line = lines[ln - 1];
          if (!line) return false;
          // TS/Python/Rust typed parameter: `password: string`, `token?: str`
          return (
            /\b(?:password|secret|token|credential)\b\s*[?!]?\s*:\s*(?:str|string|String|number|int|Integer|boolean|bool|Boolean|any|object|Buffer|bytes|SecureString)\b/i.test(
              line,
            ) ||
            // Java/C# style: `String password`, `SecureString credential`
            /\b(?:String|int|Integer|boolean|char|SecureString|byte\[\])\s+(?:password|secret|token|credential)\b/i.test(
              line,
            )
          );
        });
        if (allTypedDeclarations) {
          return "Security keyword is a typed parameter/property name — declaration, not a hardcoded credential.";
        }
      }
    }
  }

  // ── 23. Throw/raise error message strings with security keywords ──
  // throw new Error("Invalid password format") or raise ValueError("Bad token")
  // contain security keywords in a descriptive error message, not a credential
  // leak. Only suppresses static string messages (no variable interpolation).
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc23 = `${finding.title} ${finding.description}`;
    const hasCredentialKw23 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc23);
    if (hasCredentialKw23) {
      const isAboutExposure23 =
        /\blog(?:ged|ging|s)?\b|LOGPRIV|^LOG-|expos|leak/i.test(titleAndDesc23) || /^LOG|LOGPRIV/i.test(finding.ruleId);
      if (!isAboutExposure23) {
        const allThrowLines = finding.lineNumbers.every((ln) => {
          const line = lines[ln - 1];
          if (!line) return false;
          // throw new Error("...") / raise ValueError("...") with static string arg
          return /(?:throw\s+new\s+\w*(?:Error|Exception|Fault)|raise\s+\w*(?:Error|Exception|Warning))\s*\(\s*["'`]/i.test(
            line,
          );
        });
        if (allThrowLines) {
          return "Security keyword appears in an error/exception message — describes the error, not a credential leak.";
        }
      }
    }
  }

  // ── 24. Regex pattern literals containing security keywords ──
  // Validation patterns like /password|secret|token/ or re.compile(r"password")
  // contain security keywords as detection/matching targets, not credential values.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc24 = `${finding.title} ${finding.description}`;
    const hasSecurityKw24 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b|\bexec\b|\bdelete\b/i.test(
      titleAndDesc24,
    );
    if (hasSecurityKw24) {
      const allRegexLines = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        // JS regex literal: /...keyword.../flags
        const hasJsRegex = /\/[^/]*\b(?:password|secret|token|credential|exec|delete)\b[^/]*\/[gimsuy]*/.test(line);
        // Python re.compile / re.search / re.match / re.findall
        // Java Pattern.compile / new RegExp
        const hasCompiledRegex =
          /(?:re\.(?:compile|search|match|findall|sub)|Pattern\.compile|new\s+RegExp)\s*\(/i.test(line);
        return hasJsRegex || hasCompiledRegex;
      });
      if (allRegexLines) {
        return "Security keyword appears inside a regex pattern — used for matching/validation, not credential handling.";
      }
    }
  }

  // ── 25. Config/schema object keys with non-credential values ──
  // When a security keyword appears as an object/dict key and the assigned
  // value is a boolean, null, a schema type descriptor, or an ORM field
  // definition, the line defines field metadata — not a hardcoded credential.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc25 = `${finding.title} ${finding.description}`;
    const hasCredentialKw25 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc25);
    if (hasCredentialKw25) {
      const allConfigKeys = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        // Object/dict key followed by non-credential value:
        // password: true, token: false, secret: null, credential: undefined
        // "password": { type: "string" }, token: Column(...), secret: Field(...)
        return /["']?(?:password|secret|token|credential)["']?\s*[:=]\s*(?:true\b|false\b|null\b|undefined\b|None\b|required\b|optional\b|{\s*["']?(?:type|required|default|min|max|enum|validate|format|description)\b|(?:Column|Field|models\.)\s*\()/i.test(
          line,
        );
      });
      if (allConfigKeys) {
        return "Security keyword is a config/schema object key — describes field structure, not a hardcoded credential.";
      }
    }
  }

  // ── 26. Assignment from function call / config lookup ──
  // When a security keyword is assigned the return value of a function call
  // or config/env lookup (e.g., password = getPassword(), token = config.get("token")),
  // the value comes from runtime, not hardcoded in source.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc26 = `${finding.title} ${finding.description}`;
    const hasCredentialKw26 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc26);
    const isHardcodedFinding26 = /hardcoded|hard.?coded|plaintext|plain.?text/i.test(titleAndDesc26);
    if (hasCredentialKw26 && isHardcodedFinding26) {
      const allFunctionCalls = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        // keyword = someFunction(...) or keyword = obj.method(...)
        // keyword = process.env.KEY or keyword = os.environ[...]
        return /\b(?:password|secret|token|credential)\b\s*=\s*(?:\w+[\w.]*\s*\(|process\.env\b|os\.environ)/i.test(
          line,
        );
      });
      if (allFunctionCalls) {
        return "Value is assigned from a function call or config lookup — not hardcoded in source.";
      }
    }
  }

  // ── 28. IaC compile-time property resolution suppresses REL null-check findings ──
  // Bicep/ARM/Terraform resolves resource property references at deployment
  // time, not at runtime.  Deep property access like vnet.properties.subnets[0].id
  // is compile-time safe — null checks and optional chaining are inapplicable.
  if (isIaC && /^REL-/.test(finding.ruleId)) {
    const titleLower = finding.title.toLowerCase();
    if (
      titleLower.includes("null") ||
      titleLower.includes("optional chain") ||
      titleLower.includes("property access") ||
      titleLower.includes("deep property") ||
      titleLower.includes("undefined")
    ) {
      return "IaC resource property references are resolved at deploy time — null checks are inapplicable.";
    }
  }

  // ── 29. IaC domain-convention numbers suppress MAINT magic-number findings ──
  // IaC templates use well-known numeric conventions: NSG priorities (100–4096),
  // CIDR prefix lengths, port numbers, regulatory retention periods (365), and
  // protocol-standard values.  These are domain conventions, not arbitrary magic numbers.
  if (isIaC && /^MAINT-/.test(finding.ruleId)) {
    const titleLower = finding.title.toLowerCase();
    if (
      titleLower.includes("magic number") ||
      titleLower.includes("magic value") ||
      titleLower.includes("numeric literal")
    ) {
      return "Numeric values in IaC templates are domain conventions (priorities, ports, retention periods) — not arbitrary magic numbers.";
    }
  }

  // ── 30. Schema-mandated nesting depth suppresses MAINT deep-nesting on IaC ──
  // ARM/Bicep/Terraform resource schemas enforce hierarchical property nesting
  // (resource → properties → subnets[] → properties → addressPrefix) that
  // cannot be flattened without breaking the schema.
  if (isIaC && /^MAINT-/.test(finding.ruleId)) {
    const titleLower = finding.title.toLowerCase();
    if (
      titleLower.includes("nested") ||
      titleLower.includes("nesting") ||
      titleLower.includes("depth") ||
      titleLower.includes("indentation")
    ) {
      return "Nesting depth in IaC templates is mandated by the resource schema — it cannot be flattened.";
    }
  }

  // ── 31. IaC schema enum values suppress MAINT duplicate-string findings ──
  // ARM/Terraform templates repeat schema-constrained enum values ('Tcp', 'Allow',
  // 'Deny', 'Inbound', 'Outbound') and consistent tag keys across resources.
  // These are schema-required repetitions, not extractable constants.
  if (isIaC && /^MAINT-/.test(finding.ruleId)) {
    const titleLower = finding.title.toLowerCase();
    if (
      (titleLower.includes("duplicate") && titleLower.includes("string")) ||
      titleLower.includes("repeated string") ||
      titleLower.includes("extract to constant")
    ) {
      return "Repeated strings in IaC templates are schema-constrained enum values or consistent tag keys — not extractable constants.";
    }
  }

  // ── 32. Azure Bastion documented-requirement suppresses IAC Internet-HTTPS ──
  // Azure Bastion requires inbound HTTPS (443) from 'Internet' / '*' per
  // Microsoft documentation.  When the NSG rule is scoped to a Bastion subnet
  // and compensating controls are documented, the finding is an accepted risk.
  if (isIaC && /^IAC-/.test(finding.ruleId)) {
    const titleLower = finding.title.toLowerCase();
    if (
      (titleLower.includes("bastion") || titleLower.includes("internet")) &&
      (titleLower.includes("https") || titleLower.includes("443") || titleLower.includes("inbound"))
    ) {
      const fullCode = lines.join("\n");
      const hasBastionSubnet = /bastion/i.test(fullCode);
      const hasCompensatingControl = /compensat|conditional\s*access|AAD|Entra|MFA|multi.?factor|audit/i.test(fullCode);
      if (hasBastionSubnet && hasCompensatingControl) {
        return "Azure Bastion requires inbound HTTPS from Internet per Microsoft documentation — compensating controls are documented.";
      }
    }
  }

  // ── 33. Destructuring variable extraction suppresses credential findings ──
  // When a security keyword appears in a destructuring pattern, the code is
  // extracting a named field from a runtime object (request body, config, etc.),
  // not declaring a hardcoded credential.
  // e.g., `const { password, email } = req.body;`
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc33 = `${finding.title} ${finding.description}`;
    const hasCredentialKw33 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc33);
    const isHardcodedFinding33 = /hardcoded|hard.?coded/i.test(titleAndDesc33);
    if (hasCredentialKw33 && isHardcodedFinding33) {
      const allDestructuring = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        // JS/TS object destructuring: const { password, ... } = expr
        // Python tuple unpacking: password, email = get_credentials()
        return (
          /(?:const|let|var|final)\s*\{[^}]*\b(?:password|secret|token|credential)\b[^}]*\}\s*=/.test(line) ||
          /\(\s*\{[^}]*\b(?:password|secret|token|credential)\b[^}]*\}\s*[):,]/.test(line) ||
          /^\s*\b(?:password|secret|token|credential)\b\s*,\s*\w+\s*=\s*\w+/.test(line)
        );
      });
      if (allDestructuring) {
        return "Security keyword is a destructured variable name — extracted from runtime data, not hardcoded.";
      }
    }
  }

  // ── 34. Dictionary/map key access suppresses credential findings ──
  // When a security keyword appears as a dictionary/map key being accessed,
  // the code is reading a field by name from a runtime data structure.
  // e.g., `data["password"]`, `request.form.get("token")`, `params[:secret]`
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc34 = `${finding.title} ${finding.description}`;
    const hasCredentialKw34 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc34);
    const isHardcodedFinding34 = /hardcoded|hard.?coded/i.test(titleAndDesc34);
    if (hasCredentialKw34 && isHardcodedFinding34) {
      // Don't suppress findings about credential logging/leakage
      const isAboutExposure34 =
        /\b(?:leak|expos|log(?:ged|ging)?|print|display|transmit|send)\b/i.test(titleAndDesc34) ||
        /^LOG|LOGPRIV/i.test(finding.ruleId);
      if (!isAboutExposure34) {
        const allDictAccess = finding.lineNumbers.every((ln) => {
          const line = lines[ln - 1];
          if (!line) return false;
          // obj["password"], obj['token'], data.get("secret"), request.form["credential"]
          return (
            /\w\s*\[\s*["'](?:password|secret|token|credential)["']\s*\]/.test(line) ||
            /\w\s*\.\s*(?:get|pop|setdefault|fetch|read)\s*\(\s*["'](?:password|secret|token|credential)["']/.test(line)
          );
        });
        if (allDictAccess) {
          return "Security keyword is a dictionary/map key — reading a named field from runtime data, not a hardcoded credential.";
        }
      }
    }
  }

  // ── 35. CLI argument/option definitions suppress credential findings ──
  // When a security keyword appears in a CLI argument parser definition,
  // it names a CLI option, not a hardcoded credential.
  // e.g., `parser.add_argument("--password")`, `.option("--token")`
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc35 = `${finding.title} ${finding.description}`;
    const hasCredentialKw35 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc35);
    if (hasCredentialKw35) {
      const allCliDefs = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        // Python argparse: add_argument("--password", ...)
        // Python click: @click.option("--token", ...)
        // Node commander: .option("--secret <value>", ...)
        // Node yargs: .option("password", { ... })
        return (
          /add_argument\s*\(\s*["']--?(?:password|secret|token|credential)["']/.test(line) ||
          /@click\.(?:option|argument)\s*\(\s*["']--?(?:password|secret|token|credential)["']/.test(line) ||
          /\.option\s*\(\s*["'][^"']*-{1,2}(?:password|secret|token|credential)\b/.test(line) ||
          /\.(?:option|positional)\s*\(\s*["'](?:password|secret|token|credential)["']\s*,/.test(line)
        );
      });
      if (allCliDefs) {
        return "Security keyword is a CLI argument/option name — defines a command-line parameter, not a hardcoded credential.";
      }
    }
  }

  // ── 27. String comparison / switch-case dispatch with security keywords ──
  // When a security keyword appears as a string value in a comparison operator
  // (=== / ==), switch-case label, or inclusion check (.includes()), the code
  // is dispatching by field name, not handling a credential.
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const titleAndDesc27 = `${finding.title} ${finding.description}`;
    const hasCredentialKw27 = /\bpassword\b|\bsecret\b|\btoken\b|\bcredential\b/i.test(titleAndDesc27);
    if (hasCredentialKw27) {
      const allComparisonDispatch = finding.lineNumbers.every((ln) => {
        const line = lines[ln - 1];
        if (!line) return false;
        return (
          /\bcase\s+["'](?:password|secret|token|credential)["']\s*:/i.test(line) ||
          /(?:===?|!==?)\s*["'](?:password|secret|token|credential)["']/i.test(line) ||
          /["'](?:password|secret|token|credential)["']\s*(?:===?|!==?)/i.test(line) ||
          /\.includes\s*\(\s*["'](?:password|secret|token|credential)["']/i.test(line) ||
          /\bin\s+[[(].*["'](?:password|secret|token|credential)["']/i.test(line)
        );
      });
      if (allComparisonDispatch) {
        return "Security keyword is a string value in a comparison/dispatch — routing by field name, not credential handling.";
      }
    }
  }

  return null;
}
