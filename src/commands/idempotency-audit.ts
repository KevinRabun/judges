/**
 * Idempotency audit — verify retried/webhook operations are safely idempotent.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IdempotencyIssue {
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

function analyzeFile(filepath: string): IdempotencyIssue[] {
  const issues: IdempotencyIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;
  const isRetryContext = /retry|webhook|queue|worker|consumer|handler|idempoten/i.test(fullText);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // INSERT without ON CONFLICT / upsert in retry context
    if (/INSERT\s+INTO/i.test(line) && isRetryContext) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/ON\s+CONFLICT|ON\s+DUPLICATE|UPSERT|IF\s+NOT\s+EXISTS|MERGE/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "INSERT without conflict handling in retry path",
          severity: "high",
          detail: "Retry can cause duplicate rows — use INSERT ... ON CONFLICT or UPSERT",
        });
      }
    }

    // Auto-increment counter mutation in handler
    if (/\+\+|\+=\s*1|\.increment|\.incr\b/i.test(line)) {
      if (/handler|webhook|consumer|worker|queue|retry/i.test(fullText)) {
        const block = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
        if (!/idempotency|dedup|idempotent|already.*processed/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Counter increment in retry-able path",
            severity: "high",
            detail: "Counter mutation is not idempotent — repeated execution will over-count",
          });
        }
      }
    }

    // Email/SMS/notification send without dedup
    if (/sendEmail|sendSMS|sendNotification|notify|\.send\s*\(/i.test(line)) {
      if (isRetryContext) {
        const block = lines.slice(Math.max(0, i - 8), Math.min(i + 5, lines.length)).join("\n");
        if (!/idempotency|dedup|already.*sent|sentIds|processed/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Notification send without dedup in retry path",
            severity: "high",
            detail: "Retry will send duplicate notifications — track sent IDs or use idempotency key",
          });
        }
      }
    }

    // Payment/charge without idempotency key
    if (/charge|payment|transfer|payout|refund/i.test(line) && /\.(?:create|post|execute)\s*\(/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/idempotency|idempotent|dedup|Idempotency-Key/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Financial operation without idempotency key",
          severity: "high",
          detail: "Payment operation lacks idempotency key — retry can cause double-charge",
        });
      }
    }

    // Webhook handler without idempotency check
    if (/webhook|eventHandler|onEvent|handleEvent/i.test(line) && /function|=>|async/.test(line)) {
      const funcBlock = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
      if (!/idempotency|dedup|already.*processed|processedIds|eventId/i.test(funcBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Webhook handler without idempotency guard",
          severity: "medium",
          detail: "Webhook providers may deliver events multiple times — check for prior processing",
        });
      }
    }

    // Queue consumer ACK before processing completes
    if (/\.ack\s*\(|\.acknowledge/i.test(line)) {
      const beforeBlock = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!/await|then|\.catch|try/i.test(beforeBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Queue ACK before processing completion",
          severity: "high",
          detail: "Acknowledging message before processing finishes — crash loses the message",
        });
      }
    }

    // File write without atomic rename pattern
    if (/writeFileSync|writeFile\s*\(|fs\.write/i.test(line)) {
      if (isRetryContext) {
        const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
        if (!/rename|\.tmp|\.temp|atomic|swap/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "File write without atomic rename",
            severity: "low",
            detail: "Non-atomic write in retry path — crash during write corrupts the file",
          });
        }
      }
    }

    // DELETE without WHERE in retry context
    if (/DELETE\s+FROM/i.test(line) && isRetryContext) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/WHERE/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "DELETE without WHERE in retry path",
          severity: "high",
          detail: "Unbounded DELETE is dangerous in retry context — could wipe entire table",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runIdempotencyAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges idempotency-audit — Verify retry/webhook operations are safely idempotent

Usage:
  judges idempotency-audit [dir]
  judges idempotency-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: INSERT without conflict handling, counter mutation in retries, notification dedup,
payment idempotency keys, webhook handler guards, queue ACK ordering, atomic file writes.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: IdempotencyIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 4);

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
    const badge = score >= 80 ? "✅ SAFE" : score >= 50 ? "⚠️  RISKY" : "❌ UNSAFE";
    console.log(`\n  Idempotency: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No idempotency issues detected.\n");
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
