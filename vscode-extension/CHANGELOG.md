# Changelog

All notable changes to the **Judges Panel** VS Code extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.53.0] — 2025-07-25

### Added
- Code quality analysis: doc-drift, exception-consistency, resource-cleanup, refactor-safety, code-similarity
- Enterprise compliance: compliance-weight (PCI-DSS, HIPAA, GDPR, SOC2, ISO27001), team-trust profiles
- Pattern detection: cross-pr-regression tracking across PRs

## [3.52.0] — 2025-07-25

### Added
- File watch with auto-evaluation, cross-file impact scanning, AI model scorecards
- Adaptive trust scoring, feedback-driven judge generation, chat platform notifications
- Design coherence auditing, remediation template library with voting

## [3.51.0] — 2025-07-25

### Added
- AI output comparison, hallucination scoring, AI pre-merge gating, AI pattern trend tracking
- Test scenario suggestions, vendor lock-in detection, code clarity scoring, architecture auditing

## [3.50.0] — 2025-07-25

### Added
- Secret scanning, IaC linting, PII detection, API security audit
- Multi-framework compliance mapping (HIPAA, SOC 2, PCI-DSS, ISO 27001, NIST)
- Performance comparison, interactive onboarding tours, executive reporting

## [3.49.0] — 2026-03-12

### Added
- **SBOM export** — CycloneDX Software Bill of Materials generation
- **License scan** — Dependency license compliance with copyleft detection
- **Test correlate** — Test coverage × security finding correlation
- **Predict** — Remediation timeline forecasting and regression risk
- **Org policy** — Organization-wide policy enforcement
- **Incident response** — Security incident playbook generation
- **Risk heatmap** — File/directory risk visualization
- **Learning path** — Personalized security learning recommendations

## [3.48.0] — 2026-03-12

### Added
- **Auto-fix** — Automated fix suggestions for 10 common vulnerability patterns
- **Audit trail** — Chain-of-custody tracking for finding lifecycle events
- **Pattern registry** — Team security pattern knowledge repository
- **Security maturity** — Posture maturity assessment across 5 dimensions
- **Perf hotspot** — Performance anti-pattern detection
- **Doc gen** — Security documentation generation (policy, remediation, playbook)
- **Dep correlate** — Dependency vulnerability correlation with upgrade recommendations
- **Judge author** — Custom judge authoring toolkit

## [3.47.0] — 2026-03-12

### Added
- **AI model trust** — Per-model confidence scoring with fingerprinting for Copilot, GPT-4o, Claude, Cursor, Gemini
- **Team rules sync** — Fast onboarding with built-in team templates (security, frontend, backend, data, startup)
- **Cost forecast** — Security debt projections with 30/60/90-day trend forecasting
- **Team leaderboard** — Gamified engagement with badges, streaks, and rankings
- **Code owner suggest** — Auto-recommend CODEOWNERS from developer resolution history
- **PR quality gate** — Automated pass/fail gate with configurable thresholds
- **AI prompt audit** — Prompt injection risk detection (SQL, shell, SSRF, eval, XSS patterns)
- **Adoption report** — Executive dashboard with adoption score, trends, and cost savings

## [3.46.0] — 2026-03-12

### Added
- **Audit bundle** — Assemble auditor-ready evidence packages with compliance control mapping
- **Developer score** — Security growth tracking with leaderboard and streak tracking
- **Model risk profiles** — AI model vulnerability risk analysis with recommended config overrides
- **Incident retrospective** — Check if Judges would have caught a vulnerability at a git commit
- **Config drift detection** — Detect config divergence from org baseline with drift scoring
- **Regulatory watch** — Monitor OWASP/CWE/NIST standard coverage with gap identification
- **Learning paths** — Personalized developer security learning with module catalog and exercises
- **Code templates** — Secure pre-hardened code templates for Express, React, Flask, Go, and Node.js

## [3.45.0] — 2026-03-12

