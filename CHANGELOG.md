# Changelog

All notable changes to **@kevinrabun/judges** are documented here.

## [3.13.0] — 2026-03-02

### Added
- **AI-assisted false-positive refinement** — new `Judges: Refine Findings with AI` VS Code command (context menu + command palette). Uses GPT-4o to review pattern-matched findings against source code and filter out false positives. Reports how many findings were dismissed vs confirmed.
- **Deep-review false-positive instructions** — both single-judge and tribunal deep-review prompt builders now include a "False Positive Review" section instructing the LLM to identify and dismiss pattern findings that match string literals, function-scoped variables, nearby mitigation code, or test/example code. Dismissed findings are listed in a dedicated section and excluded from the verdict.
- **`isStringLiteralLine()` helper** — new helper in `shared.ts` that detects lines whose content is purely a string literal value (object properties, descriptions, examples). Used by `getLineNumbers` / `getLangLineNumbers` to auto-skip string-literal lines by default, preventing false positives from example text in strings.
- **String literal skipping in `getLineNumbers` / `getLangLineNumbers`** — both functions now skip string-literal-only lines by default (opt out with `{ skipStringLiterals: false }`). IaC languages (ARM/Terraform/Bicep) automatically opt out since their content is structured data where quoted values are meaningful.
- **34 new tests** (1210 total across 4 test files):
  - Deep-review single-judge prompt (8 tests) and tribunal prompt (7 tests).
  - `isStringLiteralLine` helper (7 tests).
  - `getLineNumbers` / `getLangLineNumbers` string literal skipping (4 tests).
  - String literal false-positive regressions for logging-privacy and performance evaluators (2 tests).
  - `refineWithAI` contract verification (6 tests): prompt building, index filtering, JSON array parsing.

### Fixed
- **7 evaluator false-positive fixes**:
  - **logging-privacy** — SQL regex no longer matches `SELECT` inside string literal values.
  - **data-sovereignty** — audit trail window scoped to function bodies instead of matching globally.
  - **performance** — unbounded collection scope limited to actual code context; event handler and pagination checks now skip string literal lines.
  - **internationalization** — currency regex anchored to avoid matching partial identifiers.
  - **scalability** — global mutable state scoping improved (function-local `let`/`var` no longer flagged).
- **IaC evaluator preserves detection in ARM templates** — `getLangLineNumbers` auto-disables string literal skipping for IaC languages so JSON key-value pairs aren't incorrectly filtered.

### Changed
- **README** — test badge updated from 925 to 1210; documented AI refinement capability.
- **VS Code extension README** — added `Judges: Refine Findings with AI` to commands table and features list.

## [3.12.0] — 2026-03-01

### Added
- **Technological sovereignty rules** — 3 new evaluator rules:
  - **SOV-011**: Vendor-managed encryption without key sovereignty (BYOK/CMK/HSM).
  - **SOV-012**: Proprietary AI/ML model dependency without abstraction layer.
  - **SOV-013**: Single identity provider coupling without OIDC/SAML federation.
- **Operational sovereignty rules** — 3 new evaluator rules:
  - **SOV-014**: External API calls without circuit breaker / resilience patterns.
  - **SOV-015**: Administrative operations without structured audit trail.
  - **SOV-016**: Data storage without export / portability mechanism.
- **3-pillar sovereignty systemPrompt** — judge definition expanded with 20 evaluation criteria across Data, Technological & Operational sovereignty pillars.
- **13 new tests** for technological and operational sovereignty rules including comment-skipping regression (925 total tests, 190 suites).

### Changed
- **Judge name** — "Judge Data Sovereignty" → "Judge Sovereignty".
- **Judge domain** — "Data Sovereignty & Jurisdictional Controls" → "Data, Technological & Operational Sovereignty".
- **README** — test badge 912 → 925; Data Sovereignty row and MCP prompt expanded.

## [3.11.4] — 2026-03-01

### Fixed
- **Zero lint errors** — resolved all remaining PROBLEMS across `daily-popular-repo-autofix.ts` (unused `RepoTimeoutError` class), `judges.test.ts` (9 unused imports), and `iac-security.ts` (unused post-increment value).
- **9 new comment-skipping regression tests** — authentication, API design, dependency health, compliance, observability, testing, internationalization, documentation, and ethics-bias evaluators now have dedicated false-positive regression tests (912 total tests, 188 suites).

