// ─── MCP Prompt Registrations ────────────────────────────────────────────────
// Expose judge system prompts as MCP prompts so LLM-based clients can use
// them for deeper, AI-powered analysis beyond pattern matching.
//
// Each per-judge prompt includes shared behavioural directives (adversarial
// mandate, precision mandate, clean-code gate) plus the judge's unique
// evaluation criteria, domain-specific rules, and FP-avoidance guidance.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { JUDGES } from "../judges/index.js";

// ─── Shared Behavioural Directives & Gates ──────────────────────────────────
// Included in every per-judge prompt to ensure consistent evaluation
// behaviour across all judges.
// ──────────────────────────────────────────────────────────────────────────────

/** Adversarial evaluation stance — shared across all judges. */
export const SHARED_ADVERSARIAL_MANDATE = `ADVERSARIAL MANDATE (applies to ALL judges):
- Examine the code critically and look for genuine issues. Back every finding with concrete code evidence (line numbers, patterns, API calls).
- Report only real problems, risks, and deficiencies that exist in the actual code.
- If you are uncertain whether something is an issue, flag it only when you can cite specific code evidence (line numbers, patterns, API calls). Speculative findings without concrete evidence erode developer trust.
- If no concrete issues are found after thorough analysis, report ZERO findings. An empty findings list is the correct output for well-written code.`;

/** Precision override — ensures evidence-based findings. */
export const PRECISION_MANDATE = `PRECISION MANDATE (this section OVERRIDES the adversarial mandate whenever they conflict):
- Every finding MUST cite specific code evidence: exact line numbers, API calls, variable names, or patterns. Findings without concrete evidence MUST be discarded — no exceptions.
- Do NOT flag the absence of a feature or pattern unless you can identify the specific code location where it SHOULD have been implemented and explain WHY it is required for THIS code.
- Speculative, hypothetical, or "just in case" findings erode developer trust. Only flag issues you are confident exist in the actual code.
- Prefer fewer, high-confidence findings over many uncertain ones. Quality of findings matters more than quantity.
- If the code is genuinely well-written with no real issues, reporting ZERO findings is the correct and expected behavior. Do not manufacture findings to avoid an empty report.
- Clean, well-structured code exists. Acknowledge it by not forcing false issues.
- RECOGNIZE SECURE PATTERNS: Code using established security libraries and patterns (e.g. helmet, bcrypt/argon2, parameterized queries, input validation, CSRF tokens, rate limiters, proper TLS) is correctly implementing security. Do NOT flag these as insufficient or suggest alternatives unless a concrete vulnerability exists.
- SCOPE LIMITATION: Only evaluate code that is actually present. Do NOT flag missing features, tests, logging, documentation, error handling, or infrastructure that may exist in other files. Evaluate what IS provided, not what COULD be elsewhere.
- CONFIDENCE THRESHOLD: Only report findings where you are highly confident (≥80%) that a real, exploitable issue or concrete deficiency exists in the provided code. When in doubt, do NOT report.
- FALSE POSITIVE COST: A false positive is MORE harmful than a missed finding. False positives erode developer trust and cause real issues to be ignored. When uncertain, silence is better than a questionable finding.

COMMON FALSE POSITIVE PATTERNS (do NOT report these):
- ERR: Do not flag error handling as inadequate when try/catch blocks, validation, or error middleware are present. Missing error handling in a utility function that is clearly called within a guarded context is NOT a finding.
- LOGIC: Do not flag logic issues for standard patterns (early returns, guard clauses, switch/case with default). Only flag logic errors when you can demonstrate a concrete input that produces an incorrect output.
- MAINT: Do not flag maintainability concerns for code that follows the language's established idioms. Complexity or length alone is NOT a finding unless it introduces a concrete maintenance burden.
- SEC: Do not flag security issues when established security libraries (helmet, cors, bcrypt, parameterized queries) are correctly used. "Could be stronger" is NOT a vulnerability.
- STRUCT: Do not flag code structure preferences (file organization, naming conventions) unless they create a concrete deficiency like circular dependencies or unreachable code.`;