### Added
- **Consensus voting** — Multi-developer voting on findings with automatic consensus scoring
- **Advanced finding query** — Complex search with severity/rule/confidence filters and saved queries
- **Judge reputation tracking** — Per-judge accuracy, FP rate, and confidence calibration over time
- **Finding correlation** — Link related findings and identify root causes with auto-correlation
- **Periodic digest** — Snapshot recording and daily/weekly/monthly digest report generation
- **Rule sharing** — Export/import custom rule configurations as shareable packages
- **Finding explanation** — Rich context with category info, common causes, and remediation steps
- **Run comparison** — Save and compare evaluation runs side by side with delta analysis

## [3.44.0] — 2026-03-12

### Added
- **Batch FP suppression** — Suppress findings by glob, rule prefix, or severity with audit trail
- **Rule ownership** — Map rules to team owners with expertise levels
- **Noise advisor** — Analyze rule FP rates and recommend tuning actions
- **Human review queue** — Route low-confidence findings to experts
- **Report templates** — 6 predefined templates for different audiences
- **Finding burndown** — Track resolution progress with visual chart and ETA
- **Team knowledge base** — Store team decisions and exceptions for rules
- **Judge recommendations** — Analyze project stack and recommend judges

## [3.43.0] — 2026-03-12

### Added
- **CI template generator** — Generate CI pipeline configs for 5 platforms with auto-detect
- **Policy audit trail** — SOC2/ISO27001 compliance snapshots with SHA-256 hashing
- **Remediation guides** — 10 step-by-step fix guides with OWASP/CWE references
- **Git hook installation** — Install pre-commit/pre-push hooks (direct or Husky)
- **False-negative tracking** — Local feedback database for missed findings
- **Finding assignment** — Assign findings to team members with resolution workflow
- **Ticket sync** — Create Jira/Linear/GitHub Issues from findings
- **SLA tracking** — Response-time SLAs with violation detection
- **Regression alerting** — Baseline comparison for quality regression detection

## [3.42.0] — 2026-03-12

### Added
- **SARIF upload to GitHub Code Scanning** — Direct `judges upload` command for CI integration
- **Smart judge selection** — Auto-select relevant judges per file language and content
- **PR summary comment** — Post verdict summary as PR comment, updates in-place
- **Performance profiling** — Track per-judge evaluation time with `judges profile`
- **Finding grouping** — Group findings by category, severity, file, rule, or judge
- **Diff-only evaluation** — Filter findings to only changed lines in PRs
- **Confidence auto-triage** — Auto-suppress low-confidence findings
- **Config validation** — Validate `.judgesrc` with typo suggestions
- **Rule coverage map** — Visual matrix of rules × languages
- **Eval cache warming** — Pre-populate cache for faster CI runs

## [3.41.0] — 2026-03-12

### Added
- **Interactive fix mode** — Per-finding accept/skip/all/quit flow with colored diff display in terminal
- **Framework-aware detection** — 10 framework profiles (React, Next.js, Express, Django, etc.) with auto-detection and FP-reducing severity adjustments
- **Quality gate evaluations** — Composite quality gate definitions configurable via `.judgesrc`
- **7 new CLI commands** — `notify`, `fix-pr`, `quality-gate`, `auto-calibrate`, `dep-audit`, `monorepo`, `config-migrate`, `deprecated`, `dedup-report`
- See [core CHANGELOG](../../CHANGELOG.md) for full details (12 new adoption features)

## [3.40.0] — 2026-03-11

### Added
- **IDE fix diff preview** — Inline diff preview before applying auto-fixes; accept/reject actions directly in the editor
- **Evidence-backed diagnostics** — Findings now include evidence arrays (AST match details, confidence scores) surfaced in hover tooltips
- **Auto model profile detection** — Extension detects LLM watermarks and applies tuned thresholds automatically
- **Enhanced explain output** — Layer 2 evidence details with AST node types and pattern matchers in diagnostic detail views
- See [core CHANGELOG](../../CHANGELOG.md) for full details (16 new features including DataAdapter, governance, compliance reports, and more)

## [3.38.0] — 2026-03-10

### Fixed
- **Evaluator accuracy improvements** — HALLU, I18N, IAC, SOV, CONC, DOC, LOGIC, MAINT evaluators tuned to reduce false positives while preserving true detection
- **Benchmark quality** — 0 failed cases, all per-judge FP rates below 30%, clean category FP rate 0%
- See [core CHANGELOG](../../CHANGELOG.md) for full details

