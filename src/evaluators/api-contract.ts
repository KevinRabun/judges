import type { Finding } from "../types.js";
import { getLineNumbers, getLangFamily } from "./shared.js";

/**
 * Deterministic evaluator for API contract conformance.
 *
 * Detects common API design violations: missing input validation on endpoints,
 * untyped request/response bodies, missing error responses, inconsistent
 * status codes, missing Content-Type headers, and undocumented endpoints.
 */
export function analyzeApiContract(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const prefix = "API";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Only relevant for languages that typically define API endpoints
  if (!["typescript", "javascript", "python", "java", "csharp", "go", "ruby"].includes(lang)) {
    return findings;
  }

  // Detect if file contains API route/endpoint definitions
  const hasRoutes =
    /\.(get|post|put|patch|delete)\s*\(/.test(code) ||
    /@(Get|Post|Put|Patch|Delete|RequestMapping|ApiOperation)\b/.test(code) ||
    /router\.(get|post|put|patch|delete)\b/.test(code) ||
    /app\.(get|post|put|patch|delete)\s*\(/.test(code) ||
    /@app\.(route|get|post|put|patch|delete)\b/.test(code) ||
    /func\s+\w+.*http\.(ResponseWriter|Request)\b/.test(code);

  if (!hasRoutes) return findings;

  // File-level validation: if the file uses validation middleware, skip API-001
  const hasFileValidation =
    /require\s*\(\s*['"](?:express-validator|joi|zod|celebrate|ajv|class-validator)['"]\s*\)/.test(code) ||
    /import\s+.*from\s+['"](?:express-validator|joi|zod|celebrate|ajv|class-validator)['"]/i.test(code) ||
    /express\.json\s*\(/.test(code) ||
    /bodyParser\.json/.test(code);

  // ── API-001: Missing input validation on route handlers ───────────────
  const routeHandlerPattern =
    /\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]\s*,\s*(?:async\s+)?(?:function\s*)?\(/g;
  const lines = code.split("\n");
  const handlerLines: number[] = [];
  let match: RegExpExecArray | null;
  if (!hasFileValidation) {
    while ((match = routeHandlerPattern.exec(code)) !== null) {
      const lineNum = code.slice(0, match.index).split("\n").length;
      // Check if there's validation in the handler body (next ~15 lines)
      const bodySlice = lines.slice(lineNum - 1, lineNum + 14).join("\n");
      const hasValidation =
        /\b(validate|schema|zod|joi|yup|class-validator|ajv|celebrate|express-validator|z\.object|Joi\.|body\(\)|param\(|query\(|check\(|sanitize|assert)\b/i.test(
          bodySlice,
        ) ||
        /if\s*\(\s*!?\s*req\.body/i.test(bodySlice) || // manual type guard on req.body
        /typeof\s+req\.body/i.test(bodySlice) || // typeof check
        /req\.(body|params|query)\s*\)\s*;/.test(bodySlice) === false;

      // Only flag POST/PUT/PATCH (methods that accept bodies) without validation
      const method = match[1];
      if (["post", "put", "patch"].includes(method) && !hasValidation) {
        handlerLines.push(lineNum);
      }
    }
  } // end hasFileValidation guard
  // Require at least 2 unvalidated mutation endpoints to reduce false
  // positives — a single endpoint is often validated via external middleware.
  if (handlerLines.length > 1) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Missing input validation on mutation endpoint",
      description:
        "POST/PUT/PATCH route handlers do not appear to validate request body input. " +
        "Unvalidated input can lead to injection attacks, data corruption, and crashes.",
      lineNumbers: handlerLines,
      recommendation:
        "Add schema validation using a library like Zod, Joi, express-validator, or class-validator " +
        "to validate request bodies before processing.",
      reference: "OWASP A03:2021 Injection / CWE-20 Improper Input Validation",
      confidence: 0.7,
    });
  }

  // ── API-002: Missing error status codes ───────────────────────────────
  ruleNum = 2;
  const hasErrorResponses =
    /res\.status\s*\(\s*(4\d{2}|5\d{2})\s*\)/.test(code) ||
    /HttpStatus\.(BAD_REQUEST|NOT_FOUND|INTERNAL_SERVER|UNAUTHORIZED|FORBIDDEN)/.test(code) ||
    /status_code\s*=\s*(4\d{2}|5\d{2})/.test(code) ||
    /StatusCode\s*=\s*(4\d{2}|5\d{2})/.test(code) ||
    /\.Error\(/.test(code) ||
    /throw\s+new\s+\w*(Error|Exception)/.test(code) ||
    /http\.Error\b/.test(code) ||
    /abort\s*\(\s*(4|5)\d{2}\)/.test(code) ||
    /next\s*\(\s*(?:err|new\s+\w*Error)/.test(code) ||
    /catch\s*\(/.test(code) ||
    /except\s/.test(code) || // Python try/except
    /raise\s+\w*(Error|Exception|Http)/.test(code) || // Python raise
    /HttpResponse(?:BadRequest|NotFound|Forbidden|ServerError|NotAllowed)/.test(code) ||
    /HttpException|HttpResponseError|BadRequestException|NotFoundException/.test(code) ||
    /JsonResponse\s*\(.*status\s*=/.test(code) || // Django JsonResponse with status
    /response\.status\s*\(\s*(4\d{2}|5\d{2})/.test(code) ||
    /return\s+Response\s*\(/.test(code); // DRF Response

  if (!hasErrorResponses) {
    const routeLines = getLineNumbers(code, /\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/);
    if (routeLines.length > 1) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "No error responses in API handlers",
        description:
          "API route handlers do not return any error status codes (4xx/5xx). " +
          "Clients need proper error responses for handling failures gracefully.",
        lineNumbers: routeLines.slice(0, 3),
        recommendation:
          "Return appropriate HTTP error status codes (400 for bad input, 404 for not found, " +
          "401/403 for auth failures, 500 for server errors) with descriptive error bodies.",
        reference: "REST API Best Practices / RFC 9110",
        confidence: 0.65,
      });
    }
  }

  // ── API-003: Hardcoded status code 200 for all responses ──────────────
  ruleNum = 3;
  const ok200Lines = getLineNumbers(code, /res\.status\s*\(\s*200\s*\)/);
  const created201 = /res\.status\s*\(\s*201\s*\)/.test(code);
  const noContent204 = /res\.status\s*\(\s*204\s*\)/.test(code);
  const hasPostRoutes = /\.(post)\s*\(/.test(code);
  const hasDeleteRoutes = /\.(delete)\s*\(/.test(code);

  if (ok200Lines.length > 2 && !created201 && (hasPostRoutes || hasDeleteRoutes)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Generic 200 status for all responses",
      description:
        "All endpoints return 200 OK regardless of operation. POST should return 201 Created, " +
        "DELETE should return 204 No Content for proper REST semantics.",
      lineNumbers: ok200Lines.slice(0, 3),
      recommendation:
        "Use semantically correct status codes: 201 for resource creation (POST), " +
        "204 for successful deletion (DELETE), 200 for retrieval (GET).",
      reference: "RFC 9110 HTTP Semantics",
      confidence: 0.75,
    });
  }

  // ── API-004: Missing Content-Type / Accept headers ────────────────────
  ruleNum = 4;
  const sendsJson = /res\.(json|send)\s*\(/.test(code) || /\.json\s*\(/.test(code);
  const setsContentType =
    /['"]content-type['"]/i.test(code) ||
    /\.type\s*\(\s*['"]application\/json['"]\s*\)/.test(code) ||
    /res\.json\s*\(/.test(code); // res.json() automatically sets Content-Type
  const usesJsonMiddleware = /express\.json\s*\(/.test(code) || /bodyParser\.json/.test(code);

  if (sendsJson && !setsContentType && !usesJsonMiddleware) {
    const jsonLines = getLineNumbers(code, /res\.(json|send)\s*\(/);
    if (jsonLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Missing Content-Type configuration",
        description:
          "API sends JSON responses but does not explicitly set Content-Type headers " +
          "or use JSON middleware. Some frameworks set this automatically, but explicit " +
          "configuration prevents content-type sniffing issues.",
        lineNumbers: jsonLines.slice(0, 2),
        recommendation:
          "Use `express.json()` middleware or explicitly set `res.type('application/json')` " +
          "to ensure proper Content-Type headers on all responses.",
        reference: "OWASP Secure Headers / RFC 9110",
        confidence: 0.55,
      });
    }
  }

  // ── API-005: Missing rate limiting on public endpoints ────────────────
  ruleNum = 5;
  const hasRateLimiting =
    /rate.?limit/i.test(code) ||
    /throttl/i.test(code) ||
    /express-rate-limit/.test(code) ||
    /bottleneck/i.test(code) ||
    /@Throttle\b/.test(code);

  if (!hasRateLimiting) {
    const allRouteLines = getLineNumbers(code, /\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]/);
    if (allRouteLines.length >= 3) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "No rate limiting on API endpoints",
        description:
          "Multiple API endpoints are defined without any rate limiting. " +
          "Without rate limiting, APIs are vulnerable to abuse, DDoS, and brute-force attacks.",
        lineNumbers: allRouteLines.slice(0, 2),
        recommendation:
          "Add rate limiting middleware (e.g., express-rate-limit) to protect endpoints " +
          "from abuse. Apply stricter limits on authentication and mutation endpoints.",
        reference: "OWASP API Security Top 10: API4 Unrestricted Resource Consumption",
        confidence: 0.6,
        isAbsenceBased: true,
      });
    }
  }

  // ── API-006: Missing versioning in API routes ─────────────────────────
  ruleNum = 6;
  const routePaths: string[] = [];
  const routePathPattern = /\.(get|post|put|patch|delete)\s*\(\s*['"](\/[^'"]*)['"]/g;
  let rpm: RegExpExecArray | null;
  while ((rpm = routePathPattern.exec(code)) !== null) {
    routePaths.push(rpm[2]);
  }
  if (routePaths.length >= 3) {
    const hasVersioning = routePaths.some((p) => /\/v\d+\//i.test(p));
    if (!hasVersioning) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "info",
        title: "No API versioning in route paths",
        description:
          "API routes do not include version prefixes (e.g., /v1/, /v2/). " +
          "Without versioning, breaking changes affect all clients simultaneously.",
        lineNumbers: getLineNumbers(code, /\.(get|post|put|patch|delete)\s*\(\s*['"]\/[^'"]+['"]/).slice(0, 2),
        recommendation:
          "Add version prefixes to API routes (e.g., '/api/v1/users') or use header-based " +
          "versioning (Accept header) to enable non-breaking evolution.",
        reference: "REST API Versioning Best Practices",
        confidence: 0.7,
        isAbsenceBased: true,
      });
    }
  }

  return findings;
}
