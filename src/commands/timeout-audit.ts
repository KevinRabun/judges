/**
 * Timeout audit — trace timeout and deadline settings through call chains.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimeoutIssue {
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

function analyzeFile(filepath: string): TimeoutIssue[] {
  const issues: TimeoutIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Hardcoded timeout values
    const hardcodedMatch = line.match(/timeout\s*[:=]\s*(\d+)/i);
    if (hardcodedMatch) {
      const val = parseInt(hardcodedMatch[1], 10);
      if (val > 0 && !line.includes("config") && !line.includes("option") && !line.includes("env")) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Hardcoded timeout value",
          severity: "medium",
          detail: `Timeout = ${val}${val >= 1000 ? "ms" : ""} — extract to configuration for tunability`,
        });
      }
    }

    // Missing timeout on fetch/axios/http calls
    if (/(?:fetch|axios|http\.(?:get|post|put|delete|request)|got|superagent)\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/timeout|signal|AbortController|deadline/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "HTTP call without timeout",
          severity: "high",
          detail: "Network call has no timeout — can hang indefinitely under failure conditions",
        });
      }
    }

    // Missing timeout on database queries
    if (/\.(?:query|execute|find|findOne|aggregate|raw)\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (
        /(?:db|pool|connection|prisma|knex|sequelize|mongo)/i.test(block) &&
        !/timeout|maxTimeMS|statement_timeout/i.test(block)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Database query without timeout",
          severity: "medium",
          detail: "DB query has no timeout — long-running queries can exhaust connection pool",
        });
      }
    }

    // setTimeout with very large values
    const setTimeoutMatch = line.match(/setTimeout\s*\([^,]+,\s*(\d+)\)/);
    if (setTimeoutMatch) {
      const val = parseInt(setTimeoutMatch[1], 10);
      if (val > 300000) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Excessive setTimeout delay",
          severity: "low",
          detail: `setTimeout delay = ${Math.round(val / 1000)}s — consider persistent scheduling instead`,
        });
      }
    }

    // Promise.race without timeout
    if (/Promise\.all\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/timeout|Promise\.race|AbortController/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Promise.all without timeout guard",
          severity: "medium",
          detail: "Promise.all can hang if any promise never resolves — wrap with Promise.race timeout",
        });
      }
    }

    // Upstream vs downstream timeout mismatch (heuristic)
    if (/server.*timeout|listen.*timeout|request.*timeout/i.test(line)) {
      const downstreamBlock = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
      const serverTimeout = line.match(/timeout\s*[:=]\s*(\d+)/i);
      const clientTimeout = downstreamBlock.match(/(?:fetch|axios|http).*timeout\s*[:=]\s*(\d+)/i);
      if (serverTimeout && clientTimeout) {
        const server = parseInt(serverTimeout[1], 10);
        const client = parseInt(clientTimeout[1], 10);
        if (client > server) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Downstream timeout exceeds upstream",
            severity: "high",
            detail: `Client timeout (${client}) > server timeout (${server}) — response may be dropped after server times out`,
          });
        }
      }
    }

    // gRPC / streaming without deadline
    if (/grpc|\.stream\s*\(|createReadStream|createWriteStream/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/deadline|timeout|destroy|abort/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Stream/gRPC call without deadline",
          severity: "medium",
          detail: "Streaming call has no deadline — can leak resources if peer becomes unresponsive",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTimeoutAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges timeout-audit — Trace timeout and deadline propagation gaps

Usage:
  judges timeout-audit [dir]
  judges timeout-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: missing HTTP timeouts, hardcoded values, DB query timeouts,
excessive setTimeout, Promise.all without guards, downstream > upstream mismatch.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: TimeoutIssue[] = [];
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
    const badge = score >= 80 ? "✅ ROBUST" : score >= 50 ? "⚠️  GAPS" : "❌ FRAGILE";
    console.log(`\n  Timeout Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No timeout issues detected.\n");
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
