/**
 * Canonical file-extension → language mapping.
 *
 * Single source of truth — every module that needs extension-based language
 * detection should import from here instead of maintaining its own copy.
 */

import { extname } from "path";

// ─── Extension → Language ───────────────────────────────────────────────────

export const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".dockerfile": "dockerfile",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".dart": "dart",
  ".sql": "sql",
  ".bicep": "bicep",
};

/** Set of all recognised source-code extensions (keys of EXT_TO_LANG). */
export const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXT_TO_LANG));

/**
 * Detect language from a file path.
 *
 * Returns `undefined` when the extension is not recognised.
 * Callers that need a default should coalesce: `detectLanguage(p) ?? "typescript"`.
 */
export function detectLanguageFromPath(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith("dockerfile") || lower.includes("dockerfile.")) return "dockerfile";
  const ext = extname(lower);
  return EXT_TO_LANG[ext];
}
