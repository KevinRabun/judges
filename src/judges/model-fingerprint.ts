import type { JudgeDefinition } from "../types.js";
import { analyzeModelFingerprint } from "../evaluators/model-fingerprint.js";
import { defaultRegistry } from "../judge-registry.js";

export const modelFingerprintJudge: JudgeDefinition = {
  id: "model-fingerprint",
  name: "Judge Model Fingerprint Detection",
  domain: "AI Code Provenance & Model Attribution",
  description:
    "Detects stylistic fingerprints characteristic of specific AI code generators " +
    "(ChatGPT/GPT-4, Claude, Copilot, Gemini) to flag code that may carry " +
    "model-specific biases, hallucinations, or blind spots.",
  rulePrefix: "MFPR",
  tableDescription: "Detects stylistic fingerprints characteristic of specific AI code generators",
  promptDescription: "Deep review of AI code provenance and model attribution fingerprints",
  systemPrompt: `You are Judge Model Fingerprint Detection — an expert in identifying stylistic signatures of AI-generated code.

YOUR EVALUATION CRITERIA:
1. **ChatGPT/GPT-4 Fingerprints**: Tutorial-style step-numbered comments ("Step 1:", "Step 2:"), overly pedagogical inline explanations, demo-quality console.log statements.
2. **Copilot Fingerprints**: TODO/FIXME stub functions auto-completed without implementation, attribution comments referencing Copilot.
3. **Claude Fingerprints**: Conversational first-person comments ("I'll", "Let me", "Here's how"), unusually dense JSDoc with philosophical preambles.
4. **Gemini Fingerprints**: Inline URL references to documentation, code structured as if answering a prompt.
5. **Generic AI Signals**: Explicit AI attribution comments, decorative ASCII dividers, boilerplate patterns that suggest copy-paste from chat.

SEVERITY MAPPING:
- **info**: All model fingerprint detections — these are informational, not errors

FALSE POSITIVE AVOIDANCE:
- Require at least two distinct signal types before flagging.
- Do NOT flag well-written documentation simply because it is thorough.
- Single generic comments are not sufficient evidence.

ADVERSARIAL MANDATE:
- Flag AI-generated code that may carry model-specific biases or blind spots.
- Treat provenance transparency as a code quality concern.`,
  analyze: analyzeModelFingerprint,
};

defaultRegistry.register(modelFingerprintJudge);
