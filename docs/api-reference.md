# Judges Panel — API Reference

Programmatic API for integrating Judges Panel into applications, pipelines, and custom tooling.

```bash
npm install @kevinrabun/judges
```

## Quick Start

```typescript
import { evaluateCode, evaluateCodeSingleJudge, getJudges } from "@kevinrabun/judges/api";

// Full tribunal evaluation
const verdict = evaluateCode("const x = eval(input);", "typescript");
console.log(verdict.overallVerdict); // "fail"
console.log(verdict.overallScore);   // 0-100

// Single judge
const result = evaluateCodeSingleJudge("cybersecurity", code, "typescript");
```

---

## Core Evaluation

### `evaluateCode(code, language, options?)`

Evaluate code against the full panel of 39 judges.

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

### `JUDGES`
Array of all 39 built-in `JudgeDefinition` objects.

### `getJudge(id)`
Look up a judge by ID. Returns `JudgeDefinition | undefined`.

### `getJudgeSummaries()`
Returns `Array<{ id, name, domain, rulePrefix, description }>` for all judges.

---

## Configuration

### `parseConfig(jsonString)`
Parse a `.judgesrc.json` config string into a `JudgesConfig` object.

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
import { getPreset, listPresets, composePresets } from "@kevinrabun/judges/presets";

// Single preset
const preset = getPreset("security-only");

// Compose multiple presets (intersection of disabled judges, union of rules)
const composed = composePresets(["security-only", "performance"]);
```

Available presets: `strict`, `lenient`, `security-only`, `startup`, `compliance`, `performance`.

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
