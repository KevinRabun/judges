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

  return findings;
}