## [3.37.0] — 2026-03-10

### Added
- **Live status bar** — Status bar updates dynamically after evaluations showing finding count and auto-fixable count (e.g., `Judges: 5 finding(s), 2 fixable`) instead of static label; updates when switching editor tabs
- **Auto-onboarding** — CLI automatically applies onboarding preset for first-time users with no config file, reducing initial noise
- **Fix rate visibility** — CLI summary output now shows auto-fixable counts and fix guidance across all output modes
- See [core CHANGELOG](../../CHANGELOG.md) for full details

## [3.36.0] — 2026-03-10

### Added
- **Diff-aware evaluation** — new `judges.evaluateDiff` command runs full analysis but only surfaces findings on changed lines relative to git HEAD (±2 line context margin)
- **Judge grouping in findings panel** — new "Sort by Judge" mode groups findings by judge prefix (AUTH, CRYPTO, LOGIC, etc.) with collapsible tree nodes and worst-severity icons
- **New logic-review judge** — 7 detection categories for semantic correctness issues common in AI-generated code
- See [core CHANGELOG](../../CHANGELOG.md) for full details (triage feedback, AI-output benchmarks, JetBrains guide, and more)

## [3.35.0] — 2026-03-10

### Added
- **5 conversational review MCP tools** — `explain_finding`, `triage_finding`, `get_finding_stats`, `get_suppression_analytics`, `list_triaged_findings` for interactive finding review directly in the editor
- **Benchmark dashboard** — `run_benchmark` MCP tool with full per-judge/category/difficulty breakdowns
- **10 new auto-fix rules** — timing-safe comparison, path traversal, hardcoded secrets, open redirect, SSRF, insecure cookies, Java/Python/C# SQL injection, CSP headers
- **17 new framework patterns** — expanded coverage for Django, Flask, Spring Boot, and ASP.NET Core
- **Suppression analytics** — analyze FP rates and get tuning recommendations
- See [core CHANGELOG](../../CHANGELOG.md) for full details

## [3.34.1] — 2026-03-10

### Fixed
- **CI build fix** — Resolved TypeScript compile error that failed the v3.34.0 publish workflow; see [core CHANGELOG](../../CHANGELOG.md) for details

## [3.34.0] — 2026-03-10

### Fixed
- **False-positive filter accuracy** — Keyword-in-identifier suppression now requires ALL flagged lines to match, preventing cross-evaluator dedup line merging from causing incorrect suppressions
- **JWT import detection** — `import jsonwebtoken` no longer triggers a false finding
- **Type annotation stripping** — Generic type parameters no longer trigger cryptic-naming detection

### Changed
- **12 evaluator threshold recalibrations** — Improved detection accuracy across AI Code Safety, Caching, Cloud Readiness, Configuration Management, Cost Effectiveness, Data Sovereignty, Documentation, Internationalization, Reliability, and UX evaluators
- **Benchmark scoring** — Cross-reference annotations from dedup now properly count toward true-positive matching

### Benchmark
- Grade A — F1: 93.0%, Precision: 98.7%, Recall: 87.9%, 2226 tests passing

See [core CHANGELOG](../../CHANGELOG.md) for full details.

## [3.33.0] — 2026-03-10

### Added
- **CodeLens provider** — Shows finding counts above functions, methods, and classes directly in the editor; refreshes automatically when findings change
- **Per-judge timing** — Evaluation results now include timing data in text output

### Changed
- **New over-engineering judge** — 44th judge detects excessive abstraction, trivial wrappers, god interfaces, and enterprise patterns in small codebases
- **PDF export** — New `--format pdf` generates print-optimized HTML for "Save as PDF" workflows
- **Centralized judge metadata** — All 44 judges now carry `tableDescription` and `promptDescription` fields, enabling auto-generated documentation
- **`npm run sync-docs`** — New script regenerates all documentation from the `JUDGES` array as single source of truth
- **4 judge names fixed** — Data Sovereignty, API Contract, Multi-Turn Coherence, and Model Fingerprint judges now follow the `"Judge {Domain}"` naming convention

