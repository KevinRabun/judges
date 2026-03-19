/**
 * Native Git Diff Evaluation
 *
 * Integrates git diff parsing directly into the evaluation pipeline,
 * eliminating the need for callers to manually compute changed lines.
 *
 * Provides:
 * - `evaluateGitDiff()` — evaluates changed files in a git diff
 * - `parseUnifiedDiffToChangedLines()` — extracts per-file changed lines from unified diff
 */

import { readFileSync } from "fs";
import { resolve, extname } from "path";
import type { DiffVerdict } from "./types.js";
import type { EvaluationOptions } from "./evaluators/index.js";
import { evaluateDiff } from "./evaluators/index.js";
import { tryRunGit } from "./tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileChangedLines {
  /** Relative file path */
  filePath: string;
  /** 1-based line numbers that were added or modified */
  changedLines: number[];
}

export interface GitDiffVerdict {
  /** Per-file diff verdicts */
  files: Array<{
    filePath: string;
    language: string;
    verdict: DiffVerdict;
  }>;
  /** Aggregate score across all files */
  overallScore: number;
  /** Aggregate finding count */
  totalFindings: number;
  /** Total changed lines analyzed */
  totalLinesAnalyzed: number;
  /** Files that were skipped (binary, too large, unreadable) */
  skippedFiles: string[];
  /** Summary */
  summary: string;
}

// ─── Diff Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a unified diff to extract per-file changed line numbers.
 * Handles standard `git diff` output format.
 *
 * Only tracks added/modified lines (lines starting with `+` in the diff),
 * since those are the lines that need review.
 */
export function parseUnifiedDiffToChangedLines(diffText: string): FileChangedLines[] {
  const result: FileChangedLines[] = [];
  let currentFile = "";
  let currentLines: number[] = [];

  for (const line of diffText.split("\n")) {
    // Match file header: +++ b/path/to/file
    if (line.startsWith("+++ b/")) {
      // Save previous file if it had changes
      if (currentFile && currentLines.length > 0) {
        result.push({ filePath: currentFile, changedLines: currentLines });
      }
      currentFile = line.substring(6);
      currentLines = [];
      continue;
    }

    // Match hunk header: @@ -old,count +new,count @@
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch && currentFile) {
      const startLine = parseInt(hunkMatch[1], 10);
      const lineCount = parseInt(hunkMatch[2] ?? "1", 10);
      // Track which new-side lines are additions
      // We track additions in the line-by-line scan below
      void startLine;
      void lineCount;
      continue;
    }

    // Inside a hunk — no need to know startLine here, we track as we go
  }

  // Flush last file
  if (currentFile && currentLines.length > 0) {
    result.push({ filePath: currentFile, changedLines: currentLines });
  }

  // Re-parse with proper line tracking using a stateful approach
  return parseWithLineTracking(diffText);
}

/**
 * Internal: stateful parse that tracks actual added line numbers.
 */
function parseWithLineTracking(diffText: string): FileChangedLines[] {
  const result: FileChangedLines[] = [];
  let currentFile = "";
  let currentLines: number[] = [];
  let newLineNum = 0;
  let inHunk = false;

  for (const line of diffText.split("\n")) {
    // File header
    if (line.startsWith("+++ b/")) {
      if (currentFile && currentLines.length > 0) {
        result.push({ filePath: currentFile, changedLines: [...currentLines] });
      }
      currentFile = line.substring(6);
      currentLines = [];
      inHunk = false;
      continue;
    }

    // Hunk header
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10);
      inHunk = true;
      continue;
    }

    if (!inHunk || !currentFile) continue;

    // Context line (present in both old and new)
    if (line.startsWith(" ")) {
      newLineNum++;
      continue;
    }

    // Added line
    if (line.startsWith("+")) {
      currentLines.push(newLineNum);
      newLineNum++;
      continue;
    }

    // Removed line (only in old side — don't increment new line counter)
    if (line.startsWith("-")) {
      continue;
    }

    // Any other line (e.g., \ No newline at end of file, or diff binary headers)
    // ends the hunk
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---")) {
      inHunk = false;
    }
  }

  // Flush last file
  if (currentFile && currentLines.length > 0) {
    result.push({ filePath: currentFile, changedLines: [...currentLines] });
  }

  return result;
}

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".php": "php",
  ".rb": "ruby",
  ".kt": "kotlin",
  ".swift": "swift",
  ".dart": "dart",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".bicep": "bicep",
  ".tf": "terraform",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function detectLanguageFromPath(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase();
  return EXT_LANGUAGE_MAP[ext];
}

// ─── Git Diff Evaluation ────────────────────────────────────────────────────

/**
 * Evaluate changed files from a git diff.
 *
 * Runs `git diff` between the specified base and the working tree (or HEAD),
 * parses the unified diff to extract per-file changed lines, reads each
 * changed file, and evaluates only the changed lines.
 *
 * @param repoPath - Path to the git repository root
 * @param base     - Base ref to diff against (e.g., "main", "HEAD~1", "origin/main")
 * @param options  - Evaluation options passed to each file evaluation
 * @returns Aggregate verdict across all changed files
 */
