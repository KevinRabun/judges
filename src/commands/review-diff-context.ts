/**
 * Review-diff-context — Provide additional context around diff hunks for reviews.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiffHunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  context: { before: string[]; after: string[] };
}

interface DiffContextReport {
  timestamp: string;
  contextLines: number;
  hunks: DiffHunk[];
  totalFiles: number;
}

// ─── Diff Parsing ───────────────────────────────────────────────────────────

function parseDiffOutput(diffText: string, contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split("\n");
  let currentFile = "";
  let hunkLines: string[] = [];
  let hunkStart = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      continue;
    }
    if (line.startsWith("--- ")) continue;
    if (line.startsWith("@@ ")) {
      // Flush previous hunk
      if (hunkLines.length > 0 && currentFile) {
        hunks.push(buildHunk(currentFile, hunkStart, hunkLines, contextLines));
        hunkLines = [];
      }
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      hunkStart = match ? parseInt(match[1], 10) : 1;
      continue;
    }
    if (line.startsWith("diff --git")) {
      // Flush previous hunk
      if (hunkLines.length > 0 && currentFile) {
        hunks.push(buildHunk(currentFile, hunkStart, hunkLines, contextLines));
        hunkLines = [];
      }
      continue;
    }
    if (currentFile && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      hunkLines.push(line);
    }
  }

  // Flush final hunk
  if (hunkLines.length > 0 && currentFile) {
    hunks.push(buildHunk(currentFile, hunkStart, hunkLines, contextLines));
  }

  return hunks;
}

function buildHunk(file: string, startLine: number, lines: string[], contextLines: number): DiffHunk {
  const content = lines.join("\n");
  const endLine = startLine + lines.filter((l) => !l.startsWith("-")).length - 1;
  const contextBefore: string[] = [];
  const contextAfter: string[] = [];

  // Try to read surrounding context from the file
  if (existsSync(file)) {
    try {
      const fileLines = readFileSync(file, "utf-8").split("\n");
      const bStart = Math.max(0, startLine - 1 - contextLines);
      const bEnd = Math.max(0, startLine - 1);
      for (let i = bStart; i < bEnd; i++) {
        contextBefore.push(fileLines[i] || "");
      }
      const aStart = endLine;
      const aEnd = Math.min(fileLines.length, endLine + contextLines);
      for (let i = aStart; i < aEnd; i++) {
        contextAfter.push(fileLines[i] || "");
      }
    } catch {
      // File unreadable, skip context
    }
  }

  return { file, startLine, endLine, content, context: { before: contextBefore, after: contextAfter } };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDiffContext(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-diff-context — Provide additional context for diff reviews

Usage:
  judges review-diff-context                         Show diff with context
  judges review-diff-context --context 10            Custom context lines
  judges review-diff-context --ref HEAD~3            Compare against a ref
  judges review-diff-context --file src/api.ts       Focus on specific file

Options:
  --context <n>         Number of context lines (default: 5)
  --ref <gitref>        Git ref to compare against (default: HEAD~1)
  --file <path>         Focus on a specific file
  --staged              Show only staged changes
  --format json         JSON output
  --help, -h            Show this help

Shows diff hunks with surrounding file context to help reviewers
understand the broader code landscape around changes.
`);
    return;
  }

  const contextLines = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--context") || "5", 10);
  const ref = argv.find((_a: string, i: number) => argv[i - 1] === "--ref") || "HEAD~1";
  const fileFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const staged = argv.includes("--staged");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Get diff
  let diffText: string;
  try {
    const diffArgs = staged ? ["diff", "--staged"] : ["diff", ref];
    if (fileFilter) diffArgs.push("--", fileFilter);
    diffText = execSync(`git ${diffArgs.join(" ")}`, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  } catch {
    console.error("Error: Could not run git diff. Are you in a git repository?");
    process.exitCode = 1;
    return;
  }

  if (!diffText.trim()) {
    console.log("No changes found.");
    return;
  }

  const hunks = parseDiffOutput(diffText, contextLines);
  const uniqueFiles = new Set(hunks.map((h) => h.file));
  const report: DiffContextReport = {
    timestamp: new Date().toISOString(),
    contextLines,
    hunks,
    totalFiles: uniqueFiles.size,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nDiff Context Report:");
  console.log("═".repeat(70));
  console.log(`  Files changed: ${uniqueFiles.size}  Hunks: ${hunks.length}  Context: ±${contextLines} lines`);
  console.log("═".repeat(70));

  for (const hunk of hunks) {
    console.log(`\n  ── ${hunk.file} (lines ${hunk.startLine}–${hunk.endLine}) ──`);
    if (hunk.context.before.length > 0) {
      console.log("  [context before]");
      for (const l of hunk.context.before) {
        console.log(`    │ ${l}`);
      }
    }
    console.log("  [changes]");
    for (const l of hunk.content.split("\n")) {
      const prefix = l.startsWith("+") ? "  + " : l.startsWith("-") ? "  - " : "    ";
      console.log(`${prefix}${l.slice(1)}`);
    }
    if (hunk.context.after.length > 0) {
      console.log("  [context after]");
      for (const l of hunk.context.after) {
        console.log(`    │ ${l}`);
      }
    }
  }
  console.log("\n" + "═".repeat(70));
}