### Fixed
- **PDF formatter build error** — Fixed `Finding.line` reference to use `Finding.lineNumbers`

See [core CHANGELOG](../../CHANGELOG.md) for full details.

## [3.31.0] — 2026-03-10

### Changed
- **Smarter PR review defaults** — Calibration on by default, confidence floor at 0.6, diff-only mode in Actions, reliability badges on each comment
- **New `ai-review` preset** — Optimized for reviewing AI-generated code with focused judge selection

### Added
- **`--judges` flag** — Select specific judges for PR review (e.g., `--judges cybersecurity,authentication`)
- **Absence-based finding filter** — Diff mode now suppresses findings that can't be assessed from a single diff hunk

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.30.0] — 2026-03-10

### Added
- **Smarter hallucination detection** — Scope-aware suppression, import guards, 14 new patterns, auto-fix patches, and evidence chains for all HALLU findings
- **Per-LLM benchmark tracking** — Track detection effectiveness per AI code generator via new `perAISource` dimension

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.29.2] — 2026-03-09

### Fixed
- **FP rate reduction** — All judges now report <30% individual FP rates; synced with core v3.29.2 evaluator precision improvements across STRUCT, COH, INTENT, and API judges

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.29.1] — 2026-03-09

### Fixed
- **Build fix** — Synced with core v3.29.1 to resolve TypeScript compilation errors

## [3.29.0] — 2026-07-07

### Added
- **Interactive review session** — New `judges.reviewSession` command for guided finding-by-finding triage with Accept/Dismiss/Skip actions
- Synced with core v3.29.0 — 4 new judges (#40-43), 5 industry presets, community pattern sharing, calibration dashboard, explanation mode, and 14 features total

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.28.0] — 2026-07-07

### Added
- Synced with core v3.28.0 — 13 new features including onboarding preset, parallel judge execution, org config inheritance, metrics API, net-change CI gate, and per-language rule profiles

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.27.1] — 2026-03-09

### Fixed
- **CI build fix** — Resolved `npm ci` peer dependency conflicts from tree-sitter native grammar packages

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.27.0] — 2026-03-09

### Added
- **New language support** — Dart, Bash/Shell, and SQL files now receive full evaluation with inline diagnostics
- **Deeper evaluator coverage** — Accessibility (23 rules), IaC Security (32 rules), Cost-Effectiveness (20 rules), and UX (18 rules) evaluators significantly expanded
- **Tree-sitter AST for PHP, Ruby, Kotlin, Swift** — Deep structural analysis (function/class extraction, complexity, imports) now available for four additional languages

### Fixed
- **Rule numbering bug** — Fixed `ruleNum` increment issue in four evaluators that could cause rule-ID collisions

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.26.0] — 2026-03-09

### Fixed
- **Security evaluator false positives eliminated** — Two regex patterns fixed to prevent false triggers on compound identifiers (`curlArgs`, `PRIV`)
- **Self-eval clean** — 0 findings across 176 source files, down from 211 in prior release

### Changed
- **Improved false-positive filtering** — Expanded heuristic rules for analysis-tool code, test files with code specimens, benchmark data, CLI tools, and utility modules
- **Scoring engine refactored** — Confidence scoring decomposed from a single 42-CC function into 7 focused helpers for maintainability

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.25.1] — 2026-03-09

### Fixed
- **PR review inline comments now work in JSON mode** — Inline review comments and approve/request-changes events were silently skipped in JSON mode; now correctly posted to GitHub
- **JSON output no longer corrupted by banner text** — Non-JSON log messages redirected to stderr so `--format json` produces clean output
- **CodeQL security alerts resolved** — Command injection, URL sanitization, and unsafe regexp construction fixes
- **ESLint warnings resolved** — Unused variable/import cleanup across multiple modules

### Changed
- **CI and dev dependency updates** — actions/configure-pages v5, vitest, biome, and Anthropic SDK bumped

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.25.0] — 2026-03-09

