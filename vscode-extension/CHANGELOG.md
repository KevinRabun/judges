# Changelog

All notable changes to the **Judges Panel** VS Code extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.22.0] — 2026-03-04

### Added
- **File filtering settings** — New `judges.exclude` and `judges.include` glob-array settings with `judges.maxFiles` limit for workspace reviews
- **Confidence tier filtering** — New `judges.confidenceTier` setting (essential/important/supplementary) filters diagnostics and workspace review findings by confidence threshold
- **Preset composition** — `judges.preset` now accepts composite values for combining multiple presets

### Changed
- **Workspace review** — Respects `maxFiles`, `exclude`, `include`, and `confidenceTier` settings; configurable file limits replace hardcoded cap
- **Core engine** — 16 new features: cross-file dedup, CLI filtering, cascading config, streaming API, CSV formatter, benchmark gate, 3 new MCP tools, confidence tuning, dedup expansion; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.21.0] — 2026-03-05

### Added
- **Findings panel** — New TreeView-based panel (`judges.showFindingsPanel`) displays all findings with sort-by-severity/judge, filter controls, and click-to-navigate-to-line; 7 new commands for panel interaction
- **FindingsChangedEvent** — `diagnostics.ts` now emits events when findings update, enabling the panel to refresh automatically

### Changed
- **Extension activation** — Panel and commands registered at activation; contributes views container, tree view, and context menus in `package.json`
- **Core engine** — Major expansion: 4 new languages (PHP/Ruby/Kotlin/Swift), framework version awareness, 20+ auto-fix patches, cross-file tracking, 3 new MCP tools; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1006 core tests, 392 subsystem tests — all passing

## [3.20.14] — 2026-03-04

### Added
- **False-positive reduction** — Three new heuristics (H33 destructuring, H34 dict-key access, H35 CLI arg definitions), expanded H6 identifier patterns for all security keywords, and three new safe idiom patterns; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1666 tests, 0 failures

## [3.20.13] — 2026-03-04

### Fixed
- **Documentation accuracy** — Replaced 3 hardcoded GPT-4o model references with vendor-neutral phrasing, fixed "right-click a file" → "right-click in the editor", updated auto-fix patch count (47+ → 53); root README updated with correct judge counts, missing exports, expanded project structure; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1666 tests, 0 failures

## [3.20.12] — 2026-03-03

### Changed
- **Layer 2 progress feedback** — Users now see real-time progress and streaming output during AI deep review instead of a blank screen for 30–60 seconds; chat participant streams LLM response incrementally after early content-policy check, command palette shows phase-specific progress notifications; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1666 tests, 0 failures

## [3.20.11] — 2026-03-03

### Fixed
- **False positive reduction — 5 new Bicep/IaC-specific heuristics (H28–H32)** — Eliminates false positives for null-check, magic-number, deep-nesting, duplicate-string, and Bastion Internet-HTTPS findings on Infrastructure-as-Code templates; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1666 tests, 0 failures

## [3.20.10] — 2026-03-03

### Fixed
- **Security — 6 polynomial-ReDoS vulnerabilities fixed** — Eliminated all open CodeQL `js/polynomial-redos` alerts in core engine regex patterns; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 1657 tests, 0 failures

## [3.20.9] — 2026-03-03

### Changed
- **Token usage optimisation** — MCP full-tribunal prompt deduplicated shared directives (~10 000 tokens saved per invocation, ~30% reduction), per-judge prompts now include evaluation criteria for better TP detection; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 11 new tests (1657 total, 0 failures)

## [3.20.8] — 2026-03-03

### Fixed
- **False positive reduction** — 3 new deterministic FP heuristics (config/schema object keys, function call assignment, string comparison/dispatch), broadened env-var safe idiom for all credential findings, and extended identifier patterns further reduce false positives; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 19 new tests (1646 total, 0 failures)

## [3.20.7] — 2026-03-03

### Fixed
- **False positive reduction** — 4 new deterministic FP heuristics (type-definition file gating, typed parameter declarations, throw/raise error messages, regex pattern literals), extended identifier patterns with `[-_]?` separators, and H20 enum context bugfix further reduce false positives; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 21 new tests (1627 total, 0 failures)

## [3.20.6] — 2026-03-03

