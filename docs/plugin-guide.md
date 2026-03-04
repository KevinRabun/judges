# Judges Panel — Plugin Development Guide

Build custom rules, judges, and evaluation hooks that extend the Judges Panel platform.

## Overview

The plugin system supports three extension points:

1. **Custom Rules** — pattern-based or AST-driven rules that run under an existing judge
2. **Custom Judges** — entirely new evaluation domains
3. **Hooks** — lifecycle hooks that modify evaluation behavior

---

## Quick Start

```typescript
import {
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  getCustomRules,
  evaluateCustomRules,
  clearPlugins,
} from "@kevinrabun/judges/api";

// Register a plugin with one custom rule
registerPlugin({
  name: "my-org-rules",
  version: "1.0.0",
  description: "Internal security policies",
  rules: [
    {
      id: "ORG-001",
      title: "No console.log in production",
      severity: "medium",
      judgeId: "code-structure",
      description: "Remove debugging statements before production deployment",
      languages: ["typescript", "javascript"],
      pattern: /console\.(log|debug|info)\(/g,
      suggestedFix: "Remove console.log or replace with a structured logger.",
    },
  ],
});
```

---

## Plugin Interface

```typescript
interface JudgesPlugin {
  /** Unique display name */
  name: string;

  /** Semantic version */
  version: string;

  /** Optional description */
  description?: string;

  /** Custom rules contributed by this plugin */
  rules?: CustomRule[];

  /** Custom judge evaluators */
  judges?: JudgeDefinition[];

  /** Called before each evaluation — can modify code or options */
  beforeEvaluate?: (context: EvaluationContext) => EvaluationContext | Promise<EvaluationContext>;

  /** Called after each evaluation — can modify findings */
  afterEvaluate?: (findings: Finding[], context: EvaluationContext) => Finding[] | Promise<Finding[]>;

  /** Transform findings before final output */
  transformFindings?: (findings: Finding[]) => Finding[] | Promise<Finding[]>;
}
```

---

## Custom Rules

A `CustomRule` runs under an existing judge domain and produces `Finding` objects.

```typescript
interface CustomRule {
  /** Rule ID following PREFIX-NNN format (e.g., "ORG-001") */
  id: string;

  /** Human-readable title */
  title: string;

  /** Severity level */
  severity: "critical" | "high" | "medium" | "low" | "info";

  /** Parent judge this rule belongs to */
  judgeId: string;

  /** Detailed description */
  description: string;

  /** Restrict to specific languages (omit for all) */
  languages?: string[];

  /** RegExp pattern for simple matching */
  pattern?: RegExp;

  /** Custom analysis function for complex logic */
  analyze?: (code: string, language: string) => Finding[] | Promise<Finding[]>;

  /** Suggested remediation text */
  suggestedFix?: string;

  /** Tags for categorization */
  tags?: string[];
}
```

### Pattern-Based Rules

For simple string/regex matching, use the `pattern` property. The plugin engine will automatically generate findings at each match location:

```typescript
{
  id: "SEC-CUSTOM-001",
  title: "Hardcoded AWS credentials",
  severity: "critical",
  judgeId: "cybersecurity",
  description: "AWS access keys must not be hardcoded in source code",
  pattern: /AKIA[0-9A-Z]{16}/g,
  suggestedFix: "Use environment variables or a secrets manager",
  tags: ["credentials", "aws"],
}
```

### Analyzer-Based Rules

For complex logic that goes beyond regex, use the `analyze` function:

```typescript
{
  id: "ARCH-001",
  title: "Service layer imports data layer directly",
  severity: "medium",
  judgeId: "code-structure",
  description: "Services should not import repositories directly — use dependency injection",
  analyze: (code, language) => {
    const findings: Finding[] = [];
    if (code.includes("import") && code.includes("Repository")) {
      const line = code.split("\n").findIndex(l => l.includes("Repository")) + 1;
      findings.push({
        ruleId: "ARCH-001",
        title: "Direct repository import in service layer",
        severity: "medium",
        confidence: 0.8,
        description: "Use DI instead of direct imports for testability",
        location: { line },
      });
    }
    return findings;
  },
}
```

---

## Lifecycle Hooks

### `beforeEvaluate`

Modify the evaluation context before judges run. Use cases: inject additional code context, normalize formatting, add metadata.

```typescript
registerPlugin({
  name: "context-enricher",
  version: "1.0.0",
  beforeEvaluate: (context) => {
    // Add organization context
    return {
      ...context,
      metadata: { ...context.metadata, org: "acme-corp" },
    };
  },
});
```

### `afterEvaluate`

Modify findings after judges run. Use cases: filter out accepted findings, adjust severities based on context, add metadata.

