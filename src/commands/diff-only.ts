/**
 * Diff-only evaluation — evaluate only changed lines in a PR or git diff.
 *
 * Parses unified diff output to identify changed line ranges,
 * then filters evaluation findings to only those touching changed code.
 * This drastically reduces noise in CI review comments.
 */

import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiffHunk {
  file: string;
  startLine: number;
  lineCount: number;
}

export interface DiffFilterResult {
  original: number;
  filtered: number;
  removed: number;
  findings: Finding[];
}

// ─── Diff Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a unified diff to extract changed file/line ranges.
 * Handles both `git diff` and `git diff --cached` output.
 */
export function parseDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentFile = "";

  for (const line of diff.split("\n")) {
    // Match +++ b/path/to/file
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Match @@ -old,count +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      hunks.push({
        file: currentFile,
        startLine: parseInt(hunkMatch[1], 10),
        lineCount: parseInt(hunkMatch[2] || "1", 10),
      });
    }
  }

  return hunks;
}

/**
 * Check whether a finding overlaps with any changed hunk.
 */
function isInDiff(finding: Finding, hunks: DiffHunk[]): boolean {
  const findingLine = finding.lineNumbers?.[0];
  if (!findingLine) return false;

  return hunks.some((h) => {
    return findingLine >= h.startLine && findingLine <= h.startLine + h.lineCount - 1;
  });
}

/**
 * Filter findings to only those touching changed lines.
 */
export function filterByDiff(findings: Finding[], diff: string): DiffFilterResult {
  const hunks = parseDiff(diff);
  const filtered = findings.filter((f) => isInDiff(f, hunks));

  return {
    original: findings.length,
    filtered: filtered.length,
    removed: findings.length - filtered.length,
    findings: filtered,
  };
}

/**
 * Get the list of changed files from a diff.
 */
export function getChangedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const match = line.match(/^\+\+\+ b\/(.+)$/);
    if (match) files.add(match[1]);
  }
  return [...files];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runDiffOnly(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges diff-only — Evaluate only changed lines in a PR or diff

Usage:
  judges diff-only --base main                  Diff against main branch
  judges diff-only --base HEAD~1                Diff against previous commit
  judges diff-only --diff-file changes.patch    Use a pre-generated diff

Options:
  --base <ref>          Git ref to diff against (default: main)
  --diff-file <path>    Pre-generated diff file
  --input <path>        JSON results to filter (default: run fresh eval)
  --format json         JSON output
  --help, -h            Show this help

The command diffs against the base ref, identifies changed lines,
and filters findings to only those touching changed code. This is
ideal for CI pipelines reviewing PRs.
`);
    return;
  }

  const { readFileSync, existsSync } = await import("fs");
  const { execSync } = await import("child_process");

  let diff: string;

  const diffFile = argv.find((_a: string, i: number) => argv[i - 1] === "--diff-file");
  if (diffFile && existsSync(diffFile)) {
    diff = readFileSync(diffFile, "utf-8");
  } else {
    const base = argv.find((_a: string, i: number) => argv[i - 1] === "--base") || "main";
    try {
      diff = execSync(`git diff ${base}`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    } catch {
      console.error(`Error: could not run git diff ${base}`);
      process.exit(1);
    }
  }

  const changedFiles = getChangedFiles(diff);
  const hunks = parseDiff(diff);
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (inputPath && existsSync(inputPath)) {
    const data = JSON.parse(readFileSync(inputPath, "utf-8"));
    const findings: Finding[] = data.evaluations
      ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
      : data.findings || data;

    const result = filterByDiff(findings, diff);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`\n  Diff-Only Filter Results\n`);
    console.log(`  Changed files: ${changedFiles.length}`);
    console.log(`  Changed hunks: ${hunks.length}`);
    console.log(`  Original findings: ${result.original}`);
    console.log(`  In diff: ${result.filtered}`);
    console.log(`  Filtered out: ${result.removed}\n`);

    for (const f of result.findings) {
      const loc = f.lineNumbers?.length ? `:${f.lineNumbers[0]}` : "";
      console.log(`  ${f.severity.padEnd(8)} ${f.ruleId}: ${f.title.slice(0, 80)}${loc}`);
    }
    console.log("");
    return;
  }

  // Just show diff info without filtering
  if (format === "json") {
    console.log(JSON.stringify({ changedFiles, hunks, totalHunks: hunks.length }, null, 2));
    return;
  }

  console.log(`\n  Changed Files (${changedFiles.length}):\n`);
  for (const f of changedFiles) {
    const fileHunks = hunks.filter((h) => h.file === f);
    const totalLines = fileHunks.reduce((s, h) => s + h.lineCount, 0);
    console.log(`    ${f}  (${fileHunks.length} hunks, ${totalLines} lines)`);
  }
  console.log(`\n  Run with --input <results.json> to filter findings.\n`);
}
