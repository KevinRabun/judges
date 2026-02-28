import type {
  JudgeDefinition,
  JudgeEvaluation,
  TribunalVerdict,
  Finding,
  Severity,
  Verdict,
  JudgesConfig,
  LangFamily,
} from "../types.js";
import { normalizeLanguage, langPattern } from "../language-patterns.js";

// ─── Re-export language utilities for convenience ────────────────────────────
export { normalizeLanguage, langPattern };

// ─── File Classification ─────────────────────────────────────────────────────
// Classify a source file so absence-based rules can be skipped on files where
// they would only produce false positives (tests, configs, pure type defs, etc.).
// ─────────────────────────────────────────────────────────────────────────────

export type FileCategory =
  | "test" // test / spec files
  | "config" // configuration / build / manifest files
  | "types" // pure type definitions (interfaces, enums, no runtime code)
  | "utility" // small utility / helper modules (no I/O, no HTTP endpoints)
  | "server" // entry points, route handlers, API controllers
  | "unknown"; // cannot determine — treat as server-like (all rules apply)

/**
 * Heuristically classify a source file based on its content (and optionally its
 * file path). The classification drives file-type gating: absence-based
 * rules (e.g. "no rate limiting", "no config schema") are suppressed on
 * non-server files where they would only produce noise.
 */
