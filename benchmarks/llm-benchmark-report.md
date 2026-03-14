# LLM Benchmark Report

> **Model:** Claude Opus 4.6 · **Generated:** 3/12/2026, 7:48:35 PM · **Version:** 3.39.0

## Executive Summary

| Mode | Grade | F1 | Precision | Recall | Detection Rate | Cases |
|------|-------|----|-----------|--------|----------------|-------|
| Per-Judge | 🟠 **C** | 71.2% | 56.1% | 97.3% | 88.0% | 200 |
| Tribunal | 🟡 **B** | 81.3% | 70.7% | 95.5% | 88.0% | 200 |

Total duration: 224530s

## Per-Judge Mode

| Metric | Value |
|--------|-------|
| Test Cases | 200 |
| Detection Rate | 88.0% (176/200) |
| Precision | 56.1% |
| Recall | 97.3% |
| F1 Score | 71.2% |
| True Positives | 325 |
| False Negatives | 9 |
| False Positives | 254 |
| Duration | 112265s |

### Per-Judge — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 68 | 73 | 93.2% |
| medium | 60 | 65 | 92.3% |
| hard | 48 | 62 | 77.4% |

### Per-Judge — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 0 | 3 | 100.0% | 0.0% | 0.0% |
| agent-instructions | 3 | 3 | 100.0% | 100.0% | 100.0% |
| agent-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-code-safety | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-negative | 0 | 1 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 3 | 3 | 100.0% | 100.0% | 100.0% |
| auth | 8 | 8 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 3 | 3 | 100.0% | 100.0% | 100.0% |
| caching | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ci-cd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| cicd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| clean | 0 | 16 | 0.0% | 100.0% | 0.0% |
| cloud | 2 | 3 | 100.0% | 66.7% | 80.0% |
| cloud-readiness | 2 | 2 | 100.0% | 100.0% | 100.0% |
| code-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| code-structure | 3 | 3 | 100.0% | 100.0% | 100.0% |
| compatibility | 3 | 3 | 100.0% | 100.0% | 100.0% |
| compliance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| concurrency | 4 | 4 | 100.0% | 100.0% | 100.0% |
| configuration | 2 | 2 | 100.0% | 100.0% | 100.0% |
| cost-effectiveness | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| database | 2 | 2 | 100.0% | 100.0% | 100.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 2 | 2 | 100.0% | 66.7% | 80.0% |
| documentation | 2 | 2 | 100.0% | 100.0% | 100.0% |
| error-handling | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ethics | 2 | 3 | 100.0% | 50.0% | 66.7% |
| ethics-bias | 3 | 3 | 100.0% | 100.0% | 100.0% |
| framework-safety | 3 | 3 | 100.0% | 83.3% | 90.9% |
| framework-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| hallucination | 3 | 3 | 100.0% | 100.0% | 100.0% |
| hallucination-detection | 3 | 3 | 100.0% | 100.0% | 100.0% |
| iac-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| injection | 23 | 23 | 100.0% | 100.0% | 100.0% |
| internationalization | 1 | 3 | 100.0% | 0.0% | 0.0% |
| logging-privacy | 3 | 3 | 100.0% | 100.0% | 100.0% |
| maintainability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| observability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| performance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| portability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 3 | 3 | 100.0% | 100.0% | 100.0% |
| reliability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| scalability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| software-development | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-practices | 2 | 2 | 100.0% | 100.0% | 100.0% |
| sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 100.0% | 100.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 3 | 3 | 100.0% | 100.0% | 100.0% |
| user-experience | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ux | 2 | 2 | 100.0% | 100.0% | 100.0% |
| xss | 6 | 6 | 100.0% | 100.0% | 100.0% |

