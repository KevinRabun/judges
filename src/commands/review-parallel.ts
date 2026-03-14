/**
 * Review-parallel — Run parallel reviews on multiple files.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ParallelResult {
  file: string;
  language: string;
  lineCount: number;
  status: "queued" | "reviewed" | "skipped" | "error";
  detail: string;
}

interface ParallelReport {
  timestamp: string;
  totalFiles: number;
  results: ParallelResult[];
  summary: { reviewed: number; skipped: number; errors: number };
}

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".cpp": "cpp",
  ".c": "c",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
};

const SOURCE_EXTS = new Set(Object.keys(EXT_TO_LANG));

// ─── File Discovery ─────────────────────────────────────────────────────────

function discoverFiles(dir: string, maxFiles: number): string[] {
  const files: string[] = [];
  function scan(d: string): void {
    if (files.length >= maxFiles) return;
    try {
      const entries = readdirSync(d) as unknown as string[];
      for (const entry of entries) {
        if (files.length >= maxFiles) return;
        const name = entry as string;
        if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build") continue;
        const full = join(d, name);
        const ext = extname(name);
        if (SOURCE_EXTS.has(ext)) {
          files.push(full);
        } else {
          try {
            scan(full);
          } catch {
            // Skip
          }
        }
      }
    } catch {
      // Skip
    }
  }
  scan(dir);
  return files;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewParallel(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-parallel — Run parallel reviews on multiple files

Usage:
  judges review-parallel --dir src
  judges review-parallel --files "src/api.ts,src/cli.ts"
  judges review-parallel --dir src --max 50

Options:
  --dir <path>          Directory to scan for source files
  --files <paths>       Comma-separated list of files
  --max <n>             Max files to process (default: 100)
  --ext <exts>          Filter by extensions (e.g., ".ts,.js")
  --format json         JSON output
  --help, -h            Show this help

Discovers source files and queues them for review. Shows review
readiness for each file including language detection and line counts.

Note: For actual review, run 'judges eval --file <path>' on each file.
This command provides the manifest for batch processing.
`);
    return;
  }

  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");
  const filesArg = argv.find((_a: string, i: number) => argv[i - 1] === "--files");
  const maxFiles = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--max") || "100", 10);
  const extFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--ext");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let files: string[];

  if (filesArg) {
    files = filesArg
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  } else if (dir) {
    if (!existsSync(dir)) {
      console.error(`Error: Directory "${dir}" does not exist.`);
      process.exitCode = 1;
      return;
    }
    files = discoverFiles(dir, maxFiles);
  } else {
    files = discoverFiles(".", maxFiles);
  }

  if (extFilter) {
    const allowedExts = new Set(extFilter.split(",").map((e) => e.trim()));
    files = files.filter((f) => allowedExts.has(extname(f)));
  }

  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const results: ParallelResult[] = [];
  let reviewed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const ext = extname(file);
    const language = EXT_TO_LANG[ext] || "unknown";

    if (!existsSync(file)) {
      results.push({ file, language, lineCount: 0, status: "error", detail: "File not found" });
      errors++;
      continue;
    }

    try {
      const content = readFileSync(file, "utf-8");
      const lineCount = content.split("\n").length;

      if (lineCount < 2) {
        results.push({ file, language, lineCount, status: "skipped", detail: "Too small" });
        skipped++;
        continue;
      }

      results.push({ file, language, lineCount, status: "queued", detail: "Ready for review" });
      reviewed++;
    } catch {
      results.push({ file, language, lineCount: 0, status: "error", detail: "Could not read file" });
      errors++;
    }
  }

  const report: ParallelReport = {
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    results,
    summary: { reviewed, skipped, errors },
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nParallel Review Manifest:");
  console.log("═".repeat(70));
  console.log(`  Total: ${files.length}  Queued: ${reviewed}  Skipped: ${skipped}  Errors: ${errors}`);
  console.log("═".repeat(70));

  // Group by language
  const byLang = new Map<string, ParallelResult[]>();
  for (const r of results) {
    const list = byLang.get(r.language) || [];
    list.push(r);
    byLang.set(r.language, list);
  }

  for (const [lang, langResults] of [...byLang.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const totalLines = langResults.reduce((s, r) => s + r.lineCount, 0);
    console.log(`\n  ${lang} (${langResults.length} files, ${totalLines} lines):`);
    for (const r of langResults.slice(0, 20)) {
      const icon = r.status === "queued" ? "○" : r.status === "skipped" ? "─" : "✗";
      console.log(`    ${icon} ${r.file}  (${r.lineCount} lines)`);
    }
    if (langResults.length > 20) {
      console.log(`    ... and ${langResults.length - 20} more`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("  To review: judges eval --file <path>");
}
