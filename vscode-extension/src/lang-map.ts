/**
 * Shared VS Code languageId → canonical language name mapping.
 *
 * Maps VS Code `document.languageId` strings to the normalised language
 * identifiers used by the judges evaluation engine.
 */
export const LANG_MAP: Record<string, string> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  terraform: "terraform",
  bicep: "bicep",
  powershell: "powershell",
  php: "php",
  ruby: "ruby",
  kotlin: "kotlin",
  swift: "swift",
};
