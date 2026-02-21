import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeObservability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "OBS";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect console.log used instead of structured logging (multi-language)
  const consoleLogLines = getLangLineNumbers(code, language, LP.CONSOLE_LOG);
  if (consoleLogLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Console logging instead of structured logger",
      description: "Using console.log for application logging produces unstructured output that is difficult to search, filter, and alert on in production.",
      lineNumbers: consoleLogLines.slice(0, 5),
      recommendation: "Use a structured logging library (winston/pino for JS, logging for Python, slog for Go, serilog for C#, log4j for Java, tracing for Rust) with log levels, timestamps, and correlation IDs.",
      reference: "Observability Best Practices: Structured Logging",
    });
  }

  // Detect missing error context in catch blocks
  const catchNoContextLines: number[] = [];
  lines.forEach((line, i) => {
    if (/catch\s*\(\s*(\w+)\s*\)/.test(line)) {
      const varName = line.match(/catch\s*\(\s*(\w+)\s*\)/)?.[1];
      const catchBody = lines.slice(i + 1, Math.min(lines.length, i + 8)).join("\n");
      if (varName && /console\.log|logger\.\w+/i.test(catchBody) && !new RegExp(varName).test(catchBody)) {
        catchNoContextLines.push(i + 1);
      }
    }
  });
  if (catchNoContextLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Error logged without error context",
      description: "Catch blocks that log messages without including the caught error object make debugging impossible.",
      lineNumbers: catchNoContextLines,
      recommendation: "Always include the error object, stack trace, and relevant context (request ID, user ID, operation) in error logs.",
      reference: "Error Logging Best Practices",
    });
  }

  // Detect missing health check endpoints (multi-language)
  const hasRoutes = /app\.(get|post|use)|router\.(get|post)|@app\.route|@GetMapping|@PostMapping|http\.HandleFunc|actix_web|rocket::get/i.test(code);
  const hasHealthCheck = /health|readiness|liveness|\/ready|\/live|\/healthz/i.test(code);
  if (hasRoutes && !hasHealthCheck) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No health check endpoint detected",
      description: "HTTP services should expose health check endpoints for load balancers, orchestrators, and monitoring systems.",
      recommendation: "Add /health or /healthz endpoint that checks critical dependencies (database, cache, external services).",
      reference: "Kubernetes Health Checks / Azure App Service Health Check",
    });
  }

  // Detect string concatenation in log statements
  const concatLogLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:console|logger)\.\w+\s*\(\s*.*\+\s*/i.test(line)) {
      concatLogLines.push(i + 1);
    }
  });
  if (concatLogLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "String concatenation in log statements",
      description: "Using string concatenation in log statements prevents structured parsing and may cause unnecessary string allocation when log level is filtered.",
      lineNumbers: concatLogLines,
      recommendation: "Use structured log parameters: logger.info('User action', { userId, action }) instead of string concatenation.",
      reference: "Structured Logging Best Practices",
    });
  }

  // Detect missing request/correlation ID
  const hasMiddleware = /app\.use|middleware/i.test(code);
  const hasCorrelation = /correlation|requestId|request-id|x-request-id|trace-id|traceId/i.test(code);
  if (hasMiddleware && !hasCorrelation && hasRoutes) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No request correlation ID detected",
      description: "Without correlation IDs, tracing requests across services and log entries is extremely difficult.",
      recommendation: "Generate or propagate a unique request/correlation ID for each incoming request. Include it in all log entries.",
      reference: "Distributed Tracing: Correlation IDs",
    });
  }

  // Sensitive data in logs (multi-language)
  const sensitiveLogLines: number[] = [];
  lines.forEach((line, i) => {
    const executableLine = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
    if (/(?:console|logger|log|logging|println|print|eprintln|fmt\.Print|Debug\.Log)\s*[.(]/i.test(executableLine) && /\b(?:password|secret|token|apiKey|api_key|ssn|creditCard|credit_card|authorization)\b/i.test(executableLine)) {
      sensitiveLogLines.push(i + 1);
    }
  });
  if (sensitiveLogLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Sensitive data potentially logged",
      description: "Log statements appear to include sensitive fields (password, token, API key, SSN, credit card). This violates security and compliance requirements.",
      lineNumbers: sensitiveLogLines,
      recommendation: "Never log sensitive data. Use redaction middleware or mask sensitive fields before logging. Audit all log statements for PII/secrets.",
      reference: "OWASP Logging Cheat Sheet / PCI DSS Requirement 3",
    });
  }

  // Missing metrics/instrumentation (multi-language)
  const hasMetrics = /metrics|prometheus|statsd|datadog|newrelic|appInsights|applicationInsights|opentelemetry|otlp|micrometer|System\.Diagnostics\.Metrics/i.test(code);
  if (hasRoutes && !hasMetrics && lines.length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No application metrics/instrumentation detected",
      description: "No metrics collection framework detected. Without metrics, you cannot measure latency, error rates, throughput, or saturation.",
      recommendation: "Add metrics instrumentation (OpenTelemetry, Prometheus client, Application Insights SDK) to track RED metrics (Rate, Errors, Duration).",
      reference: "Google SRE: The Four Golden Signals",
    });
  }

  // Missing distributed tracing (multi-language)
  const hasTracing = /opentelemetry|jaeger|zipkin|trace|span|@opentelemetry|dd-trace|newrelic|tracing::|Activity\.Start|opentracing/i.test(code);
  if (hasRoutes && !hasTracing && lines.length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No distributed tracing detected",
      description: "No tracing instrumentation detected. Distributed tracing is essential for debugging latency issues across microservices.",
      recommendation: "Integrate OpenTelemetry or a tracing provider (Jaeger, Zipkin, Datadog APM) to track requests across service boundaries.",
      reference: "OpenTelemetry / Distributed Tracing Standard",
    });
  }

  // Inconsistent log levels
  const logLevelCounts: Record<string, number> = {};
  lines.forEach((line) => {
    const match = line.match(/(?:console|logger)\.(debug|info|warn|error|trace|fatal)\s*\(/i);
    if (match) {
      logLevelCounts[match[1].toLowerCase()] = (logLevelCounts[match[1].toLowerCase()] || 0) + 1;
    }
  });
  if (logLevelCounts["error"] && logLevelCounts["error"] > 0 && !logLevelCounts["info"] && !logLevelCounts["warn"]) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Unbalanced log level usage",
      description: "Only error-level logs are used, with no info or warn levels. This makes it harder to understand normal application behavior.",
      recommendation: "Use appropriate log levels: debug for development, info for normal operations, warn for anomalies, error for failures.",
      reference: "Log Level Best Practices",
    });
  }

  // Missing audit logging for important operations
  const securityOpLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:login|logout|signIn|signOut|createUser|deleteUser|changePassword|updateRole|grant|revoke)\s*[=(]/i.test(line)) {
      securityOpLines.push(i + 1);
    }
  });
  const hasAuditLog = /audit|auditLog|audit_log/i.test(code);
  if (securityOpLines.length > 0 && !hasAuditLog) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Security-sensitive operations without audit logging",
      description: "Login, role changes, and user management operations should have dedicated audit logging for security compliance.",
      lineNumbers: securityOpLines.slice(0, 5),
      recommendation: "Implement audit logging for authentication, authorization, and user management events. Include who, what, when, and from where.",
      reference: "OWASP Logging Cheat Sheet / SOC2 Audit Requirements",
    });
  }

  return findings;
}
