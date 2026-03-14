/**
 * Batch-review — Parallel review of multiple files with aggregated results.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileFinding {
  pattern: string;
  severity: string;
  line: number;
  content: string;
}

interface FileResult {
  file: string;
  findings: FileFinding[];
  passed: boolean;
}

interface BatchResult {
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  totalFindings: number;
  counts: { critical: number; high: number; medium: number; low: number };
  fileResults: FileResult[];
  duration: number;
}

// ─── Patterns ──────────────────────────────────────────────────────────────

const BATCH_PATTERNS: { name: string; severity: string; regex: RegExp }[] = [
  {
    name: "hardcoded-secret",
    severity: "critical",
    regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}/i,
  },
  { name: "eval-usage", severity: "critical", regex: /\beval\s*\(/ },
  { name: "sql-concat", severity: "critical", regex: /(?:query|execute)\s*\(\s*["'`].*\+/ },
  { name: "xss-risk", severity: "high", regex: /innerHTML\s*=|document\.write\s*\(/ },
  { name: "command-injection", severity: "critical", regex: /exec(?:Sync)?\s*\(\s*`[^`]*\$\{/ },
  { name: "empty-catch", severity: "medium", regex: /catch\s*\([^)]*\)\s*\{\s*\}/ },
  { name: "any-type", severity: "medium", regex: /:\s*any\b/ },
  { name: "unsafe-regex", severity: "high", regex: /new\s+RegExp\s*\([^)]*\+/ },
  { name: "deprecated-api", severity: "medium", regex: /new\s+Buffer\s*\(|\.substr\s*\(/ },
  { name: "console-log", severity: "low", regex: /console\.log\s*\(/ },
  { name: "todo-fixme", severity: "low", regex: /\/\/\s*(?:TODO|FIXME|HACK)\b/i },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectSourceFiles(dir: string): string[] {
  const exts = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cs", ".rb", ".php"]);
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (exts.has(extname(name))) files.push(full);
      } catch {
        // skip
      }
    }
  }
  walk(dir);
  return files;
}

function reviewFile(filePath: string, baseDir: string, failSeverity: string): FileResult {
  const relPath = relative(baseDir, filePath);
  const findings: FileFinding[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return { file: relPath, findings: [], passed: true };
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const pat of BATCH_PATTERNS) {
      if (pat.regex.test(lines[i])) {
        findings.push({
          pattern: pat.name,
          severity: pat.severity,
          line: i + 1,
          content: lines[i].trim().slice(0, 100),
        });
      }
    }
  }

  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const threshold = severityRank[failSeverity] || 2;
  const hasFailing = findings.some((f) => (severityRank[f.severity] || 0) >= threshold);

  return { file: relPath, findings, passed: !hasFailing };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runBatchReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges batch-review — Review multiple files with aggregated results

Usage:
  judges batch-review [dir]                 Review all source files
  judges batch-review --fail-on medium      Set failure threshold
  judges batch-review --format json         JSON output
  judges batch-review --summary             Show only summary

Options:
  [dir]                     Target directory (default: .)
  --fail-on <severity>      Fail threshold: critical/high/medium/low (default: medium)
  --summary                 Summary only, no per-file details
  --format json             JSON output
  --help, -h                Show this help

Reviews all source files in a directory and aggregates results. Each file
gets a pass/fail based on the severity threshold. Exit code 1 if any file fails.
`);
    return;
  }

  const start = Date.now();
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const failSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--fail-on") || "medium";
  const summaryOnly = argv.includes("--summary");
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        a !== "batch-review" &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--fail-on",
    ) || ".";

  const files = collectSourceFiles(dir);
  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const fileResults = files.map((f) => reviewFile(f, dir, failSeverity));
  const duration = Date.now() - start;

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  let totalFindings = 0;
  for (const fr of fileResults) {
    for (const f of fr.findings) {
      totalFindings++;
      if (f.severity === "critical") counts.critical++;
      else if (f.severity === "high") counts.high++;
      else if (f.severity === "medium") counts.medium++;
      else counts.low++;
    }
  }

  const passedFiles = fileResults.filter((r) => r.passed).length;
  const failedFiles = fileResults.filter((r) => !r.passed).length;

  const result: BatchResult = {
    totalFiles: files.length,
    passedFiles,
    failedFiles,
    totalFindings,
    counts,
    fileResults: summaryOnly ? [] : fileResults.filter((r) => r.findings.length > 0),
    duration,
  };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (failedFiles > 0) process.exitCode = 1;
    return;
  }

  const icon = failedFiles === 0 ? "✅" : "❌";
  console.log(`\n  Batch Review: ${icon}\n  ─────────────────────────────`);
  console.log(`    Files: ${passedFiles} passed, ${failedFiles} failed (${files.length} total)`);
  console.log(
    `    Findings: ${totalFindings} (C:${counts.critical} H:${counts.high} M:${counts.medium} L:${counts.low})`,
  );
  console.log(`    Duration: ${duration}ms`);
  console.log(`    Fail threshold: ${failSeverity}`);

  if (!summaryOnly) {
    const failedResults = fileResults.filter((r) => !r.passed);
    if (failedResults.length > 0) {
      console.log("\n    Failed files:");
      for (const fr of failedResults.slice(0, 20)) {
        console.log(`      ❌ ${fr.file} (${fr.findings.length} findings)`);
        for (const f of fr.findings.slice(0, 5)) {
          console.log(`           [${f.severity}] ${f.pattern} L${f.line}`);
        }
        if (fr.findings.length > 5) console.log(`           ... +${fr.findings.length - 5} more`);
      }
      if (failedResults.length > 20) console.log(`      ... +${failedResults.length - 20} more files`);
    }
  }

  console.log();
  if (failedFiles > 0) process.exitCode = 1;
}
