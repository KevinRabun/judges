/**
 * Example leak — detect AI-copied example/placeholder code left in production.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExampleIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs", ".rb"]);

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
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

const PLACEHOLDER_URLS = [
  /https?:\/\/(?:example\.com|localhost:\d+|127\.0\.0\.1:\d+|httpbin\.org|jsonplaceholder\.typicode\.com|reqres\.in|api\.example)/i,
];

const PLACEHOLDER_SECRETS = [
  /['"](?:sk-[a-zA-Z0-9]{20,}|your[-_]?api[-_]?key|REPLACE[-_]?ME|changeme|password123|secret123|test[-_]?secret|my[-_]?secret|dummy[-_]?key|placeholder)['"]/,
];

const EXAMPLE_NAMES = [
  /(?:class|function|const|let|var)\s+(?:MyApp|MyComponent|Example\w*|Demo\w*|HelloWorld|SampleApp|TestApp|FooBar|Foo|Bar|Baz|Qux)\b/,
];

const EXAMPLE_DATA = [
  /['"](?:John Doe|Jane Doe|john@example\.com|jane@example\.com|foo@bar\.com|test@test\.com|user@example\.com|123 Main St|Acme Corp|Lorem ipsum|Alice|Bob)['"]/i,
];

const TUTORIAL_MARKERS = [
  /\/\/\s*(?:Step \d|TODO:?\s*replace|FIXME:?\s*placeholder|HACK:?\s*example|NOTE:?\s*this is (?:a |an )?(?:example|demo|sample|placeholder))/i,
  /#\s*(?:Step \d|TODO:?\s*replace|FIXME:?\s*placeholder)/i,
];

const HARDCODED_PORTS = [/(?:PORT|port)\s*[:=]\s*(?:3000|8080|8000|5000|4200|9090)\b/];

function analyzeFile(filepath: string): ExampleIssue[] {
  const issues: ExampleIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  // Skip test/fixture/example files
  if (/(?:test|spec|fixture|example|demo|sample|mock|stub|__test__|__spec__)/i.test(filepath)) return issues;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Placeholder URLs
    for (const pattern of PLACEHOLDER_URLS) {
      if (pattern.test(line)) {
        const url = line.match(pattern)?.[0];
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Placeholder URL in non-test code",
          severity: "high",
          detail: `\`${url}\` is an example/localhost URL — replace with actual endpoint`,
        });
        break;
      }
    }

    // Placeholder secrets
    for (const pattern of PLACEHOLDER_SECRETS) {
      if (pattern.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Placeholder secret/key value",
          severity: "high",
          detail: "Example API key or placeholder secret found — replace with env variable or secret manager",
        });
        break;
      }
    }

    // Example class/function names
    for (const pattern of EXAMPLE_NAMES) {
      if (pattern.test(line)) {
        const name = line.match(
          /(?:class|function|const|let|var)\s+((?:Example|Demo|HelloWorld|Sample|Test|FooBar|Foo|Bar|Baz|Qux)\w*)/,
        )?.[1];
        if (name) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Example/placeholder name in production",
            severity: "medium",
            detail: `\`${name}\` looks like tutorial code — rename to something domain-specific`,
          });
        }
        break;
      }
    }

    // Example data
    for (const pattern of EXAMPLE_DATA) {
      if (pattern.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Example data in non-test code",
          severity: "medium",
          detail: "Placeholder data (John Doe, example.com, etc.) left in production code",
        });
        break;
      }
    }

    // Tutorial markers
    for (const pattern of TUTORIAL_MARKERS) {
      if (pattern.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Tutorial comment marker",
          severity: "low",
          detail: "Comment from tutorial/example code — indicates AI-copied scaffold",
        });
        break;
      }
    }

    // Hardcoded ports
    for (const pattern of HARDCODED_PORTS) {
      if (pattern.test(line) && !/process\.env|ENV|config/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Hardcoded default port",
          severity: "low",
          detail: "Port hardcoded to common default — should come from config or env",
        });
        break;
      }
    }

    // console.log with example text
    if (/console\.log\s*\(\s*['"](?:Hello|Hi|Welcome|It works|Success|TODO|Test)\b/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Example console.log",
        severity: "low",
        detail: "Generic log message from tutorial — remove or replace with structured logging",
      });
    }

    // Empty function bodies that look like stubs
    if (/(?:function|=>)\s*\{[\s]*\}/.test(line) && !/test|spec|mock|stub|noop|placeholder/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Empty function stub",
        severity: "medium",
        detail: "Function with empty body — may be unfinished AI-generated scaffold",
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runExampleLeak(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges example-leak — Detect AI-copied example/placeholder code left in production

Usage:
  judges example-leak [dir]
  judges example-leak src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: placeholder URLs, example API keys, tutorial names, example data (John Doe, Lorem ipsum),
tutorial comments, hardcoded ports, example console.log messages, empty function stubs.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: ExampleIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 12 - medCount * 4);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ CLEAN" : score >= 50 ? "⚠️  LEAKING" : "❌ EXAMPLE CODE";
    console.log(`\n  Example Leak: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No example/placeholder code detected.\n");
      return;
    }
    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);
    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
