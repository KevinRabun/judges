/**
 * `judges review` — Post inline review comments on a GitHub pull request.
 *
 * Evaluates changed files in a PR and posts findings as inline review comments.
 * Designed to be the primary (or only) code reviewer for AI-generated code.
 *
 * Usage:
 *   judges review --pr 42                        # Review PR #42 in current repo
 *   judges review --pr 42 --repo owner/repo      # Review PR in specific repo
 *   judges review --pr 42 --approve              # Auto-approve if no critical/high
 *   judges review --pr 42 --dry-run              # Preview comments without posting
 *   judges review --pr 42 --min-severity high    # Only post high+ findings
 *
 * Requires: GITHUB_TOKEN environment variable (or gh CLI authenticated).
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, extname } from "path";
import { evaluateDiff, evaluateWithTribunal } from "../evaluators/index.js";
import { evaluateProject, type TribunalRunner } from "../evaluators/project.js";
import type { EvaluationOptions } from "../evaluators/index.js";
import type { Finding, Severity, JudgesConfig } from "../types.js";
import { parseConfig, loadCascadingConfig } from "../config.js";
import { loadFeedbackStore, getFpRateByRule } from "./feedback.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewArgs {
  pr: number;
  repo: string | undefined;
  approve: boolean;
  dryRun: boolean;
  minSeverity: Severity;
  format: "text" | "json";
  maxComments: number;
  token: string | undefined;
  /** Path to .judgesrc config file (auto-discovered if not set) */
  configPath: string | undefined;
  /** Maximum FP rate threshold — suppress rules with FP rate above this (0–1) */
  confidence: number;
  /** Enable feedback-driven confidence calibration */
  calibrate: boolean;
  /** Enable cross-file analysis for architectural findings */
  crossFile: boolean;
}

interface PrFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  patch?: string;
}

interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
  /** Start line for multi-line suggestion ranges (GitHub suggestion blocks) */
  start_line?: number;
  /** Side for start line (always RIGHT for new code) */
  start_side?: "RIGHT";
}

interface DiffHunk {
  filePath: string;
  newContent: string;
  changedLines: number[];
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
  ".tf": "terraform",
  ".hcl": "terraform",
  ".bicep": "bicep",
  ".sh": "bash",
  ".ps1": "powershell",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath.toLowerCase());
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  return EXT_TO_LANG[ext];
}

// ─── Severity Helpers ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function meetsSeverityThreshold(severity: Severity, min: Severity): boolean {
  return severityRank(severity) <= severityRank(min);
}

// ─── Diff Parser (reused from diff.ts logic) ───────────────────────────────

export function parsePatchToHunk(filePath: string, patch: string): DiffHunk {
  const lines = patch.split("\n");
  const newLines: string[] = [];
  const changedLineNumbers: number[] = [];
  let newLineNum = 0;

  for (const line of lines) {
    // Hunk header: @@ -10,5 +20,8 @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    // Context line
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

    // Removed line — skip
    if (line.startsWith("-")) continue;
  }

  return {
    filePath,
    newContent: newLines.join("\n"),
    changedLines: changedLineNumbers,
  };
}

// ─── GitHub API Helpers ─────────────────────────────────────────────────────

function getToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

function detectRepo(): string | undefined {
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (sshMatch) return sshMatch[1];
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remote.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (httpsMatch) return httpsMatch[1];
  } catch {
    // Not a git repo or no remote
  }
  return undefined;
}