### Changed
- **CHANGELOG** — added missing entries for v3.8.5 through v3.11.3 with link references.
- **README** — test badge updated from 842 to 912.
- **CONTRIBUTING** — test count updated from 700+ to 900+.
- **SECURITY** — supported versions table updated to reflect 3.11.x as current.

## [3.11.3] — 2026-03-01

### Fixed
- **Systemic comment-skipping across all evaluators** — added `isCommentLine()` helper to `shared.ts` with `COMMENT_LINE_RE` regex. `getLineNumbers()` and `getLangLineNumbers()` now skip comment lines by default. Added 123 individual `isCommentLine` guards to `forEach`/`for` loops across 20 evaluators. 9 intentional comment checks (TODO/FIXME, linter-disable, etc.) opted out with `{ skipComments: false }`.
- Added 10 regression tests for comment-skipping false positives (903 total tests, 188 suites).

## [3.11.2] — 2026-03-01

### Fixed
- **Recursion detector** limited body scan to actual function boundaries — previously could false-positive on identically named functions elsewhere in the file.
- **`var` in comments** no longer triggers maintainability or software-practices findings (`var oldConfig = {}` in a comment is not a code issue).

## [3.11.1] — 2026-03-01

### Fixed
- **Testing evaluator** — `describe`/`it` labels and word boundaries for `HttpClient` no longer produce false positives.
- **Data-sovereignty evaluator** — `export` embedded in identifiers and env vars no longer triggers; added word boundaries to `dr` and `replica` checks.
- **Documentation evaluator** — walks backwards through comment body for long JSDoc blocks to avoid false-positive "missing documentation" findings.

## [3.11.0] — 2026-03-01

### Fixed
- **N+1 query check** now scans actual loop bodies instead of the entire file — eliminates false positives when queries exist outside loops.
- **Retry detection** recognizes `p-retry` and `backoff` libraries.
- **Cost-effectiveness** skips comment lines in loop detection.
- **Accessibility** skips comment and declaration lines.
- **Data-sovereignty** skips comment lines.
- **External dependency** detection skips comment lines.
- **API doc check** no longer false-positives on large JSDoc blocks.

## [3.10.1] — 2026-03-01

### Fixed
- **Auto-fix button** no longer falsely reports code changed when no patches were applied.

## [3.10.0] — 2026-03-01

### Added
- **IaC Security judge** (`IAC-*` rules) — Infrastructure-as-Code analysis for Terraform (`.tf`), Bicep (`.bicep`), and ARM templates (`.json`). Checks for overly permissive network rules, missing encryption, public access, hardcoded secrets in IaC definitions, and 15 other IaC-specific anti-patterns.

## [3.9.3] — 2026-03-01

### Improved
- **VS Code extension** — "Re-Evaluate" is now a chat followup that streams updated findings into chat (previously showed only a toast). Context-aware followups for `/security` and workspace reviews. Post-fix followup after `/fix`.
- **Auto-fix clarity** — each finding tagged with 🔧 (auto-fixable) or 📝 (manual review). Fixability summary in header. Dynamic button label ("Auto-Fix N of M Findings"). Button hidden when no findings are auto-fixable.

## [3.9.2] — 2026-03-01

### Fixed
- **VS Code extension** — populated findings cache directly from chat review results; fixed Auto-Fix All and Re-Evaluate buttons not working after chat review.

## [3.9.1] — 2026-03-01

### Added
- **Workspace-wide review** — `@judges /review` in Copilot Chat can now evaluate all supported files in the workspace with progress reporting.

### Fixed
- **Tree-sitter AST** — made `tree-sitter-ast.ts` work in both ESM and CJS bundles.
- Added missing `toolReferenceName` to `languageModelTools` manifest.

## [3.9.0] — 2026-03-01

### Added
- **`@judges` chat participant** — type `@judges` in Copilot Chat to review, security-check, or auto-fix files. Slash commands: `/review`, `/security`, `/fix`, `/help`.
- **`judges_evaluate` Language Model tool** — registered via `vscode.lm.registerTool` so Copilot auto-discovers and invokes Judges evaluation.
- Disambiguation routing: Copilot auto-routes "judges panel review", "judges evaluation" queries.
- Domain-focused reviews and action buttons in chat responses.

## [3.8.7] — 2026-03-01

### Fixed
- Daily popular-repo autofix timeout and performance improvements.