```typescript
registerPlugin({
  name: "severity-adjuster",
  version: "1.0.0",
  afterEvaluate: (findings, context) => {
    // Promote all SQL injection findings to critical for fintech
    return findings.map(f => {
      if (f.ruleId?.startsWith("CYBER") && f.title?.includes("SQL")) {
        return { ...f, severity: "critical" };
      }
      return f;
    });
  },
});
```

### `transformFindings`

Final-stage transformation before output. Runs after deduplication.

```typescript
registerPlugin({
  name: "tag-enricher",
  version: "1.0.0",
  transformFindings: (findings) => {
    return findings.map(f => ({
      ...f,
      tags: [...(f.tags || []), "reviewed-by-my-plugin"],
    }));
  },
});
```

---

## Plugin Management

```typescript
import {
  registerPlugin,
  unregisterPlugin,
  getRegisteredPlugins,
  getCustomRules,
  getPluginJudges,
  clearPlugins,
} from "@kevinrabun/judges/api";

// Register
registerPlugin(myPlugin);

// List registered plugins
const plugins = getRegisteredPlugins();
// => [{ name: "my-org-rules", version: "1.0.0", ruleCount: 3 }]

// Get all custom rules across plugins
const rules = getCustomRules();

// Get custom judges
const judges = getPluginJudges();

// Unregister by name
unregisterPlugin("my-org-rules");

// Clear all plugins (useful in tests)
clearPlugins();
```

---

## Evaluating Custom Rules

```typescript
import { evaluateCustomRules } from "@kevinrabun/judges/api";

const findings = evaluateCustomRules(code, language);
// Returns Finding[] from all registered custom rules
```

Custom rules are also automatically included when using the main `evaluateCode()` and `evaluateProject()` APIs.

---

## Full Example: Organization Policy Plugin

```typescript
import { registerPlugin } from "@kevinrabun/judges/api";
import type { JudgesPlugin, CustomRule, Finding } from "@kevinrabun/judges/api";

const orgRules: CustomRule[] = [
  {
    id: "ACME-001",
    title: "No direct database queries in controllers",
    severity: "high",
    judgeId: "code-structure",
    description: "Controllers must delegate to service layer",
    languages: ["typescript", "javascript"],
    analyze: (code, lang) => {
      const findings: Finding[] = [];
      const lines = code.split("\n");
      lines.forEach((line, i) => {
        if (line.match(/\.(query|execute|raw)\s*\(/) && !line.includes("service")) {
          findings.push({
            ruleId: "ACME-001",
            title: "Direct DB query in controller",
            severity: "high",
            confidence: 0.75,
            description: "Move database logic to the service layer",
            location: { line: i + 1 },
          });
        }
      });
      return findings;
    },
    suggestedFix: "Create a service class and move queries there",
    tags: ["architecture", "layering"],
  },
  {
    id: "ACME-002",
    title: "Missing error boundary",
    severity: "medium",
    judgeId: "error-handling",
    description: "React components must be wrapped in error boundaries",
    languages: ["typescript", "javascript", "tsx", "jsx"],
    pattern: /class\s+\w+\s+extends\s+React\.Component/g,
    suggestedFix: "Wrap component tree with an ErrorBoundary component",
  },
];

const acmePlugin: JudgesPlugin = {
  name: "acme-standards",
  version: "2.1.0",
  description: "ACME Corp internal coding standards",
  rules: orgRules,
  afterEvaluate: (findings) => {
    // Tag all findings for internal tracking
    return findings.map(f => ({
      ...f,
      tags: [...(f.tags || []), "acme-reviewed"],
    }));
  },
};

registerPlugin(acmePlugin);
```

---

## Best Practices

1. **Use unique prefixes** — Avoid collision with built-in prefixes (CYBER, DATA, AUTH, etc.). Use org-specific prefixes like `ACME-`, `ORG-`, `INT-`.

2. **Set appropriate confidence** — When using `analyze()`, set `confidence` values that reflect pattern reliability. Pattern-based rules should typically use 0.7-0.9.

3. **Specify languages** — Restrict rules to relevant languages to avoid false positives.

4. **Keep hooks fast** — `beforeEvaluate` and `afterEvaluate` run for every evaluation. Avoid expensive I/O or network calls.

5. **Version your plugins** — Use semantic versioning to track changes to rules and behavior.

6. **Test with `clearPlugins()`** — Reset plugin state between test cases:
   ```typescript
   afterEach(() => clearPlugins());
   ```

7. **Prefer `pattern` over `analyze`** — When regex is sufficient, use `pattern` for simpler maintenance and automatic line-number extraction.
