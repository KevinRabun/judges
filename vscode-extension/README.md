# Judges Panel — VS Code Extension

Install one extension. Get **35 specialized judges** reviewing every file you save — inline diagnostics, quick-fix patches, and **automatic MCP server integration** so Copilot and other LLMs can act as 35 expert reviewers with zero configuration.

## Features

- **Evaluate on save** — automatically runs the full 35-judge tribunal when you save a file
- **Inline diagnostics** — findings appear as squiggly underlines with severity-colored markers
- **Quick-fix code actions** — click the lightbulb to apply auto-fix patches directly
- **Auto-configured MCP server** — the 35 expert-persona LLM prompts are registered with VS Code automatically; Copilot can use them immediately
- **Workspace evaluation** — evaluate all supported files with progress reporting
- **Status bar** — one-click evaluation from the status bar shield icon
- **Configurable** — choose presets, severity filters, and specific judges

## Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++

## Commands

| Command | Description |
|---------|-------------|
| `Judges: Evaluate Current File` | Run the full tribunal on the active file |
| `Judges: Auto-Fix Current File` | Apply all available auto-fix patches |
| `Judges: Evaluate Workspace` | Evaluate all supported files in the workspace |
| `Judges: Clear Diagnostics` | Remove all Judges diagnostics |
| `Judges: Show Results Panel` | Open the Judges results view |
| `Judges: Configure MCP Server` | Write MCP server definition to `.vscode/mcp.json` (manual alternative to auto-config) |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `judges.evaluateOnSave` | `true` | Automatically evaluate on file save |
| `judges.preset` | `""` | Named preset: strict, lenient, security-only, etc. |
| `judges.minSeverity` | `"medium"` | Minimum severity to display |
| `judges.enabledJudges` | `[]` | Restrict to specific judge IDs |
| `judges.debounceMs` | `1000` | Debounce delay for on-save evaluation |

## Installation

### From VS Code Marketplace (recommended)

Search for **"Judges Panel"** in the Extensions view (`Ctrl+Shift+X`) or run:

```bash
code --install-extension kevinrabun.judges-panel
```

That's it — Layer 1 (deterministic evaluation) and Layer 2 (MCP server for LLM-powered review) are both enabled automatically.

### From Source (Development)

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### From VSIX

```bash
cd vscode-extension
npx @vscode/vsce package
code --install-extension judges-panel-*.vsix
```

## How It Works

The extension provides **both layers** of the Judges evaluation system with zero configuration:

### Layer 1 — Deterministic Evaluation (instant, local)

Runs **locally in the extension host** — no network calls, no API keys, instant results:

- **Pattern matching** against 400+ security, quality, and compliance rules
- **AST analysis** via tree-sitter WASM for 8 languages
- **Auto-fix patches** for 47+ common issues

### Layer 2 — LLM-Powered Deep Review (enabled automatically)

The extension **automatically registers the Judges MCP server** with VS Code on activation. Copilot and other LMs see all 35 expert-persona prompts immediately — no `.vscode/mcp.json`, no `npx` commands, no manual setup of any kind.

What this means in practice: ask Copilot to "review this file with the Judges cybersecurity expert" and it can — because the MCP server is already running.

If you prefer explicit workspace-level config (e.g., to share with teammates who don't have the extension), run **Judges: Configure MCP Server** to write the server definition to `.vscode/mcp.json`.

## License

MIT
