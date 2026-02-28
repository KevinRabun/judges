# Changelog

All notable changes to **@kevinrabun/judges** are documented here.

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

[3.1.0]: https://github.com/KevinRabun/judges/compare/v3.0.3...v3.1.0
[3.0.3]: https://github.com/KevinRabun/judges/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/KevinRabun/judges/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/KevinRabun/judges/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/KevinRabun/judges/compare/v2.3.0...v3.0.0
[2.3.0]: https://github.com/KevinRabun/judges/releases/tag/v2.3.0
