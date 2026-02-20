import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeRateLimiting(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "RATE";

  // No rate limiting middleware
  const hasRateLimit = /rate.?limit|throttle|express-rate-limit|koa-ratelimit|bottleneck|p-limit|limiter|quota/gi.test(code);
  const hasServerCode = /app\.(listen|use|get|post|put|delete|patch)|createServer|express\(\)|new\s+Hono/gi.test(code);
  if (hasServerCode && !hasRateLimit && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No rate limiting on API endpoints",
      description: "API server has no rate limiting. Any client can make unlimited requests, enabling DDoS attacks, brute-force login attempts, scraping, and resource exhaustion.",
      recommendation: "Add rate limiting middleware (express-rate-limit, koa-ratelimit). Apply per-IP and per-user limits. Set stricter limits on auth endpoints.",
      reference: "OWASP API Security Top 10: API4 — Unrestricted Resource Consumption",
    });
  }

  // No request body size limit
  const hasBodyParser = /bodyParser|express\.json|express\.urlencoded|body-parser|app\.use\s*\(\s*express\.json/gi.test(code);
  const hasBodyLimit = /limit\s*:\s*["'`]\d|maxSize|maxBodySize|maxContentLength|payloadLimit/gi.test(code);
  if (hasBodyParser && !hasBodyLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Request body parser without size limit",
      description: "Body parser middleware is used without a size limit. Attackers can send arbitrarily large payloads to exhaust server memory.",
      recommendation: "Configure body parser with a size limit: express.json({ limit: '1mb' }). Set limits appropriate for your use case.",
      reference: "Express Security Best Practices / OWASP",
    });
  }

  // Unbounded query results
  const unboundedQueryPattern = /db\.find\s*\(\s*(?:\{\s*\}|\))|\.find\s*\(\s*\)/gi;
  const unboundedLines = getLineNumbers(code, unboundedQueryPattern);
  if (unboundedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unbounded query results without limit",
      description: `Found ${unboundedLines.length} database query/queries without a limit. A single request could return millions of rows, crashing the server.`,
      lineNumbers: unboundedLines,
      recommendation: "Always enforce a maximum result limit: db.find({}).limit(100). Implement pagination and enforce maximum page sizes.",
      reference: "API Rate Limiting / Database Query Safety",
    });
  }

  // No rate limit headers in responses
  if (hasServerCode && !hasRateLimit && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No rate limit headers in API responses",
      description: "API responses don't include standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After).",
      recommendation: "Return rate limit headers on responses so clients can self-throttle. Include Retry-After on 429 responses.",
      reference: "IETF Rate Limit Headers / RFC 6585",
    });
  }

  // External API calls without backoff
  const externalCallPattern = /fetch\s*\(\s*["'`]https?:\/\/|axios\.(?:get|post|put|delete)|http\.(?:get|post)/gi;
  const externalCallLines = getLineNumbers(code, externalCallPattern);
  const hasBackoff = /backoff|retry|exponential|setTimeout.*retry|p-retry|cockatiel|polly/gi.test(code);
  if (externalCallLines.length > 0 && !hasBackoff) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "External API calls without retry/backoff strategy",
      description: `Found ${externalCallLines.length} external API call(s) without visible retry/backoff logic. Failed requests won't be retried, and rapid retries could get your client rate-limited or banned.`,
      lineNumbers: externalCallLines.slice(0, 3),
      recommendation: "Implement exponential backoff with jitter for external API calls. Respect Retry-After headers. Use libraries like p-retry or cockatiel.",
      reference: "Exponential Backoff / Rate Limiting Best Practices",
    });
  }

  // setInterval without bounds (potential DoS on resources)
  const setIntervalPattern = /setInterval\s*\(/g;
  const setIntervalLines = getLineNumbers(code, setIntervalPattern);
  if (setIntervalLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "setInterval without rate control",
      description: "setInterval runs indefinitely and could generate excessive load. If the interval function is slow, executions can overlap and compound.",
      lineNumbers: setIntervalLines,
      recommendation: "Use setTimeout with re-scheduling instead of setInterval to prevent overlap. Add guards to skip execution if the previous run hasn't completed.",
      reference: "JavaScript Timer Best Practices",
    });
  }

  return findings;
}