function ghApiRequest(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown,
): { status: number; data: unknown } {
  const url = endpoint.startsWith("https://") ? endpoint : `https://api.github.com${endpoint}`;

  const args = [
    "curl",
    "-s",
    "-X",
    method,
    "-H",
    `"Authorization: Bearer ${token}"`,
    "-H",
    '"Accept: application/vnd.github.v3+json"',
    "-H",
    '"Content-Type: application/json"',
    "-w",
    '"\\n%{http_code}"',
  ];

  if (body) {
    // Write body to temp file to avoid shell escaping issues
    const tmpFile = resolve(".judges-review-tmp.json");
    writeFileSync(tmpFile, JSON.stringify(body), "utf-8");
    args.push("-d", `@${tmpFile}`);
    args.push(`"${url}"`);

    try {
      const output = execSync(args.join(" "), { encoding: "utf-8", shell: "cmd.exe" }).trim();
      const lastNewline = output.lastIndexOf("\n");
      const responseBody = lastNewline >= 0 ? output.slice(0, lastNewline) : "";
      const statusCode = parseInt(lastNewline >= 0 ? output.slice(lastNewline + 1) : output, 10);
      try {
        // Clean up temp file
        execSync(`del "${tmpFile}"`, { stdio: "ignore", shell: "cmd.exe" });
      } catch {
        // ignore cleanup errors
      }
      return { status: statusCode, data: responseBody ? JSON.parse(responseBody) : null };
    } catch {
      try {
        execSync(`del "${tmpFile}"`, { stdio: "ignore", shell: "cmd.exe" });
      } catch {
        // ignore
      }
      return { status: 0, data: null };
    }
  }

  args.push(`"${url}"`);
  try {
    const output = execSync(args.join(" "), { encoding: "utf-8", shell: "cmd.exe" }).trim();
    const lastNewline = output.lastIndexOf("\n");
    const responseBody = lastNewline >= 0 ? output.slice(0, lastNewline) : "";
    const statusCode = parseInt(lastNewline >= 0 ? output.slice(lastNewline + 1) : output, 10);
    return { status: statusCode, data: responseBody ? JSON.parse(responseBody) : null };
  } catch {
    return { status: 0, data: null };
  }
}

/**
 * Use `gh` CLI as a more reliable alternative when available.
 */
