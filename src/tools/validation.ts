// ─── Input Validation Helpers ────────────────────────────────────────────────
// Shared validation for MCP tool inputs at system boundaries.
// ──────────────────────────────────────────────────────────────────────────────

/** Maximum code input size (1 MB). Prevents excessive memory/CPU usage. */
const MAX_CODE_BYTES = 1_048_576;

/**
 * Validate that code input is within acceptable size limits.
 * Returns an error message string if validation fails, or `undefined` if valid.
 */
export function validateCodeSize(code: string, maxBytes: number = MAX_CODE_BYTES): string | undefined {
  if (code.length === 0) {
    return "Code input is empty.";
  }
  const byteLength = Buffer.byteLength(code, "utf-8");
  if (byteLength > maxBytes) {
    return `Code input too large (${(byteLength / 1024).toFixed(0)} KB). Maximum allowed: ${(maxBytes / 1024).toFixed(0)} KB.`;
  }
  return undefined;
}

/** Recognized programming languages for validation warnings. */
export const KNOWN_LANGUAGES = new Set([
  "typescript",
  "javascript",
  "python",
  "java",
  "csharp",
  "c",
  "cpp",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  "powershell",
  "bash",
  "shell",
  "sql",
  "html",
  "css",
  "scss",
  "bicep",
  "terraform",
  "hcl",
  "yaml",
  "yml",
  "json",
  "xml",
  "toml",
  "dockerfile",
  "makefile",
  "markdown",
  "plaintext",
  "objective-c",
  "dart",
  "lua",
  "perl",
  "elixir",
  "erlang",
  "haskell",
  "fsharp",
  "vb",
  "assembly",
  "zig",
  "nim",
  "cloudformation",
]);

/**
 * Check whether a language string is recognized.
 * Returns the normalized (lowercased) language, or `undefined` if not recognized.
 * This is advisory only — unrecognized languages are still accepted.
 */
export function normalizeLanguage(lang: string): string {
  return lang.toLowerCase().trim();
}