### Per-Judge — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| ADR | 13 | 0 | 13 | 0.0% |
| AES | 8 | 0 | 3 | 0.0% |
| AGENT | 231 | 12 | 219 | 5.2% |
| AICS | 218 | 84 | 134 | 38.5% |
| AIP | 5 | 0 | 2 | 0.0% |
| API | 273 | 104 | 169 | 38.1% |
| AUTH | 183 | 58 | 125 | 31.7% |
| BCRYPT | 1 | 0 | 1 | 0.0% |
| CACHE | 127 | 29 | 98 | 22.8% |
| CF | 2 | 0 | 2 | 0.0% |
| CFG | 163 | 6 | 157 | 3.7% |
| CICD | 213 | 8 | 205 | 3.8% |
| CLOUD | 227 | 15 | 212 | 6.6% |
| COH | 27 | 0 | 27 | 0.0% |
| COMP | 247 | 66 | 181 | 26.7% |
| COMPAT | 214 | 42 | 172 | 19.6% |
| CONC | 90 | 45 | 45 | 50.0% |
| CONFIRMED | 2 | 0 | 2 | 0.0% |
| CONTRACT | 1 | 0 | 1 | 0.0% |
| COST | 184 | 44 | 140 | 23.9% |
| CWE | 514 | 0 | 201 | 0.0% |
| CYBER | 452 | 277 | 175 | 61.3% |
| DATA | 225 | 68 | 157 | 30.2% |
| DB | 176 | 47 | 129 | 26.7% |
| DEP | 1 | 0 | 1 | 0.0% |
| DEPS | 238 | 48 | 190 | 20.2% |
| DOC | 314 | 46 | 268 | 14.6% |
| ERR | 247 | 28 | 219 | 11.3% |
| ETHICS | 130 | 20 | 110 | 15.4% |
| FLOW | 1 | 0 | 1 | 0.0% |
| FP | 1 | 0 | 1 | 0.0% |
| FPR | 128 | 0 | 128 | 0.0% |
| FW | 173 | 24 | 149 | 13.9% |
| HALLU | 58 | 6 | 52 | 10.3% |
| IAC | 143 | 39 | 104 | 27.3% |
| INFO | 7 | 0 | 7 | 0.0% |
| INTENT | 54 | 0 | 54 | 0.0% |
| ISSUE | 1 | 0 | 1 | 0.0% |
| LOGIC | 86 | 7 | 79 | 8.1% |
| LOGPRIV | 132 | 29 | 103 | 22.0% |
| MAINT | 251 | 19 | 232 | 7.6% |
| MFPR | 14 | 0 | 14 | 0.0% |
| MISC | 2 | 0 | 2 | 0.0% |
| NAME | 1 | 0 | 1 | 0.0% |
| NH | 1 | 0 | 1 | 0.0% |
| NULL | 1 | 0 | 1 | 0.0% |
| OBS | 311 | 67 | 244 | 21.5% |
| ORD | 1 | 0 | 0 | 100.0% |
| OVER | 25 | 0 | 25 | 0.0% |
| PERF | 207 | 60 | 147 | 29.0% |
| PORTA | 148 | 28 | 120 | 18.9% |
| PR | 1 | 0 | 1 | 0.0% |
| RATE | 151 | 21 | 130 | 13.9% |
| REL | 257 | 39 | 218 | 15.2% |
| SCALE | 201 | 38 | 163 | 18.9% |
| SEC | 258 | 149 | 109 | 57.8% |
| SHA | 10 | 0 | 7 | 0.0% |
| SKU | 2 | 0 | 2 | 0.0% |
| SOV | 233 | 80 | 153 | 34.3% |
| STRUCT | 139 | 17 | 122 | 12.2% |
| SWDEV | 313 | 31 | 282 | 9.9% |
| TEST | 385 | 81 | 304 | 21.0% |
| TP | 2 | 0 | 2 | 0.0% |
| UNDEF | 1 | 0 | 1 | 0.0% |
| UX | 193 | 25 | 168 | 13.0% |
| VALIDATION | 1 | 0 | 1 | 0.0% |

