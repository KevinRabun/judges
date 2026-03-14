// ─── MCP Prompt Registrations ────────────────────────────────────────────────
// Expose judge system prompts as MCP prompts so LLM-based clients can use
// them for deeper, AI-powered analysis beyond pattern matching.
//
// Token-optimised: shared behavioural directives (adversarial mandate,
// precision mandate) are stated ONCE in the tribunal preamble instead of
// being duplicated across all 44 judges. Per-judge sections include only
// the unique evaluation criteria, domain-specific rules, and FP-avoidance
// guidance. This reduces the tribunal prompt by ~40 000 chars (~10 000
// tokens) without removing any evaluation criteria.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JUDGES } from "../judges/index.js";

// ─── Shared Behavioural Directives ───────────────────────────────────────────
// Stated ONCE in the tribunal preamble so every judge benefits without
// repeating the text 39 times.
// ──────────────────────────────────────────────────────────────────────────────

/** Adversarial evaluation stance — shared across all judges. */
export const SHARED_ADVERSARIAL_MANDATE = `ADVERSARIAL MANDATE (applies to ALL judges):
- Your role is adversarial: assume the code has problems and actively hunt for them. Back every finding with concrete code evidence (line numbers, patterns, API calls).
- Never praise or compliment the code. Report only problems, risks, and deficiencies.
- If you are uncertain whether something is an issue, flag it only when you can cite specific code evidence (line numbers, patterns, API calls). Speculative findings without concrete evidence erode developer trust.
- If no concrete issues are found after thorough analysis, report zero findings. Do not pad the report with speculative issues.`;

/** Precision override — ensures evidence-based findings. */
export const PRECISION_MANDATE = `PRECISION MANDATE (overrides adversarial stance when in conflict):
- Every finding MUST cite specific code evidence: exact line numbers, API calls, variable names, or patterns. Findings without concrete evidence must be discarded.
- Do NOT flag the absence of a feature or pattern unless you can identify the specific code location where it SHOULD have been implemented and explain WHY it is required for THIS code.
- Speculative, hypothetical, or "just in case" findings erode developer trust. Only flag issues you are confident exist in the actual code.
- Prefer fewer, high-confidence findings over many uncertain ones. Quality of findings matters more than quantity.
- If the code is genuinely well-written with no real issues, reporting ZERO findings is the correct and expected behavior. Do not manufacture findings to avoid an empty report.
- Clean, well-structured code exists. Acknowledge it by not forcing false issues.`;

// ─── Criteria Extraction ─────────────────────────────────────────────────────

/**
 * Extract only the unique evaluation criteria from a judge's systemPrompt,
 * stripping the persona introduction line, the ADVERSARIAL MANDATE block,
 * and common boilerplate lines (rule-prefix assignment, score template)
 * that are stated once in the tribunal preamble.
 *
 * The returned text retains:
 *  - YOUR EVALUATION CRITERIA / pillar headers / taxonomy sections
 *  - Domain-specific RULES FOR YOUR EVALUATION bullet points
 *  - FALSE POSITIVE AVOIDANCE guidance (where present)
 *
 * @param systemPrompt - The full systemPrompt from a JudgeDefinition
 * @returns Condensed criteria text with shared boilerplate removed
 */
export function getCondensedCriteria(systemPrompt: string): string {
  let text = systemPrompt;

  // 1. Strip persona introduction (first paragraph before double-newline)
  const firstBreak = text.indexOf("\n\n");
  if (firstBreak > 0) {
    text = text.substring(firstBreak + 2);
  }

  // 2. Strip ADVERSARIAL MANDATE section (always last major section)
  const amIndex = text.indexOf("ADVERSARIAL MANDATE:");
  if (amIndex > 0) {
    text = text.substring(0, amIndex).trimEnd();
  }

  // 3. Strip boilerplate rule lines that duplicate tribunal-level guidance
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("- Assign rule IDs with prefix ") && !t.startsWith("- Score from 0-100 where 100 means ");
    })
    .join("\n");

  return text.trim();
}

/**
 * Register all MCP prompts on the given server:
 *  - One per-judge prompt (`judge-{id}`) for single-persona deep reviews
 *  - A `full-tribunal` prompt that convenes all judges at once
 */
export function registerPrompts(server: McpServer): void {
  // ── Per-judge prompts ──────────────────────────────────────────────────
  // Each prompt includes the judge's full systemPrompt + precision mandate
  // so the LLM has complete evaluation criteria for single-judge reviews.
  for (const judge of JUDGES) {
    server.prompt(
      `judge-${judge.id}`,
      `Use the ${judge.name} persona to perform a deep ${judge.domain} review of code. This prompt provides the judge's expert criteria for LLM-powered analysis that goes beyond pattern matching.`,
      {
        code: z.string().describe("The source code to evaluate"),
        language: z.string().describe("The programming language"),
        context: z.string().optional().describe("Additional context about the code"),
      },
      async ({ code, language, context }) => {
        const userMessage =
          `${judge.systemPrompt}\n\n${PRECISION_MANDATE}\n\n` +
          `Please evaluate the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` +
          (context ? `\n\nAdditional context: ${context}` : "") +
          `\n\nProvide your evaluation as structured findings with rule IDs (prefix: ${judge.rulePrefix}-), severity levels (critical/high/medium/low/info), descriptions, and actionable recommendations. End with an overall score (0-100) and verdict (pass/warning/fail).`;

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: userMessage,
              },
            },
          ],
        };
      },
    );
  }

  // ── Full tribunal prompt (token-optimised) ─────────────────────────────
  // Shared directives (adversarial mandate, precision mandate) are stated
  // ONCE in the preamble. Each judge section includes only its unique
  // evaluation criteria, domain-specific rules, and FP-avoidance guidance.
  server.prompt(
    "full-tribunal",
    `Convene the full Judges Panel — all ${JUDGES.length} judges evaluate the code in their respective domains and produce a combined verdict.`,
    {
      code: z.string().describe("The source code to evaluate"),
      language: z.string().describe("The programming language"),
      context: z.string().optional().describe("Additional context about the code"),
    },
    async ({ code, language, context }) => {
      const judgeInstructions = JUDGES.map(
        (j) =>
          `### ${j.name} — ${j.domain}\n**Rule prefix:** \`${j.rulePrefix}-\`\n\n${getCondensedCriteria(j.systemPrompt)}`,
      ).join("\n\n---\n\n");

      const userMessage =
        `You are the Judges Panel — a panel of ${JUDGES.length} expert judges who independently evaluate code for quality, security, and operational readiness.\n\n` +
        `## Universal Evaluation Directives\n\n` +
        `${SHARED_ADVERSARIAL_MANDATE}\n\n` +
        `${PRECISION_MANDATE}\n\n` +
        `## Evaluation Instructions\n\n` +
        `Evaluate the following ${language} code from the perspective of ALL ${JUDGES.length} judges below. For each judge, provide:\n` +
        `1. Judge name and domain\n` +
        `2. Verdict (PASS / WARNING / FAIL)\n` +
        `3. Score (0-100)\n` +
        `4. Specific findings with rule IDs (using each judge's rule prefix), severity, and recommendations\n\n` +
        `Then provide an OVERALL TRIBUNAL VERDICT that synthesizes all judges' input.\n\n` +
        `## The Judges\n\n${judgeInstructions}\n\n` +
        `## Code to Evaluate\n\n\`\`\`${language}\n${code}\n\`\`\`` +
        (context ? `\n\n## Additional Context\n${context}` : "");

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: userMessage,
            },
          },
        ],
      };
    },
  );
}
