// ─────────────────────────────────────────────────────────────────────────────
// AST Analysis — Unified Entry Point
// ─────────────────────────────────────────────────────────────────────────────
// Routes to the TypeScript compiler-based parser for JS/TS or the lightweight
// structural parser for Python, Rust, Go, Java, and C#.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeLanguage } from "../language-patterns.js";
import { analyzeTypeScript } from "./typescript-ast.js";
import { analyzeStructurally } from "./structural-parser.js";
import type { CodeStructure, FunctionInfo } from "./types.js";

export type { CodeStructure, FunctionInfo };

/**
 * Analyse source code structurally. For JavaScript/TypeScript this uses the
 * TypeScript compiler API (full AST). For Python, Rust, Go, Java, and C# it
 * uses a lightweight scope-tracking parser.
 *
 * Returns function metrics (complexity, nesting, length, params), dead code
 * locations, deep-nesting locations, and type-safety issues.
 */
export function analyzeStructure(
  code: string,
  language: string
): CodeStructure {
  const lang = normalizeLanguage(language);

  switch (lang) {
    case "javascript":
    case "typescript":
      return analyzeTypeScript(code, lang);

    case "python":
    case "rust":
    case "go":
    case "java":
    case "csharp":
      return analyzeStructurally(code, lang);

    default:
      // Unknown language — return a minimal structure
      return {
        language: lang,
        totalLines: code.split("\n").length,
        functions: [],
        fileCyclomaticComplexity: 1,
        maxNestingDepth: 0,
        deadCodeLines: [],
        deepNestLines: [],
        typeAnyLines: [],
      };
  }
}
