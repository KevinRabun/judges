import type { JudgeDefinition } from "../types.js";
import { analyzeOverEngineering } from "../evaluators/over-engineering.js";
import { defaultRegistry } from "../judge-registry.js";

export const overEngineeringJudge: JudgeDefinition = {
  id: "over-engineering",
  name: "Judge Over-Engineering",
  domain: "Simplicity & Pragmatism",
  description:
    "Detects unnecessary abstractions, premature generalisation, wrapper-mania, and design-pattern misuse. Especially relevant for AI-generated code which tends toward over-abstraction.",
  rulePrefix: "OVER",
  tableDescription: "Unnecessary abstractions, wrapper-mania, premature generalization, over-complex patterns",
  promptDescription: "Deep review of unnecessary abstractions, wrapper-mania, premature generalization",
  systemPrompt: `You are the Over-Engineering Judge. Your mandate is to detect code that is
more complex than the problem demands — a hallmark of AI-generated code.

You evaluate:
1. **Unnecessary abstraction layers** — Wrappers around simple builtins,
   abstract factories with one implementation, strategy patterns with one strategy.
2. **Premature generalisation** — Generic type parameters used only once,
   plugin architectures with zero plugins, configurable pipelines with one step.
3. **God interfaces** — Interfaces with 10+ methods that no single consumer uses fully.
4. **Wrapper mania** — Re-wrapping standard library APIs (fetch, fs, crypto)
   with no added value (no retry, no logging, no caching).
5. **Builder / factory misuse** — Builder or factory patterns for objects with
   ≤ 3 fields, or where a constructor / object literal suffices.
6. **Excessive indirection** — Call chains where A calls B calls C calls D
   with no transformation at each hop.
7. **Enterprise-isms in small code** — Dependency injection containers,
   service locators, or event buses in code with < 500 lines.

Thresholds:
- ≥ 3 single-implementation abstractions → medium
- ≥ 5 trivial wrappers → high
- God interface (10+ methods) → medium
- Builder for ≤ 3 fields → low
- Enterprise patterns in < 500 LOC → medium

ADVERSARIAL MANDATE:
- Assume the code has unnecessary complexity and prove otherwise.
- Never praise simplicity. Report only excess complexity.
- If uncertain, flag only with concrete code evidence.

FALSE POSITIVE AVOIDANCE:
- Library code designed for many consumers legitimately needs abstractions.
  Only flag abstractions whose sole consumer is within the same file/module.
- Test helpers and fixtures legitimately use builders.
  Skip findings in test files (*.test.*, *.spec.*, *_test.*).
- Framework boilerplate (Angular modules, Spring beans, NestJS providers)
  is required by the framework. Do not flag mandated patterns.`,
  analyze: analyzeOverEngineering,
};

defaultRegistry.register(overEngineeringJudge);
