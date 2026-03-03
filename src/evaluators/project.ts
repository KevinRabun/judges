// ─── Project-level Multi-file Analysis ────────────────────────────────────────
// Evaluates multiple files as a project. Runs the tribunal on each file,
// resolves cross-file security mitigations, detects architectural issues
// (duplicated names, inconsistent error handling, import cycles, god modules,
// missing abstraction layers), and performs cross-file taint analysis.
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding, ProjectVerdict, Verdict, Severity, TribunalVerdict } from "../types.js";
import { analyzeCrossFileTaint } from "../ast/index.js";
import { applyConfidenceThreshold, isAbsenceBasedFinding } from "../scoring.js";
import { LRUCache, contentHash } from "../cache.js";
import type { EvaluationOptions } from "./index.js";

// ─── Module-level tribunal result cache ──────────────────────────────────────
const tribunalResultCache = new LRUCache<TribunalVerdict>(256);

/** Clear the project-level tribunal result cache. */
export function clearProjectCache(): void {
  tribunalResultCache.clear();
}

// ─── Tribunal Runner Interface ───────────────────────────────────────────────
// Dependency injection to avoid circular imports between project.ts ↔ index.ts

/** Minimal interface for the tribunal evaluation function */
export interface TribunalRunner {
  evaluateWithTribunal(code: string, language: string, context?: string, options?: EvaluationOptions): TribunalVerdict;
}

// ─── Cross-file Import Resolution ─────────────────────────────────────────────

