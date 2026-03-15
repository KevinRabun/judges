/**
 * Review-scope-select — Select review scope by path patterns and exclusions.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    const entries = readdirSync(d) as unknown as string[];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry !== "node_modules" && entry !== ".git" && entry !== "dist") {
            walk(full);
          }
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          results.push(full);
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(dir);
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewScopeSelect(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const extIdx = argv.indexOf("--ext");
  const excludeIdx = argv.indexOf("--exclude");
  const formatIdx = argv.indexOf("--format");
  const limitIdx = argv.indexOf("--limit");
  const projectDir = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-scope-select — Select review scope by path/extension

Usage:
  judges review-scope-select [--dir <path>] [--ext .ts,.js,...]
                             [--exclude <pattern>] [--limit <n>]
                             [--format table|json]

Options:
  --dir <path>         Project directory (default: cwd)
  --ext <extensions>   Comma-separated file extensions (default: .ts,.js,.py,.java,.go)
  --exclude <pattern>  Exclude paths containing pattern
  --limit <n>          Maximum files to list
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!existsSync(projectDir)) {
    console.error(`Error: directory not found: ${projectDir}`);
    process.exitCode = 1;
    return;
  }

  const extensions = extIdx >= 0 ? argv[extIdx + 1].split(",") : [".ts", ".js", ".py", ".java", ".go"];
  const excludePattern = excludeIdx >= 0 ? argv[excludeIdx + 1] : undefined;
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : undefined;

  let files = collectFiles(projectDir, extensions);

  if (excludePattern) {
    files = files.filter((f) => !f.includes(excludePattern));
  }

  if (limit !== undefined && limit > 0) {
    files = files.slice(0, limit);
  }

  const relativePaths = files.map((f) => relative(projectDir, f));

  if (format === "json") {
    console.log(JSON.stringify({ count: relativePaths.length, files: relativePaths }, null, 2));
    return;
  }

  console.log(`\nReview Scope: ${relativePaths.length} file(s)`);
  console.log("═".repeat(55));

  const byExt: Record<string, number> = {};
  for (const f of relativePaths) {
    const ext = f.substring(f.lastIndexOf("."));
    byExt[ext] = (byExt[ext] ?? 0) + 1;
  }

  console.log("  Extensions:");
  for (const [ext, count] of Object.entries(byExt)) {
    console.log(`    ${ext.padEnd(8)} ${count} file(s)`);
  }

  console.log("\n  Files:");
  for (const f of relativePaths) {
    console.log(`    ${f}`);
  }

  console.log("═".repeat(55));
}
