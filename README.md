# Judges Panel

An MCP (Model Context Protocol) server that provides a panel of **33 specialized judges** to evaluate AI-generated code — acting as an independent quality gate regardless of which project is being reviewed. Includes **built-in AST analysis** powered by the TypeScript Compiler API — no separate parser server needed.

**Highlights:**
- Includes an **App Builder Workflow (3-step)** demo for release decisions, plain-language risk summaries, and prioritized fixes — see [Try the Demo](#2-try-the-demo).
- Includes **V2 context-aware evaluation** with policy profiles, evidence calibration, specialty feedback, confidence scoring, and uncertainty reporting.
- Includes **public repository URL reporting** to clone a repo, run the full tribunal, and output a consolidated markdown report.

[![CI](https://github.com/KevinRabun/judges/actions/workflows/ci.yml/badge.svg)](https://github.com/KevinRabun/judges/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@kevinrabun/judges)](https://www.npmjs.com/package/@kevinrabun/judges)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Quick Start

### 1. Install and Build

```bash
git clone https://github.com/KevinRabun/judges.git
cd judges
npm install
npm run build
```

### 2. Try the Demo

Run the included demo to see all 33 judges evaluate a purposely flawed API server:

```bash
npm run demo
```

This evaluates [`examples/sample-vulnerable-api.ts`](examples/sample-vulnerable-api.ts) — a file intentionally packed with security holes, performance anti-patterns, and code quality issues — and prints a full verdict with per-judge scores and findings.

The demo now also includes an **App Builder Workflow (3-step)** section. In a single run, you get both tribunal output and workflow output:
- Release decision (`Ship now` / `Ship with caution` / `Do not ship`)
- Plain-language summaries of top risks
- Prioritized remediation tasks and AI-fixable `P0/P1` items

**Sample workflow output (truncated):**

```text
╔══════════════════════════════════════════════════════════════╗
║             App Builder Workflow Demo (3-Step)             ║
╚══════════════════════════════════════════════════════════════╝

  Decision       : Do not ship
  Verdict        : FAIL (47/100)
  Risk Counts    : Critical 24 | High 27 | Medium 55

  Step 2 — Plain-Language Findings:
  - [CRITICAL] DATA-001: Hardcoded password detected
      What: ...
      Why : ...
      Next: ...

  Step 3 — Prioritized Tasks:
  - P0 | DEVELOPER | Effort L | DATA-001
      Task: ...
      Done: ...

  AI-Fixable Now (P0/P1):
  - P0 DATA-001: ...
```

**Sample tribunal output (truncated):**

```
╔══════════════════════════════════════════════════════════════╗
║           Judges Panel — Full Tribunal Demo                 ║
╚══════════════════════════════════════════════════════════════╝

  Overall Verdict : FAIL
  Overall Score   : 43/100
  Critical Issues : 15
  High Issues     : 17
  Total Findings  : 83
  Judges Run      : 33

  Per-Judge Breakdown:
  ────────────────────────────────────────────────────────────────
  ❌ Judge Data Security              0/100    7 finding(s)
  ❌ Judge Cybersecurity              0/100    7 finding(s)
  ❌ Judge Cost Effectiveness        52/100    5 finding(s)
  ⚠️  Judge Scalability              65/100    4 finding(s)
  ❌ Judge Cloud Readiness           61/100    4 finding(s)
  ❌ Judge Software Practices        45/100    6 finding(s)
  ❌ Judge Accessibility              0/100    8 finding(s)
  ❌ Judge API Design                 0/100    9 finding(s)
  ❌ Judge Reliability               54/100    3 finding(s)
  ❌ Judge Observability             45/100    5 finding(s)
  ❌ Judge Performance               27/100    5 finding(s)
  ❌ Judge Compliance                 0/100    4 finding(s)
  ⚠️  Judge Testing                  90/100    1 finding(s)
  ⚠️  Judge Documentation            70/100    4 finding(s)
  ⚠️  Judge Internationalization     65/100    4 finding(s)
  ⚠️  Judge Dependency Health        90/100    1 finding(s)
  ❌ Judge Concurrency               44/100    4 finding(s)
  ❌ Judge Ethics & Bias             65/100    2 finding(s)
  ❌ Judge Maintainability           52/100    4 finding(s)
  ❌ Judge Error Handling            27/100    3 finding(s)
  ❌ Judge Authentication             0/100    4 finding(s)
  ❌ Judge Database                   0/100    5 finding(s)
  ❌ Judge Caching                   62/100    3 finding(s)
  ❌ Judge Configuration Mgmt         0/100    3 finding(s)
  ⚠️  Judge Backwards Compat         80/100    2 finding(s)
  ⚠️  Judge Portability              72/100    2 finding(s)
  ❌ Judge UX                        52/100    4 finding(s)
  ❌ Judge Logging Privacy            0/100    4 finding(s)
  ❌ Judge Rate Limiting             27/100    4 finding(s)
  ⚠️  Judge CI/CD                    80/100    2 finding(s)
```

### 3. Run the Tests

```bash
npm test
```

Runs automated tests covering all judges, AST parsers, markdown formatters, and edge cases.

### 4. Connect to Your Editor

Add the Judges Panel as an MCP server so your AI coding assistant can use it automatically.

**VS Code** — create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "judges": {
      "command": "node",
      "args": ["/absolute/path/to/judges/dist/index.js"]
    }
  }
}
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "judges": {
      "command": "node",
      "args": ["/absolute/path/to/judges/dist/index.js"]
    }
  }
}
```

**Or install from npm** instead of cloning:

```bash
npm install -g @kevinrabun/judges
```

Then use `judges` as the command in your MCP config (no `args` needed).

### 5. Use Judges in GitHub Copilot PR Reviews

Yes — users can include Judges as part of GitHub-based review workflows, with one important caveat:

- The hosted `copilot-pull-request-reviewer` on GitHub does not currently let you directly attach arbitrary local MCP servers the same way VS Code does.
- The practical pattern is to run Judges in CI on each PR, publish a report/check, and have Copilot + human reviewers use that output during review.

#### Option A (recommended): PR workflow check + report artifact

Create `.github/workflows/judges-pr-review.yml`:

```yaml
name: Judges PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  judges:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci

      - name: Generate Judges report
        run: |
          npx tsx -e "import { generateRepoReportFromLocalPath } from './src/reports/public-repo-report.ts';
          const result = generateRepoReportFromLocalPath({
            repoPath: process.cwd(),
            outputPath: 'judges-pr-report.md',
            maxFiles: 600,
            maxFindingsInReport: 150,
          });
          console.log('Overall:', result.overallVerdict, result.averageScore);"

      - name: Upload report artifact
        uses: actions/upload-artifact@v4
        with:
          name: judges-pr-report
          path: judges-pr-report.md
