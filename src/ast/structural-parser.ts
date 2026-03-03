// ─────────────────────────────────────────────────────────────────────────────
// Structural Parser — Lightweight AST-like analysis for non-JS/TS languages
// ─────────────────────────────────────────────────────────────────────────────
// A brace/indent-aware parser that extracts function boundaries, cyclomatic
// complexity, nesting depth, dead code indicators, and parameter counts
// for Python, Rust, Go, Java, and C#.  Not a full grammar parser, but
// significantly more accurate than raw regex because it tracks scope.
// ─────────────────────────────────────────────────────────────────────────────

import type { FunctionInfo, CodeStructure } from "./types.js";

// ─── Public API ──────────────────────────────────────────────────────────────

export function analyzeStructurally(code: string, language: string): CodeStructure {
  const lines = code.split("\n");
  const totalLines = lines.length;

  const isPython = language === "python";
  const functions = isPython ? extractPythonFunctions(lines) : extractBraceFunctions(lines, language);

  const deadCodeLines = detectDeadCode(lines, language);
  const deepNestLines = detectDeepNesting(lines, isPython);
  const typeAnyLines = detectWeakTypes(lines, language);
  const imports = extractImports(lines, language);
  const classes = isPython ? extractPythonClassNames(lines) : extractBraceClassNames(lines, language);

  const fileCyclomaticComplexity = functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) || 1;
  const maxNestingDepth = functions.reduce((max, f) => Math.max(max, f.maxNestingDepth), 0);

  return {
    language,
    totalLines,
    functions,
    fileCyclomaticComplexity,
    maxNestingDepth,
    deadCodeLines,
    deepNestLines,
    typeAnyLines,
    imports,
    classes,
  };
}

// ─── Brace-Language Function Extraction (Rust, Go, Java, C#) ─────────────────

// Patterns that identify function/method declarations per language
const FUNC_PATTERNS: Record<string, RegExp> = {
  rust: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
  go: /^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)/,
  java: /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*\w[\w<>,\s[\]]*\s+(\w+)\s*\(([^)]*)\)/,
  csharp:
    /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed)\s+)*\w[\w<>,\s[\]?]*\s+(\w+)\s*\(([^)]*)\)/,
  powershell: /^\s*function\s+([\w-]+)\s*(?:\(([^)]*)\))?/,
};

function extractBraceFunctions(lines: string[], language: string): FunctionInfo[] {
  const pattern = FUNC_PATTERNS[language];
  if (!pattern) return [];

  const functions: FunctionInfo[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(pattern);
    if (match) {
      const name = match[1];
      const params = (match[2] ?? "").trim();
      let paramCount = params.length === 0 ? 0 : params.split(",").length;
      const startLine = i + 1;

      // Find the opening brace (may be on this line or next)
      let braceStart = i;
      while (braceStart < lines.length && !lines[braceStart].includes("{")) {
        braceStart++;
      }
      if (braceStart >= lines.length) {
        i++;
        continue;
      }

      // Count brace depth to find the function end
      let depth = 0;
      let endIdx = braceStart;
      for (let j = braceStart; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth <= 0) {
          endIdx = j;
          break;
        }
      }

      // PowerShell: if no inline params, look for a param() block inside the body
      if (language === "powershell" && paramCount === 0) {
        const bodySlice = lines.slice(braceStart, endIdx + 1).join("\n");
        const paramIdx = bodySlice.search(/\bparam\s*\(/i);
        if (paramIdx >= 0) {
          // Find matching closing paren using depth counting (handles nested parens from attributes)
          const openIdx = bodySlice.indexOf("(", paramIdx);
          if (openIdx >= 0) {
            let pd = 0;
            let closeIdx = -1;
            for (let c = openIdx; c < bodySlice.length; c++) {
              if (bodySlice[c] === "(") pd++;
              if (bodySlice[c] === ")") pd--;
              if (pd === 0) {
                closeIdx = c;
                break;
              }
            }
            if (closeIdx > openIdx) {
              const paramContent = bodySlice.slice(openIdx + 1, closeIdx);
              const paramVars = paramContent.match(/\$(?!true\b|false\b|null\b)\w+/gi);
              if (paramVars) paramCount = paramVars.length;
            }
          }
        }
      }

      const endLine = endIdx + 1;
      const funcLines = lines.slice(i, endIdx + 1);
      const complexity = computeComplexityFromLines(funcLines, language);
      const maxNesting = computeNestingFromLines(funcLines, false);

      functions.push({
        name,
        startLine,
        endLine,
        lineCount: endLine - startLine + 1,
        parameterCount: paramCount,
        cyclomaticComplexity: complexity,
        maxNestingDepth: maxNesting,
      });

      i = endIdx + 1;
    } else {
      i++;
    }
  }

  return functions;
}

