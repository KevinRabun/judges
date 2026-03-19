// ─── Workflow & Project Tool Handlers ─────────────────────────────────────────
// MCP tool handlers for multi-file project analysis, diff review, app builder
// workflow, public repo reports, and dependency analysis.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { JUDGES } from "../judges/index.js";
import {
  evaluateProject,
  evaluateDiff,
  analyzeDependencies,
  runAppBuilderWorkflow,
  evaluateWithTribunal,
  enrichWithPatches,
  formatVerdictAsMarkdown,
} from "../evaluators/index.js";
import { evaluateFilesBatch } from "../api.js";
import { getGlobalSession } from "../evaluation-session.js";
import { generatePublicRepoReport } from "../reports/public-repo-report.js";
import { evaluateGitDiff, evaluateUnifiedDiff } from "../git-diff.js";
import { configSchema, toJudgesConfig } from "./schemas.js";
import { validateCodeSize } from "./validation.js";
import type { Finding, JudgesConfig } from "../types.js";
import {
  benchmarkGate,
  formatBenchmarkReport,
  formatBenchmarkMarkdown,
  runBenchmarkSuite,
} from "../commands/benchmark.js";

/**
 * Register workflow-focused tools: evaluate_public_repo_report, evaluate_project,
 * evaluate_diff, evaluate_app_builder_flow, and analyze_dependencies.
 */
