/**
 * Content-addressable LRU cache for evaluation results.
 *
 * Keyed by a truncated SHA-256 hash of (language + code content), so repeated
 * analysis of the same file content is served from memory. Used internally by
 * the evaluation engine — callers need not interact with caches directly.
 */

import { createHash } from "node:crypto";

/**
 * Compute a short content hash suitable for caching. Two identical
 * (language, code) pairs will always produce the same key.
 */
export function contentHash(code: string, language: string): string {
  return createHash("sha256").update(`${language}|${code}`).digest("hex").slice(0, 16);
}

/**
 * A simple LRU (Least Recently Used) cache with a configurable max size.
 * When the cache exceeds `maxSize`, the oldest entry is evicted.
 */
export class LRUCache<T> {
  private cache = new Map<string, T>();
  private maxSize: number;

  constructor(maxSize = 256) {
    this.maxSize = maxSize;
  }

  /** Retrieve a cached value (moves it to "most recent"). */
  get(key: string): T | undefined {
    const result = this.cache.get(key);
    if (result !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, result);
    }
    return result;
  }

  /** Store a value, evicting the oldest entry if the cache is full. */
  set(key: string, value: T): void {
    // If key already exists, delete first so it moves to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry)
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(key, value);
  }

  /** Check if key exists without affecting LRU order. */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Number of items currently in the cache. */
  get size(): number {
    return this.cache.size;
  }
}
