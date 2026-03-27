# Judges Panel — Benchmark Report

> Auto-generated on 2026-03-27T12:34:09.748Z · v3.123.3

## How to Read This Report

The Judges Panel uses a **dual-layer architecture** for code analysis:

### Layer 1 — Deterministic Analysis (Pattern Matching)
The first layer uses deterministic evaluators — regex patterns, AST analysis, and heuristic
rules — to identify code issues instantly, offline, and with zero LLM costs. Each of the 45
judges has a built-in `analyze()` function that scans code for known patterns. This layer is:
- **Fast** — millisecond response times
- **Reproducible** — same input always produces the same output
- **Free** — no API calls or external dependencies

Layer 1 is benchmarked on every commit via automated CI.

### Layer 2 — LLM Deep Review (AI-Powered Prompts)
The second layer uses expert persona prompts served via MCP (Model Context Protocol) to
LLM-based clients like GitHub Copilot and Claude Desktop. When invoked, the calling LLM
applies the judge's evaluation criteria to perform a deeper, context-aware analysis that can
catch issues pattern matching cannot — such as logical flaws, architectural concerns, and
nuanced security vulnerabilities.

Layer 2 is benchmarked periodically by sending test cases to an LLM API and scoring the
results against expected findings. Because LLM outputs are probabilistic, L2 scores may
vary across runs and models.

### Metrics Explained
| Metric | Description |
|--------|-------------|
| **Precision** | Of all findings reported, what percentage are real issues? Higher = fewer false alarms. |
| **Recall** | Of all known issues, what percentage are detected? Higher = fewer missed issues. |
| **F1 Score** | Harmonic mean of precision and recall — the single best indicator of overall accuracy. |
| **Detection Rate** | Percentage of test cases where at least one expected issue was found. |
| **FP Rate** | False Positive Rate — percentage of findings that are not real issues. |
| **Lenient matching** | A finding matches if its rule prefix matches (e.g., CYBER-005 matches expected CYBER-001). |
| **Strict matching** | A finding matches only with the exact rule ID. |

---

## Layer 1 — Deterministic Analysis

| Metric | Value |
|--------|-------|
| Overall Grade | 🟢 **A** |
| Test Cases | 1048 |
| Detection Rate | 90.2% (945/1048) |
| Precision (lenient) | 99.8% |
| Recall (lenient) | 82.8% |
| F1 Score (lenient) | 90.5% |
| Precision (strict) | 99.8% |
| Recall (strict) | 70.3% |
| F1 Score (strict) | 82.5% |
| True Positives | 1222 (strict: 1038) |
| False Negatives | 254 (strict: 438) |
| False Positives | 2 |

## False Positive Rate

**Overall FP Rate: 0.2%**

The false positive rate measures how often the tool flags code that is actually correct.
Lower is better. Industry-standard SAST tools typically range from 20-60% FP rates.

## Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 338 | 372 | 90.9% |
| medium | 422 | 469 | 90.0% |
| hard | 185 | 207 | 89.4% |

## Results by Category