export function classifyFile(code: string, language: string, filePath?: string): FileCategory {
  const lines = code.split("\n");
  const lineCount = lines.length;

  // ── Path-based fast checks ───────────────────────────────────────────────
  if (filePath) {
    const lowerPath = filePath.toLowerCase().replace(/\\/g, "/");
    if (
      /[/\\]?(?:__tests__|test|tests|spec|__mocks__|__fixtures__)[/\\]/i.test(lowerPath) ||
      /\.(test|spec|e2e)\.\w+$/i.test(lowerPath)
    ) {
      return "test";
    }
    if (
      /(?:^|[/\\])(?:tsconfig|jest\.config|webpack\.config|vite\.config|eslint|\.eslintrc|babel\.config|rollup\.config|\.prettierrc|Makefile|Dockerfile|docker-compose|package\.json|Cargo\.toml|go\.mod|pom\.xml|build\.gradle|\.csproj|\.sln|\.editorconfig)[^/\\]*$/i.test(
        lowerPath,
      )
    ) {
      return "config";
    }
    if (/\.d\.ts$/i.test(lowerPath)) {
      return "types";
    }
    // Health check / readiness probe endpoints (should not trigger absence rules)
    if (
      /(?:^|[/\\])(?:health|healthcheck|health-check|readiness|liveness|ready|live|ping|status)\.\w+$/i.test(lowerPath)
    ) {
      return "utility";
    }
    // Migration / seed files
    if (/(?:^|[/\\])(?:migrations?|seeds?|fixtures)[/\\]/i.test(lowerPath)) {
      return "config";
    }
  }

  // ── Content-based classification ─────────────────────────────────────────

  // Test files: heavy test framework usage
  const testFrameworkLines = lines.filter((l) =>
    /\b(?:describe|it|test|beforeEach|afterEach|beforeAll|afterAll|expect|assert)\s*\(/i.test(l),
  ).length;
  if (testFrameworkLines >= 3) {
    return "test";
  }

  // Pure type-definition files: mostly interfaces, types, enums, no runtime
  const typeOnlyPattern = /^\s*(?:export\s+)?(?:interface|type|enum|declare|namespace)\b/;
  const importPattern = /^\s*(?:import|export)\s/;
  const commentOrBlank = /^\s*(?:\/\/|\/\*|\*|$)/;
  const runtimeStatements = lines.filter((l) => {
    const trimmed = l.trim();
    return (
      trimmed.length > 0 &&
      !commentOrBlank.test(trimmed) &&
      !typeOnlyPattern.test(trimmed) &&
      !importPattern.test(trimmed) &&
      !/^\s*\}/.test(trimmed) && // closing braces
      !/^\s*\*\//.test(trimmed)
    ); // end of block comment
  }).length;
  if (lineCount > 5 && runtimeStatements / lineCount < 0.15) {
    return "types";
  }

  // Config-like files: mostly key-value, constants, no functions
  const constExportLines = lines.filter((l) =>
    /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:\{|"|'|\d|true|false|null|\[)/i.test(l),
  ).length;
  const functionDeclLines = lines.filter((l) =>
    /(?:function\s+\w+|=>\s*\{|class\s+\w+|def\s+\w+|fn\s+\w+|func\s+\w+)/i.test(l),
  ).length;
  if (lineCount > 5 && constExportLines / lineCount > 0.3 && functionDeclLines === 0) {
    return "config";
  }

  // Health-check endpoints detected by content (lightweight route returning 200/ok)
  if (
    /(?:\/health|\/ready|\/live|\/ping|\/status)\b/i.test(code) &&
    lineCount < 50 &&
    // Use [^\n]* instead of .* to avoid quadratic backtracking across
    // newlines when tested against multi-line code (CodeQL js/polynomial-redos).
    /(?:res\.(?:send|json|status)|return[^\n]*(?:ok|healthy|200))/i.test(code)
  ) {
    return "utility";
  }

  // Server / entry point: has HTTP handlers, route definitions, or listen
  const serverSignals =
    /\b(?:app\.(?:get|post|put|delete|patch|use|listen)|router\.|express\(|createServer|fastify|Koa|hono|http\.(?:Server|createServer)|new\s+Hono|Flask|Django|Spring|@(?:Get|Post|Put|Delete|Controller|RequestMapping)|func\s+\w+Handler|gin\.\w+|http\.Handle)/i;
  if (serverSignals.test(code)) {
    return "server";
  }

  // Small utility with no I/O
  const hasIO =
    /\b(?:fetch|axios|http|https|net|fs\.|readFile|writeFile|database|query|exec|spawn|child_process|socket)\b/i.test(
      code,
    );
  if (!hasIO && lineCount < 200) {
    return "utility";
  }

  return "unknown";
}

/**
 * Whether absence-based rules should fire for a file of this category.
 * Absence-based rules (e.g. "no rate limiting", "no input validation") are
 * only meaningful on server / entry-point code.
 */
export function shouldRunAbsenceRules(category: FileCategory): boolean {
  return category === "server" || category === "unknown";
}

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
    pattern.lastIndex = 0;
    if (pattern.test(lines[i])) {
      matches.push(i + 1);
    }
  }
  return matches;
}

/**
 * Find line numbers using a language-aware pattern map.
 * Takes the raw language string, normalises it, and builds the right regex.
 * Returns empty array if no pattern exists for the language.
 */
export function getLangLineNumbers(
  code: string,
  language: string,
  patterns: Partial<Record<LangFamily | "jsts" | "all", string>>,
): number[] {
  const lang = normalizeLanguage(language);
  const re = langPattern(lang, patterns);
  if (!re) return [];
  return getLineNumbers(code, re);
}

/**
 * Returns the normalised LangFamily for the given language string.
 */
export function getLangFamily(language: string): LangFamily {
  return normalizeLanguage(language);
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Apply configuration to a set of findings — suppress disabled rules,
 * override severities, and filter by minimum severity.
 */
export function applyConfig(findings: Finding[], config?: JudgesConfig): Finding[] {
  if (!config) return findings;

  const severityOrder: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  let result = findings;

  // Remove disabled rules
  if (config.disabledRules && config.disabledRules.length > 0) {
    const disabled = new Set(config.disabledRules);
    result = result.filter((f) => {
      if (disabled.has(f.ruleId)) return false;
      // Check prefix wildcards like "SEC-*"
      for (const rule of disabled) {
        if (rule.endsWith("*") && f.ruleId.startsWith(rule.slice(0, -1))) {
          return false;
        }
      }
      return true;
    });
  }

  // Apply per-rule overrides
  if (config.ruleOverrides) {
    result = result
      .map((f) => {
        const override =
          config.ruleOverrides![f.ruleId] ??
          // Check prefix overrides like "SEC-*"
          Object.entries(config.ruleOverrides!).find(
            ([key]) => key.endsWith("*") && f.ruleId.startsWith(key.slice(0, -1)),
          )?.[1];

        if (!override) return f;
        if (override.disabled) return null;
        if (override.severity) return { ...f, severity: override.severity };
        return f;
      })
      .filter((f): f is Finding => f !== null);
  }

  // Filter by minimum severity
  if (config.minSeverity) {
    const minOrder = severityOrder[config.minSeverity];
    result = result.filter((f) => severityOrder[f.severity] >= minOrder);
  }

  return result;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Detect positive engineering signals in source code. Returns a bonus score.
 * Called during scoring to reward good practices, not just penalize problems.
 */
export function detectPositiveSignals(code: string): number {
  let bonus = 0;

  // Parameterized queries (prepared statements, $1 placeholders)
  if (/\$\d+|PreparedStatement|\?\s*(?:,|\))|\.prepare\s*\(/i.test(code)) bonus += 3;
  // Security headers imported (helmet, csp, hsts)
  if (/\bhelmet\b|content-security-policy|strict-transport-security/i.test(code)) bonus += 3;
  // Proper error handling (try/catch with actual handling, not empty catch)
  // Bound [^}] to {0,500} to prevent polynomial matching on large catch
  // blocks that lack the target keywords (CodeQL js/polynomial-redos).
  if (/catch\s*\([^)]+\)\s*\{[^}]{0,500}(?:log|throw|return|next|reject|emit)/i.test(code)) bonus += 2;
  // Input validation present (joi, zod, yup, express-validator, class-validator)
  if (/\b(?:joi|zod|yup|ajv|class-validator|express-validator)\b/i.test(code)) bonus += 2;
  // Authentication middleware
  if (/\b(?:passport|requireAuth|isAuthenticated|authMiddleware|verifyToken|authorize)\b/i.test(code)) bonus += 3;
  // Rate limiting
  if (/\b(?:rateLimit|rateLimiter|express-rate-limit|throttle|bottleneck)\b/i.test(code)) bonus += 2;
  // CORS properly configured
  if (/\bcors\b.*\b(?:origin|methods|credentials)\b/i.test(code)) bonus += 1;
  // TypeScript strict mode or runtime type checking
  if (/\bstrict(?:NullChecks|Mode)?\s*:\s*true\b/i.test(code)) bonus += 1;
  // Structured logging (winston, pino, bunyan)
  if (/\b(?:winston|pino|bunyan|createLogger|getLogger)\b/i.test(code)) bonus += 2;
  // Tests present (basic signal for quality)
  if (/\b(?:describe|it|test|expect|assert)\s*\(/i.test(code)) bonus += 1;

  // Cap total bonus at +15
  return Math.min(bonus, 15);
}

export function calculateScore(findings: Finding[], code?: string): number {
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

  // Add positive signals bonus if code is provided
  if (code) {
    score += detectPositiveSignals(code);
  }

  return Math.max(0, Math.min(100, score));
}

export function deriveVerdict(findings: Finding[], score: number): Verdict {
  if (findings.some((f) => f.severity === "critical")) return "fail";
  if (score < 60) return "fail";
  if (findings.some((f) => f.severity === "high") || findings.some((f) => f.severity === "medium") || score < 80)
    return "warning";
  return "pass";
}

// ─── Summary Builders ────────────────────────────────────────────────────────

export function buildSummary(judge: JudgeDefinition, findings: Finding[], score: number, verdict: Verdict): string {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  let summary = `**${judge.name}** — ${judge.domain}\n`;
  summary += `Verdict: **${verdict.toUpperCase()}** | Score: **${score}/100**\n`;
  summary += `Findings: ${critical} critical, ${high} high, ${medium} medium, ${low} low\n\n`;

  if (findings.length === 0) {
    summary +=
      "No pattern-based issues detected. Heuristic analysis has inherent limits — absence of findings does not guarantee the code is free of defects. Manual expert review is strongly recommended.";
  } else {
    summary += "Key issues:\n";
    for (const f of findings.filter((f) => ["critical", "high"].includes(f.severity))) {
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
  highCount: number,
): string {
  let summary = `# Judges Panel — Verdict\n\n`;
  summary += `**Overall Verdict: ${verdict.toUpperCase()}** | **Score: ${score}/100**\n`;
  summary += `Total critical findings: ${criticalCount} | Total high findings: ${highCount}\n\n`;
  summary += `## Individual Judge Results\n\n`;

  for (const e of evaluations) {
    const icon = e.verdict === "pass" ? "✅" : e.verdict === "warning" ? "⚠️" : "❌";
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
      if (typeof finding.confidence === "number") {
        md += `**Confidence:** ${Math.round(finding.confidence * 100)}%\n\n`;
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

// ─── Shared Credential / Placeholder Detection ──────────────────────────────
// Centralised so authentication.ts, data-security.ts, and cybersecurity.ts
// all use the same logic instead of maintaining identical copies.
// ─────────────────────────────────────────────────────────────────────────────

const EXACT_PLACEHOLDERS = new Set([
  "test",
  "testing",
  "mock",
  "dummy",
  "example",
  "sample",
  "fake",
  "na",
  "n/a",
  "none",
  "null",
  "undefined",
  "changeme",
  "change_me",
  "replace_me",
  "replace-me",
  "your_token_here",
  "your_api_key",
  "unused",
  "not_used",
  "placeholder",
]);

export function isLikelyPlaceholderCredentialValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (EXACT_PLACEHOLDERS.has(normalized)) return true;
  if (
    /^(?:test|mock|dummy|sample|example|fake|placeholder|na|n\/a|unused|changeme|replace)[-_a-z0-9]*$/i.test(normalized)
  )
    return true;
  return false;
}

export function isStrictCredentialDetectionEnabled(): boolean {
  return process.env.JUDGES_CREDENTIAL_MODE?.toLowerCase() === "strict";
}

export function looksLikeRealCredentialValue(value: string): boolean {
  if (isLikelyPlaceholderCredentialValue(value)) return false;
  if (!isStrictCredentialDetectionEnabled()) return true;

  const normalized = value.trim();
  if (normalized.length < 12) return false;

  if (
    /(?:test|mock|dummy|sample|example|fake|placeholder|changeme|replace[_-]?me|unused|not[_-]?used|password|secret)/i.test(
      normalized,
    )
  )
    return false;

  const hasLower = /[a-z]/.test(normalized);
  const hasUpper = /[A-Z]/.test(normalized);
  const hasDigit = /\d/.test(normalized);
  const hasSymbol = /[^A-Za-z0-9]/.test(normalized);
  const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (normalized.length >= 20 && classCount >= 2) return true;
  if (normalized.length >= 16 && classCount >= 3) return true;
  return false;
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
    if (typeof finding.confidence === "number") {
      md += `**Confidence:** ${Math.round(finding.confidence * 100)}%\n\n`;
    }
    md += `**Recommendation:** ${finding.recommendation}\n\n`;
    if (finding.reference) {
      md += `**Reference:** ${finding.reference}\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}
