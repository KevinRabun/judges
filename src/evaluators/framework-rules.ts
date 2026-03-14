/**
 * Framework-aware detection module.
 *
 * Detects which framework(s) are in use and provides framework-specific
 * pattern adjustments to reduce false positives. For example:
 * - React: hooks ordering rules, JSX injection awareness
 * - Express/Fastify: middleware chain analysis
 * - Django: ORM injection patterns
 * - Spring: security annotation awareness
 * - Next.js: server-component vs client-component context
 *
 * This module is used by evaluators to adjust their confidence scores
 * and disable irrelevant rules based on framework context.
 */

import type { Finding, Severity } from "../types.js";

// ─── Framework Definitions ──────────────────────────────────────────────────

export type FrameworkId =
  | "react"
  | "nextjs"
  | "angular"
  | "vue"
  | "express"
  | "fastify"
  | "nestjs"
  | "django"
  | "flask"
  | "fastapi"
  | "spring"
  | "rails"
  | "actix"
  | "gin"
  | "echo";

export interface FrameworkProfile {
  /** Framework identifier */
  id: FrameworkId;
  /** Human-readable name */
  name: string;
  /** Languages this framework applies to */
  languages: string[];
  /** Import/require patterns that identify this framework */
  detectPatterns: RegExp[];
  /** Rule IDs that are typically false positives in this framework */
  fpProne: string[];
  /** Rules whose severity should be adjusted in this framework context */
  severityAdjustments: Array<{
    rulePattern: string;
    adjustment: "downgrade" | "upgrade";
    reason: string;
  }>;
  /** Additional patterns to check for framework-specific issues */
  frameworkRules: Array<{
    id: string;
    pattern: RegExp;
    severity: Severity;
    title: string;
    description: string;
  }>;
}

// ─── Framework Profiles ─────────────────────────────────────────────────────

