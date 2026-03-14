/**
 * Async safety — detect async/await anti-patterns, fire-and-forget promises, and swallowed rejections.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AsyncIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

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

function analyzeFile(filepath: string): AsyncIssue[] {
  const issues: AsyncIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  // Skip test files for some checks
  const isTest = /\.test\.|\.spec\.|__test__/i.test(filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fire-and-forget: calling async function without await
    if (/(?:^|\s)\w+\([^)]*\)\s*;?\s*$/.test(line.trim()) && !line.includes("await") && !line.includes("return")) {
      const _prevLines = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      // Check if the called function is async
      const callMatch = line.trim().match(/^(\w+)\s*\(/);
      if (callMatch) {
        const funcName = callMatch[1];
        if (content.includes(`async function ${funcName}`) || content.includes(`async ${funcName}`)) {
          if (!/void\s+\w+|\/\/.*fire.and.forget|\/\/.*intentional|event.*handler|\.on\(/i.test(line)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Fire-and-forget async call",
              severity: "high",
              detail: `\`${funcName}()\` is async but called without \`await\` — errors will be silently swallowed`,
            });
          }
        }
      }
    }

    // .then() without .catch()
    if (/\.then\s*\(/.test(line) && !line.includes(".catch")) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!block.includes(".catch")) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: ".then() without .catch()",
          severity: "medium",
          detail: "Promise chain has no error handler — rejection will be unhandled",
        });
      }
    }

    // async function that never awaits
    if (/async\s+(?:function\s+)?(\w+)/.test(line)) {
      const funcName = line.match(/async\s+(?:function\s+)?(\w+)/)?.[1] || "anonymous";
      // Find the function body
      let depth = 0;
      let funcEnd = i;
      let started = false;
      for (let j = i; j < Math.min(i + 50, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            depth++;
            started = true;
          }
          if (ch === "}") depth--;
        }
        if (started && depth <= 0) {
          funcEnd = j;
          break;
        }
      }
      const funcBody = lines.slice(i + 1, funcEnd).join("\n");
      if (funcBody.length > 10 && !/await\b|\.then\(|yield\b/i.test(funcBody)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Async function without await",
          severity: "medium",
          detail: `\`${funcName}\` is declared async but never awaits — unnecessary wrapper adds overhead`,
        });
      }
    }

    // try/catch around async with empty catch
    if (/try\s*\{/.test(line)) {
      const block = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (/await\b/.test(block)) {
        const catchMatch = block.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/);
        if (catchMatch) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Async try/catch with empty handler",
            severity: "high",
            detail: "Awaited operation errors are silently swallowed — log or rethrow",
          });
        }
      }
    }

    // Promise constructor anti-pattern (async executor)
    if (/new\s+Promise\s*\(\s*async/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Async Promise constructor",
        severity: "high",
        detail: "Async executor in Promise constructor — rejections inside async can't be caught by the Promise",
      });
    }

    // await in loop (performance issue)
    if (!isTest && /^\s*(?:for|while)\s*\(/.test(line)) {
      const loopBlock = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      const awaitCount = (loopBlock.match(/await\b/g) || []).length;
      if (awaitCount >= 1 && !/sequential|order.*matters|rate.*limit|throttle/i.test(loopBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Sequential await in loop",
          severity: "low",
          detail:
            "Awaiting inside loop runs iterations sequentially — use Promise.all for parallel execution if order doesn't matter",
        });
      }
    }

    // Mixing callbacks and promises
    if (/\.then\s*\(/.test(line) && /callback|cb\s*\(|next\s*\(/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Mixed callback and promise patterns",
        severity: "medium",
        detail: "Mixing callbacks with .then() chains — pick one pattern to avoid missed error paths",
      });
    }

    // Unhandled promise rejection risk (process-level)
    if (/process\.on\s*\(\s*['"]unhandledRejection['"]/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (/process\.exit/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Unhandled rejection handler exits process",
          severity: "low",
          detail: "Consider graceful shutdown instead of immediate exit on unhandled rejections",
        });
      }
    }

    // Promise.all without error isolation
    if (/Promise\.all\s*\(/.test(line) && !isTest) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/Promise\.allSettled|\.catch|try|catch/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Promise.all without error isolation",
          severity: "medium",
          detail: "One promise rejection cancels all — use Promise.allSettled if partial results are acceptable",
        });
      }
    }

    // setTimeout/setInterval with async callback but no error handling
    if (/(?:setTimeout|setInterval)\s*\(\s*async/.test(line)) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
      if (!/try|catch|\.catch/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Async timer callback without error handling",
          severity: "high",
          detail: "Async callback in setTimeout/setInterval — errors become unhandled rejections",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAsyncSafety(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges async-safety — Detect async/await anti-patterns and fire-and-forget promises

Usage:
  judges async-safety [dir]
  judges async-safety src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: fire-and-forget calls, .then() without .catch(), async without await,
async Promise constructors, await in loops, async timer callbacks, Promise.all without error isolation.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: AsyncIssue[] = [];
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
    const badge = score >= 80 ? "✅ SAFE" : score >= 50 ? "⚠️  RISKY" : "❌ HAZARDOUS";
    console.log(`\n  Async Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No async safety issues detected.\n");
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
