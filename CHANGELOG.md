# Changelog

All notable changes to **@kevinrabun/judges** are documented here.

## [3.20.6] — 2026-03-03

### Fixed
- **False positive reduction — 4 new heuristics (H18–H21) + 4 new pattern entries** — Proactive FP analysis adding heuristics and extending pattern arrays to reduce false positives across common code idioms:
  - **H18**: Barrel/re-export file suppression — absence-based findings (ERR-001, OBS-001, etc.) suppressed on files where ≥80% of lines are re-exports, imports, comments, or blanks (index.ts, \_\_init\_\_.py, mod.rs barrel files)
  - **H19**: Decorator/annotation security presence — AUTH absence findings suppressed when the file contains authentication decorators (`@login_required`, `[Authorize]`, `@PreAuthorize`, `@Secured`, `@RolesAllowed`, etc.)
  - **H20**: Enum/union type definitions — keyword collision findings suppressed when all flagged lines are enum values or union type members containing security keywords as inert values (`Action.DELETE`, `type Method = "GET" | "DELETE"`)
  - **H21**: Log/error message security keywords — findings triggered by `password`/`secret`/`token`/`credential` suppressed when all flagged lines are logging calls (`logger.error(...)`, `console.warn(...)`) describing the operation rather than leaking credentials; excludes LOGPRIV/LOG-* findings that flag the logging itself as the problem
  - **Extended KEYWORD_IDENTIFIER_PATTERNS**: Added `key` pattern (matches `apiKeyHeader`, `primaryKey`, `foreignKey`, `keyVaultUrl` but NOT `apiKey` alone) and `hash` pattern (matches `contentHash`, `fileHash`, `checksumHash`, `hashCode`, `hashMap` — non-crypto contexts)
  - **Extended SAFE_IDIOM_PATTERNS**: Added log/error message suppression for security keywords in logging calls (with LOGPRIV exclusion) and HTTP routing `app.delete()`/`router.delete()` suppression for data-deletion findings

### Tests
- 32 new tests covering all new heuristics and pattern entries: key/hash identifier collision (4), log/error message idiom (4), HTTP routing delete (3), barrel/re-export files (3), decorator security presence (4), enum/union type (4), log message keyword suppression (4), TP confidence edge cases (6)
- 1606 tests, 0 failures

## [3.20.5] — 2026-03-03

### Fixed
- **False positive reduction — 6 new heuristics + 4 extended patterns** — Added six new deterministic FP heuristics to `filterFalsePositiveHeuristics` and extended three existing pattern sets, addressing 12 high-confidence false positive categories identified in regulated-policy evaluations:
  - **H12**: Distributed lock fallback — SCALE local-lock findings suppressed when Redlock/Redis/etcd/Consul/ZooKeeper distributed locking is present in the same module
  - **H13**: Retry/backoff/fallback chain — SOV-001/REL resilience findings suppressed when retry with exponential backoff or multi-tier fallback (cache→online→bundled) is implemented
  - **H14**: Constant definitions — I18N hardcoded-string findings suppressed when flagged lines are ALL_CAPS or `const` constant definitions (field-name keys, not user-facing text)
  - **H15**: Bounded-dataset tree traversal — PERF/COST O(n²) findings suppressed when code traverses tree structures (chapters→sections→articles) or operates on documented bounded datasets
  - **H16**: Read-only content fetch — SOV-002 cross-border findings suppressed when code fetches public/regulatory content with no personal data patterns
  - **H17**: Cache-age/TTL context — COMP age-verification findings suppressed when "age" appears in cache/TTL context (cache_age, max_age, stale) with no user-age patterns (dob, minor, parental)
  - **Extended WEB_ONLY_PREFIXES**: Added `I18N-` — i18n findings now gated to files with HTML/JSX/DOM patterns
  - **Extended KEYWORD_IDENTIFIER_PATTERNS**: Broadened `age` regex to cover hyphenated/underscored cache-age, stale-age, fresh-age, and age-seconds/minutes/hours/days/ms/header patterns
  - **Extended SAFE_IDIOM_PATTERNS**: Added 3 new entries — json.dumps/JSON.stringify for SOV-003 data-export findings, os.environ.get/process.env for DB-001 connection-string findings, and justified type:ignore/noqa/eslint-disable for SWDEV-001/CICD-003 suppression findings

- **Judge system prompt anti-FP guidance** — Added `FALSE POSITIVE AVOIDANCE` sections to 9 judge system prompts, providing explicit instructions to avoid known false-positive patterns at the LLM generation layer:
  - **performance.ts**: Tree traversal is O(n), not O(n²); bounded reference datasets; list comprehension flattening
  - **scalability.ts**: Distributed lock with local fallback is correct graceful degradation; two-tier locking design
  - **data-sovereignty.ts**: Retry/fallback ≡ circuit breaker; read-only reference data ≠ cross-border egress; internal serialization ≠ data export
  - **compliance.ts**: Cache-age/TTL "age" ≠ user age verification
  - **internationalization.ts**: Constant definitions ≠ user-facing strings; developer tools/MCP servers don't need i18n; sourced regulatory text
  - **cost-effectiveness.ts**: Tree/hierarchy traversal; bounded reference datasets
  - **database.ts**: Environment variable fallback defaults; in-memory/embedded database defaults
  - **code-structure.ts**: Dict[str,Any] at JSON boundaries; large single-responsibility files; async nesting ≤4
  - **software-practices.ts**: Justified suppression comments; minimum-viable async nesting; single-module cohesion

### Tests
- Added 17 new tests covering all 6 new FP heuristics (H12–H17), I18N web-only gating, safe idiom extensions (env var fallback, justified suppressions, json.dumps), with both positive (should suppress) and negative (should keep) test cases
- All 1,574 tests pass (976 judges + 218 negative + 268 subsystems + 70 extension + 42 tool-routing)

## [3.20.4] — 2026-03-03

### Fixed
- **Stale documentation counts** — Updated all references across README, docs, server.json, action.yml, package.json, Dockerfile, extension metadata, examples, and scripts from "35 judges" → "37 judges", "47 patches" → "53 patches", and test badge "1515" → "1557". Historical changelog entries left unchanged.

### Tests
- **Doc-claim verification tests** — Added 42 new tests covering: JUDGES array count assertion (exactly 37), judge schema validation (id, name, domain, description), unique judge ID enforcement, scoring penalty constants (critical=30, high=18, medium=10, low=5, info=2), confidence-weighted deductions, score floor/ceiling, positive signal bonuses (+3/+3/+3/+2/+2/+2/+2/+1/+1/+1 with cap at 15), verdict threshold logic (fail/warning/pass boundaries), and STRUCT threshold rules not previously covered: STRUCT-001 (CC>10), STRUCT-007 (file CC>40), STRUCT-008 (CC>20), STRUCT-010 (>150 lines).
- All 1,557 tests pass (976 judges + 218 negative + 251 subsystems + 70 extension + 42 tool-routing)