// ─── Python Function Extraction (indent-based) ──────────────────────────────

// Use [^()]* instead of [^)]* to prevent catastrophic backtracking (ReDoS).
// The negated class excludes both open and close parens, eliminating overlap
// between the inner and outer quantifiers.
const PYTHON_FUNC = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:->.*)?:/;
// Move leading \s* inside the optional group so only one \s*
// competes for whitespace when the parenthesised base-list is absent
// (prevents polynomial backtracking — CodeQL js/polynomial-redos).
const PYTHON_CLASS = /^(\s*)class\s+(\w+)(?:\s*\([^()]*\))?\s*:/;
const PYTHON_DECORATOR = /^(\s*)@(\w[\w.]*(?:\([^()]*\))?)/;

function extractPythonFunctions(lines: string[]): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  // First pass: identify class boundaries (indent-based)
  const classRanges: Array<{ name: string; indent: number; startLine: number; endLine: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const classMatch = lines[i].match(PYTHON_CLASS);
    if (!classMatch) continue;

    const baseIndent = classMatch[1].length;
    const className = classMatch[2];
    const startLine = i + 1;

    let endIdx = i + 1;
    while (endIdx < lines.length) {
      const line = lines[endIdx];
      if (line.trim() === "" || /^\s*#/.test(line)) {
        endIdx++;
        continue;
      }
      const indent = line.search(/\S/);
      if (indent <= baseIndent) break;
      endIdx++;
    }
    classRanges.push({ name: className, indent: baseIndent, startLine, endLine: endIdx });
  }

  // Second pass: extract functions and methods with decorators
  for (let i = 0; i < lines.length; i++) {
    // Collect decorators above this line
    const decorators: string[] = [];
    let decoratorStart = i;

    // Look backwards from current position for consecutive decorators
    // (we check forward from the decorator run start instead)
    // Actually decorators precede the def, so let's check forward
    const match = lines[i].match(PYTHON_FUNC);
    if (!match) continue;

    // Scan backwards for decorators
    let k = i - 1;
    while (k >= 0) {
      const trimmed = lines[k].trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        k--;
        continue;
      }
      const decMatch = lines[k].match(PYTHON_DECORATOR);
      if (decMatch) {
        decorators.unshift(decMatch[2]); // prepend to maintain order
        decoratorStart = k;
        k--;
      } else {
        break;
      }
    }

    const baseIndent = match[1].length;
    const name = match[2];
    const isAsync = /async\s+def/.test(lines[i]);
    const params = match[3].trim();
    // Filter out 'self' and 'cls' from param count
    const paramList = params
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p !== "self" && p !== "cls");
    const paramCount = paramList.length;
    const startLine = decoratorStart + 1;

    // Walk forward to find end of function body (next line at same or lesser
    // indentation that isn't blank or a comment)
    let endIdx = i + 1;
    while (endIdx < lines.length) {
      const line = lines[endIdx];
      if (line.trim() === "" || /^\s*#/.test(line)) {
        endIdx++;
        continue;
      }
      const indent = line.search(/\S/);
      if (indent <= baseIndent) break;
      endIdx++;
    }
    // endIdx is now first line AFTER the function body
    const endLine = endIdx;
    const funcLines = lines.slice(i, endIdx);
    const complexity = computeComplexityFromLines(funcLines, "python");
    const maxNesting = computeNestingFromLines(funcLines, true);

    // Check if this function is inside a class
    const containingClass = classRanges.find((c) => i + 1 > c.startLine && i + 1 <= c.endLine && baseIndent > c.indent);

    const funcInfo: FunctionInfo = {
      name: containingClass ? `${containingClass.name}.${name}` : name,
      startLine,
      endLine,
      lineCount: endLine - startLine,
      parameterCount: paramCount,
      cyclomaticComplexity: complexity,
      maxNestingDepth: maxNesting,
      ...(decorators.length > 0 ? { decorators } : {}),
      ...(containingClass ? { className: containingClass.name } : {}),
      ...(isAsync ? { isAsync: true } : {}),
    };

    functions.push(funcInfo);
  }

  return functions;
}

