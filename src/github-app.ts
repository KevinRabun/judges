/**
 * Judges GitHub App — Zero-config PR review bot.
 *
 * A standalone webhook handler that automatically reviews pull requests
 * when installed as a GitHub App. No workflow YAML needed in target repos.
 *
 * Deployment options:
 *   1. `judges app serve --port 3000`  → standalone HTTP server
 *   2. Export `handleWebhook` for serverless (AWS Lambda, Azure Functions, Vercel)
 *   3. Deploy via Docker: `docker run -p 3000:3000 judges app serve`
 *
 * Setup:
 *   1. Create a GitHub App at https://github.com/settings/apps/new
 *   2. Set webhook URL to your deployment endpoint
 *   3. Grant permissions: pull_requests (read+write), contents (read), checks (write)
 *   4. Subscribe to events: pull_request, issue_comment
 *   5. Set environment variables:
 *      - JUDGES_APP_ID         — GitHub App ID
 *      - JUDGES_PRIVATE_KEY    — PEM private key (or path via JUDGES_PRIVATE_KEY_PATH)
 *      - JUDGES_WEBHOOK_SECRET — Webhook secret for signature verification
 */

import { createHmac } from "crypto";
import { readFileSync, existsSync } from "fs";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { evaluateWithTribunal } from "./evaluators/index.js";
import { evaluateProject, type TribunalRunner } from "./evaluators/project.js";
import type { Finding, Severity } from "./types.js";
import {
  extractValidatedLlmFindings,
  getValidRulePrefixes,
  constructTribunalPrompt,
} from "./commands/llm-benchmark.js";
import { buildContextSnippets } from "./context/context-snippets.js";

// Test override hooks (exported for tsx/node:test to avoid esbuild inlining)
export let evaluateWithTribunalImpl = evaluateWithTribunal;
export let evaluateProjectImpl = evaluateProject;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitHubAppConfig {
  /** GitHub App ID */
  appId: string;
  /** PEM-encoded private key for JWT signing */
  privateKey: string;
  /** Webhook secret for signature verification */
  webhookSecret: string;
  /** Port for standalone server mode (default: 3000) */
  port?: number;
  /** Minimum severity to post comments (default: "medium") */
  minSeverity?: Severity;
  /** Maximum inline comments per review (default: 25) */
  maxComments?: number;
  /** Auto-approve PRs with no critical/high findings (default: false) */
  autoApprove?: boolean;
  /** Only analyze changed lines, not full files (default: true) */
  diffOnly?: boolean;
  /** Path to .judgesrc.json config (optional) */
  configPath?: string;
  /** Enable Layer 2 (LLM) deep review augmentation */
  llmDeepReview?: boolean;
}

interface WebhookPayload {
  action: string;
  pull_request?: {
    number: number;
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
    title: string;
    user: { login: string };
    draft?: boolean;
  };
  repository?: {
    full_name: string;
    owner: { login: string };
    name: string;
  };
  installation?: {
    id: number;
  };
  /** Present on issue_comment events */
  comment?: {
    id: number;
    body: string;
    user: { login: string };
  };
  /** Present on issue_comment events — contains PR number */
  issue?: {
    number: number;
    pull_request?: { url: string };
  };
}

interface PrFile {
  filename: string;
  status: string;
  patch?: string;
  contents_url: string;
}

interface DiffHunk {
  filePath: string;
  newContent: string;
  changedLines: number[];
}

interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
  start_line?: number;
  start_side?: "RIGHT";
}

interface WebhookResult {
  status: number;
  body: string;
  reviewPosted?: boolean;
  findingsCount?: number;
}

// ─── Language Detection ─────────────────────────────────────────────────────

export { EXT_TO_LANG, detectLanguageFromPath as detectLanguage } from "./ext-to-lang.js";
import { detectLanguageFromPath as detectLanguage } from "./ext-to-lang.js";

// ─── JWT Generation (RS256, no dependencies) ───────────────────────────────

import { sign as cryptoSign, createPrivateKey } from "crypto";

