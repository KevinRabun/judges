// ─── Fix Tool Handler ─────────────────────────────────────────────────────────
// MCP tool handler for auto-fixing code by evaluating it, collecting findings
// with patches, and applying the patches in a single round-trip.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Finding } from "../types.js";
import { evaluateWithTribunal, evaluateWithJudge } from "../evaluators/index.js";
import { getJudge, JUDGES } from "../judges/index.js";
import { applyPatches, type PatchCandidate } from "../commands/fix.js";
import { configSchema, toJudgesConfig } from "./schemas.js";
import { validateCodeSize } from "./validation.js";

/**
 * Register the fix_code tool for one-shot code evaluation + auto-fix.
 */
export function registerFixTools(server: McpServer): void {
  registerFixCode(server);
}

// ─── fix_code ────────────────────────────────────────────────────────────────

function registerFixCode(server: McpServer): void {
  const judgeIds = JUDGES.map((j) => j.id);

  server.tool(
    "fix_code",
    "Evaluate code with the Judges Panel and automatically apply all available auto-fix patches. Returns the fixed code along with a summary of applied and remaining findings. Use this to fix security, performance, and quality issues in a single step.",
    {
      code: z.string().describe("The source code to evaluate and fix. Include the full file content."),
      language: z
        .string()
        .describe(
          "The programming language of the code (e.g., 'typescript', 'python', 'javascript', 'csharp', 'java').",
        ),
      judgeId: z
        .string()
        .optional()
        .describe(`Optional: restrict fixes to a single judge. One of: ${judgeIds.join(", ")}`),
      context: z
        .string()
        .optional()
        .describe("Optional additional context about the code — e.g., what the code does, which framework it uses."),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum finding confidence to include fixes for (0-1, default: 0.5)"),
      config: configSchema,
    },
    async ({ code, language, judgeId, context, minConfidence, config }) => {
      try {
        const sizeError = validateCodeSize(code);
        if (sizeError) {
          return { content: [{ type: "text" as const, text: `Error: ${sizeError}` }], isError: true };
        }
        const effectiveMinConfidence = minConfidence ?? 0.5;

        // ── Evaluate ────────────────────────────────────────────────
        let allFindings: Finding[];

        if (judgeId) {
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
            minConfidence: effectiveMinConfidence,
            config: toJudgesConfig(config),
          });
          allFindings = evaluation.findings;
        } else {
          const verdict = evaluateWithTribunal(code, language, context, {
            minConfidence: effectiveMinConfidence,
            config: toJudgesConfig(config),
          });
          allFindings = verdict.evaluations.flatMap((e) => e.findings);
        }

        // ── Collect fixable findings ────────────────────────────────
        const fixable: PatchCandidate[] = allFindings
          .filter((f) => f.patch && (f.confidence ?? 1) >= effectiveMinConfidence)
          .map((f) => ({
            ruleId: f.ruleId,
            title: f.title,
            severity: f.severity,
            patch: f.patch!,
            lineNumbers: f.lineNumbers,
          }));

        if (fixable.length === 0) {
          const remaining = allFindings.filter((f) => !f.patch);
          let text = `# Fix Results\n\n**No auto-fixable findings** detected.\n\n`;
          if (remaining.length > 0) {
            text += `### Remaining Findings (${remaining.length}, no auto-fix available)\n\n`;
            for (const f of remaining.slice(0, 20)) {
              const conf =
                f.confidence !== null && f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}%)` : "";
              text += `- **${f.severity.toUpperCase()}** \`${f.ruleId}\`: ${f.title}${conf}\n`;
            }
            if (remaining.length > 20) {
              text += `- … and ${remaining.length - 20} more\n`;
            }
          } else {
            text += "_No findings at all — code looks good!_\n";
          }
          text += `\n\`\`\`${language}\n${code}\n\`\`\`\n`;

          return {
            content: [{ type: "text" as const, text }],
          };
        }

        // ── Apply patches ───────────────────────────────────────────
        const { result: fixedCode, applied, skipped } = applyPatches(code, fixable);

        // ── Build summary ───────────────────────────────────────────
        const remaining = allFindings.filter(
          (f) => !f.patch || !fixable.some((p) => p.ruleId === f.ruleId && p.patch.startLine === f.patch!.startLine),
        );

        let text = `# Fix Results\n\n`;
        text += `| Metric | Count |\n|--------|-------|\n`;
        text += `| Total findings | ${allFindings.length} |\n`;
        text += `| Auto-fixable | ${fixable.length} |\n`;
        text += `| Fixes applied | ${applied} |\n`;
        text += `| Fixes skipped | ${skipped} |\n`;
        text += `| Remaining | ${remaining.length} |\n\n`;

        if (applied > 0) {
          text += `### Applied Fixes\n\n`;
          for (const p of fixable) {
            text += `- **${p.severity.toUpperCase()}** \`${p.ruleId}\`: ${p.title}`;
            text += ` — line ${p.patch.startLine}: \`${p.patch.oldText.slice(0, 60)}\` → \`${p.patch.newText.slice(0, 60)}\`\n`;
          }
          text += `\n`;
        }

        if (remaining.length > 0) {
          text += `### Remaining Findings (manual fix needed)\n\n`;
          for (const f of remaining.slice(0, 15)) {
            const conf =
              f.confidence !== null && f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}%)` : "";
            const line = f.lineNumbers?.[0] ? ` L${f.lineNumbers[0]}` : "";
            text += `- **${f.severity.toUpperCase()}** \`${f.ruleId}\`:${line} ${f.title}${conf}\n`;
            if (f.recommendation) {
              text += `  > ${f.recommendation.slice(0, 120)}\n`;
            }
          }
          if (remaining.length > 15) {
            text += `- … and ${remaining.length - 15} more\n`;
          }
          text += `\n`;
        }

        text += `### Fixed Code\n\n\`\`\`${language}\n${fixedCode}\n\`\`\`\n`;

        const structured = {
          totalFindings: allFindings.length,
          autoFixable: fixable.length,
          applied,
          skipped,
          remaining: remaining.length,
          patches: fixable.map((p) => ({
            ruleId: p.ruleId,
            severity: p.severity,
            title: p.title,
            line: p.patch.startLine,
            oldText: p.patch.oldText,
            newText: p.patch.newText,
          })),
        };

        return {
          content: [
            { type: "text" as const, text },
            { type: "text" as const, text: "```json\n" + JSON.stringify(structured, null, 2) + "\n```" },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? `Error: ${error.message}` : "Error: Failed to fix code",
            },
          ],
          isError: true,
        };
      }
    },
  );
}