/** Security-relevant content categories detectable in imported project files */
const CROSS_FILE_SECURITY_CATEGORIES: Array<{
  category: string;
  contentPattern: RegExp;
  findingPattern: RegExp;
  confidenceReduction: number;
}> = [
  {
    category: "authentication",
    contentPattern:
      /(?:passport|authenticate|isAuthenticated|requireAuth|verifyToken|jwt\.verify|authMiddleware|authorize|requireLogin|isLoggedIn|ensureAuth)/i,
    findingPattern: /auth(?:entication|orization)?|unauthorized|login|session.?valid|no.?auth|missing.?auth/i,
    confidenceReduction: -0.2,
  },
  {
    category: "input-validation",
    contentPattern:
      /(?:validate|sanitize|DOMPurify|xss|escape|joi|yup|zod\.object|class-validator|express-validator|check\(|body\(|query\(|param\()/i,
    findingPattern: /input.?valid|sanitiz|unsanitized|xss|injection/i,
    confidenceReduction: -0.15,
  },
  {
    category: "rate-limiting",
    contentPattern: /(?:rateLimit|rateLimiter|throttle|express-rate-limit|bottleneck|too.?many.?requests|429)/i,
    findingPattern: /rate.?limit|throttl|brute.?force|dos\b/i,
    confidenceReduction: -0.2,
  },
  {
    category: "csrf-protection",
    contentPattern: /(?:csrf|csurf|csrfToken|xsrf|antiForgery|AntiForgeryToken|__RequestVerificationToken)/i,
    findingPattern: /csrf|cross.?site\s*request/i,
    confidenceReduction: -0.25,
  },
  {
    category: "security-headers",
    contentPattern:
      /(?:helmet|x-frame-options|content-security-policy|strict-transport-security|x-content-type-options|referrer-policy)/i,
    findingPattern: /security.?header|helmet|hsts|csp\b|x-frame/i,
    confidenceReduction: -0.2,
  },
  {
    category: "error-handling",
    contentPattern:
      /(?:errorHandler|errorMiddleware|handleError|globalErrorHandler|unhandledRejection|uncaughtException)/i,
    findingPattern: /error.?handl|unhandled|raw.?error|error.?leak/i,
    confidenceReduction: -0.15,
  },
  {
    category: "logging",
    contentPattern: /(?:logger|winston|pino|bunyan|morgan|log4j|serilog|createLogger|getLogger)/i,
    findingPattern: /logging|audit.?trail|no.?log/i,
    confidenceReduction: -0.15,
  },
  {
    category: "health-check",
    contentPattern: /(?:\/health|\/healthz|\/readyz|\/ready|\/live|\/liveness|healthCheck|readinessProbe)/i,
    findingPattern: /health.?check|readiness|liveness|no.?health/i,
    confidenceReduction: -0.2,
  },
  {
    category: "graceful-shutdown",
    contentPattern: /(?:SIGTERM|SIGINT|gracefulShutdown|server\.close|process\.on\s*\(\s*['"]SIG)/i,
    findingPattern: /graceful.?shutdown|sigterm|signal.?handl/i,
    confidenceReduction: -0.2,
  },
  {
    category: "cors",
    contentPattern: /(?:cors\s*\(|Access-Control-Allow|allowedOrigins|corsOptions)/i,
    findingPattern: /cors|cross.?origin/i,
    confidenceReduction: -0.15,
  },
  {
    category: "secrets-management",
    contentPattern: /(?:vault|keyVault|secretManager|ssm\.getParameter|getSecret|KMS|dotenv)/i,
    findingPattern: /secret.?manage|hardcoded.?secret|credential.?stor/i,
    confidenceReduction: -0.15,
  },
  {
    category: "environment-config",
    contentPattern: /(?:process\.env|os\.environ|os\.Getenv|System\.getenv|config\.|configuration\.)/i,
    findingPattern: /hardcoded.?config|environment.?variable|config.?management/i,
    confidenceReduction: -0.1,
  },
];

/**
 * Resolve relative imports to project files and detect security-relevant
 * content provided by imported modules. Returns a map of:
 * file path → set of mitigated security categories.
 */
function resolveProjectImports(
  files: Array<{ path: string; content: string; language: string }>,
): Map<string, Set<string>> {
  // Build a path → content lookup (strip extensions for fuzzy matching)
  const fileContentByPath = new Map<string, string>();
  const normalizedPaths = new Map<string, string>(); // normalized → original content

  for (const f of files) {
    fileContentByPath.set(f.path, f.content);
    // Add without extension for fuzzy resolution
    const noExt = f.path.replace(/\.[^.]+$/, "");
    normalizedPaths.set(noExt, f.content);
    // Also add with /index stripped
    const noIndex = noExt.replace(/\/index$/, "");
    if (noIndex !== noExt) {
      normalizedPaths.set(noIndex, f.content);
    }
  }

  // Extract relative imports from each file
  // Merged \s*[\s(]* into [\s(]+ to eliminate overlapping quantifiers
  // (CodeQL js/polynomial-redos).
  const relativeImportPattern = /(?:import|from|require)[\s(]+['"](\.\/?[^'"]+)['"]/g;

  const result = new Map<string, Set<string>>();

  for (const f of files) {
    const mitigated = new Set<string>();
    const dir = f.path.replace(/\/[^/]+$/, "") || ".";

    let match;
    relativeImportPattern.lastIndex = 0;

    // Collect all relative import paths
    const importPaths: string[] = [];
    while ((match = relativeImportPattern.exec(f.content)) !== null) {
      importPaths.push(match[1]);
    }

    for (const importPath of importPaths) {
      // Resolve relative path
      const resolved = resolveRelativePath(dir, importPath);
      const resolvedNoExt = resolved.replace(/\.[^.]+$/, "");

      // Look up the imported file's content
      const importedContent =
        fileContentByPath.get(resolved) ?? normalizedPaths.get(resolvedNoExt) ?? normalizedPaths.get(resolved);

      if (!importedContent) continue;

      // Check what security categories the imported file provides
      for (const cat of CROSS_FILE_SECURITY_CATEGORIES) {
        if (cat.contentPattern.test(importedContent)) {
          mitigated.add(cat.category);
        }
      }
    }

    if (mitigated.size > 0) {
      result.set(f.path, mitigated);
    }
  }

  return result;
}

/** Resolve a relative import path against a directory */
function resolveRelativePath(dir: string, importPath: string): string {
  // Normalize path separators
  const parts = dir.split("/");
  const importParts = importPath.replace(/^\.\//, "").split("/");

  for (const part of importParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * Adjust a file's findings based on security content provided by imported
 * project modules. Returns adjusted findings with reduced confidence for
 * issues mitigated by imports.
 */
function applyCrossFileAdjustments(findings: Finding[], mitigatedCategories: Set<string>): Finding[] {
  return findings.map((f) => {
    const title = f.title + " " + (f.ruleId ?? "");
    let adjustment = 0;

    for (const cat of CROSS_FILE_SECURITY_CATEGORIES) {
      if (mitigatedCategories.has(cat.category) && cat.findingPattern.test(title)) {
        adjustment += cat.confidenceReduction;
        break; // Only apply one category reduction per finding
      }
    }

    if (adjustment !== 0) {
      const currentConf = f.confidence ?? 0.5;
      return {
        ...f,
        confidence: Math.max(0, Math.min(1, currentConf + adjustment)),
        description: (f.description ?? "") + `\n\n_Note: Related security logic detected in imported project module._`,
      };
    }
    return f;
  });
}

/**
 * Scan ALL project files (regardless of import relationships) for security-
 * relevant patterns. Returns the set of security categories found anywhere
 * in the project. This enables project-wide absence resolution: if a security
 * pattern (e.g., helmet middleware, rate limiting) exists in ANY file, absence-
 * based findings about that category can have their confidence reduced.
 */
function scanProjectWideSecurityPatterns(
  files: Array<{ path: string; content: string; language: string }>,
): Set<string> {
  const found = new Set<string>();
  for (const f of files) {
    for (const cat of CROSS_FILE_SECURITY_CATEGORIES) {
      if (!found.has(cat.category) && cat.contentPattern.test(f.content)) {
        found.add(cat.category);
      }
    }
  }
  return found;
}

/**
 * Apply project-wide security pattern resolution to absence-based findings.
 * When a security category exists somewhere in the project (not necessarily
 * in the same file or an imported file), absence-based findings matching
 * that category get their confidence reduced. The reduction is smaller than
 * the direct-import reduction (halved) to reflect the weaker evidence.
 */
function applyProjectWideAbsenceResolution(findings: Finding[], projectWideCategories: Set<string>): Finding[] {
  return findings.map((f) => {
    if (!isAbsenceBasedFinding(f)) return f;

    const title = f.title + " " + (f.ruleId ?? "");
    let adjustment = 0;

    for (const cat of CROSS_FILE_SECURITY_CATEGORIES) {
      if (projectWideCategories.has(cat.category) && cat.findingPattern.test(title)) {
        // Halve the normal reduction — project-wide is weaker evidence than direct import
        adjustment += cat.confidenceReduction * 0.5;
        break;
      }
    }

    if (adjustment !== 0) {
      const currentConf = f.confidence ?? 0.5;
      return {
        ...f,
        confidence: Math.max(0, Math.min(1, currentConf + adjustment)),
        description: (f.description ?? "") + `\n\n_Note: Related security pattern found elsewhere in the project._`,
      };
    }
    return f;
  });
}

// ─── Project Evaluation ───────────────────────────────────────────────────────

/**
 * Evaluate multiple files as a project. Runs the full tribunal on each file,
 * then detects cross-file architectural issues.
 */
export function evaluateProject(
  runner: TribunalRunner,
  files: Array<{ path: string; content: string; language: string }>,
  context?: string,
  options?: EvaluationOptions,
): ProjectVerdict {
  // Resolve cross-file imports to detect security mitigations from imported modules
  const crossFileMitigations = resolveProjectImports(files);

  // Scan all project files for security patterns (regardless of import relationships)
  const projectWideCategories = scanProjectWideSecurityPatterns(files);

  // Per-file evaluations (cached by content hash to skip unchanged files)
  const fileResults = files.map((f) => {
    const hash = contentHash(f.content, f.language);
    let verdict = tribunalResultCache.get(hash);
    if (!verdict) {
      verdict = runner.evaluateWithTribunal(f.content, f.language, context, options);
      tribunalResultCache.set(hash, verdict);
    }
    // Apply cross-file adjustments if this file imports security modules
    const mitigated = crossFileMitigations.get(f.path);
    let adjustedFindings =
      mitigated && mitigated.size > 0 ? applyCrossFileAdjustments(verdict.findings, mitigated) : verdict.findings;
    // Apply project-wide absence resolution for categories found anywhere
    adjustedFindings = applyProjectWideAbsenceResolution(adjustedFindings, projectWideCategories);
    return {
      path: f.path,
      language: f.language,
      findings: adjustedFindings,
      score: verdict.overallScore,
    };
  });

  // Cross-file architectural findings
  const architecturalFindings: Finding[] = [];
  let archRule = 1;

  // Check for duplicated logic across files
  const functionDefs = new Map<string, string[]>();
  for (const f of files) {
    const fns = f.content.match(/(?:function|def|fn|func)\s+(\w+)/g) ?? [];
    for (const fn of fns) {
      const name = fn.replace(/(?:function|def|fn|func)\s+/, "");
      const paths = functionDefs.get(name) ?? [];
      paths.push(f.path);
      functionDefs.set(name, paths);
    }
  }
  const duplicated = [...functionDefs.entries()].filter(([, paths]) => paths.length > 1);
  if (duplicated.length > 0) {
    architecturalFindings.push({
      ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potentially duplicated function names across files",
      description: `Functions with identical names found in multiple files: ${duplicated
        .slice(0, 5)
        .map(([name, paths]) => `${name} (${paths.join(", ")})`)
        .join("; ")}. This may indicate code duplication.`,
      recommendation: "Extract shared logic into a common module and import it where needed.",
    });
  }

  // Check for inconsistent error handling patterns
  const errorPatterns = files.map((f) => ({
    path: f.path,
    hasTryCatch: /try\s*\{/.test(f.content),
    hasResultType: /Result<|Result\(|Either/.test(f.content),
    hasExceptions: /throw\s+new|raise\s+|panic!/.test(f.content),
  }));
  const distinctPatterns = new Set(
    errorPatterns.map((e) => [e.hasTryCatch, e.hasResultType, e.hasExceptions].toString()),
  );
  if (distinctPatterns.size > 1 && files.length > 2) {
    architecturalFindings.push({
      ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
      severity: "low",
      title: "Inconsistent error handling patterns across files",
      description:
        "Different files use different error handling approaches (try/catch vs Result types vs raw throws). This makes the codebase harder to reason about.",
      recommendation: "Standardize on a single error handling strategy across the project.",
    });
  }

  const filteredArchitecturalFindings = applyConfidenceThreshold(architecturalFindings, options);

  // Check for circular-looking dependency indicators
  const importMap = new Map<string, string[]>();
  for (const f of files) {
    const imports = f.content.match(/(?:import|from|require)[\s(]+['"]\.{1,2}\/([^'"]+)['"]/g) ?? [];
    importMap.set(
      f.path,
      // Use indexOf/substring instead of regex to extract the path from each
      // import match — avoids polynomial backtracking on inputs with many
      // non-quote characters (CodeQL js/polynomial-redos alert #35).
      imports.map((i) => {
        const sq = i.indexOf("'");
        const dq = i.indexOf('"');
        let qIdx: number;
        let qChar: string;
        if (sq >= 0 && (dq < 0 || sq < dq)) {
          qIdx = sq;
          qChar = "'";
        } else if (dq >= 0) {
          qIdx = dq;
          qChar = '"';
        } else {
          return i;
        }
        const slash = i.indexOf("/", qIdx);
        if (slash < 0) return i;
        const end = i.indexOf(qChar, slash + 1);
        return end >= 0 ? i.substring(slash + 1, end) : i.substring(slash + 1);
      }),
    );
  }

  // ── Import cycle detection (DFS-based) ──────────────────────────────────
  // Use indexOf instead of regex to avoid polynomial backtracking on paths
  // with many dots or slashes (CodeQL js/polynomial-redos).
  const normalise = (p: string) => {
    const fwd = p.replace(/\\/g, "/");
    const dotIdx = fwd.lastIndexOf(".");
    const noExt = dotIdx >= 0 ? fwd.substring(0, dotIdx) : fwd;
    const slashIdx = noExt.lastIndexOf("/");
    return slashIdx >= 0 ? noExt.substring(slashIdx + 1) : noExt;
  };
  const adjList = new Map<string, Set<string>>();
  for (const f of files) {
    const key = normalise(f.path);
    const deps = (importMap.get(f.path) ?? []).map((d: string) => normalise(d));
    adjList.set(key, new Set(deps));
  }
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  function dfs(node: string, path: string[]): void {
    if (stack.has(node)) {
      const start = path.indexOf(node);
      if (start >= 0) cycles.push(path.slice(start).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const dep of adjList.get(node) ?? []) {
      dfs(dep, [...path, node]);
    }
    stack.delete(node);
  }
  for (const key of adjList.keys()) dfs(key, []);
  if (cycles.length > 0) {
    architecturalFindings.push({
      ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
      severity: "high",
      title: "Import cycle detected",
      description: `Circular import chain${cycles.length > 1 ? "s" : ""} detected: ${cycles
        .slice(0, 3)
        .map((c) => c.join(" → "))
        .join("; ")}. Circular dependencies cause unpredictable initialization order and make refactoring difficult.`,
      recommendation:
        "Break cycles by extracting shared types/interfaces into a separate module, using dependency injection, or restructuring the dependency graph.",
      confidence: 0.85,
    });
  }

  // ── God module detection ────────────────────────────────────────────────
  for (const f of files) {
    const lineCount = f.content.split("\n").length;
    if (lineCount < 500) continue;
    const exportCount = (
      f.content.match(/\bexport\s+(?:function|class|const|let|type|interface|enum|default)\b/g) ?? []
    ).length;
    if (exportCount < 10) continue;
    // Check for multiple concern areas (heuristic: different domain keywords)
    const concerns = [
      /\b(?:auth|login|session|token|credential)\b/i,
      /\b(?:database|query|model|schema|migration)\b/i,
      /\b(?:route|endpoint|handler|controller|middleware)\b/i,
      /\b(?:validate|sanitize|parse|format|transform)\b/i,
      /\b(?:log|logger|audit|monitor|metric)\b/i,
      /\b(?:cache|redis|memcache|store)\b/i,
    ];
    const touchedConcerns = concerns.filter((c) => c.test(f.content)).length;
    if (touchedConcerns >= 3) {
      architecturalFindings.push({
        ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
        severity: "medium",
        title: `Potential god module: ${f.path}`,
        description: `File has ${lineCount} lines, ${exportCount} exports spanning ${touchedConcerns}+ concern areas. Large modules mixing multiple responsibilities are hard to test, review, and maintain.`,
        recommendation:
          "Split into focused modules by concern (e.g. auth.ts, db.ts, routes.ts). Apply the Single Responsibility Principle.",
        confidence: 0.7,
      });
    }
  }

  // ── Missing abstraction layer (routes directly importing DB) ────────────
  const routeFiles = files.filter((f) =>
    /\b(?:app\.(?:get|post|put|delete|patch)|router\.|@(?:Get|Post|Put|Delete|Controller)|@RequestMapping)\b/i.test(
      f.content,
    ),
  );
  for (const rf of routeFiles) {
    const directDb =
      /\b(?:mongoose|sequelize|typeorm|prisma|knex|pg\.Pool|mysql\.create|MongoClient|createConnection)\b/i.test(
        rf.content,
      ) && !/\b(?:service|repository|dao|store|model)\b/i.test(rf.path.toLowerCase());
    if (directDb) {
      architecturalFindings.push({
        ruleId: `ARCH-${String(archRule++).padStart(3, "0")}`,
        severity: "medium",
        title: `Route handler directly uses database driver: ${rf.path}`,
        description:
          "Route/controller file directly imports a database driver without an intermediate service or repository layer. This tightly couples HTTP handling to data access.",
        recommendation:
          "Introduce a service or repository layer between route handlers and database access to improve testability and separation of concerns.",
        confidence: 0.75,
      });
    }
  }

  // Overall scores
  const allFindings = fileResults.flatMap((f) => f.findings);

  // ── Project-level absence dedup ─────────────────────────────────────────
  // Absence-based findings ("No health check", "No rate limiting", etc.) fire
  // on every file that lacks the pattern.  At project level we only want ONE
  // instance per rule title — the one with the highest confidence — to avoid
  // flooding the report with duplicates.
  const deduplicatedFindings: Finding[] = [];
  const absenceBestByTitle = new Map<string, Finding>();
  for (const f of allFindings) {
    if (isAbsenceBasedFinding(f)) {
      const existing = absenceBestByTitle.get(f.title);
      if (!existing || (f.confidence ?? 0) > (existing.confidence ?? 0)) {
        absenceBestByTitle.set(f.title, f);
      }
    } else {
      deduplicatedFindings.push(f);
    }
  }
  deduplicatedFindings.push(...absenceBestByTitle.values());

  // ── Cross-file taint analysis ───────────────────────────────────────────
  const crossFileTaintFlows = analyzeCrossFileTaint(files);
  const crossFileTaintFindings: Finding[] = crossFileTaintFlows.map((flow, idx) => ({
    ruleId: `TAINT-X${String(idx + 1).padStart(3, "0")}`,
    severity:
      flow.sink.kind === "code-execution" || flow.sink.kind === "command-exec"
        ? ("critical" as Severity)
        : flow.sink.kind === "sql-query" || flow.sink.kind === "xss"
          ? ("high" as Severity)
          : ("medium" as Severity),
    title: `Cross-file taint: ${flow.sink.kind} via ${flow.exportedBinding}`,
    description:
      `Untrusted data from ${flow.sourceFile} (line ${flow.source.line}: \`${flow.source.expression}\`) ` +
      `flows across a module boundary via export \`${flow.exportedBinding}\` (imported as \`${flow.importedAs}\`) ` +
      `to a ${flow.sink.kind} sink in ${flow.sinkFile} (line ${flow.sink.line}). ` +
      `Cross-module data flows are particularly dangerous because security reviews often focus on individual files.`,
    lineNumbers: [flow.sink.line],
    recommendation:
      `Sanitize or validate the data at the module boundary — either before exporting from ${flow.sourceFile} ` +
      `or immediately after importing in ${flow.sinkFile}. Consider using a typed validation layer (e.g., Zod, Joi) ` +
      `at the import site to ensure data conforms to expected schemas before use.`,
    reference: "CWE-20: Improper Input Validation",
    confidence: flow.confidence,
  }));

  const crossFindings = [...deduplicatedFindings, ...filteredArchitecturalFindings, ...crossFileTaintFindings];
  const overallScore =
    fileResults.length > 0 ? Math.round(fileResults.reduce((sum, f) => sum + f.score, 0) / fileResults.length) : 100;

  const criticalCount = crossFindings.filter((f) => f.severity === "critical").length;
  const highCount = crossFindings.filter((f) => f.severity === "high").length;

  const overallVerdict: Verdict =
    criticalCount > 0 || overallScore < 60 ? "fail" : highCount > 0 || overallScore < 80 ? "warning" : "pass";

  const summary = `Project analysis: ${files.length} files, ${crossFindings.length} findings, score ${overallScore}/100 — ${overallVerdict.toUpperCase()}`;

  return {
    overallVerdict,
    overallScore,
    summary,
    evaluations: [],
    findings: crossFindings,
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
    fileResults,
    architecturalFindings: filteredArchitecturalFindings,
  };
}
