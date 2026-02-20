import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeLoggingPrivacy(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "LOGPRIV";

  // Logging authorization/token headers
  const logAuthPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:authorization|bearer|token|auth)/gi;
  const logAuthLines = getLineNumbers(code, logAuthPattern);
  if (logAuthLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Authentication tokens logged",
      description: `Found ${logAuthLines.length} instance(s) where authentication tokens or authorization headers are logged. Tokens in logs can be used for session hijacking.`,
      lineNumbers: logAuthLines,
      recommendation: "Never log authentication tokens, Authorization headers, or session IDs. If request logging is needed, redact sensitive headers before logging.",
      reference: "OWASP Logging Cheat Sheet / CWE-532",
    });
  }

  // Logging passwords
  const logPasswordPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:password|passwd|pwd|secret|credential)/gi;
  const logPasswordLines = getLineNumbers(code, logPasswordPattern);
  if (logPasswordLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Passwords/secrets logged",
      description: `Found ${logPasswordLines.length} instance(s) where passwords or secrets appear in log statements. This exposes credentials in log files, monitoring systems, and SIEM tools.`,
      lineNumbers: logPasswordLines,
      recommendation: "Never log passwords, credentials, or secrets. Implement a log sanitizer that redacts sensitive fields automatically.",
      reference: "OWASP Logging Cheat Sheet / GDPR Art. 5(1)(f)",
    });
  }

  // Logging PII (email, name, SSN, phone)
  const logPiiPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:email|ssn|phone|address|name|firstName|lastName|dateOfBirth|dob|social.?security)/gi;
  const logPiiLines = getLineNumbers(code, logPiiPattern);
  if (logPiiLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Personally Identifiable Information (PII) in logs",
      description: `Found ${logPiiLines.length} instance(s) where PII may be logged. PII in logs violates data minimization principles and may breach GDPR/CCPA requirements.`,
      lineNumbers: logPiiLines,
      recommendation: "Redact PII before logging. Use anonymized identifiers. Implement a log redaction filter that automatically masks sensitive fields.",
      reference: "GDPR Article 5: Data Minimization / OWASP Logging Cheat Sheet",
    });
  }

  // Logging full request/response bodies
  const logBodyPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:req\.body|request\.body|res\.body|response\.body|JSON\.stringify\s*\(\s*req)/gi;
  const logBodyLines = getLineNumbers(code, logBodyPattern);
  if (logBodyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Full request/response bodies logged",
      description: "Full request or response bodies are logged, which may contain sensitive user data, credentials, or PII that should not appear in logs.",
      lineNumbers: logBodyLines,
      recommendation: "Log only necessary metadata (method, URL, status, duration). If body logging is needed, implement a whitelist of safe fields and redact everything else.",
      reference: "Log Sanitization Best Practices",
    });
  }

  // Logging financial data
  const logFinancePattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:card.?number|credit.?card|cvv|expir|bank.?account|routing.?number|iban|swift)/gi;
  const logFinanceLines = getLineNumbers(code, logFinancePattern);
  if (logFinanceLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Financial data logged",
      description: "Credit card numbers, CVVs, or bank account details appear in log statements. This is a PCI DSS violation and a data breach risk.",
      lineNumbers: logFinanceLines,
      recommendation: "Never log financial data. Mask card numbers (show only last 4 digits). PCI DSS prohibits storing CVV data in any form.",
      reference: "PCI DSS Requirement 3: Protect Stored Data",
    });
  }

  // Console.log used instead of proper logger (with privacy context)
  const consoleLogCount = (code.match(/console\.(log|info|warn|error|debug)\s*\(/g) || []).length;
  const hasProperLogger = /winston|pino|bunyan|log4j|serilog|NLog|structuredLog|logger\./gi.test(code);
  if (consoleLogCount > 3 && !hasProperLogger) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Console.log lacks redaction capabilities",
      description: `Found ${consoleLogCount} console.log statements. Console.log has no built-in redaction, log level filtering, or structured output — making it impossible to automatically strip sensitive data.`,
      recommendation: "Use a structured logging library (pino, winston) that supports field-level redaction, log level filtering, and structured output for automated sensitivity scanning.",
      reference: "Structured Logging / Log Redaction Patterns",
    });
  }

  // String concatenation in logs (prevents redaction)
  const logConcatPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*\+/g;
  const logConcatLines = getLineNumbers(code, logConcatPattern);
  if (logConcatLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "String concatenation in log statements",
      description: `Found ${logConcatLines.length} log statement(s) using string concatenation. Concatenated logs are unstructured and make it impossible to apply field-level redaction.`,
      lineNumbers: logConcatLines.slice(0, 5),
      recommendation: "Use structured logging with named fields: logger.info({ userId, action }, 'User action performed'). This allows automated redaction of specific fields.",
      reference: "Structured Logging Best Practices",
    });
  }

  // Logging IP addresses
  const logIpPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:ip|ipAddress|remoteAddress|x-forwarded-for|req\.ip|req\.connection\.remoteAddress)/gi;
  const logIpLines = getLineNumbers(code, logIpPattern);
  if (logIpLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "IP addresses logged without anonymization",
      description: `Found ${logIpLines.length} instance(s) where IP addresses are logged. Under GDPR, IP addresses are personal data and must be handled accordingly.`,
      lineNumbers: logIpLines,
      recommendation: "Anonymize IP addresses in logs (truncate last octet for IPv4, mask prefix for IPv6). If full IP is needed for security, ensure log retention complies with privacy policy.",
      reference: "GDPR Recital 30: IP Addresses as Personal Data",
    });
  }

  // Logging database queries with parameters
  const logQueryPattern = /console\.(?:log|info|warn|error|debug)\s*\([^)]*(?:query|sql|SELECT|INSERT|UPDATE|DELETE)/gi;
  const logQueryLines = getLineNumbers(code, logQueryPattern);
  if (logQueryLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Database queries logged — may contain sensitive parameters",
      description: `Found ${logQueryLines.length} instance(s) where SQL queries are logged. Query parameters often contain user data (emails, names, IDs) that shouldn't appear in logs.`,
      lineNumbers: logQueryLines,
      recommendation: "Log query templates without parameter values. Use parameterized query logging that replaces bind values with placeholders. Redact sensitive column values.",
      reference: "Database Logging Privacy / OWASP Logging Cheat Sheet",
    });
  }

  // Stack traces exposed to external consumers
  const stackExposedPattern = /res\.(?:json|send|status)\s*\([^)]*(?:stack|stackTrace|err\.stack|error\.stack)/gi;
  const stackExposedLines = getLineNumbers(code, stackExposedPattern);
  if (stackExposedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Stack traces exposed in API responses",
      description: "Error stack traces are included in HTTP responses. Stack traces reveal internal file paths, dependency versions, and code structure to potential attackers.",
      lineNumbers: stackExposedLines,
      recommendation: "Never send stack traces in production API responses. Log them server-side for debugging. Return a generic error ID that correlates to internal logs.",
      reference: "OWASP: Improper Error Handling / CWE-209",
    });
  }

  return findings;
}