```

This gives every PR a reproducible Judges output your team (and Copilot) can reference.

#### Option B: Add Copilot custom instructions in-repo

Add `.github/instructions/judges.instructions.md` with guidance such as:

```markdown
When reviewing pull requests:
1. Read the latest Judges report artifact/check output first.
2. Prioritize CRITICAL and HIGH findings in remediation guidance.
3. If findings conflict, defer to security/compliance-related Judges.
4. Include rule IDs (e.g., DATA-001, CYBER-004) in suggested fixes.
```

This helps keep Copilot feedback aligned with Judges findings.

---

## The Judge Panel

| Judge | Domain | Rule Prefix | What It Evaluates |
|-------|--------|-------------|-------------------|
| **Data Security** | Data Security & Privacy | `DATA-` | Encryption, PII handling, secrets management, access controls |
| **Cybersecurity** | Cybersecurity & Threat Defense | `CYBER-` | Injection attacks, XSS, CSRF, auth flaws, OWASP Top 10 |
| **Cost Effectiveness** | Cost Optimization | `COST-` | Algorithm efficiency, N+1 queries, memory waste, caching strategy |
| **Scalability** | Scalability & Performance | `SCALE-` | Statelessness, horizontal scaling, concurrency, bottlenecks |
| **Cloud Readiness** | Cloud-Native & DevOps | `CLOUD-` | 12-Factor compliance, containerization, graceful shutdown, IaC |
| **Software Practices** | Engineering Best Practices | `SWDEV-` | SOLID principles, type safety, error handling, input validation |
| **Accessibility** | Accessibility (a11y) | `A11Y-` | WCAG compliance, screen reader support, keyboard navigation, ARIA |
| **API Design** | API Design & Contracts | `API-` | REST conventions, versioning, pagination, error responses |
| **Reliability** | Reliability & Resilience | `REL-` | Error handling, timeouts, retries, circuit breakers |
| **Observability** | Observability & Monitoring | `OBS-` | Structured logging, health checks, metrics, tracing |
| **Performance** | Performance & Efficiency | `PERF-` | N+1 queries, sync I/O, caching, memory leaks |
| **Compliance** | Regulatory Compliance | `COMP-` | GDPR/CCPA, PII protection, consent, data retention, audit trails |
| **Data Sovereignty** | Data Sovereignty & Jurisdictional Controls | `SOV-` | Data residency, cross-border transfer controls, jurisdiction-aware routing, sovereignty guardrails |
| **Testing** | Testing & Quality Assurance | `TEST-` | Test coverage, assertions, test isolation, naming |
| **Documentation** | Documentation & Readability | `DOC-` | JSDoc/docstrings, magic numbers, TODOs, code comments |
| **Internationalization** | Internationalization (i18n) | `I18N-` | Hardcoded strings, locale handling, currency formatting |
| **Dependency Health** | Dependency Management | `DEPS-` | Version pinning, deprecated packages, supply chain |
| **Concurrency** | Concurrency & Async Safety | `CONC-` | Race conditions, unbounded parallelism, missing await |
| **Ethics & Bias** | Ethics & Bias | `ETHICS-` | Demographic logic, dark patterns, inclusive language |
| **Maintainability** | Code Maintainability & Technical Debt | `MAINT-` | Any types, magic numbers, deep nesting, dead code, file length |
| **Error Handling** | Error Handling & Fault Tolerance | `ERR-` | Empty catch blocks, missing error handlers, swallowed errors |
| **Authentication** | Authentication & Authorization | `AUTH-` | Hardcoded creds, missing auth middleware, token in query params |
| **Database** | Database Design & Query Efficiency | `DB-` | SQL injection, N+1 queries, connection pooling, transactions |
| **Caching** | Caching Strategy & Data Freshness | `CACHE-` | Unbounded caches, missing TTL, no HTTP cache headers |
| **Configuration Mgmt** | Configuration & Secrets Management | `CFG-` | Hardcoded secrets, missing env vars, config validation |
| **Backwards Compat** | Backwards Compatibility & Versioning | `COMPAT-` | API versioning, breaking changes, response consistency |
| **Portability** | Platform Portability & Vendor Independence | `PORTA-` | OS-specific paths, vendor lock-in, hardcoded hosts |
| **UX** | User Experience & Interface Quality | `UX-` | Loading states, error messages, pagination, destructive actions |
| **Logging Privacy** | Logging Privacy & Data Redaction | `LOGPRIV-` | PII in logs, token logging, structured logging, redaction |
| **Rate Limiting** | Rate Limiting & Throttling | `RATE-` | Missing rate limits, unbounded queries, backoff strategy |
| **CI/CD** | CI/CD Pipeline & Deployment Safety | `CICD-` | Test infrastructure, lint config, Docker tags, build scripts |
| **Code Structure** | Structural Analysis (AST) | `STRUCT-` | Cyclomatic complexity, nesting depth, function length, dead code, type safety |
| **Agent Instructions** | Agent Instruction Markdown Quality & Safety | `AGENT-` | Instruction hierarchy, conflict detection, unsafe overrides, scope, validation, policy guidance |

---

## How It Works

The tribunal operates in three layers:

1. **Pattern-Based Analysis** — All tools (`evaluate_code`, `evaluate_code_single_judge`, `evaluate_project`, `evaluate_diff`) perform heuristic analysis using regex pattern matching to catch common anti-patterns. This works entirely offline with zero external API calls.

2. **AST-Based Structural Analysis** — The Code Structure judge (`STRUCT-*` rules) uses real Abstract Syntax Tree parsing to measure cyclomatic complexity, nesting depth, function length, parameter count, dead code, and type safety with precision that regex cannot achieve. JavaScript/TypeScript files are parsed via the TypeScript Compiler API; Python, Rust, Go, Java, and C# use a scope-tracking structural parser. No external AST server required.

3. **LLM-Powered Deep Analysis (Prompts)** — The server exposes MCP prompts (e.g., `judge-data-security`, `full-tribunal`) that provide each judge's expert persona as a system prompt. When used by an LLM-based client, this enables deeper, context-aware analysis beyond what static analysis can detect.

---

## Composable by Design

Judges Panel covers **heuristic pattern detection** and **AST structural analysis** in a single server — fast, offline, and self-contained. It does not try to be a CVE scanner or a linter. Those capabilities belong in dedicated MCP servers that an AI agent can orchestrate alongside Judges.

### Built-in AST Analysis (v2.0.0)

Unlike earlier versions that recommended a separate AST MCP server, Judges Panel now includes **real AST-based structural analysis** out of the box:

- **JavaScript / TypeScript** — Parsed with the TypeScript Compiler API (`ts.createSourceFile`) for full-fidelity AST
- **Python, Rust, Go, Java, C#** — Analyzed with a scope-tracking structural parser that counts decision points and nesting levels

The Code Structure judge (`STRUCT-*`) uses these parsers to accurately measure:

| Rule | Metric | Threshold |
|------|--------|-----------|
| `STRUCT-001` | Cyclomatic complexity | > 10 per function (high) |
| `STRUCT-002` | Nesting depth | > 4 levels (medium) |
| `STRUCT-003` | Function length | > 50 lines (medium) |
| `STRUCT-004` | Parameter count | > 5 parameters (medium) |
| `STRUCT-005` | Dead code | Unreachable statements (low) |
| `STRUCT-006` | Weak types | `any`, `dynamic`, `Object`, `interface{}`, `unsafe` (medium) |
| `STRUCT-007` | File complexity | > 40 total cyclomatic complexity (high) |
| `STRUCT-008` | Extreme complexity | > 20 per function (critical) |
| `STRUCT-009` | Extreme parameters | > 8 parameters (high) |
| `STRUCT-010` | Extreme function length | > 150 lines (high) |

### Recommended MCP Stack

When your AI coding assistant connects to multiple MCP servers, each one contributes its specialty:

```
┌─────────────────────────────────────────────────────────┐
│                   AI Coding Assistant                   │
│              (Claude, Copilot, Cursor, etc.)            │
└──────┬──────────────────┬──────────┬───────────────────┘
       │                  │          │
       ▼                  ▼          ▼
  ┌──────────────┐  ┌────────┐  ┌────────┐
  │   Judges     │  │  CVE / │  │ Linter │
  │   Panel      │  │  SBOM  │  │ Server │
  │ ─────────────│  └────────┘  └────────┘
  │ 32 Heuristic │   Vuln DB     Style &
  │   judges     │   scanning    correctness
  │ + AST judge  │
  └──────────────┘
   Patterns +
   structural
   analysis
