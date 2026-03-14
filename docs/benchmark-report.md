# Judges Panel — Benchmark Report

> Auto-generated on 2026-03-11T14:10:12.416Z · v3.38.0

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
| Detection Rate | 100.0% (1048/1048) |
| Precision (lenient) | 100.0% |
| Recall (lenient) | 88.6% |
| F1 Score (lenient) | 94.0% |
| Precision (strict) | 100.0% |
| Recall (strict) | 75.8% |
| F1 Score (strict) | 86.2% |
| True Positives | 1215 (strict: 1039) |
| False Negatives | 156 (strict: 332) |
| False Positives | 0 |

## False Positive Rate

**Overall FP Rate: 0.0%**

The false positive rate measures how often the tool flags code that is actually correct.
Lower is better. Industry-standard SAST tools typically range from 20-60% FP rates.

## Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 372 | 372 | 100.0% |
| medium | 469 | 469 | 100.0% |
| hard | 207 | 207 | 100.0% |

## Results by Category

| Category | Detected | Total | Precision | Recall | F1 | FP Rate |
|----------|----------|-------|-----------|--------|-----|---------|
| accessibility | 15 | 15 | 100.0% | 93.8% | 96.8% | 0.0% |
| agent-instructions | 8 | 8 | 100.0% | 80.0% | 88.9% | 0.0% |
| agent-security | 13 | 13 | 100.0% | 100.0% | 100.0% | 0.0% |
| ai-code-safety | 25 | 25 | 100.0% | 81.0% | 89.5% | 0.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| ai-logic-error | 10 | 10 | 100.0% | 76.9% | 87.0% | 0.0% |
| ai-negative | 3 | 3 | 100.0% | 100.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% | 0.0% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% | 0.0% |
| api-design | 9 | 9 | 100.0% | 100.0% | 100.0% | 0.0% |
| auth | 42 | 42 | 100.0% | 87.7% | 93.4% | 0.0% |
| backwards-compatibility | 8 | 8 | 100.0% | 100.0% | 100.0% | 0.0% |
| caching | 11 | 11 | 100.0% | 84.6% | 91.7% | 0.0% |
| ci-cd | 9 | 9 | 100.0% | 71.4% | 83.3% | 0.0% |
| cicd | 6 | 6 | 100.0% | 100.0% | 100.0% | 0.0% |
| clean | 191 | 191 | 100.0% | 100.0% | 100.0% | 0.0% |
| cloud | 6 | 6 | 100.0% | 80.0% | 88.9% | 0.0% |
| cloud-readiness | 8 | 8 | 100.0% | 78.6% | 88.0% | 0.0% |
| code-quality | 4 | 4 | 100.0% | 90.0% | 94.7% | 0.0% |
| code-structure | 9 | 9 | 100.0% | 80.0% | 88.9% | 0.0% |
| compatibility | 4 | 4 | 100.0% | 100.0% | 100.0% | 0.0% |
| compliance | 16 | 16 | 100.0% | 100.0% | 100.0% | 0.0% |
| concurrency | 25 | 25 | 100.0% | 96.8% | 98.4% | 0.0% |
| configuration | 14 | 14 | 100.0% | 84.6% | 91.7% | 0.0% |
| cost-effectiveness | 11 | 11 | 100.0% | 75.0% | 85.7% | 0.0% |
| data-security | 12 | 12 | 100.0% | 92.9% | 96.3% | 0.0% |
| data-sovereignty | 8 | 8 | 100.0% | 76.5% | 86.7% | 0.0% |
| database | 16 | 16 | 100.0% | 90.6% | 95.1% | 0.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| dependency-health | 9 | 9 | 100.0% | 90.0% | 94.7% | 0.0% |
| documentation | 17 | 17 | 100.0% | 87.5% | 93.3% | 0.0% |
| error-handling | 33 | 33 | 100.0% | 100.0% | 100.0% | 0.0% |
| ethics | 8 | 8 | 100.0% | 100.0% | 100.0% | 0.0% |
| ethics-bias | 8 | 8 | 100.0% | 100.0% | 100.0% | 0.0% |
| framework-safety | 11 | 11 | 100.0% | 88.0% | 93.6% | 0.0% |
| framework-security | 2 | 2 | 100.0% | 88.9% | 94.1% | 0.0% |
| hallucination | 32 | 32 | 100.0% | 91.4% | 95.5% | 0.0% |
| hallucination-detection | 20 | 20 | 100.0% | 92.3% | 96.0% | 0.0% |
| iac-security | 35 | 35 | 100.0% | 70.8% | 82.9% | 0.0% |
| injection | 68 | 68 | 100.0% | 91.8% | 95.7% | 0.0% |
| internationalization | 13 | 13 | 100.0% | 90.0% | 94.7% | 0.0% |
| logging-privacy | 11 | 11 | 100.0% | 84.6% | 91.7% | 0.0% |
| maintainability | 13 | 13 | 100.0% | 97.0% | 98.5% | 0.0% |
| observability | 11 | 11 | 100.0% | 86.4% | 92.7% | 0.0% |
| performance | 24 | 24 | 100.0% | 96.9% | 98.4% | 0.0% |
| portability | 12 | 12 | 100.0% | 90.9% | 95.2% | 0.0% |
| rate-limiting | 12 | 12 | 100.0% | 92.3% | 96.0% | 0.0% |
| reliability | 15 | 15 | 100.0% | 89.5% | 94.4% | 0.0% |
| scalability | 14 | 14 | 100.0% | 90.2% | 94.9% | 0.0% |
| security | 125 | 125 | 100.0% | 86.2% | 92.6% | 0.0% |
| software-development | 7 | 7 | 100.0% | 90.0% | 94.7% | 0.0% |
| software-practices | 9 | 9 | 100.0% | 76.9% | 87.0% | 0.0% |
| sovereignty | 4 | 4 | 100.0% | 100.0% | 100.0% | 0.0% |
| structure | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% | 0.0% |
| testing | 18 | 18 | 100.0% | 100.0% | 100.0% | 0.0% |
| user-experience | 2 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| ux | 12 | 12 | 100.0% | 77.8% | 87.5% | 0.0% |
| xss | 11 | 11 | 100.0% | 94.4% | 97.1% | 0.0% |

