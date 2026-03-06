// ─── Workflow & Project Tool Handlers ─────────────────────────────────────────
// MCP tool handlers for multi-file project analysis, diff review, app builder
// workflow, public repo reports, and dependency analysis.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { JUDGES } from "../judges/index.js";
import { evaluateProject, evaluateDiff, analyzeDependencies, runAppBuilderWorkflow } from "../evaluators/index.js";
import { evaluateWithTribunal } from "../evaluators/index.js";
import { evaluateFilesBatch } from "../api.js";
import { generatePublicRepoReport } from "../reports/public-repo-report.js";
import { configSchema, toJudgesConfig } from "./schemas.js";
import { benchmarkGate, formatBenchmarkReport } from "../commands/benchmark.js";

/**
 * Register workflow-focused tools: evaluate_public_repo_report, evaluate_project,
 * evaluate_diff, evaluate_app_builder_flow, and analyze_dependencies.
 */
export function registerWorkflowTools(server: McpServer): void {
  registerPublicRepoReport(server);
  registerAppBuilderFlow(server);
  registerEvaluateProject(server);
  registerEvaluateDiff(server);
  registerAnalyzeDependencies(server);
  registerBenchmarkGate(server);
  registerEvaluateBatch(server);
}

// ─── evaluate_public_repo_report ─────────────────────────────────────────────

