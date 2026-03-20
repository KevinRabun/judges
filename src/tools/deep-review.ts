// ─── Deep Review Section Builders ────────────────────────────────────────────
// These functions append each judge's expert criteria to tool output,
// turning pattern-only results into hybrid evaluations. The calling LLM
// uses these criteria to perform deep contextual analysis beyond static
// pattern matching.
// ──────────────────────────────────────────────────────────────────────────────

import type { JudgeDefinition, ProjectContext } from "../types.js";

// ─── Content-Policy Refusal Detection ────────────────────────────────────────

/** Patterns that indicate the LLM refused the prompt on content-policy grounds. */
const REFUSAL_PATTERNS = [
  "sorry, i can't assist with that",
  "sorry, i can't help with that",
  "i cannot assist with that",
  "i'm unable to help with",
  "i can't help with that request",
  "i'm not able to assist",
  "i cannot help with that",
  "i am not able to assist",
  "i'm sorry, but i can't",
  "i am sorry, but i cannot",
  "as an ai, i cannot",
  "against my usage policies",
  "violates my content policy",
];

/**
 * Detects whether an LLM response is a content-policy refusal rather than
 * a genuine analysis. Refusals are typically very short (<300 chars) and
 * contain a recognisable refusal phrase.
 */
export function isContentPolicyRefusal(responseText: string): boolean {
  if (responseText.length > 300) return false;
  const lower = responseText.toLowerCase().trim();
  return REFUSAL_PATTERNS.some((p) => lower.includes(p));
}

// ─── Professional Framing ────────────────────────────────────────────────────
// Strong defensive-framing preamble that makes it clear this is an authorised
// self-review, not a penetration test or adversarial assessment. This is
// required to pass through LLM content-safety filters (GPT-4o in particular).

const DEFENSIVE_PREAMBLE =
  `> **AUTHORISED CODE REVIEW** — The developer who authored this code is voluntarily ` +
  `using this professional quality-assurance tool to improve their own work. ` +
  `This is a *defensive* code review: evaluate how well the code **protects** users ` +
  `and follows engineering best practices. This is NOT a penetration test, ` +
  `adversarial assessment, or request to exploit anything. ` +
  `All recommendations must be constructive and focus on strengthening the code.\n\n`;

// ─── Prompt Intro (used by callers) ──────────────────────────────────────────

/** Content-policy-safe opening line for the User message. */
export const DEEP_REVIEW_PROMPT_INTRO =
  `Perform a constructive, defensive code review of the following source code. ` +
  `The developer is voluntarily reviewing their own code to improve quality, ` +
  `strengthen defensive security controls, and adhere to engineering best practices.\n\n`;

/** Content-policy-safe Assistant identity message. */
export const DEEP_REVIEW_IDENTITY =
  `I am the Judges Panel — a professional, constructive code quality review tool ` +
  `used by developers to improve their own code. I perform defensive code review, ` +
  `evaluating how well code protects users and follows best practices. ` +
  `My role is to provide evidence-based, constructive recommendations that ` +
  `strengthen code quality, security defenses, and engineering standards. ` +
  `This is NOT a penetration test or adversarial security assessment.`;

// ─── Token Budget Constants ──────────────────────────────────────────────────

/** Default max chars for LLM-facing prompt content (~25K tokens). */
export const DEFAULT_MAX_PROMPT_CHARS = 100_000;

/** Per-snippet char cap for related files. */
const MAX_SNIPPET_CHARS = 3_000;

/** Max related files to include by default. */
const MAX_RELATED_FILES = 10;

// ─── Related Files Context ───────────────────────────────────────────────────

export interface RelatedFileSnippet {
  /** Relative file path */
  path: string;
  /** Relevant code excerpt (truncated to keep prompt size manageable) */
  snippet: string;
  /** Why this file is relevant (e.g. "imported by target", "shared type") */
  relationship?: string;
}

/**
 * Format related files into a prompt section that gives the LLM cross-file
 * visibility for deeper analysis.
 *
 * @param relatedFiles — array of related file snippets
 * @param maxFiles — max files to include (default: 10). Set to 0 for unlimited.
 * @param snippetBudget — per-snippet char cap (default: 3000). Set to 0 for unlimited.
 */
