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
 *   - get_judges:                 List all available judges
 *   - evaluate_v2:                Context/evidence-aware V2 evaluation
 *   - evaluate_app_builder_flow:  3-step workflow (review, translate, tasks)
 *   - evaluate_public_repo_report: Clone public repo and generate full report
 *   - evaluate_code:              Full panel review (all judges)
 *   - evaluate_code_single_judge: Review by a specific judge
 *   - evaluate_project:           Multi-file project analysis
 *   - evaluate_diff:              Changed-line-only diff analysis
 *   - analyze_dependencies:       Supply-chain manifest analysis
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTools } from "./tools/register.js";
import { registerPrompts } from "./tools/prompts.js";

// ─── Create MCP Server ──────────────────────────────────────────────────────

const server = new McpServer({
  name: "judges",
  version: "2.0.0",
});

// ─── Register Tools & Prompts ────────────────────────────────────────────────

registerTools(server);
registerPrompts(server);

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
