# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 3/27/2026, 10:03:15 AM · **Version:** 3.123.3

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟢 **A** |
| F1 Score | 92.5% |
| Precision | 92.8% |
| Recall | 92.3% |
| Detection Rate | 94.6% |
| Cases | 112 |
| Duration | 6745s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 112 |
| Detection Rate | 94.6% (106/112) |
| Precision | 92.8% |
| Recall | 92.3% |
| F1 Score | 92.5% |
| True Positives | 180 |
| False Negatives | 15 |
| False Positives | 14 |
| Duration | 6745s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 47 | 51 | 92.2% |
| medium | 53 | 55 | 96.4% |
| hard | 6 | 6 | 100.0% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 2 | 2 | 100.0% | 100.0% | 100.0% |
| agent-instructions | 2 | 2 | 100.0% | 100.0% | 100.0% |
| agent-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ai-code-safety | 2 | 2 | 100.0% | 66.7% | 80.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ai-negative | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-security | 2 | 2 | 100.0% | 80.0% | 88.9% |
| ai-test-quality | 1 | 1 | 100.0% | 100.0% | 100.0% |
| api-design | 2 | 2 | 100.0% | 100.0% | 100.0% |
| auth | 2 | 2 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 2 | 2 | 100.0% | 100.0% | 100.0% |
| caching | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ci-cd | 1 | 2 | 50.0% | 100.0% | 66.7% |
| cicd | 2 | 2 | 100.0% | 100.0% | 100.0% |
| clean | 0 | 2 | 0.0% | 100.0% | 0.0% |
| cloud | 2 | 2 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 2 | 2 | 100.0% | 75.0% | 85.7% |
| code-quality | 2 | 2 | 100.0% | 66.7% | 80.0% |
| code-structure | 1 | 2 | 100.0% | 50.0% | 66.7% |
| compatibility | 2 | 2 | 100.0% | 100.0% | 100.0% |
| compliance | 2 | 2 | 100.0% | 100.0% | 100.0% |
| concurrency | 2 | 2 | 100.0% | 100.0% | 100.0% |
| configuration | 2 | 2 | 100.0% | 85.7% | 92.3% |
| cost-effectiveness | 2 | 2 | 100.0% | 100.0% | 100.0% |
| data-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 2 | 2 | 100.0% | 100.0% | 100.0% |
| database | 2 | 2 | 100.0% | 100.0% | 100.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 2 | 2 | 100.0% | 100.0% | 100.0% |
| documentation | 2 | 2 | 100.0% | 100.0% | 100.0% |
| error-handling | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ethics | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ethics-bias | 2 | 2 | 100.0% | 100.0% | 100.0% |
| framework-safety | 2 | 2 | 100.0% | 100.0% | 100.0% |
| framework-security | 2 | 2 | 100.0% | 77.8% | 87.5% |
| hallucination | 2 | 2 | 100.0% | 100.0% | 100.0% |
| hallucination-detection | 2 | 2 | 100.0% | 100.0% | 100.0% |
| iac-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| injection | 2 | 2 | 100.0% | 100.0% | 100.0% |
| internationalization | 2 | 2 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 2 | 2 | 100.0% | 100.0% | 100.0% |
| maintainability | 1 | 2 | 88.9% | 88.9% | 88.9% |
| observability | 2 | 2 | 100.0% | 66.7% | 80.0% |
| performance | 2 | 2 | 100.0% | 66.7% | 80.0% |
| portability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 2 | 2 | 100.0% | 77.8% | 87.5% |
| reliability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| scalability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-development | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-practices | 2 | 2 | 100.0% | 100.0% | 100.0% |
| sovereignty | 2 | 2 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 1 | 2 | 25.0% | 100.0% | 40.0% |
| user-experience | 1 | 1 | 50.0% | 100.0% | 66.7% |
| ux | 2 | 2 | 100.0% | 100.0% | 100.0% |
| xss | 2 | 2 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 3 | 3 | 0 | 100.0% |
| AGENT | 2 | 2 | 0 | 100.0% |
| AICS | 9 | 9 | 0 | 100.0% |
| API | 8 | 7 | 1 | 87.5% |
| AUTH | 5 | 4 | 1 | 80.0% |
| CACHE | 2 | 2 | 0 | 100.0% |
| CFG | 1 | 1 | 0 | 100.0% |
| CICD | 1 | 1 | 0 | 100.0% |
| CLOUD | 1 | 1 | 0 | 100.0% |
| COMP | 4 | 4 | 0 | 100.0% |
| COMPAT | 4 | 4 | 0 | 100.0% |
| CONC | 3 | 3 | 0 | 100.0% |
| COST | 5 | 5 | 0 | 100.0% |
| CYBER | 15 | 15 | 0 | 100.0% |
| DATA | 8 | 7 | 1 | 87.5% |
| DB | 6 | 6 | 0 | 100.0% |
| DEPS | 5 | 5 | 0 | 100.0% |
| DOC | 4 | 3 | 1 | 75.0% |
| ERR | 8 | 3 | 2 | 60.0% |
| ETHICS | 3 | 3 | 0 | 100.0% |
| FW | 4 | 3 | 1 | 75.0% |
| HALLU | 5 | 5 | 0 | 100.0% |
| I18N | 2 | 2 | 0 | 100.0% |
| IAC | 4 | 4 | 0 | 100.0% |
| LOGIC | 2 | 2 | 0 | 100.0% |
| LOGPRIV | 4 | 3 | 1 | 75.0% |
| MAINT | 4 | 4 | 0 | 100.0% |
| OBS | 6 | 6 | 0 | 100.0% |
| PERF | 8 | 7 | 0 | 100.0% |
| PORTA | 2 | 2 | 0 | 100.0% |
| RATE | 3 | 3 | 0 | 100.0% |
| REL | 3 | 3 | 0 | 100.0% |
| SCALE | 3 | 3 | 0 | 100.0% |
| SEC | 19 | 16 | 0 | 100.0% |
| SOV | 5 | 5 | 0 | 100.0% |
| STRUCT | 2 | 2 | 0 | 100.0% |
| SWDEV | 8 | 3 | 5 | 37.5% |
| TEST | 6 | 5 | 1 | 83.3% |
| UX | 4 | 4 | 0 | 100.0% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | LOGPRIV-001, SWDEV-001, TEST-001 |
| ruby-secure-controller | medium | clean | — | API-001, AUTH-001, DATA-01, FW-001, SWDEV-001 |
| maint-magic-numbers | easy | maintainability | — | SWDEV-001 |
| struct-deep-nesting | easy | code-structure | STRUCT-001 | — |
| test-no-tests | medium | testing | — | DOC-001, ERR-001, SWDEV-001 |
| cicd-no-pipeline | easy | ci-cd | — | SWDEV-001 |

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