// ─── Python Class Name Extraction ────────────────────────────────────────────

function extractPythonClassNames(lines: string[]): string[] {
  const classes: string[] = [];
  for (const line of lines) {
    const match = line.match(PYTHON_CLASS);
    if (match) classes.push(match[2]);
  }
  return classes;
}

// ─── Brace-Language Class Name Extraction ────────────────────────────────────

const CLASS_PATTERNS: Record<string, RegExp> = {
  java: /^\s*(?:(?:public|private|protected|abstract|final|static)\s+)*class\s+(\w+)/,
  csharp: /^\s*(?:(?:public|private|protected|internal|abstract|sealed|static|partial)\s+)*class\s+(\w+)/,
  rust: /^\s*(?:pub\s+)?struct\s+(\w+)/,
  go: /^\s*type\s+(\w+)\s+struct\b/,
  powershell: /^\s*class\s+(\w+)/,
};

function extractBraceClassNames(lines: string[], language: string): string[] {
  const pattern = CLASS_PATTERNS[language];
  if (!pattern) return [];
  const classes: string[] = [];
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) classes.push(match[1]);
  }
  return classes;
}

// ─── Cyclomatic Complexity from Source Lines ─────────────────────────────────

const DECISION_POINTS: Record<string, RegExp> = {
  python: /\b(if|elif|for|while|except|and|or|assert)\b|\bif\b.*\belse\b|\bfor\b.*\bin\b.*\bif\b/g,
  rust: /\b(if|else\s+if|for|while|loop|match|=>|&&|\|\||\.unwrap_or|\.map_or)\b/g,
  go: /\b(if|else\s+if|for|switch|case|select|&&|\|\|)\b/g,
  java: /\b(if|else\s+if|for|while|do|case|catch|\?|&&|\|\|)\b/g,
  csharp: /\b(if|else\s+if|for|foreach|while|do|case|catch|\?|&&|\|\|)\b/g,
  powershell: /\b(if|elseif|foreach|for|while|do|switch|catch|\-and|\-or)\b/g,
};

function computeComplexityFromLines(lines: string[], language: string): number {
  let complexity = 1; // base path
  const pattern = DECISION_POINTS[language];
  if (!pattern) return complexity;

  for (const line of lines) {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("/*"))
      continue;

    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let _match;
    while ((_match = pattern.exec(line)) !== null) {
      complexity++;
    }
  }

  return complexity;
}

// ─── Nesting Depth from Source Lines ─────────────────────────────────────────

function computeNestingFromLines(lines: string[], isPython: boolean): number {
  if (isPython) {
    // Track indent levels as nesting
    const baseIndent = lines[0]?.search(/\S/) ?? 0;
    let maxDepth = 0;
    for (const line of lines) {
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      const indent = line.search(/\S/);
      // Each 4-space indent = 1 level (adjust for base)
      const depth = Math.floor((indent - baseIndent) / 4);
      if (depth > maxDepth) maxDepth = depth;
    }
    return maxDepth;
  }

  // Brace-based nesting
  let depth = 0;
  let maxDepth = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
      }
      if (ch === "}") depth--;
    }
  }
  // Subtract 1 because the function body's own opening brace isn't "nesting"
  return Math.max(0, maxDepth - 1);
}

