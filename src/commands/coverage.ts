// ─── Language Coverage Report ────────────────────────────────────────────────
// Analyse a set of files to report which languages have Judges Panel coverage
// and which lack it. Helps teams identify blind spots.
//
// Usage (programmatic):
//   const report = computeLanguageCoverage(fileList);
//   console.log(formatCoverageReport(report));
// ──────────────────────────────────────────────────────────────────────────────

import { extname } from "path";
import { normalizeLanguage } from "../language-patterns.js";
import { JUDGES } from "../judges/index.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LanguageCoverageEntry {
  language: string;
  fileCount: number;
  files: string[];
  /** Whether this language has dedicated evaluator coverage */
  covered: boolean;
  /** Count of judges that apply to this language */
  judgeCount: number;
}

export interface LanguageCoverageReport {
  /** Languages with coverage */
  covered: LanguageCoverageEntry[];
  /** Languages without coverage */
  uncovered: LanguageCoverageEntry[];
  /** Summary stats */
  stats: {
    totalFiles: number;
    coveredFiles: number;
    uncoveredFiles: number;
    coveragePercent: number;
    languageCount: number;
    coveredLanguages: number;
    uncoveredLanguages: number;
  };
}

// ─── Extension → Language mapping ────────────────────────────────────────────

import { EXT_TO_LANG, detectLanguageFromPath } from "../ext-to-lang.js";

/**
 * Languages for which the Judges Panel has first-class evaluator coverage.
 * A language is "covered" if normalizeLanguage returns a recognized LangFamily
 * AND there are judges whose pattern matching includes that language.
 */
const COVERED_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "python",
  "rust",
  "csharp",
  "java",
  "go",
  "cpp",
  "powershell",
  "terraform",
  "bicep",
  "arm",
  "php",
  "ruby",
  "kotlin",
  "swift",
]);

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Detect language from file path extension.
 */
export function detectFileLanguage(filePath: string): string {
  return detectLanguageFromPath(filePath) ?? "unknown";
}

/**
 * Count how many judges can evaluate a given language.
 * Most judges are language-agnostic (they analyze patterns across all languages),
 * so we return the total judge count for covered languages and 0 for uncovered.
 */
function judgeCountForLanguage(language: string): number {
  const normalized = normalizeLanguage(language);
  if (COVERED_LANGUAGES.has(normalized) || COVERED_LANGUAGES.has(language)) {
    return JUDGES.length;
  }
  return 0;
}

/**
 * Compute language coverage for a set of file paths.
 *
 * @param files - Array of relative or absolute file paths
 * @returns Coverage report with covered/uncovered breakdown
 */
export function computeLanguageCoverage(files: string[]): LanguageCoverageReport {
  // Group files by detected language
  const langFiles = new Map<string, string[]>();

  for (const f of files) {
    const lang = detectFileLanguage(f);
    if (lang === "unknown") continue; // Skip unrecognized files
    const existing = langFiles.get(lang) ?? [];
    existing.push(f);
    langFiles.set(lang, existing);
  }

  const covered: LanguageCoverageEntry[] = [];
  const uncovered: LanguageCoverageEntry[] = [];

  for (const [lang, langFileList] of langFiles) {
    const normalized = normalizeLanguage(lang);
    const isCovered = COVERED_LANGUAGES.has(normalized) || COVERED_LANGUAGES.has(lang);
    const jCount = judgeCountForLanguage(lang);

    const entry: LanguageCoverageEntry = {
      language: lang,
      fileCount: langFileList.length,
      files: langFileList,
      covered: isCovered,
      judgeCount: jCount,
    };

    if (isCovered) {
      covered.push(entry);
    } else {
      uncovered.push(entry);
    }
  }

  // Sort by file count descending
  covered.sort((a, b) => b.fileCount - a.fileCount);
  uncovered.sort((a, b) => b.fileCount - a.fileCount);

  const coveredFileCount = covered.reduce((sum, e) => sum + e.fileCount, 0);
  const uncoveredFileCount = uncovered.reduce((sum, e) => sum + e.fileCount, 0);
  const totalFiles = coveredFileCount + uncoveredFileCount;

  return {
    covered,
    uncovered,
    stats: {
      totalFiles,
      coveredFiles: coveredFileCount,
      uncoveredFiles: uncoveredFileCount,
      coveragePercent: totalFiles > 0 ? Math.round((coveredFileCount / totalFiles) * 100) : 100,
      languageCount: covered.length + uncovered.length,
      coveredLanguages: covered.length,
      uncoveredLanguages: uncovered.length,
    },
  };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Format a language coverage report as human-readable text.
 */
export function formatCoverageReport(report: LanguageCoverageReport): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Language Coverage Report           ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  lines.push(`  Total files     : ${report.stats.totalFiles}`);
  lines.push(`  Languages found : ${report.stats.languageCount}`);
  lines.push(
    `  Coverage        : ${report.stats.coveragePercent}% (${report.stats.coveredFiles}/${report.stats.totalFiles} files)`,
  );
  lines.push("");

  if (report.covered.length > 0) {
    lines.push("  ✅ Covered Languages:");
    lines.push("  " + "─".repeat(55));
    for (const entry of report.covered) {
      lines.push(`    ${entry.language.padEnd(14)} ${entry.fileCount} file(s)  (${entry.judgeCount} judges)`);
    }
    lines.push("");
  }

  if (report.uncovered.length > 0) {
    lines.push("  ⚠️  Uncovered Languages:");
    lines.push("  " + "─".repeat(55));
    for (const entry of report.uncovered) {
      lines.push(`    ${entry.language.padEnd(14)} ${entry.fileCount} file(s)  — no dedicated evaluator`);
    }
    lines.push("");
  }

  if (report.uncovered.length === 0) {
    lines.push("  All detected languages have Judges Panel coverage! 🎯");
    lines.push("");
  }

  return lines.join("\n");
}
