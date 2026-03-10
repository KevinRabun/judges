# Adding a New Judge — Step-by-Step

When adding a new judge to the Judges Panel, follow these steps exactly.
The `JUDGES` array in `src/judges/index.ts` is the single source of truth — all documentation, tool descriptions, and counts are derived from it.

---

## 1. Create the Judge Definition

Create `src/judges/{judge-id}.ts` with a `JudgeDefinition` export.

All fields are **required** (except `analyze`, which is wired separately):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Kebab-case identifier (e.g. `"supply-chain"`) |
| `name` | `string` | **Must** start with `"Judge "` (e.g. `"Judge Supply Chain"`) |
| `domain` | `string` | Human-readable expertise area (e.g. `"Supply Chain Security"`) |
| `description` | `string` | One-sentence summary of what this judge evaluates |
| `rulePrefix` | `string` | Uppercase prefix for rule IDs (e.g. `"SCS"`). Must be unique across all judges |
| `tableDescription` | `string` | Short comma-separated keywords for the README table (e.g. `"Dependency provenance, SBOM, build integrity"`) |
| `promptDescription` | `string` | Short human-readable label for the prompts table (e.g. `"Deep supply chain security review"`) |
| `systemPrompt` | `string` | The full persona + evaluation criteria prompt. Follow existing judges as a template |

Example skeleton:

```typescript
import type { JudgeDefinition } from "../types.js";

export const supplyChainJudge: JudgeDefinition = {
  id: "supply-chain",
  name: "Judge Supply Chain",
  domain: "Supply Chain Security",
  description: "Evaluates code for supply chain security risks...",
  rulePrefix: "SCS",
  tableDescription: "Dependency provenance, SBOM, build integrity",
  promptDescription: "Deep supply chain security review",
  systemPrompt: `You are Judge Supply Chain — ...`,
};
```

## 2. Create the Evaluator

Create `src/evaluators/{judge-id}.ts` with an `analyze` function:

```typescript
import type { Finding } from "../types.js";

export function analyzeSupplyChain(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const prefix = "SCS";
  // ... deterministic analysis logic ...
  return findings;
}
```

Key requirements:
- The function signature is `(code: string, language: string) => Finding[]`
- Use the same `rulePrefix` from the judge definition
- Import shared utilities from `./shared.js` as needed
- Follow existing evaluators as templates (e.g. `data-security.ts`, `cybersecurity.ts`)

## 3. Wire into the Judge Registry

Edit `src/judges/index.ts` — three additions are needed:

### 3a. Add the judge import (top of file, judge imports section)

```typescript
import { supplyChainJudge } from "./supply-chain.js";
```

### 3b. Add the evaluator import (after the `// ─── Analyzer Imports ───` comment)

```typescript
import { analyzeSupplyChain } from "../evaluators/supply-chain.js";
```

### 3c. Wire the analyzer (in the wiring section)

```typescript
supplyChainJudge.analyze = analyzeSupplyChain;
```

### 3d. Add to the `JUDGES` array

Add the judge variable to the `JUDGES` array. Place it **before** `falsePositiveReviewJudge` (which is always last):

```typescript
export const JUDGES: JudgeDefinition[] = [
  // ... existing judges ...
  supplyChainJudge,       // ← new judge
  falsePositiveReviewJudge,  // ← always last
];
```

## 4. Add Test Coverage

The existing test in `tests/judges.test.ts` evaluates `examples/sample-vulnerable-api.ts` through **all** judges automatically (it iterates the `JUDGES` array). Ensure the new judge's evaluator produces at least one finding against that sample file.

If the judge targets a domain not covered by `sample-vulnerable-api.ts`, add relevant vulnerable patterns to that file.

## 5. Sync Documentation

Run the documentation sync script:

```bash
npm run sync-docs
```

This propagates changes to all static documentation automatically:
- Regenerates the README judge table from `tableDescription` fields
- Regenerates the README prompts table from `promptDescription` fields
- Regenerates the `docs/index.html` JS judges array
- Updates judge count references in 15+ files (README, package.json, server.json, action.yml, Dockerfile, VS Code extension files, etc.)

## 6. Run Tests

```bash
npm test
```

All tests must pass. Typical test suites:
- `tests/judges.test.ts` — all judges evaluated against sample code
- `tests/tool-routing.test.ts` — MCP tool registration and routing
- `tests/extension-logic.test.ts` — VS Code extension logic

## 7. Checklist

Before committing, verify:

- [ ] Judge file has all required `JudgeDefinition` fields (id, name, domain, description, rulePrefix, tableDescription, promptDescription, systemPrompt)
- [ ] `name` starts with `"Judge "`
- [ ] `rulePrefix` is unique (not used by any other judge)
- [ ] Evaluator produces findings against `sample-vulnerable-api.ts`
- [ ] Judge is imported, wired, and added to `JUDGES` array in `src/judges/index.ts`
- [ ] `npm run sync-docs` has been run
- [ ] All tests pass

---

## Architecture Notes

- **`JudgeDefinition`** interface is defined in `src/types.ts`
- **`JUDGES` array** in `src/judges/index.ts` is the canonical ordered list
- **`scripts/sync-docs.ts`** reads `JUDGES` at runtime and regenerates documentation markers
- **Dynamic references** already exist in `src/tools/prompts.ts`, `src/commands/docs.ts`, and tool registration — these use `JUDGES.length` and iterate the array, so no manual updates are needed there
- **Static files** (README, server.json, etc.) use marker-delimited sections or regex-based count replacement via `sync-docs`
