/**
 * Event leak — detect orphaned event listeners, unsubscribed observables, dangling async handles.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventLeakIssue {
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

function analyzeFile(filepath: string): EventLeakIssue[] {
  const issues: EventLeakIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // addEventListener without removeEventListener
    if (/\.addEventListener\s*\(/.test(line)) {
      const eventMatch = line.match(/addEventListener\s*\(\s*['"](\w+)['"]/);
      if (eventMatch) {
        const event = eventMatch[1];
        if (!fullText.includes(`removeEventListener`) || !fullText.includes(`'${event}'`)) {
          // Check for AbortController signal
          const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
          if (!/signal|AbortController|once:\s*true/i.test(block)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "addEventListener without cleanup",
              severity: "high",
              detail: `'${event}' listener added but no removeEventListener found — memory leak risk`,
            });
          }
        }
      }
    }

    // .on() without .off() / .removeListener()
    if (/\.on\s*\(\s*['"](\w+)['"]/.test(line) && !/\.once\s*\(/.test(line)) {
      const eventMatch = line.match(/\.on\s*\(\s*['"](\w+)['"]/);
      if (eventMatch) {
        const event = eventMatch[1];
        if (
          !/\.off\(|\.removeListener\(|\.removeAllListeners\(/i.test(fullText) ||
          !new RegExp(`(?:\\.off|\\.removeListener)\\s*\\(\\s*['"]${event}['"]`).test(fullText)
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Event emitter .on() without .off()",
            severity: "medium",
            detail: `'${event}' listener registered but no corresponding .off() or .removeListener()`,
          });
        }
      }
    }

    // Observable subscribe without unsubscribe
    if (/\.subscribe\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
      if (
        !/unsubscribe|takeUntil|take\(|first\(\)|pipe.*take|subscription.*=|\.add\(/i.test(block) &&
        !/unsubscribe|takeUntil|ngOnDestroy|componentWillUnmount|useEffect.*return/i.test(fullText)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Observable subscribe without unsubscribe",
          severity: "high",
          detail: "Subscription not cleaned up — will leak memory and may trigger after component unmounts",
        });
      }
    }

    // setInterval without clearInterval
    if (/setInterval\s*\(/.test(line)) {
      if (!/clearInterval/i.test(fullText)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "setInterval without clearInterval",
          severity: "high",
          detail: "Interval runs forever — add cleanup in destructor/unmount/close handler",
        });
      }
    }

    // setTimeout stored but never cleared
    if (/setTimeout\s*\(/.test(line)) {
      const assignMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*setTimeout/);
      if (assignMatch) {
        const varName = assignMatch[1];
        if (!fullText.includes(`clearTimeout(${varName})`)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "setTimeout assigned but never cleared",
            severity: "low",
            detail: `Timer '${varName}' stored but clearTimeout never called — may fire after disposal`,
          });
        }
      }
    }

    // WebSocket/SSE without close handler
    if (/new WebSocket\s*\(|new EventSource\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (!/\.close\s*\(|onclose|\.addEventListener.*close/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "WebSocket/SSE without close handler",
          severity: "medium",
          detail: "Connection opened but no close handler — resource leak on navigation or unmount",
        });
      }
    }

    // React useEffect without cleanup return
    if (/useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(line)) {
      // Find the matching effect body
      let depth = 0;
      let effectEnd = i;
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth <= 0) {
          effectEnd = j;
          break;
        }
      }
      const effectBody = lines.slice(i, effectEnd + 1).join("\n");
      const hasSideEffect = /addEventListener|\.on\(|subscribe|setInterval|setTimeout|fetch|WebSocket/i.test(
        effectBody,
      );
      const hasCleanup = /return\s*\(\s*\)\s*=>|return\s*\(\)\s*\{|return\s*function/i.test(effectBody);
      if (hasSideEffect && !hasCleanup) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "useEffect with side effects but no cleanup",
          severity: "high",
          detail: "Effect creates subscriptions/listeners but returns no cleanup function — leak on re-render",
        });
      }
    }

    // MutationObserver / IntersectionObserver / ResizeObserver without disconnect
    if (/new (?:Mutation|Intersection|Resize)Observer\s*\(/.test(line)) {
      if (!/\.disconnect\s*\(/i.test(fullText)) {
        const observerType = line.match(/(Mutation|Intersection|Resize)Observer/)?.[1] || "Observer";
        issues.push({
          file: filepath,
          line: i + 1,
          issue: `${observerType}Observer without disconnect`,
          severity: "medium",
          detail: "Observer created but never disconnected — continues observing after disposal",
        });
      }
    }

    // AbortController created but never aborted
    if (/new AbortController\s*\(/.test(line)) {
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*new AbortController/);
      if (varMatch) {
        const varName = varMatch[1];
        if (!fullText.includes(`${varName}.abort()`)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "AbortController never aborted",
            severity: "low",
            detail: `AbortController '${varName}' created but .abort() never called — no cleanup on cancel`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runEventLeak(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges event-leak — Detect orphaned listeners, unsubscribed observables, dangling handles

Usage:
  judges event-leak [dir]
  judges event-leak src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: addEventListener without cleanup, .on() without .off(), observable leaks,
setInterval without clear, useEffect without cleanup, Observer without disconnect.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: EventLeakIssue[] = [];
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
    const badge = score >= 80 ? "✅ CLEAN" : score >= 50 ? "⚠️  LEAKY" : "❌ LEAKING";
    console.log(`\n  Event Leaks: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No event leaks detected.\n");
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
