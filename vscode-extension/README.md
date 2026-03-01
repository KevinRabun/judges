# Judges Panel — VS Code Extension

Inline diagnostics, quick-fixes, and one-click evaluation from the **35 specialized judges** that evaluate AI-generated code for security, cost, and quality.

## Features

- **Evaluate on save** — automatically runs the full 35-judge tribunal when you save a file
- **Inline diagnostics** — findings appear as squiggly underlines with severity-colored markers
- **Quick-fix code actions** — click the lightbulb to apply auto-fix patches directly
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

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `judges.evaluateOnSave` | `true` | Automatically evaluate on file save |
| `judges.preset` | `""` | Named preset: strict, lenient, security-only, etc. |
| `judges.minSeverity` | `"medium"` | Minimum severity to display |
| `judges.enabledJudges` | `[]` | Restrict to specific judge IDs |
| `judges.debounceMs` | `1000` | Debounce delay for on-save evaluation |

## Installation

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
code --install-extension judges-panel-0.1.0.vsix
```

## How It Works

The extension bundles `@kevinrabun/judges` and runs the deterministic evaluators (Layer 1) **locally in the extension host** — no network calls, no API keys, instant results. This includes:

- **Pattern matching** against 400+ security, quality, and compliance rules
- **AST analysis** via tree-sitter WASM for 8 languages
- **Auto-fix patches** for 47+ common issues

For Layer 2 (LLM-powered deep review), use the MCP server integration with Copilot, Claude, or Cursor.

## License

MIT
