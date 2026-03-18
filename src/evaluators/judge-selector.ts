/**
 * Adaptive judge selection — picks only the judges relevant to a given file
 * based on language, framework, file role, and project context.
 *
 * Eliminates wasted work (e.g. running "testing" judge on a Dockerfile,
 * or "iac-security" on a React component) while keeping the full panel
 * available for explicit requests.
 */

import type { JudgeDefinition, JudgeSelectionContext, JudgeSelectionResult } from "../types.js";

// ─── Language → judge relevance ──────────────────────────────────────────────

/**
 * Judges that are ONLY relevant for specific language families.
 * If the language isn't listed, the judge is skipped.
 * Most judges are language-agnostic and not listed here.
 */
const LANGUAGE_SPECIFIC: Record<string, Set<string>> = {
  // IaC judges only apply to infrastructure languages
  "iac-security": new Set(["terraform", "bicep", "arm", "dockerfile", "yaml"]),
};

/**
 * Judges to SKIP for specific languages — inverse of above.
 * E.g. testing patterns don't apply to SQL or Dockerfile.
 */
const LANGUAGE_SKIP: Record<string, Set<string>> = {
  testing: new Set(["sql", "dockerfile", "terraform", "bicep", "arm", "yaml"]),
  documentation: new Set(["sql", "dockerfile", "terraform", "bicep", "arm"]),
  "code-structure": new Set(["sql", "dockerfile", "yaml"]),
  ux: new Set(["sql", "dockerfile", "terraform", "bicep", "arm", "bash", "powershell"]),
  accessibility: new Set(["sql", "dockerfile", "terraform", "bicep", "arm", "bash", "powershell"]),
  internationalization: new Set(["sql", "dockerfile", "terraform", "bicep", "arm"]),
  concurrency: new Set(["sql", "dockerfile", "terraform", "bicep", "arm", "yaml"]),
  "over-engineering": new Set(["sql", "dockerfile", "terraform", "bicep", "arm", "yaml"]),
};

// ─── File category → judge relevance ────────────────────────────────────────

/**
 * Judges to skip when evaluating test files — noise reduction.
 */
const SKIP_FOR_TESTS = new Set([
  "documentation",
  "rate-limiting",
  "scalability",
  "cloud-readiness",
  "ci-cd",
  "configuration-management",
  "cost-effectiveness",
  "data-sovereignty",
  "compliance",
  "internationalization",
  "ux",
  "accessibility",
  "observability",
]);

/**
 * Judges to skip for config/manifest files.
 */
const SKIP_FOR_CONFIG = new Set([
  "testing",
  "documentation",
  "code-structure",
  "error-handling",
  "performance",
  "concurrency",
  "scalability",
  "ux",
  "accessibility",
  "internationalization",
  "over-engineering",
  "backwards-compatibility",
  "maintainability",
]);

/**
 * Judges to skip for IaC files (Terraform, Bicep, ARM, Dockerfile).
 */
const SKIP_FOR_IAC = new Set([
  "testing",
  "code-structure",
  "concurrency",
  "over-engineering",
  "ux",
  "accessibility",
  "internationalization",
  "api-design",
  "api-contract",
  "backwards-compatibility",
  "hallucination-detection",
  "multi-turn-coherence",
  "model-fingerprint",
]);

// ─── Core judges that always run ─────────────────────────────────────────────

/** These judges run unconditionally — they cover universally applicable concerns. */
const ALWAYS_RUN = new Set(["security", "cybersecurity", "false-positive-review"]);

// ─── Selection logic ─────────────────────────────────────────────────────────

/**
 * Select the most relevant judges for a given file context.
 *
 * Strategy:
 * 1. Always include core judges (security, false-positive-review)
 * 2. Skip judges with language incompatibility
 * 3. Skip judges irrelevant to the file category
 * 4. Return selection with skip reasons for observability
 */
export function selectJudges(judges: JudgeDefinition[], ctx: JudgeSelectionContext): JudgeSelectionResult {
  const selected: JudgeDefinition[] = [];
  const skipped: Array<{ judgeId: string; reason: string }> = [];

  const lang = ctx.language.toLowerCase();
  const cat = ctx.fileCategory?.toLowerCase() ?? "";

  for (const judge of judges) {
    // Core judges always run
    if (ALWAYS_RUN.has(judge.id)) {
      selected.push(judge);
      continue;
    }

    // Language-specific judge: skip if language not in its set
    const langOnly = LANGUAGE_SPECIFIC[judge.id];
    if (langOnly && !langOnly.has(lang)) {
      skipped.push({ judgeId: judge.id, reason: `not relevant for language: ${lang}` });
      continue;
    }

    // Language skip: judge not useful for this language
    const langSkip = LANGUAGE_SKIP[judge.id];
    if (langSkip && langSkip.has(lang)) {
      skipped.push({ judgeId: judge.id, reason: `skipped for language: ${lang}` });
      continue;
    }

    // File category gating
    if (cat === "test" && SKIP_FOR_TESTS.has(judge.id)) {
      skipped.push({ judgeId: judge.id, reason: "not relevant for test files" });
      continue;
    }
    if (cat === "config" && SKIP_FOR_CONFIG.has(judge.id)) {
      skipped.push({ judgeId: judge.id, reason: "not relevant for config files" });
      continue;
    }
    if (
      (cat === "iac" || lang === "terraform" || lang === "bicep" || lang === "arm" || lang === "dockerfile") &&
      SKIP_FOR_IAC.has(judge.id)
    ) {
      skipped.push({ judgeId: judge.id, reason: "not relevant for infrastructure code" });
      continue;
    }

    selected.push(judge);
  }

  return { selected, skipped };
}
