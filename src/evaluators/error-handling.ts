import type { Finding } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  isCommentLine,
  isStringLiteralLine,
  isLikelyCLI,
  testCode,
} from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeErrorHandling(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "ERR";
  const _lang = getLangFamily(language);

  // Empty catch blocks (multi-language) — single-line via LP.EMPTY_CATCH
  const emptyCatchLines = getLangLineNumbers(code, language, LP.EMPTY_CATCH);

  // Multi-line empty catch blocks (body is only comments/whitespace)
  {
    const cLines = code.split("\n");
    for (let i = 0; i < cLines.length; i++) {
      const line = cLines[i];
      if (/catch\s*(?:\([^)]*\))?\s*\{\s*$/.test(line) || /catch\s*\{\s*$/.test(line)) {
        // Scan forward to find closing }
        let j = i + 1;
        let isEmpty = true;
        while (j < cLines.length) {
          const bodyLine = cLines[j].trim();
          if (bodyLine === "}") break;
          if (bodyLine !== "" && !bodyLine.startsWith("//") && !bodyLine.startsWith("#") && !bodyLine.startsWith("*")) {
            isEmpty = false;
            break;
          }
          j++;
        }
        if (isEmpty && j < cLines.length && !emptyCatchLines.includes(i + 1)) {
          emptyCatchLines.push(i + 1);
        }
      }
    }
  }

  if (emptyCatchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Empty catch/error block swallows errors",
      description: `Found ${emptyCatchLines.length} empty error-handling block(s). Silently swallowing errors hides bugs, makes debugging impossible, and can leave the application in an inconsistent state.`,
      lineNumbers: emptyCatchLines,
      recommendation:
        "Log the error with context, re-throw it, or handle it meaningfully. If intentionally ignoring, add a comment explaining why.",
      reference: "ESLint no-empty / Error Handling Best Practices",
      suggestedFix:
        "Add error handling: catch (error) { logger.error('Operation failed', { error }); throw error; } (JS/TS), except Exception as e: logger.error(e); raise (Python), .map_err(|e| { log::error!(\"{e}\"); e }) (Rust).",
      confidence: 0.9,
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
      description:
        "Catch block does not capture the error object. The error details (message, stack trace, type) are lost, making debugging impossible.",
      lineNumbers: catchNoParamLines,
      recommendation:
        "Capture the error parameter: catch(error) { ... } and use it for logging, error classification, or re-throwing.",
      reference: "Error Handling Best Practices",
      suggestedFix: "Add error parameter: catch (error) { ... } instead of catch () { ... }.",
      confidence: 0.9,
    });
  }

  // No global error handler / middleware
  const hasGlobalHandler =
    testCode(code, /app\.use\s*\(\s*(?:function\s*)?\(\s*err/gi) ||
    testCode(code, /process\.on\s*\(\s*['"](?:uncaughtException|unhandledRejection)['"]/gi) ||
    testCode(code, /window\.onerror|window\.addEventListener\s*\(\s*['"]error['"]/gi) ||
    testCode(code, /app\.use\s*\(\s*errorHandler\b/gi);
  const hasServerCode = testCode(
    code,
    /app\.(listen|use|get|post|put|delete|patch)|createServer|express\(\)|new\s+Hono/gi,
  );
  if (hasServerCode && !hasGlobalHandler && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No global error handler detected",
      description:
        "Server code without a global error handler. Unhandled errors will crash the process or return raw stack traces to clients.",
      recommendation:
        "Add Express error middleware (app.use((err, req, res, next) => { ... })), process.on('uncaughtException'), and process.on('unhandledRejection') handlers.",
      reference: "Express Error Handling / Node.js Best Practices",
      suggestedFix:
        "Add global error middleware: app.use((err, req, res, next) => { logger.error(err); res.status(500).json({ error: 'Internal error' }); }); and process.on('unhandledRejection', handler).",
      confidence: 0.5,
      isAbsenceBased: true,
      provenance: "absence-of-pattern",
    });
  }

  // Generic error responses
  const genericErrorPattern =
    /res\.(status|json|send)\s*\([^)]*(?:["'`](?:Error|Something went wrong|Internal server error|Server error|An error occurred)["'`])/gi;
  const genericErrorLines = getLineNumbers(code, genericErrorPattern);
  if (genericErrorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Generic error messages returned to clients",
      description:
        "Generic error messages like 'Internal server error' or 'Something went wrong' don't help API consumers understand or fix the issue.",
      lineNumbers: genericErrorLines,
      recommendation:
        "Return structured error responses with error codes, human-readable messages, and suggested actions. Use a consistent error response schema.",
      reference: "RFC 7807 (Problem Details for HTTP APIs)",
      suggestedFix:
        "Return structured errors: res.status(400).json({ type: 'validation_error', title: 'Invalid input', detail: 'Field email is required', instance: req.path }).",
      confidence: 0.75,
    });
  }

  // Async function without try/catch or .catch (multi-language)
  const asyncFuncLines = getLangLineNumbers(code, language, LP.ASYNC_FUNCTION);
  const tryCatchLines = getLangLineNumbers(code, language, LP.TRY_CATCH);
  // C# ASP.NET apps commonly use middleware-based error handling (UseExceptionHandler,
  // ExceptionFilter, middleware pipeline) — visible try/catch is not required per file.
  const hasCSharpMiddlewareErrorHandling =
    language === "csharp" &&
    /UseExceptionHandler|ExceptionFilter|IExceptionFilter|HandleErrorAttribute|app\.Use[A-Z]|ProblemDetails/i.test(
      code,
    );
  if (asyncFuncLines.length > 0 && tryCatchLines.length === 0 && !hasCSharpMiddlewareErrorHandling) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Async functions without error handling",
      description: `Found ${asyncFuncLines.length} async function(s) but no error-handling blocks. Unhandled async errors can crash the process or cause silent failures.`,
      recommendation:
        "Wrap async operations in try/catch (JS/TS/C#/Java), try/except (Python), or check errors explicitly (Go/Rust).",
      reference: "Async Error Handling Best Practices",
      suggestedFix:
        "Wrap async handlers: try { await operation(); } catch (error) { logger.error(error); } (JS/TS), try: await operation() except Exception as e: ... (Python), if err != nil { ... } (Go).",
      confidence: 0.55,
      isAbsenceBased: true,
      provenance: "absence-of-pattern",
    });
  }

  // Callback without error check (Node.js pattern)
  const _callbackNoErrPattern = /(?:callback|cb|done|next)\s*\(\s*(?:null|undefined)\s*[,)]/gi;
  const callbackErrPattern = /(?:if\s*\(\s*err|if\s*\(\s*error)/gi;
  const hasCallbacks = testCode(code, /function\s*\([^)]*(?:err|error|cb|callback|done)[^)]*\)/gi);
  if (hasCallbacks && !testCode(code, callbackErrPattern) && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Callback pattern without error checking",
      description:
        "Code uses callbacks but doesn't appear to check for errors. In Node.js, the error-first callback pattern requires checking the error parameter.",
      recommendation: "Always check the error parameter first in callbacks: if (err) { return handleError(err); }",
      reference: "Node.js Error-First Callbacks",
      suggestedFix:
        "Add error-first check: function callback(err, result) { if (err) { return handleError(err); } // proceed with result }.",
      confidence: 0.7,
    });
  }

  // Throwing strings instead of Error objects
  const throwStringPattern = /throw\s+["'`]/g;
  const throwStringLinesRaw = getLineNumbers(code, throwStringPattern);
  // Filter out matches inside regex literals or string-literal lines (detection patterns, not actual throws)
  const codeLines = code.split("\n");
  const throwStringLines = throwStringLinesRaw.filter((ln) => {
    const line = codeLines[ln - 1] || "";
    const trimmed = line.trim();
    // Skip lines that are regex literals containing throw patterns (e.g. /throw\s+["'`]/g)
    if (/^\/.*\/[gimsuy]*[;,]?$/.test(trimmed) || /(?:=|:)\s*\/.*throw.*\/[gimsuy]*/.test(trimmed)) return false;
    // Skip lines that are primarily string literal values
    if (isStringLiteralLine(line)) return false;
    // Skip lines containing .test( or .match( or .exec( — they use regex patterns, not actual throws
    if (/\.(?:test|match|exec|search|replace)\s*\(/.test(line) && /\/.*throw/.test(line)) return false;
    // Skip lines where throw appears inside string content (e.g. key: "...throw 'msg'...")
    const stripped = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    if (!/throw\s+["'`]/.test(stripped)) return false;
    return true;
  });
  if (throwStringLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Throwing string literals instead of Error objects",
      description:
        "Throwing strings instead of Error objects loses the stack trace and makes error handling inconsistent.",
      lineNumbers: throwStringLines,
      recommendation:
        "Always throw Error objects: throw new Error('message') or custom error classes that extend Error.",
      reference: "ESLint no-throw-literal / JavaScript Error Handling",
      suggestedFix: "Replace throw 'message' with throw new Error('message').",
      confidence: 0.9,
    });
  }

  // Abrupt process termination (multi-language: process.exit, sys.exit, panic, unwrap, etc.)
  const panicExitLines = getLangLineNumbers(code, language, LP.PANIC_UNWRAP);
  if (panicExitLines.length > 0 && !isLikelyCLI(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Abrupt process termination instead of proper error handling",
      description: `Found ${panicExitLines.length} abrupt termination call(s) (process.exit, sys.exit, panic, .unwrap). These skip cleanup handlers, drop in-flight requests, and can corrupt data.`,
      lineNumbers: panicExitLines,
      recommendation:
        "Use proper error propagation instead of abrupt termination. Return error responses in HTTP servers. Let the process shutdown gracefully.",
      reference: "Graceful Shutdown Best Practices / CWE-705",
      suggestedFix:
        "Replace abrupt exits with graceful shutdown: server.close(() => cleanup()) (JS), raise SystemExit (Python), return Err(...) instead of .unwrap() (Rust), os.Exit only in main() (Go).",
      confidence: 0.9,
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
      recommendation:
        "Either add context when rethrowing (new Error('context', { cause: err })) or remove the try/catch entirely and let the error propagate naturally.",
      reference: "Error Handling Best Practices / Error Wrapping",
      suggestedFix:
        "Add context when rethrowing: throw new Error('Failed to process order', { cause: err }); or remove the redundant try/catch entirely.",
      confidence: 0.85,
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
      recommendation:
        "After logging, rethrow the error, return an error response, or propagate the failure to the caller. Silent failures are as dangerous as empty catch blocks.",
      reference: "Error Handling Patterns / Don't Swallow Errors",
      suggestedFix:
        "After logging, propagate the failure: catch (error) { logger.error(error); throw error; } or return an error response to the caller.",
      confidence: 0.85,
    });
  }

  // Missing error codes in error responses
  const errorResponsePattern = /res\.status\s*\(\s*(?:4|5)\d{2}\s*\)\s*\.json\s*\(/g;
  const errorRespLines = getLineNumbers(code, errorResponsePattern);
  const hasErrorCodes = testCode(code, /errorCode|error_code|code\s*:\s*["'`]ERR|code\s*:\s*["'`][A-Z_]+/gi);
  if (errorRespLines.length > 0 && !hasErrorCodes) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Error responses without error codes",
      description:
        "HTTP error responses don't include machine-readable error codes. Clients must parse human-readable messages to determine the error type.",
      lineNumbers: errorRespLines.slice(0, 5),
      recommendation:
        "Include a machine-readable error code in responses: { code: 'VALIDATION_ERROR', message: '...' }. Use RFC 7807 Problem Details format.",
      reference: "RFC 7807: Problem Details for HTTP APIs",
      suggestedFix:
        "Add machine-readable error codes: res.status(422).json({ code: 'VALIDATION_FAILED', message: '...', details: [...] }).",
      confidence: 0.7,
    });
  }

  // console.error as sole error strategy
  const consoleErrorPattern = /console\.error\s*\(/g;
  const consoleErrorLines = getLineNumbers(code, consoleErrorPattern);
  const hasErrorReporting = testCode(
    code,
    /sentry|bugsnag|rollbar|newrelic|datadog|errorReporter|reportError|alerting|pagerduty/gi,
  );
  if (consoleErrorLines.length > 3 && !hasErrorReporting) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "console.error as sole error reporting strategy",
      description: `Found ${consoleErrorLines.length} console.error call(s) with no error reporting service. Console output is transient — errors won't be tracked, aggregated, or alerted on.`,
      recommendation:
        "Integrate an error reporting service (Sentry, Bugsnag, Application Insights). These provide aggregation, alerting, and stack trace analysis.",
      reference: "Error Monitoring Best Practices",
      suggestedFix:
        "Integrate an error reporting service: Sentry.captureException(error) or appInsights.trackException({ exception: error }) for aggregation and alerting.",
      confidence: 0.5,
      isAbsenceBased: true,
      provenance: "absence-of-pattern",
    });
  }

  // Promise .then() chains without .catch()
  const thenWithoutCatch: number[] = [];
  const cLines = code.split("\n");
  cLines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/\.then\s*\(/i.test(line) && thenWithoutCatch.length < 10) {
      const context = cLines.slice(i, Math.min(cLines.length, i + 6)).join("\n");
      if (!/\.catch\s*\(|\.finally\s*\(/.test(context)) {
        // Also check preceding lines for await (which handles rejection differently)
        const precedingContext = cLines.slice(Math.max(0, i - 2), i + 1).join("\n");
        if (!/\bawait\b/.test(precedingContext)) {
          thenWithoutCatch.push(i + 1);
        }
      }
    }
  });
  if (thenWithoutCatch.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Promise .then() chain without .catch()",
      description: `Found ${thenWithoutCatch.length} Promise .then() chain(s) without a .catch() handler. Unhandled promise rejections crash Node.js processes and cause silent failures in browsers.`,
      lineNumbers: thenWithoutCatch,
      recommendation:
        "Always add .catch() at the end of Promise chains, or refactor to async/await with try/catch. Enable the 'no-floating-promises' ESLint rule.",
      reference: "Node.js Unhandled Rejections / CWE-755",
      suggestedFix:
        "Append .catch(error => { logger.error(error); }) to the Promise chain, or refactor to async/await with try/catch.",
      confidence: 0.75,
    });
  }

  // Stack trace or full error object sent to client
  const stackExposurePattern =
    /(?:res\.(?:json|send|status)\s*\(.*(?:\.stack|err\b|error\b)\s*\)|\.json\s*\(\s*(?:err|error)\s*\)|\.send\s*\(\s*(?:err|error)\s*\))/gi;
  const stackExposureLines = getLineNumbers(code, stackExposurePattern);
  if (stackExposureLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Stack trace or error internals exposed to client",
      description: `Found ${stackExposureLines.length} location(s) where error objects or stack traces may be sent directly in HTTP responses. This leaks internal file paths, library versions, and system details to attackers.`,
      lineNumbers: stackExposureLines,
      recommendation:
        "Never send raw error objects to clients. Return a generic error message with a correlation ID. Log the full error server-side. Use environment checks to show details only in development.",
      reference: "CWE-209: Information Exposure Through Error Messages",
      suggestedFix:
        "Return a generic message with correlation ID: res.status(500).json({ error: 'Internal error', correlationId: req.id }); and log the full error server-side.",
      confidence: 0.85,
    });
  }

  // Go ignored error: result, _ := someFunc() — discarding error return value
  {
    const goIgnoredLines: number[] = [];
    const cLines = code.split("\n");
    for (let i = 0; i < cLines.length; i++) {
      const line = cLines[i];
      // Go pattern: var, _ := func() — underscore discarding error
      if (/,\s*_\s*:?=\s*\w+[\w.]*\s*\(/i.test(line)) {
        goIgnoredLines.push(i + 1);
      }
      // Go pattern: func() called without capturing error return (multi-return functions)
      // Only detect well-known Go funcs that return errors: json.Unmarshal, f.Close, etc.
      // Exclude chained calls like json.NewEncoder(w).Encode(x) — idiomatic Go for HTTP responses
      // Require receiver for Close/Flush (w+.Close) to avoid matching Go builtin close() which has no return value
      if (/^\s*(?:json\.Unmarshal|\w+\.Close|\w+\.Flush)\s*\(/i.test(line)) {
        // Check if error is captured (look for = or := on the line)
        if (!/[:=]\s*/.test(line.split(/(?:Unmarshal|Close|Flush)\s*\(/i)[0])) {
          goIgnoredLines.push(i + 1);
        }
      }
      // Standalone Write/Encode calls (not chained from constructors)
      if (/^\s*\w+\.(?:Write|Encode)\s*\(/i.test(line) && !/\)\s*\.\s*(?:Write|Encode)/i.test(line)) {
        if (!/[:=]\s*/.test(line.split(/(?:Write|Encode)\s*\(/)[0])) {
          goIgnoredLines.push(i + 1);
        }
      }
    }
    if (goIgnoredLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Error return value ignored",
        description: `Found ${goIgnoredLines.length} location(s) where error return values are discarded (assigned to _) or not captured. Ignoring errors can lead to silent data corruption, resource leaks, and undefined behavior.`,
        lineNumbers: goIgnoredLines,
        recommendation: "Always check error return values. Handle errors explicitly or propagate them to callers.",
        reference: "Go Error Handling — CWE-252: Unchecked Return Value",
        suggestedFix:
          'Capture and handle errors: data, err := io.ReadAll(r.Body); if err != nil { return fmt.Errorf("read body: %w", err) }',
        confidence: 0.85,
      });
    }
  }

  // Python bare except / swallowed exceptions (except: pass, except Exception: pass/return)
  {
    const bareExceptLines: number[] = [];
    const cLines = code.split("\n");
    for (let i = 0; i < cLines.length; i++) {
      const line = cLines[i];
      // Match except: or except Exception: followed by pass/return on next line(s)
      if (/^\s*except\s*(?:Exception\s*)?(?:\s+as\s+\w+)?\s*:\s*(?:#.*)?$/.test(line)) {
        const nextLines = cLines.slice(i + 1, Math.min(cLines.length, i + 4)).join("\n");
        if (/^\s*(?:pass|return\s|continue|\.\.\.)\s*(?:#.*)?$/m.test(nextLines)) {
          bareExceptLines.push(i + 1);
        }
      }
    }
    if (bareExceptLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Bare except clause silently swallows errors",
        description: `Found ${bareExceptLines.length} bare except clause(s) (except: or except Exception:) that silently discard errors with pass/return. This hides bugs, masks failures, and makes debugging impossible.`,
        lineNumbers: bareExceptLines,
        recommendation: "Catch specific exception types. Log errors before handling. Never use bare except: with pass.",
        reference: "Python PEP 8 / CWE-391: Unchecked Error Condition",
        suggestedFix:
          "Catch specific exceptions: except ValueError as e: logger.error('Validation failed: %s', e); raise",
        confidence: 0.9,
      });
    }
  }

  // Java catch (Throwable) — catches OutOfMemoryError, StackOverflowError, etc.
  {
    const throwableLines: number[] = [];
    const cLines = code.split("\n");
    for (let i = 0; i < cLines.length; i++) {
      if (/\bcatch\s*\(\s*Throwable\s/i.test(cLines[i])) {
        throwableLines.push(i + 1);
      }
    }
    if (throwableLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Catching Throwable swallows critical JVM errors",
        description: `Found ${throwableLines.length} catch(Throwable) clause(s). This catches OutOfMemoryError, StackOverflowError, and other unrecoverable JVM errors that should crash the process.`,
        lineNumbers: throwableLines,
        recommendation:
          "Catch Exception instead of Throwable. Let Errors propagate to crash the JVM gracefully. If you must catch Throwable, rethrow Errors.",
        reference: "CWE-396: Declaration of Catch for Generic Exception",
        suggestedFix: "Replace catch (Throwable t) with: catch (Exception e) { handle(e); } — let Errors propagate.",
        confidence: 0.9,
      });
    }
  }

  // Kotlin force unwrap (!!) — crashes with NullPointerException
  {
    const forceUnwrapLines: number[] = [];
    const cLines = code.split("\n");
    for (let i = 0; i < cLines.length; i++) {
      const line = cLines[i];
      if (isCommentLine(line)) continue;
      // Match !! operator (not inside strings or comments)
      const matches = line.match(/!!/g);
      if (matches && matches.length > 0) {
        // Avoid false positives from logical NOT NOT (!!value for boolean coercion in JS)
        // Kotlin !! is specifically used as a.b!! or val!! pattern
        if (/\w+!!(?:\.|,|\s*$|\s*[;)\]])/i.test(line)) {
          forceUnwrapLines.push(i + 1);
        }
      }
    }
    if (forceUnwrapLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Kotlin force unwrap (!!) risks NullPointerException",
        description: `Found ${forceUnwrapLines.length} force unwrap (!!) usage(s). This crashes with NullPointerException at runtime if the value is null, bypassing Kotlin's null safety guarantees.`,
        lineNumbers: forceUnwrapLines,
        recommendation:
          "Use safe alternatives: ?. (safe call), ?: (elvis operator), let { }, or explicit null checks instead of !!.",
        reference: "Kotlin Null Safety — CWE-476: NULL Pointer Dereference",
        suggestedFix:
          'Replace val x = obj!! with: val x = obj ?: throw IllegalStateException("obj was null") or use obj?.let { ... }.',
        confidence: 0.8,
      });
    }
  }

  return findings;
}
