# Judges Panel

An MCP (Model Context Protocol) server that provides a panel of **18 specialized judges** to evaluate AI-generated code — acting as an independent quality gate regardless of which project is being reviewed.

## The Judge Panel

| Judge | Domain | Rule Prefix | What It Evaluates |
|-------|--------|-------------|-------------------|
| **Judge Data Security** | Data Security & Privacy | `DATA-` | Encryption, PII handling, secrets management, access controls, GDPR/CCPA/HIPAA compliance |
| **Judge Cybersecurity** | Cybersecurity & Threat Defense | `CYBER-` | Injection attacks, XSS, CSRF, auth flaws, dependency CVEs, OWASP Top 10 |
| **Judge Cost Effectiveness** | Cost Optimization | `COST-` | Algorithm efficiency, N+1 queries, memory waste, caching strategy, cloud spend |
| **Judge Scalability** | Scalability & Performance | `SCALE-` | Statelessness, horizontal scaling, concurrency, bottlenecks, rate limiting |
| **Judge Cloud Readiness** | Cloud-Native & DevOps | `CLOUD-` | 12-Factor compliance, containerization, observability, graceful shutdown, IaC |
| **Judge Software Practices** | Engineering Best Practices | `SWDEV-` | SOLID principles, type safety, error handling, testing, input validation, clean code |
| **Judge Accessibility** | Accessibility (a11y) | `A11Y-` | WCAG compliance, screen reader support, keyboard navigation, ARIA, color contrast |
| **Judge API Design** | API Design & Contracts | `API-` | REST conventions, versioning, pagination, error responses, consistency |
| **Judge Reliability** | Reliability & Resilience | `REL-` | Error handling, timeouts, retries, circuit breakers, graceful degradation |
| **Judge Observability** | Observability & Monitoring | `OBS-` | Structured logging, health checks, metrics, tracing, correlation IDs |
| **Judge Performance** | Performance & Efficiency | `PERF-` | N+1 queries, sync I/O, caching, memory leaks, algorithmic complexity |
| **Judge Compliance** | Regulatory Compliance | `COMP-` | GDPR/CCPA, PII protection, consent, data retention, audit trails |
| **Judge Testing** | Testing & Quality Assurance | `TEST-` | Test coverage, assertions, test isolation, naming, external dependencies |
| **Judge Documentation** | Documentation & Readability | `DOC-` | JSDoc/docstrings, magic numbers, TODOs, code comments, module docs |
| **Judge Internationalization** | Internationalization (i18n) | `I18N-` | Hardcoded strings, locale handling, currency formatting, RTL support |
| **Judge Dependency Health** | Dependency Management | `DEPS-` | Version pinning, deprecated packages, supply chain, import hygiene |
| **Judge Concurrency** | Concurrency & Async Safety | `CONC-` | Race conditions, unbounded parallelism, missing await, resource cleanup |
| **Judge Ethics & Bias** | Ethics & Bias | `ETHICS-` | Demographic logic, explainability, dark patterns, inclusive language |

## How It Works

The tribunal operates in two modes:

1. **Pattern-Based Analysis (Tools)** — The `evaluate_code` and `evaluate_code_single_judge` tools perform heuristic analysis using pattern matching to catch common anti-patterns. This works entirely offline with zero external API calls.

2. **LLM-Powered Deep Analysis (Prompts)** — The server exposes MCP prompts (`judge-data-security`, `judge-cybersecurity`, etc., and `full-tribunal`) that provide each judge's expert persona as a system prompt. When used by an LLM-based client, this enables much deeper, context-aware analysis.

## MCP Tools

### `get_judges`
List all available judges with their domains and descriptions.

### `evaluate_code`
Submit code to the **full judges panel**. All 18 judges evaluate independently and return a combined verdict.

**Parameters:**
- `code` (string, required) — The source code to evaluate
- `language` (string, required) — Programming language (e.g., "typescript", "python")
- `context` (string, optional) — Additional context about the code

**Returns:** Combined verdict with overall score, per-judge scores, all findings, and recommendations.

