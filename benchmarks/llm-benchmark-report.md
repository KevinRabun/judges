# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/2/2026, 10:49:32 AM · **Version:** 3.125.0

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟡 **B** |
| F1 Score | 84.2% |
| Precision | 75.9% |
| Recall | 94.6% |
| Detection Rate | 88.0% |
| Cases | 500 |
| Duration | 49555s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 500 |
| Detection Rate | 88.0% (440/500) |
| Precision | 75.9% |
| Recall | 94.6% |
| F1 Score | 84.2% |
| True Positives | 770 |
| False Negatives | 44 |
| False Positives | 245 |
| Duration | 49555s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 158 | 168 | 94.0% |
| medium | 195 | 219 | 89.0% |
| hard | 87 | 113 | 77.0% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 8 | 8 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 8 | 8 | 100.0% | 82.4% | 90.3% |
| agent-security | 8 | 8 | 100.0% | 93.8% | 96.8% |
| ai-code-safety | 8 | 9 | 100.0% | 83.3% | 90.9% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 7 | 7 | 100.0% | 100.0% | 100.0% |
| ai-negative | 0 | 3 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 7 | 7 | 100.0% | 100.0% | 100.0% |
| auth | 17 | 17 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 6 | 7 | 100.0% | 66.7% | 80.0% |
| caching | 7 | 7 | 100.0% | 100.0% | 100.0% |
| ci-cd | 7 | 7 | 100.0% | 100.0% | 100.0% |
| cicd | 6 | 6 | 100.0% | 100.0% | 100.0% |
| clean | 6 | 49 | 0.0% | 100.0% | 0.0% |
| cloud | 6 | 6 | 88.9% | 100.0% | 94.1% |
| cloud-readiness | 6 | 6 | 100.0% | 100.0% | 100.0% |
| code-quality | 4 | 4 | 90.0% | 90.0% | 90.0% |
| code-structure | 7 | 7 | 100.0% | 100.0% | 100.0% |
| compatibility | 2 | 4 | 100.0% | 40.0% | 57.1% |
| compliance | 8 | 8 | 100.0% | 100.0% | 100.0% |
| concurrency | 10 | 11 | 100.0% | 93.3% | 96.6% |
| configuration | 7 | 7 | 100.0% | 90.9% | 95.2% |
| cost-effectiveness | 7 | 7 | 100.0% | 91.7% | 95.7% |
| data-security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 8 | 8 | 100.0% | 100.0% | 100.0% |
| database | 6 | 6 | 100.0% | 92.9% | 96.3% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 6 | 6 | 100.0% | 100.0% | 100.0% |
| documentation | 6 | 6 | 100.0% | 70.0% | 82.4% |
| error-handling | 8 | 8 | 100.0% | 100.0% | 100.0% |
| ethics | 8 | 8 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 8 | 8 | 100.0% | 100.0% | 100.0% |
| framework-safety | 7 | 7 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 77.8% | 87.5% |
| hallucination | 7 | 8 | 100.0% | 84.6% | 91.7% |
| hallucination-detection | 6 | 8 | 100.0% | 66.7% | 80.0% |
| iac-security | 11 | 11 | 100.0% | 100.0% | 100.0% |
| injection | 47 | 47 | 100.0% | 100.0% | 100.0% |
| internationalization | 8 | 8 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 7 | 7 | 100.0% | 94.4% | 97.1% |
| maintainability | 6 | 6 | 100.0% | 95.8% | 97.9% |
| observability | 4 | 6 | 100.0% | 75.0% | 85.7% |
| performance | 9 | 9 | 100.0% | 91.7% | 95.7% |
| portability | 7 | 7 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 6 | 6 | 100.0% | 89.5% | 94.4% |
| reliability | 7 | 7 | 100.0% | 100.0% | 100.0% |
| scalability | 7 | 8 | 94.1% | 84.2% | 88.9% |
| security | 45 | 45 | 100.0% | 100.0% | 100.0% |
| software-development | 5 | 6 | 100.0% | 77.8% | 87.5% |
| software-practices | 3 | 4 | 83.3% | 100.0% | 90.9% |
| sovereignty | 4 | 4 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 7 | 8 | 72.7% | 100.0% | 84.2% |
| user-experience | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ux | 5 | 5 | 100.0% | 100.0% | 100.0% |
| xss | 8 | 8 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 12 | 11 | 1 | 91.7% |
| AGENT | 7 | 6 | 1 | 85.7% |
| AICS | 21 | 19 | 2 | 90.5% |
| API | 32 | 17 | 14 | 54.8% |
| AUTH | 40 | 31 | 9 | 77.5% |
| CACHE | 8 | 8 | 0 | 100.0% |
| CFG | 8 | 4 | 4 | 50.0% |
| CICD | 8 | 7 | 1 | 87.5% |
| CLOUD | 15 | 9 | 6 | 60.0% |
| COH | 1 | 0 | 1 | 0.0% |
| COMP | 18 | 15 | 3 | 83.3% |
| COMPAT | 11 | 7 | 4 | 63.6% |
| CONC | 14 | 11 | 3 | 78.6% |
| COST | 23 | 19 | 4 | 82.6% |
| CYBER | 134 | 131 | 3 | 97.8% |
| DATA | 47 | 40 | 7 | 85.1% |
| DB | 26 | 14 | 12 | 53.8% |
| DEPS | 12 | 9 | 3 | 75.0% |
| DOC | 15 | 7 | 8 | 46.7% |
| ERR | 53 | 22 | 25 | 46.8% |
| ETHICS | 14 | 14 | 0 | 100.0% |
| FPR | 1 | 0 | 1 | 0.0% |
| FW | 12 | 7 | 5 | 58.3% |
| HALLU | 16 | 12 | 4 | 75.0% |
| I18N | 13 | 8 | 5 | 61.5% |
| IAC | 16 | 13 | 3 | 81.3% |
| INTENT | 4 | 0 | 4 | 0.0% |
| LOGIC | 18 | 7 | 11 | 38.9% |
| LOGPRIV | 13 | 9 | 4 | 69.2% |
| MAINT | 14 | 8 | 6 | 57.1% |
| OBS | 15 | 11 | 4 | 73.3% |
| PERF | 31 | 25 | 6 | 80.6% |
| PORTA | 9 | 8 | 1 | 88.9% |
| RATE | 20 | 8 | 12 | 40.0% |
| REL | 36 | 18 | 18 | 50.0% |
| SCALE | 29 | 20 | 9 | 69.0% |
| SEC | 109 | 100 | 1 | 99.0% |
| SOV | 16 | 14 | 2 | 87.5% |
| STRUCT | 15 | 12 | 3 | 80.0% |
| SWDEV | 27 | 7 | 20 | 25.9% |
| TEST | 28 | 15 | 13 | 53.6% |
| UX | 11 | 9 | 2 | 81.8% |

