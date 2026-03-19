/**
 * Cross-File Import Resolution
 *
 * Automatically resolves imports from a file's AST and builds
 * related-file context for deeper cross-file analysis. This bridges
 * the gap between single-file deterministic analysis and project-wide
 * vulnerability detection.
 *
 * Provides:
 * - `resolveImports()` — resolves import paths to file content
 * - `buildRelatedFilesContext()` — builds RelatedFileSnippet[] from imports
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { analyzeStructure } from "./ast/index.js";
import type { RelatedFileSnippet } from "./tools/deep-review.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedImport {
  /** The import specifier as written in code (e.g., "./utils", "express") */
  specifier: string;
  /** Resolved absolute file path (undefined if external/unresolvable) */
  resolvedPath?: string;
  /** Whether this is a local (relative) import */
  isLocal: boolean;
  /** File content (truncated) if resolved */
  content?: string;
}

export interface ImportResolutionResult {
  /** Successfully resolved local imports */
  resolved: ResolvedImport[];
  /** External/unresolvable imports */
  external: string[];
  /** Related file snippets ready for deep-review context */
  relatedFiles: RelatedFileSnippet[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum file size to include as related context (bytes) */
const MAX_RELATED_FILE_SIZE = 50_000;

/** Maximum snippet length per related file */
const MAX_SNIPPET_LENGTH = 3_000;

/** Maximum number of imports to resolve */
const MAX_IMPORTS_TO_RESOLVE = 20;

/** Extensions to try when resolving imports without extensions */
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".rs", ".go", ".java", ".cs"];

/** Extensions to try for index files */
const INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs"];

// ─── Import Resolution ─────────────────────────────────────────────────────

/**
 * Check if an import specifier is a local/relative import.
 */
function isLocalImport(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

/**
 * Try to resolve a local import specifier to an actual file path.
 */
function resolveLocalImport(specifier: string, fromDir: string): string | undefined {
  // Remove .js extension if present (common in ESM TypeScript)
  const cleanSpecifier = specifier.replace(/\.js$/, "");
  const basePath = resolve(fromDir, cleanSpecifier);

  // Try exact path first
  if (existsSync(basePath) && !isDirectory(basePath)) {
    return basePath;
  }

  // Try with various extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = basePath + ext;
    if (existsSync(withExt)) {
      return withExt;
    }
  }

  // Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const indexPath = join(basePath, indexFile);
    if (existsSync(indexPath)) {
      return indexPath;
    }
  }

  // Try the original specifier with extensions (before .js stripping)
  const origBase = resolve(fromDir, specifier);
  if (origBase !== basePath && existsSync(origBase) && !isDirectory(origBase)) {
    return origBase;
  }

  return undefined;
}

function isDirectory(filePath: string): boolean {
  try {
    const statSync = (require("fs") as { statSync: (p: string) => { isDirectory(): boolean } }).statSync;
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read a file and return a truncated snippet suitable for cross-file context.
 */
function readSnippet(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath, "utf-8");
    if (content.length > MAX_RELATED_FILE_SIZE) {
      return undefined; // Too large
    }
    if (content.length <= MAX_SNIPPET_LENGTH) {
      return content;
    }
    return content.slice(0, MAX_SNIPPET_LENGTH) + "\n// ... truncated";
  } catch {
    return undefined;
  }
}

/**
 * Resolve imports from a source file and return related file context.
 *
 * Uses the AST parser to extract import specifiers, resolves local imports
 * to actual files, reads their content, and returns structured context
 * suitable for deep-review cross-file analysis.
 *
 * @param code       - Source code of the file being analyzed
 * @param language   - Programming language
 * @param filePath   - Absolute path to the source file (needed for relative import resolution)
 * @param maxImports - Maximum number of imports to resolve (default: 20)
 */
export function resolveImports(
  code: string,
  language: string,
  filePath: string,
  maxImports = MAX_IMPORTS_TO_RESOLVE,
): ImportResolutionResult {
  const resolved: ResolvedImport[] = [];
  const external: string[] = [];
  const relatedFiles: RelatedFileSnippet[] = [];
  const fromDir = dirname(filePath);

  // Use AST to extract imports
  const structure = analyzeStructure(code, language);
  const imports = structure.imports ?? [];

  // Also extract imports via regex for languages where AST might not capture all
  const regexImports = extractImportsViaRegex(code, language);
  const allImports = [...new Set([...imports, ...regexImports])];

  let resolvedCount = 0;
  for (const specifier of allImports) {
    if (resolvedCount >= maxImports) break;

    if (!isLocalImport(specifier)) {
      external.push(specifier);
      continue;
    }

    const resolvedPath = resolveLocalImport(specifier, fromDir);
    if (!resolvedPath) {
      resolved.push({ specifier, isLocal: true });
      continue;
    }

    const snippet = readSnippet(resolvedPath);
    if (!snippet) {
      resolved.push({ specifier, resolvedPath, isLocal: true });
      continue;
    }

    resolved.push({
      specifier,
      resolvedPath,
      isLocal: true,
      content: snippet,
    });

    relatedFiles.push({
      path: specifier,
      snippet,
      relationship: "imported by target",
    });

    resolvedCount++;
  }

  return { resolved, external, relatedFiles };
}

/**
 * Build related files context from a file's imports.
 *
 * Convenience wrapper that returns just the RelatedFileSnippet[] array,
 * ready to be passed to deep-review or MCP tool context.
 */
export function buildRelatedFilesContext(
  code: string,
  language: string,
  filePath: string,
  maxImports = MAX_IMPORTS_TO_RESOLVE,
): RelatedFileSnippet[] {
  return resolveImports(code, language, filePath, maxImports).relatedFiles;
}

// ─── Regex-based Import Extraction (fallback) ───────────────────────────────

/**
 * Extract import specifiers using regex patterns for common languages.
 * This supplements the AST parser for cases where the grammar doesn't
 * capture all import forms.
 */
function extractImportsViaRegex(code: string, language: string): string[] {
  const imports: string[] = [];
  const lines = code.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // TypeScript/JavaScript: import ... from "specifier"
    // Also: import "specifier" (side-effect)
    // Also: require("specifier")
    if (["typescript", "javascript"].includes(language)) {
      const fromMatch = /from\s+["']([^"']+)["']/.exec(trimmed);
      if (fromMatch) {
        imports.push(fromMatch[1]);
        continue;
      }
      const importMatch = /^import\s+["']([^"']+)["']/.exec(trimmed);
      if (importMatch) {
        imports.push(importMatch[1]);
        continue;
      }
      const requireMatch = /require\s*\(\s*["']([^"']+)["']\s*\)/.exec(trimmed);
      if (requireMatch) {
        imports.push(requireMatch[1]);
        continue;
      }
    }

    // Python: from module import ... / import module
    if (language === "python") {
      const fromImport = /^from\s+(\.[\w.]*)\s+import/.exec(trimmed);
      if (fromImport) {
        imports.push(fromImport[1]);
        continue;
      }
    }

    // Go: import "path" / import ( "path" )
    if (language === "go") {
      const goImport = /^\s*"([^"]+)"/.exec(trimmed);
      if (goImport && goImport[1].includes("/")) {
        imports.push(goImport[1]);
      }
    }

    // Rust: use crate::module / mod module
    if (language === "rust") {
      const useMatch = /^use\s+crate::(\w+)/.exec(trimmed);
      if (useMatch) {
        imports.push(`./${useMatch[1]}`);
      }
    }
  }

  return imports;
}
