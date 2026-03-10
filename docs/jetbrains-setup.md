# JetBrains IDE Integration

Judges exposes 21 MCP tools via stdio transport, making it compatible with any JetBrains IDE that supports the Model Context Protocol (IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, etc.).

## Prerequisites

- JetBrains IDE 2025.1+ with AI Assistant plugin
- Node.js 18+
- `@kevinrabun/judges` installed globally or in your project

## Setup

### Option 1: Global Installation

```bash
npm install -g @kevinrabun/judges
```

Add to your JetBrains MCP configuration (`Settings → Tools → AI Assistant → MCP Servers`):

```json
{
  "servers": {
    "judges": {
      "command": "npx",
      "args": ["-y", "@kevinrabun/judges@latest"],
      "type": "stdio"
    }
  }
}
```

### Option 2: Project-Level Configuration

Create `.mcp.json` in your project root:

```json
{
  "servers": {
    "judges": {
      "command": "npx",
      "args": ["-y", "@kevinrabun/judges@latest"],
      "type": "stdio"
    }
  }
}
```

JetBrains IDEs auto-detect `.mcp.json` files in the project root.

## Available MCP Tools

Once connected, the following tools are available to the AI Assistant:

| Tool | Description |
|------|-------------|
| `judges_evaluate` | Evaluate code with the full 45-judge tribunal |
| `judges_evaluate_project` | Evaluate an entire project directory |
| `judges_evaluate_diff` | Evaluate only changed lines in a diff |
| `judges_list` | List all available judges |
| `judges_benchmark` | Run the benchmark suite |

See the [API Reference](api-reference.md) for the complete tool list and parameters.

## Configuration

Place a `.judgesrc` file in your project root to customize behavior:

```json
{
  "preset": "strict",
  "judges": {
    "enabled": ["*"],
    "disabled": []
  },
  "minConfidence": 0.7,
  "maxFindingsPerFile": 20
}
```

## Usage with AI Assistant

Once configured, you can ask the AI Assistant to use judges directly:

- "Evaluate this file for security issues"
- "Run judges on the current file"
- "Review this code for vulnerabilities"
- "Evaluate the diff for this PR"

The AI Assistant will automatically invoke the appropriate judges MCP tool.

## Troubleshooting

**Server not found:** Ensure `npx @kevinrabun/judges` runs successfully from the terminal.

**No tools listed:** Restart the MCP server from `Settings → Tools → AI Assistant → MCP Servers`.

**Timeout errors:** Judges evaluation is CPU-bound. For large files, increase the MCP timeout in settings.