### Added
- **Real-time on-change evaluation** — New debounced `onDidChangeTextDocument` handler evaluates code as you type. Controlled by `judges.evaluateOnChange` (default: off) and `judges.changeDebounceMs` (default: 2000ms) settings
- **Project context awareness** — Evaluation now auto-detects frameworks, runtime, and project type to calibrate review findings
- **Evidence chains** — Findings now include multi-step evidence trails with impact statements
- **PR review narrative** — Rich review summaries with per-file breakdown, cross-cutting themes, and prioritized action items
- **Review completeness signal** — `assessReviewCompleteness()` provides coverage percentage and unreviewed file tracking

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.24.0] — 2026-03-09

### Added
- **Finding triage workflow** — New `triage set|list|summary` CLI commands for marking findings as accepted-risk, deferred, wont-fix, or false-positive
- **Multi-file context in L2 prompts** — Deep-review now accepts related file snippets for cross-file analysis
- **L2 coverage benchmark** — `benchmark l2-coverage` subcommand analyzes which L1 misses are coverable by L2 prompts
- **Benchmark ingestion** — `benchmark ingest` converts real-world findings into benchmark cases
- **Org policy management** — `config pull|lock|validate` for centralized team configuration and compliance checking

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.20] — 2026-03-08

### Fixed
- **All per-judge FP rates under 30%** — Structural parser cyclomatic-complexity counting fixed for `&&`/`||`/`?` operators; benchmark expectedRuleIds corrected
- **Benchmark: Grade A, F1=94.7%** — Up from 91.3%, 0 failures, 1022 cases

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.19] — 2026-03-08

### Added
- **Benchmark expanded to 1003 test cases** — Up from 301, covering 55 categories across 10 benchmark files
- **New benchmark coverage** — AI-agents, hallucination-detection, IaC-security, compliance, ethics, internationalization, data-sovereignty, and more

### Fixed
- **Grade A maintained** — F1=91.3%, Precision=98.0%, Recall=85.4% at 1003 cases

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.18] — 2026-03-07

### Changed
- **DOC-001 precision improved** — Cryptic-naming heuristic prevents false positives on self-documenting code (FP rate 91.3% → 0%)
- **OBS-001 precision improved** — Minimum route-count requirement prevents false positives on single-endpoint snippets (FP rate 50% → 25%)

## [3.23.17] — 2026-03-07

### Changed
- **README fully rewritten** — Adoption-focused copy with value prop, "Try in 60 seconds", noise-control guide, CI integration, and full 15-language listing
- **Default `minSeverity` raised to `"high"`** — New installs only show critical + high findings, reducing noise for first-time users
- **Preset dropdown** — Settings UI now shows named preset options (strict, lenient, security-only, startup, compliance, performance)
- **Welcome view updated** — Shows 3 actions: Evaluate Current File, Evaluate Workspace, Open @judges Chat

### Added
- **First-run toast** — One-time notification after first evaluation introduces `@judges` chat and noise-control settings
- **`Judges: Add CI Workflow` command** — Generates `.github/workflows/judges.yml` for PR-triggered evaluation
- **"Report false positive" code action** — Quick Fix action opens a pre-filled GitHub issue for any finding
- **Enhanced `/help`** — Verdict bands (PASS/WARN/FAIL), noise-control tips, and more natural-language examples
- **Better command inference** — Chat participant recognizes "run judges", "evaluate", "check" as review intent

### Fixed
- **Judge count consistency** — All references updated to 39 across extension, docs, and tests

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.16] — 2026-03-07

### Fixed
- **Benchmark F1 improved to 0.904** — TP=355, FN=75, FP=0, Grade A maintained
- **Evaluator threshold refinements** — 22 evaluators tuned for better detection of documentation gaps, logging privacy violations, reliability issues, and more
- **False-positive filter fixes** — LOGPRIV findings no longer suppressed on utility modules; DEPS findings preserved on import lines; reliability context ignores comment lines

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.15] — 2026-03-06

### Fixed
- **Marketplace publish fix** — Resolved `vsce` secret scanner false positive on benchmark test data containing a fake Slack webhook URL

## [3.23.14] — 2026-03-06