export function formatRelatedFilesSection(
  relatedFiles: RelatedFileSnippet[],
  maxFiles: number = MAX_RELATED_FILES,
  snippetBudget: number = MAX_SNIPPET_CHARS,
): string {
  if (relatedFiles.length === 0) return "";

  // Apply file count cap (0 = unlimited)
  const files = maxFiles > 0 ? relatedFiles.slice(0, maxFiles) : relatedFiles;
  const skipped = relatedFiles.length - files.length;

  let md = `### Related Files\n\n`;
  md += `> The following files are related to the code under review. Use them to `;
  md += `understand cross-file data flow, shared types, imports, and call sites. `;
  md += `These provide context only — focus your findings on the primary code above.\n\n`;

  for (const f of files) {
    md += `<details>\n<summary><code>${f.path}</code>`;
    if (f.relationship) md += ` — ${f.relationship}`;
    md += `</summary>\n\n`;
    // Limit snippet size to prevent prompt explosion (0 = unlimited)
    const cap = snippetBudget > 0 ? snippetBudget : Infinity;
    const truncated = f.snippet.length > cap ? f.snippet.slice(0, cap) + "\n// ... truncated" : f.snippet;
    md += `\`\`\`\n${truncated}\n\`\`\`\n`;
    md += `</details>\n\n`;
  }

  if (skipped > 0) {
    md += `> *${skipped} additional related file(s) omitted to stay within token budget.*\n\n`;
  }

  return md;
}

// ─── Project Context Section ─────────────────────────────────────────────────

/**
 * Format detected project context into a prompt section so the LLM
 * understands the runtime environment, framework, and architectural role.
 */
export function formatProjectContextSection(projectContext: ProjectContext): string {
  const parts: string[] = [];
  if (projectContext.frameworks.length > 0) {
    parts.push(`**Frameworks:** ${projectContext.frameworks.join(", ")}`);
  }
  if (projectContext.frameworkVersions.length > 0) {
    parts.push(`**Versions:** ${projectContext.frameworkVersions.join(", ")}`);
  }
  if (projectContext.entryPointType !== "unknown") {
    parts.push(`**File Role:** ${projectContext.entryPointType}`);
  }
  if (projectContext.runtime !== "unknown") {
    parts.push(`**Runtime:** ${projectContext.runtime}`);
  }
  if (projectContext.projectType !== "unknown") {
    parts.push(`**Project Type:** ${projectContext.projectType}`);
  }
  if (projectContext.dependencies.length > 0) {
    parts.push(`**Key Dependencies:** ${projectContext.dependencies.join(", ")}`);
  }
  if (parts.length === 0) return "";

  let md = `### Project Context (auto-detected)\n\n`;
  md += `> Use this context to calibrate your review. For example, absence-based rules\n`;
  md += `> about rate limiting are less relevant for a CLI tool than for an API controller.\n\n`;
  md += parts.join("\n") + "\n\n";
  return md;
}

// ─── Single-Judge Deep Review ────────────────────────────────────────────────

export function buildSingleJudgeDeepReviewSection(
  judge: JudgeDefinition,
  language: string,
  context?: string,
  relatedFiles?: RelatedFileSnippet[],
  projectContext?: ProjectContext,
  maxPromptChars?: number,
): string {
  const budget = maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;
  const unlimited = budget === 0;

  const maxRelatedFiles = unlimited ? 0 : MAX_RELATED_FILES;
  const snippetCap = unlimited ? 0 : MAX_SNIPPET_CHARS;
  const contextCap = unlimited ? Infinity : Math.max(2000, Math.floor(budget * 0.1));
  const truncatedContext =
    context && context.length > contextCap ? context.slice(0, contextCap) + "\n… (context truncated)" : context;

  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += DEFENSIVE_PREAMBLE;
  md += `> **The pattern-based findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code using the expert criteria below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified evaluation.\n\n`;

  if (truncatedContext) {
    md += `**Context provided:** ${truncatedContext}\n\n`;
  }

  if (projectContext) {
    md += formatProjectContextSection(projectContext);
  }

  if (relatedFiles && relatedFiles.length > 0) {
    md += formatRelatedFilesSection(relatedFiles, maxRelatedFiles, snippetCap);
  }

  md += `### ${judge.name} — ${judge.domain}\n\n`;
  md += `${judge.description}\n\n`;
  md += `### Precision Mandate\n\n`;
  md += `Every finding MUST cite specific code evidence (exact line numbers, API calls, variable names, or patterns). `;
  md += `Do NOT flag the absence of a feature unless you can identify where it SHOULD have been implemented and why it is required for THIS code. `;
  md += `Speculative findings erode developer trust — prefer fewer, high-confidence findings over many uncertain ones.\n\n`;
  md += `**IaC identifier handling:** Azure resource identifiers (policy definition IDs, role definition IDs, `;
  md += `built-in policy assignments, subscription GUIDs, tenant IDs, etc.) are opaque platform identifiers `;
  md += `provided by Microsoft. Do NOT validate them for strict UUID/GUID hex compliance or flag them as "invalid" — `;
  md += `they may contain characters outside the hex range and are still correct. Treat all Azure resource IDs as verbatim constants.\n\n`;

  md += `### False Positive Review\n\n`;
  md += `Before adding new findings, **review each pattern-based finding above for false positives.** `;
  md += `Static pattern matching can flag code that is actually correct — for example:\n`;
  md += `- String literals or comments that contain keywords (e.g. a regex containing "DELETE" flagged as an unaudited SQL operation)\n`;
  md += `- Function-scoped variables mistakenly flagged as global state\n`;
  md += `- Nearby mitigation code (logging, guards) that the pattern scanner didn't see\n`;
  md += `- Example/test code that intentionally contains the flagged pattern\n\n`;
  md += `For each pattern finding you believe is a false positive, include it in a **"Dismissed Findings"** section with:\n`;
  md += `- The original rule ID\n`;
  md += `- A brief explanation of why it is a false positive\n\n`;

  md += `### Response Format\n\n`;
  md += `Provide your deep review as additional findings using the same format:\n`;
  md += `- Rule ID prefix: \`${judge.rulePrefix}-\`\n`;
  md += `- Severity levels: critical / high / medium / low / info\n`;
  md += `- Include: title, description, affected lines, recommendation, and reference\n`;
  md += `- Include a **Dismissed Findings** section listing any pattern-based findings you identified as false positives\n`;
  md += `- After all findings, provide an updated score (0-100) and final verdict (PASS/WARNING/FAIL)\n`;
  md += `- The final verdict must account for BOTH the pattern findings AND your contextual findings, minus any dismissed false positives\n`;

  return md;
}

