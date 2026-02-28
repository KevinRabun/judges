import type { Finding } from "../types.js";

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
    /(^|\n)#{1,6}\s+/.test(code) && /agent|instruction|copilot|assistant|workflow|policy|rules/i.test(code);

  const isMarkdownLike = /markdown|md|mdx/i.test(language) || looksLikeInstructionDoc;
  if (!isMarkdownLike) return findings;

  const unsafeOverrideLines = lineNumbers(
    code,
    /ignore\s+(all\s+)?(previous|prior|system|developer)\s+instructions|disable\s+safety|bypass\s+policy|override\s+guardrails/i,
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
      suggestedFix:
        "Remove phrases like 'ignore previous instructions' and add an explicit hierarchy header: ## Instruction Priority\n1. System policy (immutable)\n2. Developer rules\n3. User instructions\n4. Task context.",
      confidence: 0.95,
    });
  }

  const hasExplicitHierarchy = /system|developer|user/i.test(code) && /priority|precedence|hierarchy|order/i.test(code);
  if (!hasExplicitHierarchy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Missing explicit instruction hierarchy",
      description:
        "Instruction markdown does not clearly define rule precedence. Without hierarchy, agents may resolve conflicts inconsistently.",
      recommendation: "Add a dedicated hierarchy section describing precedence and conflict-resolution order.",
      reference: "Instruction Priority Design Best Practices",
      suggestedFix:
        "Add a '## Precedence' section listing rule layers in descending priority (system > developer > user > project) with a conflict-resolution policy.",
      confidence: 0.7,
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
      suggestedFix:
        "Replace contradictory ask/never-ask directives with a single rule: 'Ask for clarification only when missing information blocks safe execution; otherwise proceed using documented defaults.'",
      confidence: 0.9,
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
      suggestedFix:
        "Add a '## Validation' section: 'After every code change run `npm test` and `npm run build`. Report failures before proceeding.'",
      confidence: 0.7,
    });
  }

  const hasScopeBoundaries = /scope|out\s+of\s+scope|do\s+not\s+change|only\s+modify|boundaries/i.test(code);
  if (!hasScopeBoundaries) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Missing explicit scope boundaries",
      description: "Instruction set lacks clear boundaries for what files/features the agent may or may not modify.",
      recommendation: "Add explicit scope constraints to reduce unintended edits and feature creep.",
      reference: "Change Scope Governance",
      suggestedFix:
        "Add a '## Scope' section listing allowed directories, file patterns, and out-of-scope areas (e.g., 'Do not modify CI configs or package.json without approval').",
      confidence: 0.7,
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
      recommendation: "Add explicit refusal and safety-handling guidance for harmful or policy-violating requests.",
      reference: "AI Safety Policy Design",
      suggestedFix:
        "Add a '## Safety' section: 'Refuse harmful, hateful, or privacy-violating requests. Never generate credentials or PII. Respond with a safe refusal message when policy is violated.'",
      confidence: 0.7,
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
      recommendation: "Use headings and short sections (scope, hierarchy, validation, safety, ambiguity handling).",
      reference: "Documentation Structure Best Practices",
      suggestedFix:
        "Structure the document with markdown headings: ## Scope, ## Hierarchy, ## Validation, ## Safety, ## Ambiguity Handling — each containing concise, actionable rules.",
      confidence: 0.7,
    });
  }

  // Agent with powerful capabilities without sandboxing
  const hasPowerfulCapabilities =
    /(?:exec|execute|run|spawn|shell|child_process|subprocess|os\.system|file.*write|fs\.write|delete.*file|rm\s|remove.*file|network|http|fetch|download|curl|wget)/i.test(
      code,
    );
  const hasSandboxing =
    /sandbox|container|docker|isolation|restrict|permission|allow.?list|deny.?list|firewall|seccomp|chroot|namespace|limit/i.test(
      code,
    );
  if (hasPowerfulCapabilities && !hasSandboxing) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Agent capabilities without sandboxing guidance",
      description:
        "Instructions reference powerful capabilities (exec, filesystem, network) without specifying sandboxing or isolation boundaries. An agent with unrestricted capabilities can cause damage through unintended actions.",
      recommendation:
        "Define explicit sandboxing requirements: which directories are writable, which commands are allowed, network access restrictions, and resource limits.",
      reference: "Agent Capability Isolation / Principle of Least Privilege",
      suggestedFix:
        "Add sandboxing requirements: specify writable directories, allowlisted commands, network access restrictions, and resource limits (CPU, memory, time).",
      confidence: 0.8,
    });
  }

  // Agent tool definitions without input constraints
  const hasToolDefs = /tool|function|action|command|capability|plugin|extension/i.test(code);
  const hasInputConstraints =
    /(?:parameter|param|input|argument).*(?:type|format|range|min|max|pattern|regex|enum|valid|constraint|required|optional)/i.test(
      code,
    );
  if (hasToolDefs && !hasInputConstraints && code.split("\n").length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Tool/action definitions without input parameter constraints",
      description:
        "Agent instructions define tools or actions but do not specify input parameter constraints (types, ranges, validation rules). Without constraints, the agent may pass invalid or dangerous inputs to tools.",
      recommendation:
        "For each tool/action, define parameter types, allowed values/ranges, required vs optional fields, and any validation rules that must be applied before execution.",
      reference: "MCP Tool Schema Best Practices / Input Validation",
      suggestedFix:
        "For each tool definition, add parameter schemas with types, allowed values/ranges, required vs optional flags, and validation rules (e.g., 'filePath: string, must be relative, no ../ traversal').",
      confidence: 0.75,
    });
  }

  // Agent loop without termination condition
  const hasLoopConcept = /(?:loop|iterate|repeat|recursive|retry|continue|re-?run|cycle|round|step|phase)/i.test(code);
  const hasTermination =
    /(?:terminat|stop|halt|exit|break|max.*(?:iteration|step|round|attempt|loop|cycle)|limit|timeout|budget|deadline|guard|circuit.?break)/i.test(
      code,
    );
  if (hasLoopConcept && !hasTermination) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Agent loop without termination condition",
      description:
        "Instructions describe iterative or looping behavior without specifying termination conditions. Without limits, agents can enter infinite loops, consuming resources and generating costs indefinitely.",
      recommendation:
        "Define explicit termination conditions: maximum iterations, time budget, token/cost limits, success criteria, and a fallback action when limits are reached.",
      reference: "Agentic Loop Safety / Resource Governance",
      suggestedFix:
        "Add termination guards: 'Maximum 10 iterations per task. Stop after 5 minutes or 50k tokens. On limit: summarize progress, save state, and yield to user.'",
      confidence: 0.8,
    });
  }

  return findings;
}
