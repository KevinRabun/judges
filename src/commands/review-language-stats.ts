/**
 * Review-language-stats — Language-specific review statistics.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LanguageStat {
  language: string;
  extensions: string[];
  fileCount: number;
  totalLines: number;
  reviewedCount: number;
  avgScore: number;
  findingDensity: number;
}

interface LanguageStatsReport {
  timestamp: string;
  totalLanguages: number;
  totalFiles: number;
  stats: LanguageStat[];
}

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".cs": "C#",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cpp": "C++",
  ".c": "C",
  ".h": "C/C++ Header",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sql": "SQL",
  ".sh": "Shell",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".json": "JSON",
  ".xml": "XML",
  ".md": "Markdown",
  ".tf": "Terraform",
  ".bicep": "Bicep",
};

// ─── File Scanning ──────────────────────────────────────────────────────────

function scanDirectory(dir: string, langCounts: Map<string, { files: string[]; lines: number }>): void {
  try {
    const entries = readdirSync(dir) as unknown as string[];
    for (const entry of entries) {
      const name = entry as string;
      if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build") continue;
      const full = join(dir, name);
      try {
        const content = readFileSync(full, "utf-8");
        const ext = extname(name);
        const lang = EXT_TO_LANG[ext];
        if (lang) {
          const existing = langCounts.get(lang) || { files: [], lines: 0 };
          existing.files.push(full);
          existing.lines += content.split("\n").length;
          langCounts.set(lang, existing);
        }
      } catch {
        // Might be a directory
        try {
          scanDirectory(full, langCounts);
        } catch {
          // Skip unreadable entries
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewLanguageStats(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-language-stats — Language-specific review statistics

Usage:
  judges review-language-stats
  judges review-language-stats --dir src
  judges review-language-stats --format json

Options:
  --dir <path>          Directory to scan (default: current directory)
  --format json         JSON output
  --help, -h            Show this help

Scans a project directory and provides language-specific statistics
including file counts, line counts, and supported language coverage.

Report saved to .judges/language-stats.json.
`);
    return;
  }

  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!existsSync(dir)) {
    console.error(`Error: Directory "${dir}" does not exist.`);
    process.exitCode = 1;
    return;
  }

  const langCounts = new Map<string, { files: string[]; lines: number }>();
  scanDirectory(dir, langCounts);

  if (langCounts.size === 0) {
    console.log("No source files found.");
    return;
  }

  const stats: LanguageStat[] = [];
  let totalFiles = 0;

  for (const [lang, data] of langCounts) {
    const extensions = [...new Set(data.files.map((f) => extname(f)))];
    totalFiles += data.files.length;
    stats.push({
      language: lang,
      extensions,
      fileCount: data.files.length,
      totalLines: data.lines,
      reviewedCount: 0,
      avgScore: 0,
      findingDensity: 0,
    });
  }

  stats.sort((a, b) => b.fileCount - a.fileCount);

  const report: LanguageStatsReport = {
    timestamp: new Date().toISOString(),
    totalLanguages: stats.length,
    totalFiles,
    stats,
  };

  const outPath = join(".judges", "language-stats.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nLanguage Statistics:");
  console.log("═".repeat(65));
  console.log(`  Languages: ${stats.length}  Total files: ${totalFiles}`);
  console.log("═".repeat(65));
  console.log(`  ${"Language".padEnd(18)} ${"Files".padEnd(8)} ${"Lines".padEnd(10)} Extensions`);
  console.log("  " + "─".repeat(63));
  for (const s of stats) {
    const pct = ((s.fileCount / totalFiles) * 100).toFixed(1);
    console.log(
      `  ${s.language.padEnd(18)} ${String(s.fileCount).padEnd(8)} ${String(s.totalLines).padEnd(10)} ${s.extensions.join(", ")}  (${pct}%)`,
    );
  }
  console.log("  " + "─".repeat(63));
  console.log(`  Report saved to ${outPath}`);
}
