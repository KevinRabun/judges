// ─── Shared Zod Schemas for MCP Tool Parameters ─────────────────────────────
// Reusable validation schemas and config helpers shared across tool handlers.
// ──────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { parseConfig } from "../config.js";

/** Reusable Zod schema for inline .judgesrc configuration */
export const configSchema = z
  .object({
    disabledRules: z
      .array(z.string())
      .optional()
      .describe("Rule IDs or prefix wildcards to suppress (e.g. 'COST-*', 'SWDEV-003')"),
    disabledJudges: z
      .array(z.string())
      .optional()
      .describe("Judge IDs to skip entirely (e.g. 'cost-effectiveness', 'accessibility')"),
    minSeverity: z
      .enum(["critical", "high", "medium", "low", "info"])
      .optional()
      .describe("Minimum severity to report — anything below is filtered out"),
    ruleOverrides: z
      .record(
        z.string(),
        z.object({
          disabled: z.boolean().optional(),
          severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
        }),
      )
      .optional()
      .describe("Per-rule overrides keyed by rule ID or prefix wildcard"),
  })
  .optional()
  .describe("Optional inline configuration (same format as .judgesrc)");

/** Safely parse a config object (already validated by Zod) */
export function toJudgesConfig(raw?: z.infer<typeof configSchema>) {
  if (!raw) return undefined;
  try {
    return parseConfig(JSON.stringify(raw));
  } catch {
    return undefined;
  }
}
