import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeDocumentation(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "DOC";
  let ruleNum = 1;

  // Detect public functions without documentation
  const undocFnLines: number[] = [];
  lines.forEach((line, i) => {
    if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/i.test(line.trim()) || /^(?:export\s+)?(?:public\s+)(?:async\s+)?\w+\s*\(/i.test(line.trim())) {
      const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
      if (!/\/\*\*|\/\/\/|#\s+|"""|'''|:param|@param|@returns|@description/i.test(prevLines)) {
        undocFnLines.push(i + 1);
      }
    }
  });
  if (undocFnLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Exported functions without documentation",
      description: "Public/exported functions lack documentation comments. Consumers cannot understand parameters, return values, or behavior without reading the implementation.",
      lineNumbers: undocFnLines,
      recommendation: "Add JSDoc/TSDoc/docstring comments for all exported functions, describing purpose, parameters, return values, and thrown errors.",
      reference: "TSDoc / JSDoc / Docstring Standards",
    });
  }

  // Detect magic numbers
  const magicNumberLines: number[] = [];
  lines.forEach((line, i) => {
    // Match numeric literals that aren't 0 or 1, not in imports, not in type definitions
    if (/(?<![.\w])(?:[2-9]\d{2,}|\d+\.\d+)(?![.\w])/i.test(line) && !/import|require|const\s+\w+\s*=|type|interface|enum|version|port|0x/i.test(line) && !/\/\/|\/\*|\*/i.test(line)) {
      magicNumberLines.push(i + 1);
    }
  });
  if (magicNumberLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Magic numbers in code",
      description: "Unexplained numeric literals make code harder to understand and maintain.",
      lineNumbers: magicNumberLines.slice(0, 5),
      recommendation: "Extract magic numbers into named constants with descriptive names (e.g., MAX_RETRY_COUNT = 3, TIMEOUT_MS = 5000).",
      reference: "Clean Code: Meaningful Names",
    });
  }

  // Detect TODO/FIXME/HACK comments without issue references
  const todoLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:TODO|FIXME|HACK|XXX|TEMP)\b/i.test(line) && !/#\d+|JIRA|ISSUE|TICKET|AB#/i.test(line)) {
      todoLines.push(i + 1);
    }
  });
  if (todoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "TODO/FIXME without issue tracking reference",
      description: "TODO and FIXME comments without issue tracker references tend to be forgotten and accumulate as technical debt.",
      lineNumbers: todoLines,
      recommendation: "Link TODOs to issue tracker tickets (e.g., TODO(#123): ...). Create tracking issues for existing unlinked TODOs.",
      reference: "Technical Debt Management",
    });
  }

  // Detect complex functions without explanatory comments
  const complexFnLines: number[] = [];
  lines.forEach((line, i) => {
    if (/function\s+\w+|=>\s*\{/.test(line)) {
      let braceCount = 0;
      let fnLength = 0;
      for (let j = i; j < Math.min(lines.length, i + 100); j++) {
        braceCount += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
        fnLength++;
        if (braceCount === 0 && fnLength > 1) break;
      }
      if (fnLength > 40) {
        const fnBody = lines.slice(i, i + fnLength).join("\n");
        const commentCount = (fnBody.match(/\/\/|\/\*|\*\//g) || []).length;
        if (commentCount < 2) {
          complexFnLines.push(i + 1);
        }
      }
    }
  });
  if (complexFnLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Long function with insufficient comments",
      description: "Functions over 40 lines with few or no comments are difficult to understand and maintain.",
      lineNumbers: complexFnLines,
      recommendation: "Add section comments explaining the 'why' behind complex logic. Consider refactoring long functions into smaller, well-named functions.",
      reference: "Clean Code: Functions",
    });
  }

  // Detect missing README or module-level documentation
  if (lines.length > 100) {
    const firstLines = lines.slice(0, 10).join("\n");
    if (!/\/\*\*|\/\/!|#!.*\n#|"""|module|@module|@fileoverview|@file/i.test(firstLines)) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "File missing module-level documentation",
        description: "Large files should have a module-level comment explaining the file's purpose, responsibilities, and key exports.",
        recommendation: "Add a file header comment or @module/@fileoverview docblock explaining the module's purpose and public API.",
        reference: "Code Documentation Standards",
      });
    }
  }

  // Detect missing API endpoint documentation
  const routeLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]/i.test(line)) {
      const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (!/\/\*\*|@swagger|@api|@route|@openapi|@summary|@description/i.test(prevLines)) {
        routeLines.push(i + 1);
      }
    }
  });
  if (routeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "API endpoints without documentation",
      description: "HTTP route handlers lack documentation comments. API consumers need to know request/response schemas, status codes, and auth requirements.",
      lineNumbers: routeLines,
      recommendation: "Add OpenAPI/Swagger annotations or JSDoc comments documenting request body, query params, response schema, and error codes.",
      reference: "OpenAPI Specification / Swagger",
    });
  }

  // Detect missing type documentation for complex types
  const complexTypeLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:interface|type)\s+\w+\s*(?:=\s*)?{/i.test(line.trim())) {
      const typeBody = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
      const propCount = (typeBody.match(/\w+\s*[:?]/g) || []).length;
      const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
      if (propCount > 5 && !/\/\*\*|@description|\/\/\s+\w/i.test(prevLines)) {
        complexTypeLines.push(i + 1);
      }
    }
  });
  if (complexTypeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Complex types without documentation",
      description: "Interfaces/types with many properties lack documentation explaining their purpose and field meanings.",
      lineNumbers: complexTypeLines,
      recommendation: "Add TSDoc/JSDoc comments to interfaces and their properties, especially for shared/exported types.",
      reference: "TypeScript Documentation / TSDoc",
    });
  }

  // Detect missing error message documentation
  const throwLines: number[] = [];
  lines.forEach((line, i) => {
    if (/throw\s+new\s+\w*Error\s*\(\s*["'`]?$/i.test(line.trim()) || /throw\s+new\s+\w*Error\s*\(\s*\)/i.test(line.trim())) {
      throwLines.push(i + 1);
    }
  });
  if (throwLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Exceptions thrown without descriptive messages",
      description: "Errors are thrown without messages, making it impossible to diagnose issues in production from logs alone.",
      lineNumbers: throwLines,
      recommendation: "Always include descriptive error messages: throw new Error('Failed to parse config: missing required field \"name\"').",
      reference: "Error Handling Best Practices",
    });
  }

  // Detect missing changelog/deprecation notices
  const deprecatedLines: number[] = [];
  lines.forEach((line, i) => {
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
      description: "@deprecated annotations should explain what to use instead and when the deprecated API will be removed.",
      lineNumbers: deprecatedLines,
      recommendation: "Add migration path: @deprecated Since v2.0. Use newMethod() instead. Will be removed in v3.0.",
      reference: "API Deprecation Best Practices",
    });
  }

  // Detect missing return type documentation
  const noReturnDocLines: number[] = [];
  lines.forEach((line, i) => {
    if (/^(?:export\s+)?(?:async\s+)?function\s+\w+/i.test(line.trim())) {
      const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (/\/\*\*/i.test(prevLines) && !/@returns|@return/i.test(prevLines)) {
        noReturnDocLines.push(i + 1);
      }
    }
  });
  if (noReturnDocLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "JSDoc present but missing @returns",
      description: "Functions have JSDoc documentation but don't document their return value.",
      lineNumbers: noReturnDocLines,
      recommendation: "Add @returns (or @return) to document what the function returns and when it might return undefined/null.",
      reference: "JSDoc @returns Tag",
    });
  }

  return findings;
}