## Results by Judge

| Judge | Findings | TP | FP | Precision | FP Rate |
|-------|----------|-----|-----|-----------|---------|
| A11Y | 54 | 38 | 7 | 84.4% | 15.6% |
| AGENT | 3 | 3 | 0 | 100.0% | 0.0% |
| AICS | 182 | 64 | 9 | 87.7% | 12.3% |
| API | 204 | 45 | 16 | 73.8% | 26.2% |
| AUTH | 66 | 46 | 1 | 97.9% | 2.1% |
| CACHE | 20 | 11 | 2 | 84.6% | 15.4% |
| CFG | 9 | 2 | 0 | 100.0% | 0.0% |
| CICD | 22 | 4 | 0 | 100.0% | 0.0% |
| CLOUD | 47 | 11 | 1 | 91.7% | 8.3% |
| COMP | 99 | 40 | 7 | 85.1% | 14.9% |
| COMPAT | 26 | 10 | 0 | 100.0% | 0.0% |
| CONC | 75 | 29 | 7 | 80.6% | 19.4% |
| COST | 75 | 29 | 7 | 80.6% | 19.4% |
| CYBER | 410 | 291 | 22 | 93.0% | 7.0% |
| DATA | 187 | 64 | 5 | 92.8% | 7.2% |
| DB | 83 | 35 | 3 | 92.1% | 7.9% |
| DEPS | 24 | 17 | 4 | 81.0% | 19.0% |
| DOC | 16 | 9 | 2 | 81.8% | 18.2% |
| ERR | 131 | 50 | 16 | 75.8% | 24.2% |
| ETHICS | 12 | 9 | 1 | 90.0% | 10.0% |
| FW | 25 | 6 | 1 | 85.7% | 14.3% |
| HALLU | 9 | 7 | 0 | 100.0% | 0.0% |
| I18N | 31 | 18 | 4 | 81.8% | 18.2% |
| IAC | 87 | 69 | 10 | 87.3% | 12.7% |
| INTENT | 28 | 0 | 0 | 100.0% | 0.0% |
| LOGIC | 22 | 10 | 3 | 76.9% | 23.1% |
| LOGPRIV | 43 | 21 | 7 | 75.0% | 25.0% |
| MAINT | 15 | 11 | 2 | 84.6% | 15.4% |
| OBS | 96 | 23 | 5 | 82.1% | 17.9% |
| PERF | 127 | 59 | 13 | 81.9% | 18.1% |
| PORTA | 75 | 27 | 9 | 75.0% | 25.0% |
| RATE | 45 | 14 | 2 | 87.5% | 12.5% |
| REL | 100 | 38 | 5 | 88.4% | 11.6% |
| SCALE | 156 | 45 | 18 | 71.4% | 28.6% |
| SEC | 426 | 228 | 20 | 91.9% | 8.1% |
| SOV | 75 | 28 | 6 | 82.4% | 17.6% |
| STRUCT | 18 | 14 | 4 | 77.8% | 22.2% |
| SWDEV | 25 | 11 | 1 | 91.7% | 8.3% |
| TEST | 69 | 38 | 13 | 74.5% | 25.5% |
| UX | 67 | 18 | 7 | 72.0% | 28.0% |

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
| clean-well-documented-library-ts | ✅ | none |
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
| clean-well-tested-utility-ts | ✅ | none |
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

**Clean code FP rate: 0/191 cases had false positives (0.0%)**

---

*Generated by [Judges Panel](https://github.com/KevinRabun/judges) benchmark suite.*
