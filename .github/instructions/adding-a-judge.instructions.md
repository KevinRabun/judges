# Adding a New Judge — Step-by-Step

When adding a new judge to the Judges Panel, follow these steps exactly.
All judges now load from **agent files** (`agents/<id>.judge.md`). The registry bootstraps from the agents directory at runtime. Evaluators remain in `src/evaluators/` and are referenced via the `script:` field in the agent frontmatter.

> ℹ️ Back-compat: legacy `.agent.md` files are still readable, but **all new agents must use `.judge.md`**.

The legacy side-effect imports in `src/judges/index.ts` have been removed. If you need to add a judge, follow the agent-native workflow below.

---

## 0. Create/Update Agent File (`agents/<id>.judge.md`)

Frontmatter fields:
- `id`, `name`, `domain`, `rulePrefix`, `description`, `tableDescription`, `promptDescription`
- `script`: relative path to evaluator module (e.g., `../src/evaluators/cybersecurity.ts`)
- `priority`: integer ordering (lower runs earlier; `999` reserved for `false-positive-review`)

Body becomes the **system prompt** (persona + evaluation criteria). See existing agents for patterns.

You can regenerate agents from the registry with:
```bash
npm run generate:agents        # skip existing
npm run generate:agents:force  # overwrite
npm run validate:agents        # sanity check against registry
```

---

## 1. Create the Evaluator

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

## 2. Create the Judge Definition (with self-registration)

Create `src/judges/{judge-id}.ts`. The file must:
1. Define the `JudgeDefinition` with all required fields
2. Import and wire its own evaluator (`analyze` property)
3. Import `defaultRegistry` and call `register()` at module scope

All fields are **required** (except `analyze`, which is set inline):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Kebab-case identifier (e.g. `"supply-chain"`) |
| `name` | `string` | **Must** start with `"Judge "` (e.g. `"Judge Supply Chain"`) |
| `domain` | `string` | Human-readable expertise area (e.g. `"Supply Chain Security"`) |
| `description` | `string` | One-sentence summary of what this judge evaluates |
| `rulePrefix` | `string` | Uppercase prefix for rule IDs (e.g. `"SCS"`). Must be unique across all judges |
| `tableDescription` | `string` | Short comma-separated keywords for the README table |
| `promptDescription` | `string` | Short human-readable label for the prompts table |
| `systemPrompt` | `string` | The full persona + evaluation criteria prompt. Follow existing judges as a template |
| `analyze` | `function` | The evaluator function imported from `../evaluators/{judge-id}.js` |

Example:

```typescript
import type { JudgeDefinition } from "../types.js";
import { analyzeSupplyChain } from "../evaluators/supply-chain.js";
import { defaultRegistry } from "../judge-registry.js";

export const supplyChainJudge: JudgeDefinition = {
  id: "supply-chain",
  name: "Judge Supply Chain",
  domain: "Supply Chain Security",
  description: "Evaluates code for supply chain security risks...",
  rulePrefix: "SCS",
  tableDescription: "Dependency provenance, SBOM, build integrity",
  promptDescription: "Deep supply chain security review",
  systemPrompt: `You are Judge Supply Chain — ...`,
  analyze: analyzeSupplyChain,
};

defaultRegistry.register(supplyChainJudge);
```

## 3. Add the Side-Effect Import

Edit `src/judges/index.ts` — add **one line** in the side-effect imports section:

```typescript
import "./supply-chain.js";
```

That's it. The import triggers the module, which registers the judge with `defaultRegistry`.

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

- [ ] Judge file has all required `JudgeDefinition` fields (id, name, domain, description, rulePrefix, tableDescription, promptDescription, systemPrompt, analyze)
- [ ] `name` starts with `"Judge "`
- [ ] `rulePrefix` is unique (not used by any other judge)
- [ ] Judge file imports its evaluator and sets `analyze` on the definition
- [ ] Judge file calls `defaultRegistry.register()` at module scope
- [ ] Side-effect import added to `src/judges/index.ts`
- [ ] Evaluator produces findings against `sample-vulnerable-api.ts`
- [ ] `npm run sync-docs` has been run
- [ ] All tests pass

---

## Architecture Notes

- **`JudgeDefinition`** interface is defined in `src/types.ts`
- **`JudgeRegistry`** in `src/judge-registry.ts` is the unified registry for all judges (built-in and plugin)
- **`defaultRegistry`** is the singleton `JudgeRegistry` instance — all judges register here
- **`src/judges/index.ts`** triggers registration via side-effect imports and re-exports `JUDGES`, `getJudge()`, and `getJudgeSummaries()` backed by the registry
- **Self-registration pattern**: each judge file imports `defaultRegistry` and calls `register()` at module scope — no manual wiring in index.ts required
- **`scripts/sync-docs.ts`** reads `JUDGES` at runtime and regenerates documentation markers
- **Dynamic references** already exist in `src/tools/prompts.ts`, `src/commands/docs.ts`, and tool registration — these use `JUDGES.length` and iterate the array, so no manual updates are needed there
- **Static files** (README, server.json, etc.) use marker-delimited sections or regex-based count replacement via `sync-docs`