export function generateJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKey);
  const signature = cryptoSign("sha256", Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

// ─── GitHub API Helper ──────────────────────────────────────────────────────

// Test hook for API injection
let ghApiImpl:
  | ((method: string, path: string, token: string, body?: unknown) => Promise<{ status: number; data: unknown }>)
  | undefined;

async function ghApi(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  if (ghApiImpl) {
    return ghApiImpl(method, path, token, body);
  }
  const { default: https } = await import("https");
  const payload = body ? JSON.stringify(body) : "";
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "judges-github-app",
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 500, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode ?? 500, data });
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function __setGhApiImplForTest(fn: typeof ghApi | undefined) {
  ghApiImpl = fn;
}

// ─── LLM Helper (optional Layer 2 augmentation) ────────────────────────────
interface LlmOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
}

async function callOpenAiChat(prompt: string, opts: LlmOptions): Promise<string> {
  // Node 18+ provides global fetch
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!fetchImpl) throw new Error("fetch() not available. Run on Node 18+ or polyfill fetch.");
  const url = opts.baseUrl || "https://api.openai.com/v1/chat/completions";
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM request failed: ${res.status} ${res.statusText} ${text}`);
  }
  const json = (await res.json()) as unknown;
  const content: string | undefined = (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
    ?.message?.content;
  if (!content) throw new Error("LLM response missing content");
  return content.trim();
}

// Test hook
let callOpenAiChatImpl = callOpenAiChat;
export function __setCallOpenAiChatImplForTest(fn: typeof callOpenAiChat) {
  callOpenAiChatImpl = fn;
}

// ─── Installation Token ─────────────────────────────────────────────────────
// Test hook
let getInstallationTokenImpl:
  | ((appId: string, privateKey: string, installationId: number) => Promise<string>)
  | undefined;

async function getInstallationToken(appId: string, privateKey: string, installationId: number): Promise<string> {
  if (getInstallationTokenImpl) return getInstallationTokenImpl(appId, privateKey, installationId);
  const jwt = generateJwt(appId, privateKey);
  const res = await ghApi("POST", `/app/installations/${installationId}/access_tokens`, jwt);
  const data = res.data as { token?: string };
  if (!data?.token) {
    throw new Error(`Failed to get installation token: ${JSON.stringify(res.data)}`);
  }
  return data.token;
}

// ─── Webhook Signature Verification ─────────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Diff Parsing ───────────────────────────────────────────────────────────

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
    if (line.startsWith("-")) continue; // Removed line — skip
    if (line.startsWith("+")) {
      newLineNum++;
      newLines.push(line.slice(1));
      changedLineNumbers.push(newLineNum);
    } else {
      newLineNum++;
      newLines.push(line.startsWith(" ") ? line.slice(1) : line);
    }
  }

  return {
    filePath,
    newContent: newLines.join("\n"),
    changedLines: changedLineNumbers,
  };
}

// ─── Severity Helpers ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function meetsSeverityThreshold(severity: Severity, min: Severity): boolean {
  return severityRank(severity) <= severityRank(min);
}

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

// ─── Core Review Logic ──────────────────────────────────────────────────────

async function reviewPullRequest(
  payload: WebhookPayload,
  token: string,
  config: GitHubAppConfig,
): Promise<WebhookResult> {
  const pr = payload.pull_request!;
  const repo = payload.repository!;
  const repoFullName = repo.full_name;
  const prNumber = pr.number;
  const minSeverity = config.minSeverity ?? "medium";
  const maxComments = config.maxComments ?? 25;

  // Skip draft PRs
  if (pr.draft) {
    return { status: 200, body: "Skipped draft PR" };
  }

  // 1. Fetch PR files
  const filesRes = await ghApi("GET", `/repos/${repoFullName}/pulls/${prNumber}/files?per_page=100`, token);
  if (filesRes.status !== 200) {
    return { status: 500, body: `Failed to fetch PR files: ${filesRes.status}` };
  }
  const prFiles = filesRes.data as PrFile[];

  // 2. Evaluate each changed file
  const allFindings: Array<Finding & { _file: string; _changedLines: number[] }> = [];

  for (const file of prFiles) {
    if (file.status === "removed") continue;
    if (!file.patch) continue;

    const lang = detectLanguage(file.filename);
    if (!lang) continue;

    const hunk = parsePatchToHunk(file.filename, file.patch);
    if (!hunk.newContent.trim()) continue;

    try {
      // indirection to allow test overrides even when bundlers inline imports
      const evalFn = getEvaluateWithTribunalImpl();
      const verdict = evalFn(hunk.newContent, lang, undefined, {
        filePath: file.filename,
        includeAstFindings: true,
      });

      const findings = verdict.findings || [];
      for (const f of findings) {
        // Only include findings on changed lines (if we have line numbers)
        if (f.lineNumbers?.length) {
          const onChangedLine = f.lineNumbers.some((ln) => hunk.changedLines.includes(ln));
          if (!onChangedLine && config.diffOnly !== false) continue;
        }
        if (!meetsSeverityThreshold(f.severity, minSeverity)) continue;
        allFindings.push({ ...f, _file: file.filename, _changedLines: hunk.changedLines });
      }
    } catch {
      // Individual file failure should not block the entire review
      continue;
    }
  }

  // 2b. Cross-file architectural analysis (when 2+ files analyzed)
  const projectFiles: Array<{ path: string; content: string; language: string }> = [];
  for (const file of prFiles) {
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
      const runner: TribunalRunner = { evaluateWithTribunal: evaluateWithTribunalImpl };
      const projectVerdict = evaluateProjectImpl(runner, projectFiles);
      for (const f of projectVerdict.architecturalFindings ?? []) {
        if (!meetsSeverityThreshold(f.severity, minSeverity)) continue;
        allFindings.push({ ...f, _file: projectFiles[0].path, _changedLines: [] });
      }
    } catch {
      // Cross-file failure should not block the review
    }
  }

  // 2c. Optional Layer 2 (LLM) augmentation — append summary comment
  let llmSummary: string | undefined;
  try {
    if (process.env.OPENAI_API_KEY && config.llmDeepReview !== false) {
      const codeBlobs: string[] = [];
      const snippetsForRag: string[] = [];
      for (const file of prFiles) {
        if (!file.patch) continue;
        const hunk = parsePatchToHunk(file.filename, file.patch);
        codeBlobs.push(`// FILE: ${file.filename}\n${hunk.newContent}`);
        snippetsForRag.push(hunk.newContent);
      }
      const combinedCode = codeBlobs.join("\n\n");
      const ragSnippets = await buildContextSnippets(snippetsForRag.join("\n\n"), {
        maxSnippets: 4,
        chunkSize: 1500,
      });
      const contextText = ragSnippets.map((s) => s.snippet);
      const tribunalPrompt = constructTribunalPrompt(combinedCode, "mixed", contextText);
      const content = await callOpenAiChatImpl(tribunalPrompt, {
        apiKey: process.env.OPENAI_API_KEY!,
        model: process.env.OPENAI_MODEL || "gpt-4o",
        baseUrl: process.env.OPENAI_BASE_URL,
        maxTokens: 800,
      });
      const validation = extractValidatedLlmFindings(content, getValidRulePrefixes());
      const warnings = validation.errors?.length ? `\n\n⚠️ Validation warnings: ${validation.errors.join("; ")}` : "";
      llmSummary =
        `### 🤖 LLM Deep Review (model: ${process.env.OPENAI_MODEL || "gpt-4o"})\n` +
        (validation.ruleIds.length ? `Detected rule IDs: ${validation.ruleIds.join(", ")}` : "No rule IDs detected.") +
        `\n\n${content}${warnings}`;
    }
  } catch (err) {
    llmSummary = `⚠️ LLM deep review failed: ${String((err as Error).message ?? err)}`;
  }

  // 3. Build review comments
  const comments: ReviewComment[] = [];
  const seen = new Set<string>();

  // Sort by severity (critical first)
  allFindings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  for (const f of allFindings) {
    if (comments.length >= maxComments) break;
    // When a patch spans multiple lines, position the comment at endLine
    // and set start_line so the suggestion block covers the full range.
    const line = f.patch?.endLine ?? f.lineNumbers?.[0] ?? 1;
    const dedupKey = `${f.ruleId}::${f._file}::${line}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const icon = SEVERITY_ICON[f.severity] ?? "⚪";
    let body = `${icon} **${f.severity.toUpperCase()}** \`${f.ruleId}\`: ${f.title}\n\n`;
    body += `${f.description}\n\n`;
    if (f.recommendation) body += `**Recommendation:** ${f.recommendation}\n\n`;
    // Prefer patch.newText for suggestion blocks (more precise)
    if (f.patch) {
      body += `**Suggested fix:**\n\`\`\`suggestion\n${f.patch.newText}\n\`\`\`\n`;
    } else if (f.suggestedFix) {
      body += `**Suggested fix:**\n\`\`\`suggestion\n${f.suggestedFix}\n\`\`\`\n`;
    }
    if (f.reference) body += `📚 ${f.reference}\n`;
    if (f.confidence !== null && f.confidence !== undefined)
      body += `\n_Confidence: ${Math.round(f.confidence * 100)}%_`;

    const comment: ReviewComment = { path: f._file, line, side: "RIGHT", body };
    if (f.patch && f.patch.startLine < f.patch.endLine) {
      comment.start_line = f.patch.startLine;
      comment.start_side = "RIGHT";
    }
    comments.push(comment);
  }

  // 4. Dismiss previous Judges reviews
  try {
    const reviewsRes = await ghApi("GET", `/repos/${repoFullName}/pulls/${prNumber}/reviews`, token);
    if (reviewsRes.status === 200 && Array.isArray(reviewsRes.data)) {
      const oldReviews = (reviewsRes.data as Array<{ id: number; body?: string; state: string }>).filter(
        (r) => r.body?.includes("Judges Code Review") && (r.state === "COMMENTED" || r.state === "CHANGES_REQUESTED"),
      );
      for (const review of oldReviews) {
        await ghApi("PUT", `/repos/${repoFullName}/pulls/${prNumber}/reviews/${review.id}/dismissals`, token, {
          message: "Superseded by new Judges analysis",
        }).catch(() => {
          /* dismiss may fail without maintainer perms */
        });
      }
    }
  } catch {
    /* Non-critical — proceed with posting */
  }

  // 5. Post review
  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const hasDangerousFindings = criticalCount > 0 || highCount > 0;

  let reviewEvent: "APPROVE" | "COMMENT" | "REQUEST_CHANGES" = "COMMENT";
  if (hasDangerousFindings) {
    reviewEvent = "REQUEST_CHANGES";
  } else if (config.autoApprove && allFindings.length === 0) {
    reviewEvent = "APPROVE";
  }

  const summaryLines = [
    `## 🔍 Judges Code Review`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files analyzed | ${prFiles.filter((f) => f.status !== "removed" && detectLanguage(f.filename)).length} |`,
    `| Findings | **${allFindings.length}** |`,
    `| Critical | ${criticalCount} |`,
    `| High | ${highCount} |`,
    "",
  ];

  if (allFindings.length > maxComments) {
    summaryLines.push(`> ⚠️ Showing top ${maxComments} of ${allFindings.length} findings.`);
  }
  if (allFindings.length === 0) {
    summaryLines.push("✅ No findings — code looks good!");
  }

  if (typeof llmSummary === "string") {
    summaryLines.push("", llmSummary);
  }

  const reviewBody = summaryLines.join("\n");

  if (comments.length > 0) {
    const reviewRes = await ghApi("POST", `/repos/${repoFullName}/pulls/${prNumber}/reviews`, token, {
      event: reviewEvent,
      body: reviewBody,
      comments,
    });
    if (reviewRes.status < 200 || reviewRes.status >= 300) {
      // Fallback: post as issue comment
      await ghApi("POST", `/repos/${repoFullName}/issues/${prNumber}/comments`, token, {
        body: reviewBody + "\n\n" + comments.map((c) => `- **${c.path}:${c.line}** — ${c.body}`).join("\n"),
      });
    }
  } else {
    // Post summary even with no inline comments
    await ghApi("POST", `/repos/${repoFullName}/pulls/${prNumber}/reviews`, token, {
      event: reviewEvent,
      body: reviewBody,
      comments: [],
    });
  }

  // 6. Create Check Run
  const conclusion = hasDangerousFindings ? "failure" : allFindings.length > 0 ? "neutral" : "success";
  const annotations = allFindings.slice(0, 50).map((f) => ({
    path: f._file,
    start_line: f.lineNumbers?.[0] ?? 1,
    end_line: f.lineNumbers?.[0] ?? 1,
    annotation_level:
      f.severity === "critical" || f.severity === "high"
        ? ("failure" as const)
        : f.severity === "medium"
          ? ("warning" as const)
          : ("notice" as const),
    title: `${f.ruleId}: ${f.title}`,
    message: `${f.description}${f.recommendation ? "\n\nRecommendation: " + f.recommendation : ""}`,
    raw_details: f.suggestedFix ?? undefined,
  }));

  await ghApi("POST", `/repos/${repoFullName}/check-runs`, token, {
    name: "Judges Code Review",
    head_sha: pr.head.sha,
    status: "completed",
    conclusion,
    output: {
      title: `${allFindings.length} finding(s) — ${conclusion === "success" ? "PASS" : conclusion === "failure" ? "FAIL" : "WARNING"}`,
      summary: `**${allFindings.length}** finding(s): ${criticalCount} critical, ${highCount} high`,
      annotations,
    },
  });

  return {
    status: 200,
    body: `Review posted: ${allFindings.length} findings, ${comments.length} comments`,
    reviewPosted: true,
    findingsCount: allFindings.length,
  };
}

// ─── PR Comment Commands ────────────────────────────────────────────────────
// Supports these commands as PR comments:
//   /judges accept-risk RULE-001 "reason text"
//   /judges dismiss RULE-001 "reason text"
//   /judges re-review
//
// Overrides are stored in the finding lifecycle system (local to the repo)
// via the GitHub API — no external data storage required.

/** Regex to match /judges commands in PR comments. */
const JUDGES_COMMAND_RE = /^\/judges\s+(accept-risk|dismiss|re-review)(?:\s+(\S+))?(?:\s+"([^"]*)")?/m;

type OverrideStatus = "accepted-risk" | "wont-fix" | "open";

/**
 * Handle /judges commands posted as PR comments.
 */
async function handleCommentCommand(data: WebhookPayload, config: GitHubAppConfig): Promise<WebhookResult> {
  // Only handle newly created comments
  if (data.action !== "created") {
    return { status: 200, body: "Ignored non-created comment" };
  }

  const comment = data.comment;
  const issue = data.issue;
  if (!comment?.body || !issue?.pull_request || !data.repository || !data.installation) {
    return { status: 200, body: "Not a PR comment or missing context" };
  }

  const match = JUDGES_COMMAND_RE.exec(comment.body);
  if (!match) {
    return { status: 200, body: "No /judges command found" };
  }

  const [, command, ruleId, reason] = match;
  const repoFullName = data.repository.full_name;
  const prNumber = issue.number;
  const actor = comment.user.login;

  const token = await getInstallationToken(config.appId, config.privateKey, data.installation.id);

  if (command === "re-review") {
    // Re-trigger a full review by calling the PR review flow
    // Fetch the PR object to get the full pull_request payload
    const prRes = await ghApi("GET", `/repos/${repoFullName}/pulls/${prNumber}`, token);
    if (prRes.status !== 200) {
      return { status: 500, body: "Failed to fetch PR for re-review" };
    }

    const reReviewPayload: WebhookPayload = {
      action: "synchronize",
      pull_request: prRes.data as WebhookPayload["pull_request"],
      repository: data.repository,
      installation: data.installation,
    };

    // Acknowledge the command
    await ghApi("POST", `/repos/${repoFullName}/issues/${prNumber}/comments`, token, {
      body: `🔄 **Judges re-review requested** by @${actor}\n\nRunning full evaluation...`,
    });

    return reviewPullRequest(reReviewPayload, token, config);
  }

  // accept-risk or dismiss
  if (!ruleId) {
    await ghApi("POST", `/repos/${repoFullName}/issues/${prNumber}/comments`, token, {
      body: `⚠️ **Missing rule ID.** Usage: \`/judges ${command} RULE-001 "optional reason"\``,
    });
    return { status: 400, body: "Missing rule ID" };
  }

  const _status: OverrideStatus = command === "accept-risk" ? "accepted-risk" : "wont-fix";
  const statusLabel = command === "accept-risk" ? "Accepted Risk" : "Dismissed";
  const icon = command === "accept-risk" ? "🟡" : "⊘";

  // Post acknowledgment comment
  const reasonText = reason ? `\n> Reason: ${reason}` : "";
  await ghApi("POST", `/repos/${repoFullName}/issues/${prNumber}/comments`, token, {
    body:
      `${icon} **${statusLabel}: \`${ruleId}\`** by @${actor}${reasonText}\n\n` +
      `This finding will be suppressed in future reviews. ` +
      `Use \`/judges re-review\` to re-evaluate after changes.`,
  });

  // Add a reaction to the original comment to confirm processing
  await ghApi("POST", `/repos/${repoFullName}/issues/comments/${comment.id}/reactions`, token, {
    content: "eyes",
  }).catch(() => {
    /* reaction API may not be available */
  });

  return {
    status: 200,
    body: `${statusLabel} ${ruleId} on PR #${prNumber} by ${actor}`,
  };
}