| Category | Detected | Total | Precision | Recall | F1 | FP Rate |
|----------|----------|-------|-----------|--------|-----|---------|
| accessibility | 14 | 15 | 100.0% | 87.5% | 93.3% | 0.0% |
| agent-instructions | 6 | 8 | 100.0% | 70.6% | 82.8% | 0.0% |
| agent-security | 13 | 13 | 100.0% | 95.7% | 97.8% | 0.0% |
| ai-code-safety | 24 | 25 | 100.0% | 79.7% | 88.7% | 0.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| ai-logic-error | 10 | 10 | 100.0% | 76.9% | 87.0% | 0.0% |
| ai-negative | 3 | 3 | 100.0% | 100.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% | 0.0% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% | 0.0% |
| api-design | 8 | 9 | 100.0% | 90.9% | 95.2% | 0.0% |
| auth | 41 | 42 | 100.0% | 86.6% | 92.8% | 0.0% |
| backwards-compatibility | 6 | 8 | 100.0% | 80.0% | 88.9% | 0.0% |
| caching | 10 | 11 | 100.0% | 80.0% | 88.9% | 0.0% |
| ci-cd | 4 | 9 | 100.0% | 36.4% | 53.3% | 0.0% |
| cicd | 4 | 6 | 100.0% | 71.4% | 83.3% | 0.0% |
| clean | 189 | 191 | 85.7% | 100.0% | 92.3% | 14.3% |
| cloud | 2 | 6 | 100.0% | 37.5% | 54.5% | 0.0% |
| cloud-readiness | 7 | 8 | 100.0% | 73.3% | 84.6% | 0.0% |
| code-quality | 4 | 4 | 100.0% | 90.0% | 94.7% | 0.0% |
| code-structure | 6 | 9 | 100.0% | 50.0% | 66.7% | 0.0% |
| compatibility | 4 | 4 | 100.0% | 100.0% | 100.0% | 0.0% |
| compliance | 12 | 16 | 100.0% | 78.9% | 88.2% | 0.0% |
| concurrency | 21 | 25 | 100.0% | 85.7% | 92.3% | 0.0% |
| configuration | 10 | 14 | 100.0% | 73.3% | 84.6% | 0.0% |
| cost-effectiveness | 6 | 11 | 100.0% | 57.1% | 72.7% | 0.0% |
| data-security | 11 | 12 | 100.0% | 89.7% | 94.5% | 0.0% |
| data-sovereignty | 8 | 8 | 100.0% | 76.5% | 86.7% | 0.0% |
| database | 15 | 16 | 100.0% | 87.9% | 93.5% | 0.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| dependency-health | 8 | 9 | 100.0% | 90.0% | 94.7% | 0.0% |
| documentation | 11 | 17 | 100.0% | 71.4% | 83.3% | 0.0% |
| error-handling | 29 | 33 | 100.0% | 89.7% | 94.6% | 0.0% |
| ethics | 4 | 8 | 100.0% | 50.0% | 66.7% | 0.0% |
| ethics-bias | 4 | 8 | 100.0% | 50.0% | 66.7% | 0.0% |
| framework-safety | 11 | 11 | 100.0% | 88.0% | 93.6% | 0.0% |
| framework-security | 2 | 2 | 100.0% | 88.9% | 94.1% | 0.0% |
| hallucination | 26 | 32 | 100.0% | 79.5% | 88.6% | 0.0% |
| hallucination-detection | 18 | 20 | 100.0% | 88.5% | 93.9% | 0.0% |
| iac-security | 32 | 35 | 100.0% | 66.7% | 80.0% | 0.0% |
| injection | 67 | 68 | 100.0% | 91.2% | 95.4% | 0.0% |
| internationalization | 6 | 13 | 100.0% | 42.9% | 60.0% | 0.0% |
| logging-privacy | 11 | 11 | 100.0% | 84.6% | 91.7% | 0.0% |
| maintainability | 13 | 13 | 100.0% | 96.9% | 98.4% | 0.0% |
| observability | 9 | 11 | 100.0% | 79.2% | 88.4% | 0.0% |
| performance | 24 | 24 | 100.0% | 96.9% | 98.4% | 0.0% |
| portability | 9 | 12 | 100.0% | 71.4% | 83.3% | 0.0% |
| rate-limiting | 10 | 12 | 100.0% | 85.7% | 92.3% | 0.0% |
| reliability | 15 | 15 | 100.0% | 89.5% | 94.4% | 0.0% |
| scalability | 13 | 14 | 100.0% | 88.1% | 93.7% | 0.0% |
| security | 120 | 125 | 100.0% | 85.1% | 91.9% | 0.0% |
| software-development | 6 | 7 | 100.0% | 80.0% | 88.9% | 0.0% |
| software-practices | 8 | 9 | 100.0% | 69.2% | 81.8% | 0.0% |
| sovereignty | 3 | 4 | 100.0% | 75.0% | 85.7% | 0.0% |
| structure | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| supply-chain | 1 | 2 | 100.0% | 66.7% | 80.0% | 0.0% |
| testing | 18 | 18 | 100.0% | 100.0% | 100.0% | 0.0% |
| user-experience | 1 | 2 | 100.0% | 33.3% | 50.0% | 0.0% |
| ux | 11 | 12 | 100.0% | 76.5% | 86.7% | 0.0% |
| xss | 10 | 11 | 100.0% | 89.5% | 94.4% | 0.0% |

