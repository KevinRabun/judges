# Judges Panel — API Reference

Programmatic API for integrating Judges Panel into applications, pipelines, and custom tooling.

```bash
npm install @kevinrabun/judges
```

> **CLI vs MCP vs API**
> - **CLI binary:** `@kevinrabun/judges-cli` → provides the `judges` command (use `npx @kevinrabun/judges-cli ...`). **Tip:** set `JUDGES_SHOW_EXPERIMENTAL=1` to print experimental commands in `--help`.
> - **MCP/API:** `@kevinrabun/judges` → this package; exposes `evaluateCode`, `evaluateCodeV2`, etc., and ships the MCP server.
> - For one-off runs, you can also use `npx @kevinrabun/judges-cli eval --file app.ts`.

## Quick Start

```typescript
import { evaluateCode, evaluateCodeSingleJudge, JUDGES } from "@kevinrabun/judges/api";

// Full tribunal evaluation
const verdict = evaluateCode("const x = eval(input);", "typescript");
console.log(verdict.overallVerdict); // "fail"
console.log(verdict.overallScore);   // 0-100

// Single judge
const result = evaluateCodeSingleJudge("cybersecurity", code, "typescript");

// List all judges
console.log(JUDGES.length); // 45
```

---

## Core Evaluation

### `evaluateCode(code, language, options?)`

Evaluate code against the full panel of 45 judges.

| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | `string` | Source code to evaluate |
| `language` | `string` | Language identifier (`"typescript"`, `"python"`, etc.) |
| `options?` | `EvaluationOptions` | Config overrides, target judges, context |

**Returns:** `TribunalVerdict`

```typescript
const verdict = evaluateCode(code, "python", {
  config: { minSeverity: "high", disabledJudges: ["documentation"] },
});
```

### `evaluateCodeSingleJudge(judgeId, code, language, options?)`

Evaluate with a single judge.

| Parameter | Type | Description |
|-----------|------|-------------|
| `judgeId` | `string` | Judge identifier (e.g., `"cybersecurity"`) |
| `code` | `string` | Source code |
| `language` | `string` | Language identifier |

**Returns:** `JudgeEvaluation`

### `evaluateProject(files)`

Analyze a multi-file project with cross-file deduplication and architectural analysis.

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `ProjectFile[]` | Array of `{ path, content, language }` |

**Returns:** `ProjectVerdict` — includes `fileResults`, `architecturalFindings`, and cross-file dedup

### `evaluateDiff(diffText, language?)`

Analyze a unified diff, focusing findings on changed lines.

| Parameter | Type | Description |
|-----------|------|-------------|
| `diffText` | `string` | Unified diff text |
| `language?` | `string` | Language override |

**Returns:** `DiffVerdict`

### Baseline helpers
- `runBaseline(argv: string[])` — CLI entry-point for `judges baseline create|update` (see README for CLI syntax).
- `createProjectBaseline(dir, exclude?, include?, maxFiles?, language?)`
- `updateBaseline(existingPath, dir, exclude?, include?, maxFiles?, language?)`
- `loadBaselineData(path)` — loads v1 or v2 baselines
- `isBaselined(finding, baseline, code)` — checks if a finding is already baselined

### `analyzeDependencies(manifestContent, manifestType)`

Analyze a dependency manifest (package.json, requirements.txt, etc.) for supply-chain risks.

**Returns:** `DependencyVerdict`

---

## V2 Policy-Aware API

### `evaluateCodeV2(params)`

Context-aware evaluation with policy profiles, confidence scoring, and uncertainty reporting.

