// ─── MCP Tool Registration Orchestrator ──────────────────────────────────────
// Thin coordinator that delegates to domain-specific tool modules.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEvaluationTools } from "./register-evaluation.js";
import { registerWorkflowTools } from "./register-workflow.js";
import { registerFixTools } from "./register-fix.js";
import { registerWorkspaceTools } from "./register-workspace.js";
import { registerReviewTools } from "./register-review.js";
import { registerScaffoldTools } from "./register-scaffold.js";

/**
 * Register all MCP tools on the given server instance.
 * Delegates to focused modules for evaluation, workflow, fix, workspace, review, and scaffold tools.
 */
export function registerTools(server: McpServer): void {
  registerEvaluationTools(server);
  registerWorkflowTools(server);
  registerFixTools(server);
  registerWorkspaceTools(server);
  registerReviewTools(server);
  registerScaffoldTools(server);
}