## [3.20.3] — 2026-03-03

### Fixed
- **Azure resource ID false positive** — Layer 2 deep review no longer flags Azure resource identifiers (policy definition IDs, role definition IDs, tenant IDs, subscription GUIDs) as "invalid GUIDs" when they contain characters outside the hex range. All three deep-review builders (single-judge, tribunal, simplified) now include explicit guidance that Azure resource IDs are opaque platform constants and must not be validated for strict UUID compliance.

## [3.20.2] — 2026-03-03

### Fixed
- **"Auto" model fallback** — When the Copilot Chat model selector is set to "auto", `request.model` returns a pseudo-model with no real endpoint. Layer 2 now catches the `sendRequest` failure and falls back to `selectChatModels()` to find a working model. Applied to both `chat-participant.ts` (deep review) and `diagnostics.ts` (deep review + refinement).

## [3.20.1] — 2026-03-03

### Fixed
- **Layer 2 now uses user-selected model** — The `/deepreview` deep review and diagnostics Layer 2 no longer hardcode `gpt-4o`. In chat, it uses `request.model` (the model the user picked in the Copilot Chat model selector). In diagnostics, it uses `selectChatModels()` without a family filter, respecting whatever models are available.

## [3.20.0] — 2026-03-06

### Added
- **PowerShell language support** — Full PowerShell analysis across all 37 judges. Includes language patterns (cmdlet-verb conventions, `Invoke-Expression` detection, `$using:` scope, credential handling, `ConvertTo-SecureString`, pipeline best practices), AST structural parsing (function/class extraction, comment association, nesting depth, dead-code detection after `throw`/`return`), taint tracking, and cross-file taint analysis. PowerShell is now recognized in all LANG_MAP entries, the structural parser, the tree-sitter AST layer, and the VS Code extension tool routing.

### Fixed
- **Deep review content-policy refusal (enhanced)** — The v3.19.6 fix (switching from `systemPrompt` to `description`) was necessary but insufficient for GDPR/IaC files where the aggregate of 37 security-related judge descriptions still triggered GPT-4o content filters. Added a three-layer defence: (1) `DEFENSIVE_PREAMBLE` framing the request as an authorised voluntary code review, (2) `isContentPolicyRefusal()` detection with automatic retry using a simplified prompt that groups judges into 7 quality dimensions instead of listing all 37, (3) alternative model family fallback when the primary model refuses. Also fixed `buildSingleJudgeDeepReviewSection` which still used `judge.systemPrompt` instead of `judge.description`.
- **Bicep/Terraform missing from LM tool LANG_MAP** — The VS Code extension's `lm-tool.ts` language map now includes `bicep` and `terraform` for parity with `chat-participant.ts` and `diagnostics.ts`.

### Tests
- All 1,472 tests pass (976 judges + 217 negative + 209 subsystems + 70 extension)

## [3.19.6] — 2026-03-03

### Fixed
- **Deep review content-policy refusal** — The `/deepreview` Layer 2 prompt concatenated all 37 judges' full `systemPrompt` text — including adversarial mandates like "hunt for exploits" and "think like an attacker" — into a single User message. LLM safety filters interpreted this as requesting help with security exploitation and refused with "Sorry, I can't assist with that." Fixed by using condensed `judge.description` (1-line summary) instead of full `systemPrompt` in tribunal mode, adding professional code-review framing, and prepending an Assistant context message to establish legitimate tool identity.

### Tests
- All 1,460 tests pass (964 judges + 217 negative + 209 subsystems + 70 extension)

## [3.19.5] — 2026-03-05

### Fixed
- **Cross-judge dedup: same-topic bridging** — Findings from different evaluators about the same known topic (e.g., API versioning, deep nesting, abrupt termination) are now deduped even when they reference different line numbers. Previously, two evaluators flagging "API endpoints without versioning" on different lines escaped dedup because the union-find only clustered same-line findings. Added known-topic bridging logic and 3 new topic patterns (`api-versioning`, `pagination`, `abrupt-termination`).
- **DOC-001: Python validators no longer flagged as undocumented** — Pydantic `@validator`, `@field_validator`, `@root_validator`, and `@property`-decorated methods are now recognized as framework internals and skipped from the exported-function-without-docs check.
- **DOC-001: Java getters/setters no longer flagged** — Trivial one-line getters/setters (`getName()`, `setName()`) are skipped from the exported-function documentation check.
- **DOC-001: Route wiring lines no longer flagged** — Method-chained route registrations (`.route(`, `.get(`, `.HandleFunc(`) are no longer flagged as API endpoints missing documentation. Only handler definitions need docs.
- **DOC-001: `main()` no longer flagged as long function** — Application entry-point `main()` functions are excluded from the long-function-with-insufficient-comments check.
- **STRUCT-005: Closures and lambdas no longer cause dead code FPs** — Go `return func(...) {` closures and C++ `return std::all_of(..., [](char c) {` lambdas are no longer treated as terminal statements that make subsequent code unreachable.
- **STRUCT-005: Braceless `if` statements no longer cause dead code FPs** — C# single-line `if (cond) return;` without braces no longer marks the next line as dead code.
- **UX-001: Server-side error responses no longer flagged as "generic error messages"** — JSON error keys (`"error"`), structured logging calls (`.Error()`, `logger.Error()`), and HTTP response builders (`HttpResponse::`, `http.Error()`) are filtered from the generic-error-message check.
- **I18N-001: Framework metadata no longer flagged as hardcoded strings** — FastAPI/Flask/OpenAPI initialization lines (`FastAPI(title="...")`) are excluded from the hardcoded-user-facing-string check.
- **MAINT: C/C++ type declarations now skip magic number check** — `int port = 8080` and similar C/C++ typed variable declarations are recognized as named assignments, not magic numbers.
- **MAINT: Unused imports no longer cross-line match** — The ES module import regex no longer accidentally matches Python's `from X import Y` syntax across line boundaries.
- **Compliance: Tighter regulated-operation detection** — Removed `sign` (matches `signIn`, `signal`) and `authorize` (matches `[Authorize]` attribute) from the regulated-operations regex. Attribute/annotation lines are now skipped.

### Changed
- **Absence promotion** — `TEST-001` ("No tests detected"), `COMP-001` ("Data model lacks classification markers"), and `REL-001` ("No retry logic") are now marked `isAbsenceBased: true` and suppressed in single-file mode alongside other absence findings.

### Tests
- 1 new dedup test (same-known-topic bridging), 1 updated test (topic bridging replaces separate-lines-no-dedup)
- All 1,460 tests pass (964 judges + 217 negative + 209 subsystems + 70 extension)

### Metrics
- Cross-language FP sweep: 134 → 122 evaluator-level findings (−12, −9.0%)
- Pipeline-level (after dedup + absence filtering): 56 → 24 findings (−32, −57.1%)
- Cumulative since v3.18.3: 170 → 122 evaluator-level (−48, −28.2%)

