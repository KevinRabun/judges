import type { Finding } from "../types.js";
import { isCommentLine } from "./shared.js";

/**
 * Intent-Alignment evaluator — detects mismatches between code's stated intent
 * (names, comments, docstrings) and its actual implementation.
 *
 * Rules:
 *   INTENT-001  Stub function with TODO / not-implemented body
 *   INTENT-002  Security-sensitive stub (validate/auth/encrypt/sanitize)
 *   INTENT-003  Empty or trivial function body
 *   INTENT-004  Placeholder return (hardcoded value despite dynamic name)
 *   INTENT-005  Docstring param mismatch
 *   INTENT-006  Misleading function name (promises behavior it doesn't perform)
 *   INTENT-007  Semantic drift: error handler that swallows errors silently
 *   INTENT-008  Semantic drift: async function that never awaits
 *   INTENT-009  Semantic drift: loop body that ignores iteration variable
 *   INTENT-010  Semantic drift: branching that always takes one path
 */
export function analyzeIntentAlignment(code: string, _language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "INTENT";

  // ── INTENT-001 / INTENT-002: Stub functions ──────────────────────────────
  // Detect function bodies that contain only TODO/FIXME/throw "not implemented"
  const stubPattern =
    /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|(\w+)\s*\([^)]*\)\s*(?::\s*\w[^{]*?)?\{|def\s+(\w+)|fn\s+(\w+)|(?:public|private|protected|internal)\s+(?:(?:static|async|override|virtual)\s+)*\w+\s+(\w+)\s*\()/;
  const todoStubBody =
    /^\s*(?:\/\/\s*TODO|#\s*TODO|\/\*\s*TODO|throw\s+(?:new\s+)?(?:Error|NotImplementedError|UnsupportedOperationException)\s*\(\s*["'](?:not implemented|todo|fixme|stub)|pass\s*(?:#.*)?$|raise\s+NotImplementedError|unimplemented!\(\)|todo!\(\))/im;
  const securityNames =
    /^(?:validate|verify|authenticate|authorize|check(?:Auth|Permission|Access|Token)|encrypt|decrypt|sanitize|escape|hash(?:Password)?|signToken|verifyToken|filterXss|checkCsrf)/i;

  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const fnMatch = lines[i].match(stubPattern);
    if (!fnMatch) continue;

    const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3] || fnMatch[4] || fnMatch[5] || fnMatch[6];
    if (!fnName) continue;

    // Look at the next 5 non-empty lines for stub indicators
    const bodyLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const trimmed = lines[j].trim();
      if (trimmed === "{" || trimmed === "") continue;
      if (trimmed === "}" || trimmed === "}," || trimmed === "};") break;
      bodyLines.push(trimmed);
    }

    if (bodyLines.length === 0) continue;
    const bodyText = bodyLines.join("\n");

    if (todoStubBody.test(bodyText)) {
      // Skip explicitly deprecated/legacy functions — stubs are expected there
      if (/^(?:old_|legacy_|deprecated_)/i.test(fnName) || /\bdeprecated\b/i.test(bodyText)) continue;

      const isSecurity = securityNames.test(fnName);
      findings.push({
        ruleId: `${prefix}-${isSecurity ? "002" : "001"}`,
        severity: isSecurity ? "critical" : "medium",
        title: isSecurity ? `Security-sensitive stub: \`${fnName}()\`` : `Stub function: \`${fnName}()\``,
        description: isSecurity
          ? `Function \`${fnName}()\` has a security-sensitive name but its body is a stub (TODO/throw). ` +
            "This means the security check is not actually performed, leaving the system unprotected."
          : `Function \`${fnName}()\` contains only a TODO comment or throws "not implemented". ` +
            "Stub functions that reach production can cause runtime failures.",
        lineNumbers: [i + 1],
        recommendation: isSecurity
          ? `Implement the ${fnName}() function with proper security logic, or remove it and handle the security concern at a higher level.`
          : `Implement the function body or remove it if it's no longer needed. If it's intentionally deferred, add a tracking issue reference.`,
        reference: "Code Review — Stub & Placeholder Detection",
        confidence: isSecurity ? 0.88 : 0.75,
        provenance: "intent-alignment",
      });
    }
  }

  // ── INTENT-003: Empty / trivial function bodies ──────────────────────────
  const emptyFnPattern =
    /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|(\w+)\s*\([^)]*\)\s*(?::\s*\w[^{]*?)?\{|def\s+(\w+)|fn\s+(\w+))/;

  // Require at least 2 empty functions to reduce false positives — a single
  // empty function (e.g. a default trait method, callback stub, or protocol
  // conformance) is common in otherwise well-written code.
  const emptyFnLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const fnMatch = lines[i].match(emptyFnPattern);
    if (!fnMatch) continue;

    const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3] || fnMatch[4] || fnMatch[5];
    if (!fnName) continue;

    // Check for empty body: { } or => {} or pass
    const nextLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      nextLines.push(lines[j].trim());
    }
    const next = nextLines.join(" ").trim();

    // Empty body patterns
    const isEmpty =
      /^(?:\{?\s*\}|return\s*;?\s*\}|return\s+(?:null|undefined|None|nil|false|"")\s*;?\s*\}|pass\s*$)/.test(next);

    if (isEmpty && fnName.length > 2 && !/^(?:noop|empty|stub|mock|fake|dummy|_)/i.test(fnName)) {
      emptyFnLines.push(i + 1);
    }
  }
  if (emptyFnLines.length > 1) {
    findings.push({
      ruleId: `${prefix}-003`,
      severity: "medium",
      title: `Empty function bodies (${emptyFnLines.length} found)`,
      description:
        `${emptyFnLines.length} functions have empty or trivial bodies (return null/undefined/false with no logic). ` +
        "If this is intentional, consider naming them with a 'noop' prefix or adding a comment.",
      lineNumbers: emptyFnLines.slice(0, 5),
      recommendation: "Implement the function logic, or if they are deliberate no-ops, rename them to signal intent.",
      reference: "Code Review — Empty Implementation Detection",
      confidence: 0.65,
      provenance: "intent-alignment",
    });
  }

  // ── INTENT-004: Placeholder returns (hardcoded value from dynamic name) ──
  const dynamicNames =
    /^(?:calculate|compute|get|fetch|find|search|lookup|resolve|determine|derive|parse|extract|generate|build|create|load|read)/i;

  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const fnMatch = lines[i].match(emptyFnPattern);
    if (!fnMatch) continue;

    const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3] || fnMatch[4] || fnMatch[5];
    if (!fnName || !dynamicNames.test(fnName)) continue;

    // Check if body is just a single return of a hardcoded value
    const bodyLines: string[] = [];
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const trimmed = lines[j].trim();
      if (trimmed === "{" || trimmed === "") continue;
      if (trimmed === "}" || trimmed === "}," || trimmed === "};") break;
      bodyLines.push(trimmed);
    }

    if (
      bodyLines.length === 1 &&
      /^return\s+(?:true|false|null|undefined|None|nil|0|-1|""|\[\]|\{\}|'[^']*'|"[^"]*"|\d+)\s*;?$/.test(bodyLines[0])
    ) {
      findings.push({
        ruleId: `${prefix}-004`,
        severity: "medium",
        title: `Placeholder return in \`${fnName}()\``,
        description:
          `Function \`${fnName}()\` has a name that implies computation or data retrieval, ` +
          `but its body simply returns a hardcoded value: \`${bodyLines[0].trim()}\`.`,
        lineNumbers: [i + 1],
        recommendation:
          "Implement the actual logic, or rename the function to indicate it returns a constant " +
          "(e.g., `getDefault${fnName.slice(3)}`).",
        reference: "Code Review — Placeholder Detection",
        confidence: 0.7,
        provenance: "intent-alignment",
      });
    }
  }

  // ── INTENT-005: Docstring param mismatch ─────────────────────────────────
  // Detect @param/@arg JSDoc tags that reference non-existent parameters
  const jsdocBlock = /\/\*\*[\s\S]*?\*\//g;
  let jsdocMatch;
  while ((jsdocMatch = jsdocBlock.exec(code)) !== null) {
    const blockStart = code.slice(0, jsdocMatch.index).split("\n").length;
    const docParams: string[] = [];
    for (const m of jsdocMatch[0].matchAll(/@param\s+(?:\{[^}]*\}\s+)?(\w+)/g)) {
      docParams.push(m[1]);
    }
    if (docParams.length === 0) continue;

    // Find the function signature after this JSDoc block
    const afterDoc = code.slice(jsdocMatch.index + jsdocMatch[0].length, jsdocMatch.index + jsdocMatch[0].length + 300);
    const sigMatch = afterDoc.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?)\s*\(([^)]*)\)/);
    if (!sigMatch) continue;

    const actualParams = sigMatch[1]
      .split(",")
      .map((p) =>
        p
          .trim()
          .replace(/[:=?].*$/, "")
          .replace(/^\.\.\./, "")
          .trim(),
      )
      .filter(Boolean);

    const missing = docParams.filter((dp) => !actualParams.includes(dp));
    if (missing.length > 0) {
      findings.push({
        ruleId: `${prefix}-005`,
        severity: "low",
        title: `Docstring references non-existent parameter(s): ${missing.join(", ")}`,
        description:
          `JSDoc block documents parameter(s) ${missing.map((p) => `\`${p}\``).join(", ")} ` +
          `but the function signature only has: ${actualParams.map((p) => `\`${p}\``).join(", ") || "(none)"}.`,
        lineNumbers: [blockStart],
        recommendation: "Update the JSDoc to match the actual function signature, or add the missing parameters.",
        reference: "Code Documentation Best Practices",
        confidence: 0.8,
        provenance: "intent-alignment",
      });
    }
  }

  // ── INTENT-006: Misleading name — security function without security logic
  const securityFnPattern =
    /(?:function\s+(validate\w*|verify\w*|authenticate\w*|authorize\w*|sanitize\w*|escape\w*|encrypt\w*|checkPermission\w*)|(?:const|let|var)\s+(validate\w*|verify\w*|authenticate\w*|authorize\w*|sanitize\w*|escape\w*|encrypt\w*|checkPermission\w*)\s*=)/;

  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const secMatch = lines[i].match(securityFnPattern);
    if (!secMatch) continue;

    const fnName = secMatch[1] || secMatch[2];
    if (!fnName) continue;

    // Collect body (up to 20 lines)
    const bodyLines: string[] = [];
    let braceDepth = 0;
    let foundOpen = false;
    for (let j = i; j < Math.min(i + 25, lines.length); j++) {
      const line = lines[j];
      if (line.includes("{")) {
        foundOpen = true;
        braceDepth += (line.match(/\{/g) || []).length;
      }
      if (line.includes("}")) {
        braceDepth -= (line.match(/\}/g) || []).length;
      }
      if (foundOpen) bodyLines.push(line);
      if (foundOpen && braceDepth <= 0) break;
    }

    const body = bodyLines.join("\n");

    // Check if the body actually performs the promised operation
    const hasSecurityLogic =
      /(?:bcrypt|argon2|crypto\.|jwt\.|token|hash|hmac|pbkdf|scrypt|verify|compare|sign|encrypt|decrypt|sanitize|escape|encode|decode|salt|DOMPurify|createCipher|createHash|timingSafeEqual)/i.test(
        body,
      ) || /(?:throw|reject|res\.status\s*\(\s*(?:401|403)|unauthorized|forbidden|invalid)/i.test(body);

    // If the function name promises security but body has none, and body is >3 lines
    if (!hasSecurityLogic && bodyLines.length > 3) {
      // Make sure it's not just returning true (already caught by INTENT-004)
      if (!/^(?:\s*return\s+true\s*;?\s*)$/m.test(body)) {
        findings.push({
          ruleId: `${prefix}-006`,
          severity: "high",
          title: `Misleading name: \`${fnName}()\` lacks security logic`,
          description:
            `Function \`${fnName}()\` has a name that implies security validation, ` +
            "but its body contains no recognizable security operations (hashing, token verification, sanitization, etc.).",
          lineNumbers: [i + 1],
          recommendation:
            `Either implement proper ${fnName.replace(/[A-Z]/g, (c) => " " + c.toLowerCase()).trim()} logic, ` +
            "or rename the function to accurately reflect what it does.",
          reference: "Secure Development — Naming Conventions",
          confidence: 0.68,
          provenance: "intent-alignment",
        });
      }
    }
  }

  // ── INTENT-007: Error handler that swallows errors silently ──────────────
  // AI-generated code often wraps things in try/catch but leaves the catch empty
  // or logs without re-throwing. This is "intent drift" — the developer intended
  // error handling but the generated code silently swallows failures.
  const catchPattern = /catch\s*\(\s*(\w+)\s*\)/g;
  let catchMatch;
  while ((catchMatch = catchPattern.exec(code)) !== null) {
    const catchLine = code.slice(0, catchMatch.index).split("\n").length;
    const errVar = catchMatch[1];
    // Collect catch body (up to 8 lines)
    const afterCatch = code.slice(
      catchMatch.index + catchMatch[0].length,
      catchMatch.index + catchMatch[0].length + 500,
    );
    const catchBody = afterCatch.match(/\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
    if (!catchBody) continue;

    const body = catchBody[1].trim();
    // Empty catch or comment-only catch
    if (body === "" || /^\/[/*]/.test(body.replace(/\s/g, ""))) {
      findings.push({
        ruleId: `${prefix}-007`,
        severity: "high",
        title: `Silent error swallowing in catch(${errVar})`,
        description:
          `The catch block for \`${errVar}\` is empty or contains only a comment. ` +
          "Errors are silently discarded, which can mask failures and make debugging impossible.",
        lineNumbers: [catchLine],
        recommendation:
          "Log the error, re-throw it, or handle it explicitly. If intentionally ignoring errors, add a comment explaining why.",
        reference: "Error Handling Best Practices — Silent Catch Anti-pattern",
        confidence: 0.82,
        provenance: "intent-alignment",
      });
    }
    // Catch that logs but never re-throws (outside test files)
    else if (
      /console\.(?:log|warn|error)|logger\.|log\./i.test(body) &&
      !/throw\s|reject\s*\(|process\.exit/i.test(body) &&
      !/\.test\.|\.spec\.|__tests__|test_/i.test(code.slice(0, 50))
    ) {
      findings.push({
        ruleId: `${prefix}-007`,
        severity: "medium",
        title: `Catch logs but never re-throws (${errVar})`,
        description:
          `The catch block for \`${errVar}\` logs the error but never re-throws or propagates it. ` +
          "Callers won't know an error occurred.",
        lineNumbers: [catchLine],
        recommendation:
          "Consider re-throwing the error after logging, or return an error indicator so callers can react.",
        reference: "Error Handling Best Practices — Error Propagation",
        confidence: 0.55,
        provenance: "intent-alignment",
      });
    }
  }

  // ── INTENT-008: Async function that never awaits ────────────────────────
  // AI models sometimes mark functions async without actually using await,
  // meaning the function returns a resolved promise and any async operations
  // inside are fire-and-forget.
  const asyncFnPattern =
    /(?:async\s+function\s+(\w+)|(\w+)\s*=\s*async\s*(?:\([^)]*\)|[^=])\s*=>|async\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{)/g;
  let asyncMatch;
  while ((asyncMatch = asyncFnPattern.exec(code)) !== null) {
    const fnName = asyncMatch[1] || asyncMatch[2] || asyncMatch[3];
    if (!fnName) continue;

    const startIdx = asyncMatch.index + asyncMatch[0].length;
    // Collect body until we find the matching close brace
    let depth = 1;
    let end = startIdx;
    for (let ci = startIdx; ci < code.length && depth > 0; ci++) {
      if (code[ci] === "{") depth++;
      if (code[ci] === "}") depth--;
      end = ci;
    }
    if (depth !== 0) continue;

    const body = code.slice(startIdx, end);
    // Check if there's any await or yield in the body
    if (body.length > 20 && !/\bawait\b|\byield\b/.test(body)) {
      // Skip very short bodies / testing mocks
      if (!/mock|stub|fake|noop|test/i.test(fnName)) {
        const fnLine = code.slice(0, asyncMatch.index).split("\n").length;
        findings.push({
          ruleId: `${prefix}-008`,
          severity: "medium",
          title: `Async function \`${fnName}()\` never awaits`,
          description:
            `Function \`${fnName}()\` is declared async but its body contains no \`await\` expressions. ` +
            "This means all operations run synchronously and the async keyword is misleading, or async " +
            "calls inside are fire-and-forget (won't catch errors).",
          lineNumbers: [fnLine],
          recommendation:
            "Add `await` to async calls inside the function, or remove the `async` keyword if it's not needed.",
          reference: "Async Programming — Intent vs. Implementation",
          confidence: 0.72,
          provenance: "intent-alignment",
        });
      }
    }
  }

  // ── INTENT-009: Loop that ignores its iteration variable ─────────────────
  // AI-generated code sometimes creates loops for "iteration" but the body
  // never uses the loop variable, doing the same thing each iteration.
  const forOfInPattern = /for\s*\(\s*(?:const|let|var)\s+(\w+)\s+(?:of|in)\s+\S[^)]*\)\s*\{/g;
  let forMatch;
  while ((forMatch = forOfInPattern.exec(code)) !== null) {
    const iterVar = forMatch[1];
    if (iterVar === "_" || iterVar.startsWith("_")) continue; // intentionally unused

    const startIdx = forMatch.index + forMatch[0].length;
    let depth = 1;
    let end = startIdx;
    for (let ci = startIdx; ci < code.length && depth > 0; ci++) {
      if (code[ci] === "{") depth++;
      if (code[ci] === "}") depth--;
      end = ci;
    }
    if (depth !== 0) continue;

    const loopBody = code.slice(startIdx, end);
    // Check if the iteration variable is used in the body
    const varRegex = new RegExp(`\\b${iterVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (loopBody.length > 10 && !varRegex.test(loopBody)) {
      const loopLine = code.slice(0, forMatch.index).split("\n").length;
      findings.push({
        ruleId: `${prefix}-009`,
        severity: "medium",
        title: `Loop variable \`${iterVar}\` is never used in body`,
        description:
          `The for-of/for-in loop declares \`${iterVar}\` but never references it in the loop body. ` +
          "The loop repeats the same operation N times without varying by element, which may indicate an " +
          "AI-generated loop that looks correct structurally but doesn't actually iterate over the data.",
        lineNumbers: [loopLine],
        recommendation:
          "Use the iteration variable in the loop body, or if repeating N times is intentional, use a " +
          "counting loop and rename the variable with an underscore prefix (`_item`).",
        reference: "Code Quality — Semantic Loop Correctness",
        confidence: 0.75,
        provenance: "intent-alignment",
      });
    }
  }

  // ── INTENT-010: Branching that always takes one path ─────────────────────
  // Detect if/else where both branches do the same thing (AI copy-paste drift)
  const ifElsePattern = /if\s*\([^)]+\)\s*\{([^}]*)\}\s*else\s*\{([^}]*)\}/g;
  let ifMatch;
  while ((ifMatch = ifElsePattern.exec(code)) !== null) {
    const thenBranch = ifMatch[1].trim();
    const elseBranch = ifMatch[2].trim();

    if (thenBranch.length > 5 && thenBranch === elseBranch) {
      const ifLine = code.slice(0, ifMatch.index).split("\n").length;
      findings.push({
        ruleId: `${prefix}-010`,
        severity: "medium",
        title: "If/else branches are identical",
        description:
          "Both the `if` and `else` branches contain identical code. The conditional has no effect " +
          "and may indicate AI-generated code that was duplicated rather than properly differentiated.",
        lineNumbers: [ifLine],
        recommendation:
          "Remove the conditional and keep just the body, or differentiate the branches to handle the " +
          "condition correctly.",
        reference: "Code Quality — Dead Branch Detection",
        confidence: 0.9,
        provenance: "intent-alignment",
      });
    }
  }

  return findings;
}
