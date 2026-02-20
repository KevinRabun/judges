import { Finding } from "../types.js";
import { analyzeStructure } from "../ast/index.js";

/**
 * AST / Structure-based evaluator.
 *
 * Unlike the regex-based evaluators this judge uses real AST parsing for
 * JS/TS (via the TypeScript compiler API) and a scope-tracking structural
 * parser for Python, Rust, Go, Java, and C#.
 *
 * Rules produced:
 *   STRUCT-001  High cyclomatic complexity (>10 per function)
 *   STRUCT-002  Deeply nested code (>4 levels)
 *   STRUCT-003  Long function (>50 lines)
 *   STRUCT-004  Too many parameters (>5)
 *   STRUCT-005  Dead / unreachable code
 *   STRUCT-006  Weak / dynamic type usage (AST-detected)
 *   STRUCT-007  File-level complexity too high (>40)
 *   STRUCT-008  Very high complexity function (>20)
 *   STRUCT-009  Excessive parameter count (>8, critical)
 *   STRUCT-010  Extremely long function (>150 lines)
 */
export function analyzeCodeStructure(
  code: string,
  language: string
): Finding[] {
  const findings: Finding[] = [];
  const prefix = "STRUCT";

  const structure = analyzeStructure(code, language);

  // ─── STRUCT-001: High cyclomatic complexity (>10) ─────────────────────────
  const complexFunctions = structure.functions.filter(
    (f) => f.cyclomaticComplexity > 10
  );
  if (complexFunctions.length > 0) {
    findings.push({
      ruleId: `${prefix}-001`,
      severity: "high",
      title: "High cyclomatic complexity",
      description: `${complexFunctions.length} function(s) exceed a cyclomatic complexity of 10: ${complexFunctions
        .slice(0, 5)
        .map((f) => `${f.name}() CC=${f.cyclomaticComplexity} at line ${f.startLine}`)
        .join("; ")}. High complexity makes code harder to test and maintain.`,
      lineNumbers: complexFunctions.map((f) => f.startLine),
      recommendation:
        "Refactor complex functions by extracting sub-functions, using guard clauses / early returns, replacing conditionals with polymorphism, or using lookup tables instead of long if/else chains. Aim for CC ≤ 10.",
      reference: "McCabe Cyclomatic Complexity — Software Engineering Institute",
      suggestedFix:
        "Break the function into smaller, focused functions with single responsibilities.",
    });
  }

  // ─── STRUCT-002: Deep nesting (>4 levels, AST-detected) ──────────────────
  const deeplyNestedFunctions = structure.functions.filter(
    (f) => f.maxNestingDepth > 4
  );
  if (
    structure.deepNestLines.length > 0 ||
    deeplyNestedFunctions.length > 0
  ) {
    const lineNumbers = [
      ...new Set([
        ...structure.deepNestLines,
        ...deeplyNestedFunctions.map((f) => f.startLine),
      ]),
    ].sort((a, b) => a - b);

    findings.push({
      ruleId: `${prefix}-002`,
      severity: "medium",
      title: "Deeply nested code (>4 levels)",
      description: `Code nesting exceeds 4 levels in ${lineNumbers.length} location(s).${
        deeplyNestedFunctions.length > 0
          ? ` Functions: ${deeplyNestedFunctions
              .slice(0, 3)
              .map(
                (f) =>
                  `${f.name}() depth=${f.maxNestingDepth} at line ${f.startLine}`
              )
              .join("; ")}.`
          : ""
      } Deep nesting hurts readability and cognitive load.`,
      lineNumbers: lineNumbers.slice(0, 10),
      recommendation:
        "Use guard clauses (early returns), extract helper methods, or restructure conditionals. Aim for max nesting depth of 3.",
      reference: "Cognitive Complexity — SonarSource",
      suggestedFix:
        "Invert conditions and return early to reduce nesting, or extract nested logic into well-named helper functions.",
    });
  }

  // ─── STRUCT-003: Long function (>50 lines) ────────────────────────────────
  const longFunctions = structure.functions.filter((f) => f.lineCount > 50);
  if (longFunctions.length > 0) {
    findings.push({
      ruleId: `${prefix}-003`,
      severity: "medium",
      title: "Long function detected (>50 lines)",
      description: `${longFunctions.length} function(s) exceed 50 lines: ${longFunctions
        .slice(0, 5)
        .map(
          (f) =>
            `${f.name}() ${f.lineCount} lines at line ${f.startLine}`
        )
        .join("; ")}. Long functions are hard to understand, test, and maintain.`,
      lineNumbers: longFunctions.map((f) => f.startLine),
      recommendation:
        "Break into smaller functions following the Single Responsibility Principle. Each function should do one thing well. Aim for ≤ 30 lines.",
      reference: "Clean Code (Robert C. Martin) — Chapter 3: Functions",
    });
  }

  // ─── STRUCT-004: Too many parameters (>5) ─────────────────────────────────
  const tooManyParams = structure.functions.filter(
    (f) => f.parameterCount > 5
  );
  if (tooManyParams.length > 0) {
    findings.push({
      ruleId: `${prefix}-004`,
      severity: "medium",
      title: "Too many parameters (>5)",
      description: `${tooManyParams.length} function(s) have more than 5 parameters: ${tooManyParams
        .slice(0, 5)
        .map(
          (f) =>
            `${f.name}() ${f.parameterCount} params at line ${f.startLine}`
        )
        .join("; ")}. Many parameters make a function hard to call correctly and often signal that it does too much.`,
      lineNumbers: tooManyParams.map((f) => f.startLine),
      recommendation:
        "Group related parameters into a configuration object or struct. Consider if the function is doing too much and should be split.",
      reference: "Clean Code — Function Arguments",
      suggestedFix:
        "Replace multiple parameters with an options/config object: function create(opts: CreateOptions)",
    });
  }

  // ─── STRUCT-005: Dead / unreachable code ──────────────────────────────────
  if (structure.deadCodeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-005`,
      severity: "low",
      title: "Dead / unreachable code detected",
      description: `${structure.deadCodeLines.length} line(s) of code appear after return, throw, break, or continue statements and will never execute.`,
      lineNumbers: structure.deadCodeLines.slice(0, 10),
      recommendation:
        "Remove unreachable code. Enable linter rules for unreachable code detection (no-unreachable in ESLint, dead_code in Rust).",
      reference: "Code Quality — Dead Code Elimination",
    });
  }

  // ─── STRUCT-006: Weak / dynamic type usage (AST-detected) ────────────────
  if (structure.typeAnyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-006`,
      severity: "medium",
      title: "Weak/dynamic type usage (AST-detected)",
      description: `${structure.typeAnyLines.length} location(s) using weak or dynamic types detected via structural analysis. This is more accurate than regex — it checks the actual type annotations in the AST.`,
      lineNumbers: structure.typeAnyLines.slice(0, 10),
      recommendation:
        "Replace with specific types or constrained generics. In TypeScript use 'unknown' instead of 'any'. In Go use concrete interfaces. In Rust avoid unnecessary unsafe blocks.",
      reference: "Type Safety Best Practices",
    });
  }

  // ─── STRUCT-007: File-level complexity too high (>40) ─────────────────────
  if (structure.fileCyclomaticComplexity > 40) {
    findings.push({
      ruleId: `${prefix}-007`,
      severity: "high",
      title: "File-level complexity is very high",
      description: `The total cyclomatic complexity of this file is ${structure.fileCyclomaticComplexity} (sum of all functions). Files with complexity > 40 are very difficult to test comprehensively and maintain.`,
      recommendation:
        "Split the file into smaller modules. Move related functions into their own files/modules. Aim for file-level complexity < 30.",
      reference: "Software Complexity Metrics — SEI",
    });
  }

  // ─── STRUCT-008: Very high complexity single function (>20) ───────────────
  const veryComplexFunctions = structure.functions.filter(
    (f) => f.cyclomaticComplexity > 20
  );
  if (veryComplexFunctions.length > 0) {
    findings.push({
      ruleId: `${prefix}-008`,
      severity: "critical",
      title: "Extremely high cyclomatic complexity (>20)",
      description: `${veryComplexFunctions.length} function(s) have complexity > 20: ${veryComplexFunctions
        .slice(0, 3)
        .map(
          (f) =>
            `${f.name}() CC=${f.cyclomaticComplexity} at line ${f.startLine}`
        )
        .join("; ")}. This level of complexity is almost untestable.`,
      lineNumbers: veryComplexFunctions.map((f) => f.startLine),
      recommendation:
        "This function needs immediate refactoring. Use the Strategy pattern, table-driven logic, or break it into a pipeline of smaller functions.",
      reference: "McCabe Complexity — Critical Threshold",
    });
  }

  // ─── STRUCT-009: Excessive parameters (>8, critical) ──────────────────────
  const excessiveParams = structure.functions.filter(
    (f) => f.parameterCount > 8
  );
  if (excessiveParams.length > 0) {
    findings.push({
      ruleId: `${prefix}-009`,
      severity: "high",
      title: "Excessive parameter count (>8)",
      description: `${excessiveParams.length} function(s) have more than 8 parameters: ${excessiveParams
        .slice(0, 3)
        .map(
          (f) =>
            `${f.name}() ${f.parameterCount} params at line ${f.startLine}`
        )
        .join("; ")}. This is a strong signal of poor design.`,
      lineNumbers: excessiveParams.map((f) => f.startLine),
      recommendation:
        "Immediately refactor: use a builder pattern, configuration struct, or split the function's responsibilities.",
      reference: "Clean Code — Function Arguments / Builder Pattern",
    });
  }

  // ─── STRUCT-010: Extremely long function (>150 lines) ─────────────────────
  const veryLongFunctions = structure.functions.filter(
    (f) => f.lineCount > 150
  );
  if (veryLongFunctions.length > 0) {
    findings.push({
      ruleId: `${prefix}-010`,
      severity: "high",
      title: "Extremely long function (>150 lines)",
      description: `${veryLongFunctions.length} function(s) exceed 150 lines: ${veryLongFunctions
        .slice(0, 3)
        .map(
          (f) =>
            `${f.name}() ${f.lineCount} lines at line ${f.startLine}`
        )
        .join("; ")}. Functions this long almost certainly violate the Single Responsibility Principle.`,
      lineNumbers: veryLongFunctions.map((f) => f.startLine),
      recommendation:
        "This function needs immediate decomposition. Extract logical sections into named helper functions.",
      reference: "Clean Code — Function Length",
    });
  }

  return findings;
}