### Fixed
- **Benchmark Grade A** — F1 score improved to 0.900 (Grade A) with TP=352, FN=78, FP=0
- **False positive reductions** — Fixed SEC-018 path traversal FP on CLI tools, ERR-002 Go builtin `close()` FP
- **False negative fixes** — Added camelCase credential detection, JWT 'none' algorithm broadening, YAML IaC detection (Docker Compose + K8s), cross-line format string matching, Python `.format()` SSTI detection, multi-line empty catch detection

See [core CHANGELOG](../CHANGELOG.md) for full details.

## [3.23.13] — 2026-03-06

### Added
- **15 languages supported**: Added PHP, Ruby, Kotlin, Swift to LANG_MAP, SUPPORTED_LANGUAGES, and activationEvents; added Terraform, Bicep, PowerShell to activationEvents
- **39 judges**: Extension description updated to reflect new hallucination-detection judge

### Changed
- Code action provider now registers for all 15 supported languages
- Chat participant and LM tool language maps expanded for full language coverage

See [core CHANGELOG](../CHANGELOG.md) for full details on P3–P7 engine improvements.

## [3.23.12] — 2026-03-06

### Fixed
- **Benchmark: 79/79 (0 FN, 0 FP)** — All benchmark failures resolved; see [core CHANGELOG](../CHANGELOG.md) for full details
- **False positive reductions** — Fixed A11Y click handler on native elements, SQL injection on JSX labels, IaC egress rules, Go CLI tool detection, multi-line JSX input labels
- **False negative fixes** — Fixed absence gating for 6 evaluators, classifyFile health-check misclassification, structural parser dead-code on template literals, I18N/COMPAT filtering

### Changed
- CLI tool detection expanded to Go, Python, Rust ecosystems

## [3.23.11] — 2026-03-06

### Added
- **Security judge** — New SEC-prefixed judge (38th) with 15 rules for input validation, path traversal, file access, rate limiting, insecure randomness, and information disclosure
- **AUTH improvements** — JWT decode-without-verify detection and timing-unsafe secret comparison rules
- **CONC Go detection** — Unsynchronized map access in HTTP handlers and goroutines
- **Auto-fix patches** — 40+ new patch rules for Ruby, Rust, Kotlin, Swift, and Scala

### Fixed
- **FP reductions** — Pydantic/Django validation recognition, tighter file access input matching, URL stripping from non-production context checks
- **Benchmark: P=97.8%, R=80.2%, F1=88.1%**
- See [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.10] — 2026-03-06

### Fixed
- **Diagnostics provider fix** — Fixed diagnostic scope to avoid stale diagnostics on file close
- **Major FP reduction** — File classification ordering bug fixed: analysis-tool, CLI, and VS Code extension files are no longer misclassified as "test" or "server", eliminating ~550 false positives
- **Code quality fixes** — Extracted error code constants, added missing JSDoc `@returns` tags, refactored long functions in cache modules
- See [core CHANGELOG](../CHANGELOG.md) for full details

### Added
- **Self-evaluation build gate** — `npm run check` now runs the full judges panel on every source file as part of CI, ensuring zero findings
- **New file categories** — `analysis-tool` and `vscode-extension` categories with tailored FP suppression for analysis tooling and extension code

## [3.23.9] — 2026-03-06

### Changed
- **Deep review is now the default** — `@judges`, `/review`, and `/deepreview` all run Layer 1 + Layer 2 (pattern analysis + AI contextual review) by default
- **New `/shallowreview` command** — Fast pattern-only analysis without the LLM deep review step
- Updated help text and command descriptions for new review modes

### Fixed
- **Disk cache key correctness** — Cache key now includes `mustFixGate` options to prevent stale results
- See [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.8] — 2026-03-06

### Added
- **Disk-backed persistent cache** — Cross-run LRU cache with TTL for faster repeated evaluations
- **GitHub Actions formatter** — `--format github-actions` emits native `::error`/`::warning`/`::notice` annotations
- **Confidence explanations** — Each finding now includes an evidence basis explaining the confidence score
- **Per-path config overrides** — Glob-matched `overrides` in `.judgesrc.json` for per-directory rule/severity customization
- **LSP server scaffold** — `judges lsp --stdio` for real-time editor diagnostics
- **Block-level selective autofix** — `--rule`, `--severity`, `--lines` flags for targeted patching
- **Plugin scaffolding** — `judges scaffold-plugin` generates a starter plugin template
- **Score trend command** — `judges trend` tracks evaluation scores over time
- See [core CHANGELOG](../CHANGELOG.md) for full details on all 15 P0–P2 features