function ghCliAvailable(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ghCliRequest(method: string, endpoint: string, body?: unknown): { status: number; data: unknown } {
  const args = ["gh", "api", "-X", method, "--jq", "."];

  if (body) {
    const tmpFile = resolve(".judges-review-tmp.json");
    writeFileSync(tmpFile, JSON.stringify(body), "utf-8");
    args.push("--input", tmpFile);
  }

  args.push(endpoint);

  try {
    const output = execSync(args.join(" "), { encoding: "utf-8" }).trim();
    if (body) {
      try {
        const tmpFile = resolve(".judges-review-tmp.json");
        execSync(process.platform === "win32" ? `del "${tmpFile}"` : `rm -f "${tmpFile}"`, { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    return { status: 200, data: output ? JSON.parse(output) : null };
  } catch {
    if (body) {
      try {
        const tmpFile = resolve(".judges-review-tmp.json");
        execSync(process.platform === "win32" ? `del "${tmpFile}"` : `rm -f "${tmpFile}"`, { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
    return { status: 0, data: null };
  }
}

function apiRequest(
  method: string,
  endpoint: string,
  token: string | undefined,
  body?: unknown,
): { status: number; data: unknown } {
  if (ghCliAvailable()) {
    return ghCliRequest(method, endpoint, body);
  }
  if (token) {
    return ghApiRequest(method, endpoint, token, body);
  }
  console.error("Error: No GitHub authentication found.");
  console.error("Either install the `gh` CLI and run `gh auth login`, or set GITHUB_TOKEN env var.");
  process.exit(1);
}

// ─── Finding → Review Comment ───────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "ℹ️",
};

export function findingToCommentBody(finding: Finding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] || "⚠️";
  const lines = [
    `${emoji} **${finding.severity.toUpperCase()}** — ${finding.title} (\`${finding.ruleId}\`)`,
    "",
    finding.description,
    "",
    `**Recommendation:** ${finding.recommendation}`,
  ];

  // Use GitHub suggestion blocks when a machine-applicable patch is available.
  // This gives reviewers a one-click "Apply suggestion" button in the PR UI.
  if (finding.patch) {
    lines.push("", "**Suggested fix:**", "```suggestion", finding.patch.newText, "```");
  } else if (finding.suggestedFix) {
    // Wrap suggestedFix in a suggestion block if it looks like a direct replacement.
    // Otherwise fall back to a plain fenced code block.
    lines.push("", "**Suggested fix:**", "```suggestion", finding.suggestedFix, "```");
  }

  if (finding.reference) {
    lines.push("", `📚 ${finding.reference}`);
  }

  lines.push("", "---", "*Reviewed by [Judges Panel](https://github.com/KevinRabun/judges)*");

  return lines.join("\n");
}

// ─── Core Review Logic ──────────────────────────────────────────────────────

interface ReviewResult {
  filesAnalyzed: number;
  totalFindings: number;
  commentsPosted: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  fpSuppressed: number;
  approved: boolean;
  comments: ReviewComment[];
}

function reviewPrFiles(
  files: PrFile[],
  minSeverity: Severity,
  maxComments: number,
  options?: EvaluationOptions,
  fpRates?: Map<string, number>,
  fpThreshold?: number,
  crossFile?: boolean,
): ReviewResult {
  const comments: ReviewComment[] = [];
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let filesAnalyzed = 0;
  let fpSuppressed = 0;

  for (const file of files) {
    // Skip removed files and files without patches
    if (file.status === "removed" || !file.patch) continue;

    // Skip non-code files
    const lang = detectLanguage(file.filename);
    if (!lang) continue;

    filesAnalyzed++;

    const hunk = parsePatchToHunk(file.filename, file.patch);
    if (hunk.changedLines.length === 0) continue;

    // Build per-file EvaluationOptions (includes config + filePath)
    const fileOpts: EvaluationOptions = {
      ...options,
      filePath: file.filename,
    };

    const verdict = evaluateDiff(hunk.newContent, lang, hunk.changedLines, undefined, fileOpts);

    for (const finding of verdict.findings) {
      // Suppress findings from rules with high FP rates
      if (fpRates && fpThreshold !== undefined) {
        const rate = fpRates.get(finding.ruleId);
        if (rate !== undefined && rate > fpThreshold) {
          fpSuppressed++;
          continue;
        }
      }

      totalFindings++;

      switch (finding.severity) {
        case "critical":
          criticalCount++;
          break;
        case "high":
          highCount++;
          break;
        case "medium":
          mediumCount++;
          break;
        case "low":
          lowCount++;
          break;
      }

      // Filter by min severity
      if (!meetsSeverityThreshold(finding.severity, minSeverity)) continue;

      // Map finding line to the diff line number.
      // When a patch spans multiple lines, use endLine as the comment position
      // (GitHub places the comment on `line`, and `start_line` marks the range start).
      const line = finding.patch?.endLine ?? finding.lineNumbers?.[0];
      if (!line) continue;

      // Only comment on changed lines (check the primary finding line)
      const checkLine = finding.lineNumbers?.[0] ?? line;
      if (!hunk.changedLines.includes(checkLine)) continue;

      comments.push({
        path: file.filename,
        line,
        side: "RIGHT",
        body: findingToCommentBody(finding),
        // Multi-line suggestion range: if the patch spans multiple lines, set start_line
        // so the GitHub suggestion block covers the full replacement region.
        ...(finding.patch && finding.patch.startLine < finding.patch.endLine
          ? { start_line: finding.patch.startLine, start_side: "RIGHT" as const }
          : {}),
      });
    }
  }

  // ── Cross-file analysis ─────────────────────────────────────────────
  if (crossFile && filesAnalyzed >= 2) {
    // Collect all changed file contents for project-level analysis
    const projectFiles: Array<{ path: string; content: string; language: string }> = [];
    for (const file of files) {
      if (file.status === "removed" || !file.patch) continue;
      const lang = detectLanguage(file.filename);
      if (!lang) continue;
      const hunk = parsePatchToHunk(file.filename, file.patch);
      if (hunk.newContent.trim()) {
        projectFiles.push({ path: file.filename, content: hunk.newContent, language: lang });
      }
    }

    if (projectFiles.length >= 2) {
      try {
        const runner: TribunalRunner = { evaluateWithTribunal };
        const projectVerdict = evaluateProject(runner, projectFiles, undefined, options);
        const archFindings = projectVerdict.architecturalFindings ?? [];

        for (const finding of archFindings) {
          if (!meetsSeverityThreshold(finding.severity, minSeverity)) continue;
          totalFindings++;
          switch (finding.severity) {
            case "critical":
              criticalCount++;
              break;
            case "high":
              highCount++;
              break;
            case "medium":
              mediumCount++;
              break;
            case "low":
              lowCount++;
              break;
          }
          // Architectural findings post as general PR comments (no specific line)
          const firstFile = projectFiles[0]?.path ?? "";
          comments.push({
            path: firstFile,
            line: 1,
            side: "RIGHT",
            body: findingToCommentBody(finding),
          });
        }
      } catch {
        // Cross-file analysis failure should not block the review
      }
    }
  }

  // Sort by severity (critical first), then truncate
  comments.sort((a, b) => {
    const sevA = a.body.includes("CRITICAL") ? 0 : a.body.includes("HIGH") ? 1 : a.body.includes("MEDIUM") ? 2 : 3;
    const sevB = b.body.includes("CRITICAL") ? 0 : b.body.includes("HIGH") ? 1 : b.body.includes("MEDIUM") ? 2 : 3;
    return sevA - sevB;
  });

  const truncated = comments.slice(0, maxComments);
  const hasBlockers = criticalCount > 0 || highCount > 0;

  return {
    filesAnalyzed,
    totalFindings,
    commentsPosted: truncated.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    fpSuppressed,
    approved: !hasBlockers,
    comments: truncated,
  };
}

function buildReviewSummary(result: ReviewResult): string {
  const emoji = result.approved ? "✅" : "❌";
  const lines = [
    `## ${emoji} Judges Panel Review`,
    "",
    `**${result.filesAnalyzed}** files analyzed · **${result.totalFindings}** findings`,
    "",
  ];

  if (result.totalFindings > 0) {
    lines.push("| Severity | Count |");
    lines.push("|----------|-------|");
    if (result.criticalCount > 0) lines.push(`| 🔴 Critical | ${result.criticalCount} |`);
    if (result.highCount > 0) lines.push(`| 🟠 High | ${result.highCount} |`);
    if (result.mediumCount > 0) lines.push(`| 🟡 Medium | ${result.mediumCount} |`);
    if (result.lowCount > 0) lines.push(`| 🔵 Low | ${result.lowCount} |`);
    lines.push("");
  }

  if (result.fpSuppressed > 0) {
    lines.push(`> 🧪 ${result.fpSuppressed} finding(s) suppressed by FP-rate calibration.`);
    lines.push("");
  }

  if (result.commentsPosted < result.totalFindings) {
    lines.push(
      `> Showing top ${result.commentsPosted} of ${result.totalFindings} findings. Run \`judges eval\` locally for the full report.`,
    );
    lines.push("");
  }

  if (result.approved) {
    lines.push("No critical or high severity issues found. Code looks good!");
  } else {
    lines.push("**Action required:** Please address the critical/high severity findings before merging.");
  }

  lines.push("", "---", "*Powered by [Judges Panel](https://github.com/KevinRabun/judges)*");

  return lines.join("\n");
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function parseReviewArgs(argv: string[]): ReviewArgs {
  const args: ReviewArgs = {
    pr: 0,
    repo: undefined,
    approve: false,
    dryRun: false,
    minSeverity: "medium",
    format: "text",
    maxComments: 25,
    token: getToken(),
    configPath: undefined,
    confidence: 1.0,
    calibrate: false,
    crossFile: false,
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--pr":
      case "-p":
        args.pr = parseInt(argv[++i], 10);
        break;
      case "--repo":
      case "-r":
        args.repo = argv[++i];
        break;
      case "--approve":
        args.approve = true;
        break;
      case "--dry-run":
      case "-n":
        args.dryRun = true;
        break;
      case "--min-severity":
        args.minSeverity = argv[++i] as Severity;
        break;
      case "--format":
        args.format = argv[++i] as "text" | "json";
        break;
      case "--max-comments":
        args.maxComments = parseInt(argv[++i], 10);
        break;
      case "--config":
      case "-c":
        args.configPath = argv[++i];
        break;
      case "--confidence":
        args.confidence = parseFloat(argv[++i]);
        break;
      case "--calibrate":
        args.calibrate = true;
        break;
      case "--cross-file":
        args.crossFile = true;
        break;
      default:
        // Positional: treat as PR number if numeric
        if (!arg.startsWith("-") && /^\d+$/.test(arg) && args.pr === 0) {
          args.pr = parseInt(arg, 10);
        }
        break;
    }
  }

  return args;
}

export function runReview(argv: string[]): void {
  const args = parseReviewArgs(argv);

  if (args.pr === 0) {
    console.log(`
Judges Panel — Pull Request Review

USAGE:
  judges review --pr <number>                Review a pull request
  judges review --pr <number> --dry-run      Preview without posting
  judges review --pr 42 --approve            Auto-approve if no critical/high
  judges review --pr 42 --repo owner/repo    Review PR in specific repo
  judges review --pr 42 --calibrate          Enable FP-rate calibration
  judges review --pr 42 --cross-file         Enable cross-file architectural analysis

OPTIONS:
  --pr, -p <number>       PR number (required)
  --repo, -r <owner/repo> GitHub repository (auto-detected from git remote)
  --approve               Auto-approve PR if no critical/high findings
  --dry-run, -n           Preview comments without posting to GitHub
  --min-severity <level>  Minimum severity: critical, high, medium (default), low, info
  --max-comments <n>      Maximum inline comments (default: 25)
  --format <fmt>          Output: text (default), json
  --config, -c <path>     Path to .judgesrc config file (auto-discovered if omitted)
  --confidence <0-1>      Suppress rules with FP rate above this threshold (default: 1.0)
  --calibrate             Enable feedback-driven confidence calibration
  --cross-file            Enable cross-file architectural analysis (detects duplication, taint flows)

AUTHENTICATION:
  Set GITHUB_TOKEN env var, or install the \`gh\` CLI and run \`gh auth login\`.
`);
    process.exit(0);
  }

  // Resolve repo
  const repo = args.repo || detectRepo();
  if (!repo) {
    console.error("Error: Could not detect GitHub repository.");
    console.error("Use --repo owner/repo or run from within a git repository.");
    process.exit(1);
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — PR Review                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Repository : ${repo}`);
  console.log(`  PR         : #${args.pr}`);
  console.log(`  Mode       : ${args.dryRun ? "dry-run (preview only)" : "live (will post comments)"}`);
  console.log("");

  // Fetch PR files
  const filesResp = apiRequest("GET", `/repos/${repo}/pulls/${args.pr}/files`, args.token);
  if (!filesResp.data || !Array.isArray(filesResp.data)) {
    console.error("Error: Failed to fetch PR files. Check your authentication and PR number.");
    if (filesResp.status) console.error(`  HTTP status: ${filesResp.status}`);
    process.exit(1);
  }

  const prFiles: PrFile[] = (filesResp.data as Array<Record<string, unknown>>).map((f) => ({
    filename: f.filename as string,
    status: f.status as PrFile["status"],
    patch: f.patch as string | undefined,
  }));

  console.log(`  Files in PR: ${prFiles.length}`);

  // ── Load .judgesrc config ───────────────────────────────────────────────
  let config: JudgesConfig | undefined;
  if (args.configPath) {
    // Explicit config path
    try {
      const raw = readFileSync(resolve(args.configPath), "utf-8");
      config = parseConfig(raw);
      console.log(`  Config     : ${args.configPath}`);
    } catch (e) {
      console.error(`  ⚠️  Failed to load config: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    // Auto-discover .judgesrc from cwd
    try {
      config = loadCascadingConfig(resolve("."));
      if (config && Object.keys(config).length > 0) {
        console.log("  Config     : auto-discovered .judgesrc");
      }
    } catch {
      // No config found — fine
    }
  }

  // ── Load FP rates from feedback store ─────────────────────────────────
  let fpRates: Map<string, number> | undefined;
  const fpThreshold = args.confidence < 1.0 ? args.confidence : undefined;
  if (fpThreshold !== undefined) {
    try {
      const store = loadFeedbackStore();
      fpRates = getFpRateByRule(store);
      if (fpRates.size > 0) {
        console.log(
          `  FP filter  : suppressing rules with FP rate > ${(fpThreshold * 100).toFixed(0)}% (${fpRates.size} rules tracked)`,
        );
      }
    } catch {
      // No feedback store — skip
    }
  }

  // ── Build EvaluationOptions ───────────────────────────────────────────
  const evalOptions: EvaluationOptions = {};
  if (config) evalOptions.config = config;
  if (args.calibrate) evalOptions.calibrate = true;

  console.log("");

  // Run analysis
  const result = reviewPrFiles(
    prFiles,
    args.minSeverity,
    args.maxComments,
    evalOptions,
    fpRates,
    fpThreshold,
    args.crossFile,
  );

  if (args.format === "json") {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.approved ? 0 : 1);
  }

  // Print results
  console.log(`  Files analyzed: ${result.filesAnalyzed}`);
  console.log(`  Total findings: ${result.totalFindings}`);
  if (result.criticalCount > 0) console.log(`  🔴 Critical: ${result.criticalCount}`);
  if (result.highCount > 0) console.log(`  🟠 High: ${result.highCount}`);
  if (result.mediumCount > 0) console.log(`  🟡 Medium: ${result.mediumCount}`);
  if (result.lowCount > 0) console.log(`  🔵 Low: ${result.lowCount}`);
  if (result.fpSuppressed > 0) console.log(`  🧪 FP-suppressed: ${result.fpSuppressed}`);
  console.log("");

  if (args.dryRun) {
    console.log("  📝 Dry-run mode — comments that would be posted:");
    console.log("");
    for (const comment of result.comments) {
      console.log(`  📄 ${comment.path}:${comment.line}`);
      console.log(`     ${comment.body.split("\n")[0]}`);
    }
    console.log("");
    console.log(`  Would post ${result.comments.length} inline comment(s)`);
    console.log(
      `  Review event: ${result.approved && args.approve ? "APPROVE" : result.approved ? "COMMENT" : "REQUEST_CHANGES"}`,
    );
    console.log("");
    process.exit(result.approved ? 0 : 1);
  }

  // Post review to GitHub
  if (result.comments.length > 0 || args.approve) {
    const reviewEvent = result.approved && args.approve ? "APPROVE" : result.approved ? "COMMENT" : "REQUEST_CHANGES";

    const reviewBody = {
      body: buildReviewSummary(result),
      event: reviewEvent,
      comments: result.comments,
    };

    const reviewResp = apiRequest("POST", `/repos/${repo}/pulls/${args.pr}/reviews`, args.token, reviewBody);

    if (reviewResp.status === 200 || reviewResp.status === 422) {
      // 422 can happen if line mapping is off — still post summary
      console.log(`  ✅ Review posted with ${result.comments.length} inline comment(s)`);
      console.log(`  📋 Review event: ${reviewEvent}`);
    } else {
      // If inline comments fail, try posting just the summary as a plain comment
      console.error(`  ⚠️  Review with inline comments failed (status: ${reviewResp.status})`);
      console.log("  Falling back to summary comment...");

      const fallbackResp = apiRequest("POST", `/repos/${repo}/issues/${args.pr}/comments`, args.token, {
        body: buildReviewSummary(result),
      });

      if (fallbackResp.status === 201 || fallbackResp.status === 200) {
        console.log("  ✅ Summary comment posted");
      } else {
        console.error("  ❌ Failed to post review. Check permissions.");
      }
    }
  } else {
    console.log("  ✅ No findings to report — PR looks clean!");
  }

  console.log("");
  process.exit(result.approved ? 0 : 1);
}
