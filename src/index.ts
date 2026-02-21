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
 *   - evaluate_app_builder_flow:  3-step workflow (review, translate, tasks)
 *   - evaluate_code:              Full panel review (all judges)
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
  evaluateProject,
  evaluateDiff,
  analyzeDependencies,
  runAppBuilderWorkflow,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./evaluators/index.js";
import { JudgeDefinition } from "./types.js";

// ─── Create MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "judges",
  version: "1.9.0",
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
  "evaluate_app_builder_flow",
  "Run a 3-step app-builder workflow: tribunal review, plain-language risk translation, and prioritized remediation tasks with AI-fixable P0/P1 items.",
  {
    code: z
      .string()
      .optional()
      .describe("Source code to evaluate (use with language for single-file mode)"),
    language: z
      .string()
      .optional()
      .describe("Programming language for single-file or diff mode"),
    files: z
      .array(
        z.object({
          path: z.string().describe("Relative file path"),
          content: z.string().describe("File content"),
          language: z.string().describe("Programming language"),
        })
      )
      .optional()
      .describe("Project files for multi-file mode"),
    changedLines: z
      .array(z.number())
      .optional()
      .describe("1-based changed line numbers for diff mode"),
    context: z
      .string()
      .optional()
      .describe("Optional context about business purpose or constraints"),
    maxFindings: z
      .number()
      .optional()
      .describe("Maximum number of translated top findings to return (default: 10)"),
    maxTasks: z
      .number()
      .optional()
      .describe("Maximum number of remediation tasks to return (default: 20)"),
  },
  async ({ code, language, files, changedLines, context, maxFindings, maxTasks }) => {
    try {
      const result = runAppBuilderWorkflow({
        code,
        language,
        files,
        changedLines,
        context,
        maxFindings,
        maxTasks,
      });

      const releaseLabel =
        result.releaseDecision === "do-not-ship"
          ? "Do not ship"
          : result.releaseDecision === "ship-with-caution"
          ? "Ship with caution"
          : "Ship now";

      let md = `# App Builder Workflow Report\n\n`;
      md += `**Mode:** ${result.mode}\n`;
      md += `**Decision:** ${releaseLabel}\n`;
      md += `**Verdict:** ${result.verdict.toUpperCase()} (${result.score}/100)\n`;
      md += `**Findings:** Critical ${result.criticalCount} | High ${result.highCount} | Medium ${result.mediumCount}\n\n`;
      md += `${result.summary}\n\n`;

      md += `## Plain-Language Summary\n\n`;
      if (result.plainLanguageFindings.length === 0) {
        md += `No critical/high/medium findings were identified in this run.\n\n`;
      } else {
        for (const finding of result.plainLanguageFindings) {
          md += `### [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.title}\n`;
          md += `- **What is wrong:** ${finding.whatIsWrong}\n`;
          md += `- **Why it matters:** ${finding.whyItMatters}\n`;
          md += `- **Next action:** ${finding.nextAction}\n\n`;
        }
      }

      md += `## Prioritized Task List\n\n`;
      if (result.tasks.length === 0) {
        md += `No remediation tasks generated.\n\n`;
      } else {
        for (const task of result.tasks) {
          md += `- **${task.priority}** | Owner: ${task.owner.toUpperCase()} | Effort: ${task.effort} | ${task.ruleId}\n`;
          md += `  - Task: ${task.task}\n`;
          md += `  - Done when: ${task.doneWhen}\n`;
        }
        md += `\n`;
      }

      md += `## AI-Fixable Now (P0/P1)\n\n`;
      if (result.aiFixableNow.length === 0) {
        md += `No AI-fixable P0/P1 items detected in this run.\n`;
      } else {
        for (const task of result.aiFixableNow) {
          md += `- **${task.priority} ${task.ruleId}** ${task.task}\n`;
        }
      }

      return {
        content: [{ type: "text" as const, text: md }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              error instanceof Error
                ? `Error: ${error.message}`
                : "Error: Failed to run app builder workflow",
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool: evaluate_code ─────────────────────────────────────────────────────

server.tool(
  "evaluate_code",
  `Submit code to the full Judges Panel for evaluation. All ${JUDGES.length} judges will independently review the code using both automated pattern detection and deep contextual analysis criteria. Returns a combined verdict with scores, findings, and expert review guidance for thorough evaluation.`,
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

// ─── Tool: evaluate_project ──────────────────────────────────────────────────

server.tool(
  "evaluate_project",
  `Submit multiple files for project-level analysis. All ${JUDGES.length} judges evaluate each file, plus cross-file architectural analysis detects issues like code duplication, inconsistent error handling, and dependency cycles.`,
  {
    files: z.array(
      z.object({
        path: z.string().describe("Relative file path"),
        content: z.string().describe("File content"),
        language: z.string().describe("Programming language"),
      })
    ).describe("Array of project files to analyze"),
    context: z
      .string()
      .optional()
      .describe("Optional context about the project"),
  },
  async ({ files, context }) => {
    const result = evaluateProject(files, context);

    let md = `# Project Analysis\n\n`;
    md += `**Overall:** ${result.overallVerdict.toUpperCase()} (${result.overallScore}/100)\n`;
    md += `**Files:** ${result.fileResults.length} | **Critical:** ${result.criticalCount} | **High:** ${result.highCount}\n\n`;

    for (const fr of result.fileResults) {
      md += `## ${fr.path} (${fr.language}) — ${fr.score}/100\n`;
      if (fr.findings.length === 0) {
        md += `No findings.\n\n`;
      } else {
        for (const f of fr.findings.slice(0, 10)) {
          md += `- **[${f.severity.toUpperCase()}]** ${f.ruleId}: ${f.title}\n`;
        }
        if (fr.findings.length > 10) {
          md += `- ... and ${fr.findings.length - 10} more\n`;
        }
        md += `\n`;
      }
    }

    if (result.architecturalFindings.length > 0) {
      md += `## Architectural Findings\n\n`;
      for (const f of result.architecturalFindings) {
        md += `- **[${f.severity.toUpperCase()}]** ${f.ruleId}: ${f.title}\n  ${f.description}\n`;
      }
    }

    return {
      content: [{ type: "text" as const, text: md }],
    };
  }
);

// ─── Tool: evaluate_diff ─────────────────────────────────────────────────────

server.tool(
  "evaluate_diff",
  `Evaluate only the changed lines in a code diff. Runs all ${JUDGES.length} judges on the full file but filters findings to only those affecting the specified changed lines. Ideal for PR reviews and incremental analysis.`,
  {
    code: z
      .string()
      .describe("The full file content (post-change)"),
    language: z
      .string()
      .describe("The programming language"),
    changedLines: z
      .array(z.number())
      .describe(
        "Array of 1-based line numbers that were changed (added or modified)"
      ),
    context: z
      .string()
      .optional()
      .describe("Optional context about the change"),
  },
  async ({ code, language, changedLines, context }) => {
    const result = evaluateDiff(code, language, changedLines, context);

    let md = `# Diff Analysis\n\n`;
    md += `**Verdict:** ${result.verdict.toUpperCase()} (${result.score}/100)\n`;
    md += `**Changed lines analyzed:** ${result.linesAnalyzed}\n`;
    md += `**Findings in changed code:** ${result.findings.length}\n\n`;

    if (result.findings.length === 0) {
      md += `No issues found in the changed lines.\n`;
    } else {
      for (const f of result.findings) {
        md += `### ${f.ruleId}: ${f.title}\n`;
        md += `**Severity:** ${f.severity} | **Lines:** ${f.lineNumbers?.join(", ") ?? "N/A"}\n\n`;
        md += `${f.description}\n\n`;
        md += `**Recommendation:** ${f.recommendation}\n\n`;
      }
    }

    return {
      content: [{ type: "text" as const, text: md }],
    };
  }
);

// ─── Tool: analyze_dependencies ──────────────────────────────────────────────

server.tool(
  "analyze_dependencies",
  "Analyze a dependency manifest file for supply-chain risks, version pinning issues, typosquatting indicators, and dependency hygiene. Supports package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, and .csproj files.",
  {
    manifest: z
      .string()
      .describe("The full content of the manifest file"),
    manifestType: z
      .enum([
        "package.json",
        "requirements.txt",
        "Cargo.toml",
        "go.mod",
        "pom.xml",
        "csproj",
      ])
      .describe("The type of manifest file"),
  },
  async ({ manifest, manifestType }) => {
    const result = analyzeDependencies(manifest, manifestType);

    let md = `# Dependency Analysis (${manifestType})\n\n`;
    md += `**Verdict:** ${result.verdict.toUpperCase()} (${result.score}/100)\n`;
    md += `**Total dependencies:** ${result.totalDependencies}\n`;
    md += `**Findings:** ${result.findings.length}\n\n`;

    if (result.findings.length > 0) {
      for (const f of result.findings) {
        md += `### ${f.ruleId}: ${f.title}\n`;
        md += `**Severity:** ${f.severity}\n\n`;
        md += `${f.description}\n\n`;
        md += `**Recommendation:** ${f.recommendation}\n\n`;
      }
    }

    if (result.dependencies.length > 0) {
      md += `## Dependencies (${result.dependencies.length})\n\n`;
      const prod = result.dependencies.filter((d) => !d.isDev);
      const dev = result.dependencies.filter((d) => d.isDev);
      if (prod.length > 0) {
        md += `**Production (${prod.length}):** ${prod.map((d) => `${d.name}@${d.version}`).join(", ")}\n\n`;
      }
      if (dev.length > 0) {
        md += `**Development (${dev.length}):** ${dev.map((d) => `${d.name}@${d.version}`).join(", ")}\n\n`;
      }
    }

    return {
      content: [{ type: "text" as const, text: md }],
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
  `Convene the full Judges Panel — all ${JUDGES.length} judges evaluate the code in their respective domains and produce a combined verdict.`,
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
