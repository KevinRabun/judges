// ─────────────────────────────────────────────────────────────────────────────
// AST Analysis — Unified Entry Point
// ─────────────────────────────────────────────────────────────────────────────
// Routes to the tree-sitter real-AST parser (WASM) for TypeScript, JavaScript,
// Python, Rust, Go, Java, C#, and C++ when grammars are available, or the
// lightweight structural parser as a fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeLanguage } from "../language-patterns.js";
import { analyzeStructurally } from "./structural-parser.js";
import {
  isTreeSitterAvailable,
  isTreeSitterReadySync,
  analyzeWithTreeSitter,
  analyzeWithTreeSitterSync,
} from "./tree-sitter-ast.js";
import type { CodeStructure, FunctionInfo } from "./types.js";

export type { CodeStructure, FunctionInfo };

// Re-export tree-sitter availability checks
export { isTreeSitterAvailable, isTreeSitterReadySync } from "./tree-sitter-ast.js";

// Re-export taint analysis
export { analyzeTaintFlows } from "./taint-tracker.js";
export type { TaintFlow, TaintSourceKind, TaintSinkKind } from "./taint-tracker.js";

// Re-export cross-file taint analysis
export { analyzeCrossFileTaint } from "./cross-file-taint.js";
export type { CrossFileTaintFlow } from "./cross-file-taint.js";

// ─── Tree-sitter Warm-up ────────────────────────────────────────────────────
// Pre-initialize tree-sitter on module load so it's ready when needed.
// This is fire-and-forget; if it fails, analyzeStructure falls back silently.

const TREE_SITTER_LANGS = ["typescript", "javascript", "python", "rust", "go", "java", "csharp", "cpp"] as const;
const treeSitterReady = new Map<string, Promise<boolean>>();

for (const lang of TREE_SITTER_LANGS) {
  treeSitterReady.set(lang, isTreeSitterAvailable(lang));
}

/**
 * Analyse source code structurally. Uses tree-sitter (real AST via WASM) for
 * TypeScript, JavaScript, Python, Rust, Go, Java, C#, and C++ when available,
 * falling back to the lightweight scope-tracking structural parser.
 *
 * Returns function metrics (complexity, nesting, length, params), dead code
 * locations, deep-nesting locations, and type-safety issues.
 */
export function analyzeStructure(code: string, language: string): CodeStructure {
  const lang = normalizeLanguage(language);

  switch (lang) {
    case "typescript":
    case "javascript":
    case "python":
    case "rust":
    case "go":
    case "java":
    case "csharp":
    case "cpp":
      // Use tree-sitter (real AST) if WASM runtime + grammar already loaded,
      // otherwise fall back to the lightweight structural parser.
      // parser.parse() is synchronous in web-tree-sitter once initialized.
      if (isTreeSitterReadySync(lang)) {
        try {
          return analyzeWithTreeSitterSync(code, lang);
        } catch {
          // Tree-sitter failed at runtime — fall back silently
        }
      }
      return analyzeStructurally(code, lang);

    case "powershell":
      // No tree-sitter grammar for PowerShell — use structural parser directly
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
        imports: [],
      };
  }
}

/**
 * Async version of analyzeStructure that uses tree-sitter (real AST) for all
 * supported languages when WASM grammars are available.
 * Falls back to the structural parser if tree-sitter is not available.
 *
 * Prefer this over analyzeStructure() when async is acceptable — it ensures
 * tree-sitter grammars are fully loaded before analysis.
 */
export async function analyzeStructureAsync(code: string, language: string): Promise<CodeStructure> {
  const lang = normalizeLanguage(language);

  switch (lang) {
    case "typescript":
    case "javascript":
    case "python":
    case "rust":
    case "go":
    case "java":
    case "csharp":
    case "cpp": {
      // Try tree-sitter first (real AST), fall back to structural parser
      const available = await (treeSitterReady.get(lang) ?? Promise.resolve(false));
      if (available) {
        try {
          return await analyzeWithTreeSitter(code, lang);
        } catch {
          // Tree-sitter failed at runtime — fall back silently
        }
      }
      return analyzeStructurally(code, lang);
    }

    case "powershell":
      // No tree-sitter grammar for PowerShell — use structural parser directly
      return analyzeStructurally(code, lang);

    default:
      return {
        language: lang,
        totalLines: code.split("\n").length,
        functions: [],
        fileCyclomaticComplexity: 1,
        maxNestingDepth: 0,
        deadCodeLines: [],
        deepNestLines: [],
        typeAnyLines: [],
        imports: [],
      };
  }
}