### Per-Judge — Failed Cases

60 cases failed — showing first 50:

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | LOGPRIV-001, PORTA-001, SWDEV-001 |
| clean-dockerfile-best-practices | easy | clean | — | CICD-001, CFG-001, COST-001, DEPS-01, IAC-001, PERF-001, SWDEV-001 |
| ruby-secure-controller | medium | clean | — | AUTH-001, FW-001 |
| php-secure-pdo | medium | clean | — | SCALE-001 |
| kotlin-secure-api | medium | clean | — | API-001, AUTH-001, ERR-04, HALLU-001, TEST-001 |
| clean-code-express | hard | clean | — | API-001, DATA-001, DB-001, ERR-001, RATE-01, REL-001, SWDEV-001 |
| clean-code-python | hard | clean | — | AUTH-001, DEPS-001, ERR-001, LOGPRIV-001, TEST-001 |
| conc-deep-setinterval-no-clear | easy | concurrency | CONC-001 | — |
| obs-no-logging | easy | observability | OBS-001 | — |
| obs-no-trace-spans-java | medium | observability | OBS-001 | — |
| scale-single-thread-heavy-compute-ts | hard | scalability | SOV-001, SEC-001 | — |
| test-no-tests | medium | testing | — | DOC-001, ERR-001, SWDEV-001 |
| compat-env-var-rename-ts | easy | backwards-compatibility | DATA-001 | — |
| swdev-no-linting | easy | software-practices | — | AICS-18 |
| ts-ai-hallucinated-api | medium | ai-code-safety | PERF-001 | — |
| compat-deep-browser-api-no-fallback | medium | compatibility | COST-001, SCALE-001 | — |
| compat-deep-vendor-lock-in | hard | compatibility | AICS-001 | — |
| hallu-deep-database-fake-features | hard | hallucination | COMP-001 | — |
| swdev-deep-no-error-handling | medium | software-development | SEC-001, CYBER-001 | — |
| hallu-python-json-loads-file | easy | hallucination-detection | HALLU-001 | — |
| hallu-python-fastapi-oauth2 | hard | hallucination-detection | CYBER-001, UX-001 | — |
| ai-negative-clean-auth-middleware | easy | ai-negative | — | OBS-01 |
| ai-negative-clean-error-handling | easy | ai-negative | — | ERR-001, LOGIC-001, REL-001, SCALE-001, SWDEV-001, TEST-001 |
| ai-negative-clean-validation | easy | ai-negative | — | I18N-001, SWDEV-001 |
| clean-code-hardened-node | hard | clean | — | API-001, AUTH-01, CONC-01, ERR-001, LOGPRIV-01, RATE-01, REL-001, UX-02 |
| clean-python-fastapi | hard | clean | — | CONC-001, DEPS-001, DOC-001, ERR-001, FW-001, HALLU-001, PERF-01, RATE-1, REL-01, SWDEV-001, TEST-001 |
| clean-go-handler | hard | clean | — | API-001, DB-001, DOC-001, ERR-001 |
| clean-rust-handler | hard | clean | — | ERR-01, API-01, DB-001 |
| clean-java-spring | hard | clean | — | API-001, RATE-1 |
| clean-csharp-aspnet | hard | clean | — | ERR-001, API-001, COMPAT-1, RATE-01 |
| clean-ts-utility-lib | hard | clean | — | COH-1, TEST-1 |
| clean-terraform-hardened | hard | clean | — | CLOUD-001, CFG-001, COST-001, SOV-001, DB-001, DOC-011, IAC-001, SCALE-01, SWDEV-001 |
| clean-python-data-script | hard | clean | — | COMPAT-1 |
| clean-ts-react-component | hard | clean | — | A11Y-001, I18N-001 |
| swift-secure-networking | medium | clean | — | ERR-003, TEST-001 |
| python-secure-api-clean | medium | clean | — | API-01, CONC-001, DB-005, DOC-001, ERR-004, RATE-1, REL-001, SCALE-001, SWDEV-001 |
| go-clean-api | medium | clean | — | DB-001, ERR-001, FW-001, LOGPRIV-01, TEST-001 |
| java-clean-repository | medium | clean | — | ERR-01, I18N-001, LOGIC-01, MAINT-001, REL-01, SCALE-001, SWDEV-001, TEST-001 |
| rust-clean-api | hard | clean | — | API-001, COMPAT-1, CYBER-001, DATA-001, DB-001, ERR-08 |
| python-clean-auth | hard | clean | — | AGENT-01, AICS-001, AUTH-001, CLOUD-001, STRUCT-001, COMP-002, CFG-001, DATA-001, ERR-001, FW-001, HALLU-001, I18N-001, LOGIC-001, MAINT-001, REL-001, SWDEV-001, TEST-001, FPR-001 |
| csharp-clean-controller | hard | clean | — | API-001, AUTH-001, RATE-01 |
| kotlin-clean-service | hard | clean | — | DB-001, LOGIC-001, REL-001 |
| clean-ruby-rails-controller | medium | clean | — | API-001, COMPAT-1, SWDEV-001 |
| clean-php-laravel-controller | medium | clean | — | CYBER-001, DATA-004, RATE-4, SEC-001 |
| clean-kotlin-spring-service | medium | clean | — | DB-001, ERR-01, LOGIC-001, REL-001, SCALE-001, SWDEV-001, TEST-001 |
| clean-swift-api-client | medium | clean | — | DATA-001, ERR-004, LOGIC-001, REL-001, SWDEV-001 |
| clean-java-repository | medium | clean | — | COST-001, DB-001, PERF-001, SCALE-001 |
| clean-rust-cli-tool | medium | clean | — | DOC-001, INTENT-001, LOGIC-001, MAINT-001, SWDEV-001, UX-01 |
| clean-csharp-controller | medium | clean | — | ERR-01, API-01, INTENT-001, LOGIC-005, RATE-001 |
| clean-go-grpc-server | hard | clean | — | AUTH-001, CLOUD-001, CFG-001, RATE-06 |

## Methodology

### Scoring
- **Prefix-based matching**: Rule IDs are matched by prefix (e.g., CYBER-005 matches expected CYBER-001)
- **True Positive**: Expected prefix detected in LLM response
- **False Negative**: Expected prefix not detected
- **False Positive**: Unexpected prefix detected (from unexpectedRuleIds list)
- **Detection Rate**: Percentage of cases where at least one expected rule prefix was found

### Mode
- **Per-Judge**: Each relevant judge evaluates cases independently with its specialized prompt

### Sampling
- Cases are stratified by category, difficulty, and clean/dirty split
- Per-judge mode only invokes judges whose rule prefix matches expected findings (optimization)
- Clean cases (no expected findings) are evaluated by all judges to test false positive rates
