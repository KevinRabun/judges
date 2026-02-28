import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

/**
 * Evaluates code for security and quality risks that are specifically
 * common in AI-generated code — prompt injection, unsanitised LLM output,
 * hallucinated imports, debug-mode defaults, insecure WebSocket, placeholder
 * security comments, and overly permissive CSP directives.
 */
export function analyzeAiCodeSafety(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "AICS";
  const lang = getLangFamily(language);

  // ── AICS-001  Prompt injection — user input concatenated into LLM prompts ──
  const promptConcatPattern =
    /(?:system|user|assistant|prompt|messages)\s*[:=\[{].*(?:req\.|request\.|params\.|query\.|body\.|input|user[Ii]nput|message|content)/gi;
  const promptTemplatePattern =
    /(?:`[^`]*\$\{[^}]*(?:req|request|params|query|body|input|user|message)[^}]*\}[^`]*`|f["'].*\{.*(?:request|input|user|message).*\})/gi;
  const llmCallPattern =
    /(?:openai|anthropic|cohere|azure.*openai|bedrock|gemini|palm|groq|ollama|mistral|replicate|together|chat\.completions|messages\.create|generate|invoke)\s*[.(]/gi;

  const promptConcatLines = getLineNumbers(code, promptConcatPattern);
  const promptTemplateLines = getLineNumbers(code, promptTemplatePattern);
  const hasLlmCall = llmCallPattern.test(code);

  const allPromptInjectionLines = [...new Set([...promptConcatLines, ...promptTemplateLines])].sort((a, b) => a - b);

  if (allPromptInjectionLines.length > 0 && hasLlmCall) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "User input concatenated into LLM prompt — prompt injection risk",
      description:
        "User-controlled input is interpolated or concatenated directly into an LLM prompt string without sanitisation. An attacker can inject instructions that override the system prompt, exfiltrate data, or cause the model to perform unintended actions.",
      lineNumbers: allPromptInjectionLines,
      recommendation:
        "Never concatenate raw user input into system or few-shot prompts. Use a dedicated user-message role, apply input length limits, strip control characters, and validate inputs against an allow-list. Consider output guardrails (content filters, response validation) as a defence-in-depth layer.",
      reference: "OWASP LLM Top 10 — LLM01: Prompt Injection",
      suggestedFix:
        "Move user input into a dedicated { role: 'user', content: sanitize(input) } message. Never concatenate into the system prompt. Apply input length limits and strip control characters.",
      confidence: 0.85,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-002  LLM output used unsanitised in dangerous sinks ──────────────
  const llmResponseVarPattern =
    /(?:completion|response|result|output|answer|generated|reply|chat|message)\s*(?:\.|(?:\[\s*["'`]?(?:content|text|choices|data|body)))/gi;
  const dangerousSinkPattern =
    /\.innerHTML\s*=|dangerouslySetInnerHTML|v-html|eval\s*\(|exec\s*\(|query\s*\(|execute\s*\(|\.run\s*\(|child_process|subprocess|os\.system|shell_exec/gi;

  const llmResponseLines = getLineNumbers(code, llmResponseVarPattern);
  const dangerousSinkLines = getLineNumbers(code, dangerousSinkPattern);

  if (hasLlmCall && llmResponseLines.length > 0 && dangerousSinkLines.length > 0) {
    const overlapLines = llmResponseLines.filter((line) => {
      const nearby = dangerousSinkLines.some((sinkLine) => Math.abs(sinkLine - line) <= 5);
      return nearby;
    });

    if (overlapLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "LLM output used in dangerous sink without sanitisation",
        description:
          "Content returned by an LLM is used in a dangerous context (innerHTML, eval, SQL query, shell command) without visible sanitisation. LLM output is inherently untrusted and can contain injected code, HTML, or SQL.",
        lineNumbers: overlapLines,
        recommendation:
          "Treat all LLM output as untrusted user input. Sanitise HTML with DOMPurify before rendering, parameterise SQL queries, and never pass LLM output to eval() or shell commands. Validate output structure against an expected schema.",
        reference: "OWASP LLM Top 10 — LLM02: Insecure Output Handling — CWE-79 / CWE-89",
        suggestedFix:
          "Sanitize LLM output before use: DOMPurify.sanitize(output) for HTML, parameterized queries for SQL, and never pass to eval() or shell commands.",
        confidence: 0.85,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-003  Placeholder security comments left by AI ─────────────────────
  const placeholderSecurityPattern =
    /(?:\/\/|#|\/\*)\s*(?:TODO|FIXME|HACK|XXX|TEMP)[\s:]*(?:add\s+(?:auth|authentication|authorization|validation|sanitization|encryption|rate.?limit|csrf|xss|input.?check|security|error.?handling|logging|audit)|implement\s+(?:auth|authentication|authorization|validation|security|encryption|rate.?limit)|fix\s+(?:security|auth|validation|injection)|need\s+(?:auth|validation|security|encryption)|replace\s+(?:with|before)\s+(?:prod|production))/gi;
  const placeholderLines = getLineNumbers(code, placeholderSecurityPattern);
  if (placeholderLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Placeholder security comment — missing implementation",
      description: `Found ${placeholderLines.length} TODO/FIXME comment(s) indicating that security-critical functionality (authentication, validation, encryption, etc.) has not been implemented yet. AI-generated code often leaves these placeholders which are easy to overlook during review.`,
      lineNumbers: placeholderLines,
      recommendation:
        "Implement the security controls indicated by each comment before merging. If the control is not needed, remove the comment and document why. Do not ship TODO security comments to production.",
      reference: "CWE-1188: Insecure Default Initialization of Resource",
      suggestedFix:
        "Replace each TODO/FIXME security comment with a working implementation or remove the comment and document why the control is unnecessary.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-004  Debug / development mode left enabled ────────────────────────
  const debugModePattern =
    /\bdebug\s*[:=]\s*(?:true|True|1|["']true["'])|app\.debug\s*=\s*True|DEBUG\s*=\s*True|NODE_ENV\s*(?:!==?|!=)\s*["']production["'].*(?:debug|verbose|log)|development\s*mode|debug\s*mode\s*(?:enabled|on|active)/gi;
  const flaskDebugPattern = /app\.run\s*\([^)]*debug\s*=\s*True/gi;
  const djangoDebugPattern = /^\s*DEBUG\s*=\s*True\s*$/gm;
  const springDebugPattern = /logging\.level\s*=\s*DEBUG|management\.endpoints\.web\.exposure\.include\s*=\s*\*/gi;

  const debugLines = [
    ...getLineNumbers(code, debugModePattern),
    ...getLineNumbers(code, flaskDebugPattern),
    ...getLineNumbers(code, djangoDebugPattern),
    ...getLineNumbers(code, springDebugPattern),
  ];
  const uniqueDebugLines = [...new Set(debugLines)].sort((a, b) => a - b);

  if (uniqueDebugLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Debug mode or verbose logging enabled",
      description:
        "Code has debug mode explicitly enabled, which is a common default in AI-generated code. Debug mode in production exposes stack traces, internal state, and sensitive configuration to end users.",
      lineNumbers: uniqueDebugLines,
      recommendation:
        "Set debug=false / NODE_ENV='production' for production builds. Gate verbose logging behind environment checks. Ensure debug settings are externalized to environment variables.",
      reference: "CWE-489: Active Debug Code — OWASP Security Misconfiguration",
      suggestedFix:
        "Replace hardcoded debug=true with environment-gated: debug: process.env.NODE_ENV !== 'production' or DEBUG=process.env.DEBUG === 'true'.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-005  Insecure WebSocket (ws://) usage ─────────────────────────────
  const wsInsecurePattern = /["'`]ws:\/\/|new\s+WebSocket\s*\(\s*["'`]ws:\/\//gi;
  const wsInsecureLines = getLineNumbers(code, wsInsecurePattern);
  if (wsInsecureLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Insecure WebSocket connection (ws://)",
      description:
        "WebSocket connections use the unencrypted 'ws://' protocol. All data transmitted over ws:// can be intercepted or tampered with by a network adversary.",
      lineNumbers: wsInsecureLines,
      recommendation:
        "Use 'wss://' (WebSocket Secure) for all WebSocket connections. Ensure TLS is properly configured on the server side.",
      reference: "CWE-319: Cleartext Transmission of Sensitive Information",
      suggestedFix:
        "Replace ws:// with wss:// for all WebSocket connections and ensure TLS certificates are properly configured on the server side.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-006  Overly permissive Content-Security-Policy directives ─────────
  const cspPattern = /Content-Security-Policy|contentSecurityPolicy|csp|helmet\s*\(\s*\{/gi;
  const cspUnsafePattern = /unsafe-inline|unsafe-eval|script-src\s+['"]\s*\*\s*['"]/gi;
  const cspLines = getLineNumbers(code, cspPattern);
  const cspUnsafeLines = getLineNumbers(code, cspUnsafePattern);

  if (cspUnsafeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Overly permissive Content-Security-Policy",
      description:
        "CSP directives include 'unsafe-inline', 'unsafe-eval', or wildcard script-src, which largely negate the protection CSP provides against XSS attacks. AI-generated code frequently adds these to suppress CSP errors during development.",
      lineNumbers: cspUnsafeLines,
      recommendation:
        "Remove 'unsafe-inline' and 'unsafe-eval' from CSP. Use nonce-based or hash-based CSP for inline scripts. Restrict script-src to trusted domains instead of '*'.",
      reference: "OWASP CSP — CWE-693: Protection Mechanism Failure",
      suggestedFix:
        "Remove 'unsafe-inline' and 'unsafe-eval' from CSP. Use nonce-based script-src: script-src 'nonce-{random}' and restrict sources to trusted domains.",
      confidence: 0.85,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-007  any type casts in security-critical paths ────────────────────
  if (LP.isJsTs(lang)) {
    const anyCastPattern = /as\s+any\b|\bany\b\s*[;,)}\]>]/g;
    const securityContextPattern =
      /(?:auth|token|session|crypto|encrypt|decrypt|hash|password|secret|credential|permission|role|jwt|bearer|cookie|csrf|sanitiz|validat)/i;

    const lines = code.split("\n");
    const anyCastInSecurityLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      anyCastPattern.lastIndex = 0;
      if (!anyCastPattern.test(lines[i])) continue;

      const contextStart = Math.max(0, i - 5);
      const contextEnd = Math.min(lines.length, i + 6);
      const context = lines.slice(contextStart, contextEnd).join("\n");

      if (securityContextPattern.test(context)) {
        anyCastInSecurityLines.push(i + 1);
      }
    }

    if (anyCastInSecurityLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Type safety bypassed in security-critical code",
        description:
          "TypeScript 'as any' or untyped 'any' usage found near authentication, cryptographic, or validation code. Bypassing the type system in security-sensitive areas can hide type mismatches that lead to vulnerabilities.",
        lineNumbers: anyCastInSecurityLines,
        recommendation:
          "Define proper interfaces for security-related data structures (tokens, sessions, credentials). Replace 'as any' with explicit types or runtime validation (zod, io-ts).",
        reference: "CWE-704: Incorrect Type Conversion or Cast",
        suggestedFix:
          "Replace 'as any' with a proper interface: interface TokenPayload { sub: string; exp: number; roles: string[] } and validate at runtime with zod or io-ts.",
        confidence: 0.75,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-008  Hardcoded URLs, endpoints, or IP addresses ──────────────────
  const hardcodedUrlPattern =
    /(?:const|let|var|=)\s*.*(?:["'`]https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com|schema\.org|w3\.org|json-schema\.org|swagger\.io)\S{10,}["'`])/gi;
  const hardcodedIpPattern = /["'`]\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?["'`]/g;

  const urlLines = getLineNumbers(code, hardcodedUrlPattern);
  const ipLines = getLineNumbers(code, hardcodedIpPattern);

  // Filter IP lines to remove common non-production IPs (localhost etc.)
  const filteredIpLines = ipLines.filter((lineNum) => {
    const line = code.split("\n")[lineNum - 1] || "";
    return !/127\.0\.0\.1|0\.0\.0\.0|255\.255\.255|localhost/i.test(line);
  });

  const allHardcodedEndpointLines = [...new Set([...urlLines, ...filteredIpLines])].sort((a, b) => a - b);

  if (allHardcodedEndpointLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded URLs or IP addresses",
      description: `Found ${allHardcodedEndpointLines.length} hardcoded URL(s) or IP address(es). AI-generated code frequently hardcodes endpoints that should be configurable per environment. Hardcoded production URLs in source code can leak internal infrastructure details.`,
      lineNumbers: allHardcodedEndpointLines.slice(0, 10),
      recommendation:
        "Move all endpoint URLs and IP addresses to environment variables or a configuration file. Use service discovery or DNS for internal services.",
      reference: "12-Factor App: Config (Factor III) — CWE-798",
      suggestedFix:
        "Move URLs to environment variables: const apiUrl = process.env.API_URL ?? 'http://localhost:3000'; and load from .env files per environment.",
      confidence: 0.8,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-009  Binding to all interfaces without intent ─────────────────────
  const bindAllPattern = /(?:listen|bind|serve|Listen|Bind)\s*\(\s*(?:["'`]0\.0\.0\.0["'`]|["'`]::["'`])/gi;
  const bindAllLines = getLineNumbers(code, bindAllPattern);
  if (bindAllLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Server binds to all network interfaces (0.0.0.0)",
      description:
        "The server explicitly binds to 0.0.0.0 (all interfaces), making it accessible from any network. AI-generated boilerplate often uses this default, which can expose development servers to the local network or the public internet.",
      lineNumbers: bindAllLines,
      recommendation:
        "Bind to 127.0.0.1 or localhost for development. For production, use 0.0.0.0 only behind a reverse proxy or firewall. Make the bind address configurable via environment variable.",
      reference: "CWE-668: Exposure of Resource to Wrong Sphere",
      suggestedFix:
        "Bind to 127.0.0.1 for development: app.listen(PORT, '127.0.0.1'). Make the bind address configurable: const host = process.env.HOST ?? '127.0.0.1'.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-010  Missing input validation on request handlers ─────────────────
  const requestHandlerPattern =
    /(?:app|router)\.\s*(?:get|post|put|patch|delete)\s*\(\s*["'`]|@(?:Get|Post|Put|Patch|Delete|RequestMapping|ApiOperation)|def\s+\w+\s*\(\s*(?:request|req)|func\s+\w+\s*\(\s*(?:w\s+http\.ResponseWriter|c\s+\*gin\.Context)/gi;
  const inputValidationPattern =
    /(?:validate|sanitize|schema|zod|joi|yup|class-validator|express-validator|pydantic|wtforms|marshmallow|cerberus|jsonschema|ajv|superstruct|io-ts|typia)\b/gi;

  const handlerLines = getLineNumbers(code, requestHandlerPattern);
  const hasValidation = inputValidationPattern.test(code);

  if (handlerLines.length >= 2 && !hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Request handlers without input validation",
      description: `Found ${handlerLines.length} API endpoint handler(s) but no input validation library or schema validation is detected. AI-generated API code frequently omits input validation, leaving endpoints vulnerable to injection, type confusion, and data integrity issues.`,
      lineNumbers: handlerLines.slice(0, 5),
      recommendation:
        "Add schema validation for all request inputs (body, query, params). Use zod, joi, or yup (Node.js), pydantic (Python), class-validator (NestJS), or equivalent for your framework. Validate at the boundary before any business logic.",
      reference: "OWASP Input Validation — CWE-20: Improper Input Validation",
      suggestedFix:
        "Add schema validation at the boundary: app.post('/api', validate(schema), handler). Use zod, joi, or express-validator to validate body, query, and params.",
      confidence: 0.7,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-011  LLM API calls without timeout or error handling ──────────────
  if (hasLlmCall) {
    const llmCallLines = getLineNumbers(code, llmCallPattern);
    const hasTimeout = /timeout|signal|AbortController|asyncio\.wait_for|context\.WithTimeout|CancellationToken/gi.test(
      code,
    );
    const hasRetry = /retry|retries|backoff|tenacity|polly|resilience|Circuit/gi.test(code);

    if (!hasTimeout && !hasRetry && llmCallLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "LLM API calls without timeout or retry handling",
        description:
          "Calls to LLM APIs (OpenAI, Anthropic, etc.) are made without visible timeout, cancellation, or retry logic. LLM APIs can have high latency or transient failures; without timeouts, requests can hang indefinitely and exhaust server resources.",
        lineNumbers: llmCallLines.slice(0, 5),
        recommendation:
          "Set explicit timeouts on all LLM API calls (e.g. AbortController in JS, asyncio.wait_for in Python). Implement retry with exponential backoff for transient errors. Add circuit breaker patterns for production workloads.",
        reference: "CWE-400: Uncontrolled Resource Consumption",
        suggestedFix:
          "Add timeout and retry: const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 30000); await openai.chat.completions.create({ ...opts, signal: ctrl.signal }).",
        confidence: 0.7,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-012  No output guardrails on LLM responses ────────────────────────
  if (hasLlmCall) {
    const outputGuardrailPattern =
      /(?:guardrail|content.?filter|moderation|safety|toxicity|output.?valid|response.?valid|schema.?valid|json.?parse|structured.?output|function.?call|tool.?use)/gi;
    const hasOutputGuardrails = outputGuardrailPattern.test(code);

    if (!hasOutputGuardrails && llmResponseLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "No output validation or guardrails on LLM responses",
        description:
          "LLM API responses are consumed without visible content filtering, output validation, or structured output parsing. LLM responses can contain hallucinated data, harmful content, or unexpected formats that cause downstream failures.",
        lineNumbers: llmResponseLines.slice(0, 5),
        recommendation:
          "Validate LLM output against an expected schema (JSON schema, zod, pydantic). Apply content moderation for user-facing output. Use structured output / function-calling features when available. Log and monitor output anomalies.",
        reference: "OWASP LLM Top 10 — LLM02: Insecure Output Handling / LLM09: Overreliance",
        suggestedFix:
          "Validate LLM output: const parsed = responseSchema.parse(JSON.parse(llmOutput)); and apply content moderation before rendering to users.",
        confidence: 0.7,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-013  Excessive permissions or wildcard resource access ─────────────
  const wildcardPermPattern =
    /["'`]\*["'`]\s*(?:,|\]|\})|Action["']?\s*:\s*["'`]\*["'`]|Resource["']?\s*:\s*["'`]\*["'`]|grant\s+all|GRANT\s+ALL|role.*admin|ALL\s+PRIVILEGES|permissions?\s*[:=]\s*\[?\s*["'`]\*["'`]/gi;
  const wildcardPermLines = getLineNumbers(code, wildcardPermPattern);
  if (wildcardPermLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Wildcard or overly broad permissions",
      description:
        "Code or configuration grants wildcard (*) permissions, admin roles, or ALL PRIVILEGES. AI-generated infrastructure and IAM code frequently uses overly broad permissions for simplicity, violating the principle of least privilege.",
      lineNumbers: wildcardPermLines,
      recommendation:
        "Follow the principle of least privilege. Grant only the specific actions and resources required. Use separate roles for read vs write operations. Review IAM policies with a tool like AWS IAM Access Analyzer or Azure Policy.",
      reference: "CWE-250: Execution with Unnecessary Privileges — OWASP Excessive Permissions",
      suggestedFix:
        "Replace wildcard '*' permissions with specific actions and resources: { Effect: 'Allow', Action: ['s3:GetObject'], Resource: 'arn:aws:s3:::my-bucket/*' }.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-014  Missing rate limiting on AI/LLM endpoints ────────────────────
  if (hasLlmCall) {
    const rateLimitPattern = /rate.?limit|throttle|limiter|token.?bucket|sliding.?window|rateLimit/gi;
    const hasRateLimit = rateLimitPattern.test(code);
    const handlerCount = getLineNumbers(code, requestHandlerPattern).length;

    if (!hasRateLimit && handlerCount > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "AI-powered endpoints without rate limiting",
        description:
          "API endpoints that call LLM services are exposed without visible rate limiting. LLM API calls are expensive and slow; without rate limiting, a single abusive client can exhaust your API budget or cause denial of service.",
        lineNumbers: getLineNumbers(code, requestHandlerPattern).slice(0, 5),
        recommendation:
          "Add rate limiting middleware to all endpoints that trigger LLM calls. Consider per-user and per-IP limits. Implement cost tracking and budget alerts for AI API usage.",
        reference: "CWE-770: Allocation of Resources Without Limits — OWASP API8: Lack of Rate Limiting",
        suggestedFix:
          "Add rate limiting middleware: app.use('/ai/', rateLimit({ windowMs: 60_000, max: 10, keyGenerator: req => req.user.id })); and track per-user AI API costs.",
        confidence: 0.7,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-015  Sensitive data sent to external AI services ──────────────────
  if (hasLlmCall) {
    const sensitiveDataInPromptPattern =
      /(?:ssn|social.?security|password|credit.?card|card.?number|cvv|bank.?account|health.?record|medical|diagnosis|salary|tax.?id|passport|driver.?license)\s*(?:[+:,\]})]|\.toString|String\()/gi;
    const sensitivePromptLines = getLineNumbers(code, sensitiveDataInPromptPattern);

    if (sensitivePromptLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Sensitive data potentially sent to external AI service",
        description:
          "Variables containing PII, financial data, or health information appear to be included in data sent to an external AI/LLM service. This can violate GDPR, HIPAA, PCI DSS, and data residency requirements.",
        lineNumbers: sensitivePromptLines,
        recommendation:
          "Never send raw PII, financial, or health data to external AI services. Anonymise or pseudonymise data before sending. Use on-premise or private-endpoint AI deployments for regulated data. Implement data classification and DLP policies.",
        reference: "OWASP LLM Top 10 — LLM06: Sensitive Information Disclosure — CWE-359",
        suggestedFix:
          "Anonymize data before sending to AI: replace PII with tokens using a reversible tokenizer, or use on-premise/private-endpoint AI deployments for regulated data.",
        confidence: 0.85,
      });
    } else {
      ruleNum++;
    }
  } else {
    ruleNum++;
  }

  // ── AICS-016  Tool-call results used without validation ────────────────────
  const toolResultPattern =
    /tool[_.]?(?:result|output|response|call)|function[_.]?(?:result|output|response|call)|action[_.]?result|tool_use|tool_calls/gi;
  const toolResultLines = getLineNumbers(code, toolResultPattern);
  const hasResultValidation =
    /(?:validate|sanitize|parse|check|verify|filter|schema|zod|joi|yup|JSON\.parse|try\s*\{[^}]*JSON)/gi.test(code);

  if (toolResultLines.length > 0 && !hasResultValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Tool-call results used without validation",
      description:
        "Results from external tool calls (MCP tools, function calls, agent actions) are used without visible validation or sanitization. Tool outputs are untrusted — they can contain injected content, unexpected formats, or malicious payloads that compromise the calling agent or downstream consumers.",
      lineNumbers: toolResultLines.slice(0, 5),
      recommendation:
        "Validate all tool-call results against an expected schema before use. Sanitize string outputs before injecting into prompts or rendering to users. Implement timeout and error handling for tool calls. Consider content filtering on tool outputs.",
      reference: "OWASP LLM Top 10 — LLM02: Insecure Output Handling / Tool Use Safety",
      suggestedFix:
        "Validate tool results: const parsed = schema.parse(toolResult); and sanitize string content before injecting into prompts or rendering.",
      confidence: 0.7,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-017  Weak or broken cryptographic hashing ─────────────────────────
  const weakHashLines = getLangLineNumbers(code, language, LP.WEAK_HASH);
  if (weakHashLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Weak cryptographic hash (MD5/SHA-1)",
      description:
        "AI-generated code frequently uses MD5 or SHA-1 for hashing. Both algorithms have known collision vulnerabilities and are unsuitable for password hashing, integrity verification, or digital signatures.",
      lineNumbers: weakHashLines,
      recommendation:
        "Replace MD5/SHA-1 with SHA-256+ for integrity checks, or bcrypt/scrypt/argon2 for password hashing. Use crypto.subtle.digest('SHA-256', data) in web contexts.",
      reference: "CWE-328: Use of Weak Hash — NIST SP 800-131A",
      suggestedFix:
        "Replace weak hashes: crypto.createHash('sha256') instead of md5/sha1. For passwords, use bcrypt: await bcrypt.hash(password, 12).",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-018  Empty or swallowed catch blocks ──────────────────────────────
  const emptyCatchLines = getLangLineNumbers(code, language, LP.EMPTY_CATCH);
  if (emptyCatchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Empty catch block swallows errors silently",
      description: `Found ${emptyCatchLines.length} empty catch block(s) that silently discard errors. AI-generated code commonly produces catch blocks that suppress exceptions, hiding bugs, security failures, and data corruption. This pattern is especially dangerous in authentication, data persistence, and payment flows.`,
      lineNumbers: emptyCatchLines,
      recommendation:
        "At minimum, log the error. In security-critical paths, re-throw or return an error response. Never silently swallow exceptions in production code.",
      reference: "CWE-390: Detection of Error Condition Without Action",
      suggestedFix:
        "Replace empty catch: catch (err) { logger.error('Operation failed', { error: err, context }); throw err; } or return an error response.",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-019  Dummy/placeholder credentials in code ────────────────────────
  const dummyCredPattern =
    /["'`](?:changeme|password123|admin123|secret123|test123|your[_-]?(?:api[_-]?key|token|secret|password)[_-]?here|replace[_-]?me|TODO[_-]?change|CHANGE[_-]?ME|xxxx+|sk-[.]{3,}|pk_test_|sk_test_|example[_-]?(?:key|token|secret))["'`]/gi;
  const dummyCredLines = getLineNumbers(code, dummyCredPattern);
  if (dummyCredLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Placeholder or dummy credentials in code",
      description: `Found ${dummyCredLines.length} placeholder credential(s) (e.g. "changeme", "your_api_key_here", "password123"). AI-generated code frequently includes dummy credentials as examples that are easily forgotten and shipped to production, creating trivially exploitable vulnerabilities.`,
      lineNumbers: dummyCredLines,
      recommendation:
        "Remove all placeholder credentials. Load secrets from environment variables or a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault). Never commit credentials to source control.",
      reference: "CWE-798: Use of Hard-coded Credentials — OWASP A07:2021",
      suggestedFix:
        "Replace placeholder credentials with environment variable reads: const apiKey = process.env.API_KEY ?? throwMissing('API_KEY'); and store values in .env (gitignored) or a secrets manager.",
      confidence: 0.95,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-020  TLS/certificate verification disabled ────────────────────────
  const tlsDisabledLines = getLangLineNumbers(code, language, LP.TLS_DISABLED);
  if (tlsDisabledLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "TLS certificate verification disabled",
      description:
        "SSL/TLS certificate verification has been disabled (e.g. rejectUnauthorized: false, verify=False, InsecureSkipVerify: true). AI-generated code often disables certificate checks to bypass development SSL errors, leaving the code vulnerable to man-in-the-middle attacks in production.",
      lineNumbers: tlsDisabledLines,
      recommendation:
        "Never disable TLS verification in production. Use properly signed certificates (Let's Encrypt is free). If self-signed certificates are required for internal services, configure the specific CA certificate rather than disabling all verification.",
      reference: "CWE-295: Improper Certificate Validation — OWASP A07:2021",
      suggestedFix:
        "Remove rejectUnauthorized: false. Use proper TLS certificates or configure a custom CA: const agent = new https.Agent({ ca: fs.readFileSync('internal-ca.pem') }).",
      confidence: 0.9,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-021  Overly permissive CORS configuration ─────────────────────────
  const corsWildcardLines = getLangLineNumbers(code, language, LP.CORS_WILDCARD);
  if (corsWildcardLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Overly permissive CORS — wildcard origin",
      description:
        "CORS is configured with a wildcard (*) origin, allowing any website to make cross-origin requests to this API. AI-generated code almost always uses wildcard CORS as the quickest way to bypass cross-origin errors. This can enable CSRF-like attacks and data exfiltration from authenticated endpoints.",
      lineNumbers: corsWildcardLines,
      recommendation:
        "Restrict CORS to specific trusted origins: cors({ origin: ['https://app.example.com'] }). For APIs with authentication, never use wildcard origins — browsers will not send cookies/credentials with wildcard CORS.",
      reference: "CWE-942: Overly Permissive Cross-domain Whitelist — OWASP A05:2021",
      suggestedFix:
        "Replace wildcard CORS with an allow-list: cors({ origin: [process.env.ALLOWED_ORIGIN ?? 'https://app.example.com'], credentials: true }).",
      confidence: 0.85,
    });
  } else {
    ruleNum++;
  }

  // ── AICS-022  Unsafe deserialization of untrusted data ─────────────────────
  const unsafeDeserLines = getLangLineNumbers(code, language, LP.UNSAFE_DESERIALIZATION);
  if (unsafeDeserLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Unsafe deserialization of untrusted data",
      description:
        "Code uses deserialization functions that can execute arbitrary code when processing untrusted input (e.g. pickle.loads, yaml.load without SafeLoader, eval-based JSON parsing). AI-generated code frequently uses the simplest deserialization method without considering security implications.",
      lineNumbers: unsafeDeserLines,
      recommendation:
        "Use safe deserialization: yaml.safe_load() instead of yaml.load(), avoid pickle for untrusted data (use JSON), use JSON.parse() instead of eval(). Validate deserialized data against a schema.",
      reference: "CWE-502: Deserialization of Untrusted Data — OWASP A08:2021",
      suggestedFix:
        "Replace unsafe deserialization: yaml.safe_load(data) instead of yaml.load(data). For Python, use json.loads() instead of pickle.loads() for untrusted data. Always validate output against a schema.",
      confidence: 0.85,
    });
  } else {
    ruleNum++;
  }

  return findings;
}
