// ─── LLM-Based False Positive Filter ─────────────────────────────────────────
// Post-processes static analysis findings through an LLM to identify and
// remove false positives. Gated on LLM availability — when no API key is
// configured the filter is a no-op and all findings pass through unchanged.
//
// Supports any OpenAI-compatible chat completion API (OpenAI, Azure OpenAI,
// Ollama, LM Studio, vLLM, etc.)
//
// Environment variables:
//   JUDGES_LLM_API_KEY     — API key (falls back to OPENAI_API_KEY)
//   JUDGES_LLM_BASE_URL    — API base URL (default: https://api.openai.com/v1)
//   JUDGES_LLM_MODEL       — Model name (default: gpt-4o-mini)
//   JUDGES_LLM_FP_FILTER   — Set to "false" or "0" to disable even when key exists
//   JUDGES_LLM_MAX_FINDINGS — Max findings to send for review (default: 50)
//   JUDGES_LLM_TIMEOUT_MS  — Request timeout in ms (default: 30000)
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding, TribunalVerdict, JudgeEvaluation, Verdict } from "./types.js";
import { calculateScore, deriveVerdict } from "./evaluators/shared.js";

// ─── Configuration ───────────────────────────────────────────────────────────

export interface LlmFpFilterConfig {
  /** API key for the LLM provider */
  apiKey: string;
  /** Base URL for the chat completions API (default: https://api.openai.com/v1) */
  baseUrl: string;
  /** Model identifier (default: gpt-4o-mini) */
  model: string;
  /** Maximum number of findings to send for review (default: 50) */
  maxFindings: number;
  /** Maximum source code length in characters to send (default: 15000) */
  maxCodeLength: number;
  /** HTTP request timeout in milliseconds (default: 30000) */
  timeoutMs: number;
}

export interface LlmFpFilterResult {
  /** Findings retained after FP removal */
  filteredFindings: Finding[];
  /** Findings removed as false positives, with LLM-provided reasons */
  removedFindings: Array<Finding & { fpReason: string }>;
  /** Whether the LLM was actually called */
  llmUsed: boolean;
  /** Model used for filtering, if any */
  model?: string;
  /** Number of findings sent for review */
  reviewedCount: number;
}

// ─── LLM Availability Detection ─────────────────────────────────────────────

/**
 * Detect LLM configuration from environment variables.
 * Returns null if no API key is available or the filter is disabled.
 */
export function detectLlmConfig(): LlmFpFilterConfig | null {
  const apiKey = process.env.JUDGES_LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Allow explicit disable via env var
  const filterFlag = process.env.JUDGES_LLM_FP_FILTER;
  if (filterFlag === "false" || filterFlag === "0") return null;

  return {
    apiKey,
    baseUrl: process.env.JUDGES_LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.JUDGES_LLM_MODEL || "gpt-4o-mini",
    maxFindings: safeParseInt(process.env.JUDGES_LLM_MAX_FINDINGS, 50),
    maxCodeLength: safeParseInt(process.env.JUDGES_LLM_MAX_CODE_LENGTH, 15000),
    timeoutMs: safeParseInt(process.env.JUDGES_LLM_TIMEOUT_MS, 30000),
  };
}

/**
 * Quick check: is an LLM available for FP filtering?
 */
export function isLlmAvailable(): boolean {
  return detectLlmConfig() !== null;
}

function safeParseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

interface FindingSummary {
  index: number;
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  lineNumbers?: number[];
  confidence?: number;
}