## [3.8.6] — 2026-03-01

### Fixed
- Added `onChatParticipant` activation event for `@judges` in VS Code extension.

## [3.8.5] — 2026-03-01

### Security
- Replaced ReDoS-prone regex with `indexOf` in `project.ts` (CodeQL alert 35).

## [3.8.4] — 2026-03-01

### Security
- Fixed 8 polynomial-ReDoS vulnerabilities flagged by CodeQL code scanning:
  - `structural-parser.ts`: PYTHON_CLASS regex — merged competing `\s*` quantifiers around optional base-list group.
  - `taint-tracker.ts`: GUARD_PATTERNS — eliminated `[ \t]*!?[ \t]*` overlap that caused polynomial backtracking.
  - `shared.ts`: health-check pattern — bounded `[^\n]*` to `{0,200}`; catch-block signal — replaced whole-file regex with line-by-line scan.
  - `dependencies.ts`: requirements.txt parser — replaced `[>=<~!]+` character class with explicit pip-operator alternation.
  - `project.ts`: import-path extractor — bounded `[^'"]` quantifier to `{1,500}`; normalise helper — replaced chained regex with `lastIndexOf` calls.
- Dismissed 6 false-positive / intentional alerts:
  - 2 intentional vulnerabilities in `examples/sample-vulnerable-api.ts` (demo file).
  - 4 URL-substring-sanitization false positives in test assertions.

## [3.8.3] — 2026-03-01

### Changed
- Extension README: rewrote to lead with auto-configured MCP, added Marketplace install instructions, added missing commands to table, updated Layer 2 section to emphasize it is enabled automatically.
- Extension `package.json` description updated to mention auto-configured MCP.
- Root README: rewrote “Connect to Your Editor” section — VS Code extension is now the recommended zero-config path; manual MCP configs updated to use `npx` instead of absolute paths; added Cursor and generic MCP client examples.

## [3.8.2] — 2026-03-01

### Fixed
- Added `workflow_dispatch` trigger to publish workflow for manual re-runs.
- Fixed tag-push not triggering CI when pushed alongside branch updates.

## [3.8.1] — 2026-03-01

### Fixed
- Aligned VS Code engine constraint (`^1.109.0`) with `@types/vscode` to fix vsce publish validation.

## [3.8.0] — 2026-03-01

### Added
- **MCP server auto-configuration** — VS Code extension now registers the Judges MCP server automatically via `McpServerDefinitionProvider`. Users install the extension and Layer 2 (35 expert-persona LLM prompts) is immediately available to Copilot — zero manual setup.
- **`Judges: Configure MCP Server` command** — writes the MCP server definition to `.vscode/mcp.json` for users who prefer explicit workspace config.
- Extension engine bumped to VS Code `^1.99.0` for MCP API support.

## [3.7.3] — 2026-03-01

### Fixed
- Fixed CI workflow race condition: extension install failed because `@kevinrabun/judges@^3.7.2` wasn't propagated on npm yet.
- Workflow now uses local tarball (`npm pack`) for the extension build instead of relying on npm registry propagation.
- Removed dependency version sync from the extension publish step; `^3.7.1` semver range covers all 3.x patches.

## [3.7.2] — 2026-03-01

### Fixed
- Resolved all 168 lint warnings across 45 source files (0 errors, 0 warnings).
- Fixed unused `lang` parameter in 25 evaluators (`lang` → `_lang`).
- Fixed last `ruleNum++` assignment (value never read) in 34 evaluators.
- Removed unused imports from `data-security.ts`, `evaluators/index.ts`, `negative.test.ts`, `subsystems.test.ts`.
- Prefixed unused variables with `_` in `ai-code-safety.ts`, `v2.ts`, `patches/index.ts`, `cross-file-taint.ts`, `structural-parser.ts`, `taint-tracker.ts`.
- Fixed unnecessary escape characters in `structural-parser.ts`, `ai-code-safety.ts`, `documentation.ts`, `shared.ts`, `software-practices.ts`.
- Removed dead `else { ruleNum++; }` branch in `ai-code-safety.ts`.
- All 1039 tests passing (842 + 28 + 169).

---

## [3.7.1] — 2026-03-01

