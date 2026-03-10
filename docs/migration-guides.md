# Migration Guides

Switching from another code analysis tool to Judges? These guides map familiar
concepts, configs, and workflows to their Judges equivalents.

---

## From ESLint

| ESLint Concept | Judges Equivalent |
|---|---|
| `.eslintrc.json` | `.judgesrc` or `.judgesrc.json` |
| `"rules": { "no-eval": "error" }` | `"ruleOverrides": { "CYBER-*": { "severity": "critical" } }` |
| `"extends": ["recommended"]` | `"preset": "strict"` |
| `--fix` | `judges fix <file> --apply` |
| `"ignorePatterns"` | `"exclude": ["dist/**"]` |
| `// eslint-disable-next-line` | `// judges-ignore RULE-ID: reason` |
| Per-directory `.eslintrc` cascading | Per-directory `.judgesrc` cascading (automatic) |
| `overrides[].files` | `"overrides": [{ "files": "*.test.ts", ... }]` |

### Quick Start

```bash
# 1. Install
npm install -g @anthropic/judges

# 2. Initialize (creates .judgesrc)
judges init

# 3. Run on your project
judges eval src/

# 4. Migrate your ignores
# Replace `// eslint-disable-next-line no-eval` with:
# // judges-ignore CYBER-001: eval required for dynamic config
```

### Key Differences

- **Judges evaluates 44 dimensions** — not just style/lint. Security, performance,
  accessibility, database, API design, error handling, and more.
- **No per-rule config needed** — Judges auto-selects relevant rules per language.
- **Confidence scores** — every finding has a 0-1 confidence score with evidence basis.
- **Auto-fix patches** — 114 deterministic patches, no plugin installation needed.

---

## From SonarQube / SonarCloud

| SonarQube Concept | Judges Equivalent |
|---|---|
| Quality Gate | `"failOnScoreBelow": 7` + `"failOnFindings": true` |
| Quality Profile | `"preset": "security-only"` or `"preset": "strict"` |
| `sonar-project.properties` | `.judgesrc` |
| Issue severity (Blocker/Critical/Major) | Severity (critical/high/medium/low/info) |
| `@SuppressWarnings` | `// judges-ignore RULE-ID` |
| SonarScanner CLI | `judges eval <file-or-dir>` |
| SARIF export | `judges eval --format sarif` |

### Quick Start

```bash
# Replace your SonarScanner step with:
judges eval src/ --format sarif --output judges.sarif

# Or use GitHub Actions annotations directly:
judges eval src/ --format github-actions

# Quality gate equivalent:
judges eval src/ --fail-on-findings --min-score 7
```

### Key Differences

- **Zero infrastructure** — no server, no database. Runs locally or in CI.
- **Instant results** — deterministic evaluation, no background analysis queue.
- **MCP integration** — works directly inside AI coding agents (Copilot, Claude, Cursor).

---

## From Semgrep

| Semgrep Concept | Judges Equivalent |
|---|---|
| `.semgrep.yml` rules | Built-in evaluators (45 domains, 600+ rules) |
| `--config auto` | `judges eval` (auto-selects relevant judges) |
| `--sarif` | `--format sarif` |
| `# nosemgrep: rule-id` | `// judges-ignore RULE-ID: reason` |
| Semgrep Registry | Plugin system (`"plugins": ["my-judges-plugin"]`) |
| `--severity ERROR` | `--min-severity high` |

### Quick Start

```bash
# Replace: semgrep --config auto src/
# With:
judges eval src/

# Replace: semgrep --config auto --sarif -o results.sarif
# With:
judges eval src/ --format sarif --output results.sarif
```

### Key Differences

- **Beyond pattern matching** — Judges includes AST analysis, taint tracking,
  cross-file analysis, and confidence scoring.
- **Auto-fix** — `judges fix <file> --apply` applies deterministic patches.
- **45 evaluation domains** vs. pattern-matching rules.

---

## From CodeQL

| CodeQL Concept | Judges Equivalent |
|---|---|
| CodeQL database | No build step needed — direct source analysis |
| `.ql` query files | Built-in evaluators + plugin judges |
| `codeql analyze` | `judges eval <file-or-dir>` |
| SARIF results | `--format sarif` |
| Query suites | `--preset security-only` |

### Quick Start

```bash
# No database creation needed. Simply:
judges eval src/ --format sarif --output results.sarif

# For CI — use GitHub Actions annotations:
judges eval src/ --format github-actions --changed-only
```

### Key Differences

- **No compilation/build required** — Judges works on source text + AST.
- **Sub-second analysis** — no database build step.
- **Broader coverage** — security + performance + accessibility + API design + more.

---

## CI Pipeline Migration

### GitHub Actions

```yaml
# Replace your existing analysis step with:
- name: Judges Analysis
  run: |
    npx @anthropic/judges eval src/ \
      --format github-actions \
      --changed-only \
      --fail-on-findings \
      --min-score 7
```

### GitLab CI

```yaml
judges:
  stage: test
  script:
    - npx @anthropic/judges eval src/ --format codeclimate --output gl-code-quality-report.json
  artifacts:
    reports:
      codequality: gl-code-quality-report.json
```

### Azure Pipelines

```yaml
- script: npx @anthropic/judges eval src/ --format sarif --output $(Build.ArtifactStagingDirectory)/judges.sarif
  displayName: 'Judges Analysis'
- task: PublishBuildArtifacts@1
  inputs:
    pathToPublish: $(Build.ArtifactStagingDirectory)/judges.sarif
    artifactName: CodeAnalysis
```

---

## Configuration Mapping Cheatsheet

```jsonc
// .judgesrc — comprehensive example
{
  // Equivalent to ESLint/Semgrep severity filters
  "minSeverity": "medium",

  // Equivalent to SonarQube Quality Gate
  "failOnScoreBelow": 7,
  "failOnFindings": true,

  // Equivalent to ESLint extends/SonarQube Quality Profile
  "preset": "strict",

  // Equivalent to .eslintignore / .semgrepignore
  "exclude": ["dist/**", "*.min.js", "vendor/**"],

  // Per-rule tuning (like ESLint rules or SonarQube rule activation)
  "ruleOverrides": {
    "DOC-*": { "severity": "info" },
    "PERF-003": { "disabled": true }
  },

  // Weighted scoring (emphasize security over docs)
  "judgeWeights": {
    "cybersecurity": 2.0,
    "authentication": 2.0,
    "documentation": 0.5
  },

  // Per-path overrides (like ESLint overrides)
  "overrides": [
    {
      "files": "**/*.test.ts",
      "disabledJudges": ["documentation", "error-handling"],
      "minSeverity": "high"
    },
    {
      "files": "src/legacy/**",
      "minSeverity": "critical"
    }
  ]
}
```
