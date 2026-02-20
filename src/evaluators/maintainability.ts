import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeMaintainability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "MAINT";

  // any type usage
  const anyPattern = /:\s*any\b|<any>|as\s+any\b/gi;
  const anyLines = getLineNumbers(code, anyPattern);
  if (anyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Use of 'any' type undermines type safety",
      description: `Found ${anyLines.length} occurrence(s) of the 'any' type. Using 'any' disables type checking, makes refactoring risky, and allows bugs to slip through undetected.`,
      lineNumbers: anyLines.slice(0, 10),
      recommendation: "Replace 'any' with specific types, interfaces, or 'unknown' with type guards. If the type is truly dynamic, use a union type or generic.",
      reference: "TypeScript Best Practices / Clean Code",
    });
  }

  // Magic numbers
  const magicNumberPattern = /(?<![.\w])(?:0x[0-9a-f]{4,}|\d{4,})(?!\s*[;:)\]}]?\s*\/\/|\.\d|px|em|rem|ms|%|e\+)/gi;
  const lines = code.split("\n");
  const magicLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip imports, comments, and obvious non-magic contexts
    if (/^\s*\/\/|^\s*\*|^\s*import|^\s*#|\.padStart|\.padEnd|\.slice|ruleNum|ruleId|String\(/.test(line)) continue;
    if (/(?<![.\w"'`])(?:86400|3600|1000|5000|8080|3000|4200|8000|1024|2048|4096)\b/.test(line)) {
      magicLines.push(i + 1);
    }
  }
  if (magicLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Magic numbers detected",
      description: `Found ${magicLines.length} magic number(s) — numeric literals without named constants. Future maintainers won't know what these values represent.`,
      lineNumbers: magicLines.slice(0, 5),
      recommendation: "Extract magic numbers into named constants (e.g., const HEARTBEAT_INTERVAL_MS = 5000). Use enums for related sets of values.",
      reference: "Clean Code: Chapter 17 — Smells and Heuristics (G25)",
    });
  }

  // TODO / FIXME / HACK / XXX comments
  const todoPattern = /\/\/\s*(?:TODO|FIXME|HACK|XXX|TEMP|WORKAROUND)\b/gi;
  const todoLines = getLineNumbers(code, todoPattern);
  if (todoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Technical debt markers (TODO/FIXME/HACK) found",
      description: `Found ${todoLines.length} technical debt marker(s). These indicate known problems or shortcuts that haven't been addressed.`,
      lineNumbers: todoLines,
      recommendation: "Convert TODO/FIXME comments into tracked issues in your project management tool. Resolve HACK comments with proper implementations.",
      reference: "Clean Code: Technical Debt Management",
    });
  }

  // var keyword usage (JS/TS)
  if (["typescript", "javascript", "ts", "js"].includes(language.toLowerCase())) {
    const varPattern = /\bvar\s+\w/g;
    const varLines = getLineNumbers(code, varPattern);
    if (varLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "'var' declarations reduce maintainability",
        description: `Found ${varLines.length} 'var' declaration(s). 'var' has function scope and hoisting, which makes code harder to reason about and can lead to subtle bugs.`,
        lineNumbers: varLines,
        recommendation: "Use 'const' for values that don't change and 'let' for values that do. Never use 'var' in modern JavaScript/TypeScript.",
        reference: "ESLint no-var rule / Modern JavaScript Best Practices",
      });
    }
  }

  // Very long functions (> 50 lines between function declaration and closing)
  const funcPattern = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))/g;
  let funcCount = 0;
  let match;
  while ((match = funcPattern.exec(code)) !== null) {
    funcCount++;
  }
  const totalLines = lines.length;
  if (funcCount > 0 && totalLines / funcCount > 60) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Functions may be too long",
      description: `Average function length is approximately ${Math.round(totalLines / funcCount)} lines. Long functions are harder to understand, test, and maintain.`,
      recommendation: "Break long functions into smaller, focused units. Each function should do one thing and do it well. Aim for functions under 30 lines.",
      reference: "Clean Code: Functions (Chapter 3)",
    });
  }

  // Deep nesting (4+ levels of indentation)
  const deepNestLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const indentMatch = lines[i].match(/^(\s+)\S/);
    if (indentMatch) {
      const indent = indentMatch[1].replace(/\t/g, "    ").length;
      if (indent >= 16) { // 4+ levels at 4 spaces each
        deepNestLines.push(i + 1);
      }
    }
  }
  if (deepNestLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Deeply nested code detected",
      description: `Found ${deepNestLines.length} line(s) with 4+ levels of nesting. Deep nesting increases cognitive complexity and makes code harder to follow.`,
      lineNumbers: deepNestLines.slice(0, 5),
      recommendation: "Use early returns (guard clauses), extract nested logic into helper functions, or use functional patterns (map, filter, reduce) to flatten nesting.",
      reference: "Cognitive Complexity (SonarSource) / Clean Code",
    });
  }

  // Commented-out code
  const commentedCodePattern = /\/\/\s*(?:const|let|var|function|class|import|export|if|for|while|return|app\.|router\.)\s/g;
  const commentedCodeLines = getLineNumbers(code, commentedCodePattern);
  if (commentedCodeLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Commented-out code detected",
      description: `Found ${commentedCodeLines.length} instances of what appears to be commented-out code. Dead code adds noise and confusion for maintainers.`,
      lineNumbers: commentedCodeLines.slice(0, 5),
      recommendation: "Remove commented-out code. Use version control (git) to retrieve old code if needed. Dead code reduces readability.",
      reference: "Clean Code: Comments (Chapter 4)",
    });
  }

  // Excessive file length
  if (totalLines > 300) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "File is excessively long",
      description: `File is ${totalLines} lines long. Large files are harder to navigate, understand, and test. They often indicate multiple responsibilities.`,
      recommendation: "Break the file into smaller modules with single responsibilities. Extract related functionality into separate files/classes.",
      reference: "Single Responsibility Principle / Clean Architecture",
    });
  }

  return findings;
}