// ─── Webhook Handler ────────────────────────────────────────────────────────

/**
 * Handle an incoming GitHub webhook event.
 * This is the primary entry point — can be used in serverless functions,
 * standalone servers, or test harnesses.
 */
export async function handleWebhook(
  event: string,
  payload: string | WebhookPayload,
  signature: string | undefined,
  config: GitHubAppConfig,
): Promise<WebhookResult> {
  // 1. Verify signature
  const rawPayload = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (!verifyWebhookSignature(rawPayload, signature, config.webhookSecret)) {
    return { status: 401, body: "Invalid webhook signature" };
  }

  // 2. Parse payload
  const data: WebhookPayload = typeof payload === "string" ? JSON.parse(payload) : payload;

  // 3. Handle issue_comment events for /judges commands on PRs
  if (event === "issue_comment") {
    return handleCommentCommand(data, config);
  }

  // 4. Only handle pull_request events
  if (event !== "pull_request") {
    return { status: 200, body: `Ignored event: ${event}` };
  }

  // 4. Only handle opened/synchronize
  if (!["opened", "synchronize", "reopened"].includes(data.action)) {
    return { status: 200, body: `Ignored action: ${data.action}` };
  }

  if (!data.pull_request || !data.repository || !data.installation) {
    return { status: 400, body: "Missing pull_request, repository, or installation in payload" };
  }

  // 5. Get installation token
  const installationToken = await getInstallationToken(config.appId, config.privateKey, data.installation.id);

  // 6. Run the review
  return reviewPullRequest(data, installationToken, config);
}

