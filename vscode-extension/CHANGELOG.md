# Changelog

All notable changes to the **Judges Panel** VS Code extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.2] — 2025-07-17

### Improved

- **Re-Evaluate shows results in chat** — "Re-Evaluate" is now a chat followup instead of a command button, so clicking it runs a fresh `@judges /review` and streams the updated findings directly into the chat window (previously it only showed a toast notification)
- **Context-aware followup** — security reviews offer a "Re-Evaluate" that re-runs `/security`; workspace reviews offer "Re-Evaluate Workspace"
- **Post-fix followup** — after `/fix`, the Re-Evaluate followup lets users immediately see remaining findings in chat

## [0.2.1] — 2025-07-17

### Improved

- **Auto-fix clarity** — review output now tags each finding with 🔧 (auto-fixable) or 📝 (manual review) so users know which findings can be auto-fixed
- **Fixability summary** — header shows counts of auto-fixable vs manual-only findings
- **Dynamic button label** — "Auto-Fix N of M Findings" replaces the former "Auto-Fix All" to set accurate expectations
- **Button hidden when irrelevant** — when no findings are auto-fixable the button is replaced with an explanatory message
- **Post-fix feedback** — `/fix` response now reports how many findings remain for manual review after auto-fixes are applied
- **Help text** — `/fix` description updated to clarify not all findings are auto-fixable

## [0.2.0] — 2025-07-15

### Added

- **`@judges` chat participant** — type `@judges` in Copilot Chat to review, security-check, or auto-fix files directly from chat
- **Chat commands** — `/review`, `/security`, `/fix`, `/help` slash-commands
- **Disambiguation routing** — Copilot auto-routes queries like "judges panel review" or "judges evaluation" to the `@judges` participant without needing the `@` prefix
- **`judges_evaluate` Language Model tool** — registered via `vscode.lm.registerTool` so Copilot can auto-discover and invoke Judges evaluation
- **Domain-focused reviews** — ask `@judges review for performance` or mention security, cost, compliance, etc. to filter findings by domain
- **Action buttons** — chat responses include "Auto-Fix All" and "Re-Evaluate" buttons

## [0.1.0] — 2026-03-01

### Added

- Initial release with 35 specialized judges for AI-generated code review
- Inline diagnostics (squiggly underlines) with severity-coloured markers
- Quick-fix code actions (lightbulb) for auto-fixable findings
- `Judges: Evaluate Current File` command and editor-title button
- `Judges: Auto-Fix Current File` command with bottom-to-top patch application
- `Judges: Evaluate Workspace` command with progress reporting
- `Judges: Clear Diagnostics` command
- Evaluate-on-save with configurable debounce delay
- Status-bar shield icon for one-click evaluation
- Configurable presets: strict, lenient, security-only, startup, compliance, performance
- Minimum-severity filter (critical / high / medium / low / info)
- Per-judge enable/disable via `judges.enabledJudges` setting
- Support for TypeScript, JavaScript, Python, Go, Rust, Java, C#, and C++
