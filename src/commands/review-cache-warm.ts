/**
 * Review-cache-warm — Pre-warm the review cache for faster subsequent runs.
 */

import { existsSync, readdirSync, mkdirSync } from "fs";
import { DiskCache } from "../disk-cache.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CacheStatus {
  cacheDir: string;
  judgeCount: number;
  warmedEntries: number;
  languages: string[];
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function warmCache(sourceDir: string, cacheDir: string): CacheStatus {
  const judges = defaultRegistry.getJudges();
  const extensions = new Set<string>();
  let warmedEntries = 0;

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const cache = new DiskCache<{ warmed: boolean; timestamp: string }>({ cacheDir });

  if (existsSync(sourceDir)) {
    const files = readdirSync(sourceDir) as unknown as string[];
    for (const file of files) {
      const ext = file.split(".").pop() || "";
      extensions.add(ext);

      // create a cache entry for each file to pre-warm
      const key = `warm-${file}`;
      cache.set(key, { warmed: true, timestamp: new Date().toISOString() });
      warmedEntries++;
    }
  }

  return {
    cacheDir,
    judgeCount: judges.length,
    warmedEntries,
    languages: [...extensions],
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCacheWarm(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const cacheIdx = argv.indexOf("--cache-dir");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : ".";
  const cacheDir = cacheIdx >= 0 ? argv[cacheIdx + 1] : ".judges-cache";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-cache-warm — Pre-warm review cache

Usage:
  judges review-cache-warm [--dir <source-dir>] [--cache-dir <path>]
                           [--format table|json]

Options:
  --dir <path>         Source directory to scan (default: .)
  --cache-dir <path>   Cache directory (default: .judges-cache)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  const status = warmCache(dirPath, cacheDir);

  if (format === "json") {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`\nCache Warm Status`);
  console.log("═".repeat(50));
  console.log(`  Cache Dir:      ${status.cacheDir}`);
  console.log(`  Judges:         ${status.judgeCount}`);
  console.log(`  Warmed Entries: ${status.warmedEntries}`);
  console.log(`  Languages:      ${status.languages.join(", ") || "—"}`);
  console.log("═".repeat(50));
}
