// ─── Diff Command ────────────────────────────────────────────────────────────
// Evaluate only changed lines from a unified diff or git diff output.
//
// Usage:
//   git diff HEAD~1 | judges diff --language typescript
//   judges diff --file changes.patch --language typescript
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { evaluateDiff } from "../evaluators/index.js";

// ─── Unified Diff Parser ────────────────────────────────────────────────────

interface DiffHunk {
  /** File path from the diff header */
  filePath: string;
  /** The full new-side content reconstructed from the diff */
  newContent: string;
  /** Changed line numbers (1-based) in the new content */
  changedLines: number[];
}

/**
 * Parse a unified diff into hunks with changed line information.
 * Handles `git diff` and standard `diff -u` output.
 */
function parseUnifiedDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split("\n");

  let currentFile: string | undefined;
  let newLines: string[] = [];
  let changedLineNumbers: number[] = [];
  let newLineNum = 0;

  function flushFile(): void {
    if (currentFile && (newLines.length > 0 || changedLineNumbers.length > 0)) {
      hunks.push({
        filePath: currentFile,
        newContent: newLines.join("\n"),
        changedLines: changedLineNumbers,
      });
    }
    newLines = [];
    changedLineNumbers = [];
    newLineNum = 0;
  }

  for (const line of lines) {
    // New file header: +++ b/path/to/file.ts
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "").trim();
      if (path !== "/dev/null") {
        flushFile();
        currentFile = path;
      }
      continue;
    }

    // Skip --- header
    if (line.startsWith("--- ")) continue;

    // Hunk header: @@ -10,5 +20,8 @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10) - 1; // will increment on first line
      continue;
    }

    // diff --git header — skip
    if (line.startsWith("diff --git ") || line.startsWith("index ")) continue;

    // Context line (starts with space or is empty in diff)
    if (line.startsWith(" ") || (line === "" && newLineNum > 0)) {
      newLineNum++;
      newLines.push(line.startsWith(" ") ? line.slice(1) : line);
      continue;
    }

    // Added line
    if (line.startsWith("+")) {
      newLineNum++;
      changedLineNumbers.push(newLineNum);
      newLines.push(line.slice(1));
      continue;
    }

    // Removed line — skip (not in new content)
    if (line.startsWith("-")) {
      continue;
    }
  }

  flushFile();
  return hunks;
}

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
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
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath.toLowerCase());
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  return EXT_TO_LANG[ext];
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function parseDiffArgs(argv: string[]): { file?: string; language?: string; format: string } {
  let file: string | undefined;
  let language: string | undefined;
  let format = "text";

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        file = argv[++i];
        break;
      case "--language":
      case "-l":
        language = argv[++i];
        break;
      case "--format":
      case "-o":
        format = argv[++i];
        break;
      default:
        if (!arg.startsWith("-") && !file) file = arg;
        break;
    }
  }

  return { file, language, format };
}

export function runDiff(argv: string[]): void {
  const args = parseDiffArgs(argv);

  // Read diff from file or stdin
  let diffText: string;
  if (args.file) {
    const abs = resolve(args.file);
    if (!existsSync(abs)) {
      console.error(`Error: File not found: ${abs}`);
      process.exit(1);
    }
    diffText = readFileSync(abs, "utf-8");
  } else if (!process.stdin.isTTY) {
    try {
      diffText = readFileSync(0, "utf-8");
    } catch {
      console.error("Error: Could not read diff from stdin");
      process.exit(1);
    }
  } else {
    console.error("Usage: git diff | judges diff --language <lang>");
    console.error("       judges diff --file changes.patch");
    process.exit(1);
    return; // unreachable but satisfies TS
  }

  const hunks = parseUnifiedDiff(diffText);

  if (hunks.length === 0) {
    console.log("No changed files found in diff.");
    process.exit(0);
  }

  let totalFindings = 0;
  let worstScore = 100;
  const allResults: Array<{ file: string; verdict: ReturnType<typeof evaluateDiff> }> = [];

  for (const hunk of hunks) {
    if (hunk.changedLines.length === 0) continue;

    const lang = args.language || detectLanguage(hunk.filePath) || "typescript";

    // Enhanced: load full file from disk when available for richer context.
    // The evaluator still scopes findings to only the changed lines.
    let codeToEvaluate = hunk.newContent;
    const changedLines = hunk.changedLines;
    const absPath = resolve(hunk.filePath);
    if (existsSync(absPath)) {
      try {
        codeToEvaluate = readFileSync(absPath, "utf-8");
        // changedLines remain the same — they reference the new-side line numbers
        // which correspond to the on-disk file (post-patch)
      } catch {
        // Fall back to reconstructed content from the diff
        codeToEvaluate = hunk.newContent;
      }
    }

    const verdict = evaluateDiff(codeToEvaluate, lang, changedLines);
    totalFindings += verdict.findings.length;
    if (verdict.score < worstScore) worstScore = verdict.score;
    allResults.push({ file: hunk.filePath, verdict });
  }

  if (args.format === "json") {
    console.log(JSON.stringify({ files: allResults, totalFindings, worstScore }, null, 2));
  } else {
    // Text output
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║              Judges Panel — Diff Analysis                    ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");

    for (const { file, verdict } of allResults) {
      const icon = verdict.verdict === "pass" ? "✅" : verdict.verdict === "warning" ? "⚠️ " : "❌";
      console.log(
        `  ${icon} ${file} — ${verdict.score}/100 (${verdict.findings.length} findings, ${verdict.linesAnalyzed} lines changed)`,
      );
      for (const f of verdict.findings) {
        console.log(`     [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}`);
      }
    }

    console.log("");
    console.log(
      `  Total: ${totalFindings} finding(s) across ${allResults.length} file(s), worst score: ${worstScore}/100`,
    );
    console.log("");
  }

  process.exit(totalFindings > 0 && worstScore < 50 ? 1 : 0);
}