export function registerWorkflowTools(server: McpServer): void {
  registerPublicRepoReport(server);
  registerAppBuilderFlow(server);
  registerEvaluateProject(server);
  registerEvaluateDiff(server);
  registerEvaluateGitDiff(server);
  registerAnalyzeDependencies(server);
  registerBenchmarkGate(server);
  registerBenchmarkDashboard(server);
  registerEvaluateBatch(server);
  registerEvaluateThenFix(server);
  registerEvaluateFocused(server);
  registerSessionStatus(server);
  registerRecordFeedback(server);
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
        await server.sendLoggingMessage({
          level: "info",
          data: `Cloning repository: ${repoUrl}${branch ? ` (branch: ${branch})` : ""}...`,
        });
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

        const structured = {
          repoUrl,
          overallVerdict: report.overallVerdict,
          averageScore: report.averageScore,
          analyzedFileCount: report.analyzedFileCount,
          totalFindings: report.totalFindings,
          outputPath: report.outputPath ?? null,
        };

        return {
          content: [
            { type: "text" as const, text: `${summary}\n---\n\n${report.markdown}` },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```" },
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

        const structured = {
          mode: result.mode,
          releaseDecision: result.releaseDecision,
          score: result.score,
          verdict: result.verdict,
          criticalCount: result.criticalCount,
          highCount: result.highCount,
          mediumCount: result.mediumCount,
          taskCount: result.tasks.length,
          aiFixableCount: result.aiFixableNow.length,
          findings: result.plainLanguageFindings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            whatIsWrong: f.whatIsWrong,
            nextAction: f.nextAction,
          })),
          tasks: result.tasks.map((t) => ({
            priority: t.priority,
            owner: t.owner,
            effort: t.effort,
            ruleId: t.ruleId,
            task: t.task,
          })),
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
        await server.sendLoggingMessage({
          level: "info",
          data: `Evaluating ${files.length} files with ${JUDGES.length} judges...`,
        });
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

        const structured = {
          overallScore: result.overallScore,
          overallVerdict: result.overallVerdict,
          fileCount: result.fileResults.length,
          criticalCount: result.criticalCount,
          highCount: result.highCount,
          fileResults: result.fileResults.map((fr) => ({
            path: fr.path,
            language: fr.language,
            score: fr.score,
            findingCount: fr.findings.length,
            findings: fr.findings.map((f) => ({
              ruleId: f.ruleId,
              severity: f.severity,
              title: f.title,
              line: f.lineNumbers?.[0],
            })),
          })),
          architecturalFindings: result.architecturalFindings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            description: f.description,
          })),
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
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
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

        const structured = {
          score: result.score,
          verdict: result.verdict,
          linesAnalyzed: result.linesAnalyzed,
          findingCount: result.findings.length,
          findings: result.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            lineNumbers: f.lineNumbers,
          })),
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

        const structured = {
          manifestType,
          score: result.score,
          verdict: result.verdict,
          totalDependencies: result.totalDependencies,
          findingCount: result.findings.length,
          findings: result.findings.map((f) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
          })),
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

// ─── run_benchmark (dashboard) ───────────────────────────────────────────────

function registerBenchmarkDashboard(server: McpServer): void {
  const judgeIds = JUDGES.map((j) => j.id);

  server.tool(
    "run_benchmark",
    "Run the full benchmark suite and return a detailed dashboard with per-judge, per-category, and per-difficulty breakdowns. Includes precision, recall, F1, false positive rates, and individual case results. Use this to understand overall system quality and identify weak spots.",
    {
      judgeId: z
        .string()
        .optional()
        .describe(`Optional: restrict benchmark to a single judge. One of: ${judgeIds.join(", ")}`),
      format: z
        .enum(["markdown", "json", "summary"])
        .optional()
        .describe(
          "Output format: markdown (full report), json (raw data), summary (key metrics only). Default: markdown",
        ),
    },
    async ({ judgeId, format }) => {
      try {
        const result = runBenchmarkSuite(undefined, judgeId);
        const outputFormat = format || "markdown";

        if (outputFormat === "json") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        if (outputFormat === "summary") {
          const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
          const grade =
            result.f1Score >= 0.9
              ? "A"
              : result.f1Score >= 0.8
                ? "B"
                : result.f1Score >= 0.7
                  ? "C"
                  : result.f1Score >= 0.6
                    ? "D"
                    : "F";

          const lines: string[] = [];
          lines.push(`# Benchmark Summary — Grade ${grade}`);
          lines.push("");
          lines.push(`| Metric | Value |`);
          lines.push(`|--------|-------|`);
          lines.push(`| Test Cases | ${result.totalCases} |`);
          lines.push(`| Detection Rate | ${pct(result.detectionRate)} |`);
          lines.push(`| Precision | ${pct(result.precision)} |`);
          lines.push(`| Recall | ${pct(result.recall)} |`);
          lines.push(`| F1 Score | ${pct(result.f1Score)} |`);
          lines.push(`| True Positives | ${result.truePositives} |`);
          lines.push(`| False Positives | ${result.falsePositives} |`);
          lines.push(`| False Negatives | ${result.falseNegatives} |`);

          if (judgeId) {
            lines.push(`\n*Filtered to judge: ${judgeId}*`);
          }

          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
          };
        }

        // Full markdown dashboard
        const report = formatBenchmarkMarkdown(result);
        return {
          content: [{ type: "text" as const, text: report }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to run benchmark",
            },
          ],
          isError: true,
        };
      }
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

      await server.sendLoggingMessage({ level: "info", data: `Batch evaluation: ${params.files.length} files...` });

      // Use bounded-concurrency parallel evaluation instead of sequential loop
      const batchResults = await evaluateFilesBatch(params.files, 4, options, (completed, total) => {
        server
          .sendLoggingMessage({ level: "info", data: `Progress: ${completed}/${total} files evaluated` })
          .catch(() => {});
      });

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

      const structured = {
        fileCount: results.length,
        averageScore: avgScore,
        totalFindings,
        totalCriticals,
        files: results,
      };

      return {
        content: [
          { type: "text" as const, text: summary },
          { type: "text" as const, text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```" },
        ],
      };
    },
  );
}

// ─── evaluate_then_fix ───────────────────────────────────────────────────────

function registerEvaluateThenFix(server: McpServer): void {
  server.tool(
    "evaluate_then_fix",
    "Evaluate code and automatically generate fix patches for all findings that have auto-fix support. Returns the evaluation verdict alongside ready-to-apply patches. Use this for a single-step 'review + fix' workflow.",
    {
      code: z.string().describe("The source code to evaluate and fix."),
      language: z.string().describe("The programming language (e.g., 'typescript', 'python')."),
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
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
        const session = getGlobalSession();

        // Step 1: Evaluate
        const verdict = evaluateWithTribunal(code, language, context, {
          includeAstFindings,
          minConfidence,
          config: toJudgesConfig(config),
          adaptiveSelection: true,
        });

        // Step 2: Generate fix patches for all findings
        const patchedFindings = enrichWithPatches(verdict.findings, code);

        session.recordEvaluation(context ?? `<inline:${language}>`, code, verdict);

        const patchableFindings = patchedFindings.filter((f) => f.patch);
        const patchCount = patchableFindings.length;

        let md = `# Evaluate & Fix Results\n\n`;
        md += `**Score:** ${verdict.overallScore}/100 | **Verdict:** ${verdict.overallVerdict.toUpperCase()}\n`;
        md += `**Total Findings:** ${verdict.findings.length} | **Auto-fixable:** ${patchCount}\n\n`;

        if (patchCount > 0) {
          md += `## Auto-Fix Patches\n\n`;
          md += `The following findings have auto-fix patches ready to apply:\n\n`;
          for (const f of patchableFindings.slice(0, 20)) {
            md += `### ${f.ruleId}: ${f.title}\n`;
            md += `- **Severity:** ${f.severity} | **Lines:** ${f.lineNumbers?.join(", ") ?? "N/A"}\n`;
            md += `- **Fix:**\n\`\`\`diff\n`;
            if (f.patch?.oldText) md += `- ${f.patch.oldText}\n`;
            if (f.patch?.newText) md += `+ ${f.patch.newText}\n`;
            md += `\`\`\`\n\n`;
          }
          if (patchableFindings.length > 20) {
            md += `> ... and ${patchableFindings.length - 20} more auto-fixable findings\n\n`;
          }
        }

        md += formatVerdictAsMarkdown(verdict);

        const structuredData = {
          score: verdict.overallScore,
          verdict: verdict.overallVerdict,
          totalFindings: verdict.findings.length,
          autoFixable: patchCount,
          patches: patchableFindings.slice(0, 50).map((f: Finding) => ({
            ruleId: f.ruleId,
            severity: f.severity,
            title: f.title,
            lineNumbers: f.lineNumbers,
            oldText: f.patch?.oldText,
            newText: f.patch?.newText,
          })),
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
              text: error instanceof Error ? `Error: ${error.message}` : "Error: evaluate_then_fix failed",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── evaluate_focused ────────────────────────────────────────────────────────

function registerEvaluateFocused(server: McpServer): void {
  server.tool(
    "evaluate_focused",
    "Run a focused evaluation using only the specified judges. Use this after an initial full evaluation to re-check specific areas — for example, re-run only 'cybersecurity' and 'authentication' judges after applying security fixes. Much faster than a full tribunal evaluation.",
    {
      code: z.string().describe("The source code to evaluate."),
      language: z.string().describe("The programming language (e.g., 'typescript', 'python')."),
      judgeIds: z
        .array(z.string())
        .min(1)
        .describe("Array of judge IDs to run (e.g., ['cybersecurity', 'authentication', 'data-sovereignty'])"),
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
    async ({ code, language, judgeIds, context, includeAstFindings, minConfidence, config }) => {
      try {
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
        const cfgObj = toJudgesConfig(config);
        // Build a config that disables all judges EXCEPT the focused ones
        const allJudgeIds = JUDGES.map((j) => j.id);
        const focusedSet = new Set(judgeIds);
        const disabledJudges = allJudgeIds.filter((id) => !focusedSet.has(id));

        const mergedConfig = cfgObj
          ? { ...cfgObj, disabledJudges: [...(cfgObj.disabledJudges ?? []), ...disabledJudges] }
          : ({ disabledJudges } as JudgesConfig);

        const verdict = evaluateWithTribunal(code, language, context, {
          includeAstFindings,
          minConfidence,
          config: mergedConfig,
        });

        let md = `# Focused Evaluation (${judgeIds.length} judges)\n\n`;
        md += `**Judges:** ${judgeIds.join(", ")}\n`;
        md += `**Score:** ${verdict.overallScore}/100 | **Verdict:** ${verdict.overallVerdict.toUpperCase()}\n`;
        md += `**Findings:** ${verdict.findings.length}\n\n`;
        md += formatVerdictAsMarkdown(verdict);

        const structuredData = {
          focusedJudges: judgeIds,
          score: verdict.overallScore,
          verdict: verdict.overallVerdict,
          findingCount: verdict.findings.length,
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
            { type: "text" as const, text: md },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structuredData, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Focused evaluation failed",
            },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── session_status ──────────────────────────────────────────────────────────

function registerSessionStatus(server: McpServer): void {
  server.tool(
    "session_status",
    "Get the current evaluation session status — how many evaluations have been run, detected frameworks, verdict history per file, and stability indicators. Useful for understanding what the tribunal has already reviewed.",
    {},
    async () => {
      const session = getGlobalSession();
      const ctx = session.getContext();

      const filesEvaluated = [...ctx.verdictHistory.entries()].map(([file, history]) => ({
        file,
        evaluations: history.length,
        latestScore: history[history.length - 1]?.score ?? 0,
        stable: session.isVerdictStable(file),
      }));

      let md = `# Evaluation Session Status\n\n`;
      md += `**Evaluations:** ${ctx.evaluationCount}\n`;
      md += `**Started:** ${ctx.startedAt}\n`;
      md += `**Detected Frameworks:** ${ctx.frameworks.length > 0 ? ctx.frameworks.join(", ") : "None yet"}\n`;
      md += `**Capabilities:** ${ctx.capabilities.size > 0 ? [...ctx.capabilities].join(", ") : "None yet"}\n\n`;

      if (filesEvaluated.length > 0) {
        md += `## Files Evaluated\n\n`;
        md += `| File | Evals | Latest Score | Stable |\n`;
        md += `|------|-------|--------------|--------|\n`;
        for (const f of filesEvaluated) {
          md += `| ${f.file} | ${f.evaluations} | ${f.latestScore}/100 | ${f.stable ? "Yes" : "No"} |\n`;
        }
      }

      const feedbackTally = [...session.getFeedbackTally().entries()];
      if (feedbackTally.length > 0) {
        md += `\n## Feedback Tally\n\n`;
        md += `| Rule | TP | FP | Won't Fix |\n`;
        md += `|------|----|----|----------|\n`;
        for (const [rule, counts] of feedbackTally) {
          md += `| ${rule} | ${counts.tp} | ${counts.fp} | ${counts.wontfix} |\n`;
        }
      }

      return {
        content: [
          { type: "text" as const, text: md },
          {
            type: "text" as const,
            text:
              "```json\n" +
              JSON.stringify(
                {
                  evaluationCount: ctx.evaluationCount,
                  startedAt: ctx.startedAt,
                  frameworks: ctx.frameworks,
                  capabilities: [...ctx.capabilities],
                  filesEvaluated,
                  feedbackTally: Object.fromEntries(feedbackTally),
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

// ─── record_feedback ─────────────────────────────────────────────────────────

function registerRecordFeedback(server: McpServer): void {
  server.tool(
    "record_feedback",
    "Record user feedback on a finding — mark it as a true positive (tp), false positive (fp), or won't fix (wontfix). This feedback calibrates confidence scores in subsequent evaluations during the current session, reducing noise from rules the user considers inaccurate.",
    {
      ruleId: z.string().describe("The rule ID of the finding (e.g., 'SEC-001', 'AUTH-003')."),
      verdict: z
        .enum(["tp", "fp", "wontfix"])
        .describe(
          "The feedback verdict: tp (true positive), fp (false positive), wontfix (acknowledged but won't fix).",
        ),
    },
    async ({ ruleId, verdict }) => {
      const session = getGlobalSession();
      session.recordFeedback(ruleId, verdict);

      const penalty = session.getConfidencePenalty(ruleId);
      const penaltyPct = Math.round(penalty * 100);

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Feedback recorded: **${ruleId}** → **${verdict}**\n\n` +
              `Current confidence multiplier for ${ruleId}: **${penaltyPct}%**\n` +
              (verdict === "fp" ? `Future findings for this rule will have reduced confidence in this session.` : ``),
          },
        ],
      };
    },
  );
}

// ─── evaluate_git_diff ───────────────────────────────────────────────────────

function registerEvaluateGitDiff(server: McpServer): void {
  server.tool(
    "evaluate_git_diff",
    "Evaluate code changes from a git diff. Parses the unified diff from a git repository, identifies changed files and lines, and runs the full tribunal on each changed file — filtering findings to only those on changed lines. Supports both live git repos (provide repoPath + base ref) and pre-computed diffs (provide diffText).",
    {
      repoPath: z
        .string()
        .optional()
        .describe("Absolute path to the git repository. Required when not providing diffText."),
      base: z
        .string()
        .optional()
        .describe("Git ref to diff against (e.g., 'main', 'HEAD~1', 'origin/main'). Default: 'HEAD~1'"),
      diffText: z
        .string()
        .optional()
        .describe("Pre-computed unified diff text. When provided, repoPath is used only for reading file contents."),
      confidenceFilter: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence threshold for findings (default: no filter)"),
      autoTune: z
        .boolean()
        .optional()
        .describe("Apply feedback-driven auto-tuning to reduce false positives (default: false)"),
      config: configSchema,
    },
    async ({ repoPath, base, diffText, confidenceFilter, autoTune, config }) => {
      try {
        const evalOptions = {
          confidenceFilter,
          autoTune,
          config: toJudgesConfig(config),
        };

        let result;
        if (diffText) {
          result = evaluateUnifiedDiff(diffText, repoPath ?? ".", evalOptions);
        } else if (repoPath) {
          result = evaluateGitDiff(repoPath, base ?? "HEAD~1", evalOptions);
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide either `repoPath` (for live git diff) or `diffText` (for pre-computed diff).",
              },
            ],
            isError: true,
          };
        }

        let md = `# Git Diff Analysis\n\n`;
        md += `**Files changed:** ${result.files.length}\n`;
        md += `**Total findings:** ${result.totalFindings}\n\n`;

        for (const file of result.files) {
          md += `## ${file.filePath}\n`;
          md += `**Verdict:** ${file.verdict.verdict} · **Score:** ${file.verdict.score}/100 · `;
          md += `**Changed lines:** ${file.verdict.linesAnalyzed} · **Findings:** ${file.verdict.findings.length}\n\n`;

          if (file.verdict.findings.length > 0) {
            for (const f of file.verdict.findings) {
              const conf =
                f.confidence !== undefined && f.confidence !== null ? ` (${Math.round(f.confidence * 100)}%)` : "";
              md += `- **${f.ruleId}** ${f.severity}${conf}: ${f.title}`;
              if (f.lineNumbers && f.lineNumbers.length > 0) {
                md += ` (L${f.lineNumbers.join(", L")})`;
              }
              md += `\n`;
            }
            md += `\n`;
          }
        }

        const structured = {
          filesAnalyzed: result.files.length,
          totalFindings: result.totalFindings,
          fileVerdicts: result.files.map(
            (fv: {
              filePath: string;
              language: string;
              verdict: {
                verdict: string;
                score: number;
                linesAnalyzed: number;
                findings: Array<{
                  ruleId: string;
                  severity: string;
                  confidence?: number;
                  title: string;
                  lineNumbers?: number[];
                }>;
              };
            }) => ({
              filePath: fv.filePath,
              verdict: fv.verdict.verdict,
              score: fv.verdict.score,
              changedLineCount: fv.verdict.linesAnalyzed,
              findingCount: fv.verdict.findings.length,
              findings: fv.verdict.findings.map(
                (f: {
                  ruleId: string;
                  severity: string;
                  confidence?: number;
                  title: string;
                  lineNumbers?: number[];
                }) => ({
                  ruleId: f.ruleId,
                  severity: f.severity,
                  confidence: f.confidence,
                  title: f.title,
                  lineNumbers: f.lineNumbers,
                }),
              ),
            }),
          ),
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
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to evaluate git diff",
            },
          ],
          isError: true,
        };
      }
    },
  );
}