### Fixed
- Added root `LICENSE` file (MIT) — was referenced in `package.json` `files` but missing from tarball.
- Added `CHANGELOG.md` to npm `files` array so it ships in the published package.
- Fixed CHANGELOG date and test count accuracy.
- VS Code extension: switched to `bundler` module resolution, fixed ESM/CJS import errors.
- VS Code extension: added `.vscodeignore` tuning, `galleryBanner` metadata, esbuild bundling.

---

## [3.7.0] — 2026-03-01

### Added
- **`judges --version` command** — display installed version with update check.
- **`--fix` flag on eval** — evaluate and auto-fix in one step: `judges eval --fix src/app.ts`.
- **Glob / multi-file eval** — evaluate directories and patterns: `judges eval src/**/*.ts`.
- **Progress indicators** — `[1/12] src/app.ts…` progress during multi-file evaluation.
- **VS Code extension** — diagnostics, code actions, and quick-fix integration (`vscode-extension/`).
- **README terminal mockup** — SVG-based visual showing evaluation output.
- **`.judgesrc.example.json`** — annotated example configuration file.
- **GitHub Marketplace metadata** — enhanced `action.yml` for Marketplace discovery.

### Changed
- `server.json` version synced to `3.7.0`.
- README test badge updated to **842**.
- Total test count: **842**.

---

## [3.6.0] — 2026-03-07

### Added
- **Plugin system** (`--plugin`) — load custom evaluator plugins from npm packages or local files.
- **Finding fingerprints** — stable content-hash IDs for tracking findings across runs.
- **Calibration mode** (`judges calibrate`) — tune judge thresholds against known-good codebases.
- **Diagnostics format** (`--format diagnostics`) — LSP-compatible diagnostic output for editor integration.
- **Comparison command** (`judges compare`) — side-by-side feature matrix vs ESLint, SonarQube, Semgrep, CodeQL.
- **Language packs** (`judges pack`) — manage language-specific rule extensions.
- **Config sharing** (`judges config export/import`) — export and import team configurations.
- **Custom rules** (`judges rule create`) — define and manage custom evaluation rules.
- **Fix history** — track applied patches with undo support.
- **Smart output** — auto-detect terminal width and format output accordingly.
- **Feedback command** (`judges feedback`) — submit false-positive feedback for rule tuning.
- **Benchmark command** (`judges benchmark`) — run detection accuracy benchmarks against test suites.
- **14 new subsystem tests** for plugins, fingerprinting, calibration, and diagnostics.

### Changed
- CLI expanded from 14 to 22 commands.
- Output formats expanded from 7 to 8 (added `diagnostics`).
- Total test count: **819** (up from 754).

---

### Added
- **`judges diff` command** — evaluate only changed lines from unified diff / git diff output. Pipe `git diff` directly or pass a patch file.
- **`judges deps` command** — analyze project dependencies for supply-chain risks across 11 manifest types (package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, etc.).
- **`judges baseline create` command** — create a baseline JSON file from current findings for future suppression.
- **`judges completions` command** — generate shell completion scripts for bash, zsh, fish, and PowerShell.
- **`judges docs` command** — generate per-judge rule documentation in Markdown format, with `--output` for file output.
- **JUnit XML formatter** (`--format junit`) — CI/CD compatible output for Jenkins, Azure DevOps, GitHub Actions, GitLab CI.
- **CodeClimate JSON formatter** (`--format codeclimate`) — GitLab Code Quality widget compatible output with MD5 fingerprints.
- **Named presets** (`--preset`) — 6 built-in profiles: `strict`, `lenient`, `security-only`, `startup`, `compliance`, `performance`.
- **Config file support** (`--config`) — auto-discovers `.judgesrc` / `.judgesrc.json` in project root with full JSON Schema validation support.
- **`judgesrc.schema.json`** — JSON Schema for `.judgesrc` files with IDE autocomplete and validation.
- **`--min-score` flag** — exit non-zero when overall score falls below threshold (e.g. `--min-score 80`).
- **`--verbose` flag** — timing statistics and file-level detail in output.
- **`--quiet` flag** — suppress informational output, only show findings.
- **`--no-color` flag** — disable ANSI color codes for piped output.
- **CI Templates** — `judges ci-templates github` generates GitHub Actions workflow YAML.
- **24 new tests** covering all new formatters, commands, presets, and JSON Schema validation.

### Changed
- CLI expanded from 8 to 14 commands.
- Output formats expanded from 5 to 7 (added `junit`, `codeclimate`).
- Total test count: **754** (up from 730).

---

## [3.4.0] — 2026-03-04

