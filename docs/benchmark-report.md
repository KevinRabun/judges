# Judges Panel — Benchmark Report

> Auto-generated on 2026-03-06T20:00:40.604Z · v3.23.13

| Metric | Value |
|--------|-------|
| Overall Grade | 🟠 **C** |
| Test Cases | 301 |
| Detection Rate | 73.8% (222/301) |
| Precision (lenient) | 96.5% |
| Recall (lenient) | 63.3% |
| F1 Score (lenient) | 76.4% |
| Precision (strict) | 95.5% |
| Recall (strict) | 49.5% |
| F1 Score (strict) | 65.2% |
| True Positives | 272 (strict: 213) |
| False Negatives | 158 (strict: 217) |
| False Positives | 10 |

## False Positive Rate

**Overall FP Rate: 3.5%**

The false positive rate measures how often the tool flags code that is actually correct.
Lower is better. Industry-standard SAST tools typically range from 20-60% FP rates.

## Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 74 | 96 | 77.1% |
| medium | 100 | 144 | 69.4% |
| hard | 48 | 61 | 78.7% |

## Results by Category

| Category | Detected | Total | Precision | Recall | F1 | FP Rate |
|----------|----------|-------|-----------|--------|-----|---------|
| accessibility | 3 | 3 | 100.0% | 100.0% | 100.0% | 0.0% |
| agent-instructions | 1 | 2 | 100.0% | 33.3% | 50.0% | 0.0% |
| ai-code-safety | 2 | 5 | 100.0% | 28.6% | 44.4% | 0.0% |
| api-design | 3 | 4 | 100.0% | 75.0% | 85.7% | 0.0% |
| auth | 15 | 17 | 100.0% | 91.9% | 95.8% | 0.0% |
| authentication | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| backwards-compatibility | 3 | 3 | 100.0% | 100.0% | 100.0% | 0.0% |
| caching | 3 | 3 | 100.0% | 60.0% | 75.0% | 0.0% |
| ci-cd | 1 | 3 | 100.0% | 20.0% | 33.3% | 0.0% |
| clean | 44 | 53 | 0.0% | 100.0% | 0.0% | 100.0% |
| cloud-readiness | 3 | 4 | 100.0% | 75.0% | 85.7% | 0.0% |
| code-structure | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| compliance | 3 | 3 | 100.0% | 80.0% | 88.9% | 0.0% |
| concurrency | 5 | 8 | 100.0% | 55.6% | 71.4% | 0.0% |
| configuration | 3 | 4 | 100.0% | 57.1% | 72.7% | 0.0% |
| cost | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| cost-effectiveness | 2 | 2 | 100.0% | 66.7% | 80.0% | 0.0% |
| data-security | 4 | 5 | 100.0% | 63.6% | 77.8% | 0.0% |
| data-sovereignty | 1 | 2 | 100.0% | 33.3% | 50.0% | 0.0% |
| database | 2 | 3 | 100.0% | 66.7% | 80.0% | 0.0% |
| dependencies | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| dependency-health | 1 | 2 | 100.0% | 33.3% | 50.0% | 0.0% |
| documentation | 3 | 3 | 100.0% | 100.0% | 100.0% | 0.0% |
| error-handling | 2 | 9 | 100.0% | 30.0% | 46.2% | 0.0% |
| ethics-bias | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| framework-safety | 2 | 2 | 100.0% | 75.0% | 85.7% | 0.0% |
| i18n | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| iac | 1 | 4 | 100.0% | 16.7% | 28.6% | 0.0% |
| iac-security | 6 | 7 | 100.0% | 37.5% | 54.5% | 0.0% |
| injection | 32 | 48 | 100.0% | 66.3% | 79.8% | 0.0% |
| internationalization | 2 | 2 | 100.0% | 100.0% | 100.0% | 0.0% |
| logging-privacy | 2 | 3 | 100.0% | 33.3% | 50.0% | 0.0% |
| maintainability | 3 | 4 | 100.0% | 60.0% | 75.0% | 0.0% |
| observability | 3 | 3 | 100.0% | 75.0% | 85.7% | 0.0% |
| performance | 6 | 8 | 100.0% | 63.6% | 77.8% | 0.0% |
| portability | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| rate-limiting | 2 | 3 | 100.0% | 50.0% | 66.7% | 0.0% |
| reliability | 3 | 5 | 100.0% | 60.0% | 75.0% | 0.0% |
| scalability | 4 | 4 | 100.0% | 57.1% | 72.7% | 0.0% |
| security | 33 | 45 | 100.0% | 62.0% | 76.5% | 0.0% |
| software-practices | 2 | 2 | 100.0% | 66.7% | 80.0% | 0.0% |
| testing | 3 | 4 | 100.0% | 60.0% | 75.0% | 0.0% |
| ux | 2 | 2 | 100.0% | 100.0% | 100.0% | 0.0% |
| xss | 5 | 7 | 100.0% | 64.3% | 78.3% | 0.0% |

