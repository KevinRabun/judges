/**
 * Judges Panel — MCP Server
 */

import("@modelcontextprotocol/sdk/server/mcp.js")
  .then(async ({ McpServer }) => {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { registerTools } = await import("./tools/register.js");
    const { registerPrompts } = await import("./tools/prompts.js");
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");

    let version = "0.0.0";
    try {
      const pkgDir = dirname(fileURLToPath(import.meta.url));
      const pkgPath = resolve(pkgDir, "..", "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      version = pkg.version ?? version;
    } catch {
      // Fallback — should never happen in a published package.
    }

    const server = new McpServer({
      name: "judges",
      version,
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
