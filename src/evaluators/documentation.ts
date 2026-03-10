import type { Finding } from "../types.js";
import { getLangLineNumbers, getLangFamily, isCommentLine, isIaCTemplate } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeDocumentation(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "DOC";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect public functions without documentation (multi-language)
  const undocFnLines: number[] = [];
  const fnLines = getLangLineNumbers(code, language, LP.FUNCTION_DEF);
  fnLines.forEach((ln) => {
    const idx = ln - 1;
    const fnLine = lines[idx];

    // Only flag exported/public functions — skip internal/private ones
    const isExported = (() => {
      if (LP.isJsTs(lang)) {
        // JS/TS: must have `export` keyword on the line or on the preceding line
        return /\bexport\b/.test(fnLine) || (idx > 0 && /^\s*export\b/.test(lines[idx - 1]));
      }
      if (lang === "rust") return /\bpub\b/.test(fnLine);
      if (lang === "java" || lang === "csharp") {
        if (!/\bpublic\b/.test(fnLine)) return false;
        // Skip trivial Java getter/setter one-liners (getName, setName, isActive, etc.)
        if (lang === "java" && /public\s+\w+\s+(?:get|set|is)[A-Z]\w*\s*\(/.test(fnLine) && /\{.*\}/.test(fnLine)) {
          return false;
        }
        return true;
      }
      if (lang === "go") {
        // Go: exported functions start with uppercase
        const m = fnLine.match(/func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w*)\s*\(/);
        return !!m;
      }
      if (lang === "python") {
        // Python: skip private/protected (underscore-prefixed) functions
        if (/def\s+_/.test(fnLine)) return false;
        // Skip Pydantic / framework validator methods — internal plumbing, not public API
        for (let k = idx - 1; k >= Math.max(0, idx - 5); k--) {
          const t = lines[k].trim();
          if (t.length === 0) continue;
          if (/^@(?:validator|field_validator|root_validator|property)\b/.test(t)) return false;
          if (/^@/.test(t)) continue; // other decorator — keep walking
          break;
        }
        return true;
      }
      return true; // unknown language — flag all
    })();

    if (!isExported) return;

    // Walk backwards through comment/blank/decorator/attribute lines to find doc comments
    // This handles arbitrarily long JSDoc blocks (e.g., large @returns types)
    let hasDoc = false;
    for (let j = idx - 1; j >= Math.max(0, idx - 60); j--) {
      const trimmed = lines[j].trim();
      if (trimmed.length === 0) continue; // blank line
      if (
        /\/\*\*|\/\/\/|#\s+|"""|'''|:param|@param|@returns|@description|@doc\b|doc\s*=/i.test(trimmed) ||
        (lang === "go" && /^\/\/\s/.test(trimmed)) // Go doc comments use plain // comments
      ) {
        hasDoc = true;
        break;
      }
      if (/^\*/.test(trimmed)) continue; // block comment body
      if (/^@\w/.test(trimmed)) continue; // decorator / annotation (Python, Java)
      if (/^#\[/.test(trimmed)) continue; // Rust attribute (e.g., #[instrument])
      if (/^\[[\w(]/.test(trimmed)) continue; // C# attribute (e.g., [HttpGet], [Authorize])
      break; // non-comment code — stop
    }

    // Python: also check for docstrings inside the function body (first non-blank body line)
    if (!hasDoc && lang === "python") {
      // Walk past multi-line function signatures (parameters spanning
      // several lines) before looking for the body docstring.
      let bodyStart = idx + 1;
      const defLine = lines[idx];
      if (/\(/.test(defLine) && !/\)\s*(?:->.*)?:\s*$/.test(defLine)) {
        // Signature continues on subsequent lines — find the closing `) ... :`
        for (let j = idx + 1; j < Math.min(lines.length, idx + 30); j++) {
          if (/\)\s*(?:->.*)?:\s*$/.test(lines[j])) {
            bodyStart = j + 1;
            break;
          }
        }
      }
      for (let j = bodyStart; j < Math.min(lines.length, bodyStart + 5); j++) {
        const bodyLine = lines[j].trim();
        if (bodyLine.length === 0) continue;
        if (/^"""/.test(bodyLine) || /^'''/.test(bodyLine)) {
          hasDoc = true;
        }
        break; // only check the first non-blank line inside the body
      }
    }

    if (!hasDoc) {
      undocFnLines.push(ln);
    }
  });
  // Only flag when a very large proportion of exported functions lack docs
  // (at least 2 undocumented AND over 90% of total exported functions AND >10 lines)
  // AND at least one function exhibits cryptic naming (very short name or
  // single-letter parameters). Self-documenting code with descriptive multi-word
  // names and well-named parameters does not necessarily need JSDoc/docstrings.
  const totalExportedFns = fnLines.length;
  const hasCrypticNaming = undocFnLines.some((ln) => {
    const fnLine = lines[ln - 1] || "";
    // Very short function name (≤3 chars, e.g. calc, fmt, p, fn)
    const nameMatch = fnLine.match(/(?:function\s+|def\s+|func\s+(?:\([^)]*\)\s+)?)([a-zA-Z_$][\w$]*)\s*[(<]/);
    if (nameMatch && nameMatch[1].length <= 3) return true;
    // ≥2 single-letter parameters (e.g. (a: number, b: string))
    const parenContent = fnLine.match(/\(([^)]*)\)/)?.[1];
    if (parenContent) {
      // Strip type annotations (: Type, : Type[]) to avoid counting generic type params like T
      const cleanedParams = parenContent.replace(/:\s*[^,)]+/g, "");
      const singleLetterParams = cleanedParams.match(/\b[a-zA-Z]\b/g) || [];
      if (singleLetterParams.length >= 2) return true;
    }
    return false;
  });
  if (
    undocFnLines.length >= 4 &&
    totalExportedFns > 0 &&
    undocFnLines.length / totalExportedFns > 0.9 &&
    lines.length > 30 &&
    hasCrypticNaming
  ) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Exported functions without documentation",
      description:
        "Public/exported functions lack documentation comments. Consumers cannot understand parameters, return values, or behavior without reading the implementation.",
      lineNumbers: undocFnLines,
      recommendation:
        "Add documentation comments (JSDoc/TSDoc, docstrings, /// doc comments, Javadoc, GoDoc) for all exported functions, describing purpose, parameters, return values, and thrown errors.",
      reference: "TSDoc / JSDoc / Docstring Standards",
      suggestedFix:
        "Add a `/** ... */` (or language-equivalent) doc comment immediately above each exported function describing its purpose, `@param` tags for every parameter, and a `@returns` tag.",
      confidence: 0.7,
    });
  } else {
    ruleNum++;
  }

  // Detect magic numbers
  const magicNumberLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    // Match numeric literals that aren't 0 or 1, not in imports, not in type definitions
    if (
      /(?<![.\w])(?:[2-9]\d{2,}|\d+\.\d+)(?![.\w])/i.test(line) &&
      !/import|require|const\s+\w+\s*=|type|interface|enum|version|port|0x|assert/i.test(line) &&
      !/\/\/|\/\*|\*/i.test(line)
    ) {
      magicNumberLines.push(i + 1);
    }
  });
  if (magicNumberLines.length >= 20 && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Magic numbers in code",
      description: "Unexplained numeric literals make code harder to understand and maintain.",
      lineNumbers: magicNumberLines.slice(0, 5),
      recommendation:
        "Extract magic numbers into named constants with descriptive names (e.g., MAX_RETRY_COUNT = 3, TIMEOUT_MS = 5000).",
      reference: "Clean Code: Meaningful Names",
      suggestedFix:
        "Replace each numeric literal with a `const` (e.g., `const TIMEOUT_MS = 5000;`) and reference the constant in place of the raw number.",
      confidence: 0.75,
    });
  }

  // Detect TODO/FIXME/HACK comments without issue references
  const todoLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:TODO|FIXME|HACK|XXX|TEMP)\b/i.test(line) && !/#\d+|JIRA|ISSUE|TICKET|AB#/i.test(line)) {
      todoLines.push(i + 1);
    }
  });
  if (todoLines.length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "TODO/FIXME without issue tracking reference",
      description:
        "TODO and FIXME comments without issue tracker references tend to be forgotten and accumulate as technical debt.",
      lineNumbers: todoLines,
      recommendation:
        "Link TODOs to issue tracker tickets (e.g., TODO(#123): ...). Create tracking issues for existing unlinked TODOs.",
      reference: "Technical Debt Management",
      suggestedFix:
        "Append an issue reference to each TODO comment (e.g., `// TODO(#1234): refactor auth flow`) and create a tracking issue if one does not exist.",
      confidence: 0.75,
    });
  }

  // Detect complex functions without explanatory comments (multi-language)
  const complexFnLines: number[] = [];
  const allFnLines = getLangLineNumbers(code, language, LP.FUNCTION_DEF);
  allFnLines.forEach((ln) => {
    const idx = ln - 1;

    // Skip main() / entry-point functions — app setup code is inherently self-documenting
    const fnNameMatch = lines[idx].match(/(?:func|fn|function|def|void|int|async)\s+(\w+)\s*\(/);
    if (fnNameMatch && fnNameMatch[1] === "main") return;

    if (LP.isJsTs(lang) || lang === "rust" || lang === "csharp" || lang === "java" || lang === "go") {
      let braceCount = 0;
      let fnLength = 0;
      for (let j = idx; j < Math.min(lines.length, idx + 100); j++) {
        braceCount += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
        fnLength++;
        if (braceCount === 0 && fnLength > 1) break;
      }
      if (fnLength > 80) {
        const fnBody = lines.slice(idx, idx + fnLength).join("\n");
        const commentCount = (fnBody.match(/\/\/|\/\*|\*\/|#\s|"""|\/{3}/g) || []).length;
        if (commentCount < 2) complexFnLines.push(ln);
      }
    } else if (lang === "python") {
      const indent = (lines[idx].match(/^(\s*)/)?.[1] || "").length;
      let fnLength = 0;
      for (let j = idx + 1; j < Math.min(lines.length, idx + 100); j++) {
        const lineIndent = (lines[j].match(/^(\s*)/)?.[1] || "").length;
        if (lines[j].trim().length > 0 && lineIndent <= indent) break;
        fnLength++;
      }
      if (fnLength > 80) {
        const fnBody = lines.slice(idx, idx + fnLength).join("\n");
        const commentCount = (fnBody.match(/#\s|"""|'''|^\s*#/gm) || []).length;
        if (commentCount < 2) complexFnLines.push(ln);
      }
    }
  });
  if (complexFnLines.length >= 5) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Long function with insufficient comments",
      description: "Functions over 40 lines with few or no comments are difficult to understand and maintain.",
      lineNumbers: complexFnLines,
      recommendation:
        "Add section comments explaining the 'why' behind complex logic. Consider refactoring long functions into smaller, well-named functions.",
      reference: "Clean Code: Functions",
      suggestedFix:
        "Break the function into smaller helper functions with descriptive names, and add inline `//` comments before each logical section explaining its intent.",
      confidence: 0.75,
    });
  }

  // Detect missing README or module-level documentation
  // Skip IaC templates — they use decorators / metadata blocks as module-level docs.
  if (lines.length > 100 && !isIaCTemplate(code)) {
    const firstLines = lines.slice(0, 10).join("\n");
    if (
      !/\/\*\*|\/\*[^*]|\/\/!|#!.*\n#|"""|'''|\bmodule|@module|@fileoverview|@file|@description\s*\(|targetScope|metadata\s+|^\/\/\/|^package\s|^\s*\/\/\s+Package/im.test(
        firstLines,
      )
    ) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "File missing module-level documentation",
        description:
          "Large files should have a module-level comment explaining the file's purpose, responsibilities, and key exports.",
        recommendation:
          "Add a file header comment or @module/@fileoverview docblock explaining the module's purpose and public API.",
        reference: "Code Documentation Standards",
        suggestedFix:
          "Add a `/** @module <name> — <one-line purpose> */` or `/** @fileoverview ... */` block at the top of the file before any imports.",
        confidence: 0.7,
        isAbsenceBased: true,
      });
    }
  }

  // Detect missing API endpoint documentation (multi-language)
  const routeLines: number[] = [];
  const httpRouteLines = getLangLineNumbers(code, language, LP.HTTP_ROUTE);
  httpRouteLines.forEach((ln) => {
    const idx = ln - 1;
    const routeLine = lines[idx].trim();

    // Skip route *wiring* lines — documentation belongs on handler definitions, not registrations.
    // Actix-web: .route("/path", web::get().to(handler))
    // Go: mux.HandleFunc("METHOD /path", handler)
    if (/^\.\s*(?:route|get|post|put|delete|patch|use)\s*\(/i.test(routeLine)) return;
    if (/\.(?:HandleFunc|Handle)\s*\(/i.test(routeLine)) return;

    // Look back up to 15 lines to cover large JSDoc / docstring blocks
    const prevLines = lines.slice(Math.max(0, idx - 15), idx).join("\n");
    if (
      !/\/\*\*|\*\/|\/\/\/|"""|'''|@swagger|@api|@route|@openapi|@summary|@description|#\s+@|@ApiOperation|@Operation|godoc|\/\/\s+\w/i.test(
        prevLines,
      )
    ) {
      routeLines.push(ln);
    }
  });
  // Only flag when most routes lack docs (at least 2 undocumented and >50% of total)
  if (routeLines.length >= 5 && httpRouteLines.length > 0 && routeLines.length / httpRouteLines.length > 0.7) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "API endpoints without documentation",
      description:
        "HTTP route handlers lack documentation comments. API consumers need to know request/response schemas, status codes, and auth requirements.",
      lineNumbers: routeLines,
      recommendation:
        "Add OpenAPI/Swagger annotations or JSDoc comments documenting request body, query params, response schema, and error codes.",
      reference: "OpenAPI Specification / Swagger",
      suggestedFix:
        "Add a JSDoc or OpenAPI decorator above each route handler documenting the HTTP method, path, request/response schema, and possible status codes.",
      confidence: 0.7,
    });
  }

  // Detect missing type documentation for complex types
  const complexTypeLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/(?:interface|type)\s+\w+\s*(?:=\s*)?{/i.test(line.trim())) {
      const typeBody = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
      const propCount = (typeBody.match(/\w+\s*[:?]/g) || []).length;
      const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
      if (propCount > 15 && !/\/\*\*|@description|\/\/\s+\w/i.test(prevLines)) {
        complexTypeLines.push(i + 1);
      }
    }
  });
  if (complexTypeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Complex types without documentation",
      description:
        "Interfaces/types with many properties lack documentation explaining their purpose and field meanings.",
      lineNumbers: complexTypeLines,
      recommendation:
        "Add TSDoc/JSDoc comments to interfaces and their properties, especially for shared/exported types.",
      reference: "TypeScript Documentation / TSDoc",
      suggestedFix:
        "Add a `/** ... */` comment above the interface and add per-property `/** ... */` comments explaining each field's purpose and constraints.",
      confidence: 0.7,
    });
  }

  // Detect missing error message documentation (multi-language)
  const throwLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /throw\s+new\s+\w*Error\s*\(\s*["'`]?$/i.test(line.trim()) ||
      /throw\s+new\s+\w*Error\s*\(\s*\)/i.test(line.trim())
    ) {
      throwLines.push(i + 1);
    }
    if (/raise\s+\w*Error\s*\(\s*\)$/i.test(line.trim())) throwLines.push(i + 1);
    if (/panic!\s*\(\s*\)\s*;?$/i.test(line.trim())) throwLines.push(i + 1);
    if (/throw\s+new\s+\w*Exception\s*\(\s*\)\s*;?$/i.test(line.trim())) throwLines.push(i + 1);
    if (/return\s+fmt\.Errorf\s*\(\s*""\s*\)/i.test(line.trim())) throwLines.push(i + 1);
  });
  if (throwLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Exceptions thrown without descriptive messages",
      description:
        "Errors are thrown without messages, making it impossible to diagnose issues in production from logs alone.",
      lineNumbers: throwLines,
      recommendation:
        "Always include descriptive error messages: throw new Error('Failed to parse config: missing required field \"name\"').",
      reference: "Error Handling Best Practices",
      suggestedFix:
        "Pass a descriptive message string to the Error constructor (e.g., `throw new Error('Failed to connect to DB: connection string missing')`).",
      confidence: 0.85,
    });
  }

  // Detect missing changelog/deprecation notices
  const deprecatedLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/@deprecated/i.test(line)) {
      const nextLines = lines.slice(i, Math.min(lines.length, i + 3)).join("\n");
      if (!/since|use\s+\w+|replaced\s+by|migrate\s+to|version/i.test(nextLines)) {
        deprecatedLines.push(i + 1);
      }
    }
  });
  if (deprecatedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deprecation notice without migration guidance",
      description:
        "@deprecated annotations should explain what to use instead and when the deprecated API will be removed.",
      lineNumbers: deprecatedLines,
      recommendation: "Add migration path: @deprecated Since v2.0. Use newMethod() instead. Will be removed in v3.0.",
      reference: "API Deprecation Best Practices",
      suggestedFix:
        "Expand the `@deprecated` tag to include a version and replacement: `@deprecated Since v2.0. Use `newMethod()` instead. Will be removed in v3.0.`",
      confidence: 0.75,
    });
  }

  // Detect missing return type documentation
  const noReturnDocLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/i.test(line.trim())) {
      const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (/\/\*\*/i.test(prevLines) && !/@returns|@return/i.test(prevLines)) {
        noReturnDocLines.push(i + 1);
      }
    }
  });
  if (noReturnDocLines.length >= 5) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "info",
      title: "JSDoc present but missing @returns",
      description: "Functions have JSDoc documentation but don't document their return value.",
      lineNumbers: noReturnDocLines,
      recommendation:
        "Add @returns (or @return) to document what the function returns and when it might return undefined/null.",
      reference: "JSDoc @returns Tag",
      suggestedFix:
        "Add a `@returns {Type} description` line to the existing JSDoc block describing the return value and any nullable/undefined cases.",
      confidence: 0.7,
    });
  }

  return findings;
}
