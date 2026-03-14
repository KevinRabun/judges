/**
 * Assertion density — measure and enforce guard-clause and invariant density in critical code.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AssertionIssue {
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

function analyzeFile(filepath: string): AssertionIssue[] {
  const issues: AssertionIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  // Skip test files
  if (/\.test\.|\.spec\.|__test__|fixture/i.test(filepath)) return issues;

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Function definition — check for precondition guards
    const funcMatch = line.match(
      /(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]+=>\s*\{))/,
    );
    if (funcMatch) {
      const funcName = funcMatch[1] || funcMatch[2];
      if (funcName && funcName.length > 2 && !funcName.startsWith("_")) {
        let depth = 0;
        let funcEnd = i;
        let started = false;
        for (let j = i; j < Math.min(i + 60, lines.length); j++) {
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
        const funcBody = lines.slice(i + 1, Math.min(funcEnd, i + 30));
        const bodyText = funcBody.join("\n");
        const bodyLength = funcBody.filter((l) => l.trim().length > 0).length;

        if (bodyLength > 8) {
          // Check for guard clauses
          const hasGuards =
            /if\s*\(!|if\s*\(\s*\w+\s*===?\s*(?:null|undefined|false|0|''|"")|\bthrow\b|\bassert\b|invariant\(|precondition/i.test(
              funcBody.slice(0, 5).join("\n"),
            );
          const hasParamValidation =
            /typeof\s+\w+|instanceof|isNaN|isFinite|Array\.isArray|!==?\s*(?:null|undefined)/i.test(
              funcBody.slice(0, 5).join("\n"),
            );

          if (!hasGuards && !hasParamValidation) {
            // Check if function takes parameters that should be validated
            const paramLine = lines[i];
            const hasParams = /\(\s*\w+/.test(paramLine) && !/\(\s*\)\s*/.test(paramLine);
            if (hasParams) {
              issues.push({
                file: filepath,
                line: i + 1,
                issue: "Function without precondition guards",
                severity: "medium",
                detail: `\`${funcName}\` takes parameters but has no guard clauses — add validation for unexpected inputs`,
              });
            }
          }

          // Check for division without zero-check
          if (/\/\s*\w+/.test(bodyText) && !/\/\s*\d+[^.]|\/\/|\/\*|\*\//.test(bodyText)) {
            if (!/=== 0|!== 0|> 0|< 0|isNaN|isFinite|zero/i.test(bodyText)) {
              // Only flag if dividing by a variable
              const divMatch = bodyText.match(/\/\s*([a-zA-Z]\w*)/);
              if (divMatch && !/length|size|count|PI|max|min/i.test(divMatch[1])) {
                issues.push({
                  file: filepath,
                  line: i + 1,
                  issue: "Division without zero-check",
                  severity: "medium",
                  detail: `Division by \`${divMatch[1]}\` without verifying non-zero — may cause Infinity/NaN`,
                });
              }
            }
          }
        }
      }
    }

    // Switch without default
    if (/^\s*switch\s*\(/.test(line)) {
      let depth = 0;
      let switchEnd = i;
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
          switchEnd = j;
          break;
        }
      }
      const switchBody = lines.slice(i, switchEnd + 1).join("\n");
      if (!/\bdefault\s*:/i.test(switchBody)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Switch without default case",
          severity: "medium",
          detail: "Switch statement has no default — unhandled values will silently fall through",
        });
      }
    }

    // Array access without bounds check
    if (/\w+\[\s*\w+\s*\]/.test(line) && !/\[\s*['"]/.test(line)) {
      const accessMatch = line.match(/(\w+)\[\s*(\w+)\s*\]/);
      if (accessMatch) {
        const arr = accessMatch[1];
        const idx = accessMatch[2];
        // Only flag if index is a variable (not string, not 0/1)
        if (/^[a-zA-Z]/.test(idx) && !/length|size|map|filter|reduce|find|forEach|Object|Math|console/i.test(arr)) {
          const block = lines.slice(Math.max(0, i - 3), Math.min(i + 2, lines.length)).join("\n");
          if (!/\.length|bounds|range|<|>|>=|<=|if\s*\(|assert|check|valid/i.test(block)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Array access without bounds check",
              severity: "low",
              detail: `\`${arr}[${idx}]\` accessed without verifying index is within bounds`,
            });
          }
        }
      }
    }

    // Optional chaining overuse (hiding real bugs)
    const optionalChainCount = (line.match(/\?\./g) || []).length;
    if (optionalChainCount > 3) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Excessive optional chaining",
        severity: "low",
        detail: `${optionalChainCount} optional chains in one expression — may indicate unclear data contract`,
      });
    }

    // Parsing without isNaN check
    if (/(?:parseInt|parseFloat|Number)\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/isNaN|isFinite|Number\.is|!==\s*NaN|\|\||[?][?]/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Number parsing without NaN check",
          severity: "low",
          detail: "parseInt/parseFloat/Number can return NaN — check before using the result",
        });
      }
    }

    // Map/object key access without existence check
    if (/\.get\s*\(\s*\w+\s*\)/.test(line) && !/Map|WeakMap|Headers|URLSearchParams/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/if\s*\(|has\s*\(|undefined|null|\?\./i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Map.get without existence check",
          severity: "low",
          detail: "Map.get() returns undefined for missing keys — check with .has() or handle undefined",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAssertionDensity(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges assertion-density — Measure guard-clause and invariant density in critical code

Usage:
  judges assertion-density [dir]
  judges assertion-density src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: functions without preconditions, division without zero-check, switch without default,
array access without bounds check, number parsing without NaN check, excessive optional chaining.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: AssertionIssue[] = [];
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
    const badge = score >= 80 ? "✅ DEFENSIVE" : score >= 50 ? "⚠️  OPTIMISTIC" : "❌ FRAGILE";
    console.log(`\n  Assertion Density: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No assertion density issues detected.\n");
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
