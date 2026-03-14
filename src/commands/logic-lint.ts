/**
 * Logic lint — detect common logic errors that AI code generators produce.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LogicIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"]);

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

function analyzeFile(filepath: string): LogicIssue[] {
  const issues: LogicIssue[] = [];
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

    // Tautological comparison: x === x, x !== x
    if (/(\w+)\s*===\s*\1(?!\w)/.test(trimmed) || /(\w+)\s*!==\s*\1(?!\w)/.test(trimmed)) {
      const match = trimmed.match(/(\w+)\s*[!=]==\s*\1(?!\w)/);
      if (match && match[1] !== "NaN") {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Tautological comparison",
          severity: "high",
          detail: `\`${match[1]}\` compared to itself — always true (===) or always false (!==)`,
        });
      }
    }

    // Assignment in condition (single = in if/while)
    if (
      /(?:if|while)\s*\(\s*[^=!<>]*[^=!<>]=[^=]/.test(trimmed) &&
      !/==|!=|<=|>=/.test(trimmed.replace(/=[^=]/, "XX"))
    ) {
      if (!/===|!==/.test(trimmed)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Assignment in condition",
          severity: "high",
          detail: "Single `=` in if/while condition — likely meant `===` or `==`",
        });
      }
    }

    // Unreachable code after return/throw/break/continue
    if (/^\s*(?:return|throw|break|continue)\b/.test(trimmed) && !trimmed.endsWith("{")) {
      const nextLine = (lines[i + 1] || "").trim();
      if (
        nextLine &&
        nextLine !== "}" &&
        nextLine !== "}" &&
        !/^\s*(?:case|default|\/\/|\/\*|\*|else|catch|finally)/.test(nextLine)
      ) {
        issues.push({
          file: filepath,
          line: i + 2,
          issue: "Unreachable code after flow control",
          severity: "medium",
          detail: "Code after return/throw/break/continue is never executed",
        });
      }
    }

    // Off-by-one: <= array.length in loop (should be <)
    if (/for\s*\([^;]*;\s*\w+\s*<=\s*\w+\.length\s*;/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Off-by-one in loop bound",
        severity: "high",
        detail: "`<= .length` iterates one past the end — use `< .length`",
      });
    }

    // Constant condition in if/while
    if (/(?:if|while)\s*\(\s*(?:true|false|1|0|null|undefined)\s*\)/.test(trimmed)) {
      if (!/while\s*\(\s*true\s*\)/.test(trimmed)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Constant condition",
          severity: "medium",
          detail: "Condition is always true or always false — branch is never taken or always taken",
        });
      }
    }

    // Inverted null check: if (x) { x = ... } vs if (!x) { x = ... }
    if (/if\s*\(\s*(\w+)\s*\)\s*\{/.test(trimmed)) {
      const varName = trimmed.match(/if\s*\(\s*(\w+)\s*\)/)?.[1];
      const nextLines = lines.slice(i + 1, Math.min(i + 3, lines.length)).join("\n");
      if (varName && new RegExp(`${varName}\\s*=\\s*(?:null|undefined|"")`).test(nextLines)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Likely inverted null check",
          severity: "medium",
          detail: `Checking \`${varName}\` is truthy then setting it to null — did you mean \`!${varName}\`?`,
        });
      }
    }

    // Mismatched operator precedence: a && b || c (missing parentheses)
    if (/\w+\s*&&\s*\w+\s*\|\|\s*\w+/.test(trimmed) && !trimmed.includes("(")) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Ambiguous operator precedence",
        severity: "low",
        detail: "`&&` and `||` mixed without parentheses — intention is unclear",
      });
    }

    // Empty catch block
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Empty catch block",
        severity: "medium",
        detail: "Errors silently swallowed — at minimum log the error",
      });
    }

    // typeof compared to wrong string
    if (/typeof\s+\w+\s*===?\s*['"]/.test(trimmed)) {
      const typeVal = trimmed.match(/typeof\s+\w+\s*===?\s*['"]([\w]+)['"]/)?.[1];
      const validTypes = new Set([
        "string",
        "number",
        "boolean",
        "object",
        "function",
        "undefined",
        "symbol",
        "bigint",
      ]);
      if (typeVal && !validTypes.has(typeVal)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Invalid typeof comparison",
          severity: "high",
          detail: `typeof never returns "${typeVal}" — valid values: ${[...validTypes].join(", ")}`,
        });
      }
    }

    // Doubled negation logic: !!x === false or !(!x)
    if (/!!\w+\s*===?\s*false/.test(trimmed) || /!\s*\(\s*!\s*\w+\s*\)/.test(trimmed)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Redundant double negation",
        severity: "low",
        detail: "Double negation with false comparison — simplify the expression",
      });
    }

    // Floating point equality
    if (/(?:===?|!==?)\s*(?:\d+\.\d+|Math\.\w+)/.test(trimmed) && !/\.length|\.size|\.count|\.index/.test(trimmed)) {
      if (/\d+\.\d+/.test(trimmed)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Floating-point equality",
          severity: "medium",
          detail:
            "Exact equality with floating-point values is unreliable — use tolerance comparison (Math.abs(a-b) < epsilon)",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runLogicLint(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges logic-lint — Detect common logic errors in AI-generated code

Usage:
  judges logic-lint [dir]
  judges logic-lint src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: tautological comparisons, assignment in conditions, off-by-one loops,
unreachable code, constant conditions, inverted null checks, ambiguous precedence,
empty catch blocks, invalid typeof, floating-point equality.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: LogicIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 12 - medCount * 5);

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
    const badge = score >= 80 ? "✅ CLEAN" : score >= 50 ? "⚠️  SUSPECT" : "❌ BUGGY";
    console.log(`\n  Logic Lint: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No logic issues detected.\n");
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