// ─── Dead Code Detection ────────────────────────────────────────────────────

function detectDeadCode(lines: string[], language: string): number[] {
  const deadLines: number[] = [];
  const isPython = language === "python";

  // Language-specific return/throw/break patterns
  const terminalPatterns = isPython
    ? /^\s*(return|raise|break|continue|sys\.exit|exit)\b/
    : /^\s*(return|throw|break|continue|panic!?|Environment\.Exit|System\.exit|os\.Exit)\s*[;(\s]/;

  // Patterns that reset unreachable state — these introduce a new reachable
  // branch at the same scope (e.g. else, case, catch, finally).
  const scopeResetPatterns = isPython
    ? /^\s*(else\s*:|elif\s|except\s|finally\s*:|case\s)/
    : /^\s*(else\s*\{|else\s*$|else\s+if\s*\(|case\s|default\s*:|catch\s*[\s(]|finally\s*\{)/;

  // Brace-tracking for scoped dead code analysis
  let depth = 0;
  let unreachableAtDepth = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines, comments
    if (
      trimmed === "" ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    )
      continue;

    if (!isPython) {
      // Track brace depth
      for (const ch of line) {
        if (ch === "{") depth++;
        if (ch === "}") {
          if (unreachableAtDepth === depth) {
            unreachableAtDepth = -1; // scope ended, reset
          }
          depth--;
        }
      }
    }

    // Scope-reset: else/case/catch/finally introduce a new reachable branch
    if (unreachableAtDepth >= 0 && scopeResetPatterns.test(trimmed)) {
      unreachableAtDepth = -1;
    }

    // If we're in unreachable territory at this scope
    if (unreachableAtDepth >= 0 && (isPython || depth >= unreachableAtDepth)) {
      // Closing brace itself is not "dead code"
      if (trimmed !== "}") {
        // For Python, check if we've dedented back out
        if (isPython) {
          // Reset if we're at a new indent level
          const indent = line.search(/\S/);
          if (indent <= (unreachableAtDepth - 1) * 4) {
            unreachableAtDepth = -1;
            continue;
          }
        }
        deadLines.push(i + 1);
      }
      continue;
    }

    // Check if this line is a terminal statement
    if (terminalPatterns.test(trimmed)) {
      // Skip when the terminal also opens a new scope on the same line
      // (e.g., `return func(...) {` in Go, `return std::all_of(..., [](char c) {` in C++).
      // The `return` is returning a closure/lambda, not terminating the scope.
      if (!isPython && line.includes("{") && !line.trimEnd().endsWith(";")) {
        continue;
      }

      // Skip terminals inside braceless control structures (C#: `if (...)\n    return ...;`)
      // The next statement after the braceless block IS reachable.
      if (!isPython) {
        let prevNonBlank = "";
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const pt = lines[j].trim();
          if (pt.length > 0 && !pt.startsWith("//") && !pt.startsWith("*") && !pt.startsWith("#")) {
            prevNonBlank = pt;
            break;
          }
        }
        if (/^\s*(?:if|else\s+if|for|while)\s*\(/.test(prevNonBlank) && !prevNonBlank.endsWith("{")) {
          continue;
        }
      }

      if (isPython) {
        const indent = line.search(/\S/);
        unreachableAtDepth = Math.floor(indent / 4) + 1;
      } else {
        unreachableAtDepth = depth;
      }
    }
  }

  return deadLines;
}

// ─── Deep Nesting Detection ─────────────────────────────────────────────────

function detectDeepNesting(lines: string[], isPython: boolean): number[] {
  const deepLines: number[] = [];

  if (isPython) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      const indent = line.search(/\S/);
      if (indent >= 20) {
        // 5+ levels of indentation at 4 spaces each
        deepLines.push(i + 1);
      }
    }
    return deepLines;
  }

  // Brace depth tracking
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    const trimmed = line.trim();
    if (depth > 5 && trimmed !== "" && !trimmed.startsWith("//")) {
      deepLines.push(i + 1);
    }
  }

  return deepLines;
}

// ─── Weak Type Detection ────────────────────────────────────────────────────

function detectWeakTypes(lines: string[], language: string): number[] {
  const weakLines: number[] = [];

  const patterns: Record<string, RegExp> = {
    python: /\bAny\b|\btyping\.Any\b|\bcast\s*\(/,
    rust: /\bunsafe\b|\bas\s+\*(?:const|mut)\b/,
    // Go's interface{} and any are idiomatic — only flag unsafe.Pointer
    go: /\bunsafe\.Pointer\b/,
    java: /\bObject\b(?!\s*\.class)|\bClass<\?>/,
    csharp: /\bdynamic\b|\bobject\b/,
    powershell: /\[object\]|\[psobject\]|\[System\.Object\]/,
  };

  const pattern = patterns[language];
  if (!pattern) return weakLines;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) continue;
    if (pattern.test(lines[i])) {
      weakLines.push(i + 1);
    }
  }

  return weakLines;
}

