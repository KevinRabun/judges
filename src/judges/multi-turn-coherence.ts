import type { JudgeDefinition } from "../types.js";

export const multiTurnCoherenceJudge: JudgeDefinition = {
  id: "multi-turn-coherence",
  name: "Judge Multi-Turn Coherence",
  description:
    "Detects self-contradicting patterns: duplicate function definitions, contradictory " +
    "boolean assignments, dead code after returns, conflicting configs, and TODO density.",
  domain: "Code Coherence & Consistency",
  rulePrefix: "COH",
  tableDescription: "Self-contradicting patterns, duplicate definitions, dead code, inconsistent naming",
  promptDescription: "Deep review of code coherence: self-contradictions, duplicate definitions, dead code",
  systemPrompt: `You are Judge Multi-Turn Coherence — an expert in detecting self-contradicting and incoherent code patterns.

YOUR EVALUATION CRITERIA:
1. **Duplicate Definitions**: Multiple function/class/variable declarations with the same name in the same scope.
2. **Contradictory Assignments**: Boolean or config variables assigned opposite values in close proximity without branching logic.
3. **Dead Code After Returns**: Unreachable statements after return/throw/break/continue.
4. **Conflicting Configuration**: Config objects that set contradictory options (e.g., debug: true and production: true simultaneously).
5. **TODO Density**: Files where more than 20% of functions contain TODO/FIXME/HACK comments indicating incomplete implementation.

SEVERITY MAPPING:
- **critical**: Contradictory security settings (e.g., auth enabled and bypassed simultaneously)
- **high**: Duplicate function definitions that shadow each other, dead code after returns
- **medium**: Contradictory boolean assignments, conflicting configuration
- **low**: Excessive TODO density, minor style inconsistencies

ADVERSARIAL MANDATE:
- Treat every contradiction as a potential logic bug.
- Do NOT assume dead code is intentionally left for debugging.`,
};
