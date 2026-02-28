// ─── MCP Prompt Registrations ────────────────────────────────────────────────
// Expose judge system prompts as MCP prompts so LLM-based clients can use
// them for deeper, AI-powered analysis beyond pattern matching.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JUDGES } from "../judges/index.js";

/**
 * Register all MCP prompts on the given server:
 *  - One per-judge prompt (`judge-{id}`) for single-persona deep reviews
 *  - A `full-tribunal` prompt that convenes all judges at once
 */
export function registerPrompts(server: McpServer): void {
  // Per-judge prompts
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

  // Full tribunal prompt
  server.prompt(
    "full-tribunal",
    `Convene the full Judges Panel — all ${JUDGES.length} judges evaluate the code in their respective domains and produce a combined verdict.`,
    {
      code: z.string().describe("The source code to evaluate"),
      language: z.string().describe("The programming language"),
      context: z.string().optional().describe("Additional context about the code"),
    },
    async ({ code, language, context }) => {
      const judgeInstructions = JUDGES.map((j) => `### ${j.name} — ${j.domain}\n${j.systemPrompt}`).join("\n\n---\n\n");

      const userMessage =
        `You are the Judges Panel — a panel of ${JUDGES.length} expert judges who independently evaluate code for quality, security, and operational readiness.\n\n` +
        `Evaluate the following ${language} code from the perspective of ALL ${JUDGES.length} judges below. For each judge, provide:\n` +
        `1. Judge name and domain\n` +
        `2. Verdict (PASS / WARNING / FAIL)\n` +
        `3. Score (0-100)\n` +
        `4. Specific findings with rule IDs, severity, and recommendations\n\n` +
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
