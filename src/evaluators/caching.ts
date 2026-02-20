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

  return findings;
}
