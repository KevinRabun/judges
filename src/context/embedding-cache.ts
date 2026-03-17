import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface EmbeddingChunk {
  hash: string;
  embedding: number[];
  text: string;
  metadata?: Record<string, unknown>;
}

/** Simple SHA1 hash for cache keys (content + salt/context). */
export function hashKey(text: string, salt?: string): string {
  return createHash("sha1")
    .update(text + (salt ?? ""))
    .digest("hex");
}

/**
 * In-memory embedding cache (can be backed by disk later). Lightweight and
 * dependency-free; callers can persist via JSON if desired.
 */
export class EmbeddingCache {
  private cache = new Map<string, EmbeddingChunk>();

  get(key: string): EmbeddingChunk | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: EmbeddingChunk): void {
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Trivial embedding provider (fallback) — returns normalized character code vector.
 * Not semantically meaningful but keeps the pipeline working when no provider is configured.
 */
export class FallbackEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(32).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % vec.length] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

/** Retrieve or compute an embedding, with caching. */
export async function getOrCreateEmbedding(
  cache: EmbeddingCache,
  provider: EmbeddingProvider,
  text: string,
  salt?: string,
): Promise<EmbeddingChunk> {
  const key = hashKey(text, salt);
  const cached = cache.get(key);
  if (cached) return cached;
  const embedding = await provider.embed(text);
  const chunk: EmbeddingChunk = { hash: key, embedding, text };
  cache.set(key, chunk);
  return chunk;
}
