/**
 * Error UX — audit user-facing error messages for actionability, consistency, and info leakage.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ErrorUxIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
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

function analyzeFile(filepath: string): ErrorUxIssue[] {
  const issues: ErrorUxIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  // Skip test and fixture files
  if (/\.test\.|\.spec\.|__test__|fixture|mock/i.test(filepath)) return issues;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Generic unhelpful error messages
    if (/(?:throw\s+new\s+Error|res\.status.*\.(?:json|send))\s*\(\s*['"]([^'"]+)['"]\s*\)/.test(line)) {
      const msgMatch = line.match(/['"]([^'"]+)['"]/);
      if (msgMatch) {
        const msg = msgMatch[1];
        if (
          /^(?:error|something went wrong|an error occurred|internal error|unknown error|bad request|failed|invalid)$/i.test(
            msg.trim(),
          )
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Generic error message",
            severity: "medium",
            detail: `"${msg}" — provide actionable guidance: what went wrong and how to fix it`,
          });
        }
      }
    }

    // Stack trace leaked to client
    if (/(?:res\.(?:json|send)|response\.(?:json|send))\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (/\.stack|stackTrace|stack_trace|err\.message|error\.message/i.test(block)) {
        if (!/production|NODE_ENV|process\.env/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Stack trace may leak to client",
            severity: "high",
            detail: "Error details sent in response without environment check — may expose internals in production",
          });
        }
      }
    }

    // Internal paths leaked in error messages
    if (/(?:throw|console\.error|res\..*(?:json|send))\s*\(/.test(line)) {
      if (/(?:\/home\/|\/var\/|\/usr\/|C:\\|D:\\|\/opt\/|__dirname|__filename)/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Internal file path in error output",
          severity: "medium",
          detail: "Server filesystem path in error — reveals deployment structure to attacker",
        });
      }
    }

    // SQL/DB error details sent to client
    if (/catch\s*\(/.test(line)) {
      const catchBlock = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
      if (/(?:sql|query|database|ECONNREFUSED|ETIMEDOUT)/i.test(catchBlock)) {
        if (/res\.(?:json|send|status)|response\.(?:json|send)/i.test(catchBlock)) {
          if (/err\.message|error\.message|e\.message/i.test(catchBlock)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Database error details sent to client",
              severity: "high",
              detail: "DB error message forwarded to response — may expose table names, SQL syntax, or connection info",
            });
          }
        }
      }
    }

    // Error message with jargon (internal codes exposed)
    if (/(?:throw\s+new\s+Error|\.send|\.json)\s*\(/.test(line)) {
      const msgMatch = line.match(/['"]([^'"]{10,})['"]/);
      if (msgMatch) {
        const msg = msgMatch[1];
        if (/(?:ENOENT|EACCES|EPERM|SIGTERM|ENOMEM|OOM|segfault|null pointer|NullReferenceException)/i.test(msg)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Technical jargon in user-facing error",
            severity: "medium",
            detail: `"${msg.slice(0, 50)}" — replace system-level jargon with plain language for end users`,
          });
        }
      }
    }

    // Empty catch blocks (silent failures)
    if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(line) || /catch\s*\(\s*\w*\s*\)\s*\{\s*\/\//i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Silent error swallowing",
        severity: "medium",
        detail: "Empty catch block hides failures — log the error or surface a user-friendly message",
      });
    }

    // HTTP status code mismatch
    if (/res\.status\s*\(\s*(\d+)\s*\)/.test(line)) {
      const statusMatch = line.match(/res\.status\s*\(\s*(\d+)\s*\)/);
      const msgMatch2 = line.match(/['"]([^'"]+)['"]/);
      if (statusMatch && msgMatch2) {
        const status = parseInt(statusMatch[1], 10);
        const msg = msgMatch2[1].toLowerCase();
        if (status === 200 && /error|fail|invalid|denied/i.test(msg)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Success status with error message",
            severity: "medium",
            detail: `HTTP 200 with error message "${msg.slice(0, 40)}" — use appropriate 4xx/5xx status code`,
          });
        }
        if (status === 500 && /not found|unauthorized|forbidden/i.test(msg)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Incorrect HTTP status code",
            severity: "low",
            detail: `HTTP 500 for "${msg.slice(0, 30)}" — use 404/401/403 for client errors`,
          });
        }
      }
    }

    // Error without remediation hint
    if (/throw\s+new\s+Error\s*\(\s*['"]([^'"]{15,})['"]\s*\)/.test(line)) {
      const errMsg = line.match(/throw\s+new\s+Error\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] || "";
      if (!/please|try|check|ensure|make sure|verify|see|refer|visit|use|run|set|configure|install/i.test(errMsg)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Error without remediation hint",
          severity: "low",
          detail: `"${errMsg.slice(0, 50)}" — add guidance on how the user can resolve the issue`,
        });
      }
    }

    // Inconsistent error format (mix of throw/console.error/process.exit)
    if (/process\.exit\s*\(\s*1\s*\)/.test(line)) {
      const block = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!/console\.error|console\.log|logger|log\./i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "process.exit without error message",
          severity: "medium",
          detail: "Process exits with code 1 but no error message — user sees nothing about what went wrong",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runErrorUx(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges error-ux — Audit user-facing error messages for quality and safety

Usage:
  judges error-ux [dir]
  judges error-ux src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: generic messages, stack trace leaks, internal path exposure, DB error forwarding,
jargon in user errors, silent catch blocks, HTTP status mismatches, missing remediation hints.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: ErrorUxIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 8 - medCount * 3);

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
    const badge = score >= 80 ? "✅ CLEAR" : score >= 50 ? "⚠️  MIXED" : "❌ POOR";
    console.log(`\n  Error UX Quality: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No error UX issues detected.\n");
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