```

| Layer | What It Does | Example Servers |
|-------|-------------|-----------------|
| **Judges Panel** | 33-judge quality gate — security patterns, AST analysis, cost, scalability, a11y, compliance, sovereignty, ethics, dependency health, agent instruction governance | This server |
| **CVE / SBOM** | Vulnerability scanning against live databases — known CVEs, license risks, supply chain | OSV, Snyk, Trivy, Grype MCP servers |
| **Linting** | Language-specific style and correctness rules | ESLint, Ruff, Clippy MCP servers |
| **Runtime Profiling** | Memory, CPU, latency measurement on running code | Custom profiling MCP servers |

### What This Means in Practice

When you ask your AI assistant *"Is this code production-ready?"*, the agent can:

1. **Judges Panel** → Scan for hardcoded secrets, missing error handling, N+1 queries, accessibility gaps, compliance issues, **plus** analyze cyclomatic complexity, detect dead code, and flag deeply nested functions via AST
2. **CVE Server** → Check every dependency in `package.json` against known vulnerabilities
3. **Linter Server** → Enforce team style rules, catch language-specific gotchas

Each server returns structured findings. The AI synthesizes everything into a single, actionable review — no single server needs to do it all.

---

## MCP Tools

### `evaluate_v2`
Run a **V2 context-aware tribunal evaluation** designed to raise feedback quality toward lead engineer/architect-level review:

- Policy profile calibration (`default`, `startup`, `regulated`, `healthcare`, `fintech`, `public-sector`)
- Context ingestion (architecture notes, constraints, standards, known risks, data-boundary model)
- Runtime evidence hooks (tests, coverage, latency, error rate, vulnerability counts)
- Specialty feedback aggregation by judge/domain
- Confidence scoring and explicit uncertainty reporting

Supports:
- **Code mode**: `code` + `language`
- **Project mode**: `files[]`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | conditional | Source code for single-file mode |
| `language` | string | conditional | Programming language for single-file mode |
| `files` | array | conditional | `{ path, content, language }[]` for project mode |
| `context` | string | no | High-level review context |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |
| `policyProfile` | enum | no | `default`, `startup`, `regulated`, `healthcare`, `fintech`, `public-sector` |
| `evaluationContext` | object | no | Structured architecture/constraint context |
| `evidence` | object | no | Runtime/operational evidence for confidence calibration |

### `evaluate_app_builder_flow`
Run a **3-step app-builder workflow** for technical and non-technical stakeholders:

1. Tribunal review (code/project/diff)
2. Plain-language translation of top risks
3. Prioritized remediation tasks with AI-fixable P0/P1 extraction

Supports:
- **Code mode**: `code` + `language`
- **Project mode**: `files[]`
- **Diff mode**: `code` + `language` + `changedLines[]`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | conditional | Full source content (code/diff mode) |
| `language` | string | conditional | Programming language (code/diff mode) |
| `files` | array | conditional | `{ path, content, language }[]` for project mode |
| `changedLines` | number[] | no | 1-based changed lines for diff mode |
| `context` | string | no | Optional business/technical context |
| `maxFindings` | number | no | Max translated top findings (default: 10) |
| `maxTasks` | number | no | Max generated tasks (default: 20) |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |

### `evaluate_public_repo_report`
Clone a **public repository URL**, run the full judges panel across eligible source files, and generate a consolidated markdown report.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repoUrl` | string | yes | Public repository URL (`https://...`) |
| `branch` | string | no | Optional branch name |
| `outputPath` | string | no | Optional path to write report markdown |
| `maxFiles` | number | no | Max files analyzed (default: 600) |
| `maxFileBytes` | number | no | Max file size in bytes (default: 300000) |
| `maxFindingsInReport` | number | no | Max detailed findings in output (default: 150) |
| `credentialMode` | string | no | Credential detection mode: `standard` (default) or `strict` |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |
| `keepClone` | boolean | no | Keep cloned repo on disk for inspection |

