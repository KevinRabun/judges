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

  // Auth endpoints without stricter rate limits
  const authRoutePattern = /(?:post|put)\s*\(\s*['"]\/(?:auth|login|signin|register|signup|password|reset|forgot|token|oauth)/gi;
  const authRouteLines = getLineNumbers(code, authRoutePattern);
  const hasRateLimiter = /rateLimit|rateLimiter|rate_limit|throttle/gi.test(code);
  if (authRouteLines.length > 0 && !hasRateLimiter) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Authentication endpoints without rate limiting",
      description: `Found ${authRouteLines.length} authentication endpoint(s) without visible rate limiting. Auth endpoints are prime targets for brute-force and credential-stuffing attacks.`,
      lineNumbers: authRouteLines,
      recommendation: "Apply strict rate limits to auth endpoints (e.g., 5-10 requests/minute per IP). Use progressive delays or CAPTCHA after failed attempts. Consider using 'express-rate-limit' or 'rate-limiter-flexible'.",
      reference: "OWASP: Brute Force Protection / NIST 800-63B",
    });
  }

  // File upload without size limit
  const uploadPattern = /multer\s*\(|upload\s*\.\s*(?:single|array|fields)|formidable|busboy|multipart/gi;
  const uploadLines = getLineNumbers(code, uploadPattern);
  const hasUploadLimit = /limits\s*:\s*\{|maxFileSize|fileSizeLimit|maxFiles/gi.test(code);
  if (uploadLines.length > 0 && !hasUploadLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "File upload without size or count limits",
      description: `Found ${uploadLines.length} file upload handler(s) without visible size limits. Unbounded uploads can exhaust disk space and memory, causing denial of service.`,
      lineNumbers: uploadLines,
      recommendation: "Set explicit file size limits (e.g., multer({ limits: { fileSize: 5 * 1024 * 1024 } })). Limit the number of files per request. Validate file types.",
      reference: "OWASP: Unrestricted File Upload / Multer Limits",
    });
  }

  // Missing 429 status code responses
  const has429 = /429|Too Many Requests|too_many_requests|RATE_LIMIT|rateLimited/gi.test(code);
  const hasApiEndpoints = /app\.\s*(?:get|post|put|delete|patch)\s*\(|router\.\s*(?:get|post|put|delete|patch)\s*\(/gi.test(code);
  if (hasApiEndpoints && !has429 && !hasRateLimiter) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "API endpoints with no 429 (Too Many Requests) handling",
      description: "API endpoints found but no 429 status code or rate limiting middleware detected. Without rate limiting responses, clients have no feedback mechanism to back off.",
      recommendation: "Return 429 status with Retry-After header when rate limits are exceeded. Include rate limit headers (X-RateLimit-Remaining, X-RateLimit-Reset) in all responses.",
      reference: "RFC 6585: 429 Too Many Requests / IETF Rate Limiting Headers",
    });
  }

  // WebSocket connections without limits
  const wsPattern = /new\s+WebSocket(?:Server)?|wss?\.\s*on\s*\(\s*['"]connection/gi;
  const wsLines = getLineNumbers(code, wsPattern);
  const hasWsLimit = /maxPayload|maxConnections|maxClientsCount|perMessageDeflate.*threshold/gi.test(code);
  if (wsLines.length > 0 && !hasWsLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "WebSocket server without connection or message limits",
      description: `Found ${wsLines.length} WebSocket server setup(s) without visible connection or payload limits. Unbounded WebSocket connections can exhaust server resources.`,
      lineNumbers: wsLines,
      recommendation: "Set maxPayload to limit message sizes. Limit concurrent connections per client. Implement message rate limiting per connection. Set idle timeouts.",
      reference: "ws Package: Connection Limits / WebSocket Security",
    });
  }

  // Recursive/infinite retry without backoff
  const retryPattern = /retry|retryCount|maxRetries|attempts?\s*[<>]/gi;
  const retryLines = getLineNumbers(code, retryPattern);
  const hasBackoffStrategy = /backoff|exponential|delay\s*\*|Math\.pow|jitter/gi.test(code);
  if (retryLines.length > 0 && !hasBackoffStrategy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Retry logic without exponential backoff",
      description: `Found ${retryLines.length} retry reference(s) without backoff or delay escalation. Retrying at a fixed rate can overwhelm downstream services and cause cascading failures.`,
      lineNumbers: retryLines,
      recommendation: "Use exponential backoff with jitter: delay = baseDelay * Math.pow(2, attempt) + randomJitter. Set a maximum retry count. Use libraries like 'p-retry' or 'axios-retry'.",
      reference: "AWS Architecture Blog: Exponential Backoff and Jitter",
    });
  }

  return findings;
}
