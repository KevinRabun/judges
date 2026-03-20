// ─── Evaluation Tool Handlers ────────────────────────────────────────────────
// MCP tool handlers for single-file and V2 evaluation, plus judge listing.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { extname } from "path";

import { JUDGES, getJudge, getJudgeSummaries } from "../judges/index.js";
import {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateWithTribunalStreaming,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "../evaluators/index.js";
import { evaluateCodeV2, evaluateProjectV2, getSupportedPolicyProfiles } from "../evaluators/v2.js";
import { detectProjectContext } from "../evaluators/shared.js";
import { getGlobalSession } from "../evaluation-session.js";
import { configSchema, toJudgesConfig } from "./schemas.js";
import { validateCodeSize } from "./validation.js";
import { buildSingleJudgeDeepReviewSection, buildTribunalDeepReviewSection } from "./deep-review.js";
import type { StreamingBatch } from "../types.js";

/**
 * Register evaluation-focused tools: get_judges, evaluate_code,
 * evaluate_code_single_judge, evaluate_v2, and evaluate_file.
 */
export function registerEvaluationTools(server: McpServer): void {
  registerGetJudges(server);
  registerEvaluateCode(server);
  registerEvaluateSingleJudge(server);
  registerEvaluateV2(server);
  registerEvaluateFile(server);
  registerEvaluateCodeStreaming(server);
}

// ─── get_judges ──────────────────────────────────────────────────────────────

function registerGetJudges(server: McpServer): void {
  server.tool(
    "get_judges",
    "List all available judges on the Agent Tribunal panel, including their areas of expertise and what they evaluate.",
    {},
    async () => {
      const judges = getJudgeSummaries();
      const text = judges
        .map((j) => `**${j.name}** (id: \`${j.id}\`)\n  Domain: ${j.domain}\n  ${j.description}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `# Judges Panel\n\n${text}`,
          },
          {
            type: "text" as const,
            text:
              "```json\n" +
              JSON.stringify(
                {
                  judgeCount: judges.length,
                  judges: judges.map((j) => ({ id: j.id, name: j.name, domain: j.domain })),
                },
                null,
                2,
              ) +
              "\n```",
          },
        ],
      };
    },
  );
}

// ─── evaluate_code ───────────────────────────────────────────────────────────

