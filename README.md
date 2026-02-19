# Judges Panel

An MCP (Model Context Protocol) server that provides a panel of **18 specialized judges** to evaluate AI-generated code — acting as an independent quality gate regardless of which project is being reviewed.

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

Run the included demo to see all 18 judges evaluate a purposely flawed API server:

```bash
npm run demo
```

This evaluates [`examples/sample-vulnerable-api.ts`](examples/sample-vulnerable-api.ts) — a file intentionally packed with security holes, performance anti-patterns, and code quality issues — and prints a full verdict with per-judge scores and findings.

**What you'll see:**

```
╔══════════════════════════════════════════════════════════════╗
║           Judges Panel — Full Tribunal Demo                 ║
╚══════════════════════════════════════════════════════════════╝

  Overall Verdict : FAIL
  Overall Score   : 61/100
  Critical Issues : 15
  High Issues     : 17
  Total Findings  : 81
  Judges Run      : 18

  Per-Judge Breakdown:
  ────────────────────────────────────────────────────────────────
  ❌ Judge Data Security              0/100    7 finding(s)
  ❌ Judge Cybersecurity             24/100    6 finding(s)
  ⚠️  Judge Cost Effectiveness       70/100    5 finding(s)
  ⚠️  Judge Scalability              79/100    4 finding(s)
  ❌ Judge Cloud Readiness           77/100    4 finding(s)
  ⚠️  Judge Software Practices       73/100    5 finding(s)
  ❌ Judge Accessibility             28/100    8 finding(s)
  ❌ Judge API Design                35/100    9 finding(s)
  ⚠️  Judge Reliability              70/100    3 finding(s)
  ❌ Judge Observability             65/100    5 finding(s)
  ❌ Judge Performance               53/100    5 finding(s)
  ❌ Judge Compliance                34/100    4 finding(s)
  ✅ Judge Testing                   94/100    1 finding(s)
  ✅ Judge Documentation             82/100    4 finding(s)
  ✅ Judge Internationalization      79/100    4 finding(s)
  ✅ Judge Dependency Health         94/100    1 finding(s)
  ⚠️  Judge Concurrency              64/100    4 finding(s)
  ❌ Judge Ethics & Bias             77/100    2 finding(s)
```

### 3. Run the Tests

```bash
npm test
```

Runs 184 automated tests covering all 18 judges, markdown formatters, and edge cases.

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
| **Testing** | Testing & Quality Assurance | `TEST-` | Test coverage, assertions, test isolation, naming |
| **Documentation** | Documentation & Readability | `DOC-` | JSDoc/docstrings, magic numbers, TODOs, code comments |
| **Internationalization** | Internationalization (i18n) | `I18N-` | Hardcoded strings, locale handling, currency formatting |
| **Dependency Health** | Dependency Management | `DEPS-` | Version pinning, deprecated packages, supply chain |
| **Concurrency** | Concurrency & Async Safety | `CONC-` | Race conditions, unbounded parallelism, missing await |
| **Ethics & Bias** | Ethics & Bias | `ETHICS-` | Demographic logic, dark patterns, inclusive language |

---

## How It Works

The tribunal operates in two modes:

1. **Pattern-Based Analysis (Tools)** — The `evaluate_code` and `evaluate_code_single_judge` tools perform heuristic analysis using pattern matching to catch common anti-patterns. This works entirely offline with zero external API calls.

2. **LLM-Powered Deep Analysis (Prompts)** — The server exposes MCP prompts (e.g., `judge-data-security`, `full-tribunal`) that provide each judge's expert persona as a system prompt. When used by an LLM-based client, this enables deeper, context-aware analysis beyond what pattern matching can detect.

---

## Composable by Design

Judges Panel is intentionally focused on **heuristic pattern detection** — fast, offline, zero-dependency. It does not try to be an AST parser, a CVE scanner, or a linter. Those capabilities belong in dedicated MCP servers that an AI agent can orchestrate alongside Judges.

### Recommended MCP Stack

When your AI coding assistant connects to multiple MCP servers, each one contributes its specialty:

```
┌─────────────────────────────────────────────────────────┐
│                   AI Coding Assistant                   │
│              (Claude, Copilot, Cursor, etc.)            │
└──────┬──────────┬──────────┬──────────┬────────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │ Judges  │ │  AST   │ │  CVE / │ │ Linter │
  │  Panel  │ │ Server │ │  SBOM  │ │ Server │
  └─────────┘ └────────┘ └────────┘ └────────┘
   Heuristic   Structural  Vuln DB    Style &
   patterns    analysis    scanning   correctness
```

