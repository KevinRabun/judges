# Judges Panel — VS Code Extension

**44 specialized judges evaluate every file you save** — catching security holes, performance traps, and compliance gaps before they reach production.

- **Fewer escaped defects** — critical/high findings surface inline as you type, with one-click auto-fix patches
- **Faster code review** — `@judges` in Copilot Chat delivers a full security + quality verdict in seconds
- **Zero configuration** — install the extension, open a file, save. That's it.

## Try in 60 Seconds

1. Install **Judges Panel** from the Extensions view (`Ctrl+Shift+X`) or run:
   ```
   code --install-extension kevinrabun.judges-panel
   ```
2. Open any supported file and save — findings appear inline immediately.
3. Type `@judges` in Copilot Chat for a deep review with AI-powered contextual analysis.

## Chat Commands — `@judges`

| Command | What it does |
|---------|-------------|
| `@judges` | **Deep review** — Layer 1 pattern analysis + Layer 2 AI contextual review |
| `@judges /review` | Same as above |
| `@judges /deepreview` | Same as above |
| `@judges /shallowreview` | Fast pattern analysis only (no AI) |
| `@judges /security` | Security-focused review |
| `@judges /fix` | Auto-fix all fixable findings |
| `@judges /help` | Show commands and examples |

Natural language works too — Copilot auto-routes these:

- *"Review this file with judges"*
- *"Check this code for security issues"*
- *"Run judges on my workspace"*
- *"Fix the judges findings"*

## Noise Control

| Setting | Default | Effect |
|---------|---------|--------|
| `judges.minSeverity` | `"high"` | Only critical + high findings shown by default |
| `judges.confidenceTier` | `"important"` | Suppresses low-confidence results (< 0.6) |
| `judges.preset` | `""` | Named presets: `strict`, `lenient`, `security-only`, `startup`, `compliance`, `performance` |
| `judges.enabledJudges` | `[]` | Restrict to specific judge IDs (empty = all 39) |
| `judges.exclude` | `[]` | Glob patterns to skip files (e.g., `**/test/**`) |

Start with defaults and tighten or relax as your team's workflow evolves.

## CI Integration

Add Judges to your GitHub Actions pipeline:

```yaml
# .github/workflows/judges.yml
name: Judges
on: [pull_request]
jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: KevinRabun/judges@v3
        with:
          preset: security-only
```

Or run **Judges: Add CI Workflow** from the Command Palette to generate the workflow file automatically.

## All Commands

| Command | Description |
|---------|-------------|
| **Judges: Evaluate Current File** | Run the full 44-judge tribunal on the active file |
| **Judges: Auto-Fix Current File** | Apply all available auto-fix patches |
| **Judges: Evaluate Workspace** | Evaluate all supported files with progress reporting |
| **Judges: Deep Review (Layer 1 + Layer 2)** | Pattern analysis + AI contextual review — opens markdown report |
| **Judges: Refine Findings with AI** | LLM-powered false-positive filtering |
| **Judges: Clear Diagnostics** | Remove all Judges diagnostics |
| **Judges: Show Results Panel** | Open the Judges findings tree view |
| **Judges: Configure MCP Server** | Write `.vscode/mcp.json` for team sharing |

## All Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `judges.evaluateOnSave` | `true` | Evaluate automatically on file save |
| `judges.preset` | `""` | Named preset or comma-separated composition |
| `judges.minSeverity` | `"high"` | Minimum severity level to display |
| `judges.enabledJudges` | `[]` | Restrict to specific judges (empty = all 39) |
| `judges.debounceMs` | `1000` | Debounce delay (ms) for on-save evaluation |
| `judges.exclude` | `[]` | Glob patterns to exclude from workspace evaluation |
| `judges.include` | `[]` | Glob patterns to include in workspace evaluation |
| `judges.maxFiles` | `50` | Maximum files in workspace evaluation |
| `judges.confidenceTier` | `"important"` | Minimum confidence: `essential` (≥0.8), `important` (≥0.6), `supplementary` (all) |

## Supported Languages

TypeScript · JavaScript · Python · Go · Rust · Java · C# · C++ · Terraform · Bicep · PowerShell · PHP · Ruby · Kotlin · Swift

## How It Works

### Layer 1 — Deterministic Evaluation (instant, local)

Runs in the extension host with no network calls:

- 400+ security, quality, and compliance rules
- AST analysis via tree-sitter WASM for 15 languages
- Auto-fix patches for common issues

### Layer 2 — LLM-Powered Deep Review (automatic)

The extension registers a **Judges MCP server** with VS Code on activation. Copilot sees all 44 expert-persona prompts immediately — no manual MCP configuration required.

Ask Copilot *"review this file with the Judges cybersecurity expert"* and it works out of the box.

### Copilot Integration

- **`@judges` chat participant** — routes commands and natural-language requests
- **`judges_evaluate` LM tool** — Copilot auto-discovers and invokes when you mention code review or evaluation

To share MCP config with teammates who don't have the extension, run **Judges: Configure MCP Server** to write `.vscode/mcp.json`.

## Installation

### Marketplace (recommended)

```
code --install-extension kevinrabun.judges-panel
```

### From Source

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

### From VSIX

```bash
cd vscode-extension
npx @vscode/vsce package
code --install-extension judges-panel-*.vsix
```

## License

MIT
