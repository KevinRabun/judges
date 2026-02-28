// ─────────────────────────────────────────────────────────────────────────────
// Taint Tracker — Single-file data-flow analysis
// ─────────────────────────────────────────────────────────────────────────────
// Traces user-input sources (req.body, req.params, etc.) through variable
// assignments to dangerous sinks (eval, exec, SQL queries, innerHTML).
// Uses the TypeScript compiler API for JS/TS and lightweight regex for others.
//
// Enhancements over v1:
// - Word-boundary-aware variable matching (prevents "id" matching "isValid")
// - Sanitizer recognition (DOMPurify, encodeURIComponent, parameterized queries, etc.)
// - Same-file inter-procedural taint (function parameter → return tracking)
// - Guard clause sensitivity (validation guards reduce taint confidence)
// ─────────────────────────────────────────────────────────────────────────────

import ts from "typescript";
import { normalizeLanguage } from "../language-patterns.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A confirmed data-flow path from untrusted input to a dangerous sink.
 */
export interface TaintFlow {
  /** Where the untrusted data originates */
  source: {
    line: number;
    expression: string;
    kind: TaintSourceKind;
  };
  /** Where the tainted data is consumed unsafely */
  sink: {
    line: number;
    api: string;
    kind: TaintSinkKind;
  };
  /** Variable assignments connecting source to sink */
  intermediates: Array<{
    line: number;
    variable: string;
  }>;
  /** Confidence score — reduced by guard clauses, boosted by direct flows */
  confidence?: number;
}

export type TaintSourceKind =
  | "http-param" // req.body, req.query, req.params
  | "user-input" // prompt, readline, argv
  | "environment" // process.env (tainted in some contexts)
  | "url-param" // URL search params, path params
  | "external-data"; // fetch response, file read, etc.

export type TaintSinkKind =
  | "code-execution" // eval, Function(), vm.runInContext
  | "command-exec" // exec, spawn, system, popen
  | "sql-query" // query/execute with string concatenation
  | "xss" // innerHTML, document.write
  | "path-traversal" // fs.readFile with user input
  | "redirect" // res.redirect with user input
  | "template" // template rendering with user input
  | "deserialization"; // JSON.parse, deserialize with user input

// ─── Source / Sink Definitions ───────────────────────────────────────────────

