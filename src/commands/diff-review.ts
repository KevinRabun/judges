/**
 * Diff-review — Review only changed lines in a diff/patch rather than full files.
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiffHunk {
  file: string;
  startLine: number;
  lineCount: number;
  content: string;
}

interface DiffFinding {
  pattern: string;
  severity: string;
  file: string;
  line: number;
  content: string;
}

interface DiffReviewResult {
  hunksAnalyzed: number;
  linesAnalyzed: number;
  findings: DiffFinding[];
  counts: { critical: number; high: number; medium: number; low: number; total: number };
}

// ─── Patterns ──────────────────────────────────────────────────────────────

const DIFF_PATTERNS: { name: string; severity: string; regex: RegExp }[] = [
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
  { name: "missing-await", severity: "high", regex: /(?:return|=)\s+(?!await\b)[a-zA-Z]+\.(then|catch)\s*\(/ },
  { name: "deprecated-api", severity: "medium", regex: /new\s+Buffer\s*\(|\.substr\s*\(/ },
  { name: "console-log", severity: "low", regex: /console\.log\s*\(/ },
  { name: "todo-fixme", severity: "low", regex: /\/\/\s*(?:TODO|FIXME|HACK)\b/i },
];

// ─── Diff parsing ──────────────────────────────────────────────────────────

function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split("\n");
  let currentFile = "";
  let hunkStart = 0;
  let hunkLines: string[] = [];
  let lineNum = 0;

  for (const line of lines) {
    // Detect file header
    const fileMatch = /^\+\+\+\s+b\/(.+)/.exec(line);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Detect hunk header
    const hunkMatch = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
    if (hunkMatch) {
      // Save previous hunk
      if (hunkLines.length > 0 && currentFile) {
        hunks.push({
          file: currentFile,
          startLine: hunkStart,
          lineCount: hunkLines.length,
          content: hunkLines.join("\n"),
        });
      }
      hunkStart = parseInt(hunkMatch[1], 10);
      lineNum = hunkStart;
      hunkLines = [];
      continue;
    }

    // Only analyze added lines (starting with +)
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hunkLines.push(`${lineNum}:${line.slice(1)}`);
      lineNum++;
    } else if (!line.startsWith("-")) {
      lineNum++;
    }
  }

  // Save last hunk
  if (hunkLines.length > 0 && currentFile) {
    hunks.push({ file: currentFile, startLine: hunkStart, lineCount: hunkLines.length, content: hunkLines.join("\n") });
  }

  return hunks;
}

function analyzeHunks(hunks: DiffHunk[]): DiffReviewResult {
  const findings: DiffFinding[] = [];
  let totalLines = 0;

  for (const hunk of hunks) {
    const lines = hunk.content.split("\n");
    totalLines += lines.length;

    for (const line of lines) {
      const lineMatch = /^(\d+):(.*)/.exec(line);
      if (!lineMatch) continue;

      const lineNum = parseInt(lineMatch[1], 10);
      const lineContent = lineMatch[2];

      for (const pat of DIFF_PATTERNS) {
        if (pat.regex.test(lineContent)) {
          findings.push({
            pattern: pat.name,
            severity: pat.severity,
            file: hunk.file,
            line: lineNum,
            content: lineContent.trim(),
          });
        }
      }
    }
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length };
  for (const f of findings) {
    if (f.severity === "critical") counts.critical++;
    else if (f.severity === "high") counts.high++;
    else if (f.severity === "medium") counts.medium++;
    else counts.low++;
  }

  return { hunksAnalyzed: hunks.length, linesAnalyzed: totalLines, findings, counts };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDiffReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges diff-review — Review only changed lines in a diff

Usage:
  judges diff-review                        Review staged changes (git diff --cached)
  judges diff-review --base main            Review changes vs a branch
  judges diff-review --file patch.diff      Review a diff file
  judges diff-review --format json          JSON output

Options:
  --base <ref>         Compare against branch/commit (default: staged changes)
  --file <path>        Read diff from a file instead of git
  --format json        JSON output
  --help, -h           Show this help

Focuses review effort on only the changed lines, providing faster and
more relevant feedback for pull requests and commits.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const base = argv.find((_a: string, i: number) => argv[i - 1] === "--base");
  const diffFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  let diffText: string;

  if (diffFile) {
    try {
      diffText = readFileSync(diffFile, "utf-8");
    } catch {
      console.error(`Error: Cannot read diff file '${diffFile}'.`);
      process.exitCode = 1;
      return;
    }
  } else {
    try {
      const gitCmd = base ? `git diff ${base}...HEAD` : "git diff --cached";
      diffText = execSync(gitCmd, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      }).toString();
    } catch {
      console.error("Error: Failed to get git diff. Are you in a git repository?");
      process.exitCode = 1;
      return;
    }
  }

  if (!diffText.trim()) {
    console.log("No changes to review.");
    return;
  }

  const hunks = parseDiff(diffText);
  const result = analyzeHunks(hunks);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Diff Review\n  ─────────────────────────────`);
  console.log(`    Hunks analyzed: ${result.hunksAnalyzed}`);
  console.log(`    Lines analyzed: ${result.linesAnalyzed}`);
  console.log(
    `    Findings: ${result.counts.total} (C:${result.counts.critical} H:${result.counts.high} M:${result.counts.medium} L:${result.counts.low})`,
  );

  if (result.findings.length > 0) {
    console.log("\n    Findings in changed code:");
    for (const f of result.findings.slice(0, 30)) {
      const sevIcon =
        f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "🔵";
      console.log(`      ${sevIcon} [${f.severity}] ${f.pattern} — ${f.file}:${f.line}`);
    }
    if (result.findings.length > 30) {
      console.log(`      ... and ${result.findings.length - 30} more`);
    }
  } else {
    console.log("\n    ✅ No issues found in changed code.");
  }

  console.log();
}