### Added
- **Init wizard** (`judges init`) — interactive project setup generating `.judgesrc` config.
- **Fix command** (`judges fix`) — auto-apply suggested patches from findings with `--apply` flag.
- **Watch mode** (`judges watch`) — file-system watcher for continuous evaluation during development.
- **Report command** (`judges report`) — full project analysis with HTML/JSON/Markdown output.
- **Hook command** (`judges hook`) — git pre-commit hook installation.
- **HTML formatter** — interactive browser-based report with severity filters and per-judge sections.
- **Baseline suppression** — suppress known findings from previous runs.
- **CI template generator** — `judges ci-templates` for GitLab CI, Azure Pipelines, Bitbucket Pipelines.

### Changed
- Total test count: **730**.

---

## [3.3.0] — 2026-03-02

### Changed
- **Unified tree-sitter AST** — consolidated `typescript-ast.ts` into `tree-sitter-ast.ts`, single parser for all 8 languages.
- Removed legacy TypeScript Compiler API dependency.

---

## [3.2.0] — 2026-02-29

### Added
- **Tree-sitter WASM integration** — structural AST analysis for 8 languages (TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++).
- Language-specific structural patterns for each grammar.

---

## [3.1.1] — 2026-02-28

### Added
- **GitHub Action** (`action.yml`) — composite action for CI/CD with SARIF upload, fail-on-findings, and job summary.
- **Dockerfile** — multi-stage Node 20 Alpine build with non-root user for containerized usage.
- **GitHub Pages dashboard** (`docs/index.html`) — dark-themed dashboard showing project analysis results and judge directory.
- **Real-world evidence document** (`docs/real-world-evidence.md`) — Express.js, Flask, FastAPI analysis + before/after showcase.
- **Pages deployment workflow** (`.github/workflows/pages.yml`).

---

## [3.1.0] — 2026-02-28

### Added
- **CLI evaluation mode** — `npx @kevinrabun/judges eval --file app.ts` runs the full tribunal from the command line, no MCP setup required. Supports `--language`, `--format`, `--judge`, and stdin piping.
- **Enhanced Python AST** — class-aware method extraction (`ClassName.method_name`), decorator detection, async function detection, self/cls parameter filtering, multi-line import handling.
- **Framework-aware analysis** — detects 14 frameworks (Express, React, Django, Flask, Spring, FastAPI, etc.) and reduces confidence on framework-idiomatic findings to cut false positives.
- **Content-hash LRU caching** — caches AST structure, taint flow, and tribunal results by content hash for faster re-evaluation of unchanged files.
- **SARIF 2.1.0 structural validator** — `validateSarifLog()` checks all mandatory SARIF properties before output.
- **Multi-line auto-fix patches** — 5 structural patch rules for Express helmet, CORS, rate limiting, error handlers, and health endpoints.
- **Confidence-weighted scoring** — findings now carry estimated confidence; low-confidence findings have reduced score impact.
- **Finding provenance** — every finding includes `provenance` field with rule ID and evidence trail for auditability.
- **Absence-based finding demotion** — findings flagging *missing* patterns are demoted from critical/high to medium to reduce false positives.
- **28 negative tests** for false positive prevention.
- **169 subsystem unit tests** (scoring, dedup, config, patches, suppression, SARIF, Python parser).
- **Quickstart example** (`examples/quickstart.ts`) using the package API.
- **CHANGELOG.md** with full version history.

### Fixed
- `server.json` version now stays in sync with `package.json`.
- MCP server version string updated from `2.0.0` to `3.1.0`.
- Demo example includes guidance for both in-repo and package-installed usage.