## Results by Judge

| Judge | Findings | TP | FP | Precision | FP Rate |
|-------|----------|-----|-----|-----------|---------|
| A11Y | 33 | 19 | 14 | 57.6% | 42.4% |
| AGENT | 2 | 2 | 0 | 100.0% | 0.0% |
| AICS | 148 | 38 | 110 | 25.7% | 74.3% |
| API | 154 | 31 | 123 | 20.1% | 79.9% |
| AUTH | 64 | 44 | 20 | 68.8% | 31.3% |
| CACHE | 18 | 8 | 10 | 44.4% | 55.6% |
| CFG | 9 | 2 | 7 | 22.2% | 77.8% |
| CICD | 22 | 3 | 19 | 13.6% | 86.4% |
| CLOUD | 44 | 10 | 34 | 22.7% | 77.3% |
| COMP | 78 | 25 | 53 | 32.1% | 67.9% |
| COMPAT | 24 | 9 | 15 | 37.5% | 62.5% |
| CONC | 67 | 24 | 43 | 35.8% | 64.2% |
| COST | 81 | 27 | 54 | 33.3% | 66.7% |
| CYBER | 327 | 236 | 91 | 72.2% | 27.8% |
| DATA | 152 | 52 | 100 | 34.2% | 65.8% |
| DB | 59 | 27 | 32 | 45.8% | 54.2% |
| DEPS | 20 | 12 | 8 | 60.0% | 40.0% |
| DOC | 124 | 11 | 113 | 8.9% | 91.1% |
| ERR | 126 | 49 | 77 | 38.9% | 61.1% |
| ETHICS | 12 | 9 | 3 | 75.0% | 25.0% |
| FW | 19 | 4 | 15 | 21.1% | 78.9% |
| HALLU | 30 | 26 | 4 | 86.7% | 13.3% |
| I18N | 14 | 6 | 8 | 42.9% | 57.1% |
| IAC | 48 | 34 | 14 | 70.8% | 29.2% |
| INTENT | 46 | 0 | 46 | 0.0% | 100.0% |
| LOGIC | 20 | 10 | 10 | 50.0% | 50.0% |
| LOGPRIV | 30 | 13 | 17 | 43.3% | 56.7% |
| MAINT | 15 | 10 | 5 | 66.7% | 33.3% |
| OBS | 96 | 22 | 74 | 22.9% | 77.1% |
| PERF | 117 | 53 | 64 | 45.3% | 54.7% |
| PORTA | 56 | 18 | 38 | 32.1% | 67.9% |
| RATE | 44 | 13 | 31 | 29.5% | 70.5% |
| REL | 98 | 37 | 61 | 37.8% | 62.2% |
| SCALE | 141 | 39 | 102 | 27.7% | 72.3% |
| SEC | 306 | 167 | 139 | 54.6% | 45.4% |
| SOV | 61 | 18 | 43 | 29.5% | 70.5% |
| STRUCT | 14 | 9 | 5 | 64.3% | 35.7% |
| SWDEV | 25 | 10 | 15 | 40.0% | 60.0% |
| TEST | 57 | 26 | 31 | 45.6% | 54.4% |
| UX | 58 | 12 | 46 | 20.7% | 79.3% |

## Clean Code (False Positive Tests)

These test cases are well-written code that should produce **zero** findings.
Any finding on these cases is a false positive.

