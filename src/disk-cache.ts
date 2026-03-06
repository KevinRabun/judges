// ─── Disk-Backed Persistent Cache ─────────────────────────────────────────────
// Content-addressable cache that persists evaluation results to disk so that
// repeated CI runs on unchanged files are served from disk instead of being
// re-evaluated.
//
// Storage layout:
//   <cacheDir>/
//     index.json          — Map of hash → { file, ts, size }
//     <hash>.json          — Serialised evaluation result
//
// The cache directory defaults to `.judges-cache` (relative to cwd) and can
// be overridden via the JUDGES_CACHE_DIR env variable or config.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash } from "./cache.js";

/** Default cache directory name (relative to cwd). */
const DEFAULT_CACHE_DIR = ".judges-cache";

/** Default maximum disk cache entries before eviction. */
const DEFAULT_MAX_ENTRIES = 2048;

/** Maximum age in milliseconds before an entry is considered stale (7 days). */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

// ─── Index ───────────────────────────────────────────────────────────────────

interface CacheIndexEntry {
  /** File path (relative) that produced this entry, for debugging. */
  file?: string;
  /** ISO timestamp when the entry was written. */
  ts: string;
  /** Size in bytes of the serialised JSON. */
  size: number;
}

interface CacheIndex {
  version: 1;
  entries: Record<string, CacheIndexEntry>;
}

// ─── DiskCache class ─────────────────────────────────────────────────────────

export class DiskCache<T = unknown> {
  private dir: string;
  private maxEntries: number;
  private maxAgeMs: number;
  private index: CacheIndex;

  constructor(options?: { cacheDir?: string; maxEntries?: number; maxAgeMs?: number }) {
    this.dir = options?.cacheDir ?? process.env.JUDGES_CACHE_DIR ?? DEFAULT_CACHE_DIR;
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.index = this.loadIndex();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Compute a cache key from code + language. */
  static key(code: string, language: string): string {
    return contentHash(code, language);
  }

  /** Retrieve a cached result, or undefined if miss / stale. */
  get(key: string): T | undefined {
    const meta = this.index.entries[key];
    if (!meta) return undefined;

    // Check staleness
    const age = Date.now() - new Date(meta.ts).getTime();
    if (age > this.maxAgeMs) {
      this.evictEntry(key);
      return undefined;
    }

    const entryPath = this.entryPath(key);
    if (!existsSync(entryPath)) {
      // Index out of sync — clean up
      delete this.index.entries[key];
      this.saveIndex();
      return undefined;
    }

    try {
      const raw = readFileSync(entryPath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      this.evictEntry(key);
      return undefined;
    }
  }

  /** Store a result on disk. */
  set(key: string, value: T, filePath?: string): void {
    this.ensureDir();

    const json = JSON.stringify(value);
    writeFileSync(this.entryPath(key), json, "utf-8");

    this.index.entries[key] = {
      file: filePath,
      ts: new Date().toISOString(),
      size: Buffer.byteLength(json),
    };

    // Evict oldest entries if over limit
    this.enforceLimit();
    this.saveIndex();
  }

  /** Check if a key exists (not stale). */
  has(key: string): boolean {
    const meta = this.index.entries[key];
    if (!meta) return false;
    const age = Date.now() - new Date(meta.ts).getTime();
    if (age > this.maxAgeMs) {
      this.evictEntry(key);
      return false;
    }
    return existsSync(this.entryPath(key));
  }

  /** Remove all cache entries. */
  clear(): void {
    if (!existsSync(this.dir)) return;
    try {
      for (const file of readdirSync(this.dir)) {
        try {
          unlinkSync(join(this.dir, file));
        } catch {
          // Ignore individual file errors
        }
      }
    } catch {
      // Ignore directory read errors
    }
    this.index = { version: 1, entries: {} };
  }

  /** Number of entries currently cached. */
  get size(): number {
    return Object.keys(this.index.entries).length;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private entryPath(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  private indexPath(): string {
    return join(this.dir, "index.json");
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  private loadIndex(): CacheIndex {
    const p = this.indexPath();
    if (!existsSync(p)) return { version: 1, entries: {} };
    try {
      const raw = readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.entries) return parsed as CacheIndex;
      return { version: 1, entries: {} };
    } catch {
      return { version: 1, entries: {} };
    }
  }

  private saveIndex(): void {
    this.ensureDir();
    writeFileSync(this.indexPath(), JSON.stringify(this.index, null, 2), "utf-8");
  }

  private evictEntry(key: string): void {
    delete this.index.entries[key];
    const p = this.entryPath(key);
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // Ignore
    }
    this.saveIndex();
  }

  private enforceLimit(): void {
    const keys = Object.keys(this.index.entries);
    if (keys.length <= this.maxEntries) return;

    // Sort by timestamp ascending (oldest first)
    const sorted = keys.sort((a, b) => {
      const tA = new Date(this.index.entries[a].ts).getTime();
      const tB = new Date(this.index.entries[b].ts).getTime();
      return tA - tB;
    });

    const toEvict = sorted.slice(0, keys.length - this.maxEntries);
    for (const key of toEvict) {
      this.evictEntry(key);
    }
  }
}

// ─── Convenience: create a shared disk cache instance ────────────────────────

let _sharedDiskCache: DiskCache | null = null;

/**
 * Get or create the shared disk cache instance.
 * Returns null if disk caching is disabled via JUDGES_NO_DISK_CACHE=1.
 */
export function getSharedDiskCache(): DiskCache | null {
  if (process.env.JUDGES_NO_DISK_CACHE === "1") return null;
  if (!_sharedDiskCache) {
    _sharedDiskCache = new DiskCache();
  }
  return _sharedDiskCache;
}

/**
 * Clear the shared disk cache (useful in tests).
 */
export function clearSharedDiskCache(): void {
  _sharedDiskCache?.clear();
  _sharedDiskCache = null;
}