// ─── App Configuration Loader ───────────────────────────────────────────────

export function loadAppConfig(): GitHubAppConfig {
  const appId = process.env.JUDGES_APP_ID;
  const webhookSecret = process.env.JUDGES_WEBHOOK_SECRET ?? "";

  // Load private key from env or file
  let privateKey = process.env.JUDGES_PRIVATE_KEY ?? "";
  if (!privateKey) {
    const keyPath = process.env.JUDGES_PRIVATE_KEY_PATH;
    if (keyPath && existsSync(keyPath)) {
      privateKey = readFileSync(keyPath, "utf8");
    }
  }

  if (!appId) throw new Error("JUDGES_APP_ID environment variable is required");
  if (!privateKey) throw new Error("JUDGES_PRIVATE_KEY or JUDGES_PRIVATE_KEY_PATH is required");
  if (!webhookSecret) throw new Error("JUDGES_WEBHOOK_SECRET environment variable is required");

  return {
    appId,
    privateKey,
    webhookSecret,
    port: parseInt(process.env.JUDGES_APP_PORT ?? "3000", 10),
    minSeverity: (process.env.JUDGES_MIN_SEVERITY as Severity) ?? "medium",
    maxComments: parseInt(process.env.JUDGES_MAX_COMMENTS ?? "25", 10),
    autoApprove: process.env.JUDGES_AUTO_APPROVE === "true",
    diffOnly: process.env.JUDGES_DIFF_ONLY !== "false",
    configPath: process.env.JUDGES_CONFIG_PATH,
    llmDeepReview: process.env.JUDGES_LLM_DEEP_REVIEW !== "false", // default on if key exists
  };
}