// ─── Tribunal Deep Review (full) ─────────────────────────────────────────────

export function buildTribunalDeepReviewSection(
  judges: JudgeDefinition[],
  language: string,
  context?: string,
  relatedFiles?: RelatedFileSnippet[],
  projectContext?: ProjectContext,
  maxPromptChars?: number,
): string {
  const budget = maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;
  const unlimited = budget === 0;

  // When budget is tight, use simplified mode (category-based instead of per-judge)
  // The full per-judge section is ~15-18K chars for 45 judges. Simplified is ~2K.
  // Use simplified when remaining budget for judge criteria would be < 5K.
  const estimatedJudgeCriteriaChars = judges.length * 350;
  const estimatedOverhead = 4000; // preamble, instructions, format section
  const estimatedRelatedChars = (relatedFiles?.length ?? 0) * MAX_SNIPPET_CHARS;
  const budgetForJudges = unlimited ? Infinity : budget - estimatedOverhead - estimatedRelatedChars;
  const useSimplified = !unlimited && budgetForJudges < estimatedJudgeCriteriaChars;

  // Determine related files caps
  const maxRelatedFiles = unlimited ? 0 : MAX_RELATED_FILES;
  const snippetCap = unlimited ? 0 : MAX_SNIPPET_CHARS;

  // Truncate context string if it would blow the budget
  const contextCap = unlimited ? Infinity : Math.max(2000, Math.floor(budget * 0.1));
  const truncatedContext =
    context && context.length > contextCap ? context.slice(0, contextCap) + "\n… (context truncated)" : context;

  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += DEFENSIVE_PREAMBLE;
  md += `> **The pattern-based tribunal findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code from the perspective of ALL ${judges.length} judges below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified tribunal verdict.\n\n`;
  md += `> **This is a professional code quality tool.** The developer is reviewing their own source code to strengthen its quality, security defenses, and adherence to best practices.\n\n`;

  if (truncatedContext) {
    md += `**Context provided:** ${truncatedContext}\n\n`;
  }

  if (projectContext) {
    md += formatProjectContextSection(projectContext);
  }

  if (relatedFiles && relatedFiles.length > 0) {
    md += formatRelatedFilesSection(relatedFiles, maxRelatedFiles, snippetCap);
  }

  if (useSimplified) {
    // Compact category-based criteria instead of per-judge listing
    md += `### Quality Dimensions (${judges.length} judges)\n\n`;
    md += `> Using compact criteria mode to stay within token budget.\n\n`;

    // Group judges by domain
    const domainGroups = new Map<string, string[]>();
    for (const judge of judges) {
      const domain = judge.domain ?? "general";
      if (!domainGroups.has(domain)) domainGroups.set(domain, []);
      domainGroups.get(domain)!.push(`\`${judge.rulePrefix}\` ${judge.name}`);
    }
    for (const [domain, names] of domainGroups) {
      md += `**${domain}:** ${names.join(", ")}\n\n`;
    }
    md += `**Precision Mandate:** Every finding MUST cite specific code evidence. Do NOT flag absent features speculatively. Do NOT validate Azure resource identifiers for strict UUID/GUID hex compliance. Prefer fewer, high-confidence findings over many uncertain ones.\n\n`;
    md += `---\n\n`;
  } else {
    for (const judge of judges) {
      md += `### ${judge.name} — ${judge.domain}\n\n`;
      md += `${judge.description}\n\n`;
      md += `**Rule prefix:** \`${judge.rulePrefix}-\` · **Precision Mandate:** Every finding MUST cite specific code evidence. Do NOT flag absent features speculatively. Do NOT validate Azure resource identifiers for strict UUID/GUID hex compliance — they are opaque platform constants. Prefer fewer, high-confidence findings over many uncertain ones.\n\n`;
      md += `---\n\n`;
    }
  }

  md += `### False Positive Review\n\n`;
  md += `Before adding new findings, **review each pattern-based finding above for false positives.** `;
  md += `Static pattern matching can flag code that is actually correct — for example:\n`;
  md += `- String literals or comments that contain keywords (e.g. a regex containing "DELETE" flagged as an unaudited SQL operation)\n`;
  md += `- Function-scoped variables mistakenly flagged as global state\n`;
  md += `- Nearby mitigation code (logging, guards) that the pattern scanner didn't see\n`;
  md += `- Example/test code that intentionally contains the flagged pattern\n\n`;
  md += `For each pattern finding you believe is a false positive, include it in a **"Dismissed Findings"** section with:\n`;
  md += `- The original rule ID\n`;
  md += `- A brief explanation of why it is a false positive\n\n`;

  md += `### Response Format\n\n`;
  md += `For each judge, provide any additional findings your contextual analysis uncovers using:\n`;
  md += `- The judge's rule ID prefix\n`;
  md += `- Severity levels: critical / high / medium / low / info\n`;
  md += `- Include: title, description, affected lines, recommendation, and reference\n\n`;
  md += `Include a **Dismissed Findings** section listing any pattern-based findings you identified as false positives, grouped by judge.\n\n`;
  md += `Then provide an **OVERALL UPDATED TRIBUNAL VERDICT** that accounts for BOTH the pattern findings AND your contextual findings, minus any dismissed false positives:\n`;
  md += `- Per-judge scores (0-100) and verdicts\n`;
  md += `- Overall score and verdict (PASS/WARNING/FAIL)\n`;
  md += `- Executive summary of the most critical issues\n`;

  return md;
}

