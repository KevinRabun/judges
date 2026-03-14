/**
 * Cross-file consistency — verify naming and pattern consistency across files.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConsistencyIssue {
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

interface FunctionSignature {
  name: string;
  params: string;
  file: string;
  line: number;
}

interface ErrorPattern {
  pattern: string;
  file: string;
  line: number;
}

function analyzeConsistency(files: string[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // Collect cross-file data
  const allFunctions: FunctionSignature[] = [];
  const errorPatterns: ErrorPattern[] = [];
  const importStyles = new Map<string, { default: number; named: number; file: string; line: number }>();
  const returnPatterns = new Map<string, { patterns: Set<string>; files: string[] }>();
  const logStyles: Array<{ style: string; file: string; line: number }> = [];

  for (const filepath of files) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const fname = basename(filepath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Collect function signatures
      const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        allFunctions.push({ name: funcMatch[1], params: funcMatch[2], file: filepath, line: i + 1 });
      }

      // Collect error handling patterns
      if (/catch\s*\(/.test(trimmed)) {
        const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
        if (/console\.error/.test(block)) errorPatterns.push({ pattern: "console.error", file: filepath, line: i + 1 });
        else if (/logger\.error/.test(block))
          errorPatterns.push({ pattern: "logger.error", file: filepath, line: i + 1 });
        else if (/throw/.test(block)) errorPatterns.push({ pattern: "rethrow", file: filepath, line: i + 1 });
        else if (/return/.test(block)) errorPatterns.push({ pattern: "return-on-error", file: filepath, line: i + 1 });
      }

      // Collect import styles for same module
      const importMatch = trimmed.match(/import\s+(?:(\w+)|(\{[^}]+\}))\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const mod = importMatch[3];
        const entry = importStyles.get(mod) || { default: 0, named: 0, file: filepath, line: i + 1 };
        if (importMatch[1]) entry.default++;
        if (importMatch[2]) entry.named++;
        importStyles.set(mod, entry);
      }

      // Collect logging styles
      if (/console\.(log|warn|error|info|debug)\s*\(/.test(trimmed)) {
        logStyles.push({ style: "console", file: filepath, line: i + 1 });
      } else if (/logger\.(log|warn|error|info|debug)\s*\(/.test(trimmed)) {
        logStyles.push({ style: "logger", file: filepath, line: i + 1 });
      }

      // Collect return type patterns for similar functions
      const retMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*:\s*([\w<>[\]| ]+)/);
      if (retMatch) {
        const prefix = retMatch[1].replace(/\d+$/, "").replace(/[A-Z][a-z]+$/, "");
        if (prefix.length > 2) {
          const entry = returnPatterns.get(prefix) || { patterns: new Set<string>(), files: [] };
          entry.patterns.add(retMatch[2].trim());
          entry.files.push(`${fname}:${i + 1}`);
          returnPatterns.set(prefix, entry);
        }
      }
    }
  }

  // Detect inconsistencies
  // 1. Similar function names with inconsistent patterns
  const nameGroups = new Map<string, FunctionSignature[]>();
  for (const func of allFunctions) {
    const prefix = func.name
      .replace(/\d+$/, "")
      .replace(/[A-Z][a-z]+$/, "")
      .toLowerCase();
    if (prefix.length > 3) {
      const group = nameGroups.get(prefix) || [];
      group.push(func);
      nameGroups.set(prefix, group);
    }
  }
  for (const [_prefix, group] of nameGroups) {
    if (group.length >= 2) {
      const paramCounts = new Set(group.map((f) => f.params.split(",").filter((p) => p.trim()).length));
      if (paramCounts.size > 1 && group.length <= 5) {
        const first = group[0];
        issues.push({
          file: first.file,
          line: first.line,
          issue: "Inconsistent parameter count across similar functions",
          severity: "medium",
          detail: `Functions with similar names have different parameter counts: ${group.map((f) => `${f.name}(${f.params.split(",").filter((p) => p.trim()).length} params)`).join(", ")}`,
        });
      }
    }
  }

  // 2. Mixed error handling patterns
  if (errorPatterns.length > 3) {
    const patternCounts = new Map<string, number>();
    for (const ep of errorPatterns) patternCounts.set(ep.pattern, (patternCounts.get(ep.pattern) || 0) + 1);
    if (patternCounts.size > 2) {
      const minority = [...patternCounts.entries()].sort((a, b) => a[1] - b[1])[0];
      const sample = errorPatterns.find((ep) => ep.pattern === minority[0]);
      if (sample) {
        issues.push({
          file: sample.file,
          line: sample.line,
          issue: "Inconsistent error handling pattern",
          severity: "medium",
          detail: `Project uses ${patternCounts.size} different error handling patterns — \`${minority[0]}\` is used least (${minority[1]}×)`,
        });
      }
    }
  }

  // 3. Mixed import styles for same module
  for (const [mod, styles] of importStyles) {
    if (styles.default > 0 && styles.named > 0) {
      issues.push({
        file: styles.file,
        line: styles.line,
        issue: "Mixed import style for same module",
        severity: "low",
        detail: `\`${mod}\` imported both as default (${styles.default}×) and named (${styles.named}×) — AI may have used wrong import style`,
      });
    }
  }

  // 4. Mixed logging styles
  if (logStyles.length > 5) {
    const consoleCount = logStyles.filter((l) => l.style === "console").length;
    const loggerCount = logStyles.filter((l) => l.style === "logger").length;
    if (consoleCount > 0 && loggerCount > 0) {
      const minority =
        consoleCount < loggerCount
          ? logStyles.find((l) => l.style === "console")
          : logStyles.find((l) => l.style === "logger");
      if (minority) {
        issues.push({
          file: minority.file,
          line: minority.line,
          issue: "Mixed logging approach",
          severity: "low",
          detail: `Project uses both console.* (${consoleCount}×) and logger.* (${loggerCount}×) — standardize on one`,
        });
      }
    }
  }

  // 5. Similar functions with inconsistent return types
  for (const [_prefix, ret] of returnPatterns) {
    if (ret.patterns.size > 1 && ret.files.length > 1) {
      issues.push({
        file: ret.files[0].split(":")[0],
        line: 1,
        issue: "Inconsistent return types for similar functions",
        severity: "low",
        detail: `Functions in the same family return different types: ${[...ret.patterns].join(", ")}`,
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCrossFileConsistency(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges cross-file-consistency — Verify naming and pattern consistency across files

Usage:
  judges cross-file-consistency [dir]
  judges cross-file-consistency src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: inconsistent parameter counts, mixed error handling, mixed import styles,
mixed logging approaches, inconsistent return types for similar functions.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues = analyzeConsistency(files);

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(
    0,
    100 - highCount * 10 - medCount * 5 - allIssues.filter((i) => i.severity === "low").length * 2,
  );

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
    const badge = score >= 80 ? "✅ CONSISTENT" : score >= 50 ? "⚠️  MIXED" : "❌ INCONSISTENT";
    console.log(`\n  Cross-File Consistency: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No cross-file inconsistencies detected.\n");
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
