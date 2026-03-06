# Judges Panel — Benchmark Report

> Auto-generated on 2026-03-06T14:00:52.402Z · v3.23.10

| Metric | Value |
|--------|-------|
| Overall Grade | 🔴 **F** |
| Test Cases | 79 |
| Detection Rate | 49.4% (39/79) |
| Precision (lenient) | 95.0% |
| Recall (lenient) | 34.2% |
| F1 Score (lenient) | 50.3% |
| Precision (strict) | 92.9% |
| Recall (strict) | 23.4% |
| F1 Score (strict) | 37.4% |
| True Positives | 38 (strict: 26) |
| False Negatives | 73 (strict: 85) |
| False Positives | 2 |

## False Positive Rate

**Overall FP Rate: 5.0%**

The false positive rate measures how often the tool flags code that is actually correct.
Lower is better. Industry-standard SAST tools typically range from 20-60% FP rates.

## Detection by Difficulty

| Difficulty | Detected | Total | Rate |
|------------|----------|-------|------|
| easy | 14 | 32 | 43.8% |
| medium | 9 | 18 | 50.0% |
| hard | 16 | 29 | 55.2% |

## Results by Category

| Category | Detected | Total | Precision | Recall | F1 | FP Rate |
|----------|----------|-------|-----------|--------|-----|---------|
| accessibility | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| agent-instructions | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| ai-code-safety | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| api-design | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| auth | 1 | 4 | 100.0% | 16.7% | 28.6% | 0.0% |
| backwards-compatibility | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| caching | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| ci-cd | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| clean | 11 | 13 | 0.0% | 100.0% | 0.0% | 100.0% |
| cloud-readiness | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| code-structure | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| compliance | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| concurrency | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| configuration | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| cost-effectiveness | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| data-security | 1 | 1 | 100.0% | 66.7% | 80.0% | 0.0% |
| data-sovereignty | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| database | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| dependency-health | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| documentation | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| error-handling | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| ethics-bias | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| framework-safety | 1 | 1 | 100.0% | 50.0% | 66.7% | 0.0% |
| iac-security | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| injection | 5 | 15 | 100.0% | 27.8% | 43.5% | 0.0% |
| internationalization | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| logging-privacy | 1 | 1 | 100.0% | 50.0% | 66.7% | 0.0% |
| maintainability | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| observability | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| performance | 1 | 2 | 100.0% | 66.7% | 80.0% | 0.0% |
| portability | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| rate-limiting | 1 | 1 | 100.0% | 100.0% | 100.0% | 0.0% |
| reliability | 1 | 2 | 100.0% | 50.0% | 66.7% | 0.0% |
| scalability | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| security | 2 | 5 | 100.0% | 20.0% | 33.3% | 0.0% |
| software-practices | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| testing | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| ux | 0 | 1 | 100.0% | 0.0% | 0.0% | 0.0% |
| xss | 2 | 3 | 100.0% | 57.1% | 72.7% | 0.0% |

## Results by Judge

| Judge | Findings | TP | FP | Precision | FP Rate |
|-------|----------|-----|-----|-----------|---------|
| AICS | 20 | 0 | 20 | 0.0% | 100.0% |
| API | 23 | 2 | 21 | 8.7% | 91.3% |
| AUTH | 1 | 1 | 0 | 100.0% | 0.0% |
| CFG | 7 | 1 | 6 | 14.3% | 85.7% |
| CICD | 1 | 0 | 1 | 0.0% | 100.0% |
| CLOUD | 6 | 1 | 5 | 16.7% | 83.3% |
| COMP | 4 | 0 | 4 | 0.0% | 100.0% |
| COMPAT | 1 | 0 | 1 | 0.0% | 100.0% |
| CONC | 13 | 2 | 11 | 15.4% | 84.6% |
| COST | 4 | 1 | 3 | 25.0% | 75.0% |
| CYBER | 11 | 9 | 2 | 81.8% | 18.2% |
| DATA | 9 | 2 | 7 | 22.2% | 77.8% |
| DB | 24 | 4 | 20 | 16.7% | 83.3% |
| DOC | 57 | 1 | 56 | 1.8% | 98.2% |
| ERR | 7 | 0 | 7 | 0.0% | 100.0% |
| FW | 4 | 1 | 3 | 25.0% | 75.0% |
| IAC | 3 | 2 | 1 | 66.7% | 33.3% |
| LOGPRIV | 4 | 0 | 4 | 0.0% | 100.0% |
| MAINT | 17 | 1 | 16 | 5.9% | 94.1% |
| OBS | 4 | 0 | 4 | 0.0% | 100.0% |
| PERF | 18 | 2 | 16 | 11.1% | 88.9% |
| PORTA | 5 | 1 | 4 | 20.0% | 80.0% |
| RATE | 10 | 1 | 9 | 10.0% | 90.0% |
| REL | 10 | 1 | 9 | 10.0% | 90.0% |
| SCALE | 5 | 0 | 5 | 0.0% | 100.0% |
| SOV | 8 | 2 | 6 | 25.0% | 75.0% |
| STRUCT | 3 | 1 | 2 | 33.3% | 66.7% |
| SWDEV | 8 | 0 | 8 | 0.0% | 100.0% |
| UX | 2 | 0 | 2 | 0.0% | 100.0% |

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
| clean-terraform-hardened | ❌ | IAC-001 |
| clean-python-data-script | ✅ | none |
| clean-go-cli-tool | ❌ | ERR-001 |
| clean-ts-react-component | ✅ | none |

