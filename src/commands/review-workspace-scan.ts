/**
 * Review-workspace-scan — Scan entire workspace for reviewable files.
 */

import { readFileSync, existsSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScanResult {
  totalFiles: number;
  byExtension: Record<string, number>;
  byDirectory: Record<string, number>;
  largeFiles: string[];
  files: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".swift",
  ".kt",
  ".scala",
  ".vue",
  ".svelte",
]);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", "vendor", "target"]);

function scanDir(dir: string, maxDepth: number, depth: number = 0): string[] {
  if (depth > maxDepth) return [];
  if (!existsSync(dir)) return [];

  const results: string[] = [];
  const entries = readdirSync(dir) as unknown as string[];

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".") continue;
    if (SKIP_DIRS.has(entry)) continue;

    const full = dir.endsWith("/") || dir.endsWith("\\") ? dir + entry : dir + "/" + entry;

    // try to read as file
    try {
      const content = readFileSync(full, "utf-8");
      void content;
      const ext = entry.includes(".") ? "." + entry.split(".").pop() : "";
      if (CODE_EXTENSIONS.has(ext)) {
        results.push(full);
      }
    } catch {
      // directory — recurse
      try {
        const sub = scanDir(full, maxDepth, depth + 1);
        results.push(...sub);
      } catch {
        // skip
      }
    }
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWorkspaceScan(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const depthIdx = argv.indexOf("--depth");
  const formatIdx = argv.indexOf("--format");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".";
  const maxDepth = depthIdx >= 0 ? parseInt(argv[depthIdx + 1], 10) : 5;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-workspace-scan — Scan workspace for reviewable files

Usage:
  judges review-workspace-scan [--dir <path>] [--depth <n>]
                               [--format table|json|summary]

Options:
  --dir <path>       Root directory (default: .)
  --depth <n>        Max directory depth (default: 5)
  --format <fmt>     Output format: table (default), json, summary
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(dir)) {
    console.error(`Error: directory not found: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const files = scanDir(dir, maxDepth);

  const byExtension: Record<string, number> = {};
  const byDirectory: Record<string, number> = {};
  const largeFiles: string[] = [];

  for (const f of files) {
    const ext = f.includes(".") ? "." + f.split(".").pop() : "unknown";
    byExtension[ext] = (byExtension[ext] || 0) + 1;

    const parts = f.replace(/\\/g, "/").split("/");
    const dirName = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    byDirectory[dirName] = (byDirectory[dirName] || 0) + 1;

    try {
      const content = readFileSync(f, "utf-8");
      if (content.split("\n").length > 500) {
        largeFiles.push(f);
      }
    } catch {
      // skip
    }
  }

  const result: ScanResult = { totalFiles: files.length, byExtension, byDirectory, largeFiles, files };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (format === "summary") {
    console.log(
      `Files: ${files.length} | Extensions: ${Object.keys(byExtension).length} | Large: ${largeFiles.length}`,
    );
    return;
  }

  console.log(`\nWorkspace Scan (${files.length} reviewable files)`);
  console.log("═".repeat(55));

  console.log("\nBy extension:");
  for (const [ext, count] of Object.entries(byExtension).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ext.padEnd(12)} ${count}`);
  }

  console.log("\nTop directories:");
  const sortedDirs = Object.entries(byDirectory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [d, count] of sortedDirs) {
    const name = d.length > 35 ? "…" + d.slice(-34) : d;
    console.log(`  ${name.padEnd(38)} ${count}`);
  }

  if (largeFiles.length > 0) {
    console.log(`\nLarge files (>500 lines): ${largeFiles.length}`);
    for (const f of largeFiles.slice(0, 5)) {
      console.log(`  ${f}`);
    }
    if (largeFiles.length > 5) console.log(`  ... and ${largeFiles.length - 5} more`);
  }

  console.log("═".repeat(55));
}
