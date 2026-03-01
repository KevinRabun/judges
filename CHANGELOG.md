# Changelog

All notable changes to **@kevinrabun/judges** are documented here.

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