### Changed
- Total test count: **899** (702 integration + 28 negative + 169 subsystem).
- Python structural parser fully rewritten with two-pass class boundary detection.
- Class name extraction added for all supported languages (Python, Java, C#, Rust, Go).

---

## [3.0.3] — 2026-02-27

### Fixed
- Resolved all 14 CodeQL ReDoS alerts via atomic character classes and possessive-style patterns.
- Suppressed 4 intentional vulnerability alerts in `examples/sample-vulnerable-api.ts` (test fixture).
- Resolved Dependabot `hono` IP spoofing alert via `overrides`.
- GitHub Releases now auto-created on tag push (`publish-mcp.yml`).

---

## [3.0.2] — 2026-02-26

### Fixed
- Publish workflow repaired (npm provenance, correct trigger).
- Removed dead code from build artifacts.

---

## [3.0.1] — 2026-02-26

### Fixed
- Dropped Node 18 from CI matrix (ESLint 10 requires Node >= 20).
- Added adversarial mandate to code-structure and framework-safety judges.
- Fixed `FW-` rule prefix in README documentation.

---

## [3.0.0] — 2026-02-25

### Added
- **Monolith decomposition**: 35 specialized judges split from single evaluator file.
- **Built-in AST analysis** via TypeScript Compiler API — no separate parser needed.
- **App Builder Workflow** (3-step): release decision, plain-language risk summaries, prioritized remediation tasks.
- **V2 context-aware evaluation** with policy profiles, evidence calibration, specialty feedback, confidence scoring.
- **Public repository URL reporting** — clone any public repo and generate a full tribunal report.
- **Project-level analysis** with cross-file architectural detection (duplication, dependency cycles, god modules).
- **Diff evaluation** — analyze only changed lines for PR reviews.
- **Dependency analysis** — supply-chain manifest scanning.
- **SARIF output** for GitHub Code Scanning integration.
- **Inline suppression** via `judges-disable` comments.
- CI/CD infrastructure with GitHub Actions (CI, publish, PR review, daily automation).

---

## [2.3.0] — 2026-02-24

### Added
- AI Code Safety judge with 12 AICS rules.
- Full `suggestedFix` and `confidence` coverage across all 427 findings.
- Multi-language detection via language pattern system.

---

[3.11.4]: https://github.com/KevinRabun/judges/compare/v3.11.3...v3.11.4
[3.11.3]: https://github.com/KevinRabun/judges/compare/v3.11.2...v3.11.3
[3.11.2]: https://github.com/KevinRabun/judges/compare/v3.11.1...v3.11.2
[3.11.1]: https://github.com/KevinRabun/judges/compare/v3.11.0...v3.11.1
[3.11.0]: https://github.com/KevinRabun/judges/compare/v3.10.1...v3.11.0
[3.10.1]: https://github.com/KevinRabun/judges/compare/v3.10.0...v3.10.1
[3.10.0]: https://github.com/KevinRabun/judges/compare/v3.9.3...v3.10.0
[3.9.3]: https://github.com/KevinRabun/judges/compare/v3.9.2...v3.9.3
[3.9.2]: https://github.com/KevinRabun/judges/compare/v3.9.1...v3.9.2
[3.9.1]: https://github.com/KevinRabun/judges/compare/v3.9.0...v3.9.1
[3.9.0]: https://github.com/KevinRabun/judges/compare/v3.8.7...v3.9.0
[3.8.7]: https://github.com/KevinRabun/judges/compare/v3.8.6...v3.8.7
[3.8.6]: https://github.com/KevinRabun/judges/compare/v3.8.5...v3.8.6
[3.8.5]: https://github.com/KevinRabun/judges/compare/v3.8.4...v3.8.5
[3.8.4]: https://github.com/KevinRabun/judges/compare/v3.8.3...v3.8.4
[3.8.3]: https://github.com/KevinRabun/judges/compare/v3.8.2...v3.8.3
[3.8.2]: https://github.com/KevinRabun/judges/compare/v3.8.1...v3.8.2
[3.8.1]: https://github.com/KevinRabun/judges/compare/v3.8.0...v3.8.1
[3.8.0]: https://github.com/KevinRabun/judges/compare/v3.7.3...v3.8.0
[3.7.3]: https://github.com/KevinRabun/judges/compare/v3.7.2...v3.7.3
[3.7.2]: https://github.com/KevinRabun/judges/compare/v3.7.1...v3.7.2
[3.7.1]: https://github.com/KevinRabun/judges/compare/v3.7.0...v3.7.1
[3.7.0]: https://github.com/KevinRabun/judges/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/KevinRabun/judges/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/KevinRabun/judges/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/KevinRabun/judges/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/KevinRabun/judges/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/KevinRabun/judges/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/KevinRabun/judges/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/KevinRabun/judges/compare/v3.0.3...v3.1.0
[3.0.3]: https://github.com/KevinRabun/judges/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/KevinRabun/judges/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/KevinRabun/judges/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/KevinRabun/judges/compare/v2.3.0...v3.0.0
[2.3.0]: https://github.com/KevinRabun/judges/releases/tag/v2.3.0
