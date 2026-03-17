/**
 * Blame-review — git-blame integrated historical finding attribution.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { runGit, tryRunGit } from "../tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BlameEntry {
  commit: string;
  author: string;
  date: string;
  lineNumber: number;
  content: string;
}

interface FindingAttribution {
  finding: string;
  severity: string;
  introducedBy: string;
  author: string;
  date: string;
  lineNumber: number;
  ageInDays: number;
}

interface AuthorSummary {
  author: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface BlameReport {
  totalFindings: number;
  attributions: FindingAttribution[];
  authorSummaries: AuthorSummary[];
  oldestFinding: FindingAttribution | null;
  newestFinding: FindingAttribution | null;
  averageAgeDays: number;
}

// ─── Known patterns to detect ──────────────────────────────────────────────

const PATTERNS: { name: string; severity: string; regex: RegExp }[] = [
  {
    name: "hardcoded-secret",
    severity: "critical",
    regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}/i,
  },
  { name: "eval-usage", severity: "critical", regex: /\beval\s*\(/ },
  { name: "sql-concat", severity: "critical", regex: /(?:query|execute)\s*\(\s*["'`].*\+/ },
  { name: "empty-catch", severity: "medium", regex: /catch\s*\([^)]*\)\s*\{\s*\}/ },
  { name: "console-log", severity: "low", regex: /console\.log\s*\(/ },
  { name: "todo-fixme", severity: "low", regex: /\/\/\s*(?:TODO|FIXME|HACK|XXX)\b/i },
  { name: "any-type", severity: "medium", regex: /:\s*any\b/ },
  { name: "deprecated-api", severity: "medium", regex: /new\s+Buffer\s*\(|\.substr\s*\(|\.addListener\s*\(/i },
  { name: "unsafe-regex", severity: "high", regex: /new\s+RegExp\s*\([^)]*\+/ },
  { name: "missing-await", severity: "high", regex: /(?:return|=)\s+(?!await\b)[a-zA-Z]+\.(then|catch)\s*\(/ },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function isGitRepo(): boolean {
  return tryRunGit(["rev-parse", "--is-inside-work-tree"], { timeout: 5000 }) !== null;
}

function gitBlameFile(filePath: string, since?: string): BlameEntry[] {
  try {
    const args = ["blame", "--line-porcelain"];
    if (since) args.push(`--since=${since}`);
    args.push("--", filePath);
    const out = runGit(args, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      trim: false,
    });

    const entries: BlameEntry[] = [];
    const lines = out.split("\n");
    let commit = "";
    let author = "";
    let date = "";
    let lineNum = 0;

    for (const line of lines) {
      const commitMatch = /^([0-9a-f]{40})\s+\d+\s+(\d+)/.exec(line);
      if (commitMatch) {
        commit = commitMatch[1];
        lineNum = parseInt(commitMatch[2], 10);
        continue;
      }
      if (line.startsWith("author ")) {
        author = line.slice(7);
        continue;
      }
      if (line.startsWith("author-time ")) {
        const ts = parseInt(line.slice(12), 10);
        date = new Date(ts * 1000).toISOString().slice(0, 10);
        continue;
      }
      if (line.startsWith("\t")) {
        entries.push({
          commit: commit.slice(0, 8),
          author,
          date,
          lineNumber: lineNum,
          content: line.slice(1),
        });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

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
        // skip inaccessible
      }
    }
  }
  walk(dir);
  return files;
}

function daysBetween(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ─── Core analysis ─────────────────────────────────────────────────────────

function analyzeBlame(files: string[], since?: string, authorFilter?: string): BlameReport {
  const attributions: FindingAttribution[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const fileLines = content.split("\n");

    // Quick pattern scan first
    const lineHits: { line: number; pattern: string; severity: string }[] = [];
    for (let i = 0; i < fileLines.length; i++) {
      for (const pat of PATTERNS) {
        if (pat.regex.test(fileLines[i])) {
          lineHits.push({ line: i + 1, pattern: pat.name, severity: pat.severity });
        }
      }
    }

    if (lineHits.length === 0) continue;

    // Get blame data
    const blameEntries = gitBlameFile(filePath, since);
    const blameByLine = new Map<number, BlameEntry>();
    for (const entry of blameEntries) {
      blameByLine.set(entry.lineNumber, entry);
    }

    for (const hit of lineHits) {
      const blame = blameByLine.get(hit.line);
      if (!blame) continue;
      if (authorFilter && blame.author !== authorFilter) continue;

      attributions.push({
        finding: hit.pattern,
        severity: hit.severity,
        introducedBy: blame.commit,
        author: blame.author,
        date: blame.date,
        lineNumber: hit.line,
        ageInDays: daysBetween(blame.date),
      });
    }
  }

  // Build author summaries
  const authorMap = new Map<string, AuthorSummary>();
  for (const attr of attributions) {
    let summary = authorMap.get(attr.author);
    if (!summary) {
      summary = { author: attr.author, totalFindings: 0, critical: 0, high: 0, medium: 0, low: 0 };
      authorMap.set(attr.author, summary);
    }
    summary.totalFindings++;
    if (attr.severity === "critical") summary.critical++;
    else if (attr.severity === "high") summary.high++;
    else if (attr.severity === "medium") summary.medium++;
    else summary.low++;
  }

  const sorted = [...attributions].sort((a, b) => b.ageInDays - a.ageInDays);
  const totalAge = attributions.reduce((sum, a) => sum + a.ageInDays, 0);

  return {
    totalFindings: attributions.length,
    attributions,
    authorSummaries: [...authorMap.values()].sort((a, b) => b.totalFindings - a.totalFindings),
    oldestFinding: sorted.length > 0 ? sorted[0] : null,
    newestFinding: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    averageAgeDays: attributions.length > 0 ? Math.round(totalAge / attributions.length) : 0,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runBlameReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges blame-review — Git-blame integrated finding attribution

Usage:
  judges blame-review [dir]                  Analyze current directory
  judges blame-review --since "3 months"     Sprint-scoped analysis
  judges blame-review --author "Jane"        Author-focused coaching
  judges blame-review --format json          JSON output

Options:
  [dir]                 Target directory (default: .)
  --since <period>      Only consider commits since period
  --author <name>       Filter to specific author
  --format json         JSON output
  --help, -h            Show this help

Attributes findings to the commits and authors that introduced them.
Shows tech debt accrual timeline and author coaching summaries.
`);
    return;
  }

  if (!isGitRepo()) {
    console.error("Error: Not inside a git repository.");
    process.exitCode = 1;
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const since = argv.find((_a: string, i: number) => argv[i - 1] === "--since");
  const authorFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        argv.indexOf(a) > 0 &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--since" &&
        argv[argv.indexOf(a) - 1] !== "--author",
    ) || ".";

  const files = collectSourceFiles(dir);
  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const report = analyzeBlame(files, since, authorFilter);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Blame Review\n  ─────────────────────────────`);
  console.log(`    Files scanned: ${files.length}`);
  console.log(`    Findings attributed: ${report.totalFindings}`);
  console.log(`    Average age: ${report.averageAgeDays} days`);

  if (report.oldestFinding) {
    console.log(`\n    Oldest finding:`);
    console.log(
      `      ${report.oldestFinding.finding} (${report.oldestFinding.severity}) — ${report.oldestFinding.date} by ${report.oldestFinding.author} (${report.oldestFinding.ageInDays} days)`,
    );
  }

  if (report.newestFinding) {
    console.log(`\n    Newest finding:`);
    console.log(
      `      ${report.newestFinding.finding} (${report.newestFinding.severity}) — ${report.newestFinding.date} by ${report.newestFinding.author} (${report.newestFinding.ageInDays} days)`,
    );
  }

  if (report.authorSummaries.length > 0) {
    console.log(`\n    Author Attribution:`);
    for (const author of report.authorSummaries) {
      const breakdown = [];
      if (author.critical > 0) breakdown.push(`${author.critical} critical`);
      if (author.high > 0) breakdown.push(`${author.high} high`);
      if (author.medium > 0) breakdown.push(`${author.medium} medium`);
      if (author.low > 0) breakdown.push(`${author.low} low`);
      console.log(`      ${author.author}: ${author.totalFindings} findings (${breakdown.join(", ")})`);
    }
  }

  if (report.totalFindings === 0) {
    console.log("\n    ✅ No pattern-based findings detected in scanned files.");
  }

  console.log();
}