/** Clean code gate — explicit instructions when code quality is high. */
export const CLEAN_CODE_GATE = `CLEAN CODE GATE (applies AFTER individual judge evaluation):
- Before reporting findings, assess the OVERALL quality of the code. If the code follows established conventions, uses appropriate patterns, handles errors, and has no concrete vulnerabilities or deficiencies, the expected output is ZERO findings across ALL judges.
- Do NOT report stylistic preferences, alternative approaches, or "nice to have" improvements as findings. These are opinions, not defects.
- Do NOT report findings about missing functionality that is likely in other files (tests, configs, middleware, error handlers, logging setup).
- Do NOT report theoretical risks that require assumptions about the runtime environment, deployment configuration, or code outside the provided snippet.
- SELF-CHECK before finalizing: For each finding, ask "Would a senior engineer reviewing this code in a PR agree this must be fixed before merging?" If the answer is not a clear YES, discard the finding.
- The goal is to match what a thoughtful, experienced human reviewer would flag — not to demonstrate comprehensive knowledge of every possible concern.
- SINGLE-FILE LIMITATION: You are reviewing a code snippet, not a complete project. Missing tests, missing docs, missing middleware, missing configs, missing CI/CD, missing logging setup — these are EXPECTED in a single-file review. Only flag what is WRONG in the code present, not what is ABSENT from the project.
- FINAL GATE: If your evaluation produces findings for a code snippet that uses established libraries correctly, has proper error handling, follows language idioms, and contains no security vulnerabilities — your findings are almost certainly false positives. Discard them and report ZERO findings.`;

// ─── Criteria Extraction ─────────────────────────────────────────────────────

/**
 * Extract only the unique evaluation criteria from a judge's systemPrompt,
 * stripping the persona introduction line, the ADVERSARIAL MANDATE block,
 * and common boilerplate lines (rule-prefix assignment, score template)
 * that are stated once in the tribunal preamble.
 *
 * The returned text retains:
 *  - YOUR EVALUATION CRITERIA / pillar headers / taxonomy sections
 *  - Domain-specific RULES FOR YOUR EVALUATION bullet points
 *  - FALSE POSITIVE AVOIDANCE guidance (where present)
 *
 * @param systemPrompt - The full systemPrompt from a JudgeDefinition
 * @returns Condensed criteria text with shared boilerplate removed
 */
export function getCondensedCriteria(systemPrompt: string): string {
  let text = systemPrompt;

  // 1. Strip persona introduction (first paragraph before double-newline)
  const firstBreak = text.indexOf("\n\n");
  if (firstBreak > 0) {
    text = text.substring(firstBreak + 2);
  }

  // 2. Strip ADVERSARIAL MANDATE section (always last major section)
  const amIndex = text.indexOf("ADVERSARIAL MANDATE:");
  if (amIndex > 0) {
    text = text.substring(0, amIndex).trimEnd();
  }

  // 3. Strip boilerplate rule lines that duplicate tribunal-level guidance
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("- Assign rule IDs with prefix ") && !t.startsWith("- Score from 0-100 where 100 means ");
    })
    .join("\n");

  return text.trim();
}

/**
 * Register all MCP prompts on the given server:
 *  - One per-judge prompt (`judge-{id}`) for single-persona deep reviews
 */
export function registerPrompts(server: McpServer): void {
  // ── Per-judge prompts ──────────────────────────────────────────────────
  // Each prompt uses condensed criteria plus the shared mandates for
  // better precision on clean code.
  for (const judge of JUDGES) {
    server.prompt(
      `judge-${judge.id}`,
      `Use the ${judge.name} persona to perform a deep ${judge.domain} review of code. This prompt provides the judge's expert criteria for LLM-powered analysis that goes beyond pattern matching.`,
      {
        code: z.string().describe("The source code to evaluate"),
        language: z.string().describe("The programming language"),
        context: z.string().optional().describe("Additional context about the code"),
      },
      async ({ code, language, context }) => {
        const persona = judge.systemPrompt.substring(0, judge.systemPrompt.indexOf("\n\n"));
        const criteria = getCondensedCriteria(judge.systemPrompt);
        const userMessage =
          `${persona}\n\n` +
          `${SHARED_ADVERSARIAL_MANDATE}\n\n` +
          `${PRECISION_MANDATE}\n\n` +
          `${criteria}\n\n` +
          `${CLEAN_CODE_GATE}\n\n` +
          `Please evaluate the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` +
          (context ? `\n\nAdditional context: ${context}` : "") +
          `\n\nProvide your evaluation as structured findings with rule IDs (prefix: ${judge.rulePrefix}-), severity levels (critical/high/medium/low/info), descriptions, and actionable recommendations. If no issues meet the confidence threshold, report zero findings explicitly. End with an overall score (0-100) and verdict (pass/warning/fail).`;

        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: userMessage,
              },
            },
          ],
        };
      },
    );
  }
}
