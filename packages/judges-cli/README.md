# @kevinrabun/judges-cli

Standalone CLI package for Judges.

## Install

```bash
npm install -g @kevinrabun/judges-cli
```

## Usage

```bash
judges eval src/app.ts
judges list
judges hook install

# Agentic skills
judges skill ai-code-review --file src/app.ts
judges skill security-review --file src/api.ts --format json
judges skills   # list available skills
```

Use `@kevinrabun/judges` when you need the MCP server or programmatic API.