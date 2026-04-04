# @kevinrabun/judges-cli

Standalone CLI package for the [Judges Panel](https://github.com/KevinRabun/judges) — 45 specialized judges that evaluate code for security, quality, compliance, and 40 more dimensions.

## Install

```bash
npm install -g @kevinrabun/judges-cli
```

## Usage

```bash
# Evaluate code
judges eval src/app.ts
judges eval src/ --format sarif --output report.sarif
judges eval src/app.ts --judge cybersecurity
judges eval src/app.ts --preset strict --fail-on-findings

# List judges and regulatory frameworks
judges list
judges list --frameworks

# Auto-fix findings
judges fix src/app.ts --apply

# Agentic skills
judges skill ai-code-review --file src/app.ts
judges skill security-review --file src/api.ts --format json
judges skills

# Self-teaching
judges codify-amendments          # bake benchmark amendments into judge files
judges codify-amendments --dry-run
```

## Configuration

Create a `.judgesrc.json` in your project root:

```json
{
  "preset": "strict",
  "regulatoryScope": ["GDPR", "PCI-DSS"],
  "disabledJudges": ["accessibility"],
  "failOnFindings": true
}
```

See the [full configuration reference](https://github.com/KevinRabun/judges#configuration) for all options.

## Packages

- **`@kevinrabun/judges-cli`** — This package. Binary `judges` for CI/CD pipelines.
- **`@kevinrabun/judges`** — Programmatic API + MCP server.
- **VS Code extension** — [`kevinrabun.judges-panel`](https://marketplace.visualstudio.com/items?itemName=kevinrabun.judges-panel).