function buildFpReviewPrompt(findings: Finding[], code: string, language: string): string {
  const summaries: FindingSummary[] = findings.map((f, i) => ({
    index: i,
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    description: f.description,
    lineNumbers: f.lineNumbers,
    confidence: f.confidence,
  }));

  return `You are a code review expert specializing in false positive detection for static analysis tools.

Below is source code and a list of static analysis findings. Review each finding against the actual code and identify FALSE POSITIVES — findings that are incorrect, misleading, or do not represent real issues.

A finding is a FALSE POSITIVE if:
- The flagged pattern appears only in a string literal, comment, or documentation
- The code has adequate mitigation or handling nearby that the static analyzer missed
- The finding is based on a keyword match that doesn't apply in this context (e.g., "age" in cache TTL context flagged as age discrimination)
- The code is in a test file and the pattern is intentionally used for testing
- The variable/function name matches a keyword but has no actual security/quality implications
- The finding flags something that is standard practice for the framework being used
- The flagged code is dead code, unreachable, or in an exception handler that appropriately handles the concern

A finding is NOT a false positive if:
- There is a genuine security, quality, or compliance concern
- The code could be improved even if not currently exploitable
- The finding identifies a real missing best practice

SOURCE CODE (${language}):
\`\`\`${language}
${code}
\`\`\`

FINDINGS TO REVIEW:
${JSON.stringify(summaries, null, 2)}

Respond with ONLY a JSON object in this exact format:
{
  "false_positives": [
    {
      "index": 0,
      "reason": "Brief explanation of why this is a false positive"
    }
  ]
}

Rules:
- Only include findings you are CONFIDENT are false positives
- When in doubt, do NOT mark a finding as a false positive (err on the side of caution)
- The "index" field must match the 0-based index in the FINDINGS array above
- Keep reasons concise (1-2 sentences)
- If no findings are false positives, return {"false_positives": []}`;
}

// ─── LLM API Call ────────────────────────────────────────────────────────────