const SOURCE_PATTERNS: Array<{ pattern: RegExp; kind: TaintSourceKind }> = [
  { pattern: /\breq(?:uest)?\.(?:body|query|params|headers|cookies)\b/i, kind: "http-param" },
  { pattern: /\brequest\.(?:form|args|json|data|values|files|get)\b/i, kind: "http-param" },
  { pattern: /\b(?:ctx|context)\.(?:query|params|request)\b/i, kind: "http-param" },
  { pattern: /\bgetParameter\s*\(/i, kind: "http-param" },
  { pattern: /\bRequest\.(?:Form|QueryString|Params)\b/i, kind: "http-param" },
  { pattern: /\b(?:process\.argv|sys\.argv|os\.Args|args)\b/i, kind: "user-input" },
  { pattern: /\b(?:prompt|readline|input)\s*\(/i, kind: "user-input" },
  { pattern: /\bsearchParams\.get\s*\(/i, kind: "url-param" },
  { pattern: /\.(?:useSearchParams|useParams)\b/i, kind: "url-param" },
];

const SINK_PATTERNS: Array<{ pattern: RegExp; kind: TaintSinkKind }> = [
  { pattern: /\beval\s*\(/i, kind: "code-execution" },
  { pattern: /\bnew\s+Function\s*\(/i, kind: "code-execution" },
  { pattern: /\bvm\.run(?:InContext|InNewContext|InThisContext)?\s*\(/i, kind: "code-execution" },
  {
    pattern:
      /\b(?:exec|execSync|system|popen|subprocess\.(?:Popen|run|call)|os\.system|Runtime\.getRuntime\(\)\.exec)\s*\(/i,
    kind: "command-exec",
  },
  { pattern: /\b(?:spawn|spawnSync)\s*\(/i, kind: "command-exec" },
  {
    pattern: /\.(?:query|execute|exec|prepare)\s*\(\s*[`"']?\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i,
    kind: "sql-query",
  },
  { pattern: /\.(?:query|execute|exec)\s*\(/i, kind: "sql-query" },
  { pattern: /\.innerHTML\s*=/i, kind: "xss" },
  { pattern: /\bdocument\.write\s*\(/i, kind: "xss" },
  { pattern: /\bdangerouslySetInnerHTML/i, kind: "xss" },
  { pattern: /\b(?:readFile|readFileSync|open)\s*\(/i, kind: "path-traversal" },
  { pattern: /\.redirect\s*\(/i, kind: "redirect" },
  { pattern: /\b(?:render_template_string|nunjucks\.renderString|Handlebars\.compile)\s*\(/i, kind: "template" },
  { pattern: /\bJSON\.parse\s*\(/i, kind: "deserialization" },
];

// ─── Sanitizer Recognition ──────────────────────────────────────────────────

/** Known sanitizer/escaping functions that neutralize taint */
const SANITIZER_PATTERNS: RegExp[] = [
  // DOM / HTML sanitizers
  /\bDOMPurify\.sanitize\s*\(/i,
  /\bsanitizeHtml\s*\(/i,
  /\bxss\s*\(/i,
  /\bescapeHtml\s*\(/i,
  /\bescape\s*\(/i,
  // URL / encoding sanitizers
  /\bencodeURIComponent\s*\(/i,
  /\bencodeURI\s*\(/i,
  /\burlEncode\s*\(/i,
  /\bquote\s*\(/i,
  // Input validation libraries
  /\bvalidator\.\w+\s*\(/i,
  /\b(?:joi|yup|zod|ajv)\b.*\.(?:validate|parse|safeParse)\s*\(/i,
  // Parameterized query markers (taint is neutralized)
  /\$\d+/, // PostgreSQL $1, $2, ...
  /\?\s*(?:,|\))/, // MySQL ? placeholders
  /:(?:param|value|id|name)\b/i, // Named parameters
  // Path sanitization
  /\bpath\.(?:normalize|resolve|basename)\s*\(/i,
  // Python/Java/C# sanitizers
  /\bbleach\.clean\s*\(/i,
  /\bmarkup_safe\b/i,
  /\bOWASP\.Encoder\b/i,
  /\bAntiXss\.\w+\s*\(/i,
  /\bHtmlEncoder\.Default\.Encode\s*\(/i,
  /\bPreparedStatement\b/i,
  /\b(?:html|url)\.EscapeString\s*\(/i,
];

/** Check if a code expression passes through a known sanitizer */
function isSanitized(expression: string): boolean {
  return SANITIZER_PATTERNS.some((p) => p.test(expression));
}

// ─── Guard Clause Detection ─────────────────────────────────────────────────

/** Patterns that indicate validation/guard clauses for a variable */
const GUARD_PATTERNS: RegExp[] = [
  // Type checks
  /typeof\s+\w+\s*(?:!==?|===?)\s*['"](?:string|number|boolean|object|undefined)['"]/i,
  // Truthiness / nullish checks followed by return/throw
  /if\s*\(\s*!?\s*\w+\s*\)\s*(?:return|throw|res\.status\(4\d\d\))/i,
  // Validation function calls
  /if\s*\(\s*!?\s*(?:isValid|validate|check|verify|sanitize|assert)\w*\s*\(/i,
  // Length/range checks
  /if\s*\(\s*\w+\.length\s*(?:[<>=!]+)/i,
  /if\s*\(\s*\w+\s*(?:<|>|<=|>=)\s*\d+/i,
  // Regex test guards
  /if\s*\(\s*!?\s*\/[^/]+\/\.test\s*\(\s*\w+\s*\)/i,
  // Express-validator / joi validation result check
  /validationResult|\.isValid\(\)|\.error\b/i,
];

/**
 * Detect if a tainted variable has guard clauses between its source and a
 * given sink line. Returns a confidence reduction (0.0 = no guards, up to
 * -0.25 for strong validation).
 */
function detectGuardClauses(varName: string, sourceLine: number, sinkLine: number, codeLines: string[]): number {
  const start = Math.min(sourceLine, sinkLine) - 1;
  const end = Math.max(sourceLine, sinkLine);
  let guardCount = 0;

  for (let i = start; i < end && i < codeLines.length; i++) {
    const line = codeLines[i];
    // Check if the line references our variable in a guard pattern
    if (!containsWordBoundary(line, varName)) continue;
    for (const guard of GUARD_PATTERNS) {
      if (guard.test(line)) {
        guardCount++;
        break;
      }
    }
  }

  // Each guard clause reduces confidence slightly (max -0.25)
  return Math.min(guardCount * 0.1, 0.25);
}

// ─── Word-Boundary Matching ─────────────────────────────────────────────────

/**
 * Check if `text` contains `varName` as a whole word (not a substring of
 * another identifier). Prevents "id" from matching "isValid", "width", etc.
 */
function containsWordBoundary(text: string, varName: string): boolean {
  // Escape regex special chars in varName
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use word boundary for alphanumeric names; for dotted names (req.body.name)
  // use context-aware boundaries
  const pattern = /^\w+$/.test(varName) ? new RegExp(`\\b${escaped}\\b`) : new RegExp(`(?<![\\w.])${escaped}(?![\\w])`);
  return pattern.test(text);
}

// ─── Inter-procedural Taint (Same-File) ──────────────────────────────────────

interface FunctionTaintInfo {
  /** Parameter indices that reach a return statement */
  taintedParams: Set<number>;
  /** Parameter names */
  paramNames: string[];
  /** Function name */
  name: string;
}

/**
 * Build a map of function name → taint propagation info.
 * Tracks which function parameters flow to return values.
 */
function buildFunctionTaintMap(
  sourceFile: ts.SourceFile,
  taintMap: Map<string, TaintEntry>,
): Map<string, FunctionTaintInfo> {
  const result = new Map<string, FunctionTaintInfo>();

  ts.forEachChild(sourceFile, function walk(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const name = getFnName(node);
      if (!name) {
        ts.forEachChild(node, walk);
        return;
      }

      const paramNames = node.parameters.map((p) => p.name.getText(sourceFile));
      const paramSet = new Set(paramNames);
      const taintedParams = new Set<number>();

      // Walk the function body to find return statements referencing params
      function walkBody(n: ts.Node): void {
        if (ts.isReturnStatement(n) && n.expression) {
          const retText = n.expression.getText(sourceFile);
          for (let i = 0; i < paramNames.length; i++) {
            if (containsWordBoundary(retText, paramNames[i])) {
              taintedParams.add(i);
            }
          }
        }
        // Also track simple assignments from params that reach returns
        if (ts.isVariableDeclaration(n) && n.initializer) {
          const varName = n.name.getText(sourceFile);
          const initText = n.initializer.getText(sourceFile);
          for (const pName of paramSet) {
            if (containsWordBoundary(initText, pName)) {
              paramSet.add(varName);
            }
          }
        }
        ts.forEachChild(n, walkBody);
      }

      if (node.body) {
        ts.forEachChild(node.body, walkBody);
      }

      if (taintedParams.size > 0) {
        result.set(name, { taintedParams, paramNames, name });
      }
    }
    ts.forEachChild(node, walk);
  });

  return result;
}

function getFnName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name?.getText();
  }
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) {
    const decl = node.parent;
    if (ts.isIdentifier(decl.name)) return decl.name.text;
  }
  return undefined;
}

// ─── Taint Entry Type ────────────────────────────────────────────────────────

interface TaintEntry {
  sourceExpr: string;
  sourceKind: TaintSourceKind;
  sourceLine: number;
  assignmentChain: Array<{ line: number; variable: string }>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze a source file for taint flows: paths from untrusted input to
 * dangerous sinks through variable assignments and string concatenation.
 *
 * For JS/TS, uses the TypeScript compiler AST for precise variable tracking.
 * For other languages, falls back to regex-based lightweight analysis.
 */
export function analyzeTaintFlows(code: string, language: string): TaintFlow[] {
  const lang = normalizeLanguage(language);

  switch (lang) {
    case "javascript":
    case "typescript":
      return analyzeTypeScriptTaint(code, lang);
    default:
      return analyzeRegexTaint(code);
  }
}

// ─── TypeScript / JavaScript Taint Analysis ──────────────────────────────────

function analyzeTypeScriptTaint(code: string, language: "javascript" | "typescript"): TaintFlow[] {
  const scriptKind = language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    "input." + (language === "typescript" ? "ts" : "js"),
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const flows: TaintFlow[] = [];
  const taintMap = new Map<string, TaintEntry>();
  const codeLines = code.split("\n");

  // Pass 1: Find tainted variable declarations/assignments
  ts.forEachChild(sourceFile, function walk(node) {
    // Variable declarations: const x = req.body.name
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const varName = node.name.getText(sourceFile);
      const initText = node.initializer.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      // Skip if the initializer goes through a sanitizer
      if (isSanitized(initText)) {
        ts.forEachChild(node, walk);
        return;
      }

      // Check if initializer is a source
      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(initText)) {
          taintMap.set(varName, {
            sourceExpr: initText,
            sourceKind: src.kind,
            sourceLine: line,
            assignmentChain: [{ line, variable: varName }],
          });
          break;
        }
      }

      // Check if initializer references a tainted variable (propagation)
      // Uses word-boundary matching to prevent "id" matching "isValid"
      if (!taintMap.has(varName)) {
        for (const [taintedVar, taintInfo] of taintMap) {
          if (containsWordBoundary(initText, taintedVar)) {
            taintMap.set(varName, {
              ...taintInfo,
              assignmentChain: [...taintInfo.assignmentChain, { line, variable: varName }],
            });
            break;
          }
        }
      }
    }

    // Assignment expressions: x = req.body.name
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const leftText = node.left.getText(sourceFile);
      const rightText = node.right.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      // Skip sanitized assignments
      if (isSanitized(rightText)) {
        ts.forEachChild(node, walk);
        return;
      }

      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(rightText)) {
          taintMap.set(leftText, {
            sourceExpr: rightText,
            sourceKind: src.kind,
            sourceLine: line,
            assignmentChain: [{ line, variable: leftText }],
          });
          break;
        }
      }

      if (!taintMap.has(leftText)) {
        for (const [taintedVar, taintInfo] of taintMap) {
          if (containsWordBoundary(rightText, taintedVar)) {
            taintMap.set(leftText, {
              ...taintInfo,
              assignmentChain: [...taintInfo.assignmentChain, { line, variable: leftText }],
            });
            break;
          }
        }
      }
    }

    // Destructuring: const { name } = req.body
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const initText = node.initializer.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(initText)) {
          for (const element of node.name.elements) {
            const propName = element.name.getText(sourceFile);
            taintMap.set(propName, {
              sourceExpr: `${initText}.${propName}`,
              sourceKind: src.kind,
              sourceLine: line,
              assignmentChain: [{ line, variable: propName }],
            });
          }
          break;
        }
      }
    }

    ts.forEachChild(node, walk);
  });

  // Pass 1.5: Inter-procedural — propagate taint through same-file function calls
  const fnTaintMap = buildFunctionTaintMap(sourceFile, taintMap);
  ts.forEachChild(sourceFile, function walkCalls(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      const fnName = call.expression.getText(sourceFile);
      const fnInfo = fnTaintMap.get(fnName);
      if (fnInfo) {
        const varName = node.name.getText(sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        // Check if any tainted variable is passed as an argument at a tainted param index
        for (const paramIdx of fnInfo.taintedParams) {
          if (paramIdx < call.arguments.length) {
            const argText = call.arguments[paramIdx].getText(sourceFile);
            for (const [taintedVar, taintInfo] of taintMap) {
              if (containsWordBoundary(argText, taintedVar)) {
                taintMap.set(varName, {
                  ...taintInfo,
                  assignmentChain: [...taintInfo.assignmentChain, { line, variable: `${fnName}(…) → ${varName}` }],
                });
                break;
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, walkCalls);
  });

  // Pass 2: Check each line for sinks that use tainted variables
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    const lineNum = i + 1;

    // Skip lines that go through a sanitizer
    if (isSanitized(line)) continue;

    for (const sink of SINK_PATTERNS) {
      if (!sink.pattern.test(line)) continue;

      // Check if any tainted variable appears on this line (word-boundary match)
      for (const [varName, taintInfo] of taintMap) {
        if (containsWordBoundary(line, varName)) {
          // Avoid self-referential flows (source IS the sink line)
          if (lineNum === taintInfo.sourceLine) continue;

          // Detect guard clauses between source and sink
          const guardReduction = detectGuardClauses(varName, taintInfo.sourceLine, lineNum, codeLines);

          flows.push({
            source: {
              line: taintInfo.sourceLine,
              expression: taintInfo.sourceExpr,
              kind: taintInfo.sourceKind,
            },
            sink: {
              line: lineNum,
              api: sink.pattern.source.slice(0, 40),
              kind: sink.kind,
            },
            intermediates: taintInfo.assignmentChain.filter(
              (a) => a.line !== taintInfo.sourceLine && a.line !== lineNum,
            ),
            confidence: Math.max(0.1, 1.0 - guardReduction),
          });
          break; // One flow per sink line
        }
      }
    }

    // Also check for inline source→sink (no variable): eval(req.body.code)
    for (const sink of SINK_PATTERNS) {
      if (!sink.pattern.test(line)) continue;
      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(line)) {
          // Only report if not already captured via variable tracking
          const alreadyCaptured = flows.some((f) => f.sink.line === lineNum);
          if (!alreadyCaptured) {
            const srcMatch = line.match(src.pattern);
            flows.push({
              source: {
                line: lineNum,
                expression: srcMatch?.[0] ?? "user input",
                kind: src.kind,
              },
              sink: {
                line: lineNum,
                api: sink.pattern.source.slice(0, 40),
                kind: sink.kind,
              },
              intermediates: [],
              confidence: 1.0,
            });
          }
          break;
        }
      }
    }
  }

  return deduplicateFlows(flows);
}

// ─── Regex-based Taint Analysis (non-JS/TS languages) ────────────────────────

function analyzeRegexTaint(code: string): TaintFlow[] {
  const codeLines = code.split("\n");
  const flows: TaintFlow[] = [];

  // Track tainted variable names
  const tainted = new Map<string, { sourceExpr: string; sourceKind: TaintSourceKind; sourceLine: number }>();

  // Assignment pattern: variable = source_expression
  const assignPattern = /^\s*(?:(?:let|const|var|val|auto)\s+)?(\w+)\s*[:=]\s*(.+)/;

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    const lineNum = i + 1;

    // Check for source assignments
    const assignMatch = line.match(assignPattern);
    if (assignMatch) {
      const [, varName, rhs] = assignMatch;

      // Skip sanitized assignments
      if (isSanitized(rhs)) continue;

      // Direct source
      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(rhs)) {
          tainted.set(varName, {
            sourceExpr: rhs.trim(),
            sourceKind: src.kind,
            sourceLine: lineNum,
          });
          break;
        }
      }

      // Propagation from tainted variable (word-boundary aware)
      if (!tainted.has(varName)) {
        for (const [taintedVar, info] of tainted) {
          if (containsWordBoundary(rhs, taintedVar)) {
            tainted.set(varName, info);
            break;
          }
        }
      }
    }

    // Skip lines with sanitizers for sink checking
    if (isSanitized(line)) continue;

    // Check for sinks using tainted data
    for (const sink of SINK_PATTERNS) {
      if (!sink.pattern.test(line)) continue;

      // Check tainted variables (word-boundary aware)
      for (const [varName, info] of tainted) {
        if (containsWordBoundary(line, varName) && lineNum !== info.sourceLine) {
          const guardReduction = detectGuardClauses(varName, info.sourceLine, lineNum, codeLines);
          flows.push({
            source: {
              line: info.sourceLine,
              expression: info.sourceExpr,
              kind: info.sourceKind,
            },
            sink: { line: lineNum, api: sink.pattern.source.slice(0, 40), kind: sink.kind },
            intermediates: [],
            confidence: Math.max(0.1, 1.0 - guardReduction),
          });
          break;
        }
      }

      // Inline source→sink
      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(line)) {
          const alreadyCaptured = flows.some((f) => f.sink.line === lineNum);
          if (!alreadyCaptured) {
            const srcMatch = line.match(src.pattern);
            flows.push({
              source: {
                line: lineNum,
                expression: srcMatch?.[0] ?? "user input",
                kind: src.kind,
              },
              sink: { line: lineNum, api: sink.pattern.source.slice(0, 40), kind: sink.kind },
              intermediates: [],
              confidence: 1.0,
            });
          }
          break;
        }
      }
    }
  }

  return deduplicateFlows(flows);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deduplicateFlows(flows: TaintFlow[]): TaintFlow[] {
  const seen = new Set<string>();
  return flows.filter((f) => {
    const key = `${f.source.line}:${f.sink.line}:${f.sink.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