### Per-Judge — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | DATA-001, DATA-002, DATA-003, DATA-004, CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, SEC-001, SEC-002, SEC-003 |
| ruby-secure-controller | medium | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, SEC-001, SEC-002, SEC-003, SEC-004 |
| clean-code-express | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, CYBER-006, CYBER-007, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008, AUTH-009 |
| a11y-missing-labels | easy | accessibility | A11Y-001 | — |
| ts-inaccessible-form | medium | accessibility | A11Y-001 | — |
| a11y-deep-dynamic-content-no-announce | hard | accessibility | A11Y-001 | — |
| i18n-hardcoded-strings | easy | internationalization | I18N-001 | — |
| i18n-deep-date-format-hardcoded | medium | internationalization | I18N-001 | — |
| cloud-deep-aws-wildcard-iam | easy | cloud | DEPS-001 | — |
| ethics-deep-dark-pattern-unsubscribe | medium | ethics | A11Y-001 | — |
| ai-negative-clean-auth-middleware | easy | ai-negative | — | LOGIC-001, LOGIC-005 |
| clean-code-python | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, CYBER-006, CYBER-007, CYBER-008, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008, RATE-001, RATE-002, RATE-003, RATE-004, RATE-005, RATE-006 |
| clean-code-hardened-node | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, CYBER-006, CYBER-007, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, RATE-001, RATE-002, RATE-003, RATE-004, RATE-005, RATE-006, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 |
| clean-python-fastapi | hard | clean | — | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, CYBER-006, CYBER-007, CYBER-008, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-007, AUTH-008, RATE-001, RATE-002, RATE-003, RATE-004, RATE-005, RATE-006, RATE-007, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 |
| clean-go-handler | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, ERR-001, ERR-002, ERR-003, ERR-004, ERR-005, ERR-006, SEC-001, SEC-002, SEC-003 |
| clean-rust-handler | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, ERR-001, ERR-002, ERR-003, ERR-004, ERR-005, ERR-006, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 |
| clean-java-spring | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, AUTH-001, AUTH-002, AUTH-003, AUTH-004, SEC-001 |
| clean-csharp-aspnet | hard | clean | — | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, SEC-001, SEC-002, SEC-003 |
| clean-ts-utility-lib | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, ERR-001, ERR-002, ERR-003, ERR-004, ERR-005, ERR-006, ERR-007, RATE-001, RATE-002 |
| clean-terraform-hardened | hard | clean | — | DATA-001, DATA-002, DATA-003, DATA-004, DATA-005, DATA-006, DATA-007, DATA-008, DATA-009, DATA-010, CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, CYBER-006, CYBER-007, CYBER-008, IAC-001, IAC-002, IAC-003, IAC-004, IAC-005, IAC-006, IAC-007, IAC-008, IAC-009, IAC-010, IAC-011, SEC-001, SEC-002, SEC-003, SEC-004, SEC-005 |
| clean-python-data-script | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, RATE-001, RATE-010 |
| clean-go-cli-tool | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, ERR-001, ERR-002, ERR-003, ERR-004, ERR-005, ERR-006, SEC-001, SEC-002, SEC-003 |
| clean-ts-react-component | hard | clean | — | CYBER-001, CYBER-002 |
| php-secure-pdo | medium | clean | — | CYBER-001, CYBER-002, CYBER-003, SEC-001 |

## Tribunal Mode

| Metric | Value |
|--------|-------|
| Test Cases | 200 |
| Detection Rate | 88.0% (176/200) |
| Precision | 70.7% |
| Recall | 95.5% |
| F1 Score | 81.3% |
| True Positives | 319 |
| False Negatives | 15 |
| False Positives | 132 |
| Duration | 112265s |

### Tribunal — Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 68 | 73 | 93.2% |
| medium | 60 | 65 | 92.3% |
| hard | 48 | 62 | 77.4% |

### Tribunal — Results by Category

