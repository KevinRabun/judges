import { getOrCreateEmbedding, EmbeddingCache, FallbackEmbeddingProvider } from "./embedding-cache.js";

export interface ContextOptions {
  chunkSize?: number; // approx chars per chunk
  overlap?: number; // overlap chars
  maxSnippets?: number;
  embeddingCache?: EmbeddingCache;
  embeddingSalt?: string; // e.g. repo/path
}

const DEFAULT_CHUNK_SIZE = 1200; // chars (~300 tokens)
const DEFAULT_OVERLAP = 200;
const DEFAULT_MAX_SNIPPETS = 5;

/**
 * Naive chunker for code/docs. Returns plain text chunks; embeddings computed for ranking.
 */
export async function buildContextSnippets(
  text: string,
  opts: ContextOptions = {},
): Promise<Array<{ snippet: string; score: number }>> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  const maxSnippets = opts.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const cache = opts.embeddingCache ?? new EmbeddingCache();
  const provider = new FallbackEmbeddingProvider();

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }

  // Compute simple scores using fallback embeddings (dot product with a centroid)
  const centroid = await getOrCreateEmbedding(cache, provider, text, opts.embeddingSalt);
  const centroidVec = centroid.embedding;

  const scored: Array<{ snippet: string; score: number }> = [];
  for (const c of chunks) {
    const chunkEmbedding = await getOrCreateEmbedding(cache, provider, c, opts.embeddingSalt);
    const score = dot(centroidVec, chunkEmbedding.embedding);
    scored.push({ snippet: c, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSnippets);
}

function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}
