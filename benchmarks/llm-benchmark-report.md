# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/5/2026, 8:44:54 AM · **Version:** 3.128.2

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟡 **B** |
| F1 Score | 87.9% |
| Precision | 84.0% |
| Recall | 92.1% |
| Detection Rate | 88.3% |
| Cases | 700 |
| Duration | 60193s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 700 |
| Detection Rate | 88.3% (618/700) |
| Precision | 84.0% |
| Recall | 92.1% |
| F1 Score | 87.9% |
| True Positives | 1017 |
| False Negatives | 87 |
| False Positives | 193 |
| Duration | 60193s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 217 | 239 | 90.8% |
| medium | 278 | 314 | 88.5% |
| hard | 123 | 147 | 83.7% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 11 | 11 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 8 | 8 | 100.0% | 64.7% | 78.6% |
| agent-security | 11 | 11 | 100.0% | 94.7% | 97.3% |
| ai-code-safety | 10 | 10 | 100.0% | 96.2% | 98.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 8 | 9 | 100.0% | 91.7% | 95.7% |
| ai-negative | 1 | 3 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 7 | 8 | 100.0% | 90.0% | 94.7% |
| auth | 31 | 31 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 6 | 8 | 100.0% | 60.0% | 75.0% |
| caching | 8 | 9 | 100.0% | 94.4% | 97.1% |
| ci-cd | 9 | 9 | 100.0% | 100.0% | 100.0% |
| cicd | 6 | 6 | 100.0% | 100.0% | 100.0% |
| clean | 27 | 79 | 0.0% | 100.0% | 0.0% |
| cloud | 6 | 6 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 7 | 8 | 100.0% | 73.3% | 84.6% |
| code-quality | 4 | 4 | 100.0% | 80.0% | 88.9% |
| code-structure | 7 | 9 | 100.0% | 75.0% | 85.7% |
| compatibility | 2 | 5 | 100.0% | 33.3% | 50.0% |
| compliance | 10 | 11 | 100.0% | 92.3% | 96.0% |
| concurrency | 15 | 16 | 100.0% | 91.7% | 95.7% |
| configuration | 7 | 8 | 100.0% | 73.9% | 85.0% |
| cost-effectiveness | 7 | 8 | 100.0% | 84.6% | 91.7% |
| data-security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 10 | 10 | 100.0% | 100.0% | 100.0% |
| database | 9 | 10 | 100.0% | 95.7% | 97.8% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 7 | 7 | 100.0% | 100.0% | 100.0% |
| documentation | 6 | 8 | 100.0% | 58.3% | 73.7% |
| error-handling | 19 | 19 | 100.0% | 100.0% | 100.0% |
| ethics | 8 | 8 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 8 | 8 | 100.0% | 100.0% | 100.0% |
| framework-safety | 9 | 9 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 44.4% | 61.5% |
| hallucination | 9 | 11 | 100.0% | 70.6% | 82.8% |
| hallucination-detection | 9 | 11 | 100.0% | 60.0% | 75.0% |
| iac-security | 12 | 12 | 100.0% | 100.0% | 100.0% |
| injection | 63 | 63 | 100.0% | 100.0% | 100.0% |
| intent-alignment | 1 | 1 | 100.0% | 100.0% | 100.0% |
| internationalization | 10 | 11 | 100.0% | 90.9% | 95.2% |
| logging-privacy | 10 | 10 | 100.0% | 95.8% | 97.9% |
| maintainability | 8 | 8 | 100.0% | 88.9% | 94.1% |
| observability | 5 | 8 | 100.0% | 63.2% | 77.4% |
| over-engineering | 1 | 1 | 100.0% | 100.0% | 100.0% |
| performance | 15 | 15 | 100.0% | 100.0% | 100.0% |
| portability | 9 | 9 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 9 | 9 | 100.0% | 87.0% | 93.0% |
| reliability | 8 | 8 | 100.0% | 100.0% | 100.0% |
| scalability | 10 | 10 | 100.0% | 90.6% | 95.1% |
| security | 88 | 88 | 100.0% | 98.8% | 99.4% |
| software-development | 5 | 7 | 100.0% | 70.0% | 82.4% |
| software-practices | 5 | 5 | 100.0% | 100.0% | 100.0% |
| sovereignty | 4 | 4 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 4 | 4 | 100.0% | 100.0% | 100.0% |
| testing | 12 | 12 | 100.0% | 94.1% | 97.0% |
| user-experience | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ux | 6 | 6 | 100.0% | 100.0% | 100.0% |
| xss | 11 | 11 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 16 | 15 | 1 | 93.8% |
| AGENT | 7 | 7 | 0 | 100.0% |
| AICS | 30 | 25 | 5 | 83.3% |
| API | 27 | 20 | 7 | 74.1% |
| AUTH | 64 | 47 | 17 | 73.4% |
| CACHE | 8 | 8 | 0 | 100.0% |
| CFG | 4 | 3 | 1 | 75.0% |
| CICD | 9 | 9 | 0 | 100.0% |
| CLOUD | 14 | 14 | 0 | 100.0% |
| COMP | 25 | 22 | 3 | 88.0% |
| COMPAT | 7 | 7 | 0 | 100.0% |
| CONC | 21 | 15 | 6 | 71.4% |
| COST | 27 | 21 | 6 | 77.8% |
| CYBER | 189 | 184 | 5 | 97.4% |
| DATA | 59 | 51 | 8 | 86.4% |
| DB | 24 | 23 | 1 | 95.8% |
| DEPS | 13 | 12 | 1 | 92.3% |
| DOC | 5 | 5 | 0 | 100.0% |
| ERR | 60 | 36 | 18 | 66.7% |
| ETHICS | 14 | 14 | 0 | 100.0% |
| FPR | 5 | 0 | 5 | 0.0% |
| FW | 14 | 7 | 7 | 50.0% |
| HALLU | 26 | 17 | 9 | 65.4% |
| I18N | 18 | 10 | 8 | 55.6% |
| IAC | 18 | 15 | 3 | 83.3% |
| INTENT | 2 | 1 | 1 | 50.0% |
| LOGIC | 22 | 8 | 13 | 38.1% |
| LOGPRIV | 15 | 12 | 3 | 80.0% |
| MAINT | 13 | 10 | 3 | 76.9% |
| OBS | 15 | 13 | 2 | 86.7% |
| OVER | 2 | 1 | 1 | 50.0% |
| PERF | 42 | 34 | 8 | 81.0% |
| PORTA | 13 | 12 | 1 | 92.3% |
| RATE | 14 | 11 | 3 | 78.6% |
| REL | 30 | 21 | 9 | 70.0% |
| SCALE | 24 | 19 | 5 | 79.2% |
| SEC | 173 | 163 | 5 | 97.0% |
| SOV | 19 | 17 | 2 | 89.5% |
| STRUCT | 15 | 13 | 2 | 86.7% |
| SWDEV | 18 | 8 | 10 | 44.4% |
| TEST | 32 | 19 | 13 | 59.4% |
| UX | 11 | 10 | 1 | 90.9% |

