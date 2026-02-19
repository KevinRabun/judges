#!/usr/bin/env node

/**
 * Judges Panel — MCP Server
 *
 * An MCP server that provides a panel of specialized judges to evaluate
 * AI-generated code. Each tool returns both automated pattern-detection
 * findings AND the judge's deep-review criteria, enabling the calling LLM
 * to perform thorough contextual analysis beyond what static patterns catch.
 *
 * Tools exposed:
 *   - evaluate_code:              Full panel review (all 18 judges)
 *   - evaluate_code_single_judge: Review by a specific judge
 *   - get_judges:                 List all available judges
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { JUDGES, getJudge, getJudgeSummaries } from "./judges/index.js";
import {
  evaluateWithJudge,
  evaluateWithTribunal,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./evaluators/index.js";
import { JudgeDefinition } from "./types.js";

// ─── Create MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "judges",
  version: "1.2.0",
});

// ─── Tool: get_judges ────────────────────────────────────────────────────────

server.tool(
  "get_judges",
  "List all available judges on the Agent Tribunal panel, including their areas of expertise and what they evaluate.",
  {},
  async () => {
    const judges = getJudgeSummaries();
    const text = judges
      .map(
        (j) =>
          `**${j.name}** (id: \`${j.id}\`)\n  Domain: ${j.domain}\n  ${j.description}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `# Judges Panel\n\n${text}`,
        },
      ],
    };
  }
);

// ─── Tool: evaluate_code ─────────────────────────────────────────────────────

server.tool(
  "evaluate_code",
  `Submit code to the full Judges Panel for evaluation. All 18 judges will independently review the code using both automated pattern detection and deep contextual analysis criteria. Returns a combined verdict with scores, findings, and expert review guidance for thorough evaluation.`,
  {
    code: z
      .string()
      .describe(
        "The source code to evaluate. Include the full file content for best results."
      ),
    language: z
      .string()
      .describe(
        "The programming language of the code (e.g., 'typescript', 'python', 'javascript', 'csharp', 'java')."
      ),
    context: z
      .string()
      .optional()
      .describe(
        "Optional additional context about the code — e.g., what the code does, which framework it uses, or the deployment target."
      ),
  },
  async ({ code, language, context }) => {
    const verdict = evaluateWithTribunal(code, language, context);
    const patternResults = formatVerdictAsMarkdown(verdict);
    const deepReview = buildTribunalDeepReviewSection(JUDGES, language, context);

    return {
      content: [
        {
          type: "text" as const,
          text: patternResults + deepReview,
        },
      ],
    };
  }
);

// ─── Tool: evaluate_code_single_judge ────────────────────────────────────────

const judgeIds = JUDGES.map((j) => j.id);

server.tool(
  "evaluate_code_single_judge",
  `Submit code to a specific judge on the Judges Panel. Use get_judges to see available judges. Available judge IDs: ${judgeIds.join(", ")}`,
  {
    code: z
      .string()
      .describe(
        "The source code to evaluate. Include the full file content for best results."
      ),
    language: z
      .string()
      .describe(
        "The programming language of the code (e.g., 'typescript', 'python', 'javascript', 'csharp', 'java')."
      ),
    judgeId: z
      .string()
      .describe(
        `The ID of the judge to use. One of: ${judgeIds.join(", ")}`
      ),
    context: z
      .string()
      .optional()
      .describe(
        "Optional additional context about the code — e.g., what the code does, which framework it uses, or the deployment target."
      ),
  },
  async ({ code, language, judgeId, context }) => {
    const judge = getJudge(judgeId);
    if (!judge) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Unknown judge ID "${judgeId}". Available judges: ${judgeIds.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const evaluation = evaluateWithJudge(judge, code, language, context);
    const patternResults = formatEvaluationAsMarkdown(evaluation);
    const deepReview = buildSingleJudgeDeepReviewSection(judge, language, context);

    return {
      content: [
        {
          type: "text" as const,
          text: patternResults + deepReview,
        },
      ],
    };
  }
);

// ─── Deep Review Builders ────────────────────────────────────────────────────
// These functions append each judge's expert criteria to the tool output,
// turning pattern-only results into hybrid evaluations. The calling LLM
// uses these criteria to perform deep contextual analysis that regex can't.
// ──────────────────────────────────────────────────────────────────────────────

function buildSingleJudgeDeepReviewSection(
  judge: JudgeDefinition,
  language: string,
  context?: string
): string {
  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += `> **The pattern-based findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code using the expert criteria below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified evaluation.\n\n`;

  if (context) {
    md += `**Context provided:** ${context}\n\n`;
  }

  md += `### ${judge.name} — ${judge.domain}\n\n`;
  md += `${judge.systemPrompt}\n\n`;

  md += `### Response Format\n\n`;
  md += `Provide your deep review as additional findings using the same format:\n`;
  md += `- Rule ID prefix: \`${judge.rulePrefix}-\`\n`;
  md += `- Severity levels: critical / high / medium / low / info\n`;
  md += `- Include: title, description, affected lines, recommendation, and reference\n`;
  md += `- After all findings, provide an updated score (0-100) and final verdict (PASS/WARNING/FAIL)\n`;
  md += `- The final verdict must account for BOTH the pattern findings AND your contextual findings\n`;

  return md;
}

function buildTribunalDeepReviewSection(
  judges: JudgeDefinition[],
  language: string,
  context?: string
): string {
  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += `> **The pattern-based tribunal findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code from the perspective of ALL ${judges.length} judges below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified tribunal verdict.\n\n`;

  if (context) {
    md += `**Context provided:** ${context}\n\n`;
  }

  for (const judge of judges) {
    md += `### ${judge.name} — ${judge.domain}\n\n`;
    md += `${judge.systemPrompt}\n\n`;
    md += `---\n\n`;
  }

  md += `### Response Format\n\n`;
  md += `For each judge, provide any additional findings your contextual analysis uncovers using:\n`;
  md += `- The judge's rule ID prefix\n`;
  md += `- Severity levels: critical / high / medium / low / info\n`;
  md += `- Include: title, description, affected lines, recommendation, and reference\n\n`;
  md += `Then provide an **OVERALL UPDATED TRIBUNAL VERDICT** that accounts for BOTH the pattern findings AND your contextual findings:\n`;
  md += `- Per-judge scores (0-100) and verdicts\n`;
  md += `- Overall score and verdict (PASS/WARNING/FAIL)\n`;
  md += `- Executive summary of the most critical issues\n`;

  return md;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
// Expose the judges' system prompts as MCP prompts so that an LLM-based
// client can use them for deeper, AI-powered analysis beyond pattern matching.

for (const judge of JUDGES) {
  server.prompt(
    `judge-${judge.id}`,
    `Use the ${judge.name} persona to perform a deep ${judge.domain} review of code. This prompt provides the judge's expert criteria for LLM-powered analysis that goes beyond pattern matching.`,
    {
      code: z
        .string()
        .describe("The source code to evaluate"),
      language: z
        .string()
        .describe("The programming language"),
      context: z
        .string()
        .optional()
        .describe("Additional context about the code"),
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
    }
  );
}

// Full tribunal prompt
server.prompt(
  "full-tribunal",
  "Convene the full Judges Panel — all 18 judges evaluate the code in their respective domains and produce a combined verdict.",
  {
    code: z
      .string()
      .describe("The source code to evaluate"),
    language: z
      .string()
      .describe("The programming language"),
    context: z
      .string()
      .optional()
      .describe("Additional context about the code"),
  },
  async ({ code, language, context }) => {
    const judgeInstructions = JUDGES.map(
      (j) =>
        `### ${j.name} — ${j.domain}\n${j.systemPrompt}`
    ).join("\n\n---\n\n");

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
  }
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Judges Panel MCP server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start Judges Panel:", err);
  process.exit(1);
});