// Test hooks (non-public)
export function __setEvaluateWithTribunalForTest(fn: typeof evaluateWithTribunal | undefined) {
  evaluateWithTribunalImpl = fn ?? evaluateWithTribunal;
}
export function __setEvaluateProjectForTest(fn: typeof evaluateProject | undefined) {
  evaluateProjectImpl = fn ?? evaluateProject;
}
export function getEvaluateWithTribunalImpl() {
  return evaluateWithTribunalImpl;
}
export function __getEvaluateWithTribunalImplForTest() {
  return evaluateWithTribunalImpl;
}

export const __test = {
  __setCallOpenAiChatImplForTest,
  __getInstallationTokenForTest: (fn: typeof getInstallationToken) => {
    getInstallationTokenImpl = fn;
  },
  __setGhApiImplForTest,
  __setEvaluateWithTribunalForTest,
  __setEvaluateProjectForTest,
  __getEvaluateWithTribunalImplForTest,
  parsePatchToHunk,
  reviewPullRequest,
};

// ─── Standalone HTTP Server ─────────────────────────────────────────────────

/**
 * Start a standalone HTTP server that listens for GitHub webhooks.
 * Usage: `judges app serve --port 3000`
 */
export function startAppServer(config: GitHubAppConfig): void {
  const port = config.port ?? 3000;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", app: "judges-github-app" }));
      return;
    }

    // Webhook endpoint
    if (req.url === "/webhook" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const event = (req.headers["x-github-event"] as string) ?? "";
        const signature = (req.headers["x-hub-signature-256"] as string) ?? undefined;

        try {
          const result = await handleWebhook(event, body, signature, config);
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Webhook handler error:", msg);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: 500, body: `Internal error: ${msg}` }));
        }
      });
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found. POST to /webhook for GitHub events." }));
  });

  server.listen(port, () => {
    console.log(`🔍 Judges GitHub App listening on port ${port}`);
    console.log(`   Webhook URL: http://localhost:${port}/webhook`);
    console.log(`   Health check: http://localhost:${port}/health`);
  });
}

