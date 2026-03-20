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

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { resolve, join, extname } from "path";
import { createHash } from "node:crypto";
import { evaluateDiff, evaluateWithTribunal } from "../evaluators/index.js";
import { evaluateProject, type TribunalRunner } from "../evaluators/project.js";

// Test hook to override evaluateDiff in unit tests
let evaluateDiffImpl = evaluateDiff;
export function __setEvaluateDiffImplForTest(fn: typeof evaluateDiff | undefined) {
  evaluateDiffImpl = fn ?? evaluateDiff;
}
import type { EvaluationOptions } from "../evaluators/index.js";
import type { Finding, Severity, JudgesConfig } from "../types.js";
import { parseConfig, loadCascadingConfig } from "../config.js";
import { loadFeedbackStore, getFpRateByRule } from "./feedback.js";
import { JUDGES } from "../judges/index.js";
import { parseGitHubRepo, tryRunGit } from "../tools/command-safety.js";
import { extractValidatedLlmFindings, constructTribunalPrompt } from "./llm-benchmark.js";
import { buildContextSnippets } from "../context/context-snippets.js";

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
  /** Minimum finding confidence to include (0–1). Findings below this are dropped. */
  minConfidence: number;
  /** Enable feedback-driven confidence calibration */
  calibrate: boolean;
  /** Enable cross-file analysis for architectural findings */
  crossFile: boolean;
  /** Only run these judges (comma-separated IDs). All others are disabled. */
  judges?: string[];
  /** Enable Layer 2 (LLM) deep review augmentation */
  llmDeepReview?: boolean;
  /** OpenAI-compatible model name (e.g., gpt-4o) */
  llmModel?: string;
  /** OpenAI-compatible base URL override */
  llmBaseUrl?: string;
  /** Max tokens for LLM responses */
  llmMaxTokens?: number;
  /** Enable autopilot: fetch diff, post inline comments, and summary automatically */
  autopilot?: boolean;
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