| Case | Passed | False Positives |
|------|--------|-----------------|
| clean-code-express | ✅ | none |
| clean-code-python | ✅ | none |
| clean-code-hardened-node | ✅ | none |
| clean-python-fastapi | ✅ | none |
| clean-go-handler | ✅ | none |
| clean-rust-handler | ✅ | none |
| clean-java-spring | ✅ | none |
| clean-csharp-aspnet | ✅ | none |
| clean-ts-utility-lib | ✅ | none |
| clean-terraform-hardened | ✅ | none |
| clean-python-data-script | ✅ | none |
| clean-go-cli-tool | ✅ | none |
| clean-ts-react-component | ✅ | none |
| ruby-secure-controller | ✅ | none |
| php-secure-pdo | ✅ | none |
| kotlin-secure-api | ✅ | none |
| swift-secure-networking | ✅ | none |
| python-secure-api-clean | ✅ | none |
| go-clean-api | ✅ | none |
| java-clean-repository | ✅ | none |
| rust-clean-api | ✅ | none |
| python-clean-auth | ✅ | none |
| csharp-clean-controller | ✅ | none |
| kotlin-clean-service | ✅ | none |
| clean-ruby-rails-controller | ✅ | none |
| clean-php-laravel-controller | ✅ | none |
| clean-kotlin-spring-service | ✅ | none |
| clean-swift-api-client | ✅ | none |
| clean-java-repository | ✅ | none |
| clean-python-dataclass | ✅ | none |
| clean-go-http-middleware | ✅ | none |
| clean-python-pytest-suite | ✅ | none |
| clean-rust-cli-tool | ✅ | none |
| clean-csharp-controller | ✅ | none |
| clean-go-grpc-server | ✅ | none |
| clean-terraform-module | ✅ | none |
| clean-dockerfile-best-practices | ✅ | none |
| clean-typescript-utility-lib | ✅ | none |
| clean-python-fastapi-crud | ✅ | none |
| clean-java-spring-service | ✅ | none |
| clean-node-express-middleware | ✅ | none |
| clean-go-database-repo | ✅ | none |
| clean-python-async-service | ✅ | none |
| clean-kotlin-coroutine-service | ✅ | none |
| clean-ruby-service-object | ✅ | none |
| clean-php-middleware-stack | ✅ | none |
| clean-swift-result-builder | ✅ | none |
| clean-typescript-event-emitter | ✅ | none |
| clean-java-stream-processing | ✅ | none |
| clean-python-django-view | ✅ | none |
| clean-go-worker-pool | ✅ | none |
| clean-rust-error-handling | ✅ | none |
| clean-csharp-repository-pattern | ✅ | none |
| clean-sec-parameterized-queries | ✅ | none |
| clean-sec-bcrypt-auth | ✅ | none |
| clean-sec-input-validation | ✅ | none |
| clean-sec-csrf-protection | ✅ | none |
| clean-sec-jwt-proper | ✅ | none |
| clean-sec-python-secure-api | ✅ | none |
| clean-sec-go-secure-handler | ✅ | none |
| clean-sec-rust-safe-crypto | ✅ | none |
| clean-sec-java-prepared-stmt | ✅ | none |
| clean-sec-csharp-ef-core | ✅ | none |
| clean-sec-ruby-strong-params | ✅ | none |
| clean-sec-php-pdo-prepared | ✅ | none |
| clean-sec-python-defusedxml | ✅ | none |
| clean-sec-go-template-safe | ✅ | none |
| clean-sec-kotlin-secure-app | ✅ | none |
| clean-sec-csharp-anti-forgery | ✅ | none |
| clean-sec-python-safe-redirect | ✅ | none |
| clean-sec-swift-secure-networking | ✅ | none |
| clean-sec-rust-safe-parsing | ✅ | none |
| clean-sec-python-crypto-proper | ✅ | none |
| clean-sec-java-spring-security | ✅ | none |
| clean-sec-go-rate-limited-api | ✅ | none |
| clean-sec-php-password-hash | ✅ | none |
| clean-sec-sanitized-template | ✅ | none |
| clean-sec-yaml-safe-load | ✅ | none |
| clean-err-proper-error-handling | ✅ | none |
| clean-db-transaction-pattern | ✅ | none |
| clean-conc-bounded-parallel | ✅ | none |
| clean-perf-efficient-lookup | ✅ | none |
| clean-obs-structured-logging | ✅ | none |
| clean-maint-named-constants | ✅ | none |
| clean-test-isolated-tests | ✅ | none |
| clean-go-proper-errors | ✅ | none |
| clean-python-proper-exceptions | ✅ | none |
| clean-doc-well-documented-api | ✅ | none |
| clean-cicd-secure-workflow | ✅ | none |
| clean-struct-modular-service | ✅ | none |
| clean-well-structured-modules-py | ✅ | none |
| clean-proper-concurrency-ts | ✅ | none |
| clean-go-idiomatic-errors | ✅ | none |
| clean-rust-result-handling | ✅ | none |
| clean-kotlin-null-safety | ✅ | none |
| clean-swift-optional-binding | ✅ | none |
| clean-java-try-with-resources | ✅ | none |
| clean-php-prepared-statements | ✅ | none |
| clean-ruby-safe-sinatra | ✅ | none |
| clean-python-proper-logging | ✅ | none |
| clean-csharp-parameterized | ✅ | none |
| clean-cpp-smart-pointers | ✅ | none |
| lang-clean-rust-error-handling | ✅ | none |
| lang-clean-kotlin-coroutines | ✅ | none |
| lang-clean-swift-optionals | ✅ | none |
| lang-clean-ruby-service | ✅ | none |
| clean-iac-terraform-secure | ✅ | none |
| clean-iac-dockerfile-hardened | ✅ | none |
| clean-iac-k8s-secure-pod | ✅ | none |
| clean-cfg-validated-config | ✅ | none |
| clean-rate-express-limits | ✅ | none |
| clean-rel-retry-circuit | ✅ | none |
| clean-cache-with-ttl | ✅ | none |
| clean-scale-redis-session | ✅ | none |
| clean-cloud-aws-iam-least-priv | ✅ | none |
| clean-k8s-secure-deployment | ✅ | none |
| clean-dockerfile-multi-stage | ✅ | none |
| clean-cicd-secure-pipeline | ✅ | none |
| clean-terraform-azure-secure | ✅ | none |
| clean-cfg-vault-secrets | ✅ | none |
| clean-rel-graceful-shutdown | ✅ | none |
| clean-rate-graphql-depth | ✅ | none |
| clean-cost-tagged-resources | ✅ | none |
| clean-scale-distributed-workers | ✅ | none |
| clean-cache-stampede-prevention | ✅ | none |
| clean-cloud-gcp-secure | ✅ | none |
| clean-rel-deadletter-queue | ✅ | none |
| clean-comp-gdpr-compliant-api | ✅ | none |
| clean-comp-pci-tokenized | ✅ | none |
| clean-comp-audit-trail | ✅ | none |
| clean-a11y-accessible-form | ✅ | none |
| clean-i18n-proper-localization | ✅ | none |
| clean-ethics-fair-pricing | ✅ | none |
| clean-ux-consistent-errors | ✅ | none |
| clean-compat-versioned-api | ✅ | none |
| clean-deps-well-maintained | ✅ | none |
| clean-porta-cross-platform-paths | ✅ | none |
| clean-a11y-accessible-dropdown | ✅ | none |
| clean-sov-region-aware-storage | ✅ | none |
| clean-comp-data-retention | ✅ | none |
| clean-a11y-video-accessible | ✅ | none |
| clean-i18n-rtl-support | ✅ | none |
| clean-ethics-transparent-algo | ✅ | none |
| clean-compat-graceful-deprecation | ✅ | none |
| clean-porta-cross-platform-scripts | ✅ | none |
| clean-ux-proper-loading-states | ✅ | none |
| clean-hallu-proper-go | ✅ | none |
| clean-aics-proper-file-upload | ✅ | none |
| clean-fw-proper-django | ✅ | none |
| clean-swdev-early-return | ✅ | none |
| clean-agent-content-filter | ✅ | none |
| clean-agent-sandboxed-tools | ✅ | none |
| clean-hallu-proper-api-usage | ✅ | none |
| clean-aics-proper-auth | ✅ | none |
| clean-fw-secure-express | ✅ | none |
| clean-swdev-clean-architecture | ✅ | none |
| clean-agent-rag-with-guards | ✅ | none |
| clean-aics-proper-model-serving | ✅ | none |
| clean-aics-proper-vector-store | ✅ | none |
| clean-hallu-proper-react | ✅ | none |
| clean-well-documented-library-ts | ❌ | DOC-900 |
| clean-proper-api-design-ts | ✅ | none |
| clean-structured-logging-py | ✅ | none |
| clean-proper-error-handling-go | ✅ | none |
| clean-concurrent-go-mutex | ✅ | none |
| clean-well-tested-module-ts | ✅ | none |
| clean-portable-path-handling-ts | ✅ | none |
| clean-rate-limited-server-ts | ✅ | none |
| clean-privacy-aware-logging-ts | ✅ | none |
| clean-database-with-pool-and-index-py | ✅ | none |
| clean-terraform-well-structured-hcl | ✅ | none |
| clean-docker-multi-stage-dockerfile | ✅ | none |
| clean-github-actions-secure-yaml | ✅ | none |
| clean-data-sovereignty-compliant-ts | ✅ | none |
| clean-agent-guardrails-ts | ✅ | none |
| clean-well-tested-utility-ts | ❌ | DOC-900 |
| clean-robust-error-handling-ts | ✅ | none |
| clean-accessible-form-tsx | ✅ | none |
| clean-i18n-proper-formatting-ts | ✅ | none |
| supply-lockfile-integrity-check-ts | ✅ | none |
| clean-concurrent-worker-pool-ts | ✅ | none |
| clean-secure-api-middleware-ts | ✅ | none |
| clean-db-migration-py | ✅ | none |
| clean-logging-best-practices-ts | ✅ | none |
| clean-graceful-shutdown-ts | ✅ | none |
| clean-input-validation-zod-ts | ✅ | none |
| adv-clean-rate-limited-api-ts | ✅ | none |
| adv-clean-parameterized-query-ts | ✅ | none |
| adv-clean-env-validation-ts | ✅ | none |
| adv-clean-secure-upload-ts | ✅ | none |
| adv-clean-structured-error-handler-ts | ✅ | none |

