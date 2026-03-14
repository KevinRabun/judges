/**
 * API versioning audit — detect breaking changes and versioning policy
 * violations across API surface evolution.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VersioningIssue {
  file: string;
  line: number;
  issue: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".yaml",
  ".yml",
  ".json",
  ".graphql",
  ".gql",
  ".proto",
]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (SCAN_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

const BREAKING_PATTERNS: {
  pattern: RegExp;
  issue: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}[] = [
  {
    pattern: /(?:DELETE|REMOVE).*(?:endpoint|route|path)/i,
    issue: "Endpoint removal",
    severity: "critical",
    detail: "Removing an endpoint breaks existing consumers — deprecate first",
  },
  {
    pattern: /(?:removed|deleted)\s+(?:field|property|attribute)/i,
    issue: "Response field removal",
    severity: "critical",
    detail: "Removing response fields breaks parsers — add deprecation notice",
  },
  {
    pattern: /(?:required|mandatory).*(?:added|new)/i,
    issue: "New required field",
    severity: "high",
    detail: "Adding required request fields breaks existing callers",
  },
  {
    pattern: /(?:type|format)\s*(?:changed|modified|updated)/i,
    issue: "Type change",
    severity: "high",
    detail: "Changing field types breaks serialization/deserialization",
  },
  {
    pattern: /(?:rename|renamed)\s+(?:field|property|endpoint)/i,
    issue: "Field/endpoint rename",
    severity: "high",
    detail: "Renaming breaks existing integrations — keep both during transition",
  },
  {
    pattern: /(?:status\s+code|response\s+code).*(?:changed|updated)/i,
    issue: "Status code change",
    severity: "high",
    detail: "Changing status codes breaks error handling in consumers",
  },
  {
    pattern: /\/v\d+\/.*\/v\d+\//i,
    issue: "Multiple version prefixes",
    severity: "medium",
    detail: "Inconsistent version path segments — standardize versioning scheme",
  },
];

const VERSION_PATTERNS: {
  pattern: RegExp;
  issue: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}[] = [
  {
    pattern: /['"]\/api\/[^v]/i,
    issue: "Unversioned API path",
    severity: "high",
    detail: "API paths without version prefix prevent safe evolution",
  },
  {
    pattern: /(?:deprecated|sunset).*(?:no\s+date|without\s+date|missing\s+date)/i,
    issue: "Deprecation without sunset date",
    severity: "medium",
    detail: "Deprecated APIs need a concrete sunset date for consumer planning",
  },
  {
    pattern: /(?:Accept|Content-Type).*(?:version|v=)/i,
    issue: "Header-based versioning detected",
    severity: "medium",
    detail: "Header versioning is harder to discover — ensure docs are explicit",
  },
];

function analyzeFile(filepath: string): VersioningIssue[] {
  const issues: VersioningIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const bp of [...BREAKING_PATTERNS, ...VERSION_PATTERNS]) {
      if (bp.pattern.test(line)) {
        issues.push({ file: filepath, line: i + 1, issue: bp.issue, severity: bp.severity, detail: bp.detail });
      }
    }
  }

  // Check for OpenAPI spec versioning
  if (/openapi|swagger/i.test(content)) {
    if (!/version\s*:\s*['"]?\d+\.\d+/i.test(content)) {
      issues.push({
        file: filepath,
        line: 1,
        issue: "OpenAPI spec missing version",
        severity: "high",
        detail: "API spec should declare a semantic version",
      });
    }
  }

  // Check for GraphQL deprecation
  if (/type\s+\w+\s*\{/i.test(content) && extname(filepath) === ".graphql") {
    const deprecated = (content.match(/@deprecated/g) || []).length;
    const fields = (content.match(/\w+\s*(?:\([^)]*\))?\s*:\s*\w/g) || []).length;
    if (fields > 20 && deprecated === 0) {
      issues.push({
        file: filepath,
        line: 1,
        issue: "Large schema without deprecation markers",
        severity: "medium",
        detail: "Use @deprecated directive to signal field lifecycle",
      });
    }
  }

  return issues;
}

function checkBaselineFile(dir: string): string | null {
  const candidates = ["api-baseline.json", "openapi.yaml", "openapi.json", "swagger.json", "swagger.yaml"];
  for (const c of candidates) {
    if (existsSync(join(dir, c))) return c;
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runApiVersioningAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges api-versioning-audit — Detect breaking changes and versioning policy violations

Usage:
  judges api-versioning-audit [dir]
  judges api-versioning-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: endpoint removals, field deletions, type changes, unversioned paths,
missing deprecation dates, OpenAPI version gaps, GraphQL schema lifecycle.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: VersioningIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const baseline = checkBaselineFile(dir);
  const critCount = allIssues.filter((i) => i.severity === "critical").length;
  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const score = allIssues.length === 0 ? 100 : Math.max(0, 100 - critCount * 20 - highCount * 8);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          baseline,
          score,
          summary: { critical: critCount, high: highCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = critCount > 0 ? "🚫 BREAKING" : highCount > 0 ? "⚠️  REVIEW" : "✅ COMPATIBLE";
    console.log(`\n  API Versioning: ${badge} (${score}/100)\n  ───────────────────────────`);

    if (baseline) console.log(`    📋 Baseline detected: ${baseline}`);
    else console.log("    ⚠️  No API baseline file — consider adding openapi.yaml or api-baseline.json");

    if (allIssues.length === 0) {
      console.log("\n    No versioning issues detected.\n");
      return;
    }

    for (const issue of allIssues) {
      const icon = issue.severity === "critical" ? "🚫" : issue.severity === "high" ? "🔴" : "🟡";
      console.log(`    ${icon} [${issue.severity.toUpperCase()}] ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }

    console.log(
      `\n    Total: ${allIssues.length} | Critical: ${critCount} | High: ${highCount} | Score: ${score}/100\n`,
    );
  }
}