const FRAMEWORK_PROFILES: FrameworkProfile[] = [
  {
    id: "react",
    name: "React",
    languages: ["typescript", "javascript"],
    detectPatterns: [
      /import\s+.*\bReact\b.*from\s+['"]react['"]/,
      /from\s+['"]react['"]/,
      /import\s+{.*useState|useEffect|useRef|useMemo|useCallback.*}\s+from\s+['"]react['"]/,
    ],
    fpProne: ["PERF-002", "DOC-003"],
    severityAdjustments: [
      { rulePattern: "SEC-XSS", adjustment: "downgrade", reason: "React auto-escapes JSX by default" },
    ],
    frameworkRules: [
      {
        id: "FW-REACT-001",
        pattern: /useEffect\s*\(\s*(?:async|(?:\(\)\s*=>\s*\{[\s\S]*?await))/,
        severity: "medium",
        title: "Async function in useEffect",
        description: "useEffect callbacks should not be async. Use an inner async function instead.",
      },
      {
        id: "FW-REACT-002",
        pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
        severity: "high",
        title: "dangerouslySetInnerHTML usage",
        description: "Direct HTML injection via dangerouslySetInnerHTML — ensure content is sanitized.",
      },
      {
        id: "FW-REACT-003",
        pattern: /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;/,
        severity: "low",
        title: "useEffect missing dependency array",
        description: "useEffect without a dependency array runs on every render.",
      },
    ],
  },
  {
    id: "nextjs",
    name: "Next.js",
    languages: ["typescript", "javascript"],
    detectPatterns: [/from\s+['"]next\//, /import\s+.*from\s+['"]next\//],
    fpProne: ["PERF-002"],
    severityAdjustments: [
      {
        rulePattern: "SEC-XSS",
        adjustment: "downgrade",
        reason: "Next.js uses React auto-escaping and server components",
      },
    ],
    frameworkRules: [
      {
        id: "FW-NEXT-001",
        pattern: /getServerSideProps.*\bres\.end\b/s,
        severity: "medium",
        title: "Response ended in getServerSideProps",
        description: "Calling res.end() in getServerSideProps can cause unexpected behavior.",
      },
    ],
  },
  {
    id: "express",
    name: "Express.js",
    languages: ["typescript", "javascript"],
    detectPatterns: [/from\s+['"]express['"]/, /require\s*\(\s*['"]express['"]\s*\)/],
    fpProne: [],
    severityAdjustments: [],
    frameworkRules: [
      {
        id: "FW-EXPRESS-001",
        pattern:
          /app\.(get|post|put|delete|patch)\s*\([^,]+,\s*(?:async\s+)?\(\s*req\s*,\s*res\s*\)\s*=>\s*\{(?:(?!try\s*\{)[\s\S])*\}\s*\)/,
        severity: "medium",
        title: "Express route handler without error handling",
        description: "Route handler lacks try-catch — unhandled errors crash the process.",
      },
      {
        id: "FW-EXPRESS-002",
        pattern: /app\.use\s*\(\s*cors\s*\(\s*\)\s*\)/,
        severity: "high",
        title: "CORS with no origin restriction",
        description: "cors() with no options allows all origins. Restrict to trusted domains.",
      },
    ],
  },
  {
    id: "fastify",
    name: "Fastify",
    languages: ["typescript", "javascript"],
    detectPatterns: [/from\s+['"]fastify['"]/, /require\s*\(\s*['"]fastify['"]\s*\)/],
    fpProne: [],
    severityAdjustments: [
      { rulePattern: "PERF-", adjustment: "downgrade", reason: "Fastify has built-in perf optimizations" },
    ],
    frameworkRules: [],
  },
  {
    id: "django",
    name: "Django",
    languages: ["python"],
    detectPatterns: [/from\s+django/, /import\s+django/],
    fpProne: ["SEC-SQLI-001"],
    severityAdjustments: [
      { rulePattern: "SEC-SQLI", adjustment: "downgrade", reason: "Django ORM auto-parameterizes queries" },
    ],
    frameworkRules: [
      {
        id: "FW-DJANGO-001",
        pattern: /\.raw\s*\(\s*f['"]|\.raw\s*\(\s*['"].*%s/,
        severity: "critical",
        title: "Raw SQL with user input in Django",
        description: "Using .raw() with f-strings or %s formatting bypasses Django ORM protection.",
      },
      {
        id: "FW-DJANGO-002",
        pattern: /\|safe\b/,
        severity: "high",
        title: "Django template |safe filter",
        description: "The |safe filter disables auto-escaping — ensure content is trusted.",
      },
    ],
  },
  {
    id: "flask",
    name: "Flask",
    languages: ["python"],
    detectPatterns: [/from\s+flask\s+import/, /import\s+flask/],
    fpProne: [],
    severityAdjustments: [],
    frameworkRules: [
      {
        id: "FW-FLASK-001",
        pattern: /app\.run\s*\(\s*debug\s*=\s*True/,
        severity: "high",
        title: "Flask debug mode in production",
        description: "Debug mode exposes the Werkzeug debugger — never enable in production.",
      },
    ],
  },
  {
    id: "fastapi",
    name: "FastAPI",
    languages: ["python"],
    detectPatterns: [/from\s+fastapi\s+import/, /import\s+fastapi/],
    fpProne: ["SEC-SQLI-001"],
    severityAdjustments: [
      { rulePattern: "PERF-", adjustment: "downgrade", reason: "FastAPI has built-in async performance" },
    ],
    frameworkRules: [],
  },
  {
    id: "spring",
    name: "Spring Boot",
    languages: ["java"],
    detectPatterns: [/@SpringBootApplication/, /import\s+org\.springframework\./],
    fpProne: ["AUTH-001"],
    severityAdjustments: [
      {
        rulePattern: "AUTH-",
        adjustment: "downgrade",
        reason: "Spring Security annotation-based auth is often not visible in single-file analysis",
      },
    ],
    frameworkRules: [
      {
        id: "FW-SPRING-001",
        pattern: /@RequestMapping\s*(?!\(.*method\s*=)/,
        severity: "medium",
        title: "RequestMapping without HTTP method",
        description: "@RequestMapping without explicit method accepts all HTTP methods.",
      },
    ],
  },
  {
    id: "rails",
    name: "Ruby on Rails",
    languages: ["ruby"],
    detectPatterns: [/class\s+\w+\s*<\s*ApplicationController/, /Rails\.application/],
    fpProne: ["SEC-XSS"],
    severityAdjustments: [
      { rulePattern: "SEC-XSS", adjustment: "downgrade", reason: "Rails auto-escapes ERB output by default" },
      { rulePattern: "SEC-SQLI", adjustment: "downgrade", reason: "ActiveRecord auto-parameterizes queries" },
    ],
    frameworkRules: [
      {
        id: "FW-RAILS-001",
        pattern: /\.html_safe\b/,
        severity: "high",
        title: "html_safe bypasses Rails escaping",
        description: "html_safe marks a string as safe — ensure content is sanitized first.",
      },
    ],
  },
];

// ─── Detection ──────────────────────────────────────────────────────────────

/**
 * Detect which frameworks are present in the given code.
 */
export function detectFrameworks(code: string, language: string): FrameworkProfile[] {
  return FRAMEWORK_PROFILES.filter((fw) => {
    if (!fw.languages.includes(language)) return false;
    return fw.detectPatterns.some((p) => p.test(code));
  });
}

// ─── Finding Adjustment ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const RANK_TO_SEVERITY: Record<number, Severity> = { 4: "critical", 3: "high", 2: "medium", 1: "low", 0: "info" };

/**
 * Adjust findings based on detected framework context.
 * - Downgrades severity for FP-prone rules in the framework
 * - Applies framework-specific severity adjustments
 * - Tags adjusted findings with provenance
 */
export function adjustFindingsForFramework(findings: Finding[], frameworks: FrameworkProfile[]): Finding[] {
  if (frameworks.length === 0) return findings;

  const fpProne = new Set(frameworks.flatMap((fw) => fw.fpProne));
  const adjustments = frameworks.flatMap((fw) => fw.severityAdjustments);

  return findings.map((f) => {
    let adjusted = { ...f };

    // Downgrade FP-prone rules
    if (fpProne.has(f.ruleId)) {
      const rank = SEVERITY_RANK[f.severity] ?? 2;
      const newRank = Math.max(0, rank - 1);
      adjusted = {
        ...adjusted,
        severity: RANK_TO_SEVERITY[newRank] ?? f.severity,
        confidence: Math.max(0, (f.confidence ?? 0.5) - 0.15),
        evidenceBasis: `${f.evidenceBasis ?? ""} framework-adjusted(-0.15)`.trim(),
      };
    }

    // Apply severity adjustments
    for (const adj of adjustments) {
      if (f.ruleId.startsWith(adj.rulePattern) || f.ruleId.includes(adj.rulePattern)) {
        const rank = SEVERITY_RANK[adjusted.severity] ?? 2;
        const delta = adj.adjustment === "downgrade" ? -1 : 1;
        const newRank = Math.max(0, Math.min(4, rank + delta));
        adjusted = {
          ...adjusted,
          severity: RANK_TO_SEVERITY[newRank] ?? adjusted.severity,
          evidenceBasis: `${adjusted.evidenceBasis ?? ""} ${adj.reason}`.trim(),
        };
      }
    }

    return adjusted;
  });
}

// ─── Framework-Specific Rule Evaluation ─────────────────────────────────────

/**
 * Run framework-specific rules against code.
 * Returns additional findings from framework-aware patterns.
 */
export function evaluateFrameworkRules(code: string, language: string): Finding[] {
  const frameworks = detectFrameworks(code, language);
  const findings: Finding[] = [];

  for (const fw of frameworks) {
    for (const rule of fw.frameworkRules) {
      const matches = code.matchAll(new RegExp(rule.pattern, "g"));
      for (const match of matches) {
        const lineNumber = code.substring(0, match.index ?? 0).split("\n").length;
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          title: `[${fw.name}] ${rule.title}`,
          description: rule.description,
          lineNumbers: [lineNumber],
          recommendation: rule.description,
          confidence: 0.85,
          provenance: "framework-knowledge",
        });
      }
    }
  }

  return findings;
}
