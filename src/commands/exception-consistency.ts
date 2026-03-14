/**
 * Exception consistency — detect inconsistent exception handling
 * patterns within a codebase: thrown-but-uncaught, asymmetric
 * try/catch/finally, unhandled promise rejections, mixed strategies.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExceptionIssue {
  file: string;
  line: number;
  kind: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java", ".cs", ".go", ".rs"]);

function collectFiles(dir: string, max = 500): string[] {
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
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const PATTERNS: { name: string; regex: RegExp; severity: "high" | "medium" | "low"; message: string }[] = [
  {
    name: "empty-catch",
    regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
    severity: "high",
    message: "Empty catch block silently swallows exception",
  },
  {
    name: "catch-ignore-error",
    regex: /catch\s*\(\s*_?\s*\)\s*\{/,
    severity: "medium",
    message: "Catch block ignores error variable",
  },
  {
    name: "throw-string",
    regex: /throw\s+['"`]/,
    severity: "medium",
    message: "Throwing a string literal instead of an Error object",
  },
  {
    name: "catch-console-only",
    regex: /catch\s*\([^)]*\)\s*\{\s*console\.(log|error|warn)\([^)]*\);\s*\}/,
    severity: "medium",
    message: "Catch block only logs — error is not re-thrown or handled",
  },
  {
    name: "unhandled-promise",
    regex: /\.then\([^)]*\)\s*(?!\.catch)/,
    severity: "medium",
    message: "Promise chain without .catch() — potential unhandled rejection",
  },
  {
    name: "async-no-try",
    regex: /async\s+function\s+\w+[^{]*\{(?:(?!try\s*\{)[\s\S])*await\s/,
    severity: "low",
    message: "Async function uses await without try/catch",
  },
  {
    name: "catch-rethrow-same",
    regex: /catch\s*\(\s*(\w+)\s*\)\s*\{\s*throw\s+\1\s*;?\s*\}/,
    severity: "low",
    message: "Catch block only re-throws the same error — unnecessary try/catch",
  },
  {
    name: "generic-catch",
    regex: /catch\s*\(\s*(\w+)\s*:\s*any\s*\)/,
    severity: "low",
    message: "Catching 'any' type — use typed error handling",
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filePath: string): ExceptionIssue[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const issues: ExceptionIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check multi-line context (current + next 2 lines)
    const context = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");

    for (const pat of PATTERNS) {
      if (
        (pat.regex.test(context) && pat.regex.test(line)) ||
        ((i === 0 || !pat.regex.test(lines.slice(i - 1, i + 2).join("\n"))) && pat.regex.test(context))
      ) {
        // Deduplicate: only flag once per match block
        if (!issues.some((x) => x.file === filePath && Math.abs(x.line - (i + 1)) < 3 && x.kind === pat.name)) {
          issues.push({ file: filePath, line: i + 1, kind: pat.name, message: pat.message, severity: pat.severity });
        }
      }
    }
  }

  // Detect mixed strategies: both callbacks and promises in same file
  const hasCallbacks = /\bcallback\s*\(|function\s*\(\s*err\b/.test(content);
  const hasPromises = /\.then\s*\(|new\s+Promise\s*\(|async\s/.test(content);
  if (hasCallbacks && hasPromises) {
    issues.push({
      file: filePath,
      line: 1,
      kind: "mixed-strategy",
      message: "File mixes callback-style (err) and promise/async patterns — consider unifying",
      severity: "low",
    });
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runExceptionConsistency(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges exception-consistency — Detect inconsistent exception handling

Usage:
  judges exception-consistency [dir]
  judges exception-consistency src/ --severity high
  judges exception-consistency --format json

Options:
  [dir]                 Directory to scan (default: .)
  --severity <level>    Filter by minimum severity (high|medium|low)
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const severityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "low";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const minSev = severityOrder[severityFilter] || 1;

  const files = collectFiles(dir);
  const allIssues: ExceptionIssue[] = [];
  for (const f of files) {
    const issues = analyzeFile(f);
    allIssues.push(...issues.filter((x) => severityOrder[x.severity] >= minSev));
  }

  allIssues.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  if (format === "json") {
    console.log(
      JSON.stringify({ issues: allIssues, filesScanned: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(
      `\n  Exception Consistency — ${files.length} files scanned, ${allIssues.length} issue(s)\n  ──────────────────────────`,
    );

    if (allIssues.length === 0) {
      console.log("  ✅ No inconsistent exception handling detected");
    } else {
      const byKind = new Map<string, number>();
      for (const issue of allIssues) {
        byKind.set(issue.kind, (byKind.get(issue.kind) || 0) + 1);
      }

      console.log("\n  Summary:");
      for (const [kind, count] of byKind) {
        console.log(`    ${kind}: ${count}`);
      }

      console.log("\n  Details:");
      for (const issue of allIssues.slice(0, 50)) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${icon} [${issue.severity}] ${issue.file}:${issue.line}`);
        console.log(`        ${issue.message}`);
      }

      if (allIssues.length > 50) {
        console.log(`\n    ... and ${allIssues.length - 50} more issue(s)`);
      }
    }
    console.log("");
  }
}