// ─── Import Extraction ───────────────────────────────────────────────────────

/**
 * Extract imported module/package names from source code.
 * Handles import syntax for Python, Go, Java, C#, and Rust.
 */
function extractImports(lines: string[], language: string): string[] {
  const imports: string[] = [];
  const patterns: Record<string, RegExp[]> = {
    python: [
      /^\s*import\s+([\w.]+)/, // import os, import os.path
      /^\s*from\s+([\w.]+)\s+import/, // from flask import Flask
    ],
    go: [
      /^\s*import\s+"([^"]+)"/, // import "fmt"
      /^\s*"([^"]+)"\s*$/, // inside import ( ... ) block
    ],
    java: [
      /^\s*import\s+(?:static\s+)?([\w.]+)/, // import com.example.Foo
    ],
    csharp: [
      /^\s*using\s+([\w.]+)\s*;/, // using System.IO;
    ],
    rust: [
      /^\s*use\s+([\w:]+)/, // use std::io
      /^\s*extern\s+crate\s+(\w+)/, // extern crate serde
    ],
    powershell: [
      /^\s*(?:Import-Module|using\s+module)\s+([\w.\\/-]+)/, // Import-Module Az.Accounts
      /^\s*#Requires\s+-Module\s+([\w.]+)/, // #Requires -Module PSScriptAnalyzer
    ],
  };

  const langPatterns = patterns[language];
  if (!langPatterns) return imports;

  let inGoImportBlock = false;
  let inPythonMultiImport = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle Go multi-line import blocks: import ( ... )
    if (language === "go") {
      if (/^\s*import\s*\(\s*$/.test(line)) {
        inGoImportBlock = true;
        continue;
      }
      if (inGoImportBlock) {
        if (trimmed === ")") {
          inGoImportBlock = false;
          continue;
        }
        const m = trimmed.match(/^"([^"]+)"$/);
        if (m) imports.push(m[1]);
        continue;
      }
    }

    // Handle Python multi-line imports: from x import (\n  a,\n  b\n)
    if (language === "python") {
      if (inPythonMultiImport) {
        if (trimmed.includes(")")) {
          inPythonMultiImport = false;
        }
        continue;
      }
      // from x import (
      if (/^\s*from\s+[\w.]+\s+import\s*\(/.test(line) && !trimmed.includes(")")) {
        inPythonMultiImport = true;
        // Still capture the module name
        const m = line.match(/^\s*from\s+([\w.]+)\s+import/);
        if (m) imports.push(m[1]);
        continue;
      }
    }

    for (const pattern of langPatterns) {
      const match = line.match(pattern);
      if (match) {
        imports.push(match[1]);
        break;
      }
    }
  }

  return imports;
}
