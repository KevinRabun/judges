import type { Finding } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  isLikelyAnalysisCode,
  isLikelyCLI,
  testCode,
} from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeLoggingPrivacy(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "LOGPRIV";
  const _lang = getLangFamily(language);

  // Analysis code references PII/IP/credential keywords in regex patterns for
  // detection purposes — these are not actual sensitive data being logged.
  if (isLikelyAnalysisCode(code)) return findings;

  // Helper: find log statement lines that contain sensitive data (multi-language)
  const logLineSet = new Set([
    ...getLangLineNumbers(code, language, LP.CONSOLE_LOG),
    ...getLangLineNumbers(code, language, LP.STRUCTURED_LOG),
  ]);
  const codeLines = code.split("\n");
  function getLogLinesMatching(sensitivePattern: RegExp): number[] {
    const flagged: number[] = [];
    for (const lineNum of logLineSet) {
      const line = codeLines[lineNum - 1];
      if (line && sensitivePattern.test(line)) {
        flagged.push(lineNum);
      }
    }
    return flagged;
  }

  // Logging authorization/token headers (multi-language)
  const logAuthLines = getLogLinesMatching(/(?:authorization|bearer|token|auth)/i);
  if (logAuthLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Authentication tokens logged",
      description: `Found ${logAuthLines.length} instance(s) where authentication tokens or authorization headers are logged. Tokens in logs can be used for session hijacking.`,
      lineNumbers: logAuthLines,
      recommendation:
        "Never log authentication tokens, Authorization headers, or session IDs. If request logging is needed, redact sensitive headers before logging.",
      reference: "OWASP Logging Cheat Sheet / CWE-532",
      suggestedFix:
        "Redact auth headers: const safeHeaders = { ...req.headers, authorization: '[REDACTED]' }; logger.info({ headers: safeHeaders });",
      confidence: 0.9,
    });
  }

  // Logging passwords (multi-language)
  const logPasswordLines = getLogLinesMatching(/(?:password|passwd|pwd|secret|credential)/i);
  if (logPasswordLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Passwords/secrets logged",
      description: `Found ${logPasswordLines.length} instance(s) where passwords or secrets appear in log statements. This exposes credentials in log files, monitoring systems, and SIEM tools.`,
      lineNumbers: logPasswordLines,
      recommendation:
        "Never log passwords, credentials, or secrets. Implement a log sanitizer that redacts sensitive fields automatically.",
      reference: "OWASP Logging Cheat Sheet / GDPR Art. 5(1)(f)",
      suggestedFix:
        "Remove password from log output: const { password, ...safeData } = userData; logger.info({ user: safeData });",
      confidence: 0.9,
    });
  }

  // Logging PII (email, name, SSN, phone) (multi-language)
  // Use word-boundary anchors to avoid matching fragments inside other words
  // (e.g., "rename" does not contain PII field "name").
  const logPiiLines = getLogLinesMatching(
    /(?:\bemail\b|\bssn\b|\bphone(?:Number)?\b|\baddress\b(?!\s*(?:=|:)\s*(?:0x|null|undefined|['"](?:\/|http)))|(?:^|[\s{(,.:])name(?:\s*[=:,})\]]|$)|\bfirstName\b|\blast_?[Nn]ame\b|\bdateOfBirth\b|\bdob\b|\bsocial.?security\b)/i,
  );
  if (logPiiLines.length > 0 && !isLikelyCLI(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Personally Identifiable Information (PII) in logs",
      description: `Found ${logPiiLines.length} instance(s) where PII may be logged. PII in logs violates data minimization principles and may breach GDPR/CCPA requirements.`,
      lineNumbers: logPiiLines,
      recommendation:
        "Redact PII before logging. Use anonymized identifiers. Implement a log redaction filter that automatically masks sensitive fields.",
      reference: "GDPR Article 5: Data Minimization / OWASP Logging Cheat Sheet",
      suggestedFix:
        "Mask PII in logs: logger.info({ email: maskEmail(user.email), id: user.id }); function maskEmail(e) { return e[0] + '***@' + e.split('@')[1]; }",
      confidence: 0.9,
    });
  }

  // Logging full request/response bodies (multi-language)
  const logBodyLines = getLogLinesMatching(
    /(?:req\.body|request\.body|res\.body|response\.body|JSON\.stringify\s*\(\s*req|request\.data|request\.json)/i,
  );
  if (logBodyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Full request/response bodies logged",
      description:
        "Full request or response bodies are logged, which may contain sensitive user data, credentials, or PII that should not appear in logs.",
      lineNumbers: logBodyLines,
      recommendation:
        "Log only necessary metadata (method, URL, status, duration). If body logging is needed, implement a whitelist of safe fields and redact everything else.",
      reference: "Log Sanitization Best Practices",
      suggestedFix:
        "Log safe fields only: const safeBody = pick(req.body, ['action', 'timestamp']); logger.info({ method: req.method, url: req.url, body: safeBody });",
      confidence: 0.85,
    });
  }

  // Logging financial data (multi-language)
  const logFinanceLines = getLogLinesMatching(
    /(?:card.?number|credit.?card|cvv|expir|bank.?account|routing.?number|iban|swift)/i,
  );
  if (logFinanceLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Financial data logged",
      description:
        "Credit card numbers, CVVs, or bank account details appear in log statements. This is a PCI DSS violation and a data breach risk.",
      lineNumbers: logFinanceLines,
      recommendation:
        "Never log financial data. Mask card numbers (show only last 4 digits). PCI DSS prohibits storing CVV data in any form.",
      reference: "PCI DSS Requirement 3: Protect Stored Data",
      suggestedFix:
        "Mask card numbers: const masked = cardNumber.replace(/.(?=.{4})/g, '*'); logger.info({ card: masked }); never log CVV.",
      confidence: 0.9,
    });
  }

  // Console.log used instead of proper logger (multi-language detection)
  const consoleLogLines = getLangLineNumbers(code, language, LP.CONSOLE_LOG);
  const hasProperLogger = testCode(code, /winston|pino|bunyan|log4j|serilog|NLog|structuredLog|logger\./gi);
  const structuredLogLines = getLangLineNumbers(code, language, LP.STRUCTURED_LOG);
  if (consoleLogLines.length > 3 && !hasProperLogger && structuredLogLines.length === 0 && !isLikelyCLI(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unstructured logging lacks redaction capabilities",
      description: `Found ${consoleLogLines.length} unstructured log statement(s). Console/print logging has no built-in redaction, log level filtering, or structured output — making it impossible to automatically strip sensitive data.`,
      recommendation:
        "Use a structured logging library (pino, winston) that supports field-level redaction, log level filtering, and structured output for automated sensitivity scanning.",
      reference: "Structured Logging / Log Redaction Patterns",
      suggestedFix:
        "Use pino with redaction: import pino from 'pino'; const logger = pino({ redact: ['req.headers.authorization', '*.password', '*.ssn'] });",
      confidence: 0.75,
    });
  }

  // String concatenation in logs
  const logConcatLines: number[] = [];
  for (const lineNum of logLineSet) {
    const line = codeLines[lineNum - 1];
    if (line && /\+/.test(line)) {
      logConcatLines.push(lineNum);
    }
  }
  if (logConcatLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "String concatenation in log statements",
      description: `Found ${logConcatLines.length} log statement(s) using string concatenation. Concatenated logs are unstructured and make it impossible to apply field-level redaction.`,
      lineNumbers: logConcatLines.slice(0, 5),
      recommendation:
        "Use structured logging with named fields: logger.info({ userId, action }, 'User action performed'). This allows automated redaction of specific fields.",
      reference: "Structured Logging Best Practices",
      suggestedFix:
        "Replace concatenation with structured fields: instead of console.log('User ' + id + ' did ' + action), use logger.info({ userId: id, action }, 'User action performed');",
      confidence: 0.75,
    });
  }

  // Logging IP addresses (multi-language)
  const logIpLines = getLogLinesMatching(
    /(?:ip|ipAddress|remoteAddress|x-forwarded-for|req\.ip|req\.connection\.remoteAddress|REMOTE_ADDR)/i,
  );
  if (logIpLines.length > 0 && !isLikelyCLI(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "IP addresses logged without anonymization",
      description: `Found ${logIpLines.length} instance(s) where IP addresses are logged. Under GDPR, IP addresses are personal data and must be handled accordingly.`,
      lineNumbers: logIpLines,
      recommendation:
        "Anonymize IP addresses in logs (truncate last octet for IPv4, mask prefix for IPv6). If full IP is needed for security, ensure log retention complies with privacy policy.",
      reference: "GDPR Recital 30: IP Addresses as Personal Data",
      suggestedFix:
        "Anonymize IPs: function anonymizeIp(ip) { return ip.replace(/\\d+$/, '0'); } logger.info({ ip: anonymizeIp(req.ip) });",
      confidence: 0.9,
    });
  }

  // Logging database queries with parameters (multi-language)
  // Require SQL-specific context to avoid false positives on generic action labels like { action: "DELETE" }
  const logQueryLines = getLogLinesMatching(
    /(?:query|sql|SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM)/i,
  );
  if (logQueryLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Database queries logged — may contain sensitive parameters",
      description: `Found ${logQueryLines.length} instance(s) where SQL queries are logged. Query parameters often contain user data (emails, names, IDs) that shouldn't appear in logs.`,
      lineNumbers: logQueryLines,
      recommendation:
        "Log query templates without parameter values. Use parameterized query logging that replaces bind values with placeholders. Redact sensitive column values.",
      reference: "Database Logging Privacy / OWASP Logging Cheat Sheet",
      suggestedFix:
        "Log queries safely: logger.info({ query: 'SELECT * FROM users WHERE id = $1', paramCount: params.length }); // never log actual parameter values.",
      confidence: 0.8,
    });
  }

  // Stack traces exposed to external consumers
  const stackExposedPattern = /res\.(?:json|send|status)\s*\([^)]*(?:stack|stackTrace|err\.stack|error\.stack)/gi;
  const stackExposedLines = getLineNumbers(code, stackExposedPattern);
  if (stackExposedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "high",
      title: "Stack traces exposed in API responses",
      description:
        "Error stack traces are included in HTTP responses. Stack traces reveal internal file paths, dependency versions, and code structure to potential attackers.",
      lineNumbers: stackExposedLines,
      recommendation:
        "Never send stack traces in production API responses. Log them server-side for debugging. Return a generic error ID that correlates to internal logs.",
      reference: "OWASP: Improper Error Handling / CWE-209",
      suggestedFix:
        "Return safe errors: const errorId = crypto.randomUUID(); logger.error({ errorId, stack: err.stack }); res.status(500).json({ error: 'Internal error', errorId });",
      confidence: 0.85,
    });
  }

  return findings;
}
