// ─── Deep Review Section Builders ────────────────────────────────────────────
// These functions append each judge's expert criteria to tool output,
// turning pattern-only results into hybrid evaluations. The calling LLM
// uses these criteria to perform deep contextual analysis beyond static
// pattern matching.
// ──────────────────────────────────────────────────────────────────────────────

import type { JudgeDefinition } from "../types.js";

export function buildSingleJudgeDeepReviewSection(
  judge: JudgeDefinition,
  language: string,
  context?: string,
  llmFiltered?: boolean,
): string {
  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += `> **The pattern-based findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code using the expert criteria below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified evaluation.\n\n`;

  if (context) {
    md += `**Context provided:** ${context}\n\n`;
  }

  md += `### ${judge.name} — ${judge.domain}\n\n`;
  md += `${judge.systemPrompt}\n\n`;

  md += `### False Positive Review\n\n`;
  if (llmFiltered) {
    md += `> **Note:** An LLM-based false positive filter has already been applied to the findings above. `;
    md += `Some static analysis false positives have been automatically removed. `;
    md += `You should still review the remaining findings for any additional false positives the filter may have missed.\n\n`;
  }
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

export function buildTribunalDeepReviewSection(
  judges: JudgeDefinition[],
  language: string,
  context?: string,
  llmFiltered?: boolean,
): string {
  let md = `\n\n---\n\n`;
  md += `## 🔍 Deep Contextual Review Required\n\n`;
  md += `> **The pattern-based tribunal findings above are a starting point only.** `;
  md += `Static pattern matching cannot evaluate semantic correctness, architectural coherence, `;
  md += `business logic validity, cross-module data flow, or context-dependent implications.\n>\n`;
  md += `> **You MUST now perform a thorough contextual review** of the ${language} code from the perspective of ALL ${judges.length} judges below. `;
  md += `Identify issues that pattern matching cannot catch. Incorporate both the pattern findings above AND your own deep analysis into a final, unified tribunal verdict.\n\n`;

  if (context) {
    md += `**Context provided:** ${context}\n\n`;
  }

  for (const judge of judges) {
    md += `### ${judge.name} — ${judge.domain}\n\n`;
    md += `${judge.systemPrompt}\n\n`;
    md += `---\n\n`;
  }

  md += `### False Positive Review\n\n`;
  if (llmFiltered) {
    md += `> **Note:** An LLM-based false positive filter has already been applied to the findings above. `;
    md += `Some static analysis false positives have been automatically removed (see the "LLM False Positive Filter" section above for details). `;
    md += `You should still review the remaining findings for any additional false positives the filter may have missed.\n\n`;
  }
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