### Fixed
- **False positive reduction** — 4 new deterministic FP heuristics (barrel/re-export file suppression, decorator security presence, enum/union type definitions, log message security keywords) and 4 new pattern entries (key/hash identifier collision, log/error message idiom, HTTP routing delete) further reduce false positives; see [core CHANGELOG](../CHANGELOG.md) for full details

### Tests
- 32 new tests (1606 total, 0 failures)

## [3.20.5] — 2026-03-03

### Fixed
- **False positive reduction** — 6 new deterministic FP heuristics and anti-FP guidance in 9 judge system prompts reduce false positives for regulated-policy evaluations (distributed lock fallback, retry/backoff resilience, bounded-dataset traversal, cache-age context, read-only content fetch, constant definitions, I18N web-only gating)

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.5 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.20.4] — 2026-03-03

### Fixed
- **Stale documentation counts** — All references to "35 judges" updated to "37 judges" across extension README, package.json, chat participant, and extension source.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.4 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.20.3] — 2026-03-03

### Fixed
- **Azure resource ID false positive** — Layer 2 no longer flags Azure policy definition IDs or other platform identifiers as "invalid GUIDs" even when they contain non-hex characters.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.3 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.20.2] — 2026-03-03

### Fixed
- **"Auto" model fallback** — Layer 2 no longer fails with "Endpoint not found for model auto". When the model selector is set to auto, the extension now falls back to any available model.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.2 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.20.1] — 2026-03-03

### Fixed
- **Layer 2 uses user-selected model** — Deep review no longer hardcodes `gpt-4o`. Uses whichever model you select in the Copilot Chat model picker (GPT-4o, Claude, Gemini, o4-mini, etc.).

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.1 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.20.0] — 2026-03-06

### Added
- **PowerShell language support** — Full PowerShell analysis across all 37 judges, including cmdlet conventions, credential handling, pipeline patterns, and AST structural parsing.

### Fixed
- **Deep review content-policy refusal (enhanced)** — Added defensive preamble framing, automatic refusal detection with simplified retry prompt, and alternative model fallback for Layer 2 deep review. Fixes persistent GPT-4o refusals on GDPR/IaC files.
- **Bicep/Terraform in LM tool** — Added `bicep` and `terraform` to `lm-tool.ts` LANG_MAP for consistent language detection.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.20.0 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.19.6] — 2026-03-03

### Fixed
- **Deep review no longer refused by LLM** — The `/deepreview` Layer 2 prompt triggered content-policy filters when all 37 judges' adversarial system prompts were concatenated. Tribunal mode now uses condensed judge descriptions and professional framing to avoid refusal.

### Core Engine
- See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.19.5] — 2026-03-05

### Fixed
- **Major FP reduction** — Cross-judge dedup bridging, DOC-001 fixes (Python validators, Java getters, route wiring, main()), STRUCT-005 fixes (closures, braceless if), UX-001 server-side error filtering, I18N-001 framework metadata exclusion, MAINT magic number and import fixes, and compliance pattern tightening. Pipeline-level findings reduced from 56 → 24 (−57%).

### Changed
- **Additional absence gating** — TEST-001, COMP-001, and REL-001 now suppressed in single-file mode alongside other absence findings.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.19.5 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.19.4] — 2026-03-04

### Changed
- **Absence gating** — Absence-based findings (missing rate limiting, health checks, etc.) now suppressed in single-file mode; only surface during project-level analysis. Eliminates ~78 per-file false positives.

### Fixed
- **Language-idiomatic FP fixes** — Go `interface{}`/`any` and `os.ReadFile`, Java wildcard imports, error message prose, C# middleware error handling, and dead code scope boundaries no longer produce false positives. Cross-language findings reduced from 139 → 134.

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.19.4 — see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.19.3] — 2026-03-03

### Fixed
- **Tool routing fix** — Improved MCP tool descriptions so prompts mentioning sovereignty, IaC, Bicep, Terraform, or deployment configuration correctly route to evaluation tools instead of `analyze_dependencies`

### Added
- **Tool routing test suite** — 43 automated tests verifying correct MCP tool selection for natural-language prompts

### Core Engine
- Bumped core `@kevinrabun/judges` to v3.19.3 — see [core CHANGELOG](../CHANGELOG.md) for full details

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
