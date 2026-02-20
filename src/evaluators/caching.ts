import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeCaching(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CACHE";

  // Unbounded in-memory cache
  const inMemoryCachePattern = /(?:const|let|var)\s+\w*[Cc]ache\w*\s*[:=]\s*(?:new\s+Map|\{\}|\[\])/gi;
  const inMemoryCacheLines = getLineNumbers(code, inMemoryCachePattern);
  if (inMemoryCacheLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unbounded in-memory cache detected",
      description: "In-memory cache without size limits or eviction policy. This will grow indefinitely and eventually cause out-of-memory errors under production load.",
      lineNumbers: inMemoryCacheLines,
      recommendation: "Use a bounded cache with an eviction policy (LRU, TTL). Consider libraries like lru-cache, node-cache, or a distributed cache (Redis, Memcached) for multi-instance deployments.",
      reference: "Caching Best Practices / LRU Cache Pattern",
    });
  }

  // No caching for expensive operations
  const hasDbQueries = /(?:db\.|query|find|findOne|findMany|execute|select)\s*\(/gi.test(code);
  const hasFetch = /fetch\s*\(|axios\.|http\.get|request\s*\(/gi.test(code);
  const hasCaching = /cache|Cache|redis|memcache|lru|ttl|stale|expires|ETag|If-None-Match|If-Modified-Since/gi.test(code);
  if ((hasDbQueries || hasFetch) && !hasCaching && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No caching strategy for expensive operations",
      description: "Code performs database queries or external API calls without any caching layer. Every request triggers a full backend operation even for data that rarely changes.",
      recommendation: "Implement cache-aside (lazy loading) for read-heavy operations. Use Redis or Memcached for shared caching. Set appropriate TTLs based on data freshness requirements.",
      reference: "Cache-Aside Pattern / AWS Caching Best Practices",
    });
  }

  // No HTTP caching headers
  const hasHttpResponse = /res\.(json|send|render|set|header)\s*\(/gi.test(code);
  const hasCacheHeaders = /Cache-Control|ETag|Last-Modified|Expires|max-age|s-maxage|must-revalidate|no-cache|no-store/gi.test(code);
  if (hasHttpResponse && !hasCacheHeaders && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No HTTP caching headers set",
      description: "HTTP responses are sent without Cache-Control, ETag, or Last-Modified headers. Clients and CDNs cannot cache responses, increasing server load and latency.",
      recommendation: "Set appropriate Cache-Control headers for static and semi-static responses. Use ETags for conditional requests. Configure CDN caching rules.",
      reference: "RFC 7234: HTTP Caching / MDN Cache-Control",
    });
  }

  // Cache without invalidation strategy
  const cacheSetPattern = /cache\.set|cache\.put|setCache|redis\.set|\.setex|memcache\.set/gi;
  const cacheSetLines = getLineNumbers(code, cacheSetPattern);
  const hasInvalidation = /cache\.del|cache\.delete|cache\.invalidate|cache\.clear|cache\.flush|redis\.del|cache\.remove|bust.*cache/gi.test(code);
  if (cacheSetLines.length > 0 && !hasInvalidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Cache writes without invalidation strategy",
      description: "Data is cached but no invalidation logic is visible. Stale cache entries will serve outdated data indefinitely unless TTLs are set.",
      lineNumbers: cacheSetLines,
      recommendation: "Implement cache invalidation when underlying data changes. Use TTLs as a safety net. Consider write-through or write-behind patterns for consistency.",
      reference: "Cache Invalidation Strategies",
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
      description: "A mutable global object ({}) is used as a cache. This pattern has no TTL, no eviction, no size limit, doesn't work across instances, and is prone to memory leaks.",
      lineNumbers: globalCacheLines,
      recommendation: "Replace with a proper caching library (node-cache, lru-cache) or a distributed cache (Redis). These provide TTL, eviction policies, and memory limits.",
      reference: "In-Memory Caching Best Practices",
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
      recommendation: "Use namespaced, structured cache keys: 'users:byId:${id}'. Include version or tenant info for multi-tenant apps. Consider hashing complex keys.",
      reference: "Cache Key Design Best Practices",
    });
  }

  // Thundering herd / cache stampede — multiple concurrent fetches on miss
  const cacheGetPattern = /cache\.get\s*\(/gi;
  const cacheGetLines = getLineNumbers(code, cacheGetPattern);
  const hasStampedeProtection = /lock|mutex|singleflight|coalesce|dedupe|p-memoize/gi.test(code);
  if (cacheGetLines.length > 0 && !hasStampedeProtection) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No thundering herd protection on cache misses",
      description: "Cache reads without stampede protection. When a popular cache entry expires, many concurrent requests will all miss and hit the backend simultaneously.",
      recommendation: "Implement request coalescing (singleflight pattern) so only one request fetches on a miss. Use stale-while-revalidate or lock-based refresh.",
      reference: "Cache Stampede / Thundering Herd Problem",
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
      description: "Sensitive values (tokens, secrets, passwords) are cached. Cached secrets may persist beyond their intended lifetime and can be exposed via cache inspection.",
      lineNumbers: cacheSecretLines,
      recommendation: "Never cache secrets or authentication tokens. Use a dedicated secrets manager with built-in rotation. If token caching is necessary, encrypt values and set strict TTLs.",
      reference: "OWASP Secrets Management / Cache Security",
    });
  }

  // Stale data served without revalidation
  const hasCacheRead = /cache\.get|cache\.fetch|getFromCache|getCached/gi.test(code);
  const hasRevalidation = /revalidate|stale-while-revalidate|refresh|ETag|If-None-Match|If-Modified-Since|304/gi.test(code);
  if (hasCacheRead && !hasRevalidation && cacheSetLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Cached data served without revalidation mechanism",
      description: "Data is cached and served without any revalidation strategy. Clients may receive stale data indefinitely until the TTL expires.",
      recommendation: "Implement stale-while-revalidate: serve stale data immediately while refreshing in the background. Use ETags or Last-Modified for conditional fetches.",
      reference: "HTTP Stale-While-Revalidate / RFC 5861",
    });
  }

  // No cache warming strategy
  const hasStartup = /listen\s*\(|bootstrap|main\s*\(|init\s*\(/gi.test(code);
  const hasCacheWarm = /warm|preheat|preload|seed.*cache|cache.*seed|cache.*warm/gi.test(code);
  if (hasStartup && hasCacheRead && !hasCacheWarm && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No cache warming strategy for cold starts",
      description: "Application uses caching but has no visible cache warming on startup. After deployments or restarts, all requests will miss the cache and hit backends simultaneously.",
      recommendation: "Implement cache warming on startup for critical data. Pre-populate frequently accessed keys during deployment. Consider gradual traffic ramp-up after deploys.",
      reference: "Cache Warming / Blue-Green Deployment Best Practices",
    });
  }

  return findings;
}