## Results by Judge

| Judge | Findings | TP | FP | Precision | FP Rate |
|-------|----------|-----|-----|-----------|---------|
| A11Y | 12 | 10 | 2 | 83.3% | 16.7% |
| AGENT | 2 | 2 | 0 | 100.0% | 0.0% |
| AICS | 108 | 1 | 107 | 0.9% | 99.1% |
| API | 88 | 10 | 78 | 11.4% | 88.6% |
| AUTH | 30 | 17 | 13 | 56.7% | 43.3% |
| CACHE | 52 | 4 | 48 | 7.7% | 92.3% |
| CFG | 36 | 3 | 33 | 8.3% | 91.7% |
| CICD | 12 | 1 | 11 | 8.3% | 91.7% |
| CLOUD | 26 | 3 | 23 | 11.5% | 88.5% |
| COMP | 25 | 7 | 18 | 28.0% | 72.0% |
| COMPAT | 10 | 3 | 7 | 30.0% | 70.0% |
| CONC | 31 | 6 | 25 | 19.4% | 80.6% |
| COST | 31 | 4 | 27 | 12.9% | 87.1% |
| CYBER | 125 | 77 | 48 | 61.6% | 38.4% |
| DATA | 76 | 19 | 57 | 25.0% | 75.0% |
| DB | 60 | 7 | 53 | 11.7% | 88.3% |
| DEPS | 5 | 4 | 1 | 80.0% | 20.0% |
| DOC | 230 | 3 | 227 | 1.3% | 98.7% |
| ERR | 30 | 2 | 28 | 6.7% | 93.3% |
| ETHICS | 3 | 1 | 2 | 33.3% | 66.7% |
| FW | 54 | 2 | 52 | 3.7% | 96.3% |
| I18N | 15 | 8 | 7 | 53.3% | 46.7% |
| IAC | 12 | 10 | 2 | 83.3% | 16.7% |
| LOGPRIV | 15 | 5 | 10 | 33.3% | 66.7% |
| MAINT | 76 | 2 | 74 | 2.6% | 97.4% |
| OBS | 112 | 5 | 107 | 4.5% | 95.5% |
| PERF | 64 | 11 | 53 | 17.2% | 82.8% |
| PORTA | 20 | 1 | 19 | 5.0% | 95.0% |
| RATE | 40 | 1 | 39 | 2.5% | 97.5% |
| REL | 77 | 3 | 74 | 3.9% | 96.1% |
| SCALE | 71 | 4 | 67 | 5.6% | 94.4% |
| SEC | 164 | 68 | 96 | 41.5% | 58.5% |
| SOV | 40 | 2 | 38 | 5.0% | 95.0% |
| STRUCT | 13 | 2 | 11 | 15.4% | 84.6% |
| SWDEV | 57 | 1 | 56 | 1.8% | 98.2% |
| TEST | 9 | 3 | 6 | 33.3% | 66.7% |
| UX | 45 | 3 | 42 | 6.7% | 93.3% |

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
| python-clean-auth | ❌ | AUTH-001 |
| csharp-clean-controller | ✅ | none |
| kotlin-clean-service | ❌ | ERR-001 |
| clean-ruby-rails-controller | ✅ | none |
| clean-php-laravel-controller | ❌ | CYBER-001 |
| clean-kotlin-spring-service | ❌ | DATA-001, ERR-001 |
| clean-swift-api-client | ✅ | none |
| clean-java-repository | ✅ | none |
| clean-python-dataclass | ✅ | none |
| clean-go-http-middleware | ✅ | none |
| clean-python-pytest-suite | ❌ | SEC-001 |
| clean-rust-cli-tool | ✅ | none |
| clean-csharp-controller | ✅ | none |
| clean-go-grpc-server | ✅ | none |
| clean-terraform-module | ❌ | IAC-001 |
| clean-dockerfile-best-practices | ✅ | none |
| clean-typescript-utility-lib | ✅ | none |
| clean-python-fastapi-crud | ✅ | none |
| clean-java-spring-service | ✅ | none |
| clean-node-express-middleware | ✅ | none |
| clean-go-database-repo | ❌ | DB-001 |
| clean-python-async-service | ✅ | none |
| clean-kotlin-coroutine-service | ❌ | ERR-002 |
| clean-ruby-service-object | ✅ | none |
| clean-php-middleware-stack | ❌ | RATE-001 |
| clean-swift-result-builder | ✅ | none |
| clean-typescript-event-emitter | ✅ | none |
| clean-java-stream-processing | ✅ | none |
| clean-python-django-view | ✅ | none |
| clean-go-worker-pool | ✅ | none |
| clean-rust-error-handling | ✅ | none |
| clean-csharp-repository-pattern | ✅ | none |