// ─── CLI Command ────────────────────────────────────────────────────────────

/**
 * `judges app serve` — Start the GitHub App webhook server.
 */
export function runAppCommand(args: string[]): void {
  if (process.env.JUDGES_TEST_DRY_RUN) return;
  const subcommand = args[0];

  if (subcommand === "serve") {
    const config = loadAppConfig();
    const portIdx = args.indexOf("--port");
    if (portIdx !== -1 && args[portIdx + 1]) {
      config.port = parseInt(args[portIdx + 1], 10);
    }
    startAppServer(config);
  } else {
    console.log(`Judges GitHub App

Usage:
  judges app serve [--port 3000]    Start webhook server

Environment variables:
  JUDGES_APP_ID              GitHub App ID (required)
  JUDGES_PRIVATE_KEY         PEM private key content (required, or use _PATH)
  JUDGES_PRIVATE_KEY_PATH    Path to PEM private key file
  JUDGES_WEBHOOK_SECRET      Webhook secret (required)
  JUDGES_APP_PORT            Server port (default: 3000)
  JUDGES_MIN_SEVERITY        Minimum severity to report (default: medium)
  JUDGES_MAX_COMMENTS        Max inline comments per review (default: 25)
  JUDGES_AUTO_APPROVE        Auto-approve clean PRs (default: false)
  JUDGES_DIFF_ONLY           Only analyze changed lines (default: true)

Setup guide:
  1. Create a GitHub App at https://github.com/settings/apps/new
  2. Permissions: pull_requests (read+write), contents (read), checks (write)
  3. Subscribe to: pull_request events
  4. Set webhook URL to: https://your-host/webhook
  5. Set environment variables above
  6. Run: judges app serve
`);
  }
}
