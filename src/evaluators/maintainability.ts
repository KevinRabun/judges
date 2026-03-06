import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, isCommentLine, isIaCTemplate } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeMaintainability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "MAINT";
  const _lang = getLangFamily(language);

  // Weak / unsafe type usage (any, object, dynamic, interface{}, unsafe)
  const anyLines = getLangLineNumbers(code, language, LP.WEAK_TYPE);
  if (anyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Weak or unsafe type usage detected",
      description: `Found ${anyLines.length} occurrence(s) of weak type usage (e.g., 'any' in TypeScript, 'dynamic'/'object' in C#, 'interface{}' in Go, unsafe blocks in Rust). Weak types bypass the type system.`,
      lineNumbers: anyLines.slice(0, 10),
      recommendation:
        "Replace weak types with specific types: use 'unknown' with type guards (TS), generics (Java/C#), concrete types (Go), safe wrappers (Rust).",
      reference: "Type Safety Best Practices / Clean Code",
      suggestedFix:
        "Replace 'any' with 'unknown' and add a type guard, or define a specific interface/type that describes the expected shape.",
      confidence: 0.9,
    });
  }

  // Magic numbers
  const _magicNumberPattern = /(?<![.\w])(?:0x[0-9a-f]{4,}|\d{4,})(?!\s*[;:)\]}]?\s*\/\/|\.\d|px|em|rem|ms|%|e\+)/gi;
  const lines = code.split("\n");
  const magicLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    // Skip imports, comments, and obvious non-magic contexts
    if (/^\s*\/\/|^\s*\*|^\s*import|^\s*#|\.padStart|\.padEnd|\.slice|ruleNum|ruleId|String\(/.test(line)) continue;
    if (/(?<![.\w"'`])(?:86400|3600|1000|5000|8080|3000|4200|8000|1024|2048|4096)\b/.test(line)) {
      // Skip numbers inside string literals (e.g., ":8080", "localhost:3000")
      if (/["'`][^"'`]*\b(?:86400|3600|1000|5000|8080|3000|4200|8000|1024|2048|4096)\b[^"'`]*["'`]/.test(line))
        continue;
      // Skip named constant declarations (e.g., const TIMEOUT_MS = 3600, int port = 8080)
      if (
        /(?:const|let|var|val|final|static|#define|pub\s+(?:const|static)|int|long|unsigned|double|float|auto|size_t|[su]?int\d+_t)\s+\w{2,}\s*[:=].*\b(?:86400|3600|1000|5000|8080|3000|4200|8000|1024|2048|4096)\b/.test(
          line,
        )
      )
        continue;
      // Skip keyword arguments / named parameters (e.g., pool_recycle=3600, timeout=5000)
      if (/[a-zA-Z_]\w{2,}\s*=\s*\b(?:86400|3600|1000|5000|8080|3000|4200|8000|1024|2048|4096)\b/.test(line)) continue;
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
      recommendation:
        "Extract magic numbers into named constants (e.g., const HEARTBEAT_INTERVAL_MS = 5000). Use enums for related sets of values.",
      reference: "Clean Code: Chapter 17 — Smells and Heuristics (G25)",
      suggestedFix:
        "Extract each numeric literal into a descriptive const (e.g., `const TIMEOUT_MS = 5000;`) and reference the constant instead.",
      confidence: 0.85,
    });
  }

  // Decimal magic numbers in arithmetic contexts (e.g., 0.5, 2.99, 0.75)
  // These are business-logic constants that should be named for clarity.
  const decimalMagicLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (/^\s*\/\/|^\s*\*|^\s*import|^\s*#/.test(line)) continue;
    // Skip named constant declarations
    if (/(?:const|let|var|val|final|static|#define)\s+[A-Z_]/i.test(line)) continue;
    // Match decimal literals in arithmetic context (*, +, -, /)
    if (/[*+\-/]\s*\d+\.\d+|\d+\.\d+\s*[*+\-/]/.test(line)) {
      // Exclude trivial values (0.0, 1.0) and version strings (x.y.z)
      if (/\b(?:0\.0|1\.0)\b/.test(line) && !/\b\d+\.\d{2,}\b/.test(line)) continue;
      if (/["'`]\d+\.\d+\.\d+["'`]/.test(line)) continue;
      decimalMagicLines.push(i + 1);
    }
  }
  if (decimalMagicLines.length > 0) {
    // Merge with existing magic number finding or create new one
    if (magicLines.length > 0) {
      // Already reported magic numbers — add decimal lines to existing finding
      const existingFinding = findings.find((f) => f.ruleId === `${prefix}-002`);
      if (existingFinding && existingFinding.lineNumbers) {
        existingFinding.lineNumbers.push(...decimalMagicLines.slice(0, 5));
        existingFinding.description = existingFinding.description.replace(
          /Found \d+ magic number/,
          `Found ${magicLines.length + decimalMagicLines.length} magic number`,
        );
      }
    } else {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Magic numbers detected",
        description: `Found ${decimalMagicLines.length} magic number(s) — decimal literals used directly in arithmetic without named constants.`,
        lineNumbers: decimalMagicLines.slice(0, 5),
        recommendation:
          "Extract magic numbers into named constants (e.g., const BASE_SHIPPING_RATE = 0.5, const LOYALTY_DISCOUNT = 0.25).",
        reference: "Clean Code: Chapter 17 — Smells and Heuristics (G25)",
        suggestedFix:
          "Extract each decimal literal into a descriptive const (e.g., `const SHIPPING_RATE = 0.5;`) and reference the constant instead.",
        confidence: 0.8,
      });
    }
  }

  // TODO / FIXME / HACK / XXX comments (multi-language comment styles)
  const todoLines = getLangLineNumbers(code, language, LP.TODO_FIXME, { skipComments: false });
  if (todoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Technical debt markers (TODO/FIXME/HACK) found",
      description: `Found ${todoLines.length} technical debt marker(s). These indicate known problems or shortcuts that haven't been addressed.`,
      lineNumbers: todoLines,
      recommendation:
        "Convert TODO/FIXME comments into tracked issues in your project management tool. Resolve HACK comments with proper implementations.",
      reference: "Clean Code: Technical Debt Management",
      suggestedFix:
        "Create a tracked issue for each TODO/FIXME, then either resolve the underlying problem or replace the comment with a link to the issue.",
      confidence: 0.95,
    });
  }

  // var keyword usage (JS/TS)
  if (["typescript", "javascript", "ts", "js"].includes(language.toLowerCase())) {
    const varPattern = /\bvar\s+\w/g;
    const commentLine = /^\s*(?:\/\/|\/\*|\*|\*\/)/;
    const varLines = getLineNumbers(code, varPattern).filter((ln) => {
      const line = lines[ln - 1];
      return line !== undefined && !commentLine.test(line);
    });
    if (varLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "'var' declarations reduce maintainability",
        description: `Found ${varLines.length} 'var' declaration(s). 'var' has function scope and hoisting, which makes code harder to reason about and can lead to subtle bugs.`,
        lineNumbers: varLines,
        recommendation:
          "Use 'const' for values that don't change and 'let' for values that do. Never use 'var' in modern JavaScript/TypeScript.",
        reference: "ESLint no-var rule / Modern JavaScript Best Practices",
        suggestedFix:
          "Replace each 'var' with 'const' (if never reassigned) or 'let' (if reassigned) to get proper block scoping.",
        confidence: 0.95,
      });
    }
  }

  // Very long functions (> 50 lines between function declaration and closing)
  const funcDefLines = getLangLineNumbers(code, language, LP.FUNCTION_DEF);
  const funcCount = funcDefLines.length;
  const totalLines = lines.length;
  if (funcCount > 0 && totalLines / funcCount > 60) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Functions may be too long",
      description: `Average function length is approximately ${Math.round(totalLines / funcCount)} lines. Long functions are harder to understand, test, and maintain.`,
      recommendation:
        "Break long functions into smaller, focused units. Each function should do one thing and do it well. Aim for functions under 30 lines.",
      reference: "Clean Code: Functions (Chapter 3)",
      suggestedFix:
        "Identify distinct logical steps within long functions and extract each into a well-named helper function.",
      confidence: 0.75,
    });
  }

  // Deep nesting (5+ levels of indentation — 4 levels is the natural minimum for async/try/loop/condition)
  const deepNestLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const indentMatch = lines[i].match(/^(\s+)\S/);
    if (indentMatch) {
      const indent = indentMatch[1].replace(/\t/g, "    ").length;
      if (indent >= 20) {
        // 5+ levels at 4 spaces each (4 levels is the natural minimum for async/try/loop/condition)
        deepNestLines.push(i + 1);
      }
    }
  }
  if (deepNestLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Deeply nested code detected",
      description: `Found ${deepNestLines.length} line(s) with 5+ levels of nesting. Deep nesting increases cognitive complexity and makes code harder to follow.`,
      lineNumbers: deepNestLines.slice(0, 5),
      recommendation:
        "Use early returns (guard clauses), extract nested logic into helper functions, or use functional patterns (map, filter, reduce) to flatten nesting.",
      reference: "Cognitive Complexity (SonarSource) / Clean Code",
      suggestedFix:
        "Add guard-clause early returns at the top of each branch to invert conditions and reduce nesting by one or more levels.",
      confidence: 0.85,
    });
  }

  // Commented-out code
  const commentedCodePattern =
    /\/\/\s*(?:const|let|var|function|class|import|export|if|for|while|return|app\.|router\.)\s/g;
  const commentedCodeLines = getLineNumbers(code, commentedCodePattern, { skipComments: false });
  if (commentedCodeLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Commented-out code detected",
      description: `Found ${commentedCodeLines.length} instances of what appears to be commented-out code. Dead code adds noise and confusion for maintainers.`,
      lineNumbers: commentedCodeLines.slice(0, 5),
      recommendation:
        "Remove commented-out code. Use version control (git) to retrieve old code if needed. Dead code reduces readability.",
      reference: "Clean Code: Comments (Chapter 4)",
      suggestedFix: "Delete the commented-out lines; rely on git history to recover old code if ever needed.",
      confidence: 0.8,
    });
  }

  // Excessive file length
  // IaC templates (Bicep/Terraform/ARM) typically define multiple resources,
  // parameters, and outputs in a single file — 500+ lines is common and
  // expected.  Use a higher threshold to avoid false positives.
  const fileLengthLimit = isIaCTemplate(code) ? 600 : 300;
  if (totalLines > fileLengthLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "File is excessively long",
      description: `File is ${totalLines} lines long. Large files are harder to navigate, understand, and test. They often indicate multiple responsibilities.`,
      recommendation:
        "Break the file into smaller modules with single responsibilities. Extract related functionality into separate files/classes.",
      reference: "Single Responsibility Principle / Clean Architecture",
      suggestedFix:
        "Split the file by responsibility—move each logical group of exports into its own module and re-export from an index file.",
      confidence: 0.9,
    });
  }

  // Inconsistent naming conventions
  const camelCaseVars = (code.match(/(?:const|let|var)\s+[a-z][a-zA-Z0-9]*\s*[:=]/g) || []).length;
  const snakeCaseVars = (code.match(/(?:const|let|var)\s+[a-z][a-z0-9]*_[a-z][a-z0-9_]*\s*[:=]/g) || []).length;
  if (camelCaseVars > 3 && snakeCaseVars > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inconsistent naming conventions (mixed camelCase and snake_case)",
      description: `Found both camelCase (${camelCaseVars}) and snake_case (${snakeCaseVars}) variable names. Inconsistent naming makes the codebase harder to navigate.`,
      recommendation:
        "Adopt a single naming convention for the project. In JavaScript/TypeScript, use camelCase for variables and functions, PascalCase for classes and types.",
      reference: "Clean Code: Meaningful Names (Chapter 2)",
      suggestedFix:
        "Rename snake_case variables to camelCase (or vice-versa) to match the project's dominant convention, then enable a linter rule to enforce it.",
      confidence: 0.75,
    });
  }

  // Functions with excessive parameters (>5)
  const manyParamsPattern = /function\s+\w+\s*\(\s*(?:\w+\s*[,:]\s*){5,}/g;
  const arrowManyParams = /(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(\s*(?:\w+\s*[,:]\s*){5,}/g;
  const manyParamLines = [...getLineNumbers(code, manyParamsPattern), ...getLineNumbers(code, arrowManyParams)];
  if (manyParamLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Functions with too many parameters",
      description: `Found ${manyParamLines.length} function(s) with more than 5 parameters. Long parameter lists are hard to remember, easy to misorder, and indicate the function does too much.`,
      lineNumbers: manyParamLines,
      recommendation:
        "Use an options object parameter: func({ name, age, ...opts }). This is self-documenting, order-independent, and extensible.",
      reference: "Clean Code: Functions (Chapter 3) / Code Complete",
      suggestedFix:
        "Group related parameters into an options/config object (e.g., `function create(opts: CreateOptions)`) and destructure inside the function.",
      confidence: 0.85,
    });
  }

  // Single-letter variable names (outside loops)
  const _singleLetterVarPattern = /(?:const|let|var)\s+([a-zA-Z])\s*[:=]/g;
  const singleLetterLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (/\b(?:for|while)\s*\(/.test(line)) continue; // skip loop counters
    if (
      /(?:const|let|var)\s+[a-zA-Z]\s*[:=]/.test(line) &&
      !/(?:const|let|var)\s+[a-zA-Z]\s*[:=].*(?:=>|\bfunction\b)/.test(line)
    ) {
      singleLetterLines.push(i + 1);
    }
  }
  if (singleLetterLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Single-letter variable names reduce readability",
      description: `Found ${singleLetterLines.length} single-letter variable declaration(s) outside of loop counters. Cryptic names force readers to track variable meaning mentally.`,
      lineNumbers: singleLetterLines.slice(0, 5),
      recommendation:
        "Use descriptive variable names that reveal intent: 'user' instead of 'u', 'index' instead of 'i' (outside loops). Good names are self-documenting.",
      reference: "Clean Code: Meaningful Names (Chapter 2)",
      suggestedFix:
        "Rename single-letter variables to descriptive names that convey purpose (e.g., rename `x` to `userCount`).",
      confidence: 0.75,
    });
  }

  // Unused imports heuristic (ES/TS module syntax: import { x } from "...")
  // Use per-line matching to avoid cross-line false positives with Python's `from X import Y`
  const unusedImportLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const importMatch = /import\s+(?:\{([^}]+)\}|(\w+))\s+from/.exec(line);
    if (!importMatch) continue;
    const importedNames = (importMatch[1] || importMatch[2] || "")
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim(),
      )
      .filter(Boolean);
    for (const name of importedNames) {
      if (!name || name.length === 0) continue;
      // Count occurrences beyond the import line itself
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const usageCount = (code.match(new RegExp(`\\b${escapedName}\\b`, "g")) || []).length;
      if (usageCount <= 1) {
        unusedImportLines.push(i + 1);
        break; // one finding per import line is enough
      }
    }
  }
  if (unusedImportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Potentially unused imports detected",
      description: `Found ${unusedImportLines.length} import statement(s) where imported names appear only once (in the import itself). Unused imports increase bundle size and add noise.`,
      lineNumbers: unusedImportLines.slice(0, 5),
      recommendation:
        "Remove unused imports. Enable ESLint no-unused-vars and TypeScript noUnusedLocals. Most editors can auto-remove unused imports on save.",
      reference: "ESLint no-unused-vars / TypeScript Best Practices",
      suggestedFix:
        "Delete the unused import statements, or run your editor's 'Organize Imports' command to auto-remove them.",
      confidence: 0.75,
    });
  }

  // Duplicate string literals
  // IaC templates idiomatically repeat tag values, location references, and
  // SKU strings across multiple resources — this is expected, not a DRY
  // violation.  Skip the check entirely for IaC files.
  if (!isIaCTemplate(code)) {
    const stringLiterals: Record<string, number> = {};
    const stringLiteralPattern = /["'`]([^"'`]{10,})["'`]/g;
    let strMatch;
    while ((strMatch = stringLiteralPattern.exec(code)) !== null) {
      const val = strMatch[1];
      // Skip format-template strings containing placeholders — these are
      // intentionally repeated in different contexts.
      if (/\{[\w:,.]*\}|%[sdifFeEgGcrbox%]|\$\{/.test(val)) continue;
      // Skip strings that are purely whitespace / paragraph spacing
      if (/^\s+$/.test(val)) continue;
      stringLiterals[val] = (stringLiterals[val] || 0) + 1;
    }
    const duplicateStrings = Object.entries(stringLiterals).filter(([, count]) => count >= 3);
    if (duplicateStrings.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "low",
        title: "Duplicate string literals — extract to constants",
        description: `Found ${duplicateStrings.length} string value(s) repeated 3+ times. Duplicate strings are easy to typo and hard to update consistently.`,
        recommendation:
          "Extract repeated strings into named constants. This makes updates a single-point change and prevents typos.",
        reference: "DRY Principle / Clean Code",
        suggestedFix:
          "Create a shared constants file and export each repeated string as a named const, then import and use the constant everywhere.",
        confidence: 0.8,
      });
    }
  }

  return findings;
}
