# Real-World Evidence: Judges in Action

This document demonstrates Judges' effectiveness by analyzing well-known open-source projects and showing a before/after remediation workflow.

## 1. Open-Source Project Analysis

We ran Judges against three popular open-source frameworks using `--quickStart` mode (high-signal, filtered defaults). All analysis is deterministic — no LLM calls, no network requests beyond cloning the repo.

### Results Summary

| Repository | Files Analyzed | Score | Verdict | Critical | High | Medium | Low |
|---|---:|---:|---|---:|---:|---:|---:|
| [expressjs/express](https://github.com/expressjs/express) | 7 | 99/100 | WARNING | 0 | 1 | 25 | 5 |
| [pallets/flask](https://github.com/pallets/flask) | 24 | 99/100 | FAIL | 4 | 9 | 76 | 15 |
| [fastapi/fastapi](https://github.com/fastapi/fastapi) | 150 | 100/100 | FAIL | 2 | 2 | 10 | 0 |

### Key Findings by Project

#### Express.js (Node.js)

Express scored highly with only one high-severity finding — a synchronous `fs.statSync` call in the view rendering path (`lib/view.js:201`) that could block the event loop under load. The remaining findings are medium-severity software practices and maintainability suggestions.

**Top judges triggered:** Software Practices (10 findings), Maintainability (9 findings), Scalability (6 findings)

#### Flask (Python)

Flask had 4 critical findings including:
- **AUTH-001**: Use of `hashlib.sha1` for session signing (`sessions.py:281`) — weak hashing for credential-adjacent operations
- **CYBER-001/004**: Potential injection patterns in template rendering
- **LOGPRIV-001**: Sensitive data exposure in debug logging

Must-fix gate triggered on 5 of 24 files with 7 must-fix findings across rules `AICS-004`, `CYBER-001`, `CYBER-004`, `LOGPRIV-001`, `AUTH-001`.

**Top judges triggered:** Software Practices (24 findings), CI/CD (20 findings), Code Structure (20 findings), Maintainability (13 findings)

#### FastAPI (Python)

FastAPI — known for strong typing and modern patterns — scored exceptionally well. Only 14 findings across 150 files. The 2 critical findings were both hardcoded `fake_secret_token` values in documentation example files (`docs_src/`), which Judges correctly flagged as credential exposure risks (CFG-001).

**Top judges triggered:** Performance (4 findings), Configuration Management (2 findings), Code Structure (2 findings)

### What This Tells Us

1. **Judges calibrates well**: Express and FastAPI (known for quality) scored 99-100. Flask's lower verdict reflects real patterns worth examining.
2. **False positive rate is low**: With `--quickStart` (≥90% confidence filter), findings are actionable and evidence-backed.
3. **35 judges provide breadth**: Security, performance, practices, scalability, and compliance are all covered in a single pass.
4. **Speed**: All three repos analyzed in under 15 seconds each — no LLM latency.

---

## 2. Before/After Showcase

This section demonstrates the full workflow: scan → identify issues → apply fixes → rescan.

### Before: Vulnerable API Server

We analyze `examples/sample-vulnerable-api.ts` — an intentionally insecure Express API with common vulnerability patterns.

```bash
$ judges eval --file examples/sample-vulnerable-api.ts

╔══════════════════════════════════════════════════════╗
║  Judges Tribunal Evaluation                          ║
╠══════════════════════════════════════════════════════╣
║  File:     examples/sample-vulnerable-api.ts         ║
║  Language: typescript                                ║
║  Score:    54/100                                    ║
║  Verdict:  FAIL                                     ║
╚══════════════════════════════════════════════════════╝

  Critical: 19    High: 32    Medium: 94    Low: 20

  Judge Cybersecurity          12/100  ████░░░░░░  6 findings
  Judge Authentication         34/100  ███░░░░░░░  5 findings
  Judge Data Security          48/100  █████░░░░░  5 findings
  Judge Configuration Mgmt     55/100  ██████░░░░  4 findings
  ...
  Total: 165 findings across 35 judges
```

### Critical Findings Identified

| Rule | Severity | Description | Line |
|---|---|---|---:|
| CYBER-001 | CRITICAL | SQL injection via string concatenation | 45 |
| CYBER-004 | CRITICAL | Command injection via `child_process.exec` | 67 |
| AUTH-001 | CRITICAL | MD5 password hashing (brute-forceable) | 23 |
| CFG-001 | CRITICAL | Hardcoded database credentials | 8 |
| CYBER-006 | CRITICAL | `eval()` on user input | 89 |
| DATASEC-001 | CRITICAL | PII logged to console | 34 |
| AICS-004 | CRITICAL | Unsanitized user content in LLM prompt | 112 |

### After: Applying Auto-Fix Patches

Judges provides suggested fix patches for each finding. After applying the critical fixes:

```diff
- const password_hash = crypto.createHash('md5').update(password).digest('hex');
+ const password_hash = await bcrypt.hash(password, 12);

- const query = `SELECT * FROM users WHERE id = '${userId}'`;
+ const query = `SELECT * FROM users WHERE id = $1`;
+ const result = await db.query(query, [userId]);

- const result = child_process.execSync(`ls ${userInput}`);
+ const result = child_process.execFileSync('ls', [userInput]);

- const DB_PASSWORD = "supersecret123";
+ const DB_PASSWORD = process.env.DB_PASSWORD;

- eval(userCode);
+ // Removed: eval() on user input is never safe

- console.log(`User login: ${email}, password: ${password}`);
+ console.log(`User login attempt for: ${maskPII(email)}`);
```

### After Rescan

```bash
$ judges eval --file examples/sample-vulnerable-api-fixed.ts

  Score:    91/100
  Verdict:  WARNING

  Critical: 0    High: 2    Medium: 12    Low: 5
```

**Score improvement: 54 → 91 (+37 points)**
**Critical findings: 19 → 0 (100% reduction)**

---

## 3. SARIF Integration

Judges outputs standard SARIF 2.1.0 for CI/CD integration:

```bash
$ judges eval --file app.ts --format sarif > results.sarif
```

The SARIF output includes:
- Full rule definitions with help URIs
- Precise file locations with line numbers
- Severity levels mapped to SARIF `level` (error/warning/note)
- Confidence scores as `rank` properties
- Suggested fix patches as `fix` objects

This integrates directly with:
- **GitHub Code Scanning** (upload via `github/codeql-action/upload-sarif`)
- **Azure DevOps** (SARIF results viewer)
- **VS Code** (SARIF Viewer extension)

---

## 4. Daily Automation Evidence

Judges runs automated daily analysis against popular open-source repositories via GitHub Actions. The [`daily-popular-repo-autofix.yml`](../.github/workflows/daily-popular-repo-autofix.yml) workflow:

1. Clones trending/popular repos
2. Runs full tribunal analysis
3. Generates fix patches for critical/high findings
4. Tracks scores over time

Results are published as workflow artifacts and can be viewed in the [Actions tab](https://github.com/KevinRabun/judges/actions/workflows/daily-popular-repo-autofix.yml).

---

## 5. Reproducing These Results

All results in this document can be reproduced locally:

```bash
# Install
npm install -g @kevinrabun/judges

# Analyze a public repo
npx tsx scripts/generate-public-repo-report.ts \
  --repoUrl https://github.com/expressjs/express \
  --quickStart \
  --output express-report.md

# Analyze a local file
judges eval --file your-api.ts

# Single judge deep-dive
judges eval --judge cybersecurity --file your-api.ts

# SARIF for CI
judges eval --file your-api.ts --format sarif > results.sarif
```

All analysis is deterministic and offline — no API keys, no LLM calls, no telemetry.
