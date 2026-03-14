/**
 * Review-cache — Cache review results to avoid re-analyzing unchanged files.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CachedResult {
  fileHash: string;
  timestamp: string;
  findingCount: number;
  findings: { pattern: string; severity: string; line: number }[];
}

interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  sizeBytes: number;
  oldestEntry: string;
  newestEntry: string;
}

// ─── Cache operations ──────────────────────────────────────────────────────

function getCacheDir(): string {
  return join(".", ".judges", "review-cache");
}

function hashFile(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function cacheKey(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex").slice(0, 16);
}

function getCached(filePath: string, content: string): CachedResult | null {
  const dir = getCacheDir();
  const key = cacheKey(filePath);
  const cachePath = join(dir, `${key}.json`);

  if (!existsSync(cachePath)) return null;

  try {
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as CachedResult;
    const currentHash = hashFile(content);
    if (cached.fileHash === currentHash) return cached;
    return null; // File changed, cache invalid
  } catch {
    return null;
  }
}

function setCached(
  filePath: string,
  content: string,
  findings: { pattern: string; severity: string; line: number }[],
): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const key = cacheKey(filePath);
  const result: CachedResult = {
    fileHash: hashFile(content),
    timestamp: new Date().toISOString(),
    findingCount: findings.length,
    findings,
  };

  writeFileSync(join(dir, `${key}.json`), JSON.stringify(result), "utf-8");
}

function getCacheStats(): CacheStats {
  const dir = getCacheDir();
  if (!existsSync(dir)) return { entries: 0, hits: 0, misses: 0, sizeBytes: 0, oldestEntry: "", newestEntry: "" };

  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
  let totalSize = 0;
  let oldest = "";
  let newest = "";

  for (const f of files) {
    try {
      const content = readFileSync(join(dir, f), "utf-8");
      totalSize += content.length;
      const parsed = JSON.parse(content) as CachedResult;
      if (!oldest || parsed.timestamp < oldest) oldest = parsed.timestamp;
      if (!newest || parsed.timestamp > newest) newest = parsed.timestamp;
    } catch {
      // skip
    }
  }

  return { entries: files.length, hits: 0, misses: 0, sizeBytes: totalSize, oldestEntry: oldest, newestEntry: newest };
}

function clearCache(): number {
  const dir = getCacheDir();
  if (!existsSync(dir)) return 0;

  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
  for (const f of files) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      // skip
    }
  }
  return files.length;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCache(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-cache — Manage review result cache

Usage:
  judges review-cache stats                 Show cache statistics
  judges review-cache clear                 Clear all cached results
  judges review-cache --format json         JSON output

Subcommands:
  stats                Show cache statistics
  clear                Clear all cached results

Options:
  --format json        JSON output
  --help, -h           Show this help

Review results are cached in .judges/review-cache/ based on file content
hashes. When a file hasn't changed, cached results are reused for faster
subsequent reviews.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "review-cache") || "stats";

  if (subcommand === "clear") {
    const count = clearCache();
    console.log(`Cleared ${count} cached review result(s).`);
    return;
  }

  // Stats
  const stats = getCacheStats();

  if (format === "json") {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`\n  Review Cache\n  ─────────────────────────────`);
  console.log(`    Entries: ${stats.entries}`);
  console.log(`    Size: ${Math.round(stats.sizeBytes / 1024)} KB`);
  if (stats.oldestEntry) console.log(`    Oldest: ${stats.oldestEntry.slice(0, 10)}`);
  if (stats.newestEntry) console.log(`    Newest: ${stats.newestEntry.slice(0, 10)}`);
  console.log();
}

// Export helpers for use by other commands
export { getCached, setCached, hashFile };
