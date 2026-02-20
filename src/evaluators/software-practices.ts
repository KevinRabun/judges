import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeSoftwarePractices(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SWDEV";
  const lang = getLangFamily(language);

  // Weak / dynamic type usage (multi-language)
  const anyLines = getLangLineNumbers(code, language, LP.WEAK_TYPE);
  if (anyLines.length > 0) {
    const titles: Record<string, string> = {
      javascript: "'any' type usage",
      typescript: "'any' type usage",
      python: "'Any' type annotation",
      rust: "Unsafe block or raw pointer cast",
      csharp: "'dynamic' or 'object' type usage",
      java: "Raw type or 'Object' type usage",
      go: "Empty interface (any/interface{}) usage",
    };
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: titles[lang] || "Weak/dynamic type usage",
      description: "Using weak or dynamic types defeats the type system, hiding potential runtime errors and making refactoring unsafe.",
      lineNumbers: anyLines,
      recommendation: "Replace with specific types, generics, or constrained types. In TS enable 'noImplicitAny'. In Go use concrete types or type constraints.",
      reference: "Type Safety Best Practices / Clean Code",
      suggestedFix: LP.isJsTs(lang) ? "Replace 'any' with a specific type or 'unknown'." : undefined,
    });
  }

  // Linter / type-checker suppression (multi-language)
  const suppressLines = getLangLineNumbers(code, language, LP.LINTER_DISABLE);
  if (suppressLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Type-checker / linter error suppression",
      description: "Directives that suppress compiler or linter errors may mask real bugs and weaken safety guarantees.",
      lineNumbers: suppressLines,
      recommendation: "Fix the underlying issue instead of suppressing it. If suppression is truly necessary, add a comment explaining why.",
      reference: "Strict Mode Best Practices",
    });
  }

  // Magic numbers (multi-language)
  const codeLines = code.split("\n");
  const magicLines = getLangLineNumbers(code, language, LP.MAGIC_NUMBER);
  const wellKnownNumbers = /\b(?:200|201|204|301|302|304|400|401|403|404|405|409|422|429|500|502|503|504|80|443|8080|3000|8443|3001|5432|27017|6379|0o?[0-7]{3,4}|0x[0-9a-f]+|1000|1024|255|256|65535|1e[3-9])\b/gi;
  const filteredMagicLines = magicLines.filter(lineNum => {
    const line = codeLines[lineNum - 1] || "";
    return !wellKnownNumbers.test(line);
  });
  if (filteredMagicLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Magic numbers detected",
      description: "Numeric literals used directly in code without named constants are harder to understand, maintain, and change consistently.",
      lineNumbers: filteredMagicLines,
      recommendation: "Extract magic numbers into named constants (e.g., const MAX_RETRIES = 3, TIMEOUT_MS = 5000) for clarity and maintainability.",
      reference: "Clean Code (Robert C. Martin) — Chapter 17",
    });
  }

  // Very long functions (>50 lines) — multi-language
  const funcDefLines = getLangLineNumbers(code, language, LP.FUNCTION_DEF);
  const longFunctions: number[] = [];
  if (LP.isBraceLang(lang)) {
    let funcStart = -1;
    let braceDepth = 0;
    for (let i = 0; i < codeLines.length; i++) {
      if (funcDefLines.includes(i + 1) && braceDepth === 0) {
        funcStart = i;
      }
      braceDepth += (codeLines[i].match(/\{/g) || []).length;
      braceDepth -= (codeLines[i].match(/\}/g) || []).length;
      if (braceDepth === 0 && funcStart >= 0) {
        if (i - funcStart > 50) longFunctions.push(funcStart + 1);
        funcStart = -1;
      }
    }
  } else if (lang === "python") {
    // Indent-based: find def lines, measure until next def or dedent
    for (const defLine of funcDefLines) {
      const idx = defLine - 1;
      const indent = codeLines[idx].search(/\S/);
      let end = idx + 1;
      while (end < codeLines.length) {
        const l = codeLines[end];
        if (l.trim() !== "" && l.search(/\S/) <= indent && !/^\s*#/.test(l)) break;
        end++;
      }
      if (end - idx > 50) longFunctions.push(defLine);
    }
  }
  if (longFunctions.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Long function detected (>50 lines)",
      description: "Functions exceeding 50 lines are harder to understand, test, and maintain. They often indicate the function is doing too much (violating Single Responsibility Principle).",
      lineNumbers: longFunctions,
      recommendation: "Break the function into smaller, well-named helper functions. Each function should do one thing and do it well.",
      reference: "Clean Code — Single Responsibility Principle",
    });
  }

  // TODO/FIXME/HACK comments (multi-language)
  const todoLines = getLangLineNumbers(code, language, LP.TODO_FIXME);
  if (todoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "TODO/FIXME/HACK comments found",
      description: "There are outstanding TODO, FIXME, or HACK comments indicating incomplete or suboptimal code that should be addressed before production.",
      lineNumbers: todoLines,
      recommendation: "Track TODOs as work items in your issue tracker. Resolve FIXMEs and HACKs before merging to main. Set a code quality gate that flags unresolved TODOs.",
      reference: "Software Engineering Best Practices",
    });
  }

  // Empty catch blocks (multi-language)
  const emptyCatchLines = getLangLineNumbers(code, language, LP.EMPTY_CATCH);
  if (emptyCatchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Empty catch block — errors silently swallowed",
      description: "Empty catch blocks silently swallow errors, making debugging extremely difficult and hiding potentially critical failures.",
      lineNumbers: emptyCatchLines,
      recommendation: "At minimum, log the error. Better: handle the error appropriately (retry, fallback, re-throw with context). Never leave a catch block empty.",
      reference: "Clean Code — Error Handling / CWE-390",
    });
  }

  // No input validation (multi-language)
  const hasValidation = /validate|validator|joi|yup|zod|class-validator|ajv|schema|sanitize|\.check\(|\.isValid\(|pydantic|marshmallow|serde|DataAnnotations|@Valid|@NotNull/gi.test(code);
  const inputLines = getLangLineNumbers(code, language, LP.INPUT_VALIDATION);
  if (inputLines.length > 0 && !hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No input validation detected",
      description: "User input is consumed but no validation library or pattern is detected. Unvalidated input is the root cause of most security vulnerabilities.",
      lineNumbers: inputLines,
      recommendation: "Use a validation library (Zod/Joi for JS, Pydantic for Python, DataAnnotations for C#, @Valid for Java) to validate and sanitize all external input.",
      reference: "OWASP Input Validation — Defense in Depth",
    });
  }

  // Debug log statements left in code (multi-language)
  const debugWords = /(?:console\.log|print|println|fmt\.Print|System\.out\.print|puts|echo|dbg!)\s*\(\s*['"](?:debug|test|here|xxx|tmp|temp|asdf|TODO)/gi;
  const debugLines = getLineNumbers(code, debugWords);
  if (debugLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Debug log statements left in code",
      description: "Debug log statements (e.g., 'debug', 'test', 'here') appear to be leftover from development and should not be in production code.",
      lineNumbers: debugLines,
      recommendation: "Remove debug log statements before committing. Use a proper logging library with log levels to control verbosity.",
      reference: "Code Review Best Practices",
    });
  }

  // Deep nesting (>4 levels)
  const deepNestLines: number[] = [];
  codeLines.forEach((line, i) => {
    const leadingSpaces = line.search(/\S/);
    if (leadingSpaces >= 16 && !/^\s*[\/*#]/.test(line) && !/^\s*$/.test(line)) {
      deepNestLines.push(i + 1);
    }
  });
  if (deepNestLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Deeply nested code (>4 levels)",
      description: "Deeply nested code is hard to read, understand, and test. It often indicates complex conditional logic that could be simplified.",
      lineNumbers: deepNestLines.slice(0, 5),
      recommendation: "Use early returns (guard clauses), extract methods, or the strategy pattern to reduce nesting depth. Aim for max 3 levels.",
      reference: "Clean Code — Guard Clauses / Flatten Arrow Code",
    });
  }

  // var usage in JavaScript/TypeScript
  if (LP.isJsTs(lang)) {
    const varPattern = /^\s*var\s+\w/gm;
    const varLines = getLineNumbers(code, varPattern);
    if (varLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "'var' keyword used instead of let/const",
        description: "'var' has function scope and is hoisted, leading to subtle bugs. Modern JavaScript should use 'let' for mutable and 'const' for immutable bindings.",
        lineNumbers: varLines,
        recommendation: "Replace 'var' with 'const' (preferred) or 'let'. Enable ESLint's no-var rule.",
        reference: "ES6+ Best Practices",
        suggestedFix: "Replace 'var' with 'const' (or 'let' if the variable is reassigned).",
      });
    }
  }

  // Mutable default arguments (Python)
  const mutableDefaultPattern = /def\s+\w+\s*\([^)]*(?:=\s*\[\]|=\s*\{\}|=\s*set\(\))/gi;
  const mutableDefaultLines = getLineNumbers(code, mutableDefaultPattern);
  if (mutableDefaultLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Mutable default argument (Python anti-pattern)",
      description: "Mutable default arguments ([], {}, set()) in Python are shared across all calls, causing unexpected behavior when mutated.",
      lineNumbers: mutableDefaultLines,
      recommendation: "Use None as default and create new mutable objects inside the function: def f(items=None): items = items or [].",
      reference: "Python Common Gotchas — Mutable Default Arguments",
    });
  }

  // Bare except / catch-all without logging (multi-language)
  const bareExceptLines = getLangLineNumbers(code, language, LP.GENERIC_CATCH);
  if (bareExceptLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Bare except / untyped catch block",
      description: "Catching all exceptions without specifying the type can mask unexpected errors (OutOfMemoryError, StackOverflow, KeyboardInterrupt).",
      lineNumbers: bareExceptLines,
      recommendation: "Catch specific exception types. In Python, use 'except ValueError' (not bare 'except:'). In Java/C#, catch specific exception classes.",
      reference: "Exception Handling Best Practices",
    });
  }

  // Type coercion risks (JavaScript ==)
  if (LP.isJsTs(lang)) {
    const looseEqualPattern = /(?<![!=<>])\s==\s(?!=)/g;
    const looseEqualLines = getLineNumbers(code, looseEqualPattern).filter(lineNum => {
      const line = codeLines[lineNum - 1] || "";
      return !(/^\s*(?:\/\/|\*|\/\*)/.test(line)) && !(/['"].*==.*['"]/.test(line));
    });
    if (looseEqualLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Loose equality (==) instead of strict (===)",
        description: "JavaScript's == operator performs type coercion, leading to unexpected results (e.g., '' == 0 is true). Always use === for predictable comparisons.",
        lineNumbers: looseEqualLines.slice(0, 5),
        recommendation: "Replace == with === and != with !==. Enable ESLint's eqeqeq rule.",
        reference: "JavaScript Equality Comparison",
        suggestedFix: "Replace '==' with '===' and '!=' with '!=='.",
      });
    }
  }

  // God class / file with too many responsibilities (multi-language)
  const functionLines = getLangLineNumbers(code, language, LP.FUNCTION_DEF);
  if (codeLines.length > 500 && functionLines.length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Large file with many functions \u2014 possible God class/module",
      description: `File has ${codeLines.length} lines and ${functionLines.length} functions. This suggests the module has too many responsibilities.`,
      recommendation: "Split into smaller, focused modules. Apply Single Responsibility Principle. Group related functions into their own files.",
      reference: "SOLID Principles — Single Responsibility",
    });
  }

  // Callback hell / deeply nested callbacks
  const callbackHellLines: number[] = [];
  codeLines.forEach((line, i) => {
    if (/\bfunction\s*\(|=>\s*\{/.test(line)) {
      const context = codeLines.slice(i, Math.min(codeLines.length, i + 5)).join("\n");
      const nestedCallbacks = (context.match(/function\s*\(|=>\s*\{/g) || []).length;
      if (nestedCallbacks >= 3) {
        callbackHellLines.push(i + 1);
      }
    }
  });
  if (callbackHellLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Callback nesting (potential callback hell)",
      description: "Multiple nested callbacks make code hard to read, maintain, and debug (the 'pyramid of doom').",
      lineNumbers: callbackHellLines.slice(0, 5),
      recommendation: "Refactor to use async/await, Promises, or extract named functions to flatten the nesting.",
      reference: "Callback Hell / Async Patterns",
    });
  }

  // Dead code indicators
  const deadCodePattern = /return\s*;?\s*\n\s*(?:const|let|var|function|if|for|while)/g;
  const deadCodeLines = getLineNumbers(code, deadCodePattern);
  if (deadCodeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potential dead code after return statement",
      description: "Code appears after a return statement and will never execute.",
      lineNumbers: deadCodeLines,
      recommendation: "Remove unreachable code. Use linter rules (no-unreachable) to prevent dead code accumulation.",
      reference: "Code Quality — Dead Code Elimination",
    });
  }

  // Hardcoded boolean parameters
  const boolParamPattern = /\w+\s*\(\s*(?:.*,\s*)?(?:true|false)\s*(?:,\s*(?:true|false)\s*)+\)/gi;
  const boolParamLines = getLineNumbers(code, boolParamPattern);
  if (boolParamLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Multiple boolean parameters (flag arguments)",
      description: "Functions called with multiple boolean arguments (e.g., doThing(true, false, true)) are unreadable at call sites.",
      lineNumbers: boolParamLines,
      recommendation: "Replace boolean flags with an options object (e.g., doThing({ verbose: true, force: false })) or separate functions.",
      reference: "Clean Code — Function Arguments",
    });
  }

  return findings;
}
