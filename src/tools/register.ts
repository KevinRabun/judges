// ─── MCP Tool Registration Orchestrator ──────────────────────────────────────
// Thin coordinator that delegates to domain-specific tool modules.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEvaluationTools } from "./register-evaluation.js";
import { registerWorkflowTools } from "./register-workflow.js";

/**
 * Register all MCP tools on the given server instance.
 * Delegates to focused modules for evaluation and workflow tools.
 */
export function registerTools(server: McpServer): void {
  registerEvaluationTools(server);
  registerWorkflowTools(server);
}
