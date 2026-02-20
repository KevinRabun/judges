import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeErrorHandling(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "ERR";

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

  return findings;
}