### Per-Judge — Failed Cases

82 cases failed — showing first 50:

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | I18N-005, PORTA-001 |
| clean-dockerfile-best-practices | easy | clean | — | COST-001, IAC-001, PERF-001 |
| ruby-secure-controller | medium | clean | — | AUTH-001 |
| kotlin-secure-api | medium | clean | — | AUTH-001, HALLU-001 |
| clean-code-express | hard | clean | — | AICS-1, AUTH-01, ERR-001, REL-001, SWDEV-001 |
| clean-code-python | hard | clean | — | ERR-01, LOGPRIV-001 |
| clean-code-hardened-node | hard | clean | — | DATA-001, ERR-001, LOGPRIV-001, REL-01 |
| conc-deep-setinterval-no-clear | easy | concurrency | CONC-001 | — |
| db-no-index-hint | medium | database | DB-001 | — |
| api-no-versioning-express-ts | easy | api-design | API-001 | — |
| obs-no-logging | easy | observability | OBS-001 | — |
| obs-no-trace-spans-java | medium | observability | OBS-001 | — |
| obs-no-metrics-go | medium | observability | OBS-001, REL-001 | — |
| cloud-hardcoded-port-and-host-go | easy | cloud-readiness | ERR-001, REL-001, CICD-001 | — |
| cfg-deep-no-schema-validation | medium | configuration | SCALE-001, COST-001 | — |
| struct-deep-nesting | easy | code-structure | STRUCT-001 | — |
| struct-god-class-ts | medium | code-structure | COMP-001 | — |
| doc-misleading-comments-ts | easy | documentation | API-001 | — |
| doc-complex-config-no-docs-ts | medium | documentation | DOC-001 | — |
| cost-deep-full-table-scan | medium | cost-effectiveness | SEC-001 | — |
| comp-no-license-header-ts | easy | compliance | COMP-001 | — |
| i18n-deep-number-formatting | medium | internationalization | PERF-001 | — |
| compat-env-var-rename-ts | easy | backwards-compatibility | DATA-001 | — |
| compat-api-field-rename-ts | medium | backwards-compatibility | UX-001 | — |
| cache-deep-unbounded-growth | medium | caching | AICS-001 | — |
| compat-deep-browser-api-no-fallback | medium | compatibility | COST-001, SCALE-001 | — |
| compat-deep-deprecated-node-apis | medium | compatibility | REL-001 | — |
| compat-deep-vendor-lock-in | hard | compatibility | AICS-001 | — |
| hallu-deep-react-nonexistent-hooks | easy | hallucination | SCALE-001, I18N-001 | — |
| hallu-deep-database-fake-features | hard | hallucination | COMP-001 | — |
| swdev-deep-feature-flags-hardcoded | easy | software-development | COMPAT-001 | — |
| swdev-deep-no-error-handling | medium | software-development | SEC-001, CYBER-001 | — |
| hallu-python-json-loads-file | easy | hallucination-detection | HALLU-001 | — |
| hallu-python-fastapi-oauth2 | hard | hallucination-detection | CYBER-001, UX-001 | — |
| ai-logic-dead-code-after-throw | easy | ai-logic-error | LOGIC-003 | — |
| ai-negative-clean-error-handling | easy | ai-negative | — | ERR-04, REL-01, TEST-001 |
| ai-negative-clean-validation | easy | ai-negative | — | I18N-001 |
| clean-python-fastapi | hard | clean | — | CONC-001, HALLU-001, PERF-01 |
| clean-go-handler | hard | clean | — | API-01, ERR-002 |
| clean-rust-handler | hard | clean | — | AUTH-001 |
| clean-terraform-hardened | hard | clean | — | COMP-001, SOV-001, IAC-001 |
| clean-ts-react-component | hard | clean | — | I18N-001 |
| python-secure-api-clean | medium | clean | — | API-01, AUTH-001, CONC-001, ERR-004, SCALE-001 |
| go-clean-api | medium | clean | — | ERR-01, API-01 |
| rust-clean-api | hard | clean | — | AUTH-001 |
| python-clean-auth | hard | clean | — | STRUCT-001, CYBER-001, DATA-001, ERR-001, FW-001, HALLU-001, LOGIC-001, MAINT-001, REL-01, SEC-001, SWDEV-001, TEST-001, FPR-001 |
| csharp-clean-controller | hard | clean | — | AUTH-001 |
| clean-php-laravel-controller | medium | clean | — | SEC-001, AICS-001, CYBER-001, DATA-001 |
| clean-kotlin-spring-service | medium | clean | — | LOGPRIV-001, REL-01 |
| clean-swift-api-client | medium | clean | — | ERR-01, I18N-001 |

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