**Quick examples**

Generate a report from CLI:

```bash
npm run report:public-repo -- --repoUrl https://github.com/microsoft/vscode --output reports/vscode-judges-report.md

# stricter credential-signal mode (optional)
npm run report:public-repo -- --repoUrl https://github.com/openclaw/openclaw --credentialMode strict --output reports/openclaw-judges-report-strict.md

# judge findings only (exclude AST/code-structure findings)
npm run report:public-repo -- --repoUrl https://github.com/openclaw/openclaw --includeAstFindings false --output reports/openclaw-judges-report-no-ast.md

# show only findings at 80%+ confidence
npm run report:public-repo -- --repoUrl https://github.com/openclaw/openclaw --minConfidence 0.8 --output reports/openclaw-judges-report-high-confidence.md
```

Call from MCP client:

```json
{
  "tool": "evaluate_public_repo_report",
  "arguments": {
    "repoUrl": "https://github.com/microsoft/vscode",
    "branch": "main",
    "maxFiles": 400,
    "maxFindingsInReport": 120,
    "credentialMode": "strict",
    "includeAstFindings": false,
    "minConfidence": 0.8,
    "outputPath": "reports/vscode-judges-report.md"
  }
}
```

Typical response summary includes:
- overall verdict and average score
- analyzed file count and total findings
- per-judge score table
- highest-risk findings and lowest-scoring files

