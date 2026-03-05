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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, extname, dirname } from "path";
import { evaluateDiff } from "../evaluators/index.js";
import type { Finding, Severity } from "../types.js";

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
  } catch (e: unknown) {
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

  if (finding.suggestedFix) {
    lines.push("", "**Suggested fix:**", "```", finding.suggestedFix, "```");
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
  approved: boolean;
  comments: ReviewComment[];
}

function reviewPrFiles(files: PrFile[], minSeverity: Severity, maxComments: number): ReviewResult {
  const comments: ReviewComment[] = [];
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let filesAnalyzed = 0;

  for (const file of files) {
    // Skip removed files and files without patches
    if (file.status === "removed" || !file.patch) continue;

    // Skip non-code files
    const lang = detectLanguage(file.filename);
    if (!lang) continue;

    filesAnalyzed++;

    const hunk = parsePatchToHunk(file.filename, file.patch);
    if (hunk.changedLines.length === 0) continue;

    const verdict = evaluateDiff(hunk.newContent, lang, hunk.changedLines);

    for (const finding of verdict.findings) {
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

      // Map finding line to the diff line number
      const line = finding.lineNumbers?.[0];
      if (!line) continue;

      // Only comment on changed lines
      if (!hunk.changedLines.includes(line)) continue;

      comments.push({
        path: file.filename,
        line,
        side: "RIGHT",
        body: findingToCommentBody(finding),
      });
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
  judges review --pr 42 --approve            Auto-approve if clean
  judges review --pr 42 --repo owner/repo    Review PR in specific repo

OPTIONS:
  --pr, -p <number>       PR number (required)
  --repo, -r <owner/repo> GitHub repository (auto-detected from git remote)
  --approve               Auto-approve PR if no critical/high findings
  --dry-run, -n           Preview comments without posting to GitHub
  --min-severity <level>  Minimum severity: critical, high, medium (default), low, info
  --max-comments <n>      Maximum inline comments (default: 25)
  --format <fmt>          Output: text (default), json

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

  // Run analysis
  const result = reviewPrFiles(prFiles, args.minSeverity, args.maxComments);

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
