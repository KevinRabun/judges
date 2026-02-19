import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeScalability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SCALE";

  // Global mutable state
  const globalStateLines = getLineNumbers(code, /^(?:let|var)\s+\w+\s*=\s*(?:\[|\{|new\s)/);
  if (globalStateLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Global mutable state detected",
      description: "Top-level mutable variables (let/var with object/array initialization) create shared state that prevents safe horizontal scaling across multiple instances.",
      lineNumbers: globalStateLines,
      recommendation: "Externalize state to a database, cache (Redis), or message queue. Use const for configuration and immutable data. Each instance should be stateless.",
      reference: "12-Factor App: Processes (Factor VI)",
    });
  }

  // In-memory session/store
  const inMemPattern = /(?:Map|Set|WeakMap|Object\.create)\s*\(\s*\)|session\s*[:=].*\{\}|(?:store|cache|registry)\s*=\s*(?:new\s+Map|\{\}|\[\])|MemoryStore|express-session\s*\(\s*\)/gi;
  const inMemLines = getLineNumbers(code, inMemPattern);
  if (inMemLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "In-memory data store may not scale",
      description: "Data stored in process memory is lost on restart and not shared across instances. This breaks horizontal scaling where requests may hit different instances.",
      lineNumbers: inMemLines,
      recommendation: "Use a distributed store (Redis, Memcached, database) for session data, caches, and shared state.",
      reference: "Distributed Systems Best Practices",
    });
  }

  // Synchronous blocking in hot paths (multi-language)
  const blockingPattern = /Sync\s*\(|\.sleep\s*\(|Thread\.sleep|time\.sleep|threading\.Event\(\)\.wait|Task\.Delay.*\.Wait\(\)|\.Result\b/gi;
  const blockingLines = getLineNumbers(code, blockingPattern);
  if (blockingLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Synchronous blocking operation",
      description: "Blocking/synchronous operations in the request path limit concurrency and throughput. Under load, this creates a bottleneck that prevents scaling.",
      lineNumbers: blockingLines,
      recommendation: "Use asynchronous alternatives (async/await, promises, non-blocking I/O). Move long-running work to background queues.",
      reference: "Reactive & Non-Blocking Architecture Patterns",
    });
  }

  // No timeout on external calls
  const fetchPattern = /fetch\s*\(|axios\s*\.|http\s*\.\s*(?:get|post|put|delete|request)|\.request\s*\(|requests\.(get|post)|HttpClient|WebClient/gi;
  const hasTimeout = /timeout|Timeout|deadline|AbortController/gi.test(code);
  const fetchLines = getLineNumbers(code, fetchPattern);
  if (fetchLines.length > 0 && !hasTimeout) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "External calls without timeout",
      description: "HTTP/API calls without timeouts can hang indefinitely, consuming resources and cascading failures through the system when downstream services are slow.",
      lineNumbers: fetchLines,
      recommendation: "Set explicit timeouts on all external calls (e.g., 5-30 seconds). Implement circuit breakers (e.g., using libraries like cockatiel or opossum) for critical dependencies.",
      reference: "Release It! — Stability Patterns",
    });
  }

  // Single-threaded heavy computation
  const heavyCompPattern = /(?:for|while)\s*\(.*(?:length|size|count).*\)[\s\S]{0,200}(?:for|while)\s*\(/gi;
  if (heavyCompPattern.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "CPU-intensive computation may block scaling",
      description: "Heavy computation on the main thread can starve other requests. In Node.js, this blocks the event loop; in other runtimes, it consumes thread pool capacity.",
      recommendation: "Offload CPU-intensive work to worker threads, a job queue (Bull, Celery), or a dedicated compute service. Consider WebAssembly for hot-path computation.",
      reference: "Node.js Worker Threads / Job Queue Patterns",
    });
  }

  // No rate limiting detected
  const hasRateLimit = /rate.?limit|throttle|limiter|RateLimit/gi.test(code);
  if (!hasRateLimit && fetchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No rate limiting detected",
      description: "No rate limiting or throttling mechanism is visible. Without rate limiting, the system is vulnerable to being overwhelmed by traffic spikes or abuse.",
      recommendation: "Implement rate limiting at the API gateway or application level. Consider token bucket or sliding window algorithms. Use libraries like express-rate-limit or a cloud-native solution.",
      reference: "API Security & Scalability Best Practices",
    });
  }

  // File-based locking / local mutex
  const fileLockPattern = /flock\s*\(|lockfile|\.lock\s*\(|FileLock|fcntl\.flock|Mutex\s*\(\s*\)|new\s+Semaphore/gi;
  const fileLockLines = getLineNumbers(code, fileLockPattern);
  if (fileLockLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Local file/process locking won't work at scale",
      description: "File-based locks and process-local mutexes only work on a single machine. In a multi-instance deployment, they cannot coordinate across instances.",
      lineNumbers: fileLockLines,
      recommendation: "Use distributed locks (Redis SETNX/Redlock, ZooKeeper, etcd) or database-level locking for cross-instance coordination.",
      reference: "Distributed Locking Patterns",
    });
  }

  // Sticky session / session affinity assumptions
  const stickySessionPattern = /session\s*\{|express-session|SessionMiddleware|sticky|affinity/gi;
  const stickySessionLines = getLineNumbers(code, stickySessionPattern);
  const hasExternalSession = /redis|memcached|dynamodb|MongoStore|connect-redis|connect-mongo/gi.test(code);
  if (stickySessionLines.length > 0 && !hasExternalSession) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Session storage may require sticky sessions",
      description: "In-process session storage requires sticky sessions (session affinity), which limits load balancer flexibility and complicates rolling deployments.",
      lineNumbers: stickySessionLines,
      recommendation: "Use an external session store (Redis, DynamoDB, database) so any instance can serve any request. This enables zero-downtime deployments.",
      reference: "Scalable Session Management",
    });
  }

  // Hardcoded thread/worker pool sizes
  const hardcodedPoolPattern = /(?:pool|workers|threads|maxWorkers|poolSize|max_workers)\s*[:=]\s*\d+/gi;
  const hardcodedPoolLines = getLineNumbers(code, hardcodedPoolPattern);
  if (hardcodedPoolLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Hardcoded thread/worker pool size",
      description: "Hardcoded pool sizes may not be optimal across different deployment environments (dev machine vs. production container with different CPU/memory).",
      lineNumbers: hardcodedPoolLines,
      recommendation: "Configure pool sizes via environment variables or derive from available resources (os.cpus().length). Allow runtime tuning.",
      reference: "Resource Configuration Best Practices",
    });
  }

  // No circuit breaker pattern
  const hasCircuitBreaker = /circuit.?breaker|opossum|cockatiel|polly|resilience4j|hystrix|CircuitBreaker/gi.test(code);
  const hasMultipleExternalCalls = fetchLines.length > 2;
  if (hasMultipleExternalCalls && !hasCircuitBreaker) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No circuit breaker for external dependencies",
      description: "Multiple external service calls detected without circuit breaker protection. A failing dependency can cascade and bring down the entire system.",
      recommendation: "Implement circuit breakers (opossum, cockatiel, Resilience4j, Polly) to fail fast when dependencies are down. Configure fallbacks.",
      reference: "Release It! — Circuit Breaker Pattern",
    });
  }

  // Monolithic query / large payload assembly
  const largePayloadPattern = /JSON\.stringify\s*\(.*\bdata\b|res\.json\s*\(\s*\{[\s\S]{0,50}\.findAll|\.aggregate\s*\(\s*\[[\s\S]{200,}/gi;
  if (largePayloadPattern.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potentially large response payload",
      description: "Large response payloads increase serialization time, network transfer, and client memory usage. This limits throughput at scale.",
      recommendation: "Implement pagination, field filtering (sparse fieldsets), or streaming for large responses. Consider GraphQL for client-driven field selection.",
      reference: "API Scalability Patterns",
    });
  }

  // WebSocket without connection limits
  const wsPattern = /WebSocket|ws\s*\(|socket\.io|Socket\s*\(|socketserver/gi;
  const wsLines = getLineNumbers(code, wsPattern);
  const hasWsLimit = /maxPayload|maxConnections|connectionLimit|max_connections/gi.test(code);
  if (wsLines.length > 0 && !hasWsLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "WebSocket without connection limits",
      description: "WebSocket servers without connection/payload limits are vulnerable to resource exhaustion from too many connections or oversized messages.",
      lineNumbers: wsLines,
      recommendation: "Set maxPayload size, maximum connection limits, and implement connection throttling. Use a WebSocket gateway for production scale.",
      reference: "WebSocket Security & Scalability",
    });
  }

  return findings;
}
