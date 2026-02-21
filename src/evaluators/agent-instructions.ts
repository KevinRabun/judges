import { Finding } from "../types.js";

function lineNumbers(code: string, pattern: RegExp): number[] {
  const lines = code.split("\n");
  const result: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (pattern.test(lines[index])) {
      result.push(index + 1);
    }
  }
  return result;
}

export function analyzeAgentInstructions(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const prefix = "AGENT";
  let ruleNum = 1;

  const looksLikeInstructionDoc =
    /(^|\n)#{1,6}\s+/.test(code) &&
    /agent|instruction|copilot|assistant|workflow|policy|rules/i.test(code);

  const isMarkdownLike = /markdown|md|mdx/i.test(language) || looksLikeInstructionDoc;
  if (!isMarkdownLike) return findings;

  const unsafeOverrideLines = lineNumbers(
    code,
    /ignore\s+(all\s+)?(previous|prior|system|developer)\s+instructions|disable\s+safety|bypass\s+policy|override\s+guardrails/i
  );
  if (unsafeOverrideLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Unsafe instruction override language detected",
      description:
        "Instruction text appears to disable safety/policy hierarchy (e.g., ignore prior/system instructions), which can cause harmful or non-compliant agent behavior.",
      lineNumbers: unsafeOverrideLines,
      recommendation:
        "Remove override phrases and explicitly preserve policy hierarchy (system > developer > user > project/task).",
      reference: "Prompt Injection & Instruction Hierarchy Safety",
    });
  }

  const hasExplicitHierarchy =
    /system|developer|user/i.test(code) && /priority|precedence|hierarchy|order/i.test(code);
  if (!hasExplicitHierarchy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Missing explicit instruction hierarchy",
      description:
        "Instruction markdown does not clearly define rule precedence. Without hierarchy, agents may resolve conflicts inconsistently.",
      recommendation:
        "Add a dedicated hierarchy section describing precedence and conflict-resolution order.",
      reference: "Instruction Priority Design Best Practices",
    });
  }

  const askAlways = /always\s+ask|must\s+always\s+ask/i.test(code);
  const neverAsk = /never\s+ask|do\s+not\s+ask\s+questions/i.test(code);
  if (askAlways && neverAsk) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Conflicting directives for clarification behavior",
      description:
        "The file contains contradictory instructions about asking clarifying questions, which creates nondeterministic behavior.",
      recommendation:
        "Define a single rule: ask only when missing information blocks safe execution; otherwise proceed with documented defaults.",
      reference: "Deterministic Agent Behavior Guidance",
    });
  }

  const hasValidation = /test|build|lint|verify|validation|compile/i.test(code);
  if (!hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Missing validation/verification expectations",
      description:
        "No explicit expectation for running tests/build/verification was found. This can cause unvalidated code changes.",
      recommendation:
        "Add a validation section defining when to run tests/build, and how to report failures or blockers.",
      reference: "Agent Reliability and QA Guardrails",
    });
  }

  const hasScopeBoundaries = /scope|out\s+of\s+scope|do\s+not\s+change|only\s+modify|boundaries/i.test(code);
  if (!hasScopeBoundaries) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Missing explicit scope boundaries",
      description:
        "Instruction set lacks clear boundaries for what files/features the agent may or may not modify.",
      recommendation:
        "Add explicit scope constraints to reduce unintended edits and feature creep.",
      reference: "Change Scope Governance",
    });
  }

  const hasSafetyPolicy = /harmful|safety|privacy|security|compliance|refus(e|al)|cannot assist/i.test(code);
  if (!hasSafetyPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Missing safety/policy handling guidance",
      description:
        "No clear safety and policy constraints were found for harmful requests, privacy-sensitive content, or compliance boundaries.",
      recommendation:
        "Add explicit refusal and safety-handling guidance for harmful or policy-violating requests.",
      reference: "AI Safety Policy Design",
    });
  }

  const headingCount = (code.match(/(^|\n)#{1,6}\s+/g) ?? []).length;
  if (headingCount === 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Unstructured instruction markdown",
      description:
        "Instruction content has no heading structure, reducing readability and increasing interpretation drift for both humans and agents.",
      recommendation:
        "Use headings and short sections (scope, hierarchy, validation, safety, ambiguity handling).",
      reference: "Documentation Structure Best Practices",
    });
  }

  return findings;
}