// ─── Simplified Deep Review (content-policy retry) ───────────────────────────
// A condensed prompt that groups judges by category rather than listing each
// one individually. Used as a fallback when the full tribunal prompt triggers
// LLM content-policy refusal. Dramatically smaller prompt surface area.

export function buildSimplifiedDeepReviewSection(language: string, context?: string): string {
  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += DEFENSIVE_PREAMBLE;
  md += `> The pattern-based findings above are a starting point. Please perform a thorough `;
  md += `constructive review of this ${language} code across these quality dimensions:\n\n`;

  if (context) {
    md += `**Context provided:** ${context}\n\n`;
  }

  md += `**Quality Dimensions to Evaluate:**\n\n`;
  md += `1. **Code Quality** — Readability, maintainability, naming, complexity, modularity, documentation\n`;
  md += `2. **Defensive Security** — Input validation, output encoding, access controls, encryption, secure defaults\n`;
  md += `3. **Reliability** — Error handling, fault tolerance, recovery, edge cases\n`;
  md += `4. **Performance** — Efficiency, resource usage, scalability considerations\n`;
  md += `5. **Operations** — Logging, monitoring, configuration management, deployment readiness\n`;
  md += `6. **Compliance** — Regulatory considerations, data protection practices, audit readiness\n`;
  md += `7. **Infrastructure** — IaC best practices, network rules, identity management (if applicable)\n\n`;

  md += `### Precision Mandate\n\n`;
  md += `Every finding MUST cite specific code evidence. Do NOT flag absent features speculatively. `;
  md += `Do NOT validate Azure resource identifiers (policy IDs, role IDs, tenant IDs) for strict UUID/GUID hex compliance — `;
  md += `they are opaque platform constants provided by Microsoft. `;
  md += `Prefer fewer, high-confidence findings over many uncertain ones.\n\n`;

  md += `### Response Format\n\n`;
  md += `For each finding provide: severity (critical/high/medium/low/info), title, description, `;
  md += `affected lines, recommendation, and reference. Include a **Dismissed Findings** section `;
  md += `for any pattern-based findings that are false positives.\n\n`;
  md += `End with an **OVERALL VERDICT**: score (0-100), verdict (PASS/WARNING/FAIL), and executive summary.\n`;

  return md;
}