export function evaluateGitDiff(repoPath: string, base = "HEAD~1", options?: EvaluationOptions): GitDiffVerdict {
  // Get the unified diff
  const diffOutput = tryRunGit(["diff", base, "--unified=0"], { cwd: repoPath });
  if (diffOutput === null) {
    return {
      files: [],
      overallScore: 100,
      totalFindings: 0,
      totalLinesAnalyzed: 0,
      skippedFiles: [],
      summary: "Could not run git diff — ensure git is installed and this is a git repository.",
    };
  }

  if (diffOutput.trim().length === 0) {
    return {
      files: [],
      overallScore: 100,
      totalFindings: 0,
      totalLinesAnalyzed: 0,
      skippedFiles: [],
      summary: "No changes detected between working tree and " + base,
    };
  }

  const fileChanges = parseUnifiedDiffToChangedLines(diffOutput);
  const fileVerdicts: GitDiffVerdict["files"] = [];
  const skippedFiles: string[] = [];

  for (const fc of fileChanges) {
    const language = detectLanguageFromPath(fc.filePath);
    if (!language) {
      skippedFiles.push(fc.filePath);
      continue;
    }

    const absolutePath = resolve(repoPath, fc.filePath);
    let code: string;
    try {
      code = readFileSync(absolutePath, "utf-8");
    } catch {
      skippedFiles.push(fc.filePath);
      continue;
    }

    // Skip very large files
    if (code.length > 300_000) {
      skippedFiles.push(fc.filePath);
      continue;
    }

    const verdict = evaluateDiff(code, language, fc.changedLines, undefined, {
      ...options,
      filePath: fc.filePath,
    });

    fileVerdicts.push({ filePath: fc.filePath, language, verdict });
  }

  const totalFindings = fileVerdicts.reduce((sum, fv) => sum + fv.verdict.findings.length, 0);
  const totalLinesAnalyzed = fileVerdicts.reduce((sum, fv) => sum + fv.verdict.linesAnalyzed, 0);
  const overallScore =
    fileVerdicts.length > 0
      ? Math.round(fileVerdicts.reduce((sum, fv) => sum + fv.verdict.score, 0) / fileVerdicts.length)
      : 100;

  const summary =
    `Git diff analysis (${base}): ${fileVerdicts.length} file(s) analyzed, ` +
    `${totalLinesAnalyzed} changed lines, ${totalFindings} finding(s), ` +
    `score ${overallScore}/100` +
    (skippedFiles.length > 0 ? ` (${skippedFiles.length} file(s) skipped)` : "");

  return {
    files: fileVerdicts,
    overallScore,
    totalFindings,
    totalLinesAnalyzed,
    skippedFiles,
    summary,
  };
}

/**
 * Evaluate a pre-computed diff string (e.g., from a PR webhook payload).
 * Reads file content from the specified repo path.
 */
export function evaluateUnifiedDiff(diffText: string, repoPath: string, options?: EvaluationOptions): GitDiffVerdict {
  const fileChanges = parseUnifiedDiffToChangedLines(diffText);
  const fileVerdicts: GitDiffVerdict["files"] = [];
  const skippedFiles: string[] = [];

  for (const fc of fileChanges) {
    const language = detectLanguageFromPath(fc.filePath);
    if (!language) {
      skippedFiles.push(fc.filePath);
      continue;
    }

    const absolutePath = resolve(repoPath, fc.filePath);
    let code: string;
    try {
      code = readFileSync(absolutePath, "utf-8");
    } catch {
      skippedFiles.push(fc.filePath);
      continue;
    }

    if (code.length > 300_000) {
      skippedFiles.push(fc.filePath);
      continue;
    }

    const verdict = evaluateDiff(code, language, fc.changedLines, undefined, {
      ...options,
      filePath: fc.filePath,
    });

    fileVerdicts.push({ filePath: fc.filePath, language, verdict });
  }

  const totalFindings = fileVerdicts.reduce((sum, fv) => sum + fv.verdict.findings.length, 0);
  const totalLinesAnalyzed = fileVerdicts.reduce((sum, fv) => sum + fv.verdict.linesAnalyzed, 0);
  const overallScore =
    fileVerdicts.length > 0
      ? Math.round(fileVerdicts.reduce((sum, fv) => sum + fv.verdict.score, 0) / fileVerdicts.length)
      : 100;

  return {
    files: fileVerdicts,
    overallScore,
    totalFindings,
    totalLinesAnalyzed,
    skippedFiles,
    summary:
      `Diff analysis: ${fileVerdicts.length} file(s), ${totalLinesAnalyzed} changed lines, ` +
      `${totalFindings} finding(s), score ${overallScore}/100`,
  };
}
