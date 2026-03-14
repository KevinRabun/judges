/**
 * Review-batch-files — Batch-review multiple files in a single command.
 */

import { existsSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBatchFiles(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges review-batch-files — Batch-review multiple files

Usage:
  judges review-batch-files --dir <path> [options]
  judges review-batch-files --files <f1,f2,...> [options]

Options:
  --dir <path>         Directory to scan for files
  --files <list>       Comma-separated list of files
  --extensions <ext>   File extensions to include (default: .ts,.js,.py,.java)
  --max <n>            Maximum files to process (default: 50)
  --format json        JSON output
  --help, -h           Show this help

Lists files ready for batch review processing.
`);
    return;
  }

  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");
  const filesStr = argv.find((_a: string, i: number) => argv[i - 1] === "--files");
  const extsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--extensions") || ".ts,.js,.py,.java";
  const maxStr = argv.find((_a: string, i: number) => argv[i - 1] === "--max");
  const maxFiles = maxStr ? parseInt(maxStr, 10) : 50;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const extensions = extsStr.split(",").map((e) => e.trim());
  let files: string[];

  if (filesStr) {
    files = filesStr
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  } else if (dir) {
    if (!existsSync(dir)) {
      console.error(`Error: directory not found: ${dir}`);
      process.exitCode = 1;
      return;
    }
    try {
      const entries = readdirSync(dir) as unknown as string[];
      files = entries.filter((e) => extensions.includes(extname(e))).map((e) => join(dir, e));
    } catch (err) {
      console.error(`Error reading directory: ${err}`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.error("Error: --dir or --files required");
    process.exitCode = 1;
    return;
  }

  // Filter existing
  const existing = files.filter((f) => existsSync(f));
  const missing = files.length - existing.length;
  const batch = existing.slice(0, maxFiles);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { total: files.length, existing: existing.length, missing, batch: batch.length, files: batch },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nBatch Review Files:`);
  console.log("═".repeat(60));
  console.log(`  Found: ${existing.length} files (${missing} missing, batch: ${batch.length})`);
  console.log("─".repeat(60));

  for (const f of batch) {
    const ext = extname(f);
    console.log(`  ${ext.padEnd(6)} ${f}`);
  }

  if (existing.length > maxFiles) console.log(`\n  (${existing.length - maxFiles} files truncated — increase --max)`);
  console.log("═".repeat(60));
}