```typescript
import { evaluateCodeV2, getSupportedPolicyProfiles } from "@kevinrabun/judges/api";

const result = evaluateCodeV2({
  code: sourceCode,
  language: "typescript",
  policyProfile: "regulated",       // default | startup | regulated | healthcare | fintech | public-sector
  minConfidence: 0.7,
  includeAstFindings: true,
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | `string` | Source code |
| `language` | `string` | Language identifier |
| `policyProfile?` | `PolicyProfile` | Evaluation intensity profile |
| `minConfidence?` | `number` | Filter findings below this confidence (0-1) |
| `includeAstFindings?` | `boolean` | Include AST-based structural findings |
| `context?` | `EvaluationContextV2` | Additional context (file path, project type, etc.) |
| `evidence?` | `EvidenceBundleV2` | Pre-computed evidence for the evaluation |

**Returns:** `TribunalVerdictV2` — V2-enhanced verdict with confidence scores, uncertainty

### `getSupportedPolicyProfiles()`

Returns the list of available policy profiles: `default`, `startup`, `regulated`, `healthcare`, `fintech`, `public-sector`.

---

## Judge Registry

All judges — built-in and plugin — are managed by the unified `JudgeRegistry`. The `defaultRegistry` singleton is the shared instance used throughout the system.

### `JUDGES`
Array of all 45 built-in `JudgeDefinition` objects (snapshot taken at module load).

### `getJudge(id)`
Look up a judge by ID. Returns `JudgeDefinition | undefined`.

### `getJudgeSummaries()`
Returns `Array<{ id, name, domain, description }>` for all judges.

### `JudgeRegistry` class

The unified registry that manages all judges and plugins. Import the singleton:

```typescript
import { JudgeRegistry, defaultRegistry } from "@kevinrabun/judges/api";
```

| Method | Description |
|--------|-------------|
| `register(judge)` | Register a `JudgeDefinition`. Replaces if ID exists. |
| `unregister(id)` | Remove a judge by ID. Returns `boolean`. |
| `getJudge(id)` | Look up by ID. Returns `JudgeDefinition \| undefined`. |
| `getJudges()` | All judges as array (false-positive-review always last). |
| `getJudgeSummaries()` | Short summaries for display. |
| `registerPlugin(plugin)` | Register a `JudgesPlugin`. Returns `PluginRegistration`. |
| `unregisterPlugin(name)` | Remove a plugin and its rules/judges. |
| `getRegisteredPlugins()` | List all registered plugins. |
| `getCustomRules()` | All custom rules from plugins. |
| `getPluginJudges()` | Judges contributed by plugins (not built-in). |
| `evaluateCustomRules(code, lang)` | Run custom rules, return `Finding[]`. |
| `runBeforeHooks(code, lang)` | Run all `beforeEvaluate` hooks. |
| `runAfterHooks(findings)` | Run all `afterEvaluate` hooks. |
| `runTransformHooks(findings)` | Run all `transformFindings` hooks. |
| `clearPlugins()` | Remove all plugins (preserves built-in judges). |
| `clear()` | Remove everything (for testing). |

---

## Configuration

### `parseConfig(jsonString)`
Parse a `.judgesrc.json` config string into a `JudgesConfig` object.

### `expandEnvPlaceholders(content)`
Expands `${ENV_VAR}` placeholders inside config strings. Used by `loadConfigFile` so your `.judgesrc.json` can safely reference environment secrets.

### `loadConfigFile(path)`
Reads a config file, expands env placeholders, and returns a `JudgesConfig` object. Returns `{}` on failure (safe for CLI flows).

### `mergeConfigs(base, leaf)`
Merge two configs (leaf wins for scalars; arrays are concatenated and de-duped).

### `resolveExtendsConfig(config, baseDir)`
Resolves the `extends` chain (supports arrays), detects cycles, and merges configs using `mergeConfigs`.

### `validateJudgeDefinition(def)`
Returns an array of validation error strings. Empty array means success.

> **Note:** Also available as `isValidJudgeDefinition(def)` — returns `boolean`.

### `JudgesConfig`

```typescript
interface JudgesConfig {
  disabledRules?: string[];        // e.g., ["SEC-003", "COST-001"]
  disabledJudges?: string[];       // e.g., ["accessibility", "documentation"]
  ruleOverrides?: Record<string, RuleOverride>;
  minSeverity?: Severity;          // "critical" | "high" | "medium" | "low" | "info"
  languages?: string[];
  exclude?: string[];              // glob patterns to exclude files
  include?: string[];              // glob patterns to include only matching files
  maxFiles?: number;               // max files in directory mode
}
```

---

## Presets

```typescript
import { getPreset, listPresets, composePresets } from "@kevinrabun/judges/api";

// Single preset
const preset = getPreset("security-only");

