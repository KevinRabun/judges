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
import type { Finding } from "../types.js";

// ─── Unified Diff Parser ────────────────────────────────────────────────────

interface DiffHunk {
  /** File path from the diff header */
  filePath: string;
  /** The full new-side content reconstructed from the diff */
  newContent: string;
  /** Changed line numbers (1-based) in the new content */
  changedLines: number[];
  /** Lines that were removed (deleted) from the old version */
  removedLines: string[];
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
  let removedLineTexts: string[] = [];
  let newLineNum = 0;

  function flushFile(): void {
    if (currentFile && (newLines.length > 0 || changedLineNumbers.length > 0 || removedLineTexts.length > 0)) {
      hunks.push({
        filePath: currentFile,
        newContent: newLines.join("\n"),
        changedLines: changedLineNumbers,
        removedLines: removedLineTexts,
      });
    }
    newLines = [];
    changedLineNumbers = [];
    removedLineTexts = [];
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

    // Removed line — capture for deletion analysis
    if (line.startsWith("-")) {
      removedLineTexts.push(line.slice(1));
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

// ─── Deletion Analysis ──────────────────────────────────────────────────────

/**
 * Patterns that indicate security-relevant code. When these are removed
 * in a diff, it's a red flag that deserves a finding.
 */
const SECURITY_DELETION_PATTERNS: Array<{ pattern: RegExp; label: string; description: string }> = [
  {
    pattern:
      /(?:authenticate|authorization|isAuthenticated|requireAuth|requireLogin|passport\.|jwt\.verify|verifyToken|checkAuth|ensureAuth)/i,
    label: "authentication/authorization check",
    description: "Removing authentication or authorization logic may expose endpoints to unauthorized access.",
  },
  {
    pattern:
      /(?:validateInput|sanitize|escapeHtml|xss|DOMPurify|createDOMPurify|purify\.sanitize|validator\.|express-validator)/i,
    label: "input validation/sanitization",
    description: "Removing input validation or sanitization may re-introduce injection vulnerabilities.",
  },
  {
    pattern: /(?:rateLimit|rateLimiter|throttle|express-rate-limit|bottleneck|RateLimiterMemory)/i,
    label: "rate limiting",
    description: "Removing rate limiting may expose the service to denial-of-service attacks.",
  },
  {
    pattern: /(?:helmet|csrf|csurf|cors\(|Content-Security-Policy|X-Frame-Options|Strict-Transport-Security)/i,
    label: "security headers/middleware",
    description: "Removing security headers or middleware weakens the application's defense-in-depth.",
  },
  {
    pattern: /(?:bcrypt|argon2|scrypt|pbkdf2|crypto\.createHash|hashPassword|comparePassword|\.hash\(|\.compare\()/i,
    label: "password hashing/crypto",
    description: "Removing cryptographic operations may lead to plaintext credential storage.",
  },
  {
    pattern:
      /(?:try\s*\{|catch\s*\(|\.catch\(|process\.on\s*\(\s*['"]uncaughtException|process\.on\s*\(\s*['"]unhandledRejection)/i,
    label: "error handling",
    description: "Removing error handling may cause unhandled exceptions to crash the process or leak stack traces.",
  },
];

/**
 * Analyze removed lines for security-relevant deletions.
 * Returns findings for patterns that were deleted from the codebase.
 */
function analyzeDeletions(removedLines: string[], filePath: string): Finding[] {
  if (removedLines.length === 0) return [];
  const findings: Finding[] = [];
  const combinedRemoved = removedLines.join("\n");

  for (const { pattern, label, description } of SECURITY_DELETION_PATTERNS) {
    if (pattern.test(combinedRemoved)) {
      findings.push({
        ruleId: "DIFF-DEL-001",
        severity: "high",
        title: `Deleted ${label} code`,
        description:
          `This diff removes code related to ${label}. ${description} ` +
          "Ensure the removed functionality is handled elsewhere or is intentionally deprecated.",
        recommendation:
          `Verify that ${label} is still provided by another module or middleware. ` +
          "If this removal is intentional, add a code comment explaining the rationale.",
        reference: "Secure Code Review — Deletion Impact Analysis",
        confidence: 0.72,
        provenance: "diff-deletion-analysis",
      });
    }
  }

  return findings;
}

// ─── Cross-file Breaking Change Detection ────────────────────────────────────

/**
 * Pattern matching exported function/method signatures in common languages.
 * Captures: [fullMatch, functionName, paramList]
 */
const EXPORT_SIG_PATTERN =
  /(?:export\s+(?:default\s+)?(?:async\s+)?function|export\s+(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\(|pub\s+fn|def\s+|public\s+(?:static\s+)?(?:async\s+)?\w+\s+)\s*(\w+)\s*\(([^)]*)\)/g;

/**
 * Extract exported function signatures from code lines.
 * Returns a map of functionName → parameter string.
 */
function extractExportedSignatures(lines: string[]): Map<string, string> {
  const sigs = new Map<string, string>();
  const combined = lines.join("\n");
  EXPORT_SIG_PATTERN.lastIndex = 0;
  let m;
  while ((m = EXPORT_SIG_PATTERN.exec(combined)) !== null) {
    const fnName = m[1];
    const params = m[2].trim();
    sigs.set(fnName, params);
  }
  return sigs;
}

/**
 * Count the number of parameters in a parameter list string.
 */
function countParams(paramStr: string): number {
  if (!paramStr.trim()) return 0;
  // Handle generic type parameters by removing angle-bracket contents
  const cleaned = paramStr.replace(/<[^>]*>/g, "");
  return cleaned.split(",").length;
}

/**
 * Detect breaking changes in exported function signatures.
 * Compares removed (old) vs added (new) exported signatures and flags:
 * - Added required parameters (increases arity)
 * - Removed parameters (may break callers relying on position)
 * - Renamed functions (removed export + new one)
 */
function analyzeBreakingChanges(removedLines: string[], addedLines: string[], filePath: string): Finding[] {
  const oldSigs = extractExportedSignatures(removedLines);
  const newSigs = extractExportedSignatures(addedLines);
  const findings: Finding[] = [];

  for (const [fnName, oldParams] of oldSigs) {
    const newParams = newSigs.get(fnName);
    if (newParams === undefined) continue; // Function was removed entirely, not a sig change

    const oldCount = countParams(oldParams);
    const newCount = countParams(newParams);

    if (newCount > oldCount) {
      // Added parameters — potential breaking change if not optional
      const hasOptional = /\?\s*:|=\s*[^,)]+/.test(newParams);
      if (!hasOptional || newCount - oldCount > 1) {
        findings.push({
          ruleId: "DIFF-BREAK-001",
          severity: "high",
          title: `Breaking change: \`${fnName}\` signature expanded`,
          description:
            `Exported function \`${fnName}\` in ${filePath} changed from ${oldCount} to ${newCount} parameter(s). ` +
            "Callers in other files may break if the new parameters are required.",
          recommendation:
            "Make new parameters optional with default values, or add a new function with the extended signature " +
            "and deprecate the old one to maintain backward compatibility.",
          reference: "Semantic Versioning — Breaking Changes",
          confidence: 0.7,
          provenance: "diff-breaking-change-analysis",
        });
      }
    } else if (newCount < oldCount) {
      findings.push({
        ruleId: "DIFF-BREAK-001",
        severity: "high",
        title: `Breaking change: \`${fnName}\` parameters removed`,
        description:
          `Exported function \`${fnName}\` in ${filePath} changed from ${oldCount} to ${newCount} parameter(s). ` +
          "Callers passing the removed parameters will get unexpected behavior or type errors.",
        recommendation:
          "Mark parameters as deprecated (accept but ignore) rather than removing them, " +
          "or update all call sites before merging.",
        reference: "Semantic Versioning — Breaking Changes",
        confidence: 0.75,
        provenance: "diff-breaking-change-analysis",
      });
    }
  }

  return findings;
}

// ─── Test Adequacy Check ─────────────────────────────────────────────────────

/**
 * Patterns that identify test files by path.
 */
const TEST_FILE_PATTERNS = [
  /\.(?:test|spec|tests|specs)\.\w+$/i,
  /(?:^|\/|\\)(?:tests?|__tests__|spec)(?:\/|\\)/i,
  /\.stories\.\w+$/i,
  /\.e2e\.\w+$/i,
];

/**
 * Files that are configuration / non-production and don't need test coverage.
 */
const CONFIG_FILE_PATTERNS = [
  /\.(?:json|ya?ml|toml|ini|cfg|env|lock|md|txt|css|scss|less|svg|png|jpg|ico)$/i,
  /(?:^|\/|\\)(?:\.github|\.vscode|\.idea|node_modules|dist|build|coverage)(?:\/|\\)/i,
  /(?:Dockerfile|Makefile|docker-compose|\.gitignore|\.eslintrc|\.prettierrc|tsconfig|jest\.config)/i,
];

function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
}

function isConfigFile(filePath: string): boolean {
  return CONFIG_FILE_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Check if production code changes have corresponding test changes.
 * Returns findings for production files with significant changes but no
 * related test file changes in the same diff.
 */
function analyzeTestAdequacy(hunks: DiffHunk[]): Finding[] {
  const prodFiles: string[] = [];
  const testFiles = new Set<string>();

  for (const hunk of hunks) {
    if (isConfigFile(hunk.filePath)) continue;
    if (isTestFile(hunk.filePath)) {
      testFiles.add(hunk.filePath);
    } else if (hunk.changedLines.length > 0) {
      prodFiles.push(hunk.filePath);
    }
  }

  if (prodFiles.length === 0 || testFiles.size > 0) return [];

  // Only flag if there are non-trivial production changes (> 5 changed lines total)
  const totalProdChanges = hunks
    .filter((h) => prodFiles.includes(h.filePath))
    .reduce((sum, h) => sum + h.changedLines.length, 0);
  if (totalProdChanges <= 5) return [];

  const findings: Finding[] = [];
  const fileList =
    prodFiles.length <= 5
      ? prodFiles.join(", ")
      : `${prodFiles.slice(0, 5).join(", ")} and ${prodFiles.length - 5} more`;

  findings.push({
    ruleId: "TEST-COV-001",
    severity: "medium",
    title: "Production code changed without test updates",
    description:
      `This diff modifies ${prodFiles.length} production file(s) (${fileList}) ` +
      `with ${totalProdChanges} changed line(s) but includes no changes to test files. ` +
      "Changed production code should have corresponding test updates to maintain coverage.",
    recommendation:
      "Add or update tests covering the modified functionality. " +
      "If changes are purely cosmetic (formatting, comments), this finding can be suppressed.",
    reference: "Code Review Best Practices — Test Coverage for Changes",
    confidence: 0.65,
    provenance: "diff-test-adequacy-analysis",
  });

  return findings;
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

    // Analyze removed lines for security-relevant deletions
    const deletionFindings = analyzeDeletions(hunk.removedLines, hunk.filePath);
    if (deletionFindings.length > 0) {
      verdict.findings.push(...deletionFindings);
    }

    // Detect cross-file breaking changes in exported signatures
    const addedLines = hunk.newContent.split("\n").filter((_, i) => hunk.changedLines.includes(i + 1));
    const breakingFindings = analyzeBreakingChanges(hunk.removedLines, addedLines, hunk.filePath);
    if (breakingFindings.length > 0) {
      verdict.findings.push(...breakingFindings);
    }

    totalFindings += verdict.findings.length;
    if (verdict.score < worstScore) worstScore = verdict.score;
    allResults.push({ file: hunk.filePath, verdict });
  }

  // Cross-file: test adequacy check
  const testAdequacyFindings = analyzeTestAdequacy(hunks);
  if (testAdequacyFindings.length > 0) {
    totalFindings += testAdequacyFindings.length;
    // Attach to the first production file result or create a virtual entry
    const firstProdResult = allResults.find((r) => !isTestFile(r.file) && !isConfigFile(r.file));
    if (firstProdResult) {
      firstProdResult.verdict.findings.push(...testAdequacyFindings);
    } else {
      allResults.push({
        file: "(cross-file)",
        verdict: {
          linesAnalyzed: 0,
          findings: testAdequacyFindings,
          score: 85,
          verdict: "warning" as const,
          summary: "Production code changed without test updates.",
        },
      });
    }
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
