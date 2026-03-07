import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, isIaCTemplate, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCaching(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CACHE";
  const _lang = getLangFamily(language);

  // Unbounded in-memory cache
  const inMemoryCachePattern = /(?:const|let|var)\s+\w*[Cc]ache\w*\s*[:=]\s*(?:new\s+Map|\{\}|\[\])/gi;
  const inMemoryCacheLines = getLineNumbers(code, inMemoryCachePattern);
  if (inMemoryCacheLines.length >= 8) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unbounded in-memory cache detected",
      description:
        "In-memory cache without size limits or eviction policy. This will grow indefinitely and eventually cause out-of-memory errors under production load.",
      lineNumbers: inMemoryCacheLines,
      recommendation:
        "Use a bounded cache with an eviction policy (LRU, TTL). Consider libraries like lru-cache, node-cache, or a distributed cache (Redis, Memcached) for multi-instance deployments.",
      reference: "Caching Best Practices / LRU Cache Pattern",
      suggestedFix:
        "Replace the raw Map/object with a bounded LRU cache, e.g. `const cache = new LRUCache({ max: 500, ttl: 1000 * 60 * 5 })`.",
      confidence: 0.85,
    });
  }

  // No caching for expensive operations (multi-language)
  const dbQueryLines = getLangLineNumbers(code, language, LP.DB_QUERY);
  const fetchLines = getLangLineNumbers(code, language, LP.HTTP_CLIENT);
  const expensiveOpLines = [...dbQueryLines, ...fetchLines];
  const hasCaching = /cache|Cache|redis|memcache|lru|ttl|stale|expires|ETag|If-None-Match|If-Modified-Since/gi.test(
    code,
  );
  const iacTemplate = isIaCTemplate(code);
  if (expensiveOpLines.length >= 3 && !hasCaching && !iacTemplate && code.split("\n").length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No caching strategy for expensive operations",
      description:
        "Code performs database queries or external API calls without any caching layer. Every request triggers a full backend operation even for data that rarely changes.",
      lineNumbers: expensiveOpLines.slice(0, 5),
      recommendation:
        "Implement cache-aside (lazy loading) for read-heavy operations. Use Redis or Memcached for shared caching. Set appropriate TTLs based on data freshness requirements.",
      reference: "Cache-Aside Pattern / AWS Caching Best Practices",
      suggestedFix:
        "Wrap expensive DB/API calls with a cache-aside helper: check cache first, return on hit, otherwise fetch, store with a TTL, and return.",
      confidence: 0.7,
    });
  }

  // No HTTP caching headers
  const hasHttpResponse = testCode(code, /res\.(json|send|render|set|header)\s*\(/gi);
  const hasCacheHeaders = testCode(
    code,
    /Cache-Control|ETag|Last-Modified|Expires|max-age|s-maxage|must-revalidate|no-cache|no-store/gi,
  );
  if (hasHttpResponse && !hasCacheHeaders && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No HTTP caching headers set",
      description:
        "HTTP responses are sent without Cache-Control, ETag, or Last-Modified headers. Clients and CDNs cannot cache responses, increasing server load and latency.",
      recommendation:
        "Set appropriate Cache-Control headers for static and semi-static responses. Use ETags for conditional requests. Configure CDN caching rules.",
      reference: "RFC 7234: HTTP Caching / MDN Cache-Control",
      suggestedFix:
        "Add `res.set('Cache-Control', 'public, max-age=300')` (or an appropriate directive) before sending responses for cacheable endpoints.",
      confidence: 0.7,
    });
  }

  // Cache without invalidation strategy
  const cacheSetPattern = /cache\.set|cache\.put|setCache|redis\.set|\.setex|memcache\.set/gi;
  const cacheSetLines = getLineNumbers(code, cacheSetPattern);
  const hasInvalidation =
    /cache\.del|cache\.delete|cache\.invalidate|cache\.clear|cache\.flush|redis\.del|cache\.remove|bust.*cache/gi.test(
      code,
    );
  if (cacheSetLines.length > 0 && !hasInvalidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Cache writes without invalidation strategy",
      description:
        "Data is cached but no invalidation logic is visible. Stale cache entries will serve outdated data indefinitely unless TTLs are set.",
      lineNumbers: cacheSetLines,
      recommendation:
        "Implement cache invalidation when underlying data changes. Use TTLs as a safety net. Consider write-through or write-behind patterns for consistency.",
      reference: "Cache Invalidation Strategies",
      suggestedFix:
        "Add a `cache.del(key)` call in every write/update/delete path that mutates the underlying data, and set a TTL on each `cache.set` as a safety net.",
      confidence: 0.7,
    });
  }

  // Global mutable object used as cache
  const globalMutableCachePattern = /(?:let|var)\s+\w*[Cc]ache\w*\s*[:=]\s*\{\}/gi;
  const globalCacheLines = getLineNumbers(code, globalMutableCachePattern);
  if (globalCacheLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Mutable global object used as cache",
      description:
        "A mutable global object ({}) is used as a cache. This pattern has no TTL, no eviction, no size limit, doesn't work across instances, and is prone to memory leaks.",
      lineNumbers: globalCacheLines,
      recommendation:
        "Replace with a proper caching library (node-cache, lru-cache) or a distributed cache (Redis). These provide TTL, eviction policies, and memory limits.",
      reference: "In-Memory Caching Best Practices",
      suggestedFix:
        "Replace `let cache = {}` with a library like `const cache = new NodeCache({ stdTTL: 600, maxKeys: 1000 })` to get automatic eviction and TTL support.",
      confidence: 0.85,
    });
  }

  // Cache key collision risk — simple string concatenation keys
  const cacheKeyPattern = /cache\.(?:set|get|has)\s*\(\s*(?:["'`][^"'`]{1,10}["'`]|`\$\{)/gi;
  const cacheKeyLines = getLineNumbers(code, cacheKeyPattern);
  if (cacheKeyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Simple cache keys risk collisions",
      description: `Found ${cacheKeyLines.length} cache operation(s) with short or interpolated keys. Without namespace prefixes or hashing, keys from different features can collide.`,
      lineNumbers: cacheKeyLines,
      recommendation:
        "Use namespaced, structured cache keys: 'users:byId:${id}'. Include version or tenant info for multi-tenant apps. Consider hashing complex keys.",
      reference: "Cache Key Design Best Practices",
      suggestedFix:
        "Prefix cache keys with a namespace and version, e.g. `cache.set(`v1:users:byId:${userId}`, data)`, to prevent collisions across features.",
      confidence: 0.75,
    });
  }

  // Thundering herd / cache stampede — multiple concurrent fetches on miss
  const cacheGetPattern = /cache\.get\s*\(/gi;
  const cacheGetLines = getLineNumbers(code, cacheGetPattern);
  const hasStampedeProtection = testCode(code, /lock|mutex|singleflight|coalesce|dedupe|p-memoize/gi);
  if (cacheGetLines.length > 0 && !hasStampedeProtection) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No thundering herd protection on cache misses",
      description:
        "Cache reads without stampede protection. When a popular cache entry expires, many concurrent requests will all miss and hit the backend simultaneously.",
      recommendation:
        "Implement request coalescing (singleflight pattern) so only one request fetches on a miss. Use stale-while-revalidate or lock-based refresh.",
      reference: "Cache Stampede / Thundering Herd Problem",
      suggestedFix:
        "Wrap the cache-miss fetch in a singleflight/coalescing helper so concurrent callers share one in-flight request instead of each hitting the backend.",
      confidence: 0.7,
    });
  }

  // Caching secrets or tokens
  const cacheSecretPattern = /cache\.(?:set|put)\s*\([^)]*(?:token|secret|password|credential|apikey|api_key)/gi;
  const cacheSecretLines = getLineNumbers(code, cacheSecretPattern);
  if (cacheSecretLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Secrets or tokens stored in cache",
      description:
        "Sensitive values (tokens, secrets, passwords) are cached. Cached secrets may persist beyond their intended lifetime and can be exposed via cache inspection.",
      lineNumbers: cacheSecretLines,
      recommendation:
        "Never cache secrets or authentication tokens. Use a dedicated secrets manager with built-in rotation. If token caching is necessary, encrypt values and set strict TTLs.",
      reference: "OWASP Secrets Management / Cache Security",
      suggestedFix:
        "Remove secrets from the cache and retrieve them from a secrets manager (e.g. AWS Secrets Manager, Azure Key Vault) at runtime instead.",
      confidence: 0.95,
    });
  }

  // Stale data served without revalidation
  const hasCacheRead = testCode(code, /cache\.get|cache\.fetch|getFromCache|getCached/gi);
  const hasRevalidation = /revalidate|stale-while-revalidate|refresh|ETag|If-None-Match|If-Modified-Since|304/gi.test(
    code,
  );
  if (hasCacheRead && !hasRevalidation && cacheSetLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Cached data served without revalidation mechanism",
      description:
        "Data is cached and served without any revalidation strategy. Clients may receive stale data indefinitely until the TTL expires.",
      recommendation:
        "Implement stale-while-revalidate: serve stale data immediately while refreshing in the background. Use ETags or Last-Modified for conditional fetches.",
      reference: "HTTP Stale-While-Revalidate / RFC 5861",
      suggestedFix:
        "Add a stale-while-revalidate wrapper: return cached data immediately and trigger an async background refresh when the entry is near expiry.",
      confidence: 0.7,
    });
  }

  // No cache warming strategy
  const hasStartup = testCode(code, /listen\s*\(|bootstrap|main\s*\(|init\s*\(/gi);
  const hasCacheWarm = testCode(code, /warm|preheat|preload|seed.*cache|cache.*seed|cache.*warm/gi);
  if (hasStartup && hasCacheRead && !hasCacheWarm && code.split("\n").length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "info",
      title: "No cache warming strategy for cold starts",
      description:
        "Application uses caching but has no visible cache warming on startup. After deployments or restarts, all requests will miss the cache and hit backends simultaneously.",
      recommendation:
        "Implement cache warming on startup for critical data. Pre-populate frequently accessed keys during deployment. Consider gradual traffic ramp-up after deploys.",
      reference: "Cache Warming / Blue-Green Deployment Best Practices",
      suggestedFix:
        "Add a `warmCache()` function that pre-populates critical keys at startup, and call it from your init/bootstrap routine before accepting traffic.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  return findings;
}