## [3.19.4] — 2026-03-04

### Changed
- **Absence gating via `projectMode` flag** — Absence-based findings (e.g., "no rate limiting detected", "no health check endpoint") are now suppressed in single-file evaluation and only surface during project-level analysis (`evaluateProject`). This eliminates ~78 per-file false positives that belong at the project level, not on individual source files. The `EvaluationOptions` type gains an optional `projectMode?: boolean` field; `evaluateProject()` sets it automatically.
- **Consolidated absence filtering** — Removed duplicate absence filters from `filterFalsePositiveHeuristics` (rules 12 and 13); absence gating is now handled in a single location upstream in `evaluateWithJudge`.

### Fixed
- **Go `interface{}`/`any` no longer flagged as weak type** — The WEAK_TYPE pattern for Go now only flags `unsafe.Pointer`, not idiomatic Go empty interfaces. Changed in `language-patterns.ts`, `tree-sitter-ast.ts`, and `structural-parser.ts`. Eliminates 4 FPs in the cross-language sweep.
- **Java wildcard imports no longer flagged** — `dependency-health.ts` skips wildcard import detection for Java, where `import java.util.*` is idiomatic. Eliminates 1 FP.
- **Go `os.ReadFile` no longer flagged as portability issue** — `portability.ts` skips file I/O detection for Go, where `os.ReadFile` is the standard stdlib API with no portability concern.
- **Error message prose no longer triggers DATA-001** — `looksLikeRealCredentialValue()` in `shared.ts` now checks word count; strings with 3+ words are recognized as prose/error messages rather than credential values.
- **C# async with middleware error handling no longer triggers ERR** — `error-handling.ts` detects `UseExceptionHandler`, `ExceptionFilter`, and similar ASP.NET middleware patterns and suppresses redundant async error-handling findings.
- **STRUCT-005 dead code no longer false-fires across scope boundaries** — `detectDeadCode()` in `structural-parser.ts` resets unreachable tracking at `else`/`elif`/`case`/`default`/`catch`/`finally`/`except` boundaries. Confidence reduced from 0.85 to 0.7.

### Tests
- 10 new negative regression tests covering all FP fixes above
- All 1,449 tests pass (963 judges + 217 negative + 209 subsystems + 70 extension)

### Metrics
- Cross-language FP sweep: 139 → 134 findings (−5, ~3.6% reduction at evaluator level)
- ~78 additional absence-based findings suppressed at pipeline level in single-file mode
- Cumulative since v3.18.3: 170 → 134 findings (−36, ~21.2% reduction)

## [3.19.3] — 2026-03-03

### Fixed
- **MCP tool description improvements to prevent LLM misrouting** — User prompts mentioning sovereignty, IaC, or deployment configuration were incorrectly routed to `analyze_dependencies` instead of `evaluate_code_single_judge`. Root cause: (1) `evaluate_code` and `evaluate_code_single_judge` descriptions didn't mention infrastructure-as-code file types; (2) `analyze_dependencies` description contained "supply-chain risks" which overlapped with sovereignty judge's supply chain pillar; (3) "deployment configuration" matched manifest file concepts. Fixed all three tool descriptions: evaluation tools now explicitly list Bicep/Terraform/ARM/CloudFormation support and key judge domains; `analyze_dependencies` now clarifies it only accepts package manager manifests (package.json, requirements.txt, etc.) and explicitly excludes IaC files.

### Added
- **Tool routing test suite** (`tests/tool-routing.test.ts`) — 43 automated tests using a TF-IDF scoring engine that simulates LLM tool selection against MCP tool descriptions. Includes 30 positive tests (prompt routes to correct tool across all 9 tools), 11 negative tests (IaC/sovereignty prompts must NOT route to `analyze_dependencies`, package manager prompts must NOT route to evaluation tools), and 2 regression tests reproducing the exact misrouting bug.

### Tests
- 43 new tool routing tests
- All 1,422 tests pass (963 judges + 43 routing + 207 negative + 209 subsystems)

## [3.19.2] — 2026-03-03

### Fixed
- **IaC security FP — resource-name parameters no longer flagged for `@secure()`** — Bicep parameters like `param keyVaultName string` were incorrectly flagged because the regex matched "key" inside compound names. Added post-match exclusion: if the parameter name ends with a resource-identifier suffix (`Name`, `Uri`, `Url`, `Endpoint`, `Id`, `ResourceGroup`, `Location`, `Sku`, `Region`, `Type`), it is recognized as a resource reference rather than a secret and skipped.
- **MCP server version now dynamically read from `package.json`** — The `McpServer` constructor was hardcoded to version `3.6.0` since initial creation. MCP clients may cache tool definitions keyed by server version; a stale version prevents clients from refreshing their cached tool lists. Now reads version from `package.json` at startup.

### CI
- **npm propagation wait in publish workflow** — Added a polling step (up to 10 × 15s = 150s) that verifies the npm package is visible before proceeding to MCP Registry publish, preventing the race condition that caused the v3.19.1 publish to fail on first attempt.

### Tests
- 3 new negative tests for IaC security resource-name exclusion
- All 1,379 tests pass (963 judges + 207 negative + 209 subsystems)

## [3.19.1] — 2026-03-03

### Fixed
- **CI/CD absence gating on application source files** — CI/CD absence rules (no test infrastructure, no linting, no build script) now skip files classified as server or utility code. These project-level concerns belong in config/manifest files, not individual application source files. Eliminates ~8 FPs across the 6-language sweep.
- **Framework-aware auth pattern expansion** — `hasAuthMiddleware` regex expanded from 14 to 24 alternatives, adding language-specific patterns: Python (`jwt.decode`, `OAuth2PasswordBearer`, `get_current_user`), Go (`jwt.Parse`, `jwt.ParseWithClaims`), Rust (`DecodingKey`, `auth_middleware`), C# (`[Authorize]`), and generic (`verify_token`, `check_auth`, `getCurrentUser`).
- **Magic number detection tuning** — Three new exclusions reduce false positives: (1) numbers inside string literals (e.g., `":8080"`), (2) named constant declarations (`const PORT = 8080`), (3) keyword arguments (`pool_recycle=3600`).

### Tests
- 11 new negative tests covering all three FP reduction changes
- All 1,376 tests pass (963 judges + 204 negative + 209 subsystems)

### Metrics
- Cross-language FP sweep: 152 → 139 findings (−13, ~8.6% reduction)
- Cumulative since v3.18.3: 170 → 139 findings (−31, ~18.2% reduction)

## [3.19.0] — 2026-03-04

