/**
 * Review-batch-run — Run reviews on multiple files in batch.
 */

import { readFileSync, existsSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BatchResult {
  file: string;
  status: "success" | "error" | "skipped";
  findingCount: number;
  verdict: string;
  error?: string;
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
]);

function collectFiles(dir: string, extensions: Set<string>): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir) as unknown as string[];
  for (const entry of entries) {
    const full = dir.endsWith("/") || dir.endsWith("\\") ? dir + entry : dir + "/" + entry;
    // skip common non-code dirs
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") continue;

    try {
      const content = readFileSync(full, "utf-8");
      // If it reads fine as a file and has a code extension, add it
      void content;
      const ext = "." + entry.split(".").pop();
      if (extensions.has(ext)) {
        results.push(full);
      }
    } catch {
      // Might be a directory — try to recurse
      try {
        const sub = collectFiles(full, extensions);
        results.push(...sub);
      } catch {
        // neither file nor directory — skip
      }
    }
  }

  return results;
}

function processBatchFile(filePath: string): BatchResult {
  if (!existsSync(filePath)) {
    return { file: filePath, status: "error", findingCount: 0, verdict: "N/A", error: "File not found" };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").length;

    // basic heuristic review
    let findingCount = 0;
    const warnings: string[] = [];

    if (lines > 500) {
      findingCount++;
      warnings.push("long-file");
    }
    if (content.includes("eval(")) {
      findingCount++;
      warnings.push("eval-usage");
    }
    if (content.includes("TODO") || content.includes("FIXME")) {
      findingCount++;
      warnings.push("pending-todos");
    }
    if (/password\s*=\s*["']/i.test(content)) {
      findingCount++;
      warnings.push("hardcoded-password");
    }

    const verdict = findingCount === 0 ? "pass" : findingCount <= 2 ? "warn" : "fail";

    return { file: filePath, status: "success", findingCount, verdict };
  } catch {
    return { file: filePath, status: "error", findingCount: 0, verdict: "N/A", error: "Cannot read file" };
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBatchRun(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-batch-run — Run batch review on multiple files

Usage:
  judges review-batch-run --dir <directory> [--format table|json]
  judges review-batch-run <file1> [file2 ...] [--format table|json]

Options:
  --dir <path>       Directory to scan recursively
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  let files: string[];

  if (dir) {
    if (!existsSync(dir)) {
      console.error(`Error: directory not found: ${dir}`);
      process.exitCode = 1;
      return;
    }
    files = collectFiles(dir, CODE_EXTENSIONS);
  } else {
    files = argv.filter(
      (a) =>
        !a.startsWith("--") &&
        (argv.indexOf(a) === 0 || (argv[argv.indexOf(a) - 1] !== "--format" && argv[argv.indexOf(a) - 1] !== "--dir")),
    );
  }

  if (files.length === 0) {
    console.error("Error: no files to review");
    process.exitCode = 1;
    return;
  }

  const results = files.map(processBatchFile);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const passed = results.filter((r) => r.verdict === "pass").length;
  const warned = results.filter((r) => r.verdict === "warn").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log(`\nBatch Review Results (${results.length} files)`);
  console.log("═".repeat(75));
  console.log(`${"File".padEnd(40)} ${"Status".padEnd(10)} ${"Findings".padEnd(10)} Verdict`);
  console.log("─".repeat(75));

  for (const r of results) {
    const name = r.file.length > 38 ? "…" + r.file.slice(-37) : r.file;
    console.log(`${name.padEnd(40)} ${r.status.padEnd(10)} ${String(r.findingCount).padEnd(10)} ${r.verdict}`);
    if (r.error) console.log(`  └─ ${r.error}`);
  }

  console.log("═".repeat(75));
  console.log(`\nSummary: ${passed} pass, ${warned} warn, ${failed} fail, ${errors} error(s)`);
}
