/**
 * Log quality — assess logging hygiene: structured format consistency,
 * PII leaks, level correctness, and coverage gaps.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LogIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
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

const PII_PATTERNS = [
  { pattern: /(?:email|e-mail|user_?email)\s*[:=]/i, name: "email" },
  { pattern: /(?:password|passwd|pwd|secret)\s*[:=]/i, name: "password" },
  { pattern: /(?:ssn|social.?security|national.?id)\s*[:=]/i, name: "SSN/national ID" },
  { pattern: /(?:credit.?card|card.?number|ccn)\s*[:=]/i, name: "credit card" },
  { pattern: /(?:phone.?number|mobile|cell)\s*[:=]/i, name: "phone number" },
  { pattern: /(?:date.?of.?birth|dob|birthday)\s*[:=]/i, name: "date of birth" },
  { pattern: /(?:ip.?address|client.?ip|remote.?addr)\s*[:=]/i, name: "IP address" },
];

function analyzeFile(filepath: string): LogIssue[] {
  const issues: LogIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const isTestFile = /\.test\.|\.spec\.|__test__/i.test(filepath);
  if (isTestFile) return issues;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Console.log in production code
    if (/console\.log\s*\(/.test(line) && !/\/\//.test(line.split("console")[0])) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "console.log in production code",
        severity: "medium",
        suggestion: "Use a structured logger (winston, pino, bunyan)",
      });
    }

    // Wrong log level
    if (/console\.log\s*\(\s*['"`](?:error|err|fail|exception|crash)/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Error logged at info/debug level",
        severity: "high",
        suggestion: "Use console.error or logger.error for error conditions",
      });
    }

    if (/(?:logger|log)\.(?:debug|info|trace)\s*\(\s*['"`](?:error|fail|exception|crash)/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Error logged at info/debug level",
        severity: "high",
        suggestion: "Use logger.error() for error conditions",
      });
    }

    // String interpolation in structured logger
    if (/(?:logger|log)\.\w+\s*\(\s*`/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Template literal in structured logger",
        severity: "medium",
        suggestion: "Use structured fields: logger.info('msg', { key: value }) for queryability",
      });
    }

    // PII in log statements
    if (/(?:console|log|logger)\.\w+\s*\(/.test(line)) {
      for (const pii of PII_PATTERNS) {
        if (pii.pattern.test(line)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: `Potential ${pii.name} in log output`,
            severity: "high",
            suggestion: "Mask or redact PII before logging — may violate GDPR/CCPA",
          });
        }
      }
    }

    // Logging full objects/errors without selection
    if (/(?:console|log|logger)\.\w+\s*\(\s*(?:err|error|exception|e)\s*\)/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Logging full error object",
        severity: "low",
        suggestion: "Log error.message and error.stack separately for structured parsing",
      });
    }

    // Log statements with string concatenation (not structured)
    if (/(?:console|log|logger)\.\w+\s*\(\s*['"].*['"]\s*\+/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "String concatenation in log",
        severity: "low",
        suggestion: "Use structured logging with key-value pairs",
      });
    }
  }

  // Check for catch blocks without logging
  for (let i = 0; i < lines.length; i++) {
    if (/\bcatch\s*\(/.test(lines[i])) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (!/log|logger|console\.(error|warn|log)|print|println/i.test(block) && !/throw|rethrow|reject/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Silent catch block",
          severity: "high",
          suggestion: "Log errors in catch blocks or explicitly re-throw",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runLogQuality(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges log-quality — Assess logging hygiene and quality

Usage:
  judges log-quality [dir]
  judges log-quality src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: wrong log levels, PII in logs, unstructured logging, string concatenation,
template literals in structured loggers, silent catch blocks.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: LogIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 3);

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
    const badge = score >= 80 ? "✅ GOOD" : score >= 50 ? "⚠️  NEEDS WORK" : "❌ POOR";
    console.log(`\n  Log Quality: ${badge} (${score}/100)\n  ─────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No logging issues detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        → ${issue.suggestion}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