### Added
- **Strategy 1 — Comment-stripping before pattern matching** — New `testCode(code, pattern)` utility replaces raw `pattern.test(code)` calls across 31 evaluators (184 conversions). Strips `//`, `/* */`, `#`, and Python `"""`/`'''` docstrings before testing, so patterns mentioned only in comments no longer trigger false positives. String literals are preserved so import paths, require() arguments, and route strings remain matchable.
- **Strategy 2 — Multi-line context windows** — New `getContextWindow(lines, lineNum, radius)` utility enables post-match filters to check adjacent lines. Applied to 5 high-value evaluators:
  - **cloud-readiness** — Hardcoded host/port fallback (`??`, `||`, `getenv`) detected across ±2 lines
  - **portability** — Same fallback pattern for localhost/IP addresses
  - **data-security** — JWT `algorithms=` parameter detected on adjacent lines in multi-line Python calls
  - **scalability** — `await` on blocking calls detected ±1 line
  - **ai-code-safety** — Auth-check patterns detected ±2 lines from wildcard permissions
- **Strategy 3 — Project-mode absence resolution** — New `scanProjectWideSecurityPatterns()` scans all project files for security patterns regardless of import relationships. `applyProjectWideAbsenceResolution()` reduces confidence of absence-based findings when the security category exists anywhere in the project (halved reduction vs direct-import). 5 new security categories added: health-check, graceful-shutdown, CORS, secrets-management, environment-config (total: 12).

### Tests
- 22 new tests covering all three FP reduction strategies (15 subsystem unit tests + 7 negative integration tests)
- All 1,365 tests pass (963 judges + 193 negative + 209 subsystems)

## [3.18.3] — 2026-03-03

