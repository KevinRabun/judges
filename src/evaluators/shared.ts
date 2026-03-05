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
import { normalizeLanguage, langPattern, isIaC } from "../language-patterns.js";

// ─── Re-export language utilities for convenience ────────────────────────────
export { normalizeLanguage, langPattern };

// ─── Infrastructure-as-Code Detection ────────────────────────────────────────
// Content-based detection of IaC templates (Bicep, Terraform, ARM).
// Complements the language-family-based `isIaC()` from language-patterns.ts
// by detecting IaC content regardless of the language label passed in.
// ─────────────────────────────────────────────────────────────────────────────

const IAC_TEMPLATE_PATTERN =
  /(?:^|\n)\s*(?:param\s+\w+\s+(?:string|int|bool|object|array)|resource\s+\w+\s+'[^']*@\d{4}-\d{2}-\d{2}|@(?:allowed|description|secure)\s*\(|targetScope\s*=|resource\s+"[^"]+"\s+"[^"]+"|variable\s+"|provider\s+"|terraform\s*\{|\$schema.*deploymentTemplate)/im;

/**
 * Detect whether `code` is an Infrastructure-as-Code template (Bicep,
 * Terraform, or ARM) based on content patterns.  This is intentionally
 * separate from `isIaC(lang)` which only checks the language family name —
 * content-based detection works even when the language is mis-classified.
 */
export function isIaCTemplate(code: string): boolean {
  return IAC_TEMPLATE_PATTERN.test(code);
}

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
    // Infrastructure as Code files
    if (/\.(?:tf|tfvars|bicep)$/i.test(lowerPath)) {
      return "config";
    }
    // Data / config files by extension (YAML, JSON, TOML, INI, ENV, properties)
    if (/\.(?:ya?ml|json|jsonc|toml|ini|env|properties|cfg|conf)$/i.test(lowerPath)) {
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
    // Bound [^\n] to {0,200} to prevent polynomial backtracking when a line
    // contains many 'return' sub-strings (CodeQL js/polynomial-redos).
    /(?:res\.(?:send|json|status)|return[^\n]{0,200}(?:ok|healthy|200))/i.test(code)
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

// ─── Framework Detection ─────────────────────────────────────────────────────

/** A framework or middleware detected from code patterns (no AST required). */
export type DetectedFramework = string;

/** Version hint extracted from code or manifest patterns. */
export interface FrameworkVersionHint {
  framework: DetectedFramework;
  /** Detected major version (e.g. 4 for Django 4.x). null if unknown. */
  major: number | null;
  /** Detected minor version if available. null if unknown. */
  minor: number | null;
  /** Raw version string found in source (e.g. "4.2.1", ">=3.0"). */
  raw: string | null;
}

/**
 * Patterns that extract version hints from code, config, or comments.
 * Each entry: [framework, regex with capture group 1 = version string].
 */
const VERSION_DETECT_PATTERNS: [DetectedFramework, RegExp][] = [
  // Python requirements / pyproject.toml
  ["django", /django\s*[=~><]{1,2}\s*([\d.]+)/i],
  ["flask", /flask\s*[=~><]{1,2}\s*([\d.]+)/i],
  ["fastapi", /fastapi\s*[=~><]{1,2}\s*([\d.]+)/i],
  // JavaScript package.json style
  ["express", /["']express["']\s*:\s*["'][~^]?([\d.]+)/i],
  ["next", /["']next["']\s*:\s*["'][~^]?([\d.]+)/i],
  // Java / Kotlin — Spring Boot
  ["spring", /spring-boot(?:-starter)?[:\-](\d+\.\d+[\d.]*)/i],
  ["spring", /org\.springframework\.boot.*version\s*=?\s*['"]?(\d+\.\d+[\d.]*)/i],
  // C# — ASP.NET
  ["aspnet", /Microsoft\.AspNetCore[.\w]*Version=["']?([\d.]+)/i],
  ["aspnet", /net(\d+\.\d+)/i],
  // Ruby Gemfile
  ["rails", /['"]rails['"],?\s*['"]~>\s*([\d.]+)/i],
  // Go go.mod
  ["gin", /github\.com\/gin-gonic\/gin\s+v([\d.]+)/i],
  // PHP composer.json
  ["laravel", /["']laravel\/framework["']\s*:\s*["'][~^]?([\d.]+)/i],
  // Generic version comment
  ["django", /@version\s+Django\s+([\d.]+)/i],
  ["spring", /@version\s+Spring\s+(?:Boot\s+)?([\d.]+)/i],
];

/**
 * Extract framework version hints from code content.
 * Scans for version specifiers in requirements, package.json, go.mod,
 * Gemfile, composer.json, and version comments.
 */
export function detectFrameworkVersions(code: string): FrameworkVersionHint[] {
  const hints: FrameworkVersionHint[] = [];
  const seen = new Set<string>();

  for (const [fw, regex] of VERSION_DETECT_PATTERNS) {
    const match = code.match(regex);
    if (match && match[1]) {
      const key = `${fw}:${match[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = match[1].split(".");
      hints.push({
        framework: fw,
        major: parts[0] ? parseInt(parts[0], 10) : null,
        minor: parts[1] ? parseInt(parts[1], 10) : null,
        raw: match[1],
      });
    }
  }

  return hints;
}

/**
 * Version-aware confidence adjustments. Some security concerns only apply to
 * specific framework versions. Returns the confidence delta (negative = reduce,
 * positive = increase).
 *
 * Examples:
 * - Django ≥4.0 has CSRF enabled by default → reduce CSRF-finding confidence
 * - Spring Boot ≥3.0 requires explicit security configuration → raise concern
 * - Express 5.x deprecates certain middleware → raise concern for old patterns
 */
export function getVersionConfidenceAdjustment(finding: Finding, versions: FrameworkVersionHint[]): number {
  for (const v of versions) {
    if (v.major === null) continue;

    if (v.framework === "django") {
      // Django 4.0+ has async view support and improved CSRF
      if (v.major >= 4 && /csrf/i.test(finding.title)) return -0.15;
      // Django 3.x deprecated certain auth patterns
      if (v.major >= 3 && /password.*reset.*insecure/i.test(finding.title)) return -0.1;
    }

    if (v.framework === "spring") {
      // Spring Boot 3.x requires Spring Security 6 — no more auto-CSRF
      if (v.major >= 3 && /csrf.*auto|default.*csrf/i.test(finding.title)) return 0.1;
      // Spring Boot 2.x had auto-configured security
      if (v.major <= 2 && /security.*missing|no.*security/i.test(finding.title)) return -0.15;
    }

    if (v.framework === "next") {
      // Next.js 13+ App Router has built-in security headers
      if (v.major >= 13 && /security.?header/i.test(finding.title)) return -0.15;
      // Next.js 14+ has improved Server Action security
      if (v.major >= 14 && /server.?action.*insecure/i.test(finding.title)) return -0.1;
    }

    if (v.framework === "express") {
      // Express 5.x deprecated several patterns
      if (v.major >= 5 && /deprecated/i.test(finding.title)) return 0.1;
    }

    if (v.framework === "rails") {
      // Rails 7+ has strong defaults for parameter filtering
      if (v.major >= 7 && /mass.?assign|strong.?param/i.test(finding.title)) return -0.1;
      // Rails 6+ has per-form CSRF tokens
      if (v.major >= 6 && /csrf/i.test(finding.title)) return -0.1;
    }

    if (v.framework === "laravel") {
      // Laravel 9+ has improved validation and typed request factories
      if (v.major >= 9 && /input.?valid|request.?valid/i.test(finding.title)) return -0.1;
    }

    if (v.framework === "aspnet") {
      // .NET 8+ has built-in rate limiting middleware
      if (v.major >= 8 && /rate.?limit/i.test(finding.title)) return -0.15;
    }
  }

  return 0;
}

const FRAMEWORK_DETECT_PATTERNS: [DetectedFramework, RegExp][] = [
  // ── JavaScript / TypeScript ──
  ["express", /\brequire\s*\(\s*['"]express['"]\)|from\s+['"]express['"]/],
  ["next", /from\s+['"]next['"/]|getServerSideProps|getStaticProps|NextRequest|NextResponse/],
  ["hono", /from\s+['"]hono['"/]|new\s+Hono\s*\(/],
  ["koa", /from\s+['"]koa['"/]|new\s+Koa\s*\(|require\s*\(\s*['"]koa['"]\)/],
  ["fastify", /from\s+['"]fastify['"/]|require\s*\(\s*['"]fastify['"]\)/],
  ["helmet", /\bhelmet\s*\(|from\s+['"]helmet['"]/],
  ["express-rate-limit", /express-rate-limit|rateLimit\s*\(\s*\{/],
  ["cors-middleware", /\bcors\s*\(|from\s+['"]cors['"]/],
  ["csurf", /csurf|csrf-csrf/],
  // ── Python ──
  ["fastapi", /from\s+fastapi\s+import|FastAPI\s*\(/],
  ["django", /from\s+django\b|django\.\w+|INSTALLED_APPS/],
  ["flask", /from\s+flask\s+import|Flask\s*\(__name__\)/],
  // ── Java ──
  ["spring", /@SpringBootApplication|@RestController|@(?:Get|Post|Put|Delete)Mapping/],
  // ── C# ──
  ["aspnet", /\[ApiController\]|ControllerBase|Microsoft\.AspNetCore/],
  // ── Go ──
  ["gin", /gin\.Default\s*\(|"github\.com\/gin-gonic\/gin"/],
  // ── Rust ──
  ["actix", /use\s+actix_web|HttpServer::new\s*\(/],
];

/**
 * Finding-title patterns that each framework inherently mitigates.
 * When a framework is detected, findings matching these patterns have their
 * confidence reduced because the framework likely handles the concern.
 */
const FRAMEWORK_MITIGATIONS: Record<string, RegExp> = {
  // Middleware that explicitly handles specific concerns
  helmet: /security.?header|x-frame|hsts|content.security.policy|clickjack/i,
  "express-rate-limit": /rate.?limit|throttl|brute.?force/i,
  "cors-middleware": /cors|cross.?origin/i,
  csurf: /csrf|cross.?site\s*request/i,
  // Frameworks with built-in security features
  next: /csrf|security.?header|x-frame/i,
  django: /csrf|security.?header|xss|cross.?site\s*script/i,
  fastapi: /input.?valid|type.?check|request.?valid|unsanitized.?input/i,
  spring: /csrf|cross.?site\s*request/i,
  aspnet: /csrf|cross.?site\s*request|input.?valid/i,
  gin: /panic|recovery|unhandled/i,
};

/** Confidence reduction when a framework already handles the concern. */
const FRAMEWORK_CONFIDENCE_REDUCTION = 0.2;

/**
 * Detect frameworks and security middleware from code patterns.
 * Works across all languages — no AST required.
 */
export function detectFrameworks(code: string): DetectedFramework[] {
  const detected: DetectedFramework[] = [];
  for (const [name, regex] of FRAMEWORK_DETECT_PATTERNS) {
    if (regex.test(code)) detected.push(name);
  }
  return detected;
}

/**
 * Reduce confidence on findings that are mitigated by a detected framework
 * or middleware. Also applies version-aware adjustments when version hints
 * are found in the code. This is complementary to AST-based import
 * awareness — it works for all languages and detects framework-level
 * mitigations (e.g. Django CSRF, FastAPI validation) that import checks miss.
 */
export function applyFrameworkAwareness(findings: Finding[], code: string): Finding[] {
  const frameworks = detectFrameworks(code);
  const versions = detectFrameworkVersions(code);
  if (frameworks.length === 0 && versions.length === 0) return findings;

  return findings.map((f) => {
    let currentConf = f.confidence ?? 0.5;
    let provenanceNote = "";

    // Framework mitigation adjustments
    for (const fw of frameworks) {
      const pattern = FRAMEWORK_MITIGATIONS[fw];
      if (pattern && pattern.test(f.title)) {
        currentConf = Math.max(0, Math.min(1, currentConf - FRAMEWORK_CONFIDENCE_REDUCTION));
        provenanceNote += provenanceNote ? `; ${fw}-mitigated` : `${fw}-mitigated`;
      }
    }

    // Version-aware fine-tuning
    if (versions.length > 0) {
      const versionDelta = getVersionConfidenceAdjustment(f, versions);
      if (versionDelta !== 0) {
        currentConf = Math.max(0, Math.min(1, currentConf + versionDelta));
        const versionLabel = versions.map((v) => `${v.framework}@${v.raw}`).join(",");
        provenanceNote += provenanceNote ? `; version-adjusted(${versionLabel})` : `version-adjusted(${versionLabel})`;
      }
    }

    if (provenanceNote) {
      return {
        ...f,
        confidence: currentConf,
        provenance: f.provenance ? `${f.provenance}; ${provenanceNote}` : provenanceNote,
      };
    }
    return f;
  });
}

// ─── Shared Utilities ────────────────────────────────────────────────────────
// Helper functions used by all analyzer modules and the evaluation engine.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Regex that matches lines that are purely comments (single-line, block,
 * JSDoc body, Python/Shell hash, Python docstrings, HTML comments).
 * Used by getLineNumbers / getLangLineNumbers to auto-skip comments and by
 * evaluators that iterate lines manually via forEach / for-loops.
 */
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*[\s/]|\*$|#(?![![])|"""|'''|<!--)/;

/**
 * Returns true when `line` is a comment (or JSDoc / docstring delimiter).
 * Evaluators that iterate lines manually should call this at the top of
 * the loop body and `return` / `continue` when it returns true.
 */
export function isCommentLine(line: string): boolean {
  return COMMENT_LINE_RE.test(line);
}
/**
 * Regex that matches lines whose primary content is a string literal value.
 * These appear in object properties (description, suggestedFix, recommendation)
 * and should not be pattern-matched as executable code.
 *
 * Matches lines like:
 *   "Some example code: const x = 1;",
 *   'Another example',
 *   `Template string content`,
 *   "use strict";
 */
const STRING_LITERAL_LINE_RE = /^\s*["'`].*["'`][,;]?\s*$/;

/**
 * Returns true when `line` is primarily a string literal value (e.g. an object
 * property value containing description or example text). Evaluators should
 * skip these lines to avoid false positives from example code in strings.
 */
export function isStringLiteralLine(line: string): boolean {
  return STRING_LITERAL_LINE_RE.test(line);
}

/**
 * Returns true when the source code appears to be a **code-analysis** or
 * **static-analysis tool** rather than application/production code.
 *
 * Heuristic: files that contain ≥ 8 occurrences of `.test(` are almost
 * certainly regex-heavy analysis/evaluator code (e.g. linters, security
 * scanners).  Rules about PII handling, database transactions, structured
 * logging, sovereignty controls, etc. are not meaningful for such files
 * and would only produce false positives.
 *
 * The threshold of 8 was calibrated from the Judges evaluator corpus —
 * typical application files have 0–3 `.test()` calls while evaluators
 * routinely have 15–60+.
 */
export function isLikelyAnalysisCode(code: string): boolean {
  return (code.match(/\.test\s*\(/g) || []).length >= 8;
}

/**
 * Returns true when the source code appears to be a **CLI entry-point** or
 * command-line tool.
 *
 * CLI programs legitimately use `process.exit()`, console logging, and
 * synchronous I/O; flagging those patterns as anti-patterns would be a
 * false positive.
 */
export function isLikelyCLI(code: string): boolean {
  // Shebang or process.argv / commander / yargs / meow patterns
  return (
    /^#!\/usr\/bin\/env\s/m.test(code) ||
    /\bprocess\.argv\b/.test(code) ||
    /\b(?:commander|yargs|meow|cac|citty|clipanion)\b/i.test(code)
  );
}

// ─── Comment & String Stripping ──────────────────────────────────────────────
// Provides `stripCommentsAndStrings()` which replaces all comments and string
// literals with whitespace (preserving line structure) so that whole-file
// boolean checks like `pattern.test(code)` don't match patterns that exist
// only in comments, strings, or documentation.
//
// `testCode()` is a convenience wrapper: it lazily strips the code on first
// call and caches the result for subsequent tests against the same source.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip all comments from source code, replacing their content with spaces.
 * String literals are preserved so that import paths and require() arguments
 * remain matchable. Line structure (newlines) is preserved so that line
 * numbers remain stable.
 *
 * Handles:
 * - Single-line comments: `//`, `#` (Python/Ruby/YAML)
 * - Block comments: slash-star ... star-slash
 * - Python docstrings: `"""..."""` / `'''...'''` (treated as comments)
 *
 * Strings (`"..."`, `'...'`, `` `...` ``) are skipped (preserved) to avoid
 * breaking patterns that intentionally match import paths, require() calls,
 * route strings, etc.
 *
 * This is intentionally a lightweight heuristic — the goal is to eliminate
 * the most common FP source (patterns in comments) without the overhead of
 * a full parser.
 */
export function stripCommentsAndStrings(code: string): string {
  const len = code.length;
  const result: string[] = new Array(len);
  let i = 0;

  while (i < len) {
    const ch = code[i];
    const next = i + 1 < len ? code[i + 1] : "";

    // ── Single-line comment: // ──
    if (ch === "/" && next === "/") {
      while (i < len && code[i] !== "\n") {
        result[i] = " ";
        i++;
      }
      continue;
    }

    // ── Block comment: /* ... */ ──
    if (ch === "/" && next === "*") {
      result[i] = " ";
      result[i + 1] = " ";
      i += 2;
      while (i < len) {
        if (code[i] === "\n") {
          result[i] = "\n";
          i++;
        } else if (code[i] === "*" && i + 1 < len && code[i + 1] === "/") {
          result[i] = " ";
          result[i + 1] = " ";
          i += 2;
          break;
        } else {
          result[i] = " ";
          i++;
        }
      }
      continue;
    }

    // ── Python-style `#` comment (but not `#!`, `#[` for Rust attributes) ──
    if (ch === "#" && next !== "!" && next !== "[") {
      while (i < len && code[i] !== "\n") {
        result[i] = " ";
        i++;
      }
      continue;
    }

    // ── Python triple-quoted strings / docstrings — treat as comments ──
    if (
      (ch === '"' && next === '"' && i + 2 < len && code[i + 2] === '"') ||
      (ch === "'" && next === "'" && i + 2 < len && code[i + 2] === "'")
    ) {
      const quote3 = code.substring(i, i + 3);
      result[i] = " ";
      result[i + 1] = " ";
      result[i + 2] = " ";
      i += 3;
      while (i < len) {
        if (code[i] === "\n") {
          result[i] = "\n";
          i++;
        } else if (code.substring(i, i + 3) === quote3) {
          result[i] = " ";
          result[i + 1] = " ";
          result[i + 2] = " ";
          i += 3;
          break;
        } else {
          result[i] = " ";
          i++;
        }
      }
      continue;
    }

    // ── String literals: "...", '...', `...` — SKIP (preserve) ──
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result[i] = ch; // keep opening quote
      i++;
      while (i < len) {
        if (code[i] === "\\") {
          result[i] = code[i];
          i++;
          if (i < len) {
            result[i] = code[i];
            i++;
          }
        } else if (code[i] === "\n" && quote !== "`") {
          break;
        } else if (code[i] === quote) {
          result[i] = ch; // keep closing quote
          i++;
          break;
        } else {
          result[i] = code[i]; // preserve string content
          i++;
        }
      }
      continue;
    }

    // ── Plain content — keep as-is ──
    result[i] = ch;
    i++;
  }

  return result.join("");
}

/**
 * LRU-style cache for stripped code. Uses a WeakRef-based approach keyed
 * by the code string itself (via a simple Map with bounded size).
 */
const strippedCodeCache = new Map<string, string>();
const MAX_STRIPPED_CACHE = 64;

/**
 * Get or create a stripped version of the source code. Results are cached
 * per unique `code` string so that multiple `testCode()` calls in the same
 * evaluator invocation share one strip pass.
 */
function getStrippedCode(code: string): string {
  let stripped = strippedCodeCache.get(code);
  if (stripped !== undefined) return stripped;

  stripped = stripCommentsAndStrings(code);

  // Evict oldest entry if cache is full
  if (strippedCodeCache.size >= MAX_STRIPPED_CACHE) {
    const first = strippedCodeCache.keys().next().value;
    if (first !== undefined) strippedCodeCache.delete(first);
  }
  strippedCodeCache.set(code, stripped);
  return stripped;
}

/**
 * Test whether a regex pattern matches in executable code (ignoring
 * comments). String literals are preserved so that import paths, require()
 * arguments, and route strings remain matchable. Drop-in replacement for
 * `pattern.test(code)` that strips comments first.
 *
 * @example
 * ```ts
 * // Instead of:
 * const hasRateLimit = /rateLimit/i.test(code);
 * // Use:
 * const hasRateLimit = testCode(code, /rateLimit/i);
 * ```
 */
export function testCode(code: string, pattern: RegExp): boolean {
  const stripped = getStrippedCode(code);
  pattern.lastIndex = 0;
  return pattern.test(stripped);
}

/**
 * Get a multi-line context window around a specific line number.
 * Returns the concatenated text of lines within ±radius of the target line.
 * Useful for post-match filtering where the relevant pattern (e.g., a
 * fallback operator `??`/`||`, an `await`, a config block brace) may appear
 * on an adjacent line rather than the matched line itself.
 *
 * @param lines  Array of source code lines (0-indexed)
 * @param lineNum  1-based line number (as returned by getLineNumbers)
 * @param radius  Number of lines to include before and after (default 3)
 * @returns  Concatenated text of lines in the window
 */
export function getContextWindow(lines: string[], lineNum: number, radius = 3): string {
  const start = Math.max(0, lineNum - 1 - radius);
  const end = Math.min(lines.length, lineNum + radius);
  return lines.slice(start, end).join("\n");
}

/**
 * Find line numbers in source code that match a given regex pattern.
 * By default, comment lines and string-literal-only lines are skipped
 * to avoid false positives from documentation/example text.
 * Pass `{ skipComments: false }` to include comments.
 * Pass `{ skipStringLiterals: false }` to include string-literal lines.
 */
export function getLineNumbers(
  code: string,
  pattern: RegExp,
  opts?: { skipComments?: boolean; skipStringLiterals?: boolean },
): number[] {
  const skipComments = opts?.skipComments !== false; // default true
  const skipStrings = opts?.skipStringLiterals !== false; // default true
  const lines = code.split("\n");
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (skipComments && COMMENT_LINE_RE.test(lines[i])) continue;
    if (skipStrings && STRING_LITERAL_LINE_RE.test(lines[i])) continue;
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
 * Comment lines are skipped by default (see getLineNumbers).
 * String-literal skipping is automatically disabled for IaC languages
 * (ARM/Terraform/Bicep) since their content is structured data where
 * quoted values ARE the meaningful code.
 */
export function getLangLineNumbers(
  code: string,
  language: string,
  patterns: Partial<Record<LangFamily | "jsts" | "all", string>>,
  opts?: { skipComments?: boolean; skipStringLiterals?: boolean },
): number[] {
  const lang = normalizeLanguage(language);
  const re = langPattern(lang, patterns);
  if (!re) return [];
  // IaC content (JSON/HCL/Bicep) is structured data — don't skip "string" lines
  const effectiveOpts =
    isIaC(lang) && opts?.skipStringLiterals === undefined ? { ...opts, skipStringLiterals: false } : opts;
  return getLineNumbers(code, re, effectiveOpts);
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
  // Proper error handling (try/catch with actual handling, not empty catch).
  // Use a line-by-line scan instead of a single whole-file regex to avoid
  // polynomial backtracking when 'catch(' appears inside the [^}] window
  // (CodeQL js/polynomial-redos).
  const catchHasHandler = (() => {
    const cl = code.split("\n");
    for (let ci = 0; ci < cl.length; ci++) {
      if (!/catch\s*\(/.test(cl[ci])) continue;
      const window = cl.slice(ci, ci + 15).join("\n");
      if (/\b(?:log|throw|return|next|reject|emit)\b/i.test(window)) return true;
    }
    return false;
  })();
  if (catchHasHandler) bonus += 2;
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
  const basePenalty: Record<string, number> = {
    critical: 30,
    high: 18,
    medium: 10,
    low: 5,
    info: 2,
  };

  let score = 100;
  for (const f of findings) {
    const penalty = basePenalty[f.severity] ?? 0;
    // Weight deductions by confidence — low-confidence findings have less impact
    const confidence = f.confidence ?? 0.5;
    score -= penalty * confidence;
  }

  // Add positive signals bonus if code is provided
  if (code) {
    score += detectPositiveSignals(code);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function deriveVerdict(findings: Finding[], score: number): Verdict {
  // Only fail on critical findings with sufficient confidence
  if (findings.some((f) => f.severity === "critical" && (f.confidence ?? 0.5) >= 0.6)) return "fail";
  if (score < 60) return "fail";
  // High/medium findings need reasonable confidence to trigger warning
  const significantFindings = findings.filter(
    (f) => (f.severity === "high" || f.severity === "medium") && (f.confidence ?? 0.5) >= 0.4,
  );
  if (significantFindings.length > 0 || score < 80) return "warning";
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

  // Natural language strings (error messages, descriptions, etc.) are not secrets.
  // Heuristic: if it contains 3+ space-separated words, it's likely prose.
  const wordCount = normalized.split(/\s+/).filter((w) => w.length > 1).length;
  if (wordCount >= 3) return false;

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
 * Determine whether a value extracted from an IaC property (Bicep/Terraform/ARM)
 * looks like a real secret rather than a benign config value.
 *
 * IaC patterns match property names like `token`, `key`, `secret` — but the
 * values are often boolean-strings (`'true'`/`'false'`), enum identifiers
 * (`'GuestAttestation'`), or well-known config placeholders.  This filter
 * rejects those non-secret values.
 */
export function looksLikeIaCSecretValue(value: string): boolean {
  const v = value.trim();

  // Boolean-string config values
  if (/^(?:true|false|yes|no|enabled|disabled|on|off|none)$/i.test(v)) return false;

  // Too short to be a real secret (less than 8 chars)
  if (v.length < 8) return false;

  // PascalCase / camelCase single-word identifiers — enum-style config values
  // e.g., 'GuestAttestation', 'SystemAssigned', 'ConfidentialVM'
  if (/^[A-Z][a-zA-Z0-9]+$/.test(v) && !/[0-9]{4,}/.test(v)) return false;

  // Known non-secret IaC config values
  if (
    /^(?:SystemAssigned|UserAssigned|Standard|Premium|Basic|Hot|Cool|Archive|Enabled|Disabled|Allow|Deny|ReadOnly|ReadWrite|CanNotDelete|NotSpecified|Succeeded|Failed|Running|Stopped|Deallocated|TLS1_2|GuestAttestation|ManagedDisks|ConfidentialVM|DiskWithVMGuestState)$/i.test(
      v,
    )
  )
    return false;

  // Placeholder / example markers
  if (isLikelyPlaceholderCredentialValue(v)) return false;

  return true;
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
