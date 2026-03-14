/**
 * API misuse — detect incorrect API usage patterns that AI commonly generates.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MisuseIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);

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

function analyzeFile(filepath: string): MisuseIssue[] {
  const issues: MisuseIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Array.forEach with async callback (doesn't await)
    if (/\.forEach\s*\(\s*async\b/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "async forEach (doesn't await)",
        severity: "high",
        detail: "Array.forEach ignores returned promises — use `for...of` with `await` or `Promise.all` with `.map`",
      });
    }

    // JSON.parse without try/catch
    if (/JSON\.parse\s*\(/.test(trimmed)) {
      const block = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      if (!/try\s*\{|catch|\.catch|safeParse|tryCatch/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "JSON.parse without error handling",
          severity: "medium",
          detail: "JSON.parse throws on invalid input — wrap in try/catch or use a safe parser",
        });
      }
    }

    // fetch/axios without error status check
    if (
      /(?:await\s+)?fetch\s*\(/.test(trimmed) &&
      !/\.ok|\.status|response\.ok|res\.ok/.test(lines.slice(i, Math.min(i + 5, lines.length)).join("\n"))
    ) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (/\.json\(\)/.test(block) && !/\.ok|\.status|response\.ok|res\.ok|catch|reject/.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "fetch() without status check",
          severity: "high",
          detail: "fetch() doesn't reject on HTTP errors — check `response.ok` before calling `.json()`",
        });
      }
    }

    // Array methods on possibly undefined (no optional chaining)
    if (/\.\w+\.(map|filter|reduce|find|forEach|some|every)\s*\(/.test(trimmed)) {
      const dotChain = trimmed.match(/(\w+)\.(\w+)\.(map|filter|reduce|find|forEach|some|every)/);
      if (dotChain && !trimmed.includes("?.") && !/\(/.test(dotChain[2])) {
        // Check if the property could be undefined
        const propName = `${dotChain[1]}.${dotChain[2]}`;
        if (!/\bconst\b/.test(trimmed) && !/length|size/.test(dotChain[2])) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Array method on possibly undefined property",
            severity: "medium",
            detail: `\`${propName}\` might be undefined — use optional chaining or null check before \`.${dotChain[3]}()\``,
          });
        }
      }
    }

    // setTimeout/setInterval with string argument
    if (/(?:setTimeout|setInterval)\s*\(\s*['"]/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "setTimeout/setInterval with string (eval)",
        severity: "high",
        detail: "String argument to setTimeout/setInterval is evaluated with eval — use a function instead",
      });
    }

    // RegExp constructor with unescaped user input
    if (/new\s+RegExp\s*\(/.test(trimmed)) {
      const arg = trimmed.match(/new\s+RegExp\s*\(\s*(\w+)/)?.[1];
      if (arg && !/escape|sanitize|literal|fixed|constant|regex/i.test(trimmed)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "RegExp from variable (ReDoS risk)",
          severity: "medium",
          detail: `\`new RegExp(${arg})\` — if ${arg} is user input, this enables ReDoS attacks. Escape special characters first`,
        });
      }
    }

    // Promise constructor anti-pattern
    if (/new\s+Promise\s*\(\s*async\b/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "async Promise constructor anti-pattern",
        severity: "medium",
        detail: "async function inside `new Promise()` can swallow rejections — just use async/await directly",
      });
    }

    // .then().then() chain mixing with await
    if (
      /\.then\s*\(.*\.then\s*\(/.test(trimmed) ||
      (/\.then\s*\(/.test(trimmed) && /await/.test(lines.slice(Math.max(0, i - 3), i).join("\n")))
    ) {
      if (/await.*\.then\s*\(/.test(lines.slice(Math.max(0, i - 1), i + 1).join("\n"))) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Mixing await with .then() chains",
          severity: "low",
          detail: "Mixing async/await with .then() chains makes code harder to reason about — pick one style",
        });
      }
    }

    // Object.keys/values/entries on Map or Set
    if (/Object\.(?:keys|values|entries)\s*\(\s*\w+\s*\)/.test(trimmed)) {
      const varName = trimmed.match(/Object\.(?:keys|values|entries)\s*\(\s*(\w+)\s*\)/)?.[1];
      if (varName) {
        const typeHint = content.match(
          new RegExp(`(?:Map|Set)\\b[^;]*\\b${varName}\\b|\\b${varName}\\b[^;]*(?:Map|Set)\\b`),
        );
        if (typeHint) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Object.keys/values/entries on Map/Set",
            severity: "high",
            detail: `\`${varName}\` appears to be a Map or Set — use \`.keys()\`, \`.values()\`, or \`.entries()\` methods instead`,
          });
        }
      }
    }

    // String.replace without /g flag (replaces only first match)
    if (/\.replace\s*\(\s*['"]/.test(trimmed) && !trimmed.includes("replaceAll")) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: ".replace() with string (first match only)",
        severity: "low",
        detail:
          "String.replace with string pattern only replaces the FIRST match — use .replaceAll() or regex with /g flag",
      });
    }

    // Event listener without passive option for scroll/touch
    if (/addEventListener\s*\(\s*['"](?:scroll|touchstart|touchmove|wheel)['"]/.test(trimmed)) {
      if (!trimmed.includes("passive")) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Scroll/touch listener without passive",
          severity: "low",
          detail: "Add `{ passive: true }` to scroll/touch listeners for better performance",
        });
      }
    }

    // Using == instead of === (loose equality)
    if (/[^!=]==[^=]/.test(trimmed) && !/===/.test(trimmed) && !/==\s*null/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Loose equality (==) instead of strict (===)",
        severity: "low",
        detail: "AI often generates `==` — use `===` to avoid type coercion surprises",
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runApiMisuse(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges api-misuse — Detect incorrect API usage patterns from AI-generated code

Usage:
  judges api-misuse [dir]
  judges api-misuse src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: async forEach, unprotected JSON.parse, fetch without status check, setTimeout with string,
Promise constructor anti-pattern, Object.keys on Map/Set, .replace first-match-only,
loose equality, RegExp ReDoS, missing passive listeners.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: MisuseIssue[] = [];
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
    const badge = score >= 80 ? "✅ CORRECT" : score >= 50 ? "⚠️  MISUSED" : "❌ BROKEN";
    console.log(`\n  API Misuse: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No API misuse patterns detected.\n");
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