**Clean code FP rate: 2/13 cases had false positives (15.4%)**

## Failed Cases

| Case | Difficulty | Category | Missed Rules | False Positives |
|------|------------|----------|--------------|-----------------|
| sql-injection-basic | easy | injection | CYBER-001, CYBER-002, CYBER-003, SEC-001 | — |
| sql-injection-template | easy | injection | CYBER-001, CYBER-002 | — |
| xss-reflected | easy | xss | CYBER-001, CYBER-002 | — |
| hardcoded-secret | easy | auth | AUTH-001, AUTH-002, AUTH-003 | — |
| path-traversal | medium | injection | CYBER-001, CYBER-002, SEC-001 | — |
| empty-catch-block | easy | error-handling | ERR-001, ERR-002 | — |
| python-sql-injection | easy | injection | CYBER-001, CYBER-002 | — |
| no-input-validation | medium | security | CYBER-001, SEC-001 | — |
| perf-sync-io | easy | performance | PERF-001 | — |
| obs-no-logging | easy | observability | OBS-001 | — |
| rel-no-health-check | easy | reliability | REL-001 | — |
| scale-global-state | medium | scalability | SCALE-001 | — |
| maint-magic-numbers | easy | maintainability | MAINT-001 | — |
| test-no-tests | medium | testing | TEST-001 | — |
| comp-missing-audit-trail | medium | compliance | COMP-001 | — |
| a11y-missing-labels | easy | accessibility | A11Y-001 | — |
| i18n-hardcoded-strings | easy | internationalization | I18N-001 | — |
| deps-outdated-packages | easy | dependency-health | DEPS-001, SUPPLY-001 | — |
| compat-breaking-changes | hard | backwards-compatibility | COMPAT-001 | — |
| cache-no-caching | medium | caching | CACHE-001 | — |
| ethics-discriminatory-logic | hard | ethics-bias | ETHICS-001 | — |
| ux-poor-error-messages | easy | ux | UX-001 | — |
| cicd-no-pipeline | easy | ci-cd | CICD-001 | — |
| swdev-no-linting | easy | software-practices | SWDEV-001 | — |
| agent-unsafe-instructions | medium | agent-instructions | AGENT-001 | — |
| aics-ai-generated-patterns | medium | ai-code-safety | AICS-001 | — |
| iac-insecure-dockerfile | easy | iac-security | IAC-001 | — |
| go-sql-injection | easy | injection | CYBER-001, CYBER-002 | — |
| java-deserialization | medium | injection | CYBER-001, CYBER-002 | — |
| hard-indirect-sql-injection | hard | injection | CYBER-001, CYBER-002 | — |
| hard-ssrf | hard | injection | CYBER-001, CYBER-002, SEC-001 | — |
| hard-jwt-none-algorithm | hard | auth | AUTH-001, AUTH-002, SEC-001 | — |
| hard-mass-assignment | hard | security | CYBER-001, SEC-001 | — |
| hard-timing-attack | hard | auth | AUTH-001, SEC-001, CYBER-001 | — |
| hard-python-pickle | hard | injection | CYBER-001, CYBER-002 | — |
| hard-go-race-condition | hard | concurrency | CONC-001 | — |
| hard-csharp-sql-injection | hard | injection | CYBER-001, CYBER-002 | — |
| hard-rust-unsafe | hard | security | CYBER-001, SEC-001 | — |
| clean-terraform-hardened | hard | clean | — | IAC-001 |
| clean-go-cli-tool | hard | clean | — | ERR-001 |

---

*Generated by [Judges Panel](https://github.com/KevinRabun/judges) benchmark suite.*
