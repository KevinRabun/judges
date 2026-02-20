import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeApiDesign(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "API";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect inconsistent HTTP methods
  const verbInUrlLines: number[] = [];
  lines.forEach((line, i) => {
    if (/["'`]\/(?:api\/)?(?:get|fetch|create|delete|remove|update|add|set)[A-Z]/i.test(line)) {
      verbInUrlLines.push(i + 1);
    }
  });
  if (verbInUrlLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Verb in REST endpoint URL",
      description: "REST endpoint URLs should use nouns, not verbs. The HTTP method should convey the action.",
      lineNumbers: verbInUrlLines,
      recommendation: "Use noun-based URLs (e.g., POST /users instead of POST /createUser). Let HTTP methods convey the action.",
      reference: "REST API Design Best Practices",
    });
  }

  // Detect missing error response handling
  const noErrorHandlingLines: number[] = [];
  lines.forEach((line, i) => {
    if (/res\.(?:json|send)\s*\(/i.test(line)) {
      // Check surrounding lines for status code setting
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join("\n");
      if (!/status\s*\(\s*[45]\d\d\s*\)/i.test(context) && /catch|error|err\b/i.test(context)) {
        noErrorHandlingLines.push(i + 1);
      }
    }
  });
  if (noErrorHandlingLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Error response without proper HTTP status code",
      description: "API error responses should use appropriate HTTP status codes (4xx for client errors, 5xx for server errors).",
      lineNumbers: noErrorHandlingLines,
      recommendation: "Always set appropriate HTTP status codes for error responses. Use 400 for bad requests, 404 for not found, 500 for server errors.",
      reference: "RFC 7231 - HTTP/1.1 Semantics and Content",
    });
  }

  // Detect overly broad API responses (returning everything)
  const selectAllLines: number[] = [];
  lines.forEach((line, i) => {
    if (/SELECT\s+\*/i.test(line) && /api|route|endpoint|handler|controller/i.test(lines.slice(Math.max(0, i - 10), i).join("\n"))) {
      selectAllLines.push(i + 1);
    }
  });
  if (selectAllLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "SELECT * in API handler",
      description: "Returning all columns from a database query in an API response may expose sensitive data and waste bandwidth.",
      lineNumbers: selectAllLines,
      recommendation: "Explicitly select only the fields needed for the API response. Use DTOs or view models to shape the output.",
      reference: "API Security Best Practices",
    });
  }

  // Detect missing pagination
  const listEndpointLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.get\s*\(\s*["'`]\/.*s["'`]/i.test(line) || /router\.get.*(?:list|all|index)/i.test(line)) {
      const fnBody = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
      if (!/page|limit|offset|cursor|skip|take|per_page|pageSize/i.test(fnBody)) {
        listEndpointLines.push(i + 1);
      }
    }
  });
  if (listEndpointLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "List endpoint without pagination",
      description: "API endpoints that return collections should support pagination to prevent unbounded responses.",
      lineNumbers: listEndpointLines,
      recommendation: "Implement pagination using limit/offset, cursor-based, or page-based approaches. Include total count and navigation links.",
      reference: "REST API Design: Pagination",
    });
  }

  // Detect missing API versioning (multi-language)
  const routeRegLines: number[] = [];
  let hasVersioning = false;
  lines.forEach((line, i) => {
    if (/\/v\d+\//i.test(line) || /api-version|x-api-version/i.test(line)) {
      hasVersioning = true;
    }
    if (/app\.(get|post|put|patch|delete)\s*\(\s*["'`]\//i.test(line) || /router\.(get|post|put|patch|delete)/i.test(line)
      || /@(Get|Post|Put|Delete|Patch)Mapping/i.test(line) || /@app\.(get|post|put|delete)\s*\(/i.test(line)
      || /http\.HandleFunc/i.test(line) || /#\[(?:get|post|put|delete)\s*\(/i.test(line)) {
      routeRegLines.push(i + 1);
    }
  });
  if (routeRegLines.length > 2 && !hasVersioning) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No API versioning detected",
      description: "APIs should be versioned to allow backward-compatible evolution.",
      lineNumbers: routeRegLines.slice(0, 3),
      recommendation: "Add API versioning via URL path (/v1/resource), header (X-API-Version), or query parameter.",
      reference: "API Versioning Best Practices",
    });
  }

  // Detect inconsistent response format
  const jsonFormats: { line: number; hasData: boolean; hasError: boolean }[] = [];
  lines.forEach((line, i) => {
    if (/res\.json\s*\(\s*\{/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
      jsonFormats.push({
        line: i + 1,
        hasData: /\bdata\s*:/i.test(context),
        hasError: /\berror\s*:/i.test(context),
      });
    }
  });
  const withData = jsonFormats.filter((f) => f.hasData);
  const withoutData = jsonFormats.filter((f) => !f.hasData && !f.hasError);
  if (withData.length > 0 && withoutData.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inconsistent API response structure",
      description: "Some responses use a wrapper (e.g., { data: ... }) while others return raw data. This inconsistency complicates client consumption.",
      lineNumbers: withoutData.map((f) => f.line),
      recommendation: "Adopt a consistent response envelope (e.g., { data, meta, errors }) across all endpoints.",
      reference: "JSON:API Specification / API Response Standards",
    });
  }

  // Missing content-type validation
  const bodyParsingLines: number[] = [];
  lines.forEach((line, i) => {
    if (/req\.body|request\.body|ctx\.request\.body/i.test(line)) {
      bodyParsingLines.push(i + 1);
    }
  });
  const hasContentTypeCheck = /content-type|content_type|contentType|express\.json|bodyParser/i.test(code);
  if (bodyParsingLines.length > 0 && !hasContentTypeCheck) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Request body used without content-type validation",
      description: "Consuming request bodies without verifying Content-Type can lead to parsing errors or security issues.",
      lineNumbers: bodyParsingLines.slice(0, 5),
      recommendation: "Use body-parsing middleware (express.json()) and validate Content-Type headers. Reject requests with unexpected content types.",
      reference: "API Security: Content-Type Validation",
    });
  }

  // Sensitive data in URL/query parameters
  const sensitiveInUrlLines: number[] = [];
  lines.forEach((line, i) => {
    if (/req\.(?:params|query)\s*\.\s*(?:password|token|secret|apiKey|api_key|ssn|credit)/i.test(line)) {
      sensitiveInUrlLines.push(i + 1);
    }
    if (/["'`]\/.*[:?].*(?:password|token|secret|apiKey|api_key)/i.test(line)) {
      sensitiveInUrlLines.push(i + 1);
    }
  });
  if (sensitiveInUrlLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Sensitive data in URL/query parameters",
      description: "Passwords, tokens, and secrets in URL paths or query strings are logged in server access logs, browser history, and proxy caches.",
      lineNumbers: sensitiveInUrlLines,
      recommendation: "Pass sensitive data in request headers (Authorization) or request body, never in URLs or query parameters.",
      reference: "OWASP API Security Top 10 / CWE-598",
    });
  }

  // Missing rate limiting (multi-language)
  const hasRoutes2 = /app\.(get|post|put|delete)|router\.(get|post|put|delete)|@GetMapping|@PostMapping|@app\.route|http\.HandleFunc|#\[get|#\[post/i.test(code);
  const hasRateLimit = /rate.?limit|throttle|express-rate-limit|rateLimit|slowDown|@RateLimiter|Bucket4j|x-ratelimit|golang\.org\/x\/time\/rate/i.test(code);
  if (hasRoutes2 && !hasRateLimit && routeRegLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No rate limiting detected on API",
      description: "APIs without rate limiting are vulnerable to abuse, denial-of-service attacks, and excessive resource consumption.",
      recommendation: "Add rate limiting middleware (express-rate-limit, bottleneck). Consider different limits for authenticated vs unauthenticated users.",
      reference: "OWASP API Security: Unrestricted Resource Consumption",
    });
  }

  // GraphQL: no query depth/complexity limiting
  const hasGraphQL = /graphql|typeDefs|resolvers|gql`/i.test(code);
  const hasDepthLimit = /depthLimit|complexity|maxDepth|queryComplexity/i.test(code);
  if (hasGraphQL && !hasDepthLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "GraphQL without query depth/complexity limits",
      description: "GraphQL APIs without depth or complexity limits are vulnerable to denial-of-service via deeply nested or expensive queries.",
      recommendation: "Add graphql-depth-limit and graphql-query-complexity middleware. Set reasonable maxDepth (e.g., 10) and cost limits.",
      reference: "GraphQL Security: Query Complexity Analysis",
    });
  }

  // Missing CORS configuration
  const hasCors = /cors|Access-Control-Allow-Origin|allowedOrigins/i.test(code);
  if (hasRoutes2 && !hasCors && routeRegLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No CORS configuration detected",
      description: "APIs consumed by browsers need proper CORS configuration. Missing CORS will block cross-origin requests.",
      recommendation: "Configure CORS with specific allowed origins (not '*' in production). Use the cors middleware in Express.",
      reference: "MDN: Cross-Origin Resource Sharing (CORS)",
    });
  }

  // Missing request ID in responses
  const hasRequestId = /x-request-id|requestId|correlationId|traceId/i.test(code);
  if (hasRoutes2 && !hasRequestId && routeRegLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No request ID in API responses",
      description: "Returning a unique request ID in API responses helps clients reference specific requests when reporting issues.",
      recommendation: "Generate a UUID for each request and return it in a X-Request-ID response header. Include it in all log entries.",
      reference: "API Observability: Request Correlation",
    });
  }

  return findings;
}