### `evaluate_code_single_judge`
Submit code to a **specific judge** for targeted review.

**Parameters:**
- `code` (string, required) — The source code to evaluate
- `language` (string, required) — Programming language
- `judgeId` (string, required) — One of: `data-security`, `cybersecurity`, `cost-effectiveness`, `scalability`, `cloud-readiness`, `software-practices`, `accessibility`, `api-design`, `reliability`, `observability`, `performance`, `compliance`, `testing`, `documentation`, `internationalization`, `dependency-health`, `concurrency`, `ethics-bias`
- `context` (string, optional) — Additional context

## MCP Prompts

- `judge-data-security` — Deep data security review via LLM
- `judge-cybersecurity` — Deep cybersecurity review via LLM
- `judge-cost-effectiveness` — Deep cost optimization review via LLM
- `judge-scalability` — Deep scalability review via LLM
- `judge-cloud-readiness` — Deep cloud readiness review via LLM
- `judge-software-practices` — Deep software practices review via LLM
- `judge-accessibility` — Deep accessibility/WCAG review via LLM
- `judge-api-design` — Deep API design review via LLM
- `judge-reliability` — Deep reliability & resilience review via LLM
- `judge-observability` — Deep observability & monitoring review via LLM
- `judge-performance` — Deep performance optimization review via LLM
- `judge-compliance` — Deep regulatory compliance review via LLM
- `judge-testing` — Deep testing quality review via LLM
- `judge-documentation` — Deep documentation quality review via LLM
- `judge-internationalization` — Deep i18n review via LLM
- `judge-dependency-health` — Deep dependency health review via LLM
- `judge-concurrency` — Deep concurrency & async safety review via LLM
- `judge-ethics-bias` — Deep ethics & bias review via LLM
- `full-tribunal` — All 18 judges via LLM in a single prompt

## Setup

### Build

```bash
npm install
npm run build
```

### Configure in VS Code (GitHub Copilot / Claude Desktop)

Add to your MCP settings (`.vscode/mcp.json`, `claude_desktop_config.json`, etc.):

```json
{
  "mcpServers": {
    "judges": {
      "command": "node",
      "args": ["<path-to>/judges/dist/index.js"]
    }
  }
}
```

### Configure in VS Code Settings (settings.json)

```json
{
  "mcp": {
    "servers": {
      "judges": {
        "command": "node",
        "args": ["<path-to>/judges/dist/index.js"]
      }
    }
  }
}
```

## Scoring

Each judge scores the code from **0 to 100**:

| Severity | Score Deduction |
|----------|----------------|
| Critical | -20 points |
| High | -12 points |
| Medium | -6 points |
| Low | -3 points |
| Info | 0 points |

**Verdict logic:**
- **FAIL** — Any critical finding, or score < 50
- **WARNING** — Any high finding, or score < 75
- **PASS** — Score ≥ 75 with no critical or high findings

The **overall tribunal score** is the average of all 18 judges. The overall verdict fails if **any** judge fails.

## Example Output

```
# Judges Panel — Verdict

**Overall Verdict: WARNING** | **Score: 68/100**
Total critical findings: 1 | Total high findings: 3

## Individual Judge Results

❌ **Judge Data Security** (FAIL, 60/100) — 3 finding(s)
⚠️ **Judge Cybersecurity** (WARNING, 76/100) — 2 finding(s)
✅ **Judge Cost Effectiveness** (PASS, 88/100) — 1 finding(s)
⚠️ **Judge Scalability** (WARNING, 70/100) — 2 finding(s)
✅ **Judge Cloud Readiness** (PASS, 82/100) — 1 finding(s)
⚠️ **Judge Software Practices** (WARNING, 72/100) — 3 finding(s)
```

## Project Structure

```
judges/
├── src/
│   ├── index.ts        # MCP server entry point — tools, prompts, transport
│   ├── types.ts         # TypeScript interfaces for judges, findings, verdicts
│   ├── judges.ts        # Judge definitions with expert system prompts
│   └── evaluator.ts     # Pattern-based analysis engine + scoring
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