### Fixed
- **FP reduction round 5 — cross-language sweep** — Ran all 36 evaluators against clean idiomatic code in 6 languages (Python/FastAPI, Rust/Actix-web, C#/ASP.NET Core, Java/Spring Boot, Go/stdlib, C++/REST), eliminating 21 false positives across 10 source files:
  - **CLOUD-001 / PORTA-001** — Configurable defaults (`unwrap_or_else`, `os.Getenv`, `??`, `||`, `environ.get`) no longer flagged as hardcoded hosts
  - **AICS-013** — Auth-check post-filter excludes `hasRole`, `@PreAuthorize`, `[Authorize]`, `claims.role`, CORS headers
  - **AICS-016** — `ActionResult` (C#) no longer matched as unsafe action usage; requires explicit `_` or `.` separator
  - **A11Y** — `spring` no longer matched inside words (e.g. `springframework`); form-error rule uses specific HTML element list instead of broad regex
  - **DATA-001** — Python `jwt.decode` with `algorithms=` parameter (verified decode) no longer flagged
  - **SWDEV-002** — Go `if err != nil` no longer flagged as bare exception catch
  - **CONC-001** — Go graceful-shutdown goroutines (`signal.Notify`, `Shutdown`, `SIGTERM`) recognized as managed workers
  - **CFG-001** — Go multi-line `os.Getenv` + `== ""` validation detection
  - **DOC-001** — Backward-walk now recognizes Go `//` comments, Rust `///` with `#[attr]` traversal, C# `///` with `[Attr]` traversal, Python body docstrings

### Bug Fixes
- **Undefined `lines` variable in 4 evaluators** — `cloud-readiness.ts`, `portability.ts`, `ai-code-safety.ts`, and `data-security.ts` referenced `lines[ln - 1]` where `lines` was either undefined, scoped inside an if-block, or was a line-number array instead of text lines. Post-filter logic silently failed, producing incorrect results. Each file now defines a properly scoped `code.split("\n")` variable.

### Tests
- 30+ new negative FP regression tests with true-positive preservation checks
- All 1,343 tests pass (963 judges + 186 negative + 194 subsystems)

## [3.18.2] — 2026-03-03

### Fixed
- **FP reduction round 4 — IaC gates + cross-language fixes** — 11 rules across 7 evaluators fixed to eliminate false positives on Infrastructure-as-Code files (Bicep, Terraform) and cross-language patterns:
  - **SOV-001** catch-all and data-portability rules no longer fire on IaC templates
  - **COST-001** caching and connection-pooling rules no longer fire on IaC templates
  - **DOC-002** block-comment rule gated on IaC + expanded regex to recognize Bicep `@description`, `targetScope`, `metadata`, and non-JSDoc block comments
  - **DOC-001** magic-numbers rule no longer flags Bicep numeric configuration values (SKU sizes, byte limits, retention days)
  - **CACHE-002** no-cache-headers rule gated on IaC
  - **SCALE-006** rate-limiting and **SCALE-010** circuit-breaker rules gated on IaC
  - **CLOUD-001** resource-cleanup rule gated on IaC
  - **AICS-010** input-validation rule now recognizes Java Bean Validation annotations (`@Valid`, `@NotNull`, `@NotBlank`, `@NotEmpty`, `javax.validation`, `jakarta.validation`)

### Tests
- 25 new negative tests with true-positive preservation checks covering all fixed rules
- Comprehensive empirical sweep against Bicep, Terraform, Python, Rust, Java, and Go templates
- All 1,320 tests pass (963 judges + 194 subsystems + 163 negative)

## [3.18.1] — 2026-03-03

### Fixed
- **Python nested-loop false positives** — Generator expressions (`all(x for x in items)`), list comprehensions, and `x in string` substring checks were incorrectly flagged as nested O(n²) loops by both the cost-effectiveness and performance evaluators. Two root causes fixed:
  - Loop regex matched `for` mid-line inside comprehensions/generators — now requires `for`/`while` at line start
  - Loop depth tracked via `}` brace counting, which never decrements in Python — now uses indentation-stack scoping so sequential non-nested loops are correctly recognized as siblings
- **CI lint warnings treated as errors** — Resolved 12 pre-existing ESLint warnings (`no-useless-escape`, `no-unused-vars`) across 5 files that caused CI to exit with code 1
- **Restored intentional `moment` import** — `lint-staged` had silently removed the deliberately-vulnerable `import moment from "moment"` in `sample-vulnerable-api.ts`, breaking DEPS evaluator tests. Restored with `eslint-disable-line` guard

### Removed
- Internal dev-only scripts (`cross-project-analysis.ts`, `analyze-report-findings.ts`) — not needed for production releases

### Tests
- 3 new tests: Python nested loops (TP), generator expressions (FP prevention), sequential non-nested loops (FP prevention)
- All 963 tests pass (960 judges + 3 new)

## [3.18.0] — 2025-07-09

### Improved
- **Third round false positive reduction** — Cross-project findings 11,011 → 7,898 (−28.3%, −3,113 findings) across 30 projects / 1,149 files through 7 complementary strategies:
  - **Cross-judge semantic dedup** — 8 new topic patterns in `crossEvaluatorDedup()`: `deep-nesting`, `missing-tests`, `type-safety`, `missing-healthcheck`, `missing-linting`, `missing-build-script`, `missing-documentation`, `missing-error-tracking`. Eliminates duplicate findings from different judges flagging the same conceptual issue.
  - **5 new `isAbsenceBased` flags** — Added explicit absence markers to internationalization (encoding detection), agent-instructions (AGENT-001), dependency-health (DEPS-001), cybersecurity (security headers), and rate-limiting (no 429 handling). Triggers severity cap to medium + confidence cap to 0.6.
  - **Per-file finding cap** — New `applyPerFileFindingCap()` function with default limit of 20 findings per evaluation. Prioritizes by severity → confidence → actionability (suggestedFix presence) → description length. Configurable via `maxFindingsPerFile` option (0 to disable).
  - **CI/CD project-level gating** (FP rule #12) — Suppresses all absence-based `CICD-*` findings, which are inherently project-level concerns that cannot be meaningfully assessed from individual file analysis.
  - **SOV relevance gating** (FP rule #13) — Suppresses absence-based `SOV-*` findings on files that contain no data operation patterns (SQL, fetch, axios, database access, ORM methods, store operations).
  - **DOC-001 severity adjustment** — Documentation findings handled by existing absence pipeline for appropriate severity/confidence calibration.
  - **Confidence-based progressive disclosure** — New `confidenceTier` field on `Finding` type: `"essential"` (≥0.8), `"important"` (≥0.6), `"supplementary"` (<0.6). Enables UI consumers to implement progressive disclosure of findings by confidence level.
- **Cross-project breakdown**: { essential: 3,677, important: 4,010, supplementary: 211 } | { critical: 222, high: 1,342, medium: 4,195, low: 1,865, info: 274 } | absence-based: 1,722
- All 1,358 tests pass (960 judges + 134 negative + 194 subsystems + 70 extension-logic)

## [3.17.0] — 2025-07-08

### Improved
- **Second round false positive reduction** — Cross-project findings 11,158 → 11,011 (−1.3%) from deterministic rules; additional reductions in LLM-assisted paths via precision mandates:
  - **35 `isAbsenceBased` flags** across 11 evaluators (authentication ×8, observability ×4, caching ×2, cloud-readiness ×4, configuration-management ×4, api-design ×3, reliability ×1, scalability ×2, agent-instructions ×4, accessibility ×1, data-sovereignty ×1) — triggers severity cap to medium + confidence cap to 0.6 for absence-patterned findings
  - **Project-level absence dedup** in `evaluateProject()` — groups duplicate absence findings by title, keeps only the highest-confidence instance
  - **Precision mandates injected** into LLM-facing assembly points (`prompts.ts` full-tribunal, `deep-review.ts` single-judge and tribunal paths) — overrides adversarial stance with "cite specific code evidence, do not flag absence speculatively, prefer fewer high-confidence findings"
  - **35 judge systemPrompts softened** — removed "false positives are preferred over missed [X]" and "do not give the benefit of the doubt" language from all judge files; replaced with evidence-based framing
  - **4 new FP heuristic rules** in `false-positive-review.ts`:
    - Rule 8 strengthened: absence confidence threshold raised from 0.35 → 0.45
    - Rule 9: Web-only rules (A11Y-, UX-) suppressed on non-web code (no HTML/JSX/DOM patterns)
    - Rule 10: Findings targeting empty/whitespace-only lines removed
    - Rule 11: Absence-based findings on trivially small files (<10 substantive lines) removed
- All 1,154 tests pass (960 judges + 194 subsystems)

## [3.16.0] — 2025-07-06

### Improved
- **20% false positive reduction** — Comprehensive cross-project analysis (13,981 findings across 30 projects / 1,149 files) identified and fixed 5 root cause gaps in the FP filtering pipeline, reducing findings to 11,158:
  - **Config file gating** — YAML/JSON/TOML/INI/ENV files now classified as "config" by `classifyFile()`, suppressing 30 code-only rule prefixes. YAML file findings: 891 → 0 (100% elimination)
  - **Test file suppression** — Extended `PROD_ONLY_RULE_PREFIXES` from 4 to 22 prefixes (added AGENT/AICS/PERF/PORTA/UX/I18N/A11Y/LOGPRIV/CACHE/DATA/API/SOV/DOC/MAINT/COMP/CICD/COST/SWDEV). Test file findings: 1,500 → 306 (80% reduction)
  - **Absence-based gating** — Extended `ABSENCE_GATED_PREFIXES` with 7 new prefixes (SOV/DOC/MAINT/SWDEV/COST/COMP/TEST); removed counterproductive `projectLevelKeywords` exclusion that prevented CI/CD, pipeline, and infrastructure findings from being gated on non-server files
  - **Evaluator `isAbsenceBased` flags** — Added explicit flags to 12 findings across 5 evaluators (ci-cd ×6, data-sovereignty ×1, documentation ×1, software-practices ×1, cost-effectiveness ×3)
  - **PII geo-partitioning precision** — Added line-number collection to PII storage finding in data-sovereignty evaluator, making it presence-based (specific DB operation lines) rather than falsely gated as absence-based
- **11 new subsystem tests** covering all FP improvements (194 total, was 183)
- All 1,154 tests pass (960 judges + 194 subsystems)

## [3.15.1] — 2025-07-06

### Fixed
- **ReDoS (catastrophic backtracking) in 8 evaluator/AST files** — Comprehensive audit and fix of regex patterns that could cause exponential or polynomial backtracking on adversarial or large inputs:
  - `observability.ts` — String-stripping regex `(["'\`])(?:\\.|(?!\1).)*\1` replaced with safe per-quote-type pattern
  - `ethics-bias.ts` — Same string-stripping regex fix
  - `portability.ts` — `pathSepPattern` restructured: trailing `[^...]*` moved outside the repeated `{2,}`/`{3,}` groups to eliminate NFA ambiguity between iterations
  - `cross-file-taint.ts` — `.*SOURCE.*` dynamic regex replaced with `[^\n]*SOURCE[^\n]*` to avoid O(n²) between adjacent wildcards (2 instances)
  - `software-practices.ts` — `(?:.*,\s*)?` in boolean-param detection replaced with `(?:[^,)]*,\s*)*` to eliminate `.*`/`,` overlap
  - `cybersecurity.ts` — Same `(?:.*,\s*)?` fix in mass-assignment detection
  - `scalability.ts` — `\(.*(?:length|size|count).*\)` replaced with `\([^)]*...[^)]*\)` to prevent O(n²) between adjacent wildcards
  - `ai-code-safety.ts` — Triple `.*` in f-string prompt injection pattern replaced with `[^{]*` and `[^}]*` to prevent O(n³) backtracking
- All 1143 tests pass (960 judges + 183 subsystems)

## [3.15.0] — 2026-03-02

### Reverted
- **Removed LLM-based false positive filter (v3.14.0)** — The external-API approach was architecturally wrong. Judges are agent prompts meant to leverage the calling model (Copilot, ChatGPT, etc.) via their `systemPrompt` fields — they should not call a separate LLM API with a separate API key. All v3.14.0 changes have been fully reverted:
  - Deleted `src/llm-fp-filter.ts`
  - Reverted `register-evaluation.ts`, `register-workflow.ts`, `deep-review.ts`, `api.ts`
  - Removed 15 LLM filter tests from `subsystems.test.ts`

### Added
- **False-Positive Review meta-judge** (`false-positive-review`) — A new 37th judge dedicated to FP detection, following the correct hybrid architecture:
  - **Agentic side** (`systemPrompt`): Comprehensive FP-expert persona covering a 10-category taxonomy — string literal context, comment context, test context, identifier-keyword collision, IaC gating, stdlib idiom, adjacent mitigation, import/type-only, serialization vs export, absence-based in partial code. The calling model uses this prompt in the deep review section to contextually review findings for false positives.
  - **Deterministic side** (`src/evaluators/false-positive-review.ts`): Pipeline post-processing step in `evaluateWithTribunal` that removes findings matching known FP patterns:
    - App-only rules (CYBER, AUTH, PERF, etc.) suppressed on IaC templates
    - Prod-only rules (RATE, SCALE, OBS, CLOUD) suppressed on test files
    - Findings where all target lines are comments or string literals
    - Findings targeting import/type declarations only
    - Keyword-in-identifier collisions (e.g. "age" in `maxAge`, "password" in `passwordField`)
    - Safe stdlib idioms (dict.get, JSON.stringify, path.join with literals)
    - Absence-based findings with very low confidence (<35%)
  - **15 new tests** covering all heuristic categories

## [3.14.0] — 2026-03-02 [REVERTED]

_This release has been fully reverted in v3.15.0. See above for details._

## [3.13.10] — 2026-03-02

### Fixed
- **5 evaluator false-positive fixes** from ninth round of real-world Copilot feedback (`data_loader.py` Python GDPR text loader/indexer, persisted across 3 remediation iterations):
  - **COMP-001** (compliance) — Age-verification rule now checks ±3 line context window for cache/TTL keywords (`cache`, `ttl`, `max_age`, `stale`, `freshness`, `expir`). The word "age" in cache-age/TTL logging contexts is no longer flagged as age-related user data.
  - **SOV-001** (data-sovereignty) — Region-policy rule now suppresses Python `global` scope declarations (`global my_var`), `GLOBAL_CONFIG`-style variable names, and `global_cache`/`_global` identifiers. Suppression is bypassed when the line also contains real geographic patterns (`us-`, `asia-`, `ap-`, etc.).
  - **SOV-002** (data-sovereignty) — Cross-border egress rule now requires personal/sensitive data context (`user`, `customer`, `email`, `payment`, `pii`, etc.) before flagging HTTP calls. Modules that only fetch read-only reference content (regulation text, documentation) are no longer flagged.
  - **SOV-003** (data-sovereignty) — Export-path rule now suppresses standard serialization library calls (`json.dumps`, `json.dump`, `pickle.dump`, `yaml.dump`, `csv.dump`, `msgpack`, `marshal`, `toml.dump`, `pprint`). In-memory or local-file serialization is not cross-border data export.
  - **PERF-001** (performance) — Duplicate-fetch rule now validates that `get()` calls are actual HTTP client methods (`requests.get`, `axios.get`, `http.get`, `fetch`) or use URL-like arguments (`http://`/`https://`). Python `dict.get("key")`, `config.get("name")`, and `os.environ.get("VAR")` are no longer counted as network fetches.

### Added
- **13 new regression tests** (1326 total) covering all 5 FP fixes: cache-age suppression (positive + negative), Python global keyword suppression (scope declaration, variable names, geographic passthrough), read-only content fetch (reference loader vs personal data exporter), serialization dump (json/yaml/pickle + real export passthrough), dict.get vs HTTP get (dict.get, fetch, requests.get).

## [3.13.9] — 2026-03-02

### Fixed
- **Broad IaC awareness sweep** — 11 additional rules across 7 evaluators now suppress false positives on Bicep, Terraform, and ARM templates:
  - **SOV-001** (data-sovereignty) — Region-without-policy rule gated with `!isIaCTemplate`. Bicep `@allowed` location params are policy-compliant by design.
  - **SOV-003** (data-sovereignty) — Replication/backup localization rule gated. IaC GRS/geo-redundant config is declarative infrastructure.
  - **SOV-007** (data-sovereignty) — Telemetry sovereignty rule gated. App Insights resource declarations are not telemetry data flows.
  - **SOV-009** (data-sovereignty) — Region-without-enforcement rule gated. Bicep location parameters enforce region declaratively.
  - **SOV-011** (data-sovereignty) — KMS/key sovereignty rule gated. KeyVault resource definitions are infrastructure.
  - **COMP-002** (compliance) — Tracking/analytics without consent rule gated. IaC monitoring resources are not user-tracking code.
  - **CYBER** (cybersecurity) — Auth rate-limiting rule gated. `@secure()` password/token params are not auth endpoints.
  - **AICS-008** (ai-code-safety) — Hardcoded URL rule gated. Container image references and endpoint configs in IaC are declarative.
  - **CFG-**** (configuration-management) — Full evaluator early-return for IaC templates. All CFG rules are designed for imperative code.
  - **CLOUD** (cloud-readiness) — Connection string detection gated. ARM/Bicep `connectionStrings` blocks are infrastructure wiring.
  - **CLOUD** (cloud-readiness) — Config-without-env-vars rule gated. IaC `appSettings` are declarative configuration.

### Improved
- **Extracted `isIaCTemplate` to `shared.ts`** — Centralized IaC content-detection regex (previously duplicated in 3 evaluators) into a single shared function. Detects Bicep, Terraform, and ARM template patterns.

### Added
- **11 new regression tests** (1313 total) covering all newly guarded IaC FP rules with targeted Bicep, Terraform, and ARM template fixtures, plus positive tests validating imperative app code is still flagged.

## [3.13.8] — 2026-03-02

### Fixed
- **4 evaluator false-positive fixes** from eighth round of real-world Copilot feedback (`gdpr_aks.bicep` IaC template, persisted across 3 remediation iterations):
  - **SOV-001** (data-sovereignty) — Export-path rule now gated on `!isIaCTemplate`. Bicep/Terraform/ARM templates are declarative infrastructure definitions with no data-export code paths.
  - **SOV-002** (data-sovereignty) — Jurisdiction enforcement rule now gated on `!isIaCTemplate`. Bicep enforces jurisdiction via declarative `@allowed` parameter constraints, not imperative `deny`/`throw` branches.
  - **COMP-001** (compliance) — Age-verification rule now gated on `!isIaCTemplate`. Infrastructure templates contain no age-related user data or input fields (e.g., AKS `maxAge` is a node pool setting).
  - **COST-001** (cost-effectiveness) — Nested-loop detection now gated on `!isIaCTemplate`. Declarative IaC has no imperative loop constructs.

### Added
- **8 new regression tests** (1302 total) covering all 4 IaC FP fixes with both negative (Bicep template suppressed) and positive (imperative application code still detected) cases.
- `isIaCTemplate` detection regex for Bicep (`param`, `resource`, `@allowed`, `targetScope`), Terraform (`resource`, `variable`, `provider`, `terraform {`), and ARM (`$schema...deploymentTemplate`) across 3 evaluators.

## [3.13.7] — 2026-03-02

### Fixed
- **4 evaluator false-positive fixes** from seventh round of real-world Copilot feedback (`public/app.js` browser-side JavaScript, score 91→94):
  - **DB-001** (database) — N+1 query rule now gated on `hasDatabaseContext` (DB imports, SQL statements, connection patterns). Browser-side `fetch()`, `Array.find()`, DOM `.select()` in loops are not N+1 database access.
  - **COMP-001** (compliance) — Age-related regex now uses `\bage(?![a-z])` word boundary to prevent matching `age` embedded in common words (`package`, `page`, `image`, `storage`, `manage`, `voltage`, etc.). Also word-bounded `child`, `minor`, `dob`, `coppa`.
  - **SOV-002** (data-sovereignty) — Export path rule now gated on `!isFrontendCode`. Browser code with `document.`, `window.`, `addEventListener`, `querySelector`, React/Vue/Angular/jQuery signals is UI rendering, not data export.
  - **TEST-001** (testing) — `hasTestStructure` now requires ≥2 of (`describe`, `it`, `test`) for JS/TS instead of any single match. A lone `it(` in browser code (common iterator variable) no longer triggers test evaluator.

### Added
- **8 new regression tests** (1294 total) covering all 4 FP fixes with both negative (browser code suppressed) and positive (real server/test code still detected) cases.

## [3.13.6] — 2026-03-02

### Fixed
- **5 evaluator false-positive fixes** from sixth round of real-world Copilot feedback (`public/index.html` static HTML page, score 98→99):
  - **COMP-001** (compliance) — Age-verification rule now skipped for HTML/markup files. Privacy policy text mentioning “COPPA”, “children”, “under 13” is legal disclosure, not an age-input data flow.
  - **SOV-001** (data-sovereignty) — Jurisdiction enforcement rule now gated on `!isMarkupFile`. Legal/privacy text mentioning “jurisdiction” in static HTML is not code that needs enforcement branches.
  - **PORTA-001** (portability) — Path separator rule short-circuits for markup files. Forward slashes in HTML `href`/`src` attributes are valid URL paths, not OS file-path separator misuse.
  - **CICD-001** (ci-cd) — “No test infrastructure” rule now checks `!isMarkupFile`. HTML `class=` attributes matching the `class` keyword no longer trigger source-code detection.
  - **COST-001** (cost-effectiveness) — `hasDataFetchOrServe` gated on `!isMarkupFile`. Text content mentioning “fetch” in static HTML does not need in-code caching.

### Added
- **10 new regression tests** (1286 total) covering all 5 FP fixes with both negative (HTML suppressed) and positive (real source code still detected) cases.

## [3.13.5] — 2026-03-02

### Fixed
- **7 evaluator false-positive fixes** from fifth round of real-world Copilot feedback (`src/utils.js` post-split barrel module, score 99):
  - **SOV-001** (data-sovereignty) — "Data export path without sovereignty-aware controls" now skips ES module re-export barrels (`export { ... } from '...'`). Re-export aggregation files do not perform actual data export.
  - **TEST-001** (testing) — `hasTestStructure` regex now uses `\b` word boundaries for `describe`, `it`, `test` to prevent false matches inside `emit()`, `submit()`, `split()`, `transmit()`, `exit()`. Also expanded `isConfigOrUtility` with `util|utils|helper|helpers|lib|shared|common` patterns, and restricted to file header (first 5 lines) to avoid matching incidental code-body mentions.
  - **CLOUD-001/002/003** (cloud-readiness) — Health check, graceful shutdown, and feature flag rules now gated on `hasServerCode` (requires `app.listen`, `createServer`, `express()`, Flask, Django, etc.). Utility/helper modules above the line threshold are no longer flagged.
  - **I18N-001** (internationalization) — `isDirOrModuleLoader` extended with ESM re-export barrel pattern (`export { ... } from`) to suppress "No text encoding specification" on barrel modules.
  - **COST-001** (cost-effectiveness) — "No caching strategy detected" now gated on `hasDataFetchOrServe` requiring evidence of I/O, data-fetching, or server operations (`fetch()`, `axios`, `.query()`, `db.`, `app.listen`, etc.). Pure utility modules no longer flagged.

### Added
- **10 new regression tests** (1276 total) covering all 7 FP fixes with both negative (FP suppressed) and positive (real issues still detected) cases.

## [3.13.4] — 2026-03-02

### Fixed
- **2 evaluator false-positive fixes** from fourth round of real-world Copilot feedback:
  - **I18N-001** (internationalization) — "No text encoding specification" rule now suppressed for directory/module-loader files that use `readdir`, `readdirSync`, `opendir`, `scandir`, `glob`, `import()`, `require()`, `require.resolve`, `__dirname`, or `path.join`/`path.resolve`. These files perform filesystem navigation, not text-content I/O.
  - **UX-001** (ux) — "List rendering without empty state" rule now requires UI rendering context (JSX/HTML tags, DOM manipulation, React/Vue/Angular/Svelte imports) before firing. Backend modules using `.map()`/`.forEach()` for data processing are no longer flagged.

### Added
- **4 new regression tests** (1267 total) covering both FP fixes with negative (FP suppressed) and positive (real issues still detected) cases.

## [3.13.3] — 2026-03-02

### Fixed
- **12 evaluator false-positive fixes** from third round of real-world Copilot delta feedback (score improved 97→99, high findings 7→1):
  - **SOV-001** (data-sovereignty) — region patterns inside regex `.test()` / `.match()` calls are now excluded (analysis code referencing region patterns, not actual region usage). Broadened `hasRegionPolicy` with `regionConfig`, `deploymentRegion`, `regionConstraint`, `regionAllowlist`, `regionDenylist`, `dataLocality`, `geoFence`, `geoRestrict`.
  - **AUTH-001** (authentication) — credential keywords inside regex pattern lines are now skipped (code analysis tools defining credential-detection patterns).
  - **AUTH-002** (authentication) — route detection now filters out regex `.test()` pattern references and regex-escaped route strings. Files with ≥8 `.test()` calls (code-analysis modules) are excluded as they are evaluator/analysis code, not actual unprotected endpoints.
  - **DB-001** (database) — SQL injection patterns inside regex `.test()` / `.match()` calls are now excluded (analysis code, not real SQL queries).
  - **TEST-001** (testing) — "No tests detected" rule now suppresses for code-analysis modules (≥8 regex `.test()` calls), which are analysis/evaluator modules, not undertested production code.
  - **A11Y-001** (accessibility) — files constructing ARIA helpers or accessibility utilities (`createAccessible`, `ariaHelper`, `buildAria`, `a11yProps`, `makeAccessible`, etc.) are now recognized as building accessible infrastructure and excluded from the "image missing alt" rule. Regex pattern lines also excluded.
  - **PORTA-002** (portability) — path separator detection now excludes route/API path definitions (`app.get('/api/v1/...')`, `@Get()` annotations), path/route/endpoint variable assignments, and URL-like path strings (`/api/`, `/v1/`, `/auth/`, etc.).
  - **SWDEV-003** (software-practices) — magic number detection now excludes `.length` threshold comparisons (`.length > 50`, `.length < 3`) and named constant declarations with uppercase identifiers (`const MAX_RETRIES = 5`).
  - **COMP-001** (compliance) — age-verification finding now downgrades to `low` severity (from `medium`) when age-consent middleware patterns are detected (`ageConsentMiddleware`, `parentalConsentMiddleware`, `coppaMiddleware`, `minorDataRestrict`, `childProtectionGuard`, etc.).
  - **UX-001** (ux) — inline event handler detection now suppresses entirely for React/JSX files (imports React, uses hooks, JSX/TSX). React's synthetic event props like `onClick` are standard, not inline handlers.
  - **UX-002** (ux) — form detection tightened to require actual HTML form elements (`<form>`, `<button>`, `onSubmit=`, `handleSubmit`, `formik`, `useForm`) rather than generic keyword mentions of "form" or "submit".
  - **TEST-002** (testing) — no-test-detection for production code now excluded for analysis modules with heavy regex usage.

### Added
- **17 new regression tests** (1263 total) covering all 12 false-positive fixes, including both negative cases (FP suppressed) and positive cases (real issues still detected).

## [3.14.0] — 2026-03-02

### Added
- **Combined Layer 1 + Layer 2 deep review** — new `@judges /deepreview` chat sub-command and `Judges: Deep Review (Layer 1 + Layer 2)` VS Code command. Runs all 35 deterministic evaluators (L1), then sends findings + source code to GPT-4o with the full tribunal deep-review prompt (L2) for contextual AI analysis — all in a single user action.
- **`/deepreview` chat sub-command** — streams L1 findings grouped by severity with fix buttons, then streams the L2 LLM deep-review response directly in Copilot Chat. Gracefully degrades to L1-only when no LLM is available.
- **`judges.deepReview` command** — accessible from command palette and editor context menu (🚀 icon). Runs L1 + L2 and opens the full report as a new markdown tab.
- **Deep-review prompt builders exported from public API** — `buildSingleJudgeDeepReviewSection` and `buildTribunalDeepReviewSection` are now available via `@kevinrabun/judges/api`.
- **10 new tests** (1220 total): deep-review intent detection (3), L1→L2 prompt construction (3), tribunal section validation (2), JUDGES array contract (1), API export accessibility (1).

## [3.13.2] — 2026-03-02

### Fixed
- **5 evaluator false-positive fixes** from second round of real-world Copilot review feedback:
  - **REL-001** (reliability) — empty catch blocks now suppressed when the file contains resilience infrastructure (circuit-breaker, retry wrappers, abort-signal helpers) indicating errors are intentionally handled at a higher abstraction layer.
  - **SOV-001** (data-sovereignty) — broadened `hasRegionPolicy` detection to recognize `approvedJurisdictions`, `allowedJurisdictions`, `jurisdictionPolicy`, `exportPolicy`, `egressPolicy`, and `jurisdictionGuard` patterns.
  - **SOV-003/telemetry** (data-sovereignty) — relaxed telemetry kill-switch regex: `ALLOW_EXTERNAL_TELEMETRY` is now a standalone match (no longer requires `throw|false|disabled` on the same line). Added `SovereigntyError.*telemetry` and `policy.?gate.*telemetry` patterns.
  - **SCALE-003** (scalability) — removed generic `.sleep()` from blocking-call detection (matched async sleep helpers in retry/backoff code). Now only matches language-specific blocking sleeps (`Thread.sleep`, `time.sleep`). Lines containing `await` are also excluded.
  - **COMP-001** (compliance) — PII-without-encryption rule now suppressed when the file has compliance infrastructure (`verifyAgeCompliance`, `requireParentalConsent`, `restrictDataCollection`, etc.). Age-verification regex also expanded to recognize `verifyAge`, `ageCompliance`, `requireParentalConsent`, `restrictDataCollection`.

### Added
- **11 new regression tests** (1246 total) covering all 5 false-positive fixes, including both negative cases (FP suppressed) and positive cases (real issues still detected).

## [3.13.1] — 2026-03-02

### Fixed
- **10 evaluator false-positive fixes** from real-world Copilot review feedback:
  - **REL-002** (reliability) — expanded timeout context window from 5 lines to ±15 lines; added file-level `AbortController`/`AbortSignal`/`signal` scan so files with centralized timeout handling are not flagged.
  - **SOV-002** (data-sovereignty) — added egress gate detection (`assertAllowedEgress`, `egressPolicy`, `jurisdictionCheck`, etc.) to suppress cross-border findings when a guard function exists.
  - **SOV-004** (data-sovereignty) — added centralized sovereignty response handler detection (`finalizeSovereignResponse`, `sovereigntyMiddleware`, etc.) to suppress export-path findings.
  - **SOV-007** (data-sovereignty) — added telemetry kill-switch detection; files that throw on external telemetry enable are no longer flagged.
  - **SOV-008** (data-sovereignty) — tightened PII partition rule to require concrete DB mutation evidence (SQL DML in query context or ORM method calls) instead of matching generic verbs like `create`/`save`.
  - **DOC-001** (documentation) — undocumented-function rule now only flags exported/public functions. Internal helpers, private utilities, and language-specific private patterns (`_`-prefixed in Python, non-`pub` in Rust) are skipped.
  - **A11Y form error** (accessibility) — form error ARIA rule now gated on HTML/JSX rendering evidence; pure backend files generating validation schemas are no longer flagged.
  - **SCALE-003** (scalability) — replaced generic `*Sync(` regex with an explicit list of 30+ known Node.js synchronous blocking APIs. Custom functions like `ensureModelSync()` or `performDataSync()` are no longer flagged.
  - **AUTH-002** (authentication) — added public endpoint marker detection (`isPublic`, `@PermitAll`, `noAuth`, `AllowAnonymous`, etc.) and health-check-only route file suppression.
  - **DB-006** (database) — tightened mutation detection to require SQL DML in `query()`/`execute()` context or ORM method calls; function names containing `create`/`update`/`delete` no longer trigger false positives.

### Added
- **15 new regression tests** (1235 total) covering all 10 false-positive fixes, including both negative cases (FP suppressed) and positive cases (real issues still detected) for DOC-001, A11Y, SCALE-003, AUTH-002, and DB-006.

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