| Layer | What It Does | Example Servers |
|-------|-------------|-----------------|
| **Judges Panel** | 18-judge quality gate — security patterns, cost, scalability, a11y, compliance, ethics | This server |
| **AST Analysis** | Deep structural analysis — data flow, complexity metrics, dead code, type tracking | Tree-sitter, Semgrep, SonarQube MCP servers |
| **CVE / SBOM** | Vulnerability scanning against live databases — known CVEs, license risks, supply chain | OSV, Snyk, Trivy, Grype MCP servers |
| **Linting** | Language-specific style and correctness rules | ESLint, Ruff, Clippy MCP servers |
| **Runtime Profiling** | Memory, CPU, latency measurement on running code | Custom profiling MCP servers |

### Why Orchestration Beats a Monolith

| | Monolith | Orchestrated MCP Stack |
|---|---|---|
| **Maintenance** | One team owns everything | Each server evolves independently |
| **Depth** | Shallow coverage of many domains | Deep expertise per server |
| **Updates** | CVE data stale = full redeploy | CVE server updates on its own |
| **Language support** | Must embed parsers for every language | AST server handles this |
| **User choice** | All or nothing | Pick the servers you need |
| **Offline capability** | Hard to achieve with CVE deps | Judges runs fully offline; CVE server handles network |

### What This Means in Practice

When you ask your AI assistant *"Is this code production-ready?"*, the agent can:

1. **Judges Panel** → Scan for hardcoded secrets, missing error handling, N+1 queries, accessibility gaps, compliance issues
2. **AST Server** → Analyze cyclomatic complexity, detect unreachable code, trace tainted data flows
3. **CVE Server** → Check every dependency in `package.json` against known vulnerabilities
4. **Linter Server** → Enforce team style rules, catch language-specific gotchas

Each server returns structured findings. The AI synthesizes everything into a single, actionable review — no single server needs to do it all.

---

## MCP Tools

### `get_judges`
List all available judges with their domains and descriptions.

### `evaluate_code`
Submit code to the **full judges panel**. All 18 judges evaluate independently and return a combined verdict.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | The source code to evaluate |
| `language` | string | yes | Programming language (e.g., `typescript`, `python`) |
| `context` | string | no | Additional context about the code |

### `evaluate_code_single_judge`
Submit code to a **specific judge** for targeted review.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | yes | The source code to evaluate |
| `language` | string | yes | Programming language |
| `judgeId` | string | yes | See [judge IDs](#judge-ids) below |
| `context` | string | no | Additional context |

#### Judge IDs

`data-security` · `cybersecurity` · `cost-effectiveness` · `scalability` · `cloud-readiness` · `software-practices` · `accessibility` · `api-design` · `reliability` · `observability` · `performance` · `compliance` · `testing` · `documentation` · `internationalization` · `dependency-health` · `concurrency` · `ethics-bias`

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
| `judge-testing` | Deep testing quality review |
| `judge-documentation` | Deep documentation quality review |
| `judge-internationalization` | Deep i18n review |
| `judge-dependency-health` | Deep dependency health review |
| `judge-concurrency` | Deep concurrency & async safety review |
| `judge-ethics-bias` | Deep ethics & bias review |
| `full-tribunal` | All 18 judges in a single prompt |

---

## Scoring

Each judge scores the code from **0 to 100**:

| Severity | Score Deduction |
|----------|----------------|
| Critical | −20 points |
| High | −12 points |
| Medium | −6 points |
| Low | −3 points |
| Info | 0 points |

**Verdict logic:**
- **FAIL** — Any critical finding, or score < 50
- **WARNING** — Any high finding, or score < 75
- **PASS** — Score ≥ 75 with no critical or high findings

The **overall tribunal score** is the average of all 18 judges. The overall verdict fails if **any** judge fails.

---

## Project Structure

```
judges/
├── src/
│   ├── index.ts              # MCP server entry point — tools, prompts, transport
│   ├── types.ts              # TypeScript interfaces (Finding, JudgeEvaluation, etc.)
│   ├── evaluators/           # Pattern-based analysis engine for each judge
│   │   ├── index.ts          # evaluateWithJudge(), evaluateWithTribunal()
│   │   ├── shared.ts         # Scoring, verdict logic, markdown formatters
│   │   └── *.ts              # One analyzer per judge (18 files)
│   └── judges/               # Judge definitions (id, name, domain, system prompt)
│       ├── index.ts          # JUDGES array, getJudge(), getJudgeSummaries()
│       └── *.ts              # One definition per judge (18 files)
├── examples/
│   ├── sample-vulnerable-api.ts  # Intentionally flawed code (triggers all 18 judges)
│   └── demo.ts                   # Run: npm run demo
├── tests/
│   └── judges.test.ts            # Run: npm test (184 tests)
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
| `npm test` | Run the full test suite (184 tests) |
| `npm run demo` | Run the sample tribunal demo |
| `npm start` | Start the MCP server |
| `npm run clean` | Remove `dist/` |

---

## License

MIT