function registerPublicRepoReport(server: McpServer): void {
  server.tool(
    "evaluate_public_repo_report",
    "Clone a public repository URL, run the full judges panel across source files, and generate a consolidated markdown report.",
    {
      repoUrl: z.string().describe("Public repository URL (HTTP/HTTPS)"),
      branch: z.string().optional().describe("Optional branch name (defaults to repository default branch)"),
      outputPath: z.string().optional().describe("Optional path to write the markdown report"),
      maxFiles: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of source files to analyze (default: 600)"),
      maxFileBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum single file size in bytes (default: 300000)"),
      maxFindingsInReport: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of detailed findings in report (default: 150)"),
      credentialMode: z
        .enum(["standard", "strict"])
        .optional()
        .describe("Credential detection mode: standard (default) or strict"),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      enableMustFixGate: z
        .boolean()
        .optional()
        .describe("Enable must-fix gate for high-confidence dangerous findings (default: false)"),
      mustFixMinConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence threshold for must-fix gate triggers (0-1, default: 0.85)"),
      mustFixDangerousRulePrefixes: z
        .array(z.string())
        .optional()
        .describe("Optional rule prefixes considered dangerous for must-fix gate"),
      keepClone: z.boolean().optional().describe("Keep cloned repository on disk for inspection"),
    },
    async ({
      repoUrl,
      branch,
      outputPath,
      maxFiles,
      maxFileBytes,
      maxFindingsInReport,
      credentialMode,
      includeAstFindings,
      minConfidence,
      enableMustFixGate,
      mustFixMinConfidence,
      mustFixDangerousRulePrefixes,
      keepClone,
    }) => {
      try {
        const report = generatePublicRepoReport({
          repoUrl,
          branch,
          outputPath,
          maxFiles,
          maxFileBytes,
          maxFindingsInReport,
          credentialMode,
          includeAstFindings,
          minConfidence,
          mustFixGate: enableMustFixGate
            ? {
                enabled: true,
                minConfidence: mustFixMinConfidence,
                dangerousRulePrefixes: mustFixDangerousRulePrefixes,
              }
            : undefined,
          keepClone,
        });

        let summary = `# Public Repo Report Generated\n\n`;
        summary += `- Repository: ${repoUrl}\n`;
        summary += `- Overall verdict: ${report.overallVerdict.toUpperCase()}\n`;
        summary += `- Average score: ${report.averageScore}/100\n`;
        summary += `- Files analyzed: ${report.analyzedFileCount}\n`;
        summary += `- Total findings: ${report.totalFindings}\n`;
        summary += `- Credential mode: ${(credentialMode ?? "standard").toUpperCase()}\n`;
        summary += `- AST findings: ${(includeAstFindings ?? true) ? "INCLUDED" : "EXCLUDED"}\n`;
        summary += `- Min confidence: ${minConfidence ?? 0}\n`;
        if (enableMustFixGate) {
          summary += `- Must-fix gate: ENABLED (min confidence: ${mustFixMinConfidence ?? 0.85})\n`;
        }
        if (report.outputPath) {
          summary += `- Report path: ${report.outputPath}\n`;
        }
        if (keepClone) {
          summary += `- Clone path: ${report.clonePath}\n`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `${summary}\n---\n\n${report.markdown}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? `Error: ${error.message}`
                  : "Error: Failed to generate public repository report",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_app_builder_flow ───────────────────────────────────────────────

function registerAppBuilderFlow(server: McpServer): void {
  server.tool(
    "evaluate_app_builder_flow",
    "Run a 3-step app-builder workflow: tribunal review, plain-language risk translation, and prioritized remediation tasks with AI-fixable P0/P1 items.",
    {
      code: z.string().optional().describe("Source code to evaluate (use with language for single-file mode)"),
      language: z.string().optional().describe("Programming language for single-file or diff mode"),
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
      changedLines: z.array(z.number()).optional().describe("1-based changed line numbers for diff mode"),
      context: z.string().optional().describe("Optional context about business purpose or constraints"),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      maxFindings: z.number().optional().describe("Maximum number of translated top findings to return (default: 10)"),
      maxTasks: z.number().optional().describe("Maximum number of remediation tasks to return (default: 20)"),
    },
    async ({
      code,
      language,
      files,
      changedLines,
      context,
      includeAstFindings,
      minConfidence,
      maxFindings,
      maxTasks,
    }) => {
      try {
        const result = runAppBuilderWorkflow({
          code,
          language,
          files,
          changedLines,
          context,
          includeAstFindings,
          minConfidence,
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

        return { content: [{ type: "text" as const, text: md }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to run app builder workflow",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_project ────────────────────────────────────────────────────────

function registerEvaluateProject(server: McpServer): void {
  server.tool(
    "evaluate_project",
    `Submit multiple files for project-level analysis. All ${JUDGES.length} judges evaluate each file, plus cross-file architectural analysis detects issues like code duplication, inconsistent error handling, and dependency cycles.`,
    {
      files: z
        .array(
          z.object({
            path: z.string().describe("Relative file path"),
            content: z.string().describe("File content"),
            language: z.string().describe("Programming language"),
          }),
        )
        .describe("Array of project files to analyze"),
      context: z.string().optional().describe("Optional context about the project"),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      config: configSchema,
    },
    async ({ files, context, includeAstFindings, minConfidence, config }) => {
      try {
        const result = evaluateProject(files, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
        });

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

        return { content: [{ type: "text" as const, text: md }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate project",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_diff ───────────────────────────────────────────────────────────

function registerEvaluateDiff(server: McpServer): void {
  server.tool(
    "evaluate_diff",
    `Evaluate only the changed lines in a code diff. Runs all ${JUDGES.length} judges on the full file but filters findings to only those affecting the specified changed lines. Ideal for PR reviews and incremental analysis.`,
    {
      code: z.string().describe("The full file content (post-change)"),
      language: z.string().describe("The programming language"),
      changedLines: z.array(z.number()).describe("Array of 1-based line numbers that were changed (added or modified)"),
      context: z.string().optional().describe("Optional context about the change"),
      includeAstFindings: z.boolean().optional().describe("Include AST/code-structure findings (default: true)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include (0-1, default: 0)"),
      config: configSchema,
    },
    async ({ code, language, changedLines, context, includeAstFindings, minConfidence, config }) => {
      try {
        const result = evaluateDiff(code, language, changedLines, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
        });

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

        return { content: [{ type: "text" as const, text: md }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate diff",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── analyze_dependencies ────────────────────────────────────────────────────

function registerAnalyzeDependencies(server: McpServer): void {
  server.tool(
    "analyze_dependencies",
    "Analyze a PACKAGE MANAGER manifest file (NOT infrastructure code) for supply-chain risks, version pinning issues, typosquatting indicators, and dependency hygiene. ONLY accepts: package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, .csproj. Do NOT use this for Bicep, Terraform, ARM templates, CloudFormation, Dockerfiles, or any other infrastructure/deployment configuration — use evaluate_code or evaluate_code_single_judge for those.",
    {
      manifest: z.string().describe("The full content of the manifest file"),
      manifestType: z
        .enum(["package.json", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "csproj"])
        .describe("The type of manifest file"),
    },
    async ({ manifest, manifestType }) => {
      try {
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

        return { content: [{ type: "text" as const, text: md }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to analyze dependencies",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── benchmark_gate ──────────────────────────────────────────────────────────

function registerBenchmarkGate(server: McpServer): void {
  server.tool(
    "benchmark_gate",
    "Run the benchmark suite and check results against quality thresholds. Returns pass/fail with metric details including F1, precision, recall, and detection rate. Use in CI pipelines to prevent quality regressions.",
    {
      minF1: z.number().min(0).max(1).optional().describe("Minimum F1 score (0-1, default: 0.6)"),
      minPrecision: z.number().min(0).max(1).optional().describe("Minimum precision (0-1, default: 0.5)"),
      minRecall: z.number().min(0).max(1).optional().describe("Minimum recall (0-1, default: 0.5)"),
      minDetectionRate: z.number().min(0).max(1).optional().describe("Minimum detection rate (0-1, default: 0.5)"),
    },
    async (params) => {
      const gate = benchmarkGate({
        minF1: params.minF1,
        minPrecision: params.minPrecision,
        minRecall: params.minRecall,
        minDetectionRate: params.minDetectionRate,
      });

      const report = formatBenchmarkReport(gate.result);
      const status = gate.passed ? "✅ PASSED" : "❌ FAILED";
      const failureSection =
        gate.failures.length > 0 ? `\n\n**Failures:**\n${gate.failures.map((f) => `- ${f}`).join("\n")}` : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `# Benchmark Gate: ${status}${failureSection}\n\n${report}`,
          },
        ],
      };
    },
  );
}