| Category | Detected | Total | Precision | Recall | F1 |
|----------|----------|-------|-----------|--------|-----|
| accessibility | 0 | 3 | 100.0% | 0.0% | 0.0% |
| agent-instructions | 3 | 3 | 100.0% | 66.7% | 80.0% |
| agent-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-code-safety | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-dependency-confusion | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ai-logic-error | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ai-negative | 0 | 1 | 0.0% | 100.0% | 0.0% |
| ai-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ai-test-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| api-design | 3 | 3 | 100.0% | 100.0% | 100.0% |
| auth | 8 | 8 | 100.0% | 100.0% | 100.0% |
| backwards-compatibility | 3 | 3 | 100.0% | 100.0% | 100.0% |
| caching | 3 | 3 | 100.0% | 100.0% | 100.0% |
| ci-cd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| cicd | 3 | 3 | 100.0% | 100.0% | 100.0% |
| clean | 0 | 16 | 0.0% | 100.0% | 0.0% |
| cloud | 2 | 3 | 100.0% | 66.7% | 80.0% |
| cloud-readiness | 2 | 2 | 100.0% | 100.0% | 100.0% |
| code-quality | 2 | 2 | 100.0% | 100.0% | 100.0% |
| code-structure | 3 | 3 | 100.0% | 100.0% | 100.0% |
| compatibility | 3 | 3 | 100.0% | 100.0% | 100.0% |
| compliance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| concurrency | 4 | 4 | 100.0% | 100.0% | 100.0% |
| configuration | 2 | 2 | 100.0% | 100.0% | 100.0% |
| cost-effectiveness | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| data-sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| database | 2 | 2 | 100.0% | 100.0% | 100.0% |
| dependencies | 1 | 1 | 100.0% | 100.0% | 100.0% |
| dependency-health | 2 | 2 | 100.0% | 66.7% | 80.0% |
| documentation | 2 | 2 | 100.0% | 100.0% | 100.0% |
| error-handling | 2 | 2 | 100.0% | 100.0% | 100.0% |
| ethics | 2 | 3 | 100.0% | 50.0% | 66.7% |
| ethics-bias | 3 | 3 | 100.0% | 100.0% | 100.0% |
| framework-safety | 3 | 3 | 100.0% | 83.3% | 90.9% |
| framework-security | 2 | 2 | 100.0% | 100.0% | 100.0% |
| hallucination | 3 | 3 | 100.0% | 80.0% | 88.9% |
| hallucination-detection | 3 | 3 | 100.0% | 75.0% | 85.7% |
| iac-security | 3 | 3 | 100.0% | 100.0% | 100.0% |
| injection | 23 | 23 | 100.0% | 100.0% | 100.0% |
| internationalization | 1 | 3 | 100.0% | 0.0% | 0.0% |
| logging-privacy | 3 | 3 | 100.0% | 100.0% | 100.0% |
| maintainability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| observability | 2 | 2 | 100.0% | 100.0% | 100.0% |
| performance | 3 | 3 | 100.0% | 100.0% | 100.0% |
| portability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| rate-limiting | 3 | 3 | 100.0% | 100.0% | 100.0% |
| reliability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| scalability | 3 | 3 | 100.0% | 100.0% | 100.0% |
| security | 9 | 9 | 100.0% | 100.0% | 100.0% |
| software-development | 2 | 2 | 100.0% | 100.0% | 100.0% |
| software-practices | 2 | 2 | 100.0% | 100.0% | 100.0% |
| sovereignty | 3 | 3 | 100.0% | 100.0% | 100.0% |
| structure | 1 | 1 | 100.0% | 92.3% | 96.0% |
| supply-chain | 2 | 2 | 100.0% | 100.0% | 100.0% |
| testing | 3 | 3 | 100.0% | 100.0% | 100.0% |
| user-experience | 1 | 1 | 100.0% | 100.0% | 100.0% |
| ux | 2 | 2 | 100.0% | 75.0% | 85.7% |
| xss | 6 | 6 | 100.0% | 100.0% | 100.0% |

### Tribunal — Results by Judge

