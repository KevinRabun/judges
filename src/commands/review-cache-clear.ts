/**
 * Review-cache-clear — Clear review caches selectively.
 */

import { existsSync, readdirSync, unlinkSync, statSync, rmSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCacheClear(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-cache-clear — Clear review caches selectively

Usage:
  judges review-cache-clear                     Show cache status
  judges review-cache-clear all                 Clear all caches
  judges review-cache-clear results             Clear result caches only
  judges review-cache-clear older --days <n>    Clear caches older than N days

Options:
  --days <n>        Age threshold in days (default: 30)
  --dry-run         Show what would be deleted without deleting
  --format json     JSON output
  --help, -h        Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["all", "results", "older"].includes(a));
  const dryRun = argv.includes("--dry-run");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const cacheDir = ".judges";

  if (!existsSync(cacheDir)) {
    console.log("No cache directory found (.judges/).");
    return;
  }

  let files: string[];
  try {
    files = readdirSync(cacheDir) as unknown as string[];
  } catch {
    console.error("Error: could not read cache directory");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "all") {
    if (dryRun) {
      console.log(`Would delete ${files.length} cached files.`);
      for (const f of files) console.log(`  ${f}`);
      return;
    }
    let deleted = 0;
    for (const f of files) {
      try {
        const path = `${cacheDir}/${f}`;
        const stat = statSync(path);
        if (stat.isFile()) {
          unlinkSync(path);
          deleted++;
        } else if (stat.isDirectory()) {
          rmSync(path, { recursive: true });
          deleted++;
        }
      } catch {
        /* ignore */
      }
    }
    console.log(`Cleared ${deleted} cached items.`);
    return;
  }

  if (subcommand === "results") {
    const resultFiles = files.filter(
      (f: string) => f.includes("result") || f.endsWith(".sarif") || f.endsWith(".sarif.json"),
    );
    if (dryRun) {
      console.log(`Would delete ${resultFiles.length} result files.`);
      for (const f of resultFiles) console.log(`  ${f}`);
      return;
    }
    let deleted = 0;
    for (const f of resultFiles) {
      try {
        unlinkSync(`${cacheDir}/${f}`);
        deleted++;
      } catch {
        /* ignore */
      }
    }
    console.log(`Cleared ${deleted} result files.`);
    return;
  }

  if (subcommand === "older") {
    const days = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--days") || "30", 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const oldFiles: string[] = [];

    for (const f of files) {
      try {
        const stat = statSync(`${cacheDir}/${f}`);
        if (stat.mtimeMs < cutoff) oldFiles.push(f);
      } catch {
        /* ignore */
      }
    }

    if (dryRun) {
      console.log(`Would delete ${oldFiles.length} files older than ${days} days.`);
      for (const f of oldFiles) console.log(`  ${f}`);
      return;
    }

    let deleted = 0;
    for (const f of oldFiles) {
      try {
        const path = `${cacheDir}/${f}`;
        const stat = statSync(path);
        if (stat.isFile()) {
          unlinkSync(path);
          deleted++;
        } else if (stat.isDirectory()) {
          rmSync(path, { recursive: true });
          deleted++;
        }
      } catch {
        /* ignore */
      }
    }
    console.log(`Cleared ${deleted} items older than ${days} days.`);
    return;
  }

  // Default: show cache status
  let totalSize = 0;
  const jsonCount = files.filter((f: string) => f.endsWith(".json")).length;

  for (const f of files) {
    try {
      totalSize += statSync(`${cacheDir}/${f}`).size;
    } catch {
      /* ignore */
    }
  }

  const mb = (totalSize / 1024 / 1024).toFixed(2);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          cacheDir,
          fileCount: files.length,
          jsonFiles: jsonCount,
          totalSizeBytes: totalSize,
          totalSizeMB: parseFloat(mb),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\nCache Status:");
  console.log("═".repeat(40));
  console.log(`  Directory:  ${cacheDir}/`);
  console.log(`  Files:      ${files.length} (${jsonCount} JSON)`);
  console.log(`  Size:       ${mb} MB`);
  console.log("═".repeat(40));
}
