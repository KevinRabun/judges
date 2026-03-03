# Changelog

All notable changes to the **Judges Panel** VS Code extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.19.2] — 2026-03-03

### Fixed
- **IaC security FP fix** — Bicep resource-name parameters (`keyVaultName`, `secretName`, etc.) no longer incorrectly flagged for missing `@secure()` decorator
- **MCP server version fix** — Server now advertises correct version to clients, preventing stale tool cache issues

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.19.2 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.19.1] — 2026-03-03

### Fixed
- **FP reduction round 6** — CI/CD absence gating on app source files, expanded auth pattern detection for 4 additional languages, and magic number exclusions for string literals, named constants, and keyword arguments. Cross-language findings reduced from 152 → 139 (−8.6%); see [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.19.0] — 2026-03-04

### Added
- **Three FP reduction strategies** — Comment stripping before pattern matching, multi-line context windows for post-filters, and project-wide absence resolution significantly reduce false positives across all evaluators

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.19.0 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.18.3] — 2026-03-03

### Fixed
- **FP reduction round 5** — Cross-language sweep across 6 languages eliminates 21 false positives in 10 evaluators (configurable defaults, Go idioms, Rust/C#/Java auth patterns, doc comment recognition)
- **Bug fix** — Undefined `lines` variable in 4 evaluators caused post-filter logic to silently fail

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.18.3 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.18.2] — 2026-03-03

### Fixed
- **FP reduction round 4** — 11 rules across 7 evaluators fixed to eliminate false positives on IaC files (Bicep, Terraform) and improve cross-language accuracy (Java Bean Validation annotations now recognized)

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.18.2 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.18.1] — 2026-03-03

### Fixed
- **Python nested-loop false positives** — Generator expressions, list comprehensions, and `x in string` substring checks no longer incorrectly flagged as O(n²) nested loops
- **CI stability** — Resolved ESLint warnings and restored intentional test fixture imports

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.18.1 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [0.4.0] — 2026-03-02

### Added

- **Combined Layer 1 + Layer 2 deep review** — new `/deepreview` chat sub-command and `Judges: Deep Review (Layer 1 + Layer 2)` command palette entry. Runs all 35 deterministic evaluators instantly, then sends findings + source code to GPT-4o with the full tribunal deep-review prompt for contextual AI analysis — all in a single action.
- **`@judges /deepreview` chat command** — streams L1 findings grouped by severity with fix buttons, then streams the L2 LLM deep-review directly in Copilot Chat. Falls back to L1-only when no LLM is available.
- **`Judges: Deep Review` command** — accessible from command palette (🚀 icon) and editor context menu. Opens the combined L1 + L2 report as a new markdown tab.

## [0.3.0] — 2026-03-02

### Added

- **Refine Findings with AI** — new `Judges: Refine Findings with AI` command (available via command palette and editor context menu). Uses GPT-4o to review pattern-matched findings against the file's source code, automatically filtering out false positives. Reports how many findings were dismissed vs confirmed.
- **Deep-review false-positive review** — single-judge and tribunal deep-review prompts now include explicit instructions to identify and dismiss false positives from string literals, function-scoped variables, nearby mitigation code, and test/example code.

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
