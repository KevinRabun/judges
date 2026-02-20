import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeSoftwarePractices(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SWDEV";

  // TypeScript 'any' type usage
  const anyTypePattern = /:\s*any\b|as\s+any\b|<any>/gi;
  const anyLines = getLineNumbers(code, anyTypePattern);
  if (anyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "TypeScript 'any' type usage",
      description: "'any' type defeats the purpose of TypeScript's type system, hiding potential runtime errors and making refactoring unsafe.",
      lineNumbers: anyLines,
      recommendation: "Replace 'any' with specific types, generics, or 'unknown' (which requires type narrowing before use). Enable 'noImplicitAny' in tsconfig.json.",
      reference: "TypeScript Best Practices / Clean Code",
    });
  }

  // @ts-ignore usage
  const tsIgnorePattern = /@ts-ignore|@ts-nocheck/gi;
  const tsIgnoreLines = getLineNumbers(code, tsIgnorePattern);
  if (tsIgnoreLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "TypeScript error suppression",
      description: "@ts-ignore and @ts-nocheck suppress compiler errors that may indicate real bugs. This weakens type safety.",
      lineNumbers: tsIgnoreLines,
      recommendation: "Fix the underlying type error instead of suppressing it. If suppression is truly necessary, use @ts-expect-error with a comment explaining why.",
      reference: "TypeScript Strict Mode Best Practices",
    });
  }

  // Magic numbers
  const codeLines = code.split("\n");
  const magicNumberPattern = /(?:===?|!==?|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|length|port|interval)\s*[:=]\s*\d{3,}/gi;
  // Filter out common well-known numbers (HTTP status codes, ports, permissions, etc.)
  const wellKnownNumbers = /\b(?:200|201|204|301|302|304|400|401|403|404|405|409|422|429|500|502|503|504|80|443|8080|3000|8443|3001|5432|27017|6379|0o?[0-7]{3,4}|0x[0-9a-f]+|1000|1024|255|256|65535|1e[3-9])\b/gi;
  const magicLines = getLineNumbers(code, magicNumberPattern).filter(lineNum => {
    const line = codeLines[lineNum - 1] || "";
    return !wellKnownNumbers.test(line);
  });
  if (magicLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Magic numbers detected",
      description: "Numeric literals used directly in code without named constants are harder to understand, maintain, and change consistently.",
      lineNumbers: magicLines,
      recommendation: "Extract magic numbers into named constants (e.g., const MAX_RETRIES = 3, const TIMEOUT_MS = 5000) for clarity and maintainability.",
      reference: "Clean Code (Robert C. Martin) — Chapter 17",
    });
  }

  // Very long functions (>50 lines)
  let funcStart = -1;
  let braceDepth = 0;
  const longFunctions: number[] = [];
  for (let i = 0; i < codeLines.length; i++) {
    if (/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/.test(codeLines[i])) {
      if (braceDepth === 0) funcStart = i;
    }
    braceDepth += (codeLines[i].match(/\{/g) || []).length;
    braceDepth -= (codeLines[i].match(/\}/g) || []).length;
    if (braceDepth === 0 && funcStart >= 0) {
      if (i - funcStart > 50) {
        longFunctions.push(funcStart + 1);
      }
      funcStart = -1;
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

  // TODO/FIXME/HACK comments
  const todoPattern = /\/\/\s*(?:TODO|FIXME|HACK|XXX|TEMP|WORKAROUND)\b/gi;
  const todoLines = getLineNumbers(code, todoPattern);
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

  // Empty catch blocks
  const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/gi;
  const emptyCatchLines = getLineNumbers(code, emptyCatchPattern);
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

  // No input validation
  const hasValidation = /validate|validator|joi|yup|zod|class-validator|ajv|schema|sanitize|\.check\(|\.isValid\(/gi.test(code);
  const hasUserInput = /req\.body|req\.params|req\.query|request\.body|input|formData|event\.body/gi.test(code);
  if (hasUserInput && !hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No input validation detected",
      description: "User input is consumed (req.body, req.params, etc.) but no validation library or pattern is detected. Unvalidated input is the root cause of most security vulnerabilities.",
      recommendation: "Use a validation library (Zod, Joi, Yup, class-validator) to validate and sanitize all external input at the boundary. Define schemas for all API request bodies.",
      reference: "OWASP Input Validation — Defense in Depth",
    });
  }

  // Console.log for debugging left in code
  const debugLogPattern = /console\.log\s*\(\s*['"](?:debug|test|here|xxx|tmp|temp|asdf|TODO)/gi;
  const debugLines = getLineNumbers(code, debugLogPattern);
  if (debugLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Debug console.log statements left in code",
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
  const varPattern = /^\s*var\s+\w/gm;
  const varLines = getLineNumbers(code, varPattern);
  if (varLines.length > 0 && (language === "javascript" || language === "typescript" || language === "jsx" || language === "tsx")) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "'var' keyword used instead of let/const",
      description: "'var' has function scope and is hoisted, leading to subtle bugs. Modern JavaScript should use 'let' for mutable and 'const' for immutable bindings.",
      lineNumbers: varLines,
      recommendation: "Replace 'var' with 'const' (preferred) or 'let'. Enable ESLint's no-var rule.",
      reference: "ES6+ Best Practices",
    });
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

  // Bare except / catch-all without logging
  const bareExceptPattern = /except\s*:|catch\s*\{|catch\s*\(\s*\)/gi;
  const bareExceptLines = getLineNumbers(code, bareExceptPattern);
  if (bareExceptLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Bare except / untyped catch block",
      description: "Catching all exceptions without specifying the type can mask unexpected errors (OutOfMemoryError, StackOverflow, KeyboardInterrupt).",
      lineNumbers: bareExceptLines,
      recommendation: "Catch specific exception types. In Python, use 'except Exception' at minimum (not bare 'except:'). In Java, catch specific exception classes.",
      reference: "Exception Handling Best Practices",
    });
  }

  // Type coercion risks (JavaScript ==)
  // More precise pattern: match == but exclude ===, !==, ==>, arrow functions, and template literals
  const looseEqualPattern = /(?<![!=<>])\s==\s(?!=)/g;
  const looseEqualLines = getLineNumbers(code, looseEqualPattern).filter(lineNum => {
    const line = codeLines[lineNum - 1] || "";
    // Exclude lines that are comments, strings with CSS selectors, or template literals
    return !(/^\s*(?:\/\/|\*|\/\*)/.test(line)) && !(/['"].*==.*['"]/.test(line));
  });
  if (looseEqualLines.length > 0 && (language === "javascript" || language === "typescript" || language === "jsx" || language === "tsx")) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Loose equality (==) instead of strict (===)",
      description: "JavaScript's == operator performs type coercion, leading to unexpected results (e.g., '' == 0 is true). Always use === for predictable comparisons.",
      lineNumbers: looseEqualLines.slice(0, 5),
      recommendation: "Replace == with === and != with !==. Enable ESLint's eqeqeq rule.",
      reference: "JavaScript Equality Comparison",
    });
  }

  // God class / file with too many responsibilities
  const classCount = (code.match(/\bclass\s+\w+/g) || []).length;
  const functionCount = (code.match(/(?:function\s+\w+|=>\s*\{)/g) || []).length;
  if (codeLines.length > 500 && functionCount > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Large file with many functions — possible God class/module",
      description: `File has ${codeLines.length} lines and ${functionCount} functions. This suggests the module has too many responsibilities.`,
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
