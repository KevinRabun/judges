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

export function analyzeStructurally(
  code: string,
  language: string
): CodeStructure {
  const lines = code.split("\n");
  const totalLines = lines.length;

  const isPython = language === "python";
  const functions = isPython
    ? extractPythonFunctions(lines)
    : extractBraceFunctions(lines, language);

  const deadCodeLines = detectDeadCode(lines, language);
  const deepNestLines = detectDeepNesting(lines, isPython);
  const typeAnyLines = detectWeakTypes(lines, language);

  const fileCyclomaticComplexity =
    functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) || 1;
  const maxNestingDepth = functions.reduce(
    (max, f) => Math.max(max, f.maxNestingDepth),
    0
  );

  return {
    language,
    totalLines,
    functions,
    fileCyclomaticComplexity,
    maxNestingDepth,
    deadCodeLines,
    deepNestLines,
    typeAnyLines,
  };
}

// ─── Brace-Language Function Extraction (Rust, Go, Java, C#) ─────────────────

// Patterns that identify function/method declarations per language
const FUNC_PATTERNS: Record<string, RegExp> = {
  rust: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
  go: /^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)/,
  java: /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*\w[\w<>,\s\[\]]*\s+(\w+)\s*\(([^)]*)\)/,
  csharp: /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed)\s+)*\w[\w<>,\s\[\]\?]*\s+(\w+)\s*\(([^)]*)\)/,
};

function extractBraceFunctions(
  lines: string[],
  language: string
): FunctionInfo[] {
  const pattern = FUNC_PATTERNS[language];
  if (!pattern) return [];

  const functions: FunctionInfo[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(pattern);
    if (match) {
      const name = match[1];
      const params = match[2].trim();
      const paramCount = params.length === 0 ? 0 : params.split(",").length;
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

const PYTHON_FUNC =
  /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?:->.*)?:/;

function extractPythonFunctions(lines: string[]): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(PYTHON_FUNC);
    if (!match) continue;

    const baseIndent = match[1].length;
    const name = match[2];
    const params = match[3].trim();
    // Filter out 'self' and 'cls' from param count
    const paramList = params
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p !== "self" && p !== "cls");
    const paramCount = paramList.length;
    const startLine = i + 1;

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

    functions.push({
      name,
      startLine,
      endLine,
      lineCount: endLine - startLine,
      parameterCount: paramCount,
      cyclomaticComplexity: complexity,
      maxNestingDepth: maxNesting,
    });
  }

  return functions;
}

// ─── Cyclomatic Complexity from Source Lines ─────────────────────────────────

const DECISION_POINTS: Record<string, RegExp> = {
  python:
    /\b(if|elif|for|while|except|and|or|assert)\b|\bif\b.*\belse\b/g,
  rust:
    /\b(if|else\s+if|for|while|loop|match|=>|&&|\|\||\.unwrap_or|\.map_or)\b/g,
  go:
    /\b(if|else\s+if|for|switch|case|select|&&|\|\|)\b/g,
  java:
    /\b(if|else\s+if|for|while|do|case|catch|\?|&&|\|\|)\b/g,
  csharp:
    /\b(if|else\s+if|for|foreach|while|do|case|catch|\?|&&|\|\|)\b/g,
};

function computeComplexityFromLines(
  lines: string[],
  language: string
): number {
  let complexity = 1; // base path
  const pattern = DECISION_POINTS[language];
  if (!pattern) return complexity;

  for (const line of lines) {
    // Skip comments
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    )
      continue;

    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      complexity++;
    }
  }

  return complexity;
}

// ─── Nesting Depth from Source Lines ─────────────────────────────────────────

function computeNestingFromLines(
  lines: string[],
  isPython: boolean
): number {
  if (isPython) {
    // Track indent levels as nesting
    const baseIndent = (lines[0]?.search(/\S/) ?? 0);
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

function detectDeepNesting(
  lines: string[],
  isPython: boolean
): number[] {
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
    go: /\binterface\s*\{\s*\}|\bany\b/,
    java: /\bObject\b(?!\s*\.class)|\bClass<\?>/,
    csharp: /\bdynamic\b|\bobject\b/,
  };

  const pattern = patterns[language];
  if (!pattern) return weakLines;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*")
    )
      continue;
    if (pattern.test(lines[i])) {
      weakLines.push(i + 1);
    }
  }

  return weakLines;
}