## [3.23.7] — 2026-03-05

### Added
- **`judges review` command** — Post inline review comments on GitHub PRs from the CLI with `--pr`, `--dry-run`, `--approve`, and severity filtering
- **`judges tune` command** — Analyze a project and generate optimal `.judgesrc.json` configuration with framework detection
- **8 framework-aware presets** — `react`, `express`, `fastapi`, `django`, `spring-boot`, `rails`, `nextjs`, `terraform`
- **Finding lifecycle tracking** — Fingerprint-based finding tracking with trend detection across runs
- **~15 new autofix patches** — Python, Go, Rust, Java, C# language-specific patches; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.6] — 2026-03-05

### Fixed
- **Analysis-code, CLI, and IaC template false-positive guards** — Added heuristic guards across 21+ evaluators to suppress application-code rules from misfiring on analysis/evaluator code, CLI scaffolding, and Bicep/Terraform IaC templates. Refined IAC-001 hardcoded-secret detection to filter boolean configs and enum identifiers; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.5] — 2026-03-05

### Security
- **4 Dependabot alerts resolved** — Updated transitive deps `hono` (4.12.5) and `@hono/node-server` (1.19.11) to patch CVE-2026-29045, CVE-2026-29085, CVE-2026-29086, CVE-2026-29087

### Fixed
- **5 CodeQL alerts resolved** — 4 polynomial ReDoS fixes (suppression regex, singleton detection, prompt stripping) and 1 incomplete sanitization fix (glob-to-regex escaping); see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.4] — 2025-07-26

### Fixed
- **3 self-review false-positive reductions (batch 2)** — DATA-001 compound identifier word boundary for `iv`, DB-002 database context requirement for mutation detection, SOV-001 compound identifier and import continuation filtering; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.3] — 2025-07-26

### Fixed
- **3 self-review false-positive reductions** — CONC-001 local let scope check, CYBER-001 analysis code guard, ERR-003 regex/string context filtering; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.2] — 2026-03-04

### Fixed
- **9 false-positive reductions** — Sequential Python loops in try/except, nesting depth threshold (4→5 levels), `except Exception:` no longer bare-except, docstring body sovereignty FP, multi-line signature documentation FP, format-template duplicate strings, and TYPE_CHECKING weak-type FP; see [core CHANGELOG](../CHANGELOG.md) for full details

## [3.23.1] — 2026-03-04

### Fixed
- **CI compilation fix** — Resolved 5 TypeScript type errors in new v3.23.0 modules (doctor, rule-metrics, snapshot, dedup) that caused CI failure; see [core CHANGELOG](../CHANGELOG.md) for details

## [3.23.0] — 2026-03-05

### Added
- **Doctor diagnostics** — New `judges doctor` command provides healthcheck of Node version, config, plugins, baseline, and feedback store; available via CLI `--json` flag
- **Language coverage report** — `judges coverage` analyzes which project languages are covered by the 37-judge panel
- **Finding trend tracking** — Snapshot persistence and trend analysis (improving/stable/regressing) for tracking code quality over time
- **Rule hit metrics** — Identify noisy and silent rules to tune judge configuration
- **Project auto-detection** — Init wizard now auto-detects languages, frameworks, and project type; recommends optimal preset with confidence scoring

### Changed
- **Core engine** — 16 strategic gap implementations: expanded benchmarks, 104 patch rules, V2 baselines, suppression audit trail, team feedback, rule test assertions, calibration pipeline, finding diff, and more; see [core CHANGELOG](../CHANGELOG.md) for full details
- **1982 tests passing** across all test suites

## [3.22.1] — 2026-03-04

### Fixed
- **CI fix** — Corrected JSON Schema test for preset composability; see [core CHANGELOG](../CHANGELOG.md) for details

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
