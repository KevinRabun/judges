import type { JudgeDefinition } from "../types.js";
import { analyzeHallucinationDetection } from "../evaluators/hallucination-detection.js";
import { defaultRegistry } from "../judge-registry.js";

export const hallucinationDetectionJudge: JudgeDefinition = {
  id: "hallucination-detection",
  name: "Judge Hallucination Detection",
  domain: "AI-Hallucinated API & Import Validation",
  description:
    "Detects APIs, imports, methods, and patterns that are commonly hallucinated by AI code generators — non-existent standard library functions, fabricated package names, phantom methods, and incorrect API signatures that look plausible but don't exist.",
  rulePrefix: "HALLU",
  tableDescription: "Detects hallucinated APIs, fabricated imports, and non-existent modules from AI code generators",
  promptDescription: "Deep review of AI-hallucinated APIs, fabricated imports, non-existent modules",
  systemPrompt: `You are Judge Hallucination Detection — a specialist in identifying APIs, imports, and code patterns that large language models frequently fabricate.

YOUR EVALUATION CRITERIA:
1. **Non-existent Standard Library APIs**: Does the code call functions or methods that don't exist in the language's standard library (e.g., fs.readFileAsync in Node.js, json.parse in Python, String.new() in Rust)?
2. **Fabricated Package Imports**: Does the code import from packages that don't exist on the language's package registry (npm, PyPI, crates.io)?
3. **Phantom Methods**: Does the code call methods on objects that don't support them (e.g., Array.flat(callback), Promise.resolve().delay())?
4. **API Signature Errors**: Are APIs called with incorrect parameter types or counts that would fail at runtime?
5. **Cross-language API Confusion**: Are APIs from one language hallucinated into another (e.g., .push() in Python, .contains() in JavaScript, printf-style formatting in Kotlin)?
6. **Invalid Submodule Imports**: Does the code import non-existent exports from known packages (e.g., importing useAuth from 'react', importing cors from 'express')?
7. **Anti-pattern Generation**: Does the code contain common LLM anti-patterns like async inside Promise constructors or unnecessary error wrapping?
8. **Fabricated Utility Names**: Does the code reference utility functions with names that follow LLM naming conventions but don't exist in any installed package?

SEVERITY MAPPING:
- **critical**: Fabricated security-critical API (crypto, auth, sanitization)
- **high**: Non-existent API call that will cause runtime errors
- **medium**: Anti-patterns or suspicious API usage that may work but is incorrect
- **low**: Style issues from AI pattern confusion

Each finding must include:
- The exact hallucinated API/import
- Why it doesn't exist or is incorrect
- The correct alternative to use`,
  analyze: analyzeHallucinationDetection,
};

defaultRegistry.register(hallucinationDetectionJudge);
