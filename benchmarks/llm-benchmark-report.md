# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 4/2/2026, 1:08:54 PM · **Version:** 3.126.0

## Executive Summary

| Metric | Value |
|--------|-------|
| Grade | 🟢 **A** |
| F1 Score | 93.3% |
| Precision | 97.8% |
| Recall | 89.2% |
| Detection Rate | 96.4% |
| Cases | 112 |
| Duration | 6407s |

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 112 |
| Detection Rate | 96.4% (108/112) |
| Precision | 97.8% |
| Recall | 89.2% |
| F1 Score | 93.3% |
| True Positives | 174 |
| False Negatives | 21 |
| False Positives | 4 |
| Duration | 6407s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 48 | 51 | 94.1% |
| medium | 54 | 55 | 98.2% |
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
| ci-cd | 2 | 2 | 100.0% | 100.0% | 100.0% |
| cicd | 2 | 2 | 100.0% | 100.0% | 100.0% |
| clean | 0 | 2 | 0.0% | 100.0% | 0.0% |
| cloud | 2 | 2 | 100.0% | 100.0% | 100.0% |
| cloud-readiness | 2 | 2 | 100.0% | 75.0% | 85.7% |
| code-quality | 2 | 2 | 100.0% | 66.7% | 80.0% |
| code-structure | 1 | 2 | 100.0% | 50.0% | 66.7% |
| compatibility | 2 | 2 | 100.0% | 100.0% | 100.0% |
| compliance | 2 | 2 | 100.0% | 100.0% | 100.0% |
| concurrency | 2 | 2 | 100.0% | 100.0% | 100.0% |
| configuration | 2 | 2 | 100.0% | 71.4% | 83.3% |
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
| framework-security | 2 | 2 | 100.0% | 55.6% | 71.4% |
| hallucination | 2 | 2 | 100.0% | 100.0% | 100.0% |
| hallucination-detection | 2 | 2 | 100.0% | 100.0% | 100.0% |
| iac-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| injection | 2 | 2 | 100.0% | 100.0% | 100.0% |
| internationalization | 2 | 2 | 100.0% | 100.0% | 100.0% |
| logging-privacy | 2 | 2 | 100.0% | 100.0% | 100.0% |
| maintainability | 2 | 2 | 100.0% | 77.8% | 87.5% |
| observability | 1 | 2 | 100.0% | 33.3% | 50.0% |
| performance | 2 | 2 | 100.0% | 66.7% | 80.0% |
| portability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 2 | 2 | 100.0% | 77.8% | 87.5% |
| reliability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| scalability | 2 | 2 | 100.0% | 90.0% | 94.7% |
| security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-development | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-practices | 2 | 2 | 100.0% | 100.0% | 100.0% |
| sovereignty | 2 | 2 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 2 | 2 | 100.0% | 100.0% | 100.0% |
| user-experience | 1 | 1 | 50.0% | 100.0% | 66.7% |
| ux | 2 | 2 | 100.0% | 100.0% | 100.0% |
| xss | 2 | 2 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| A11Y | 3 | 3 | 0 | 100.0% |
| AGENT | 2 | 2 | 0 | 100.0% |
| AICS | 10 | 10 | 0 | 100.0% |
| API | 7 | 6 | 1 | 85.7% |
| AUTH | 5 | 4 | 1 | 80.0% |
| CACHE | 2 | 2 | 0 | 100.0% |
| CICD | 1 | 1 | 0 | 100.0% |
| CLOUD | 1 | 1 | 0 | 100.0% |
| COMP | 4 | 4 | 0 | 100.0% |
| COMPAT | 3 | 3 | 0 | 100.0% |
| CONC | 4 | 4 | 0 | 100.0% |
| COST | 5 | 5 | 0 | 100.0% |
| CYBER | 14 | 14 | 0 | 100.0% |
| DATA | 7 | 7 | 0 | 100.0% |
| DB | 6 | 6 | 0 | 100.0% |
| DEPS | 5 | 5 | 0 | 100.0% |
| DOC | 2 | 2 | 0 | 100.0% |
| ERR | 4 | 3 | 1 | 75.0% |
| ETHICS | 3 | 3 | 0 | 100.0% |
| FW | 3 | 3 | 0 | 100.0% |
| HALLU | 5 | 5 | 0 | 100.0% |
| I18N | 3 | 2 | 1 | 66.7% |
| IAC | 4 | 4 | 0 | 100.0% |
| LOGIC | 2 | 2 | 0 | 100.0% |
| LOGPRIV | 3 | 3 | 0 | 100.0% |
| MAINT | 4 | 4 | 0 | 100.0% |
| OBS | 3 | 3 | 0 | 100.0% |
| PERF | 7 | 7 | 0 | 100.0% |
| PORTA | 2 | 2 | 0 | 100.0% |
| RATE | 3 | 3 | 0 | 100.0% |
| REL | 3 | 3 | 0 | 100.0% |
| SCALE | 3 | 3 | 0 | 100.0% |
| SEC | 19 | 16 | 0 | 100.0% |
| SOV | 5 | 5 | 0 | 100.0% |
| STRUCT | 2 | 2 | 0 | 100.0% |
| SWDEV | 3 | 3 | 0 | 100.0% |
| TEST | 5 | 5 | 0 | 100.0% |
| UX | 4 | 4 | 0 | 100.0% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | I18N-005 |
| ruby-secure-controller | medium | clean | — | API-001, AUTH-01 |
| obs-no-logging | easy | observability | OBS-001 | — |
| struct-deep-nesting | easy | code-structure | STRUCT-001 | — |

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
