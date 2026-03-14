/**
 * API audit — security audit for REST/GraphQL API endpoints.
 * Detects missing rate limiting, CORS misconfig, unauthenticated routes,
 * input validation gaps, and overly permissive responses.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiEndpoint {
  file: string;
  line: number;
  method: string;
  path: string;
  framework: string;
}

interface ApiIssue {
  file: string;
  line: number;
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  recommendation: string;
  endpoint?: string;
}

interface FrameworkDetector {
  name: string;
  routePattern: RegExp;
  extractEndpoint: (match: RegExpExecArray) => { method: string; path: string };
}

// ─── Framework detectors ────────────────────────────────────────────────────

const FRAMEWORK_DETECTORS: FrameworkDetector[] = [
  {
    name: "express",
    routePattern: /(?:app|router)\.(get|post|put|patch|delete|all|use)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    extractEndpoint: (m) => ({ method: m[1].toUpperCase(), path: m[2] }),
  },
  {
    name: "fastify",
    routePattern: /(?:fastify|server|app)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    extractEndpoint: (m) => ({ method: m[1].toUpperCase(), path: m[2] }),
  },
  {
    name: "flask",
    routePattern: /@(?:app|blueprint)\.route\s*\(\s*["']([^"']+)["'](?:.*methods\s*=\s*\[([^\]]+)\])?/gi,
    extractEndpoint: (m) => ({ method: m[2] ? m[2].replace(/['"]/g, "") : "GET", path: m[1] }),
  },
  {
    name: "spring",
    routePattern: /@(?:Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/gi,
    extractEndpoint: (m) => {
      const methodMatch = m[0].match(/@(Get|Post|Put|Patch|Delete|Request)Mapping/i);
      return { method: methodMatch ? methodMatch[1].toUpperCase() : "ANY", path: m[1] };
    },
  },
  {
    name: "django",
    routePattern: /path\s*\(\s*["']([^"']+)["']/gi,
    extractEndpoint: (m) => ({ method: "ANY", path: m[1] }),
  },
];

// ─── API security rules ────────────────────────────────────────────────────

interface ApiRule {
  id: string;
  severity: ApiIssue["severity"];
  check: (content: string, lines: string[], endpoints: ApiEndpoint[]) => ApiIssue[];
}

const API_RULES: ApiRule[] = [
  {
    id: "no-rate-limiting",
    severity: "high",
    check: (content, _lines, endpoints) => {
      if (endpoints.length === 0) return [];
      const hasRateLimit = /(?:rate[-_]?limit|rateLimit|throttle|express-rate-limit|@nestjs\/throttler|slowDown)/i.test(
        content,
      );
      if (!hasRateLimit) {
        return [
          {
            file: "",
            line: 1,
            ruleId: "no-rate-limiting",
            severity: "high",
            message: "No rate limiting detected — API vulnerable to abuse",
            recommendation: "Add rate limiting middleware (e.g., express-rate-limit)",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "cors-wildcard",
    severity: "high",
    check: (_content, lines) => {
      const issues: ApiIssue[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/cors\s*\(\s*\)|origin:\s*['"]?\*['"]?|Access-Control-Allow-Origin.*\*/i.test(lines[i])) {
          issues.push({
            file: "",
            line: i + 1,
            ruleId: "cors-wildcard",
            severity: "high",
            message: "CORS allows all origins (wildcard *)",
            recommendation: "Restrict CORS to specific trusted domains",
          });
        }
      }
      return issues;
    },
  },
  {
    id: "unauthenticated-endpoint",
    severity: "medium",
    check: (content, lines, endpoints) => {
      if (endpoints.length === 0) return [];
      const hasAuthMiddleware = /(?:passport|jwt|auth(?:enticate|orize)|bearer|keycloak|oauth|session)/i.test(content);
      if (!hasAuthMiddleware) {
        return [
          {
            file: "",
            line: 1,
            ruleId: "unauthenticated-endpoint",
            severity: "medium",
            message: `${endpoints.length} endpoints found with no authentication middleware detected`,
            recommendation: "Add authentication middleware (JWT, session, OAuth)",
          },
        ];
      }
      // Check individual routes missing auth
      const issues: ApiIssue[] = [];
      for (const ep of endpoints) {
        const lineContent = lines[ep.line - 1] || "";
        const nextContent = lines[ep.line] || "";
        if (!/auth|protect|guard|session/i.test(lineContent) && !/auth|protect|guard|session/i.test(nextContent)) {
          if (!/health|ping|status|public|login|register|signup|webhook|callback/i.test(ep.path)) {
            issues.push({
              file: ep.file,
              line: ep.line,
              ruleId: "unauthenticated-endpoint",
              severity: "medium",
              message: `Endpoint ${ep.method} ${ep.path} may lack authentication`,
              recommendation: "Add authentication middleware to this route",
              endpoint: `${ep.method} ${ep.path}`,
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: "no-input-validation",
    severity: "high",
    check: (content, _lines, endpoints) => {
      if (endpoints.length === 0) return [];
      const hasValidation =
        /(?:joi|yup|zod|celebrate|express-validator|class-validator|@IsString|@IsNumber|validation)/i.test(content);
      if (!hasValidation) {
        return [
          {
            file: "",
            line: 1,
            ruleId: "no-input-validation",
            severity: "high",
            message: "No input validation library detected — vulnerable to injection",
            recommendation: "Use a validation library (Zod, Joi, express-validator)",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "sensitive-data-response",
    severity: "high",
    check: (_content, lines) => {
      const issues: ApiIssue[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (
          /(?:res\.json|res\.send|response\.json|jsonify)\s*\(.*(?:password|secret|token|ssn|credit_?card)/i.test(
            lines[i],
          )
        ) {
          issues.push({
            file: "",
            line: i + 1,
            ruleId: "sensitive-data-response",
            severity: "high",
            message: "Potentially sensitive data in API response",
            recommendation: "Sanitize response objects — remove sensitive fields before sending",
          });
        }
      }
      return issues;
    },
  },
  {
    id: "helmet-missing",
    severity: "medium",
    check: (content, _lines, endpoints) => {
      if (endpoints.length === 0) return [];
      const isExpress = /require\s*\(\s*["']express["']\)|from\s+["']express["']/i.test(content);
      if (isExpress && !/helmet/i.test(content)) {
        return [
          {
            file: "",
            line: 1,
            ruleId: "helmet-missing",
            severity: "medium",
            message: "Express app without Helmet — missing security headers",
            recommendation: "Add helmet middleware for security headers",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "sql-in-route",
    severity: "critical",
    check: (_content, lines) => {
      const issues: ApiIssue[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (
          /(?:query|execute)\s*\(\s*[`"']?\s*(?:SELECT|INSERT|UPDATE|DELETE).*\$\{|(?:req\.(?:body|params|query))/i.test(
            lines[i],
          )
        ) {
          issues.push({
            file: "",
            line: i + 1,
            ruleId: "sql-in-route",
            severity: "critical",
            message: "Potential SQL injection — user input in query string",
            recommendation: "Use parameterized queries or an ORM",
          });
        }
      }
      return issues;
    },
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const CODE_EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (CODE_EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

function extractEndpoints(filePath: string, content: string): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const lines = content.split("\n");
  for (const detector of FRAMEWORK_DETECTORS) {
    detector.routePattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = detector.routePattern.exec(content)) !== null) {
      const ep = detector.extractEndpoint(m);
      const offset = content.substring(0, m.index).split("\n").length;
      endpoints.push({ file: filePath, line: offset, method: ep.method, path: ep.path, framework: detector.name });
    }
    void lines;
  }
  return endpoints;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runApiAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges api-audit — Security audit for REST/GraphQL API endpoints

Usage:
  judges api-audit [dir]
  judges api-audit src/ --severity critical,high

Options:
  --severity <levels>   Filter by severity (comma-separated)
  --endpoints           List discovered API endpoints only
  --rules               List all API audit rules
  --format json         JSON output
  --help, -h            Show this help

Frameworks: Express, Fastify, Flask, Spring, Django
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (argv.includes("--rules")) {
    const rules = API_RULES.map(({ check: _c, ...rest }) => rest);
    if (format === "json") {
      console.log(JSON.stringify(rules, null, 2));
    } else {
      console.log(`\n  API Audit Rules (${rules.length})\n  ──────────────────────────`);
      for (const r of rules) console.log(`    [${r.severity.toUpperCase().padEnd(8)}] ${r.id}`);
      console.log("");
    }
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const files = collectFiles(target);
  const allEndpoints: ApiEndpoint[] = [];
  let allIssues: ApiIssue[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const endpoints = extractEndpoints(file, content);
    allEndpoints.push(...endpoints);

    const lines = content.split("\n");
    for (const rule of API_RULES) {
      const issues = rule.check(content, lines, endpoints);
      for (const issue of issues) {
        issue.file = issue.file || file;
        allIssues.push(issue);
      }
    }
  }

  if (argv.includes("--endpoints")) {
    if (format === "json") {
      console.log(JSON.stringify(allEndpoints, null, 2));
    } else {
      console.log(`\n  Discovered API Endpoints (${allEndpoints.length})\n  ──────────────────────────`);
      for (const ep of allEndpoints) {
        console.log(`    ${ep.method.padEnd(7)} ${ep.path.padEnd(30)} [${ep.framework}] ${ep.file}:${ep.line}`);
      }
      console.log("");
    }
    return;
  }

  if (sevFilter) {
    const allowed = sevFilter.split(",");
    allIssues = allIssues.filter((i) => allowed.includes(i.severity));
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        { endpoints: allEndpoints, issues: allIssues, scannedFiles: files.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    console.log(`\n  API Security Audit — ${files.length} files scanned`);
    console.log(`  Endpoints: ${allEndpoints.length} | Issues: ${allIssues.length}\n  ──────────────────────────`);

    if (allIssues.length === 0) {
      console.log(`    ✅ No API security issues detected\n`);
      return;
    }

    for (const sev of ["critical", "high", "medium", "low"]) {
      const items = allIssues.filter((i) => i.severity === sev);
      if (items.length === 0) continue;
      console.log(`\n    ${sev.toUpperCase()} (${items.length})`);
      for (const issue of items) {
        console.log(`      ${issue.file}:${issue.line} — ${issue.ruleId}`);
        console.log(`        ${issue.message}`);
        console.log(`        → ${issue.recommendation}`);
      }
    }
    console.log("");
  }
}