| Judge | Findings | TP | FP | Precision |
|-------|----------|-----|-----|-----------|
| ADR | 1 | 0 | 0 | 100.0% |
| AES | 7 | 0 | 1 | 0.0% |
| AGENT | 11 | 4 | 4 | 50.0% |
| AICS | 743 | 70 | 87 | 44.6% |
| API | 758 | 61 | 80 | 43.3% |
| ARCH | 1 | 0 | 0 | 100.0% |
| AUTH | 454 | 41 | 60 | 40.6% |
| BR | 1 | 0 | 0 | 100.0% |
| CACHE | 209 | 16 | 28 | 36.4% |
| CC | 5 | 0 | 0 | 100.0% |
| CFG | 425 | 3 | 66 | 4.3% |
| CICD | 400 | 3 | 53 | 5.4% |
| CLOUD | 607 | 8 | 85 | 8.6% |
| COH | 276 | 0 | 33 | 0.0% |
| COMP | 479 | 31 | 69 | 31.0% |
| COMPAT | 251 | 17 | 31 | 35.4% |
| CONC | 264 | 23 | 31 | 42.6% |
| COST | 426 | 24 | 59 | 28.9% |
| CWE | 643 | 0 | 73 | 0.0% |
| CYBER | 828 | 260 | 104 | 71.4% |
| DATA | 674 | 50 | 93 | 35.0% |
| DB | 287 | 34 | 48 | 41.5% |
| DEPS | 340 | 39 | 52 | 42.9% |
| DOC | 536 | 16 | 84 | 16.0% |
| ECMA | 1 | 0 | 0 | 100.0% |
| ERR | 598 | 17 | 88 | 16.2% |
| ETHICS | 65 | 11 | 16 | 40.7% |
| FPR | 716 | 0 | 112 | 0.0% |
| FW | 437 | 18 | 48 | 27.3% |
| HALLU | 175 | 4 | 24 | 14.3% |
| IAC | 93 | 30 | 39 | 43.5% |
| INTENT | 360 | 0 | 43 | 0.0% |
| JIRA | 3 | 0 | 1 | 0.0% |
| LOGIC | 452 | 5 | 59 | 7.8% |
| LOGPRIV | 241 | 17 | 37 | 31.5% |
| MAINT | 609 | 8 | 86 | 8.5% |
| MFPR | 189 | 0 | 26 | 0.0% |
| OBS | 579 | 29 | 86 | 25.2% |
| OVER | 54 | 0 | 3 | 0.0% |
| PERF | 386 | 32 | 48 | 40.0% |
| PORTA | 238 | 14 | 26 | 35.0% |
| RATE | 349 | 10 | 42 | 19.2% |
| REL | 667 | 20 | 92 | 17.9% |
| SCALE | 456 | 19 | 59 | 24.4% |
| SEC | 635 | 136 | 81 | 62.7% |
| SECURITY | 1 | 0 | 0 | 100.0% |
| SHA | 4 | 0 | 2 | 0.0% |
| SOV | 402 | 40 | 49 | 44.9% |
| STRUCT | 323 | 11 | 35 | 23.9% |
| SWDEV | 883 | 14 | 120 | 10.4% |
| TEST | 491 | 31 | 74 | 29.5% |
| TICKET | 2 | 0 | 0 | 100.0% |
| UX | 156 | 3 | 14 | 17.6% |