export function dedupeComments(comments: ReviewComment[]): ReviewComment[] {
  const seen = new Set<string>();
  const out: ReviewComment[] = [];
  for (const c of comments) {
    const key = `${c.path}:${c.line}:${hashBody(c.body)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function filterAlreadyPostedComments(
  repo: string,
  pr: number,
  token: string | undefined,
  comments: ReviewComment[],
): ReviewComment[] {
  try {
    const resp = apiRequest("GET", `/repos/${repo}/pulls/${pr}/comments`, token);
    const existing = (resp.data as Array<Record<string, unknown>>) ?? [];
    const existingKeys = new Set(
      existing.map((c) => {
        const path = c.path as string;
        const line = c.line as number;
        const body = (c.body as string) ?? "";
        return `${path}:${line}:${hashBody(body)}`;
      }),
    );
    return comments.filter((c) => !existingKeys.has(`${c.path}:${c.line}:${hashBody(c.body)}`));
  } catch (err) {
    console.error("Failed to fetch existing comments, proceeding without dedupe", err);
    return comments;
  }
}

function hashBody(body: string): string {
  return createHash("sha1").update(body).digest("hex").slice(0, 8);
}

interface DiffHunk {
  filePath: string;
  newContent: string;
  changedLines: number[];
}

// ─── Language Detection ─────────────────────────────────────────────────────

import { detectLanguageFromPath as detectLanguage } from "../ext-to-lang.js";

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
    // Hunk header: @@ -10,5 +20,8 @@ (some tools omit trailing space/@@)
    const hunkMatch = line.match(/^@@\s*-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@?/);
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
  const remote = tryRunGit(["remote", "get-url", "origin"]);
  return remote ? parseGitHubRepo(remote) : undefined;
}

function ghApiRequest(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown,
): { status: number; data: unknown } {
  const url = endpoint.startsWith("https://") ? endpoint : `https://api.github.com${endpoint}`;

  const curlArgs = [
    "-s",
    "-X",
    method,
    "-H",
    `Authorization: Bearer ${token}`,
    "-H",
    "Accept: application/vnd.github.v3+json",
    "-H",
    "Content-Type: application/json",
    "-w",
    "\n%{http_code}",
  ];

  if (body) {
    // Write body to temp file to avoid shell escaping issues
    const tmpFile = join(tmpdir(), `.judges-review-tmp-${process.pid}.json`);
    writeFileSync(tmpFile, JSON.stringify(body), "utf-8");
    curlArgs.push("-d", `@${tmpFile}`);
    curlArgs.push(url);

    try {
      const output = execFileSync("curl", curlArgs, { encoding: "utf-8" }).trim();
      const lastNewline = output.lastIndexOf("\n");
      const responseBody = lastNewline >= 0 ? output.slice(0, lastNewline) : "";
      const statusCode = parseInt(lastNewline >= 0 ? output.slice(lastNewline + 1) : output, 10);
      try {
        // Clean up temp file
        unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
      return { status: statusCode, data: responseBody ? JSON.parse(responseBody) : null };
    } catch {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore
      }
      return { status: 0, data: null };
    }
  }

  curlArgs.push(url);
  try {
    const output = execFileSync("curl", curlArgs, { encoding: "utf-8" }).trim();
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
    execFileSync("gh", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ghCliRequest(method: string, endpoint: string, body?: unknown): { status: number; data: unknown } {
  const ghArgs = ["api", "-X", method, "--jq", "."];

  const tmpFile = resolve(".judges-review-tmp.json");
  if (body) {
    writeFileSync(tmpFile, JSON.stringify(body), "utf-8");
    ghArgs.push("--input", tmpFile);
  }

  ghArgs.push(endpoint);

  try {
    const output = execFileSync("gh", ghArgs, { encoding: "utf-8" }).trim();
    if (body) {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
    return { status: 200, data: output ? JSON.parse(output) : null };
  } catch {
    if (body) {
      try {
        unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
    return { status: 0, data: null };
  }
}

// Allow test injection of the GitHub API layer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let apiRequestImpl: any;

function apiRequest(
  method: string,
  endpoint: string,
  token: string | undefined,
  body?: unknown,
): { status: number; data: unknown } {
  const impl = apiRequestImpl;
  if (impl) {
    return impl(method, endpoint, token, body);
  }
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

export function __setApiRequestImplForTest(fn: typeof ghApiRequest | undefined) {
  apiRequestImpl = fn;
}

// ─── LLM Deep Review (optional Layer 2 augmentation) ───────────────────────

interface LlmClientOptions {
  model: string;
  baseUrl?: string;
  apiKey: string;
  maxTokens?: number;
}

async function callOpenAiChat(prompt: string, opts: LlmClientOptions): Promise<string> {
  const baseUrl = opts.baseUrl || "https://api.openai.com/v1/chat/completions";
  // Node 18+ has global fetch; avoid dynamic imports to keep tsc happy without node-fetch types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchImpl: any = (globalThis as any).fetch;
  if (!fetchImpl) throw new Error("fetch() not available. Run on Node 18+ or polyfill fetch.");
  const res = await fetchImpl(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM request failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM response missing content");
  return content;
}

// test hooks for dependency injection
let callOpenAiChatImpl = callOpenAiChat;
export function __setCallOpenAiChatImplForTest(fn: typeof callOpenAiChat) {
  callOpenAiChatImpl = fn;
}

/** Build a single prompt for the entire PR (tribunal mode). */
function buildLlmPromptForPr(prFiles: PrFile[], maxBytes = 40000): { prompt: string; contextSnippets: string[] } {
  const snippets: string[] = [];
  for (const f of prFiles) {
    if (!f.patch) continue;
    if (Buffer.byteLength(f.patch, "utf-8") > maxBytes) continue; // drop huge patches
    snippets.push(`--- FILE: ${f.filename} ---\n${f.patch}`);
  }
  const combined = snippets.join("\n\n");
  const prompt = `Review the following PR diff. Return issues with rule IDs, severity, and recommendations.\n\n${combined}`;
  return { prompt, contextSnippets: snippets.slice(0, 5) };
}

export async function runLlmDeepReview(
  prFiles: PrFile[],
  args: ReviewArgs,
): Promise<{ summary?: string; warnings?: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { warnings: ["OPENAI_API_KEY not set; skipping LLM deep review"] };
  }
  const model = args.llmModel || process.env.OPENAI_MODEL || "gpt-4o";
  const baseUrl = args.llmBaseUrl || process.env.OPENAI_BASE_URL;
  const { constructTribunalPrompt } = await import("./llm-benchmark.js");
  const { buildContextSnippets } = await import("../context/context-snippets.js");

  // Build code blob for tribunal prompt; collapse patches to new content
  const codeBlobs: string[] = [];
  const snippetsForRag: string[] = [];
  for (const pf of prFiles) {
    if (!pf.patch) continue;
    const hunk = parsePatchToHunk(pf.filename, pf.patch);
    codeBlobs.push(`// FILE: ${pf.filename}\n${hunk.newContent}`);
    snippetsForRag.push(hunk.newContent);
  }
  const codeJoined = codeBlobs.join("\n\n");

  // Build context snippets (RAG-lite) for prompt grounding
  const ragSnippets = await buildContextSnippets(snippetsForRag.join("\n\n"), {
    maxSnippets: 4,
    chunkSize: 1500,
  });
  const contextText = ragSnippets.map((s) => s.snippet);

  const tribunalPrompt = constructTribunalPrompt(codeJoined, "mixed", contextText);
  const { prompt: diffPrompt } = buildLlmPromptForPr(prFiles);

  const combinedPrompt = `${tribunalPrompt}\n\n---\n\nDiff summary for additional context:\n${diffPrompt}`;
  const content = await callOpenAiChatImpl(combinedPrompt, { apiKey, model, baseUrl, maxTokens: args.llmMaxTokens });

  // Validate structured findings in LLM output
  // Use global registry prefixes to validate LLM output
  const { getValidRulePrefixes } = await import("./llm-benchmark.js");
  const validation = extractValidatedLlmFindings(content, getValidRulePrefixes());
  const warnings = validation.errors?.length ? validation.errors : undefined;

  const summaryLines = [
    `### 🤖 LLM Deep Review Summary (model: ${model})`,
    "",
    validation.ruleIds.length ? `Detected rule IDs: ${validation.ruleIds.join(", ")}` : "No rule IDs detected.",
    "",
    content,
  ];

  return { summary: summaryLines.join("\n"), warnings };
}

// ─── Finding → Review Comment ───────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "ℹ️",
};

export function findingToCommentBody(finding: Finding, fpRate?: number): string {
  const emoji = SEVERITY_EMOJI[finding.severity] || "⚠️";
  const conf = finding.confidence ?? 0.5;
  const reliabilityTag =
    fpRate !== undefined
      ? fpRate <= 0.1
        ? " · 🎯 99%+ reliable"
        : fpRate <= 0.2
          ? ` · 🎯 ${Math.round((1 - fpRate) * 100)}% reliable`
          : fpRate <= 0.3
            ? ` · ⚠️ ${Math.round((1 - fpRate) * 100)}% reliable`
            : ""
      : conf >= 0.9
        ? " · 🎯 high confidence"
        : "";
  const lines = [
    `${emoji} **${finding.severity.toUpperCase()}** — ${finding.title} (\`${finding.ruleId}\`)${reliabilityTag}`,
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
  /** Optional LLM deep review summary (non-inline). */
  llmSummary?: string;
  llmWarnings?: string[];
}

function reviewPrFiles(
  files: PrFile[],
  minSeverity: Severity,
  maxComments: number,
  options?: EvaluationOptions,
  fpRates?: Map<string, number>,
  fpThreshold?: number,
  crossFile?: boolean,
  minConfidence?: number,
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

    const verdict = evaluateDiffImpl(hunk.newContent, lang, hunk.changedLines, undefined, fileOpts);

    for (const finding of verdict.findings) {
      // Suppress findings from rules with high FP rates
      if (fpRates && fpThreshold !== undefined) {
        const rate = fpRates.get(finding.ruleId);
        if (rate !== undefined && rate > fpThreshold) {
          fpSuppressed++;
          continue;
        }
      }

      // Suppress findings below minimum confidence threshold
      if (minConfidence !== undefined && minConfidence > 0) {
        const conf = finding.confidence ?? 0.5;
        if (conf < minConfidence) {
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
        body: findingToCommentBody(finding, fpRates?.get(finding.ruleId)),
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
            body: findingToCommentBody(finding, fpRates?.get(finding.ruleId)),
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

function _buildReviewSummary(result: ReviewResult): string {
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

// ─── Rich PR Narrative ──────────────────────────────────────────────────────

/** Parsed metadata extracted from a review comment body. */
interface CommentMeta {
  severity: string;
  title: string;
  ruleId: string;
  path: string;
  line: number;
}

function parseCommentMeta(comment: ReviewComment): CommentMeta | undefined {
  // Body format: `🔴 **CRITICAL** — Title here (\`RULE-001\`)`
  const match = comment.body.match(/\*\*(\w+)\*\*\s{0,5}\u2014([^(`]{1,500})\(`([^`]+)`\)/);
  if (!match) return undefined;
  return {
    severity: match[1].toLowerCase(),
    title: match[2].trim(),
    ruleId: match[3],
    path: comment.path,
    line: comment.line,
  };
}

const DOMAIN_LABELS: Record<string, string> = {
  SEC: "Security",
  PERF: "Performance",
  LOG: "Logging & Observability",
  ERR: "Error Handling",
  INJ: "Injection",
  FW: "Framework Misuse",
  HALLU: "AI Hallucination",
  AGENT: "AI Agent Safety",
  AICS: "AI Code Safety",
  SWDEV: "Software Engineering",
  SOV: "Sovereignty",
  I18N: "Internationalization",
  COMP: "Compliance",
  SCALE: "Scalability",
  PRIV: "Privacy",
  LEAK: "Data Leakage",
  AUTH: "Authentication",
};

function domainFromRuleId(ruleId: string): string {
  const prefix = ruleId.split("-")[0];
  return DOMAIN_LABELS[prefix] ?? prefix;
}

/**
 * Build a rich PR-level review narrative with executive summary, per-file
 * breakdown, cross-cutting themes, and prioritized action items.
 */
export function buildPRReviewNarrative(result: ReviewResult): string {
  const metas = result.comments.map(parseCommentMeta).filter((m): m is CommentMeta => m !== undefined);
  const lines: string[] = [];

  // ── Executive summary ─────────────────────────────────────────────
  const emoji = result.approved ? "✅" : "❌";
  lines.push(`## ${emoji} Judges Panel Review`);
  lines.push("");

  if (result.totalFindings === 0) {
    lines.push(
      `Analyzed **${result.filesAnalyzed}** file(s) with no findings. The changes look clean — no security, performance, or quality issues detected.`,
    );
    lines.push("", "---", "*Powered by [Judges Panel](https://github.com/KevinRabun/judges)*");
    return lines.join("\n");
  }

  const sevParts: string[] = [];
  if (result.criticalCount > 0) sevParts.push(`**${result.criticalCount}** critical`);
  if (result.highCount > 0) sevParts.push(`**${result.highCount}** high`);
  if (result.mediumCount > 0) sevParts.push(`**${result.mediumCount}** medium`);
  if (result.lowCount > 0) sevParts.push(`**${result.lowCount}** low`);

  lines.push(
    `Analyzed **${result.filesAnalyzed}** file(s) and found **${result.totalFindings}** issue(s): ${sevParts.join(", ")}.`,
  );
  lines.push("");

  if (!result.approved) {
    lines.push("> **⚠️ Action required:** Critical or high severity findings must be addressed before merging.");
    lines.push("");
  }

  // ── Per-file breakdown ────────────────────────────────────────────
  const byFile = new Map<string, CommentMeta[]>();
  for (const m of metas) {
    const arr = byFile.get(m.path) ?? [];
    arr.push(m);
    byFile.set(m.path, arr);
  }

  if (byFile.size > 0) {
    lines.push("### Files with findings");
    lines.push("");
    const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [path, fileMetas] of sorted) {
      const sevOrder = ["critical", "high", "medium", "low", "info"];
      const worstSev = fileMetas.reduce((w, m) => {
        return sevOrder.indexOf(m.severity) < sevOrder.indexOf(w) ? m.severity : w;
      }, "info");
      const worstEmoji = SEVERITY_EMOJI[worstSev] ?? "⚠️";
      const uniqueTitles = [...new Set(fileMetas.map((m) => m.title))];
      const summary =
        uniqueTitles.length <= 3
          ? uniqueTitles.join(", ")
          : `${uniqueTitles.slice(0, 2).join(", ")} + ${uniqueTitles.length - 2} more`;
      lines.push(`- ${worstEmoji} **\`${path}\`** (${fileMetas.length}): ${summary}`);
    }
    lines.push("");
  }

  // ── Layer 2 (optional) ───────────────────────────────────────────
  if (result.llmSummary) {
    lines.push("### 🤖 Layer 2 — AI Deep Review (LLM)");
    lines.push("");
    lines.push(result.llmSummary);
    lines.push("");
  }
  if (result.llmWarnings?.length) {
    lines.push("> ⚠️ LLM warnings: " + result.llmWarnings.join("; "));
    lines.push("");
  }

  // ── Cross-cutting themes ──────────────────────────────────────────
  const byDomain = new Map<string, CommentMeta[]>();
  for (const m of metas) {
    const domain = domainFromRuleId(m.ruleId);
    const arr = byDomain.get(domain) ?? [];
    arr.push(m);
    byDomain.set(domain, arr);
  }

  if (byDomain.size > 1) {
    lines.push("### Themes across files");
    lines.push("");
    const sortedDomains = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [domain, domainMetas] of sortedDomains) {
      const fileCount = new Set(domainMetas.map((m) => m.path)).size;
      const fileWord = fileCount === 1 ? "file" : "files";
      lines.push(`- **${domain}** — ${domainMetas.length} finding(s) across ${fileCount} ${fileWord}`);
    }
    lines.push("");
  }

  // ── Prioritized action items ──────────────────────────────────────
  const criticals = metas.filter((m) => m.severity === "critical");
  const highs = metas.filter((m) => m.severity === "high");
  if (criticals.length > 0 || highs.length > 0) {
    lines.push("### Priority fixes");
    lines.push("");
    let idx = 1;
    for (const m of criticals) {
      lines.push(`${idx}. 🔴 **${m.title}** in \`${m.path}\` (line ${m.line})`);
      idx++;
    }
    for (const m of highs) {
      lines.push(`${idx}. 🟠 **${m.title}** in \`${m.path}\` (line ${m.line})`);
      idx++;
    }
    lines.push("");
  }

  // ── Footer ────────────────────────────────────────────────────────
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

  lines.push("---", "*Powered by [Judges Panel](https://github.com/KevinRabun/judges)*");
  return lines.join("\n");
}

// ─── Review Completeness Signal ─────────────────────────────────────────────

export interface ReviewCompleteness {
  /** Overall status: complete, partial, or insufficient */
  status: "complete" | "partial" | "insufficient";
  /** Fraction of PR files that were analyzable (0–1) */
  fileCoverage: number;
  /** Number of files analyzed vs total files in PR */
  filesAnalyzed: number;
  totalFiles: number;
  /** Number of files skipped (binary, removed, unsupported language) */
  filesSkipped: number;
  /** Whether cross-file analysis was performed */
  crossFileAnalyzed: boolean;
  /** Whether FP calibration was applied */
  calibrated: boolean;
  /** Summary reason when status is not "complete" */
  reason?: string;
}

/**
 * Assess whether a PR review is complete enough to serve as the sole
 * code review gate. Returns a structured signal that CI/CD or humans
 * can use to decide whether additional review is needed.
 */
export function assessReviewCompleteness(
  prFiles: Array<{ filename: string; status: string; patch?: string }>,
  result: ReviewResult,
  options?: { crossFile?: boolean; calibrated?: boolean },
): ReviewCompleteness {
  const totalFiles = prFiles.length;
  const codeFiles = prFiles.filter((f) => f.status !== "removed" && f.patch && detectLanguage(f.filename)).length;
  const fileCoverage = totalFiles > 0 ? result.filesAnalyzed / totalFiles : 1;
  const filesSkipped = totalFiles - result.filesAnalyzed;

  const crossFileAnalyzed = options?.crossFile ?? false;
  const calibrated = options?.calibrated ?? false;

  // Determine status
  let status: ReviewCompleteness["status"];
  let reason: string | undefined;

  if (codeFiles === 0) {
    // No analyzable code files (all binary, config, docs, etc.)
    status = "complete";
    reason = "No analyzable code files in this PR.";
  } else if (result.filesAnalyzed === 0) {
    status = "insufficient";
    reason = "No code files could be analyzed — all files were skipped or had empty patches.";
  } else if (fileCoverage >= 0.9) {
    status = "complete";
  } else if (fileCoverage >= 0.5) {
    status = "partial";
    reason = `Only ${result.filesAnalyzed} of ${totalFiles} files were analyzed (${(fileCoverage * 100).toFixed(0)}% coverage).`;
  } else {
    status = "insufficient";
    reason = `Low coverage: only ${result.filesAnalyzed} of ${totalFiles} files analyzed (${(fileCoverage * 100).toFixed(0)}%).`;
  }

  return {
    status,
    fileCoverage,
    filesAnalyzed: result.filesAnalyzed,
    totalFiles,
    filesSkipped,
    crossFileAnalyzed,
    calibrated,
    reason,
  };
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
    minConfidence: 0.6,
    calibrate: true,
    crossFile: false,
    llmDeepReview: false,
    autopilot: false,
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
      case "--min-confidence":
        args.minConfidence = parseFloat(argv[++i]);
        break;
      case "--calibrate":
        args.calibrate = true;
        break;
      case "--no-calibrate":
        args.calibrate = false;
        break;
      case "--cross-file":
        args.crossFile = true;
        break;
      case "--judges":
        args.judges = argv[++i]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--llm-deep-review":
        args.llmDeepReview = true;
        break;
      case "--llm-model":
        args.llmModel = argv[++i];
        break;
      case "--llm-base-url":
        args.llmBaseUrl = argv[++i];
        break;
      case "--llm-max-tokens":
        args.llmMaxTokens = parseInt(argv[++i], 10);
        break;
      case "--autopilot":
      case "--gh-autopilot":
        args.autopilot = true;
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

export async function runReview(argv: string[]): Promise<void> {
  const args = parseReviewArgs(argv);

  // In JSON mode, redirect informational output to stderr so stdout is pure JSON
  const _stdoutLog = console.log.bind(console);
  if (args.format === "json") {
    console.log = (...a: unknown[]) => console.error(...a);
  }

  if (args.autopilot) {
    // Autopilot implies live mode
    args.dryRun = false;
  }

  if (args.pr === 0) {
    console.log(`
Judges Panel — Pull Request Review

USAGE:
  judges review --pr <number>                Review a pull request
  judges review --pr <number> --dry-run      Preview without posting
  judges review --pr 42 --approve            Auto-approve if no critical/high
  judges review --pr 42 --repo owner/repo    Review PR in specific repo
  judges review --pr 42 --no-calibrate        Disable FP-rate calibration (on by default)
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
  --min-confidence <0-1>  Minimum finding confidence to include (default: 0.6)
  --no-calibrate          Disable feedback-driven confidence calibration (enabled by default)
  --cross-file            Enable cross-file architectural analysis (detects duplication, taint flows)
  --judges <id,id,...>    Only run these judges (comma-separated IDs, e.g. cybersecurity,authentication)
  --autopilot             Enable PR autopilot (fetch diff, post inline + summary). Implies live mode.

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

  // ── Judge subset selection: convert include-list → disabledJudges ───
  if (args.judges && args.judges.length > 0) {
    const includeSet = new Set(args.judges);
    const allIds = JUDGES.map((j) => j.id);
    const disabledBySelection = allIds.filter((id) => !includeSet.has(id));
    if (!evalOptions.config) evalOptions.config = {};
    evalOptions.config.disabledJudges = [...(evalOptions.config.disabledJudges ?? []), ...disabledBySelection];
    console.log(`  Judges     : ${args.judges.join(", ")} (${disabledBySelection.length} disabled)`);
  }

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
    args.minConfidence,
  );

  // Deduplicate inline comments to avoid spam on reruns
  result.comments = dedupeComments(result.comments);

  // Optional Layer 2 (LLM) augmentation
  if (args.llmDeepReview) {
    const { summary, warnings } = await runLlmDeepReview(prFiles, args);
    if (summary) result.llmSummary = summary;
    if (warnings?.length) result.llmWarnings = warnings;
  }

  if (args.format === "json") {
    // Post review to GitHub before outputting JSON
    if (!args.dryRun && (result.comments.length > 0 || args.approve)) {
      const filteredComments = filterAlreadyPostedComments(repo, args.pr, args.token, result.comments);
      const reviewEvent = result.approved && args.approve ? "APPROVE" : result.approved ? "COMMENT" : "REQUEST_CHANGES";
      const reviewBody = {
        body: buildPRReviewNarrative(result),
        event: reviewEvent,
        comments: filteredComments,
      };
      const reviewResp = apiRequest("POST", `/repos/${repo}/pulls/${args.pr}/reviews`, args.token, reviewBody);
      if (reviewResp.status !== 200 && reviewResp.status !== 422) {
        // Fallback: post summary as a plain comment
        apiRequest("POST", `/repos/${repo}/issues/${args.pr}/comments`, args.token, {
          body: buildPRReviewNarrative(result),
        });
      }
    }
    _stdoutLog(JSON.stringify(result, null, 2));
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

    const filteredComments = filterAlreadyPostedComments(repo, args.pr, args.token, result.comments);

    const reviewBody = {
      body: buildPRReviewNarrative(result),
      event: reviewEvent,
      comments: filteredComments,
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
        body: buildPRReviewNarrative(result),
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

/**
 * Programmatic autopilot entrypoint for GitHub App / automations.
 */
export function runReviewAutopilot(pr: number, repo?: string): Promise<void> {
  const argv = ["node", "judges", "review", "--pr", String(pr), "--autopilot"];
  if (repo) argv.push("--repo", repo);
  return runReview(argv);
}

// Test exports (non-public API)
export const __test = {
  __setCallOpenAiChatImplForTest,
  __setApiRequestImplForTest,
  __setEvaluateDiffImplForTest,
  runLlmDeepReview,
  // expose for patching in tests
  __evaluateDiffForTest: evaluateDiff,
};
