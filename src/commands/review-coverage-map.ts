/**
 * Review-coverage-map — Map which files have been reviewed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileReviewStatus {
  file: string;
  reviewed: boolean;
  lastReviewDate: string;
  reviewCount: number;
}

interface CoverageMapReport {
  timestamp: string;
  totalFiles: number;
  reviewedFiles: number;
  coveragePercent: number;
  files: FileReviewStatus[];
}

interface CoverageStore {
  version: string;
  reviewed: Record<string, { lastDate: string; count: number }>;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const COVERAGE_FILE = join(".judges", "coverage-map.json");

function loadCoverage(): CoverageStore {
  if (!existsSync(COVERAGE_FILE)) return { version: "1.0.0", reviewed: {} };
  try {
    return JSON.parse(readFileSync(COVERAGE_FILE, "utf-8")) as CoverageStore;
  } catch {
    return { version: "1.0.0", reviewed: {} };
  }
}

function saveCoverage(store: CoverageStore): void {
  mkdirSync(dirname(COVERAGE_FILE), { recursive: true });
  writeFileSync(COVERAGE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── File Discovery ─────────────────────────────────────────────────────────

const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cpp",
  ".c",
  ".h",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
]);

function discoverFiles(dir: string, files: string[]): void {
  try {
    const entries = readdirSync(dir) as unknown as string[];
    for (const entry of entries) {
      const name = entry as string;
      if (name.startsWith(".") || name === "node_modules" || name === "dist" || name === "build") continue;
      const full = join(dir, name);
      const ext = extname(name);
      if (SOURCE_EXTS.has(ext)) {
        files.push(full);
      } else if (!ext) {
        // Might be a directory
        try {
          discoverFiles(full, files);
        } catch {
          // Skip
        }
      } else {
        try {
          discoverFiles(full, files);
        } catch {
          // Skip
        }
      }
    }
  } catch {
    // Skip
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCoverageMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-coverage-map — Map which files have been reviewed

Usage:
  judges review-coverage-map                         Show coverage map
  judges review-coverage-map mark --file src/api.ts  Mark a file as reviewed
  judges review-coverage-map unmark --file src/api.ts
  judges review-coverage-map clear

Subcommands:
  (default)             Show coverage map
  mark                  Mark a file as reviewed
  unmark                Remove reviewed status
  clear                 Clear coverage data

Options:
  --dir <path>          Directory to scan (default: current directory)
  --file <path>         File to mark/unmark
  --unreviewed          Show only unreviewed files
  --format json         JSON output
  --help, -h            Show this help

Coverage data stored in .judges/coverage-map.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["mark", "unmark", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadCoverage();

  if (subcommand === "mark") {
    const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!filePath) {
      console.error("Error: --file is required.");
      process.exitCode = 1;
      return;
    }
    const existing = store.reviewed[filePath] || { lastDate: "", count: 0 };
    existing.lastDate = new Date().toISOString();
    existing.count++;
    store.reviewed[filePath] = existing;
    saveCoverage(store);
    console.log(`Marked "${filePath}" as reviewed (review #${existing.count}).`);
    return;
  }

  if (subcommand === "unmark") {
    const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!filePath) {
      console.error("Error: --file is required.");
      process.exitCode = 1;
      return;
    }
    delete store.reviewed[filePath];
    saveCoverage(store);
    console.log(`Unmarked "${filePath}".`);
    return;
  }

  if (subcommand === "clear") {
    saveCoverage({ version: "1.0.0", reviewed: {} });
    console.log("Coverage data cleared.");
    return;
  }

  // Default: show coverage map
  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".";
  const unreviewedOnly = argv.includes("--unreviewed");

  const files: string[] = [];
  discoverFiles(dir, files);

  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const fileStatuses: FileReviewStatus[] = files.map((f) => {
    const reviewInfo = store.reviewed[f];
    return {
      file: f,
      reviewed: !!reviewInfo,
      lastReviewDate: reviewInfo?.lastDate || "",
      reviewCount: reviewInfo?.count || 0,
    };
  });

  const reviewedCount = fileStatuses.filter((f) => f.reviewed).length;
  const coveragePercent = (reviewedCount / files.length) * 100;

  const report: CoverageMapReport = {
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    reviewedFiles: reviewedCount,
    coveragePercent,
    files: fileStatuses,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const displayFiles = unreviewedOnly ? fileStatuses.filter((f) => !f.reviewed) : fileStatuses;

  console.log("\nReview Coverage Map:");
  console.log("═".repeat(70));
  console.log(`  Total: ${files.length}  Reviewed: ${reviewedCount}  Coverage: ${coveragePercent.toFixed(1)}%`);
  console.log("═".repeat(70));

  const bar = (pct: number): string => {
    const filled = Math.round(pct / 5);
    return "█".repeat(filled) + "░".repeat(20 - filled);
  };
  console.log(`  [${bar(coveragePercent)}] ${coveragePercent.toFixed(1)}%`);
  console.log("");

  for (const f of displayFiles.slice(0, 50)) {
    const icon = f.reviewed ? "✓" : "○";
    const info = f.reviewed ? `  reviewed=${f.reviewCount}  ${f.lastReviewDate.slice(0, 10)}` : "";
    console.log(`  ${icon} ${f.file}${info}`);
  }

  if (displayFiles.length > 50) {
    console.log(`  ... and ${displayFiles.length - 50} more`);
  }
  console.log("═".repeat(70));
}
