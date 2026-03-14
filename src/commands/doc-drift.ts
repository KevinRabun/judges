/**
 * Doc drift — detect when inline comments, docstrings, and type
 * annotations contradict the actual code behavior. A critical
 * AI-generation problem where docs are written separately.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DriftIssue {
  line: number;
  type: "param-mismatch" | "return-mismatch" | "stale-comment" | "wrong-name" | "dead-doc" | "todo-doc";
  severity: "high" | "medium" | "low";
  detail: string;
}

interface FileDriftResult {
  file: string;
  issues: DriftIssue[];
  driftScore: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeDrift(content: string): DriftIssue[] {
  const lines = content.split("\n");
  const issues: DriftIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || "";

    // 1. JSDoc @param mismatch
    const paramMatch = line.match(/@param\s+(?:{[^}]+}\s+)?(\w+)/);
    if (paramMatch) {
      const paramName = paramMatch[1];
      // Look ahead for function signature
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const fnMatch = lines[j].match(
          /(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(|^\s*(?:async\s*)?\()\s*([^)]*)\)/,
        );
        if (fnMatch) {
          const params = fnMatch[1];
          if (params && !params.includes(paramName)) {
            issues.push({
              line: i + 1,
              type: "param-mismatch",
              severity: "high",
              detail: `@param "${paramName}" not found in function signature`,
            });
          }
          break;
        }
      }
    }

    // 2. @returns but function has no return
    if (/@returns?\s/.test(line)) {
      let fnBodyStart = -1;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/{\s*$/.test(lines[j])) {
          fnBodyStart = j;
          break;
        }
      }
      if (fnBodyStart >= 0) {
        let depth = 0;
        let hasReturn = false;
        for (let j = fnBodyStart; j < lines.length; j++) {
          depth += (lines[j].match(/{/g) || []).length;
          depth -= (lines[j].match(/}/g) || []).length;
          if (/\breturn\s+\S/.test(lines[j])) hasReturn = true;
          if (depth <= 0) break;
        }
        if (!hasReturn) {
          issues.push({
            line: i + 1,
            type: "return-mismatch",
            severity: "high",
            detail: "@returns documented but function has no return value",
          });
        }
      }
    }

    // 3. Comment references wrong function/variable name
    const commentMatch = line.match(/\/\/\s*(?:calls?|uses?|invokes?|sets?|gets?)\s+(\w+)/i);
    if (commentMatch) {
      const refName = commentMatch[1];
      if (
        refName.length > 2 &&
        !content.includes(`function ${refName}`) &&
        !content.includes(`const ${refName}`) &&
        !content.includes(`let ${refName}`) &&
        !content.includes(`.${refName}`)
      ) {
        issues.push({
          line: i + 1,
          type: "wrong-name",
          severity: "medium",
          detail: `Comment references "${refName}" which doesn't exist in this file`,
        });
      }
    }

    // 4. Comment says "returns X" but next line does something else
    const returnsComment = line.match(/\/\/\s*returns?\s+(true|false|null|undefined|void|nothing|\d+|an?\s+\w+)/i);
    if (returnsComment && /\breturn\b/.test(nextLine)) {
      const claimed = returnsComment[1].toLowerCase();
      if (claimed === "true" && !nextLine.includes("true")) {
        issues.push({
          line: i + 1,
          type: "stale-comment",
          severity: "medium",
          detail: `Comment says "returns true" but return statement differs`,
        });
      } else if (claimed === "false" && !nextLine.includes("false")) {
        issues.push({
          line: i + 1,
          type: "stale-comment",
          severity: "medium",
          detail: `Comment says "returns false" but return statement differs`,
        });
      } else if (claimed === "null" && !nextLine.includes("null")) {
        issues.push({
          line: i + 1,
          type: "stale-comment",
          severity: "medium",
          detail: `Comment says "returns null" but return statement differs`,
        });
      }
    }

    // 5. Dead documentation — comment block before deleted/empty code
    if (/\/\*\*/.test(line) && !line.includes("*/")) {
      let endComment = -1;
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        if (/\*\//.test(lines[j])) {
          endComment = j;
          break;
        }
      }
      if (endComment >= 0) {
        const afterDoc = lines[endComment + 1]?.trim() || "";
        if (afterDoc === "" || afterDoc === "}" || afterDoc === ");") {
          issues.push({
            line: i + 1,
            type: "dead-doc",
            severity: "low",
            detail: "Documentation block with no code following it",
          });
        }
      }
    }

    // 6. TODO in documentation
    if (/\/\*\*[\s\S]*TODO|@todo/i.test(line) || (/^\s*\*/.test(line) && /TODO/i.test(line))) {
      issues.push({
        line: i + 1,
        type: "todo-doc",
        severity: "low",
        detail: "TODO found in documentation — may indicate incomplete AI-generated docs",
      });
    }
  }

  return issues;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDocDrift(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges doc-drift — Detect documentation-to-code drift

Usage:
  judges doc-drift <file-or-dir>
  judges doc-drift src/ --min-issues 1

Options:
  --min-issues <n>   Only show files with at least N issues (default: 1)
  --format json      JSON output
  --help, -h         Show this help

Checks:
  • @param name mismatches with function signature
  • @returns documented but no return statement
  • Comments referencing nonexistent identifiers
  • Stale return value comments
  • Dead documentation blocks
  • TODO in documentation
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minIssues = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--min-issues") || "1");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  const results: FileDriftResult[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const issues = analyzeDrift(content);
    const driftScore = Math.max(
      0,
      100 -
        issues.filter((i) => i.severity === "high").length * 20 -
        issues.filter((i) => i.severity === "medium").length * 10 -
        issues.filter((i) => i.severity === "low").length * 3,
    );
    results.push({ file: relative(target, f) || f, issues, driftScore });
  }

  const filtered = results.filter((r) => r.issues.length >= minIssues);
  filtered.sort((a, b) => a.driftScore - b.driftScore);

  if (format === "json") {
    console.log(
      JSON.stringify({ files: filtered, scannedFiles: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    const totalIssues = results.reduce((s, r) => s + r.issues.length, 0);
    console.log(`\n  Doc Drift — ${files.length} files, ${totalIssues} issues\n  ──────────────────────────`);

    if (filtered.length === 0) {
      console.log(`    ✅ No documentation drift detected\n`);
      return;
    }

    for (const r of filtered.slice(0, 20)) {
      const icon = r.driftScore >= 80 ? "🟢" : r.driftScore >= 50 ? "🟡" : "🔴";
      console.log(`\n    ${icon} ${r.file} — ${r.driftScore}/100 (${r.issues.length} issues)`);
      for (const iss of r.issues) {
        const sev = iss.severity === "high" ? "🔴" : iss.severity === "medium" ? "🟠" : "🟡";
        console.log(`        ${sev} L${iss.line}: ${iss.detail}`);
      }
    }

    if (filtered.length > 20) console.log(`    ... and ${filtered.length - 20} more files`);
    console.log("");
  }
}