// Compose multiple presets (intersection of disabled judges, union of rules)
const composed = composePresets(["security-only", "performance"]);
```

Available presets: `strict`, `lenient`, `security-only`, `startup`, `compliance`, `performance`, `react`, `express`, `fastapi`, `django`, `spring-boot`, `rails`, `nextjs`, `terraform`, `kubernetes`, `onboarding`, `fintech`, `healthtech`, `saas`, `government`.

---

## Formatters

### SARIF
```typescript
import { verdictToSarif, findingsToSarif } from "@kevinrabun/judges/api";
const sarif = verdictToSarif(verdict, "src/app.ts");
```

### HTML
```typescript
import { verdictToHtml } from "@kevinrabun/judges/formatters/html";
```

### JUnit
```typescript
import { verdictToJUnit } from "@kevinrabun/judges/formatters/junit";
```

### CodeClimate
```typescript
import { verdictToCodeClimate } from "@kevinrabun/judges/formatters/codeclimate";
```

### IDE Diagnostics
```typescript
import { findingsToDiagnostics, findingsToCodeActions } from "@kevinrabun/judges/api";
const diagnostics = findingsToDiagnostics(findings, "src/app.ts");
```

---

## Deduplication

### `crossEvaluatorDedup(findings)`
Remove duplicate findings across judges using topic-based pattern matching.

### `crossFileDedup(fileFindings)`
Consolidate repeated findings across files in a project analysis.

```typescript
import { crossFileDedup } from "@kevinrabun/judges/api";
const deduped = crossFileDedup([
  { path: "src/auth.ts", findings: authFindings },
  { path: "src/login.ts", findings: loginFindings },
]);
```

---

## Calibration

### `buildCalibrationProfile(feedbackEntries)`
Build a calibration profile from historical feedback data.

### `calibrateFindings(findings, profile)`
Adjust finding confidences using a calibration profile.

### `autoCalibrateFindings(findings)`
Automatically calibrate using stored feedback.

---

## Fingerprinting

### `fingerprintCode(code, language)`
Detect AI-generated code patterns and return an `AiFingerprint`.

### `fingerprintToFindings(fingerprint)`
Convert an AI fingerprint into findings for review.

---

## Fix History

```typescript
import { loadFixHistory, recordFixAccepted, getFixAcceptanceRate } from "@kevinrabun/judges/api";

recordFixAccepted("CYBER-001", "src/app.ts");
const rate = getFixAcceptanceRate("CYBER-001"); // 0-1
```

---

## False-Positive Filtering

```typescript
import { filterFalsePositiveHeuristics } from "@kevinrabun/judges/api";
const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, language);
```

Applies 35 heuristic filters (H1-H35) to remove common false positive patterns.

---

## Comparison Benchmarks

```typescript
import { compareCapabilities, formatComparisonReport, TOOL_PROFILES } from "@kevinrabun/judges/api";

const comparison = compareCapabilities("eslint");
console.log(comparison.judgesOnly);  // capabilities unique to judges
console.log(comparison.both);        // shared capabilities

const report = formatComparisonReport("eslint");
console.log(report);
```

---

## Types Reference

All types are exported from `@kevinrabun/judges/api`:

| Type | Description |
|------|-------------|
| `Finding` | A single finding with ruleId, title, severity, confidence, etc. |
| `Severity` | `"critical" \| "high" \| "medium" \| "low" \| "info"` |
| `Verdict` | `"pass" \| "warning" \| "fail"` |
| `JudgeEvaluation` | Single-judge result with findings and score |
| `TribunalVerdict` | Full tribunal result with per-judge evaluations |
| `TribunalVerdictV2` | V2 verdict with confidence and uncertainty data |
| `ProjectFile` | `{ path: string; content: string; language: string }` |
| `ProjectVerdict` | Multi-file result with cross-file findings |
| `DiffVerdict` | Diff-focused result |
| `JudgesConfig` | Configuration object |
| `JudgeDefinition` | Judge metadata and evaluation function |
| `Patch` | Auto-fix patch with before/after text |
| `PolicyProfile` | V2 policy profile name |
| `CustomRule` | Plugin-defined rule |
| `JudgesPlugin` | Plugin definition |

---

## CLI Utilities (non-API)
Some functionality is CLI-only (not exported from the API package). Use <code>@kevinrabun/judges-cli</code> or <code>npx @kevinrabun/judges-cli</code>:

- <code>judges license-scan</code> — dependency license compliance scan (<code>--risk</code>, <code>--category</code>, <code>--format json</code>, <code>--save</code> → <code>.judges-licenses/license-report.json</code>).
- <code>judges deps</code> — supply-chain risk analysis for manifests.

See README “Additional CLI Commands” or <code>docs/index.html#license-scan</code> for details.
