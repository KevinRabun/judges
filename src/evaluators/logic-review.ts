import type { Finding } from "../types.js";
import { getLangFamily, isCommentLine } from "./shared.js";

export function analyzeLogicReview(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "LOGIC";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // ── 1. Inverted security conditions ──────────────────────────────────────
  // Detect if (!authenticated) { grantAccess } patterns
  const invertedSecurityPatterns = [
    {
      pattern: /if\s*\(\s*!(?:is)?(?:authenticated|authorized|valid|admin|loggedIn|verified)\s*\)/i,
      context: /(?:grant|allow|proceed|continue|return\s+true|next\(\))/i,
      title: "Possibly inverted security condition",
      description:
        "A negated security check appears to guard an allow/grant path. This may grant access when the user is NOT authenticated.",
    },
    {
      pattern: /if\s*\(\s*(?:err(?:or)?|failure|invalid)\s*(?:===?\s*(?:null|undefined|false))\s*\)/i,
      context: /(?:throw|reject|return\s+(?:null|false)|abort)/i,
      title: "Inverted error check",
      description:
        "Error variable is checked for null/false on a path that throws or rejects. The condition may be inverted.",
    },
  ];

  for (const { pattern, context, title, description } of invertedSecurityPatterns) {
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (!pattern.test(lines[i])) continue;
      // Check next 3 lines for the grant/allow context
      const block = lines.slice(i + 1, i + 4).join(" ");
      if (context.test(block)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title,
          description,
          lineNumbers: [i + 1],
          recommendation:
            "Review the boolean condition. Ensure access is granted only when the user IS authenticated/authorized, not when they are NOT.",
          reference: "CWE-284 Improper Access Control",
          confidence: 0.7,
          provenance: "regex-pattern-match",
        });
        break;
      }
    }
  }

  // ── 2. Off-by-one in loops ───────────────────────────────────────────────
  // Detect common off-by-one patterns: <= length, starting at 1 in 0-indexed
  if (lang === "javascript" || lang === "typescript" || lang === "java" || lang === "csharp") {
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      const line = lines[i];

      // i <= array.length (should be < length)
      if (/\bi\s*<=\s*\w+\.length\b/.test(line) && /\bfor\s*\(/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Off-by-one: loop uses <= array.length",
          description:
            "Loop condition uses `<= .length` which will access one element past the end of the array, causing undefined/out-of-bounds access.",
          lineNumbers: [i + 1],
          recommendation: "Change `<=` to `<` for zero-indexed array iteration.",
          suggestedFix: "Replace `<= array.length` with `< array.length`.",
          reference: "CWE-193 Off-by-one Error",
          confidence: 0.9,
          provenance: "regex-pattern-match",
        });
      }

      // substring(0, length - 0) or similar no-ops
      if (/\.(?:substring|slice)\s*\(\s*0\s*,\s*\w+\.length\s*\)/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "low",
          title: "No-op string/array slice",
          description:
            "Calling `.substring(0, x.length)` or `.slice(0, x.length)` returns the original value unchanged.",
          lineNumbers: [i + 1],
          recommendation: "Remove the redundant slice/substring call, or adjust the bounds.",
          confidence: 0.85,
          provenance: "regex-pattern-match",
        });
      }
    }
  }

  // ── 3. Dead code after return/throw ──────────────────────────────────────
  let inFunction = false;
  let afterTerminal = false;
  let terminalLine = -1;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const line = lines[i].trim();

    // Track brace depth to reset dead-code detection at block boundaries
    for (const ch of line) {
      if (ch === "{") {
        braceDepth++;
        inFunction = true;
      }
      if (ch === "}") {
        braceDepth--;
        afterTerminal = false;
      }
    }

    if (afterTerminal && line.length > 0 && line !== "}" && line !== "});") {
      // Skip common legitimate patterns: case labels, catch blocks, closing patterns
      if (!/^\s*(?:case\s|default:|catch|finally|\}|\/\/|\/\*|\*|else|break)/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Unreachable code after return/throw",
          description: `Code at line ${i + 1} appears unreachable after a return/throw statement at line ${terminalLine + 1}.`,
          lineNumbers: [i + 1],
          recommendation: "Remove unreachable code or restructure the control flow.",
          reference: "Dead Code Detection",
          confidence: 0.7,
          provenance: "control-flow-analysis",
        });
        afterTerminal = false; // Only report once per block
      }
    }

    // Detect terminal statements (but not in ternaries or arrow functions)
    if (inFunction && /^\s*(?:return\b|throw\b)/.test(line) && !line.includes("=>")) {
      afterTerminal = true;
      terminalLine = i;
    }
  }

  // ── 4. Name-body mismatch heuristics ─────────────────────────────────────
  // Detect functions named "validate*" that never throw/return false/return error
  const funcPattern =
    /(?:function\s+|const\s+|let\s+|var\s+)(\w+)\s*(?:=\s*(?:async\s*)?\(|(?:=\s*)?(?:async\s+)?function|\()/;

  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const m = lines[i].match(funcPattern);
    if (!m) continue;
    const fname = m[1];

    // Find the function body (scan next ~30 lines or until matching brace)
    const bodyLines = lines.slice(i + 1, Math.min(i + 40, lines.length));
    const body = bodyLines.join("\n");
    let bodyEnd = 0;
    let depth = 0;
    let started = false;
    for (let j = i; j < Math.min(i + 40, lines.length); j++) {
      for (const ch of lines[j]) {
        if (ch === "{") {
          depth++;
          started = true;
        }
        if (ch === "}") depth--;
        if (started && depth === 0) {
          bodyEnd = j;
          break;
        }
      }
      if (started && depth === 0) break;
    }
    if (bodyEnd === 0) continue;
    const funcBody = lines.slice(i + 1, bodyEnd + 1).join("\n");

    // "validate*" should reject invalid input
    if (/^validate/i.test(fname) && funcBody.length > 50) {
      const hasRejection = /\b(?:throw\b|return\s+false|return\s+null|reject\b|Error\(|Invalid|invalid)/.test(funcBody);
      if (!hasRejection) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: `"${fname}" never rejects invalid input`,
          description: `Function "${fname}" is named as a validator but its body contains no throw, return false, or error construction. It may always return success regardless of input.`,
          lineNumbers: [i + 1],
          recommendation:
            "Ensure validation functions actually reject invalid input by throwing errors or returning false/null.",
          reference: "CWE-20 Improper Input Validation",
          confidence: 0.6,
          provenance: "name-body-analysis",
        });
      }
    }

    // "delete*"/"remove*" should actually delete something
    if (/^(?:delete|remove)/i.test(fname) && funcBody.length > 30) {
      const hasDelete = /\b(?:delete\b|remove\b|splice|pop|shift|destroy|drop|unlink|\.delete|\.remove)/.test(funcBody);
      if (!hasDelete) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: `"${fname}" may not actually delete anything`,
          description: `Function "${fname}" is named for deletion/removal but its body contains no delete, remove, splice, or destroy operations. This is a common AI code generation error.`,
          lineNumbers: [i + 1],
          recommendation: "Verify the function actually performs the deletion its name implies.",
          confidence: 0.55,
          provenance: "name-body-analysis",
        });
      }
    }
  }

  // ── 5. Swapped comparison operands ───────────────────────────────────────
  // Detect password === username or similar swaps
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const line = lines[i];

    // password === username (or vice versa in wrong context)
    if (/\bpassword\s*===?\s*username\b|\busername\s*===?\s*password\b/i.test(line)) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Password compared to username",
        description:
          "Password is directly compared to username, which is almost certainly a logic error. Password should be compared against a stored hash.",
        lineNumbers: [i + 1],
        recommendation:
          "Compare the password against a stored hash using bcrypt.compare() or similar, not against the username.",
        reference: "CWE-287 Improper Authentication",
        confidence: 0.9,
        provenance: "regex-pattern-match",
      });
    }
  }

  // ── 6. Empty catch/except blocks ─────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const line = lines[i].trim();

    // catch (...) { } or except: pass
    if (
      /\bcatch\s*\([^)]*\)\s*\{\s*\}/.test(line) ||
      (lang === "python" &&
        /\bexcept\s*.*:\s*$/.test(line) &&
        i + 1 < lines.length &&
        /^\s*pass\s*$/.test(lines[i + 1]))
    ) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Empty catch/except block silently swallows errors",
        description:
          "An empty catch/except block silently swallows errors, hiding potential bugs and making debugging difficult.",
        lineNumbers: [i + 1],
        recommendation:
          "At minimum, log the error. Consider re-throwing errors you cannot handle, or add a comment explaining why the error is intentionally ignored.",
        reference: "CWE-390 Detection of Error Condition Without Action",
        confidence: 0.85,
        provenance: "regex-pattern-match",
      });
    }
  }

  // ── 7. Redundant boolean comparisons ─────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    const line = lines[i];

    // if (x === true) or if (x === false) or if (x == true)
    if (/\bif\s*\(.*(?:===?\s*true|===?\s*false|!==?\s*true|!==?\s*false)/.test(line)) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Redundant boolean comparison",
        description: "Comparing a boolean value to true/false is redundant. Use the value directly or negate it.",
        lineNumbers: [i + 1],
        recommendation: "Replace `if (x === true)` with `if (x)` and `if (x === false)` with `if (!x)`.",
        confidence: 0.8,
        provenance: "regex-pattern-match",
      });
    }
  }

  return findings;
}