async function callLlm(config: LlmFpFilterConfig, prompt: string): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "You are a precise code review expert. Respond only with valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown error");
      throw new Error(`LLM API returned ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Response Parsing ────────────────────────────────────────────────────────

interface FpEntry {
  index: number;
  reason: string;
}

function parseFpResponse(responseText: string): Map<number, string> {
  const fpMap = new Map<number, string>();

  try {
    // Extract JSON from markdown code blocks if the LLM wrapped it
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : responseText.trim();

    const parsed = JSON.parse(jsonText) as { false_positives?: FpEntry[] };

    if (Array.isArray(parsed.false_positives)) {
      for (const fp of parsed.false_positives) {
        if (typeof fp.index === "number" && typeof fp.reason === "string") {
          fpMap.set(fp.index, fp.reason);
        }
      }
    }
  } catch {
    // If parsing fails, return empty map — no findings are removed
  }

  return fpMap;
}

// ─── Core Filter Function ────────────────────────────────────────────────────

/**
 * Filter false positives from findings using an LLM.
 *
 * If no LLM configuration is provided or detected, returns findings unchanged.
 * On any error (network, parsing, timeout), gracefully degrades and returns
 * all findings unmodified.
 *
 * @param findings - Static analysis findings to review
 * @param code     - The source code that was analyzed
 * @param language - Programming language of the code
 * @param config   - Explicit LLM config, or null/undefined to auto-detect from env
 */
export async function filterFalsePositivesWithLlm(
  findings: Finding[],
  code: string,
  language: string,
  config?: LlmFpFilterConfig | null,
): Promise<LlmFpFilterResult> {
  const resolvedConfig = config === undefined ? detectLlmConfig() : config;

  // No LLM available or no findings to review
  if (!resolvedConfig || findings.length === 0) {
    return {
      filteredFindings: findings,
      removedFindings: [],
      llmUsed: false,
      reviewedCount: 0,
    };
  }

  // Truncate code if too long
  const truncatedCode =
    code.length > resolvedConfig.maxCodeLength
      ? code.slice(0, resolvedConfig.maxCodeLength) + "\n// ... [truncated for review] ..."
      : code;

  // Limit findings count for cost/latency control
  const findingsToReview = findings.slice(0, resolvedConfig.maxFindings);
  const findingsPassthrough = findings.slice(resolvedConfig.maxFindings);

  try {
    const prompt = buildFpReviewPrompt(findingsToReview, truncatedCode, language);
    const responseText = await callLlm(resolvedConfig, prompt);
    const fpMap = parseFpResponse(responseText);

    const removed: Array<Finding & { fpReason: string }> = [];
    const kept: Finding[] = [];

    for (let i = 0; i < findingsToReview.length; i++) {
      const reason = fpMap.get(i);
      if (reason) {
        removed.push({ ...findingsToReview[i], fpReason: reason });
      } else {
        kept.push(findingsToReview[i]);
      }
    }

    // Append any findings that exceeded the review limit (kept as-is)
    kept.push(...findingsPassthrough);

    return {
      filteredFindings: kept,
      removedFindings: removed,
      llmUsed: true,
      model: resolvedConfig.model,
      reviewedCount: findingsToReview.length,
    };
  } catch (error) {
    // Graceful degradation — log and return all findings unchanged
    console.error(`[judges] LLM FP filter error: ${error instanceof Error ? error.message : String(error)}`);

    return {
      filteredFindings: findings,
      removedFindings: [],
      llmUsed: false,
      reviewedCount: 0,
    };
  }
}

// ─── Verdict-Level Integration ───────────────────────────────────────────────

/**
 * Apply LLM-based false positive filtering to a complete TribunalVerdict.
 *
 * Filters both the top-level findings and the per-judge evaluation findings,
 * then recalculates scores and verdicts for consistency.
 *
 * If no LLM is available or no FPs are found, returns the verdict unchanged.
 *
 * @param verdict  - The tribunal verdict from static analysis
 * @param code     - The source code that was analyzed
 * @param language - Programming language
 * @param config   - Explicit LLM config, or undefined to auto-detect
 */
export async function applyLlmFpFilterToVerdict(
  verdict: TribunalVerdict,
  code: string,
  language: string,
  config?: LlmFpFilterConfig | null,
): Promise<{ verdict: TribunalVerdict; filterResult: LlmFpFilterResult }> {
  const result = await filterFalsePositivesWithLlm(verdict.findings, code, language, config);

  if (!result.llmUsed || result.removedFindings.length === 0) {
    return { verdict, filterResult: result };
  }

  // Build a set of removed finding identifiers for fast lookup
  const removedKeys = new Set(result.removedFindings.map((f) => findingKey(f)));

  // Update per-judge evaluations: remove filtered findings, recalculate scores
  const updatedEvaluations: JudgeEvaluation[] = verdict.evaluations.map((evaluation) => {
    const filtered = evaluation.findings.filter((f) => !removedKeys.has(findingKey(f)));
    const score = calculateScore(filtered, code);
    const evalVerdict = deriveVerdict(filtered, score);
    return {
      ...evaluation,
      findings: filtered,
      score,
      verdict: evalVerdict,
    };
  });

  // Recalculate overall metrics
  const criticalCount = result.filteredFindings.filter((f) => f.severity === "critical").length;
  const highCount = result.filteredFindings.filter((f) => f.severity === "high").length;
  const overallScore = Math.round(updatedEvaluations.reduce((sum, e) => sum + e.score, 0) / updatedEvaluations.length);
  const overallVerdict: Verdict = updatedEvaluations.some((e) => e.verdict === "fail")
    ? "fail"
    : updatedEvaluations.some((e) => e.verdict === "warning")
      ? "warning"
      : "pass";

  // Build filter summary section
  const filterSummary = buildFilterSummary(result);

  const updatedVerdict: TribunalVerdict = {
    ...verdict,
    findings: result.filteredFindings,
    evaluations: updatedEvaluations,
    overallScore,
    overallVerdict,
    criticalCount,
    highCount,
    summary: verdict.summary + filterSummary,
  };

  return { verdict: updatedVerdict, filterResult: result };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a stable key for a finding to enable set-based lookup.
 */
function findingKey(f: Finding): string {
  return `${f.ruleId}|${f.title}|${(f.lineNumbers ?? []).join(",")}`;
}

/**
 * Build a Markdown section summarizing the LLM FP filter results.
 */
function buildFilterSummary(result: LlmFpFilterResult): string {
  if (!result.llmUsed || result.removedFindings.length === 0) return "";

  let md = `\n\n## LLM False Positive Filter\n\n`;
  md += `- **Model:** ${result.model}\n`;
  md += `- **Findings Reviewed:** ${result.reviewedCount}\n`;
  md += `- **False Positives Removed:** ${result.removedFindings.length}\n\n`;

  if (result.removedFindings.length > 0) {
    md += `### Dismissed Findings\n\n`;
    for (const f of result.removedFindings) {
      md += `- **[${f.ruleId}] ${f.title}**: ${f.fpReason}\n`;
    }
    md += "\n";
  }

  return md;
}

/**
 * Format an LLM filter result section for appending to tool output.
 * Used by MCP tool handlers to add filter information to the response.
 */
export function formatFilterResultAsMarkdown(result: LlmFpFilterResult): string {
  return buildFilterSummary(result);
}