// ─── evaluate_batch ──────────────────────────────────────────────────────────

function registerEvaluateBatch(server: McpServer): void {
  server.tool(
    "evaluate_batch",
    "Evaluate multiple code files in a single call. Returns per-file verdicts with scores and findings, plus aggregate statistics.",
    {
      files: z
        .array(
          z.object({
            path: z.string().describe("File path or name"),
            code: z.string().describe("Source code content"),
            language: z.string().describe("Programming language"),
          }),
        )
        .describe("Array of files to evaluate"),
      config: configSchema.optional(),
    },
    async (params) => {
      const config = params.config ? toJudgesConfig(params.config) : undefined;
      const options = config ? { config } : undefined;

      // Use bounded-concurrency parallel evaluation instead of sequential loop
      const batchResults = await evaluateFilesBatch(params.files, 4, options);

      const results = batchResults.map((r) => {
        const criticals = r.verdict.findings.filter((f) => f.severity === "critical").length;
        return {
          path: r.path,
          score: r.verdict.overallScore,
          findingCount: r.verdict.findings.length,
          criticalCount: criticals,
        };
      });

      const allFindings: string[] = batchResults
        .filter((r) => r.verdict.findings.length > 0)
        .map((r) => {
          const findings = r.verdict.findings;
          return (
            `### ${r.path} (${r.verdict.overallScore}/100, ${findings.length} findings)\n` +
            findings
              .slice(0, 10)
              .map((f) => `- **[${f.severity.toUpperCase()}]** \`${f.ruleId}\`: ${f.title}`)
              .join("\n") +
            (findings.length > 10 ? `\n- ... and ${findings.length - 10} more` : "")
          );
        });

      const totalFindings = results.reduce((s, r) => s + r.findingCount, 0);
      const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
      const totalCriticals = results.reduce((s, r) => s + r.criticalCount, 0);

      const summary =
        `# Batch Evaluation Results\n\n` +
        `**Files:** ${results.length}  |  **Avg Score:** ${avgScore}/100  |  ` +
        `**Total Findings:** ${totalFindings}  |  **Critical:** ${totalCriticals}\n\n` +
        `| File | Score | Findings | Critical |\n|------|-------|----------|----------|\n` +
        results.map((r) => `| ${r.path} | ${r.score} | ${r.findingCount} | ${r.criticalCount} |`).join("\n") +
        "\n\n" +
        allFindings.join("\n\n");

      return {
        content: [{ type: "text" as const, text: summary }],
      };
    },
  );
}
