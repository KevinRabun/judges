# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/3/2026, 10:12:28 PM · **Version:** 3.127.0

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟢 **A** |
| F1 Score | 91.4% |
| Precision | 93.4% |
| Recall | 89.5% |
| Detection Rate | 90.0% |
| Cases | 200 |
| Duration | 19544s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 200 |
| Detection Rate | 90.0% (180/200) |
| Precision | 93.4% |
| Recall | 89.5% |
| F1 Score | 91.4% |
| True Positives | 297 |
| False Negatives | 35 |
| False Positives | 21 |
| Duration | 19544s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 70 | 73 | 95.9% |
| medium | 59 | 65 | 90.8% |
| hard | 51 | 62 | 82.3% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 3 | 3 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 3 | 3 | 100.0% | 100.0% | 100.0% |
| agent-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-code-safety | 3 | 3 | 80.0% | 80.0% | 80.0% |
| ai-dependency-confusion | 0 | 1 | 100.0% | 0.0% | 0.0% |
| ai-logic-error | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-negative | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 3 | 3 | 100.0% | 100.0% | 100.0% |
| auth | 8 | 8 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 2 | 3 | 100.0% | 66.7% | 80.0% |
| caching | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ci-cd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| cicd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| clean | 6 | 16 | 0.0% | 100.0% | 0.0% |
| cloud | 3 | 3 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 1 | 2 | 100.0% | 25.0% | 40.0% |
| code-quality | 2 | 2 | 100.0% | 66.7% | 80.0% |
| code-structure | 3 | 3 | 100.0% | 60.0% | 75.0% |
| compatibility | 1 | 3 | 100.0% | 25.0% | 40.0% |
| compliance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| concurrency | 4 | 4 | 100.0% | 100.0% | 100.0% |
| configuration | 2 | 2 | 100.0% | 71.4% | 83.3% |
| cost-effectiveness | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| database | 2 | 2 | 100.0% | 100.0% | 100.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 2 | 2 | 100.0% | 100.0% | 100.0% |
| documentation | 2 | 2 | 100.0% | 100.0% | 100.0% |
| error-handling | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ethics | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 3 | 3 | 100.0% | 100.0% | 100.0% |
| framework-safety | 3 | 3 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 44.4% | 61.5% |
| hallucination | 2 | 3 | 100.0% | 66.7% | 80.0% |
| hallucination-detection | 2 | 3 | 100.0% | 50.0% | 66.7% |
| iac-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| injection | 23 | 23 | 100.0% | 100.0% | 100.0% |
| internationalization | 3 | 3 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 3 | 3 | 100.0% | 80.0% | 88.9% |
| maintainability | 2 | 3 | 88.9% | 72.7% | 80.0% |
| observability | 1 | 2 | 100.0% | 33.3% | 50.0% |
| performance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| portability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 3 | 3 | 100.0% | 80.0% | 88.9% |
| reliability | 2 | 3 | 100.0% | 80.0% | 88.9% |
| scalability | 3 | 3 | 100.0% | 91.7% | 95.7% |
| security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| software-development | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-practices | 2 | 2 | 100.0% | 100.0% | 100.0% |
| sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 3 | 3 | 100.0% | 100.0% | 100.0% |
| user-experience | 1 | 1 | 50.0% | 100.0% | 66.7% |
| ux | 2 | 2 | 100.0% | 100.0% | 100.0% |
| xss | 6 | 6 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 5 | 5 | 0 | 100.0% |
| AGENT | 3 | 3 | 0 | 100.0% |
| AICS | 9 | 9 | 0 | 100.0% |
| API | 6 | 6 | 0 | 100.0% |
| AUTH | 12 | 10 | 2 | 83.3% |
| CACHE | 3 | 3 | 0 | 100.0% |
| CICD | 1 | 1 | 0 | 100.0% |
| CLOUD | 2 | 2 | 0 | 100.0% |
| COH | 1 | 0 | 1 | 0.0% |
| COMP | 6 | 6 | 0 | 100.0% |
| COMPAT | 3 | 3 | 0 | 100.0% |
| CONC | 8 | 7 | 1 | 87.5% |
| COST | 8 | 8 | 0 | 100.0% |
| CYBER | 52 | 52 | 0 | 100.0% |
| DATA | 11 | 11 | 0 | 100.0% |
| DB | 7 | 7 | 0 | 100.0% |
| DEPS | 5 | 5 | 0 | 100.0% |
| DOC | 2 | 2 | 0 | 100.0% |
| ERR | 8 | 4 | 4 | 50.0% |
| ETHICS | 5 | 5 | 0 | 100.0% |
| FW | 3 | 3 | 0 | 100.0% |
| HALLU | 4 | 4 | 0 | 100.0% |
| I18N | 5 | 3 | 2 | 60.0% |
| IAC | 6 | 5 | 1 | 83.3% |
| LOGIC | 3 | 3 | 0 | 100.0% |
| LOGPRIV | 6 | 4 | 2 | 66.7% |
| MAINT | 4 | 4 | 0 | 100.0% |
| OBS | 3 | 3 | 0 | 100.0% |
| PERF | 8 | 8 | 0 | 100.0% |
| PORTA | 3 | 3 | 0 | 100.0% |
| RATE | 5 | 4 | 1 | 80.0% |
| REL | 4 | 3 | 1 | 75.0% |
| SCALE | 5 | 3 | 2 | 60.0% |
| SEC | 33 | 30 | 1 | 96.8% |
| SOV | 10 | 9 | 1 | 90.0% |
| STRUCT | 3 | 3 | 0 | 100.0% |
| SWDEV | 4 | 3 | 1 | 75.0% |
| TEST | 9 | 8 | 1 | 88.9% |
| UX | 4 | 4 | 0 | 100.0% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | I18N-003 |
| ruby-secure-controller | medium | clean | — | AUTH-002 |
| clean-code-express | hard | clean | — | ERR-001, RATE-01 |
| obs-no-logging | easy | observability | OBS-001 | — |
| rel-no-timeout | medium | reliability | REL-001 | — |
| ts-local-filesystem-state | medium | cloud-readiness | PERF-001, COST-001, AICS-001 | — |
| maint-magic-numbers | easy | maintainability | — | COH-1 |
| ts-breaking-api-change | medium | backwards-compatibility | COMPAT-001 | — |
| compat-deep-browser-api-no-fallback | medium | compatibility | COST-001, SCALE-001 | — |
| compat-deep-vendor-lock-in | hard | compatibility | AICS-001 | — |
| hallu-deep-database-fake-features | hard | hallucination | COMP-001 | — |
| hallu-python-fastapi-oauth2 | hard | hallucination-detection | CYBER-001, UX-001 | — |
| ai-hallu-dependency-confusion | hard | ai-dependency-confusion | HALLU-001 | — |
| clean-code-python | hard | clean | — | AUTH-002, LOGPRIV-001, TEST-001 |
| clean-code-hardened-node | hard | clean | — | ERR-001, LOGPRIV-001, REL-002, SCALE-001 |
| clean-python-fastapi | hard | clean | — | CONC-001, SWDEV-003 |
| clean-go-handler | hard | clean | — | ERR-001 |
| clean-terraform-hardened | hard | clean | — | SOV-001, IAC-001 |
| clean-ts-react-component | hard | clean | — | I18N-001 |
| php-secure-pdo | medium | clean | — | SCALE-001 |

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
