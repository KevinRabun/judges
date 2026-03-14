/**
 * Retry pattern audit — analyze retry, backoff, and circuit-breaker patterns
 * for correctness and consistency.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetryIssue {
  file: string;
  line: number;
  issue: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"]);

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

function analyzeFile(filepath: string): RetryIssue[] {
  const issues: RetryIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Unbounded retry loops
    if (/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(line)) {
      const block = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (
        /retry|attempt|fetch|request|connect/i.test(block) &&
        !/maxRetries|maxAttempts|retryLimit|MAX_RETRIES/i.test(block)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Unbounded retry loop",
          severity: "critical",
          detail: "Infinite retry without max attempts — will loop forever on persistent failures",
        });
      }
    }

    // Fixed delay (no backoff)
    if (/(?:sleep|setTimeout|time\.Sleep|Thread\.sleep|delay)\s*\(\s*\d+\s*\)/i.test(line)) {
      const block = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
      if (/retry|attempt|retries/i.test(block) && !/exponential|backoff|Math\.pow|Math\.min|\*\s*2/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Fixed retry delay",
          severity: "high",
          detail: "Use exponential backoff with jitter to avoid thundering herd",
        });
      }
    }

    // Missing jitter
    if (/exponential|backoff|Math\.pow.*2/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/jitter|Math\.random|random|rand\b/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Backoff without jitter",
          severity: "medium",
          detail: "Add random jitter to prevent synchronized retry storms",
        });
      }
    }

    // Retrying non-idempotent operations
    if (
      /retry.*(?:POST|PUT|DELETE|INSERT|UPDATE|create|write)/i.test(line) ||
      /(?:POST|create|write).*retry/i.test(line)
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Retrying non-idempotent operation",
        severity: "high",
        detail: "POSTs/writes may duplicate data on retry — ensure idempotency keys",
      });
    }

    // Hardcoded retry counts
    if (/(?:maxRetries|retryCount|attempts)\s*[:=]\s*\d{2,}/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "High retry count",
        severity: "medium",
        detail: "Large retry counts delay failure detection — consider circuit breaker",
      });
    }

    // Catching all errors for retry (no differentiation)
    if (/catch\s*\(\s*\w*\s*\)/.test(line)) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (
        /retry|continue|attempt/i.test(block) &&
        !/status|code|instanceof|isRetryable|isTransient|4\d{2}|5\d{2}/i.test(block)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Retrying all errors indiscriminately",
          severity: "high",
          detail: "Only retry transient errors (5xx, timeouts) — 4xx errors won't resolve on retry",
        });
      }
    }

    // Missing circuit breaker for external calls
    if (/(?:axios|fetch|http\.request|httpClient)\s*\(/i.test(line)) {
      const fileContent = content;
      if (
        /retry|retries|maxAttempts/i.test(fileContent) &&
        !/circuit.?breaker|CircuitBreaker|opossum|cockatiel|polly/i.test(fileContent)
      ) {
        if (i === lines.findIndex((l) => /(?:axios|fetch|http\.request|httpClient)\s*\(/i.test(l))) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Retries without circuit breaker",
            severity: "medium",
            detail: "Add circuit breaker to fail fast when downstream is unhealthy",
          });
        }
      }
    }

    // Timeout not set
    if (/(?:axios|fetch|http\.request|httpClient)\s*\(/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/timeout|signal|AbortController|deadline/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "External call without timeout",
          severity: "high",
          detail: "Set timeouts on all external calls — retries compound unbounded waits",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRetryPatternAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges retry-pattern-audit — Analyze retry, backoff, and circuit-breaker patterns

Usage:
  judges retry-pattern-audit [dir]
  judges retry-pattern-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: unbounded retries, fixed delays, missing jitter, non-idempotent retries,
indiscriminate error catching, missing circuit breakers, missing timeouts.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: RetryIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const critCount = allIssues.filter((i) => i.severity === "critical").length;
  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const score = allIssues.length === 0 ? 100 : Math.max(0, 100 - critCount * 25 - highCount * 10);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { critical: critCount, high: highCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = critCount > 0 ? "🚫 UNSAFE" : highCount > 0 ? "⚠️  FRAGILE" : "✅ RESILIENT";
    console.log(`\n  Retry Pattern Audit: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No retry pattern issues detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "critical" ? "🚫" : issue.severity === "high" ? "🔴" : "🟡";
      console.log(`    ${icon} [${issue.severity.toUpperCase()}] ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(
      `\n    Total: ${allIssues.length} | Critical: ${critCount} | High: ${highCount} | Score: ${score}/100\n`,
    );
  }
}
