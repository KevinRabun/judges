# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/4/2026, 3:55:51 PM · **Version:** 3.128.1

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟢 **A** |
| F1 Score | 90.9% |
| Precision | 88.7% |
| Recall | 93.3% |
| Detection Rate | 91.7% |
| Cases | 350 |
| Duration | 20715s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 350 |
| Detection Rate | 91.7% (321/350) |
| Precision | 88.7% |
| Recall | 93.3% |
| F1 Score | 90.9% |
| True Positives | 547 |
| False Negatives | 39 |
| False Positives | 70 |
| Duration | 20715s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 124 | 130 | 95.4% |
| medium | 129 | 139 | 92.8% |
| hard | 68 | 81 | 84.0% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 5 | 5 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 5 | 5 | 100.0% | 70.0% | 82.4% |
| agent-security | 5 | 5 | 100.0% | 85.7% | 92.3% |
| ai-code-safety | 7 | 7 | 100.0% | 92.3% | 96.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 5 | 5 | 100.0% | 100.0% | 100.0% |
| ai-negative | 0 | 2 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 5 | 5 | 100.0% | 100.0% | 100.0% |
| auth | 14 | 14 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 4 | 5 | 100.0% | 80.0% | 88.9% |
| caching | 5 | 5 | 100.0% | 100.0% | 100.0% |
| ci-cd | 5 | 5 | 100.0% | 100.0% | 100.0% |
| cicd | 5 | 5 | 100.0% | 100.0% | 100.0% |
| clean | 9 | 27 | 0.0% | 100.0% | 0.0% |
| cloud | 5 | 5 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 4 | 4 | 100.0% | 83.3% | 90.9% |
| code-quality | 3 | 3 | 100.0% | 75.0% | 85.7% |
| code-structure | 5 | 5 | 100.0% | 87.5% | 93.3% |
| compatibility | 3 | 4 | 100.0% | 60.0% | 75.0% |
| compliance | 5 | 5 | 100.0% | 100.0% | 100.0% |
| concurrency | 5 | 6 | 100.0% | 85.7% | 92.3% |
| configuration | 4 | 4 | 100.0% | 81.3% | 89.7% |
| cost-effectiveness | 5 | 5 | 100.0% | 85.7% | 92.3% |
| data-security | 5 | 5 | 92.9% | 100.0% | 96.3% |
| data-sovereignty | 5 | 5 | 100.0% | 100.0% | 100.0% |
| database | 3 | 4 | 100.0% | 90.0% | 94.7% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 4 | 4 | 100.0% | 100.0% | 100.0% |
| documentation | 4 | 4 | 100.0% | 100.0% | 100.0% |
| error-handling | 6 | 6 | 100.0% | 100.0% | 100.0% |
| ethics | 5 | 5 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 5 | 5 | 100.0% | 100.0% | 100.0% |
| framework-safety | 5 | 5 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 55.6% | 71.4% |
| hallucination | 4 | 5 | 100.0% | 70.0% | 82.4% |
| hallucination-detection | 4 | 5 | 100.0% | 66.7% | 80.0% |
| iac-security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| injection | 36 | 36 | 100.0% | 100.0% | 100.0% |
| intent-alignment | 1 | 1 | 100.0% | 100.0% | 100.0% |
| internationalization | 5 | 5 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 5 | 5 | 100.0% | 93.3% | 96.6% |
| maintainability | 5 | 5 | 100.0% | 86.7% | 92.9% |
| observability | 2 | 4 | 100.0% | 40.0% | 57.1% |
| over-engineering | 1 | 1 | 100.0% | 100.0% | 100.0% |
| performance | 6 | 6 | 100.0% | 100.0% | 100.0% |
| portability | 5 | 5 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 5 | 5 | 100.0% | 84.6% | 91.7% |
| reliability | 5 | 5 | 100.0% | 100.0% | 100.0% |
| scalability | 6 | 6 | 100.0% | 93.8% | 96.8% |
| security | 26 | 26 | 100.0% | 100.0% | 100.0% |
| software-development | 3 | 4 | 100.0% | 71.4% | 83.3% |
| software-practices | 3 | 3 | 100.0% | 100.0% | 100.0% |
| sovereignty | 4 | 4 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 4 | 4 | 100.0% | 100.0% | 100.0% |
| testing | 5 | 5 | 100.0% | 100.0% | 100.0% |
| user-experience | 2 | 2 | 75.0% | 100.0% | 85.7% |
| ux | 4 | 4 | 100.0% | 100.0% | 100.0% |
| xss | 7 | 7 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 7 | 7 | 0 | 100.0% |
| AGENT | 5 | 3 | 2 | 60.0% |
| AICS | 15 | 14 | 1 | 93.3% |
| API | 16 | 11 | 5 | 68.8% |
| AUTH | 33 | 26 | 7 | 78.8% |
| CACHE | 5 | 5 | 0 | 100.0% |
| CFG | 3 | 1 | 1 | 50.0% |
| CICD | 4 | 4 | 0 | 100.0% |
| CLOUD | 6 | 6 | 0 | 100.0% |
| COH | 1 | 0 | 1 | 0.0% |
| COMP | 10 | 10 | 0 | 100.0% |
| COMPAT | 5 | 5 | 0 | 100.0% |
| CONC | 10 | 8 | 2 | 80.0% |
| COST | 15 | 15 | 0 | 100.0% |
| CYBER | 92 | 90 | 2 | 97.8% |
| DATA | 25 | 25 | 0 | 100.0% |
| DB | 8 | 8 | 0 | 100.0% |
| DEPS | 11 | 9 | 2 | 81.8% |
| DOC | 4 | 4 | 0 | 100.0% |
| ERR | 26 | 13 | 10 | 56.5% |
| ETHICS | 9 | 9 | 0 | 100.0% |
| FPR | 1 | 0 | 1 | 0.0% |
| FW | 8 | 7 | 1 | 87.5% |
| HALLU | 11 | 8 | 3 | 72.7% |
| I18N | 7 | 5 | 2 | 71.4% |
| IAC | 12 | 11 | 1 | 91.7% |
| INTENT | 1 | 1 | 0 | 100.0% |
| LOGIC | 7 | 5 | 2 | 71.4% |
| LOGPRIV | 10 | 7 | 3 | 70.0% |
| MAINT | 11 | 8 | 2 | 80.0% |
| OBS | 5 | 5 | 0 | 100.0% |
| OVER | 1 | 1 | 0 | 100.0% |
| PERF | 18 | 17 | 1 | 94.4% |
| PORTA | 6 | 5 | 1 | 83.3% |
| RATE | 7 | 6 | 1 | 85.7% |
| REL | 14 | 10 | 4 | 71.4% |
| SCALE | 18 | 11 | 7 | 61.1% |
| SEC | 70 | 65 | 1 | 98.5% |
| SOV | 14 | 13 | 1 | 92.9% |
| STRUCT | 10 | 9 | 1 | 90.0% |
| SWDEV | 6 | 4 | 2 | 66.7% |
| TEST | 13 | 11 | 2 | 84.6% |
| UX | 8 | 7 | 1 | 87.5% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | I18N-005, PORTA-001 |
| ruby-secure-controller | medium | clean | — | API-001, AUTH-01 |
| php-secure-pdo | medium | clean | — | SCALE-001 |
| clean-code-express | hard | clean | — | AICS-8, ERR-001, REL-001, SCALE-001 |
| conc-deep-setinterval-no-clear | easy | concurrency | CONC-001 | — |
| db-no-index-hint | medium | database | DB-001 | — |
| obs-no-logging | easy | observability | OBS-001 | — |
| obs-no-trace-spans-java | medium | observability | OBS-001 | — |
| compat-env-var-rename-ts | easy | backwards-compatibility | DATA-001 | — |
| compat-deep-browser-api-no-fallback | medium | compatibility | COST-001, SCALE-001 | — |
| hallu-deep-database-fake-features | hard | hallucination | COMP-001 | — |
| swdev-deep-no-error-handling | medium | software-development | SEC-001, CYBER-001 | — |
| hallu-python-fastapi-oauth2 | hard | hallucination-detection | CYBER-001, UX-001 | — |
| ai-negative-clean-auth-middleware | easy | ai-negative | — | COH-1 |
| ai-negative-clean-error-handling | easy | ai-negative | — | REL-01, SCALE-001, TEST-001 |
| clean-code-python | hard | clean | — | DEPS-001, ERR-01, LOGPRIV-001 |
| clean-code-hardened-node | hard | clean | — | ERR-001, LOGPRIV-001, REL-01, SCALE-01, UX-02 |
| clean-python-fastapi | hard | clean | — | API-001, CONC-001, DEPS-001, ERR-10, HALLU-001, LOGIC-1, SCALE-001, SWDEV-001 |
| clean-go-handler | hard | clean | — | API-001, AUTH-001, ERR-002 |
| clean-rust-handler | hard | clean | — | AUTH-01 |
| clean-terraform-hardened | hard | clean | — | SOV-001, IAC-001 |
| clean-ts-react-component | hard | clean | — | I18N-001 |
| kotlin-secure-api | medium | clean | — | AUTH-001, HALLU-001 |
| python-secure-api-clean | medium | clean | — | API-01, AUTH-001, CONC-001, ERR-001, PERF-001, SCALE-001 |
| go-clean-api | medium | clean | — | ERR-01, API-01, LOGPRIV-01 |
| java-clean-repository | medium | clean | — | AGENT-01, MAINT-01 |
| rust-clean-api | hard | clean | — | AUTH-001, CYBER-001 |
| python-clean-auth | hard | clean | — | AGENT-001, STRUCT-001, CFG-001, CYBER-001, ERR-001, FW-001, HALLU-001, LOGIC-001, MAINT-001, REL-01, SCALE-001, SEC-001, SWDEV-001, TEST-001, FPR-001 |
| csharp-clean-controller | hard | clean | — | AUTH-001, ERR-004 |

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