function registerEvaluateCode(server: McpServer): void {
  server.tool(
    "evaluate_code",
    `Submit code to the full Judges Panel for evaluation. Handles ALL code types including application code, infrastructure-as-code (Bicep, Terraform, ARM, CloudFormation), and configuration files. All ${JUDGES.length} judges will independently review the code using both automated pattern detection and deep contextual analysis criteria. Returns a combined verdict with scores, findings, and expert review guidance for thorough evaluation.`,
    {
      code: z.string().describe("The source code to evaluate. Include the full file content for best results."),
      language: z
        .string()
        .describe(
          "The programming language of the code (e.g., 'typescript', 'python', 'javascript', 'csharp', 'java').",
        ),
      context: z
        .string()
        .optional()
        .describe(
          "Optional additional context about the code — e.g., what the code does, which framework it uses, or the deployment target.",
        ),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      relatedFiles: z
        .array(
          z.object({
            path: z.string().describe("Relative file path"),
            snippet: z.string().describe("Relevant code excerpt from the file"),
            relationship: z
              .string()
              .optional()
              .describe("Why this file is relevant (e.g. 'imported by target', 'shared type')"),
          }),
        )
        .optional()
        .describe(
          "Related files that provide cross-file context for deeper analysis (imports, shared types, call sites)",
        ),
      config: configSchema,
    },
    async ({ code, language, context, includeAstFindings, minConfidence, relatedFiles, config }) => {
      try {
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
        const session = getGlobalSession();
        const verdict = evaluateWithTribunal(code, language, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
          adaptiveSelection: true,
          filePath: context,
        });

        // Track evaluation in session
        session.recordEvaluation(context ?? `<inline:${language}>`, code, verdict);

        const projectContext = detectProjectContext(code, language);
        const patternResults = formatVerdictAsMarkdown(verdict);
        const deepReview = buildTribunalDeepReviewSection(JUDGES, language, context, relatedFiles, projectContext);

        // Structured JSON content block for programmatic consumption
        const structuredData = {
          score: verdict.overallScore,
          verdict: verdict.overallVerdict,
          findingCount: verdict.findings.length,
          criticalCount: verdict.findings.filter((f) => f.severity === "critical").length,
          highCount: verdict.findings.filter((f) => f.severity === "high").length,
          judgesRun: verdict.evaluations.length,
          findings: verdict.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            lineNumbers: f.lineNumbers,
            confidence: f.confidence,
          })),
          sessionStats: {
            evaluationCount: session.evaluationCount,
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: patternResults + deepReview,
            },
            {
              type: "text" as const,
              text: "```json\n" + JSON.stringify(structuredData, null, 2) + "\n```",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate code",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_code_single_judge ──────────────────────────────────────────────

function registerEvaluateSingleJudge(server: McpServer): void {
  const judgeIds = JUDGES.map((j) => j.id);

  server.tool(
    "evaluate_code_single_judge",
    `Submit code to a specific judge for targeted domain analysis. Handles ALL code types including application code, infrastructure-as-code (Bicep, Terraform, ARM, CloudFormation), and configuration files. Key domains: cybersecurity, data-sovereignty, iac-security, compliance, cost-effectiveness, authentication, cloud-readiness, and ${judgeIds.length - 7} more. Available judge IDs: ${judgeIds.join(", ")}`,
    {
      code: z.string().describe("The source code to evaluate. Include the full file content for best results."),
      language: z
        .string()
        .describe(
          "The programming language of the code (e.g., 'typescript', 'python', 'javascript', 'csharp', 'java').",
        ),
      judgeId: z.string().describe(`The ID of the judge to use. One of: ${judgeIds.join(", ")}`),
      context: z
        .string()
        .optional()
        .describe(
          "Optional additional context about the code — e.g., what the code does, which framework it uses, or the deployment target.",
        ),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      relatedFiles: z
        .array(
          z.object({
            path: z.string().describe("Relative file path"),
            snippet: z.string().describe("Relevant code excerpt from the file"),
            relationship: z.string().optional().describe("Why this file is relevant"),
          }),
        )
        .optional()
        .describe("Related files that provide cross-file context for deeper analysis"),
      config: configSchema,
    },
    async ({ code, language, judgeId, context, minConfidence, relatedFiles, config }) => {
      try {
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
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

        const evaluation = evaluateWithJudge(judge, code, language, context, {
          minConfidence,
          config: toJudgesConfig(config),
        });

        const projectContext = detectProjectContext(code, language);
        const patternResults = formatEvaluationAsMarkdown(evaluation);
        const deepReview = buildSingleJudgeDeepReviewSection(judge, language, context, relatedFiles, projectContext);

        const structured = {
          judgeId,
          judgeName: judge.name,
          domain: judge.domain,
          score: evaluation.score,
          verdict: evaluation.verdict,
          findingCount: evaluation.findings.length,
          findings: evaluation.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            lineNumbers: f.lineNumbers,
            confidence: f.confidence,
          })),
        };

        return {
          content: [
            { type: "text" as const, text: patternResults + deepReview },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate code with single judge",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_v2 ─────────────────────────────────────────────────────────────

function registerEvaluateV2(server: McpServer): void {
  server.tool(
    "evaluate_policy_aware",
    "Run policy-aware tribunal evaluation with named policy profiles (startup, regulated, healthcare, fintech, public-sector), evidence calibration from runtime metrics, specialty-per-judge feedback, confidence scoring, and uncertainty reporting. Use this when code must meet specific compliance or vertical requirements.",
    {
      code: z.string().optional().describe("Source code for single-file mode"),
      language: z.string().optional().describe("Language for single-file mode"),
      files: z
        .array(
          z.object({
            path: z.string().describe("Relative file path"),
            content: z.string().describe("File content"),
            language: z.string().describe("Programming language"),
          }),
        )
        .optional()
        .describe("Project files for multi-file mode"),
      context: z.string().optional().describe("Optional high-level context"),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      policyProfile: z
        .enum(["default", "startup", "regulated", "healthcare", "fintech", "public-sector"])
        .optional()
        .describe("Policy profile for domain-specific severity calibration"),
      evaluationContext: z
        .object({
          architectureNotes: z.string().optional(),
          constraints: z.array(z.string()).optional(),
          standards: z.array(z.string()).optional(),
          knownRisks: z.array(z.string()).optional(),
          dataBoundaryModel: z.string().optional(),
        })
        .optional()
        .describe("Structured context to improve semantic relevance"),
      evidence: z
        .object({
          testSummary: z.string().optional(),
          coveragePercent: z.number().optional(),
          p95LatencyMs: z.number().optional(),
          errorRatePercent: z.number().optional(),
          dependencyVulnerabilityCount: z.number().optional(),
          deploymentNotes: z.string().optional(),
        })
        .optional()
        .describe("Runtime/operational evidence used for confidence calibration"),
    },
    async ({
      code,
      language,
      files,
      context,
      includeAstFindings,
      minConfidence,
      policyProfile,
      evaluationContext,
      evidence,
    }) => {
      try {
        if (!code && (!files || files.length === 0)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: provide either code+language for single-file mode, or files[] for project mode.",
              },
            ],
            isError: true,
          };
        }

        if (code && !language) {
          return {
            content: [{ type: "text" as const, text: "Error: language is required when code is provided." }],
            isError: true,
          };
        }

        if (code && files && files.length > 0) {
          return {
            content: [{ type: "text" as const, text: "Error: provide either code+language OR files[], not both." }],
            isError: true,
          };
        }

        const supportedProfiles = getSupportedPolicyProfiles();
        const result =
          files && files.length > 0
            ? evaluateProjectV2({
                files,
                context,
                includeAstFindings,
                minConfidence,
                policyProfile,
                evaluationContext,
                evidence,
              })
            : evaluateCodeV2({
                code: code!,
                language: language!,
                context,
                includeAstFindings,
                minConfidence,
                policyProfile,
                evaluationContext,
                evidence,
              });

        let md = `# Policy-Aware Tribunal Evaluation\n\n`;
        md += `**Policy Profile:** ${result.policyProfile}\n`;
        md += `**Calibrated Verdict:** ${result.calibratedVerdict.toUpperCase()} (${result.calibratedScore}/100)\n`;
        md += `**Base Verdict:** ${result.baseVerdict.overallVerdict.toUpperCase()} (${result.baseVerdict.overallScore}/100)\n`;
        md += `**Confidence:** ${Math.round(result.confidence * 100)}%\n`;
        md += `**Findings:** ${result.findings.length}\n\n`;
        md += `${result.summary}\n\n`;

        md += `## Specialty Feedback\n\n`;
        for (const block of result.specialtyFeedback.slice(0, 10)) {
          md += `### ${block.judgeName} — ${block.domain}\n`;
          md += `Confidence: ${Math.round(block.confidence * 100)}% | Findings: ${block.findings.length}\n\n`;
          for (const finding of block.findings.slice(0, 3)) {
            md += `- [${finding.severity.toUpperCase()}] ${finding.ruleId} ${finding.title} (confidence ${Math.round(finding.confidence * 100)}%)\n`;
          }
          md += `\n`;
        }

        md += `## Uncertainty Report\n\n`;
        md += `**Assumptions**\n`;
        if (result.uncertainty.assumptions.length === 0) {
          md += `- None\n`;
        } else {
          for (const item of result.uncertainty.assumptions) {
            md += `- ${item}\n`;
          }
        }
        md += `\n**Missing Evidence**\n`;
        if (result.uncertainty.missingEvidence.length === 0) {
          md += `- None\n`;
        } else {
          for (const item of result.uncertainty.missingEvidence) {
            md += `- ${item}\n`;
          }
        }

        md += `\n**Escalation Recommendations**\n`;
        if (result.uncertainty.escalationRecommendations.length === 0) {
          md += `- None\n`;
        } else {
          for (const item of result.uncertainty.escalationRecommendations) {
            md += `- ${item}\n`;
          }
        }

        md += `\n## Supported Policy Profiles\n\n`;
        md += supportedProfiles.map((profile) => `- ${profile}`).join("\n");
        md += "\n";

        const structured = {
          policyProfile: result.policyProfile,
          calibratedScore: result.calibratedScore,
          calibratedVerdict: result.calibratedVerdict,
          baseScore: result.baseVerdict.overallScore,
          baseVerdict: result.baseVerdict.overallVerdict,
          confidence: result.confidence,
          findingCount: result.findings.length,
          findings: result.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            confidence: f.confidence,
          })),
          uncertainty: result.uncertainty,
        };

        return {
          content: [
            { type: "text" as const, text: md },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to run V2 evaluation",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_file ───────────────────────────────────────────────────────────

import { detectLanguageFromPath as _detectLangShared } from "../ext-to-lang.js";

function detectLanguageFromPath(filePath: string): string {
  return _detectLangShared(filePath) ?? "typescript";
}

function registerEvaluateFile(server: McpServer): void {
  server.tool(
    "evaluate_file",
    `Read a file from disk and submit it to the full Judges Panel for evaluation. Automatically detects the programming language from the file extension. All ${JUDGES.length} judges review the code with pattern detection and deep contextual analysis.`,
    {
      filePath: z.string().describe("Absolute or relative path to the file to evaluate."),
      language: z.string().optional().describe("Override the detected language (e.g., 'typescript', 'python')."),
      context: z
        .string()
        .optional()
        .describe("Optional context about the code — framework, use-case, deployment target."),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      config: configSchema,
    },
    async ({ filePath, language, context, includeAstFindings, minConfidence, config }) => {
      try {
        if (!existsSync(filePath)) {
          return {
            content: [{ type: "text" as const, text: `Error: File not found: ${filePath}` }],
            isError: true,
          };
        }

        const code = readFileSync(filePath, "utf-8");
        const detectedLang = language || detectLanguageFromPath(filePath);
        const session = getGlobalSession();

        // Skip re-evaluation if verdict is stable for this file
        if (session.isVerdictStable(filePath)) {
          const history = session.getVerdictHistory(filePath);
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `# Evaluation: ${filePath}\n\n` +
                  `> ⚡ **Verdict stable** — score has converged at **${history[0]?.score ?? 0}/100** ` +
                  `across last evaluations. Skipping redundant re-evaluation.\n\n` +
                  `Use \`evaluate_code\` with the code directly to force a fresh evaluation.`,
              },
            ],
          };
        }

        const verdict = evaluateWithTribunal(code, detectedLang, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
          adaptiveSelection: true,
          filePath,
        });

        session.recordEvaluation(filePath, code, verdict);

        const projectContext = detectProjectContext(code, detectedLang, filePath);
        const patternResults = formatVerdictAsMarkdown(verdict);
        const deepReview = buildTribunalDeepReviewSection(JUDGES, detectedLang, context, undefined, projectContext);

        const structuredData = {
          filePath,
          language: detectedLang,
          score: verdict.overallScore,
          verdict: verdict.overallVerdict,
          findingCount: verdict.findings.length,
          criticalCount: verdict.findings.filter((f) => f.severity === "critical").length,
          highCount: verdict.findings.filter((f) => f.severity === "high").length,
          judgesRun: verdict.evaluations.length,
          findings: verdict.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            lineNumbers: f.lineNumbers,
            confidence: f.confidence,
          })),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: `# Evaluation: ${filePath}\n\n` + patternResults + deepReview,
            },
            {
              type: "text" as const,
              text: "```json\n" + JSON.stringify(structuredData, null, 2) + "\n```",
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate file",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_code_streaming ─────────────────────────────────────────────────

function registerEvaluateCodeStreaming(server: McpServer): void {
  server.tool(
    "evaluate_code_streaming",
    `Submit code for streaming evaluation — returns per-judge results as each judge completes, with running aggregate scores. Ideal for long evaluations where you want progressive feedback. All ${JUDGES.length} judges run sequentially with per-judge results accumulated into a single structured response.`,
    {
      code: z.string().describe("The source code to evaluate."),
      language: z.string().describe("The programming language (e.g., 'typescript', 'python', 'javascript')."),
      context: z.string().optional().describe("Optional context about the code."),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      config: configSchema,
    },
    async ({ code, language, context, includeAstFindings, minConfidence, config }) => {
      try {
        const session = getGlobalSession();
        const batches: Array<{
          judgeId: string;
          judgeName: string;
          findingCount: number;
          durationMs: number;
          runningScore: number;
          runningVerdict: string;
        }> = [];

        let finalBatch: StreamingBatch | undefined;

        for await (const batch of evaluateWithTribunalStreaming(code, language, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
          adaptiveSelection: true,
        })) {
          batches.push({
            judgeId: batch.judgeId,
            judgeName: batch.judgeName,
            findingCount: batch.evaluation.findings.length,
            durationMs: batch.evaluation.durationMs ?? 0,
            runningScore: batch.aggregate.currentScore,
            runningVerdict: batch.aggregate.currentVerdict,
          });
          finalBatch = batch;
        }

        // Build progressive markdown
        let md = `# Streaming Evaluation Results\n\n`;
        md += `**Final Score:** ${finalBatch?.aggregate.currentScore ?? 0}/100\n`;
        md += `**Verdict:** ${(finalBatch?.aggregate.currentVerdict ?? "pass").toUpperCase()}\n`;
        md += `**Judges Run:** ${finalBatch?.aggregate.completedJudges ?? 0}/${finalBatch?.aggregate.totalJudges ?? 0}\n`;
        md += `**Total Findings:** ${finalBatch?.aggregate.findingsSoFar ?? 0}\n\n`;

        md += `## Per-Judge Breakdown\n\n`;
        md += `| Judge | Findings | Time (ms) | Running Score |\n`;
        md += `|-------|----------|-----------|---------------|\n`;
        for (const b of batches) {
          md += `| ${b.judgeName} | ${b.findingCount} | ${b.durationMs} | ${b.runningScore}/100 |\n`;
        }

        const structuredData = {
          score: finalBatch?.aggregate.currentScore ?? 0,
          verdict: finalBatch?.aggregate.currentVerdict ?? "pass",
          totalFindings: finalBatch?.aggregate.findingsSoFar ?? 0,
          criticalFindings: finalBatch?.aggregate.criticalSoFar ?? 0,
          highFindings: finalBatch?.aggregate.highSoFar ?? 0,
          judgesRun: finalBatch?.aggregate.completedJudges ?? 0,
          totalJudges: finalBatch?.aggregate.totalJudges ?? 0,
          perJudge: batches,
          sessionEvaluationCount: session.evaluationCount,
        };

        return {
          content: [
            { type: "text" as const, text: md },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structuredData, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Streaming evaluation failed",
            },
          ],
          isError: true,
        };
      }
    },
  );
}
