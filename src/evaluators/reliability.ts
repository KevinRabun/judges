import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeReliability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "REL";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect empty catch blocks (multi-language)
  const emptyCatchLines = getLangLineNumbers(code, language, LP.EMPTY_CATCH);
  if (emptyCatchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Empty catch block swallows errors",
      description: "Empty catch blocks silently discard errors, making failures invisible and debugging extremely difficult.",
      lineNumbers: emptyCatchLines,
      recommendation: "At minimum, log the error. Ideally, handle it appropriately, rethrow, or propagate to a global error handler.",
      reference: "Error Handling Best Practices",
      suggestedFix: "Log in catch blocks: catch (err) { logger.error({ err }, 'Operation failed'); throw err; } — never leave catch blocks empty.",
    });
  }

  // Detect missing timeout on network calls (multi-language)
  const noTimeoutLines: number[] = [];
  const httpClientLines = getLangLineNumbers(code, language, LP.HTTP_CLIENT);
  httpClientLines.forEach((ln) => {
    const idx = ln - 1;
    const context = lines.slice(idx, Math.min(lines.length, idx + 5)).join("\n");
    if (!/timeout|AbortController|signal|deadline|Duration|TimeSpan|time\.After/i.test(context)) {
      noTimeoutLines.push(ln);
    }
  });
  if (noTimeoutLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Network call without timeout",
      description: "Network calls without timeouts can hang indefinitely, causing resource exhaustion and cascading failures.",
      lineNumbers: noTimeoutLines,
      recommendation: "Set explicit timeouts on all network calls. Use AbortController with setTimeout for fetch, or timeout options for HTTP clients.",
      reference: "Resilience Patterns: Timeout",
      suggestedFix: "Add timeout: const controller = new AbortController(); setTimeout(() => controller.abort(), 5000); fetch(url, { signal: controller.signal });",
    });
  }

  // Detect missing retry logic for transient failures (multi-language)
  const externalCallLines = getLangLineNumbers(code, language, LP.HTTP_CLIENT).concat(
    getLangLineNumbers(code, language, LP.DB_QUERY)
  );
  const hasRetry = /retry|retries|backoff|exponential|tenacity|Polly|resilience4j|backoff::/i.test(code);
  if (externalCallLines.length > 2 && !hasRetry) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No retry logic for external calls",
      description: "Multiple external calls detected without retry logic. Transient failures (network blips, rate limits) will cause unnecessary errors.",
      lineNumbers: externalCallLines.slice(0, 5),
      recommendation: "Implement retry with exponential backoff for transient failures. Use libraries like p-retry, tenacity, Polly, Resilience4j, or backoff crate.",
      reference: "Resilience Patterns: Retry with Backoff",
      suggestedFix: "Add retry: import pRetry from 'p-retry'; const result = await pRetry(() => fetchData(), { retries: 3, minTimeout: 1000 });",
    });
  }

  // Detect single point of failure patterns
  const singleConnLines: number[] = [];
  lines.forEach((line, i) => {
    if (/new\s+(?:Client|Connection|Database)\s*\(/i.test(line) && !/pool|Pool/i.test(line)) {
      singleConnLines.push(i + 1);
    }
  });
  if (singleConnLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Single connection instead of connection pool",
      description: "Using a single database/service connection creates a single point of failure and limits concurrency.",
      lineNumbers: singleConnLines,
      recommendation: "Use connection pooling to improve resilience and throughput. Most database drivers support connection pools.",
      reference: "Database Connection Management",
      suggestedFix: "Replace single connection with pool: const pool = new Pool({ max: 10, idleTimeoutMillis: 30000 }); const client = await pool.connect(); try { ... } finally { client.release(); }",
    });
  }

  // Detect unchecked null/undefined access
  const unsafeAccessLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\w+\.\w+\.\w+\.\w+/.test(line) && !/\?\./g.test(line) && !/import|require|from\s/i.test(line)) {
      unsafeAccessLines.push(i + 1);
    }
  });
  if (unsafeAccessLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deep property access without null checks",
      description: "Deeply nested property access without optional chaining or null checks risks TypeError at runtime.",
      lineNumbers: unsafeAccessLines.slice(0, 5),
      recommendation: "Use optional chaining (?.) or explicit null checks for deeply nested property access.",
      reference: "Defensive Programming Practices",
      suggestedFix: "Use optional chaining: const value = obj?.nested?.deep?.prop ?? defaultValue; — prevents TypeError on null/undefined intermediaries.",
    });
  }

  // Detect process.exit / panic / System.exit (multi-language)
  const processExitLines = getLangLineNumbers(code, language, LP.PANIC_UNWRAP);
  if (processExitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Abrupt process termination detected",
      description: "Calling process.exit(), panic!(), System.exit(), or os.Exit() prevents graceful shutdown, skips cleanup handlers, and can cause data loss.",
      lineNumbers: processExitLines,
      recommendation: "Throw errors or use graceful shutdown patterns instead. Let the process exit naturally after cleanup. Reserve panics for truly unrecoverable situations.",
      reference: "Graceful Shutdown Patterns",
      suggestedFix: "Replace process.exit() with graceful shutdown: process.on('SIGTERM', async () => { await server.close(); await db.disconnect(); });",
    });
  }

  // Circuit breaker pattern missing
  const hasMultipleExternalCalls = externalCallLines.length > 3;
  const hasCircuitBreaker = /circuit.?breaker|CircuitBreaker|opossum|cockatiel|polly/i.test(code);
  if (hasMultipleExternalCalls && !hasCircuitBreaker) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No circuit breaker for external dependencies",
      description: "Multiple external calls without circuit breaker protection. A failing dependency can cause cascading failure across your system.",
      recommendation: "Implement the circuit breaker pattern (opossum, cockatiel, Polly) to fail fast when external dependencies are unhealthy.",
      reference: "Resilience Patterns: Circuit Breaker (Martin Fowler)",
      suggestedFix: "Add circuit breaker: import CircuitBreaker from 'opossum'; const breaker = new CircuitBreaker(fetchData, { timeout: 3000, errorThresholdPercentage: 50 }); await breaker.fire();",
    });
  }

  // Missing fallback / degraded mode
  const criticalCallLines: number[] = [];
  lines.forEach((line, i) => {
    if (/await\s+(?:fetch|axios|http)/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
      if (!/fallback|default|cached|stale|degraded/i.test(context) && /catch/i.test(context)) {
        criticalCallLines.push(i + 1);
      }
    }
  });
  if (criticalCallLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No fallback for failed external call",
      description: "External calls catch errors but don't provide fallback values or degraded functionality.",
      lineNumbers: criticalCallLines,
      recommendation: "Provide fallback behavior: cached responses, default values, or gracefully degraded features when dependencies fail.",
      reference: "Resilience Patterns: Fallback / Graceful Degradation",
      suggestedFix: "Add fallback: try { data = await fetchFromApi(); } catch { data = await cache.get(key) ?? DEFAULT_VALUE; logger.warn('Using fallback data'); }",
    });
  }

  // Missing idempotency for write operations
  const writeEndpointLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.(post|put|patch)\s*\(\s*["'`]/i.test(line) || /app\.post|router\.post/i.test(line)) {
      writeEndpointLines.push(i + 1);
    }
  });
  const hasIdempotency = /idempoten|idempotency.?key|x-idempotency/i.test(code);
  if (writeEndpointLines.length > 2 && !hasIdempotency) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Write endpoints without idempotency support",
      description: "POST/PUT endpoints without idempotency keys can cause duplicate operations when clients retry after network failures.",
      lineNumbers: writeEndpointLines.slice(0, 3),
      recommendation: "Accept an idempotency key header (Idempotency-Key) and use it to deduplicate write operations.",
      reference: "API Idempotency / Stripe Idempotency Pattern",
      suggestedFix: "Add idempotency: const key = req.headers['idempotency-key']; if (key && await cache.has(key)) return res.json(await cache.get(key)); // process then cache result.",
    });
  }

  // Panic/fatal in Go or System.exit in Java (already covered above, remove duplicate)
  // Skipping REL-010 equivalent since merged into process exit rule above
  ruleNum++; // keep numbering consistent

  // Unhandled promise rejection
  const unhandledPromiseLines: number[] = [];
  lines.forEach((line, i) => {
    if (/new\s+Promise\s*\(/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      if (!/reject|\.catch|try\s*\{/i.test(context)) {
        unhandledPromiseLines.push(i + 1);
      }
    }
  });
  if (unhandledPromiseLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Promise without rejection handling",
      description: "Promises created without reject handlers or .catch() can cause unhandled rejection crashes in Node.js.",
      lineNumbers: unhandledPromiseLines,
      recommendation: "Always handle promise rejections with .catch() or try/catch around await. Set up global unhandledRejection handler as safety net.",
      reference: "Node.js Unhandled Rejections",
      suggestedFix: "Add rejection handling: new Promise((resolve, reject) => { ... }).catch(err => logger.error(err)); or use try/catch with await.",
    });
  }

  return findings;
}
