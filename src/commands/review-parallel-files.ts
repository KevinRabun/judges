/**
 * Review-parallel-files — Review multiple files in parallel batches.
 *
 * Divides files into batches for concurrent review processing,
 * tracking progress and aggregating results.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileBatch {
  batchId: number;
  files: string[];
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".cs",
  ".cpp",
  ".c",
  ".rb",
  ".php",
  ".swift",
  ".kt",
]);

function collectCodeFiles(dir: string, extensions: Set<string>): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string): void {
    const entries = readdirSync(d) as unknown as string[];
    for (const entry of entries) {
      const full = join(d, String(entry));
      if (String(entry).startsWith(".") || String(entry) === "node_modules") continue;
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (extensions.has(extname(String(entry)))) results.push(full);
      } catch {
        /* skip */
      }
    }
  }

  walk(dir);
  return results;
}

function createBatches(files: string[], batchSize: number): FileBatch[] {
  const batches: FileBatch[] = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push({
      batchId: batches.length + 1,
      files: files.slice(i, i + batchSize),
      status: "pending",
    });
  }
  return batches;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewParallelFiles(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const batchIdx = argv.indexOf("--batch-size");
  const extIdx = argv.indexOf("--ext");
  const formatIdx = argv.indexOf("--format");
  const listIdx = argv.indexOf("--list");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const batchSize = batchIdx >= 0 ? parseInt(argv[batchIdx + 1], 10) : 5;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const extFilter =
    extIdx >= 0 ? new Set(argv[extIdx + 1].split(",").map((e) => (e.startsWith(".") ? e : `.${e}`))) : CODE_EXTENSIONS;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-parallel-files — Batch files for parallel review

Usage:
  judges review-parallel-files [--dir <path>] [--batch-size <n>]
                                [--ext <exts>] [--format table|json] [--list]

Options:
  --dir <path>         Directory to scan (default: current directory)
  --batch-size <n>     Files per batch (default: 5)
  --ext <exts>         Comma-separated extensions to include
  --format <fmt>       Output format: table (default), json
  --list               List files per batch
  --help, -h           Show this help
`);
    return;
  }

  if (!existsSync(dir)) {
    console.error(`Error: directory not found: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const files = collectCodeFiles(dir, extFilter);
  if (files.length === 0) {
    console.log("No code files found.");
    return;
  }

  const batches = createBatches(files, batchSize);

  if (format === "json") {
    console.log(JSON.stringify({ totalFiles: files.length, batchSize, batches }, null, 2));
    return;
  }

  console.log(`\nParallel Review Plan`);
  console.log("═".repeat(60));
  console.log(`Directory:  ${dir}`);
  console.log(`Files:      ${files.length}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Batches:    ${batches.length}`);
  console.log("─".repeat(60));

  for (const b of batches) {
    console.log(`\nBatch ${b.batchId} (${b.files.length} files)`);
    if (listIdx >= 0) {
      for (const f of b.files) console.log(`  ${f}`);
    }
  }

  // Extension breakdown
  const extCounts = new Map<string, number>();
  for (const f of files) {
    const ext = extname(f);
    extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
  }

  console.log("\n" + "─".repeat(60));
  console.log("File types:");
  for (const [ext, count] of [...extCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ext}: ${count}`);
  }

  console.log("═".repeat(60));
  console.log(`\nTo review: judges eval --file <path> for each file`);
}
