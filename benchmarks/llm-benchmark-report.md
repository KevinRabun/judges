# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/3/2026, 2:42:45 PM · **Version:** 3.126.0

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟡 **B** |
| F1 Score | 87.4% |
| Precision | 81.7% |
| Recall | 94.0% |
| Detection Rate | 90.0% |
| Cases | 500 |
| Duration | 91130s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 500 |
| Detection Rate | 90.0% (450/500) |
| Precision | 81.7% |
| Recall | 94.0% |
| F1 Score | 87.4% |
| True Positives | 765 |
| False Negatives | 49 |
| False Positives | 171 |
| Duration | 91130s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 160 | 168 | 95.2% |
| medium | 195 | 219 | 89.0% |
| hard | 95 | 113 | 84.1% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 8 | 8 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 8 | 8 | 100.0% | 76.5% | 86.7% |
| agent-security | 8 | 8 | 100.0% | 93.8% | 96.8% |
| ai-code-safety | 8 | 9 | 100.0% | 83.3% | 90.9% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 7 | 7 | 100.0% | 100.0% | 100.0% |
| ai-negative | 2 | 3 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 7 | 7 | 100.0% | 100.0% | 100.0% |
| auth | 17 | 17 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 6 | 7 | 100.0% | 66.7% | 80.0% |
| caching | 7 | 7 | 100.0% | 100.0% | 100.0% |
| ci-cd | 6 | 7 | 90.0% | 100.0% | 94.7% |
| cicd | 6 | 6 | 100.0% | 100.0% | 100.0% |
| clean | 12 | 49 | 0.0% | 100.0% | 0.0% |
| cloud | 6 | 6 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 6 | 6 | 100.0% | 90.9% | 95.2% |
| code-quality | 4 | 4 | 100.0% | 80.0% | 88.9% |
| code-structure | 7 | 7 | 100.0% | 90.0% | 94.7% |
| compatibility | 3 | 4 | 100.0% | 60.0% | 75.0% |
| compliance | 8 | 8 | 100.0% | 100.0% | 100.0% |
| concurrency | 10 | 11 | 93.3% | 93.3% | 93.3% |
| configuration | 7 | 7 | 100.0% | 90.9% | 95.2% |
| cost-effectiveness | 7 | 7 | 91.7% | 91.7% | 91.7% |
| data-security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 8 | 8 | 100.0% | 100.0% | 100.0% |
| database | 6 | 6 | 100.0% | 100.0% | 100.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 6 | 6 | 100.0% | 100.0% | 100.0% |
| documentation | 6 | 6 | 100.0% | 80.0% | 88.9% |
| error-handling | 8 | 8 | 100.0% | 100.0% | 100.0% |
| ethics | 8 | 8 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 8 | 8 | 100.0% | 100.0% | 100.0% |
| framework-safety | 7 | 7 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 55.6% | 71.4% |
| hallucination | 7 | 8 | 100.0% | 76.9% | 87.0% |
| hallucination-detection | 6 | 8 | 100.0% | 66.7% | 80.0% |
| iac-security | 11 | 11 | 100.0% | 100.0% | 100.0% |
| injection | 47 | 47 | 100.0% | 100.0% | 100.0% |
| internationalization | 8 | 8 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 7 | 7 | 100.0% | 94.4% | 97.1% |
| maintainability | 6 | 6 | 100.0% | 91.7% | 95.7% |
| observability | 4 | 6 | 100.0% | 75.0% | 85.7% |
| performance | 9 | 9 | 100.0% | 91.7% | 95.7% |
| portability | 7 | 7 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 6 | 6 | 100.0% | 84.2% | 91.4% |
| reliability | 7 | 7 | 100.0% | 100.0% | 100.0% |
| scalability | 8 | 8 | 100.0% | 89.5% | 94.4% |
| security | 45 | 45 | 100.0% | 100.0% | 100.0% |
| software-development | 5 | 6 | 100.0% | 77.8% | 87.5% |
| software-practices | 4 | 4 | 100.0% | 100.0% | 100.0% |
| sovereignty | 4 | 4 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 7 | 8 | 88.9% | 100.0% | 94.1% |
| user-experience | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ux | 5 | 5 | 100.0% | 100.0% | 100.0% |
| xss | 8 | 8 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 11 | 11 | 0 | 100.0% |
| AGENT | 7 | 6 | 1 | 85.7% |
| AICS | 22 | 20 | 2 | 90.9% |
| API | 24 | 17 | 7 | 70.8% |
| AUTH | 39 | 31 | 8 | 79.5% |
| CACHE | 8 | 8 | 0 | 100.0% |
| CFG | 6 | 3 | 3 | 50.0% |
| CICD | 7 | 7 | 0 | 100.0% |
| CLOUD | 16 | 9 | 7 | 56.3% |
| COMP | 16 | 15 | 1 | 93.8% |
| COMPAT | 11 | 6 | 5 | 54.5% |
| CONC | 14 | 12 | 2 | 85.7% |
| COST | 20 | 18 | 2 | 90.0% |
| CYBER | 134 | 131 | 3 | 97.8% |
| DATA | 42 | 40 | 2 | 95.2% |
| DB | 23 | 14 | 9 | 60.9% |
| DEPS | 9 | 9 | 0 | 100.0% |
| DOC | 9 | 5 | 4 | 55.6% |
| ERR | 52 | 22 | 24 | 47.8% |
| ETHICS | 14 | 14 | 0 | 100.0% |
| FPR | 3 | 0 | 3 | 0.0% |
| FW | 11 | 6 | 5 | 54.5% |
| HALLU | 16 | 12 | 4 | 75.0% |
| I18N | 9 | 8 | 1 | 88.9% |
| IAC | 15 | 13 | 2 | 86.7% |
| INTENT | 4 | 0 | 4 | 0.0% |
| LOGIC | 17 | 7 | 10 | 41.2% |
| LOGPRIV | 11 | 9 | 2 | 81.8% |
| MAINT | 12 | 8 | 4 | 66.7% |
| OBS | 12 | 11 | 1 | 91.7% |
| PERF | 28 | 24 | 4 | 85.7% |
| PORTA | 8 | 8 | 0 | 100.0% |
| RATE | 14 | 8 | 6 | 57.1% |
| REL | 30 | 19 | 11 | 63.3% |
| SCALE | 27 | 20 | 7 | 74.1% |
| SEC | 114 | 100 | 5 | 95.2% |
| SOV | 15 | 14 | 1 | 93.3% |
| STRUCT | 13 | 12 | 1 | 92.3% |
| SWDEV | 22 | 7 | 15 | 31.8% |
| TEST | 20 | 15 | 5 | 75.0% |
| UX | 8 | 8 | 0 | 100.0% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | LOGIC-001 |
| clean-dockerfile-best-practices | easy | clean | — | CLOUD-001, COST-001, DOC-001, PERF-001, SWDEV-001 |
| ruby-secure-controller | medium | clean | — | AUTH-001 |
| php-secure-pdo | medium | clean | — | SCALE-001 |
| kotlin-secure-api | medium | clean | — | AUTH-001, ERR-004, HALLU-001 |
| clean-code-express | hard | clean | — | AUTH-001, CFG-001, ERR-001, RATE-01, REL-001, SWDEV-001 |
| clean-code-python | hard | clean | — | ERR-001, FW-001, LOGPRIV-001 |
| conc-deep-setinterval-no-clear | easy | concurrency | CONC-001 | — |
| obs-no-logging | easy | observability | OBS-001 | — |
| obs-no-trace-spans-java | medium | observability | OBS-001 | — |
| test-no-tests | medium | testing | — | ERR-001 |
| compat-env-var-rename-ts | easy | backwards-compatibility | DATA-001 | — |
| cicd-no-pipeline | easy | ci-cd | — | ERR-1 |
| ts-ai-hallucinated-api | medium | ai-code-safety | PERF-001 | — |
| compat-deep-browser-api-no-fallback | medium | compatibility | COST-001, SCALE-001 | — |
| hallu-deep-database-fake-features | hard | hallucination | COMP-001 | — |
| swdev-deep-no-error-handling | medium | software-development | SEC-001, CYBER-001 | — |
| hallu-python-json-loads-file | easy | hallucination-detection | HALLU-001 | — |
| hallu-python-fastapi-oauth2 | hard | hallucination-detection | CYBER-001, UX-001 | — |
| ai-negative-clean-error-handling | easy | ai-negative | — | DB-001, ERR-09, LOGIC-001, REL-001, SCALE-001, SWDEV-001, TEST-001 |
| clean-code-hardened-node | hard | clean | — | COMPAT-1, DATA-001, ERR-001, LOGPRIV-001, REL-001, SWDEV-001 |
| clean-python-fastapi | hard | clean | — | AICS-11, CONC-001, CYBER-001, DOC-001, ERR-004, HALLU-001, LOGIC-001, RATE-01, REL-01, SCALE-001, SWDEV-001 |
| clean-go-handler | hard | clean | — | API-001, COMPAT-1, ERR-001 |
| clean-terraform-hardened | hard | clean | — | CLOUD-01, COMP-001, CFG-001, SOV-001, DB-001, IAC-001, SWDEV-001, FPR-001 |
| clean-ts-react-component | hard | clean | — | I18N-001 |
| swift-secure-networking | medium | clean | — | ERR-001 |
| python-secure-api-clean | medium | clean | — | API-01, CONC-001, DB-001, DOC-001, ERR-004, RATE-001, REL-001, SCALE-001, SWDEV-001 |
| go-clean-api | medium | clean | — | ERR-01, API-01 |
| java-clean-repository | medium | clean | — | ERR-001, MAINT-001, SWDEV-001 |
| rust-clean-api | hard | clean | — | AUTH-001, DB-001, ERR-008 |
| python-clean-auth | hard | clean | — | SEC-001, AGENT-001, CLOUD-001, STRUCT-001, ERR-001, FW-001, HALLU-001, LOGIC-001, MAINT-001, REL-001, SWDEV-001, TEST-001, FPR-001 |
| csharp-clean-controller | hard | clean | — | AUTH-001, COMPAT-1, ERR-004 |
| clean-php-laravel-controller | medium | clean | — | CYBER-001, FW-001, SEC-001 |
| clean-kotlin-spring-service | medium | clean | — | ERR-01, LOGIC-001, REL-001, SCALE-001 |
| clean-swift-api-client | medium | clean | — | COMPAT-1, DB-001, ERR-004, LOGIC-001 |
| clean-java-repository | medium | clean | — | COST-001, DB-001, PERF-001, SCALE-001 |
| clean-rust-cli-tool | medium | clean | — | INTENT-001, MAINT-001, SWDEV-001 |
| clean-csharp-controller | medium | clean | — | API-001, INTENT-001, LOGIC-001 |
| clean-go-grpc-server | hard | clean | — | AUTH-001, CLOUD-001, CFG-001, RATE-01, REL-001, SWDEV-001 |
| clean-terraform-module | medium | clean | — | AICS-10, CLOUD-001, FW-01, IAC-001, LOGIC-001, SWDEV-001 |
| clean-python-fastapi-crud | medium | clean | — | AUTH-001, CLOUD-001, DATA-001, PERF-001, RATE-1, SCALE-001, SWDEV-001 |
| clean-java-spring-service | hard | clean | — | DB-001, REL-01 |
| clean-node-express-middleware | hard | clean | — | API-001, AUTH-001, CLOUD-001, ERR-001 |
| clean-go-database-repo | medium | clean | — | DB-001, ERR-001 |
| clean-python-async-service | medium | clean | — | DOC-001, ERR-001, LOGIC-001, SWDEV-001, TEST-001, FPR-001 |
| clean-kotlin-coroutine-service | hard | clean | — | INTENT-001 |
| clean-ruby-service-object | medium | clean | — | DB-001, ERR-001, REL-001 |
| clean-php-middleware-stack | hard | clean | — | API-001, HALLU-001, OBS-01, RATE-01 |
| clean-swift-result-builder | hard | clean | — | API-001, COMPAT-1, CYBER-001, ERR-001, FW-001, INTENT-001, LOGIC-001, MAINT-001, PERF-001, REL-001, SEC-001, SWDEV-001, TEST-001 |
| clean-typescript-event-emitter | medium | clean | — | ERR-001, TEST-001 |

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