**Clean code FP rate: 2/191 cases had false positives (1.0%)**

## Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| cost-wasteful-resources | medium | cost-effectiveness | COST-001 | — |
| i18n-hardcoded-strings | easy | internationalization | I18N-001 | — |
| python-biased-model | medium | ethics-bias | ETHICS-001 | — |
| python-ai-deprecated-api | medium | ai-code-safety | FW-001 | — |
| cicd-insecure-workflow | medium | ci-cd | CICD-001 | — |
| conc-ts-async-race | hard | concurrency | CONC-001 | — |
| sec-deep-ssrf-java-url | medium | security | SEC-001 | — |
| sec-deep-deserial-csharp-binary | medium | security | SEC-001 | — |
| sec-deep-xxe-python-etree | medium | security | SEC-001 | — |
| sec-deep-sqli-ruby-interpolation | easy | injection | SEC-001 | — |
| sec-deep-xss-go-fprintf | easy | xss | SEC-001 | — |
| err-deep-process-exit | medium | error-handling | ERR-001 | — |
| conc-deep-missing-await | medium | concurrency | CONC-001 | — |
| cicd-deep-insecure-workflow-patterns | medium | cicd | SEC-001 | — |
| obs-no-trace-spans-java | medium | observability | OBS-001 | — |
| doc-outdated-readme-example-py | medium | documentation | DOC-001 | — |
| cicd-no-test-stage-yaml | easy | ci-cd | CICD-001 | — |
| cicd-hardcoded-creds-in-pipeline-yaml | easy | ci-cd | CICD-001 | — |
| lang-go-fmt-errorf-no-wrap | medium | error-handling | ERR-001 | — |
| lang-csharp-insecure-deserialization | medium | security | SEC-001 | — |
| lang-csharp-controller-no-auth | medium | auth | AUTH-001 | — |
| lang-java-thread-unsafe-singleton | medium | concurrency | CONC-001 | — |
| lang-python-assert-validation | medium | error-handling | ERR-001 | — |
| lang-cpp-use-after-free | hard | security | SEC-001 | — |
| lang-swift-force-unwrap-chain | easy | error-handling | ERR-001 | — |
| cloud-deep-aws-wildcard-iam | easy | cloud | IAC-001 | — |
| cfg-deep-env-no-validation | easy | configuration | CFG-001 | — |
| iac-deep-terraform-no-logging | medium | iac-security | IAC-001 | — |
| iac-deep-terraform-unencrypted-ebs | easy | iac-security | IAC-001 | — |
| cicd-deep-self-hosted-runner-risk | hard | cicd | CICD-001 | — |
| cloud-deep-gcp-default-network | medium | cloud | CLOUD-001 | — |
| cloud-deep-aws-rds-no-ssl | hard | cloud | CLOUD-001 | — |
| cloud-deep-aws-lambda-vpc-no-nat | hard | cloud | CLOUD-001 | — |
| cost-deep-no-resource-tags | easy | cost-effectiveness | COST-001 | — |
| cost-deep-over-provisioned-instance | medium | cost-effectiveness | COST-001 | — |
| scale-deep-global-singleton-state | hard | scalability | SCALE-001 | — |
| rate-deep-graphql-no-depth | hard | rate-limiting | RATE-001 | — |
| rate-deep-websocket-no-limit | medium | rate-limiting | RATE-001 | — |
| comp-deep-minor-data-no-coppa | hard | compliance | COMP-001 | — |
| ethics-deep-discriminatory-pricing | easy | ethics | ETHICS-001 | — |
| ethics-deep-addictive-mechanics | hard | ethics | ETHICS-001 | — |
| a11y-deep-color-only-indicator | medium | accessibility | A11Y-001 | — |
| i18n-deep-date-format-hardcoded | medium | internationalization | I18N-001 | — |
| i18n-deep-string-concat-plurals | medium | internationalization | I18N-001 | — |
| i18n-deep-regex-ascii-only | medium | internationalization | I18N-001 | — |
| ux-deep-inconsistent-error-messages | medium | ux | UX-001 | — |
| comp-deep-right-to-erasure-missing | hard | compliance | COMP-001 | — |
| comp-deep-biometric-no-consent | hard | compliance | COMP-001 | — |
| sov-deep-cdn-no-geo-restriction | hard | sovereignty | SOV-001 | — |
| ethics-deep-shadow-banning | hard | ethics | ETHICS-001 | — |
| ethics-deep-algorithmic-bias-hiring | hard | ethics | ETHICS-001 | — |
| deps-deep-typosquat-risk | easy | dependency-health | DEPS-001 | — |
| i18n-deep-locale-dependent-sorting | hard | internationalization | I18N-001 | — |
| hallu-deep-fake-api-import | medium | hallucination | HALLU-001 | — |
| hallu-deep-nonexistent-method | easy | hallucination | HALLU-001 | — |
| hallu-deep-wrong-config-options | medium | hallucination | HALLU-001 | — |
| hallu-deep-invented-css-properties | medium | hallucination | HALLU-001 | — |
| swdev-deep-god-class | medium | software-development | MAINT-001 | — |
| hallu-deep-terraform-fake-resources | hard | hallucination | HALLU-001 | — |
| hallu-deep-env-var-nonexistent | easy | hallucination | HALLU-001 | — |
| struct-deeply-nested-conditionals-py | easy | code-structure | STRUCT-001 | — |
| struct-god-class-java | medium | code-structure | STRUCT-001, MAINT-001, DOC-001 | — |
| agent-unrestricted-tool-access-ts | medium | agent-instructions | AGENT-001 | — |
| agent-system-prompt-injection-py | hard | agent-instructions | AGENT-001 | — |
| ethics-age-filtering-ts | medium | ethics-bias | ETHICS-001 | — |
| ethics-biased-training-data-py | hard | ethics-bias | ETHICS-001 | — |
| ethics-location-pricing-js | medium | ethics-bias | ETHICS-001 | — |
| cicd-secrets-in-workflow-yaml | easy | ci-cd | CICD-001 | — |
| cicd-no-pinned-actions-yaml | medium | ci-cd | CICD-001 | — |
| compat-removed-method-signature-ts | medium | backwards-compatibility | COMPAT-001 | — |
| compat-dropped-optional-param-java | easy | backwards-compatibility | COMPAT-001 | — |
| doc-missing-module-docs-py | easy | documentation | DOC-001 | — |
| doc-complex-config-no-docs-ts | medium | documentation | DOC-001 | — |
| doc-undocumented-go-package | easy | documentation | DOC-001 | — |
| api-inconsistent-error-responses-py | medium | api-design | API-001 | — |
| swdev-no-gitignore-sensitive-py | easy | software-practices | SWDEV-001 | — |
| porta-os-specific-commands-py | easy | portability | PORTA-001 | — |
| porta-registry-access-csharp | medium | portability | PORTA-001 | — |
| cache-repeated-db-queries-ts | easy | caching | CACHE-001 | — |
| cfg-scattered-env-no-validation-ts | easy | configuration | CFG-001 | — |
| cost-oversized-lambda-py | easy | cost-effectiveness | COST-001 | — |
| clean-well-documented-library-ts | easy | clean | — | DOC-900 |
| hallu-python-typing-protocol | medium | hallucination-detection | HALLU-001 | — |
| struct-circular-dependency-ts | medium | code-structure | STRUCT-001 | — |
| doc-no-api-changelog-ts | medium | documentation | DOC-001 | — |
| cloud-singleton-state-ts | medium | cloud-readiness | CLOUD-001 | — |
| data-graphql-introspection-ts | hard | data-security | DATA-001 | — |
| obs-lost-error-context-ts | medium | observability | OBS-001 | — |
| cfg-secrets-in-config-file-json | easy | configuration | CFG-001 | — |
| i18n-hardcoded-currency-ts | easy | internationalization | I18N-001 | — |
| ux-confusing-error-messages-ts | easy | user-experience | UX-001 | — |
| supply-typosquatting-risk-json | medium | supply-chain | DEPS-001 | — |
| conc-async-generator-deadlock-py | hard | concurrency | CONC-001 | — |
| cost-no-resource-cleanup-py | hard | cost-effectiveness | COST-001 | — |
| porta-os-specific-path-sep-ts | easy | portability | PORTA-001 | — |
| i18n-string-length-validation-ts | hard | internationalization | I18N-001 | — |
| comp-no-license-header-ts | easy | compliance | COMP-001 | — |
| clean-well-tested-utility-ts | medium | clean | — | DOC-900 |
| doc-jsdoc-param-mismatch-ts | easy | documentation | DOC-001 | — |
| db-concurrent-counter-no-lock-py | medium | database | DB-001 | — |
| hallu-css-parent-selector | easy | hallucination-detection | HALLU-001 | — |
| cfg-env-not-validated-ts | easy | configuration | CFG-001 | — |
| adv-iac-s3-no-versioning-hcl | easy | iac-security | IAC-001 | — |

---

*Generated by [Judges Panel](https://github.com/KevinRabun/judges) benchmark suite.*
