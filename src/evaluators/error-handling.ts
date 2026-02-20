import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeErrorHandling(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "ERR";
  const lang = getLangFamily(language);

  // Empty catch blocks
  const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/g;
  const emptyCatchLines = getLineNumbers(code, emptyCatchPattern);
  if (emptyCatchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Empty catch block swallows errors",
      description: `Found ${emptyCatchLines.length} empty catch block(s). Silently swallowing errors hides bugs, makes debugging impossible, and can leave the application in an inconsistent state.`,
      lineNumbers: emptyCatchLines,
      recommendation: "Log the error with context, re-throw it, or handle it meaningfully. If intentionally ignoring, add a comment explaining why.",
      reference: "ESLint no-empty / Error Handling Best Practices",
    });
  }

  // Catch with no error parameter
  const catchNoParamPattern = /catch\s*\(\s*\)\s*\{/g;
  const catchNoParamLines = getLineNumbers(code, catchNoParamPattern);
  if (catchNoParamLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Catch block discards error object",
      description: "Catch block does not capture the error object. The error details (message, stack trace, type) are lost, making debugging impossible.",
      lineNumbers: catchNoParamLines,
      recommendation: "Capture the error parameter: catch(error) { ... } and use it for logging, error classification, or re-throwing.",
      reference: "Error Handling Best Practices",
    });
  }

  // No global error handler / middleware
  const hasGlobalHandler = /app\.use\s*\(\s*(?:function\s*)?\(\s*err/gi.test(code) ||
    /process\.on\s*\(\s*['"](?:uncaughtException|unhandledRejection)['"]/gi.test(code) ||
    /window\.onerror|window\.addEventListener\s*\(\s*['"]error['"]/gi.test(code) ||
    /app\.use\s*\(\s*errorHandler\b/gi.test(code);
  const hasServerCode = /app\.(listen|use|get|post|put|delete|patch)|createServer|express\(\)|new\s+Hono/gi.test(code);
  if (hasServerCode && !hasGlobalHandler && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No global error handler detected",
      description: "Server code without a global error handler. Unhandled errors will crash the process or return raw stack traces to clients.",
      recommendation: "Add Express error middleware (app.use((err, req, res, next) => { ... })), process.on('uncaughtException'), and process.on('unhandledRejection') handlers.",
      reference: "Express Error Handling / Node.js Best Practices",
    });
  }

  // Generic error responses
  const genericErrorPattern = /res\.(status|json|send)\s*\([^)]*(?:["'`](?:Error|Something went wrong|Internal server error|Server error|An error occurred)["'`])/gi;
  const genericErrorLines = getLineNumbers(code, genericErrorPattern);
  if (genericErrorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Generic error messages returned to clients",
      description: "Generic error messages like 'Internal server error' or 'Something went wrong' don't help API consumers understand or fix the issue.",
      lineNumbers: genericErrorLines,
      recommendation: "Return structured error responses with error codes, human-readable messages, and suggested actions. Use a consistent error response schema.",
      reference: "RFC 7807 (Problem Details for HTTP APIs)",
    });
  }

  // Async function without try/catch or .catch
  const asyncFuncPattern = /async\s+(?:function\s+\w+|\([^)]*\)\s*=>|\w+\s*=\s*async)/g;
  const hasTryCatch = /try\s*\{/g;
  const asyncMatches = code.match(asyncFuncPattern)?.length || 0;
  const tryCatchMatches = code.match(hasTryCatch)?.length || 0;
  if (asyncMatches > 0 && tryCatchMatches === 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Async functions without error handling",
      description: `Found ${asyncMatches} async function(s) but no try/catch blocks. Unhandled promise rejections can crash the process in Node.js.`,
      recommendation: "Wrap async operations in try/catch or use .catch() on promises. Consider a global unhandledRejection handler as a safety net.",
      reference: "Node.js Unhandled Rejections / Async Error Handling",
    });
  }

  // Callback without error check (Node.js pattern)
  const callbackNoErrPattern = /(?:callback|cb|done|next)\s*\(\s*(?:null|undefined)\s*[,)]/gi;
  const callbackErrPattern = /(?:if\s*\(\s*err|if\s*\(\s*error)/gi;
  const hasCallbacks = /function\s*\([^)]*(?:err|error|cb|callback|done)[^)]*\)/gi.test(code);
  if (hasCallbacks && !callbackErrPattern.test(code) && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Callback pattern without error checking",
      description: "Code uses callbacks but doesn't appear to check for errors. In Node.js, the error-first callback pattern requires checking the error parameter.",
      recommendation: "Always check the error parameter first in callbacks: if (err) { return handleError(err); }",
      reference: "Node.js Error-First Callbacks",
    });
  }

  // Throwing strings instead of Error objects
  const throwStringPattern = /throw\s+["'`]/g;
  const throwStringLines = getLineNumbers(code, throwStringPattern);
  if (throwStringLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Throwing string literals instead of Error objects",
      description: "Throwing strings instead of Error objects loses the stack trace and makes error handling inconsistent.",
      lineNumbers: throwStringLines,
      recommendation: "Always throw Error objects: throw new Error('message') or custom error classes that extend Error.",
      reference: "ESLint no-throw-literal / JavaScript Error Handling",
    });
  }

  // process.exit() without error handling
  const processExitPattern = /process\.exit\s*\(/g;
  const processExitLines = getLineNumbers(code, processExitPattern);
  if (processExitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "process.exit() used instead of proper error handling",
      description: "process.exit() immediately terminates the process, skipping cleanup handlers, dropping in-flight requests, and potentially corrupting data.",
      lineNumbers: processExitLines,
      recommendation: "Use proper error propagation instead of process.exit(). In HTTP servers, return error responses. Let the process shutdown gracefully.",
      reference: "Node.js Graceful Shutdown Best Practices",
    });
  }

  // Catch-and-rethrow without added context
  const catchRethrowPattern = /catch\s*\(\s*(\w+)\s*\)\s*\{[^}]*throw\s+\1\s*;?\s*\}/g;
  const catchRethrowLines = getLineNumbers(code, catchRethrowPattern);
  if (catchRethrowLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Catch-and-rethrow without added context",
      description: `Found ${catchRethrowLines.length} catch block(s) that rethrow the same error without adding context. These blocks add no value — they clutter the code and obscure the original stack trace.`,
      lineNumbers: catchRethrowLines,
      recommendation: "Either add context when rethrowing (new Error('context', { cause: err })) or remove the try/catch entirely and let the error propagate naturally.",
      reference: "Error Handling Best Practices / Error Wrapping",
    });
  }

  // Error swallowed with only console.log
  const swallowedErrorPattern = /catch\s*\(\s*\w+\s*\)\s*\{\s*console\.(?:log|warn|info)\s*\([^)]*\)\s*;?\s*\}/g;
  const swallowedLines = getLineNumbers(code, swallowedErrorPattern);
  if (swallowedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Error caught and only logged — not propagated",
      description: `Found ${swallowedLines.length} catch block(s) that only console.log the error without rethrowing or returning an error response. The caller has no idea the operation failed.`,
      lineNumbers: swallowedLines,
      recommendation: "After logging, rethrow the error, return an error response, or propagate the failure to the caller. Silent failures are as dangerous as empty catch blocks.",
      reference: "Error Handling Patterns / Don't Swallow Errors",
    });
  }

  // Missing error codes in error responses
  const errorResponsePattern = /res\.status\s*\(\s*(?:4|5)\d{2}\s*\)\s*\.json\s*\(/g;
  const errorRespLines = getLineNumbers(code, errorResponsePattern);
  const hasErrorCodes = /errorCode|error_code|code\s*:\s*["'`]ERR|code\s*:\s*["'`][A-Z_]+/gi.test(code);
  if (errorRespLines.length > 0 && !hasErrorCodes) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Error responses without error codes",
      description: "HTTP error responses don't include machine-readable error codes. Clients must parse human-readable messages to determine the error type.",
      lineNumbers: errorRespLines.slice(0, 5),
      recommendation: "Include a machine-readable error code in responses: { code: 'VALIDATION_ERROR', message: '...' }. Use RFC 7807 Problem Details format.",
      reference: "RFC 7807: Problem Details for HTTP APIs",
    });
  }

  // console.error as sole error strategy
  const consoleErrorPattern = /console\.error\s*\(/g;
  const consoleErrorLines = getLineNumbers(code, consoleErrorPattern);
  const hasErrorReporting = /sentry|bugsnag|rollbar|newrelic|datadog|errorReporter|reportError|alerting|pagerduty/gi.test(code);
  if (consoleErrorLines.length > 3 && !hasErrorReporting) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "console.error as sole error reporting strategy",
      description: `Found ${consoleErrorLines.length} console.error call(s) with no error reporting service. Console output is transient — errors won't be tracked, aggregated, or alerted on.`,
      recommendation: "Integrate an error reporting service (Sentry, Bugsnag, Application Insights). These provide aggregation, alerting, and stack trace analysis.",
      reference: "Error Monitoring Best Practices",
    });
  }

  return findings;
}
