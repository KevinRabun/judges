#!/usr/bin/env node

/**
 * Judges Panel — MCP Server + CLI
 *
 * When invoked with a subcommand (eval, list, --help), runs as a CLI tool.
 * Otherwise, starts as an MCP stdio server.
 *
 * CLI usage:
 *   judges eval --file src/app.ts                   # evaluate a file
 *   judges eval --file src/app.ts --format sarif     # SARIF output
 *   judges eval --judge cybersecurity server.ts      # single judge
 *   cat file.ts | judges eval --language typescript  # stdin pipe
 *   judges list                                      # list all judges
 *   judges --help                                    # show help
 *
 * MCP usage:
 *   Add to your MCP config (VS Code, Claude Desktop, etc.)
 */

// ─── CLI Detection ──────────────────────────────────────────────────────────
// If the user passed a subcommand or flag, run as CLI instead of MCP server.

const cliCommands = new Set(["eval", "list", "evaluate"]);
const cliFlags = new Set(["--help", "-h", "--file", "-f", "--version", "-v"]);
const firstArg = process.argv[2];

if (firstArg && (cliCommands.has(firstArg) || cliFlags.has(firstArg))) {
  // Dynamic import to avoid loading MCP SDK when running as CLI
  import("./cli.js").then(({ runCli }) => runCli(process.argv));
} else {
  // ─── MCP Server Mode ────────────────────────────────────────────────────

  import("@modelcontextprotocol/sdk/server/mcp.js")
    .then(async ({ McpServer }) => {
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const { registerTools } = await import("./tools/register.js");
      const { registerPrompts } = await import("./tools/prompts.js");

      const server = new McpServer({
        name: "judges",
        version: "3.3.0",
      });

      registerTools(server);
      registerPrompts(server);

      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("Judges Panel MCP server running on stdio");
    })
    .catch((err) => {
      console.error("Failed to start Judges Panel:", err);
      process.exit(1);
    });
}