### Tribunal — Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| clean-python-dataclass | easy | clean | — | DATA-001, DATA-002, DATA-003, CYBER-001, CYBER-002, SEC-001 |
| ruby-secure-controller | medium | clean | — | CYBER-001, CYBER-002, AUTH-001, AUTH-002, SEC-001, SEC-002 |
| clean-code-express | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005 |
| a11y-missing-labels | easy | accessibility | A11Y-001 | — |
| ts-inaccessible-form | medium | accessibility | A11Y-001 | — |
| a11y-deep-dynamic-content-no-announce | hard | accessibility | A11Y-001 | — |
| i18n-hardcoded-strings | easy | internationalization | I18N-001 | — |
| i18n-deep-date-format-hardcoded | medium | internationalization | I18N-001 | — |
| cloud-deep-aws-wildcard-iam | easy | cloud | DEPS-001 | — |
| ethics-deep-dark-pattern-unsubscribe | medium | ethics | A11Y-001 | — |
| ai-negative-clean-auth-middleware | easy | ai-negative | — | LOGIC-001, LOGIC-002 |
| clean-code-python | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, AUTH-001, AUTH-002, AUTH-003, AUTH-004, RATE-001, RATE-002, RATE-003, RATE-004 |
| clean-code-hardened-node | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, CYBER-004, CYBER-005, AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, RATE-001, RATE-002, RATE-003, SEC-001, SEC-002, SEC-003 |
| clean-python-fastapi | hard | clean | — | DATA-001, DATA-002, DATA-003, CYBER-001, CYBER-002, CYBER-003, AUTH-001, AUTH-002, RATE-001, RATE-002, RATE-003, SEC-001, SEC-002, SEC-003 |
| clean-go-handler | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, ERR-001, ERR-002, ERR-003, SEC-001, SEC-002 |
| clean-rust-handler | hard | clean | — | CYBER-001, ERR-001, ERR-002, ERR-003, SEC-001, SEC-002 |
| clean-java-spring | hard | clean | — | CYBER-001, CYBER-002, AUTH-001, AUTH-002, SEC-001 |
| clean-csharp-aspnet | hard | clean | — | DATA-001, DATA-002, DATA-003, CYBER-001, CYBER-002, CYBER-003, AUTH-001, AUTH-002, SEC-001, SEC-002 |
| clean-ts-utility-lib | hard | clean | — | ERR-001, ERR-002 |
| clean-terraform-hardened | hard | clean | — | DATA-001, DATA-002, DATA-003, DATA-004, CYBER-001, CYBER-002, CYBER-003, IAC-001, IAC-002, IAC-003, IAC-004, IAC-005, IAC-006, IAC-007, SEC-001, SEC-002, SEC-003 |
| clean-python-data-script | hard | clean | — | CYBER-001, SEC-001 |
| clean-go-cli-tool | hard | clean | — | CYBER-001, CYBER-002, CYBER-003, ERR-001, ERR-002, ERR-003, SEC-001, SEC-002, SEC-003 |
| clean-ts-react-component | hard | clean | — | CYBER-001 |
| php-secure-pdo | medium | clean | — | CYBER-001, CYBER-002, CYBER-003, SEC-001, SEC-002 |

## Cross-Mode Comparison

| Metric | Per-Judge | Tribunal | Delta |
|--------|----------|----------|-------|
| F1 Score | 71.2% | 81.3% | +10.1pp |
| Precision | 56.1% | 70.7% | +14.6pp |
| Recall | 97.3% | 95.5% | -1.8pp |
| Detection Rate | 88.0% | 88.0% | +0.0pp |
| True Positives | 325 | 319 | -6 |
| False Negatives | 9 | 15 | +6 |
| False Positives | 254 | 132 | -122 |

## Methodology

### Scoring
- **Prefix-based matching**: Rule IDs are matched by prefix (e.g., CYBER-005 matches expected CYBER-001)
- **True Positive**: Expected prefix detected in LLM response
- **False Negative**: Expected prefix not detected
- **False Positive**: Unexpected prefix detected (from unexpectedRuleIds list)
- **Detection Rate**: Percentage of cases where at least one expected rule prefix was found

### Modes
- **Per-Judge**: Each relevant judge evaluates cases independently with its specialized prompt
- **Tribunal**: All 45 judges evaluate together in a single combined prompt

### Sampling
- Cases are stratified by category, difficulty, and clean/dirty split
- Per-judge mode only invokes judges whose rule prefix matches expected findings (optimization)
- Clean cases (no expected findings) are evaluated by all judges to test false positive rates
