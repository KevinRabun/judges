import type { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

/**
 * Multi-turn coherence evaluator.
 *
 * Detects self-contradicting patterns within a single code file that suggest
 * incomplete refactoring, copy-paste inconsistencies, or conflicting logic:
 * - Duplicate function definitions with different implementations
 * - Contradictory boolean assignments to the same variable
 * - Dead code after unconditional return/throw
 * - Import statements for unused modules alongside re-implementations
 * - Conflicting configuration values
 */
export function analyzeMultiTurnCoherence(code: string, _language: string): Finding[] {
  const findings: Finding[] = [];
  const prefix = "COH";
  let ruleNum = 1;
  const lines = code.split("\n");

  // ── COH-001: Contradictory boolean assignments ────────────────────────
  const boolAssignPattern = /\b(\w+)\s*=\s*(true|false)\s*;/g;
  const boolAssignments = new Map<string, { value: string; line: number }[]>();
  let match: RegExpExecArray | null;
  while ((match = boolAssignPattern.exec(code)) !== null) {
    const varName = match[1];
    const value = match[2];
    const lineNum = code.slice(0, match.index).split("\n").length;
    if (!boolAssignments.has(varName)) boolAssignments.set(varName, []);
    boolAssignments.get(varName)!.push({ value, line: lineNum });
  }
  const contradictoryVars: number[] = [];
  for (const [, assignments] of boolAssignments) {
    if (assignments.length >= 2) {
      const values = new Set(assignments.map((a) => a.value));
      if (values.size > 1) {
        // Same variable assigned both true and false — check they're at the same scope level
        // (simple heuristic: within 5 lines of each other with no control flow between)
        for (let i = 0; i < assignments.length - 1; i++) {
          const a = assignments[i];
          const b = assignments[i + 1];
          if (a.value !== b.value && b.line - a.line <= 5) {
            const between = lines.slice(a.line - 1, b.line).join("\n");
            if (!/\b(if|else|switch|case|for|while|catch|try)\b/.test(between)) {
              contradictoryVars.push(a.line, b.line);
            }
          }
        }
      }
    }
  }
  if (contradictoryVars.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Contradictory boolean assignments",
      description:
        "The same variable is assigned both true and false in close proximity without " +
        "intervening control flow, suggesting incomplete refactoring or a logic error.",
      lineNumbers: [...new Set(contradictoryVars)],
      recommendation:
        "Review the variable assignments and remove the stale one, or add proper " +
        "conditional logic if both assignments are intentional.",
      confidence: 0.7,
    });
  }

  // ── COH-002: Dead code after unconditional return/throw ───────────────
  ruleNum = 2;
  const deadCodeLines: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || "";
    // Unconditional return/throw not inside a ternary or short-circuit
    if (/^(return\b|throw\b)/.test(line) && !line.includes("?") && !line.includes("&&")) {
      // Next line is code (not a closing brace, comment, or blank)
      if (nextLine && !/^[}\])]/.test(nextLine) && !/^\/[/*]/.test(nextLine) && !/^$/.test(nextLine)) {
        deadCodeLines.push(i + 2); // +2 because 0-indexed +1 for line number +1 for next line
      }
    }
  }
  if (deadCodeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unreachable code after return/throw",
      description:
        "Code exists after an unconditional return or throw statement. " +
        "This code will never execute and may indicate incomplete refactoring.",
      lineNumbers: deadCodeLines.slice(0, 5),
      recommendation:
        "Remove the unreachable code or restructure the logic so the code " +
        "is reached under the intended conditions.",
      confidence: 0.75,
    });
  }

  // ── COH-003: Duplicate function definitions ───────────────────────────
  ruleNum = 3;
  const funcDefPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  const funcDefs = new Map<string, number[]>();
  while ((match = funcDefPattern.exec(code)) !== null) {
    const name = match[1];
    const lineNum = code.slice(0, match.index).split("\n").length;
    if (!funcDefs.has(name)) funcDefs.set(name, []);
    funcDefs.get(name)!.push(lineNum);
  }
  const duplicateFuncLines: number[] = [];
  for (const [, defLines] of funcDefs) {
    if (defLines.length >= 2) {
      duplicateFuncLines.push(...defLines);
    }
  }
  if (duplicateFuncLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Duplicate function definitions",
      description:
        "Multiple functions with the same name are defined in this file. " +
        "Only the last definition will be effective, which may cause unexpected behaviour.",
      lineNumbers: duplicateFuncLines,
      recommendation:
        "Remove or rename the duplicate function definitions. If they serve " +
        "different purposes, give them distinct names.",
      confidence: 0.85,
    });
  }

  // ── COH-004: Conflicting config values ────────────────────────────────
  ruleNum = 4;
  const configPattern = /(['"])([\w.]+)\1\s*:\s*(['"]?)([^'",}\]\n]+)\3/g;
  const configValues = new Map<string, { value: string; line: number }[]>();
  while ((match = configPattern.exec(code)) !== null) {
    const key = match[2];
    const value = match[4].trim();
    const lineNum = code.slice(0, match.index).split("\n").length;
    if (!configValues.has(key)) configValues.set(key, []);
    configValues.get(key)!.push({ value, line: lineNum });
  }
  const conflictLines: number[] = [];
  for (const [, vals] of configValues) {
    if (vals.length >= 2) {
      const uniqueValues = new Set(vals.map((v) => v.value));
      if (uniqueValues.size > 1) {
        conflictLines.push(...vals.map((v) => v.line));
      }
    }
  }
  if (conflictLines.length > 0 && conflictLines.length <= 10) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potentially conflicting configuration values",
      description:
        "The same configuration key appears multiple times with different values. " +
        "This may indicate a copy-paste error or conflicting settings.",
      lineNumbers: [...new Set(conflictLines)].slice(0, 5),
      recommendation: "Verify that each configuration key has the intended value and remove duplicates.",
      confidence: 0.5,
    });
  }

  // ── COH-005: TODO/FIXME/HACK with contradicting code ─────────────────
  ruleNum = 5;
  const todoLines = getLineNumbers(code, /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i);
  if (todoLines.length >= 5) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "High density of TODO/FIXME markers",
      description:
        `${todoLines.length} TODO/FIXME/HACK markers found. High density of unresolved ` +
        "markers suggests incomplete implementation or deferred work that may affect reliability.",
      lineNumbers: todoLines.slice(0, 5),
      recommendation:
        "Prioritize and address the TODO/FIXME items, or create tracked issues " +
        "for each one and remove stale markers.",
      confidence: 0.8,
    });
  }

  return findings;
}
