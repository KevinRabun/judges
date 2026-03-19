# JetBrains IDE Integration

Judges exposes 29 MCP tools via stdio transport, making it compatible with any JetBrains IDE that supports the Model Context Protocol (IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, etc.).

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
| `get_judges` | List all available judges with their domains and descriptions |
| `evaluate_code` | Evaluate code with the full 45-judge tribunal |
| `evaluate_code_single_judge` | Evaluate code with a specific judge |
| `evaluate_policy_aware` | V2 context-aware evaluation with policy profiles |
| `evaluate_file` | Evaluate a file from disk with session-aware caching |
| `evaluate_code_streaming` | Streaming evaluation with per-judge breakdown |
| `evaluate_project` | Evaluate an entire project directory |
| `evaluate_diff` | Evaluate only changed lines in a diff |
| `evaluate_public_repo_report` | Clone and analyze a public repository |
| `evaluate_app_builder_flow` | 3-step app builder workflow for release decisions |
| `evaluate_then_fix` | Evaluate and auto-fix in one call |
| `evaluate_focused` | Run a specific subset of judges |
| `evaluate_with_progress` | Evaluate with progress logging |
| `fix_code` | Apply auto-fix patches to findings |
| `analyze_dependencies` | Analyze dependency manifests for supply-chain risks |
| `explain_finding` | Get detailed explanation of a finding |
| `triage_finding` | Triage a finding (accept/dismiss/defer) |
| `get_finding_stats` | Get statistics about findings |
| `get_suppression_analytics` | View suppression analytics |
| `list_triaged_findings` | List all triaged findings |
| `scaffold_judge` | Scaffold a new custom judge |
| `scaffold_plugin` | Scaffold a new plugin |
| `benchmark_gate` | Run benchmark regression gate |
| `run_benchmark` | Run the full benchmark suite |
| `session_status` | View evaluation session state |
| `list_files` | List files in a directory |
| `read_file` | Read a file from disk |

See the [API Reference](api-reference.md) for complete tool parameters.

## Configuration

Place a `.judgesrc.json` file in your project root to customize behavior:

```json
{
  "preset": "strict",
  "disabledJudges": [],
  "minSeverity": "medium",
  "maxFiles": 600
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