Sample report snippet:

```text
# Public Repository Full Judges Report

Generated from https://github.com/microsoft/vscode on 2026-02-21T12:00:00.000Z.

## Executive Summary
- Overall verdict: WARNING
- Average file score: 78/100
- Total findings: 412 (critical 3, high 29, medium 114, low 185, info 81)
```

### `get_judges`
List all available judges with their domains and descriptions.

### `evaluate_code`
Submit code to the **full judges panel**. All 33 judges evaluate independently and return a combined verdict.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | The source code to evaluate |
| `language` | string | yes | Programming language (e.g., `typescript`, `python`) |
| `context` | string | no | Additional context about the code |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |

### `evaluate_code_single_judge`
Submit code to a **specific judge** for targeted review.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | The source code to evaluate |
| `language` | string | yes | Programming language |
| `judgeId` | string | yes | See [judge IDs](#judge-ids) below |
| `context` | string | no | Additional context |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |

### `evaluate_project`
Submit multiple files for **project-level analysis**. All 33 judges evaluate each file, plus cross-file architectural analysis detects code duplication, inconsistent error handling, and dependency cycles.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | array | yes | Array of `{ path, content, language }` objects |
| `context` | string | no | Optional project context |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |

### `evaluate_diff`
Evaluate only the **changed lines** in a code diff. Runs all 33 judges on the full file but filters findings to lines you specify. Ideal for PR reviews and incremental analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | The full file content (post-change) |
| `language` | string | yes | Programming language |
| `changedLines` | number[] | yes | 1-based line numbers that were changed |
| `context` | string | no | Optional context about the change |
| `includeAstFindings` | boolean | no | Include AST/code-structure findings (default: true) |
| `minConfidence` | number | no | Minimum finding confidence to include (0-1, default: 0) |

### `analyze_dependencies`
Analyze a dependency manifest file for supply-chain risks, version pinning issues, typosquatting indicators, and dependency hygiene. Supports `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, and `.csproj` files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `manifest` | string | yes | Contents of the dependency manifest file |
| `manifestType` | string | yes | File type: `package.json`, `requirements.txt`, etc. |
| `context` | string | no | Optional context |

#### Judge IDs

`data-security` · `cybersecurity` · `cost-effectiveness` · `scalability` · `cloud-readiness` · `software-practices` · `accessibility` · `api-design` · `reliability` · `observability` · `performance` · `compliance` · `data-sovereignty` · `testing` · `documentation` · `internationalization` · `dependency-health` · `concurrency` · `ethics-bias` · `maintainability` · `error-handling` · `authentication` · `database` · `caching` · `configuration-management` · `backwards-compatibility` · `portability` · `ux` · `logging-privacy` · `rate-limiting` · `ci-cd` · `code-structure` · `agent-instructions`

---

## MCP Prompts

Each judge has a corresponding prompt for LLM-powered deep analysis:

| Prompt | Description |
|--------|-------------|
| `judge-data-security` | Deep data security review |
| `judge-cybersecurity` | Deep cybersecurity review |
| `judge-cost-effectiveness` | Deep cost optimization review |
| `judge-scalability` | Deep scalability review |
| `judge-cloud-readiness` | Deep cloud readiness review |
| `judge-software-practices` | Deep software practices review |
| `judge-accessibility` | Deep accessibility/WCAG review |
| `judge-api-design` | Deep API design review |
| `judge-reliability` | Deep reliability & resilience review |
| `judge-observability` | Deep observability & monitoring review |
| `judge-performance` | Deep performance optimization review |
| `judge-compliance` | Deep regulatory compliance review |
| `judge-data-sovereignty` | Deep data sovereignty and jurisdictional controls review |
| `judge-testing` | Deep testing quality review |
| `judge-documentation` | Deep documentation quality review |
| `judge-internationalization` | Deep i18n review |
| `judge-dependency-health` | Deep dependency health review |
| `judge-concurrency` | Deep concurrency & async safety review |
| `judge-ethics-bias` | Deep ethics & bias review |
| `judge-maintainability` | Deep maintainability & tech debt review |
| `judge-error-handling` | Deep error handling review |
| `judge-authentication` | Deep authentication & authorization review |
| `judge-database` | Deep database design & query review |
| `judge-caching` | Deep caching strategy review |
| `judge-configuration-management` | Deep configuration & secrets review |
| `judge-backwards-compatibility` | Deep backwards compatibility review |
| `judge-portability` | Deep platform portability review |
| `judge-ux` | Deep user experience review |
| `judge-logging-privacy` | Deep logging privacy review |
| `judge-rate-limiting` | Deep rate limiting review |
| `judge-ci-cd` | Deep CI/CD pipeline review |
| `judge-code-structure` | Deep AST-based structural analysis review |
| `judge-agent-instructions` | Deep review of agent instruction markdown quality and safety |
| `full-tribunal` | All 33 judges in a single prompt |

---

## Scoring

Each judge scores the code from **0 to 100**:

| Severity | Score Deduction |
|----------|----------------|
| Critical | −30 points |
| High | −18 points |
| Medium | −10 points |
| Low | −5 points |
| Info | −2 points |

**Verdict logic:**
- **FAIL** — Any critical finding, or score < 60
- **WARNING** — Any high finding, any medium finding, or score < 80
- **PASS** — Score ≥ 80 with no critical, high, or medium findings

The **overall tribunal score** is the average of all 33 judges. The overall verdict fails if **any** judge fails.

---

## Project Structure

```
judges/
├── src/
│   ├── index.ts              # MCP server entry point — tools, prompts, transport
│   ├── types.ts              # TypeScript interfaces (Finding, JudgeEvaluation, etc.)
│   ├── ast/                  # AST analysis engine (built-in, no external deps)
│   │   ├── index.ts          # analyzeStructure() — routes to correct parser
│   │   ├── types.ts          # FunctionInfo, CodeStructure interfaces
│   │   ├── typescript-ast.ts # TypeScript Compiler API parser (JS/TS)
│   │   └── structural-parser.ts  # Scope-tracking parser (Python/Rust/Go/Java/C#)
│   ├── evaluators/           # Analysis engine for each judge
│   │   ├── index.ts          # evaluateWithJudge(), evaluateWithTribunal(), evaluateProject(), etc.
│   │   ├── shared.ts         # Scoring, verdict logic, markdown formatters
│   │   └── *.ts              # One analyzer per judge (33 files)
│   ├── reports/
│   │   └── public-repo-report.ts   # Public repo clone + full tribunal report generation
│   └── judges/               # Judge definitions (id, name, domain, system prompt)
│       ├── index.ts          # JUDGES array, getJudge(), getJudgeSummaries()
│       └── *.ts              # One definition per judge (33 files)
├── scripts/
│   └── generate-public-repo-report.ts  # Run: npm run report:public-repo -- --repoUrl <url>
├── examples/
│   ├── sample-vulnerable-api.ts  # Intentionally flawed code (triggers all judges)
│   └── demo.ts                   # Run: npm run demo
├── tests/
│   └── judges.test.ts            # Run: npm test
├── server.json               # MCP Registry manifest
├── package.json
├── tsconfig.json
└── README.md
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode — recompile on save |
| `npm test` | Run the full test suite |
| `npm run demo` | Run the sample tribunal demo |
| `npm run report:public-repo -- --repoUrl <url>` | Generate a full tribunal report for a public repository URL |
| `npm start` | Start the MCP server |
| `npm run clean` | Remove `dist/` |

---

## License

MIT