**Clean code FP rate: 9/53 cases had false positives (17.0%)**

## Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| ruby-command-injection | easy | injection | CYBER-001, CYBER-002 | — |
| ruby-mass-assignment | medium | security | CYBER-001, SEC-001 | — |
| ruby-path-traversal | easy | injection | CYBER-001, CYBER-002 | — |
| ruby-open-redirect | medium | security | CYBER-001, CYBER-002, SEC-001 | — |
| ruby-erb-xss | easy | xss | CYBER-001, CYBER-002 | — |
| php-command-injection | easy | injection | CYBER-001, CYBER-002 | — |
| php-file-inclusion | easy | injection | CYBER-001, CYBER-002 | — |
| php-xss-echo | easy | xss | CYBER-001, CYBER-002 | — |
| php-hardcoded-creds | easy | auth | AUTH-001, AUTH-002 | — |
| kotlin-sql-injection | easy | injection | CYBER-001, CYBER-002 | — |
| kotlin-insecure-webview | medium | security | CYBER-001, SEC-001 | — |
| kotlin-path-traversal | easy | injection | CYBER-001, CYBER-002 | — |
| swift-keychain-misuse | medium | data-security | DATA-001, SEC-001, AUTH-001 | — |
| swift-sql-injection | easy | injection | CYBER-001, CYBER-002 | — |
| python-xxe-attack | medium | security | CYBER-001, SEC-001 | — |
| python-regex-dos | hard | performance | PERF-001, CYBER-001 | — |
| go-path-traversal | easy | injection | CYBER-001, CYBER-002 | — |
| java-xxe-parsing | medium | security | CYBER-001, SEC-001 | — |
| java-weak-random | medium | security | SEC-001, AUTH-001 | — |
| java-ldap-injection | medium | injection | CYBER-001, CYBER-002 | — |
| rust-sql-injection | easy | injection | CYBER-001, CYBER-002 | — |
| ts-swallowed-errors | medium | error-handling | ERR-001 | — |
| python-bare-except | easy | error-handling | ERR-001 | — |
| go-error-ignored | easy | error-handling | ERR-001 | — |
| ts-untestable-globals | medium | testing | TEST-001, STRUCT-001 | — |
| ts-debug-mode-prod | easy | configuration | CONFIG-001, SEC-001 | — |
| ts-deprecated-deps | easy | dependency-health | DEP-001 | — |
| ts-data-sovereignty-violation | medium | data-sovereignty | DSOV-001, DATA-001 | — |
| python-biased-model | medium | ethics-bias | ETHICS-001 | — |
| ts-local-filesystem-state | medium | cloud-readiness | CLOUD-001 | — |
| ts-cicd-secrets-in-code | easy | ci-cd | AUTH-001, AUTH-002, CICD-001 | — |
| ts-no-timeout-or-retry | medium | reliability | REL-001 | — |
| python-ai-prompt-injection | medium | ai-code-safety | AI-001 | — |
| ts-agent-excessive-perms | medium | agent-instructions | AGENT-001, AI-001 | — |
| ts-os-specific-code | easy | portability | PORT-001 | — |
| python-clean-auth | hard | clean | — | AUTH-001 |
| kotlin-clean-service | hard | clean | — | ERR-001 |
| ts-ai-hallucinated-api | medium | ai-code-safety | AI-001 | — |
| python-ai-deprecated-api | medium | ai-code-safety | AI-001, DEP-001 | — |
| terraform-unencrypted-bucket | easy | iac-security | IAC-001, SEC-001, DATA-001 | — |
| python-format-string-attack | hard | injection | CYBER-001, SEC-001 | — |
| go-crypto-misuse | hard | security | SEC-001, CYBER-001 | — |
| clean-php-laravel-controller | medium | clean | — | CYBER-001 |
| clean-kotlin-spring-service | medium | clean | — | DATA-001, ERR-001 |
| auth-jwt-none-algorithm | medium | auth | AUTH-001 | — |
| conc-go-race-condition | medium | concurrency | CONC-001 | — |
| conc-python-shared-mutable-default | medium | concurrency | CONC-001 | — |
| conc-java-unsynchronized-singleton | hard | concurrency | CONC-001 | — |
| db-connection-leak | medium | database | DB-001, DATA-001 | — |
| rel-no-retry-no-circuit-breaker | medium | reliability | REL-001 | — |
| err-swallowed-exceptions | medium | error-handling | ERR-001 | — |
| err-go-ignored-errors | medium | error-handling | ERR-001 | — |
| inject-command-injection-ruby | medium | injection | CYBER-001, SEC-001 | — |
| inject-path-traversal-go | medium | security | SEC-001, CYBER-001 | — |
| perf-n-plus-1-queries | medium | performance | PERF-001 | — |
| iac-terraform-public-s3 | medium | iac | IAC-001 | — |
| clean-python-pytest-suite | easy | clean | — | SEC-001 |
| cicd-insecure-workflow | medium | ci-cd | CICD-001 | — |
| rate-no-rate-limiting-auth | medium | rate-limiting | RATE-001 | — |
| logpriv-sensitive-data-logged | easy | logging-privacy | LOGPRIV-001 | — |
| clean-terraform-module | medium | clean | — | IAC-001 |
| inject-ldap-injection-java | hard | injection | CYBER-001, SEC-001 | — |
| sec-xml-xxe-java | hard | security | CYBER-001, SEC-001 | — |
| maint-god-function | medium | maintainability | MAINT-001 | — |
| clean-go-database-repo | medium | clean | — | DB-001 |
| sec-regex-dos | hard | security | PERF-001 | — |
| go-command-injection | medium | injection | CYBER-001, SEC-001 | — |
| java-xxe-sax-parser | hard | security | CYBER-001, SEC-001 | — |
| clean-kotlin-coroutine-service | hard | clean | — | ERR-002 |
| inject-ssti-jinja | medium | injection | CYBER-001, SEC-001 | — |
| err-java-catch-throwable | medium | error-handling | ERR-001 | — |
| iac-docker-privileged | medium | iac | IAC-001, DATA-001 | — |
| iac-k8s-insecure-pod | medium | iac | IAC-001, DATA-001 | — |
| clean-php-middleware-stack | hard | clean | — | RATE-001 |
| err-kotlin-unchecked-null | medium | error-handling | ERR-001 | — |
| sec-go-tls-skip-verify | medium | security | SEC-001 | — |
| api-graphql-no-depth-limit | hard | api-design | API-001 | — |
| sec-csharp-path-traversal | medium | injection | CYBER-001, SEC-001 | — |
| dep-outdated-crypto-npm | easy | dependencies | DEP-001 | — |

---

*Generated by [Judges Panel](https://github.com/KevinRabun/judges) benchmark suite.*
