// ─────────────────────────────────────────────────────────────────────────────
// Cross-File Taint Tracker — Multi-module data-flow analysis
// ─────────────────────────────────────────────────────────────────────────────
// Extends the single-file taint tracker to propagate taint across module
// boundaries. When a tainted variable is exported from file A and imported
// by file B, the taint propagates to wherever file B uses that import.
//
// Architecture:
// 1. Run single-file taint analysis on every file to find sources & tainted vars
// 2. Build an export map: file → { exportedName → taint info }
// 3. Resolve imports: for each import, check if the exported binding is tainted
// 4. Run a second pass on importing files with injected cross-file taint seeds
// 5. Emit CrossFileTaintFlow findings with full file-to-file provenance
// ─────────────────────────────────────────────────────────────────────────────

import { analyzeTaintFlows, type TaintFlow, type TaintSourceKind, type TaintSinkKind } from "./taint-tracker.js";
import { normalizeLanguage } from "../language-patterns.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A cross-file taint flow: tainted data originates in one file and reaches
 * a dangerous sink in a different file via an import/export boundary.
 */
export interface CrossFileTaintFlow {
  /** File where the untrusted data originates */
  sourceFile: string;
  /** File where the tainted data reaches a dangerous sink */
  sinkFile: string;
  /** The original taint source (e.g., req.body) */
  source: {
    line: number;
    expression: string;
    kind: TaintSourceKind;
  };
  /** The dangerous sink in the consuming file */
  sink: {
    line: number;
    api: string;
    kind: TaintSinkKind;
  };
  /** The exported name that carries taint across the boundary */
  exportedBinding: string;
  /** The imported name in the consuming file */
  importedAs: string;
  /** Confidence score (reduced for indirect flows) */
  confidence: number;
}

/** Information about a tainted export from a file */
interface TaintedExport {
  /** The exported name */
  exportedName: string;
  /** Whether it's a function that returns tainted data, or a tainted variable */
  kind: "tainted-variable" | "tainted-return" | "tainted-param-passthrough";
  /** The taint source info */
  sourceKind: TaintSourceKind;
  sourceExpression: string;
  sourceLine: number;
  /** For tainted-param-passthrough: which parameter indices carry taint through */
  taintedParamIndices?: number[];
}

/** Parsed import information */
interface ImportBinding {
  /** The module specifier (e.g., "./userService") */
  moduleSpecifier: string;
  /** The imported name (or "default" for default imports) */
  importedName: string;
  /** The local alias (if renamed via `as`) */
  localName: string;
  /** Line number of the import statement */
  line: number;
}

// ─── Source / Sink pattern references (same as taint-tracker.ts) ─────────────

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
  { pattern: /\b(?:exec|execSync|system|popen|subprocess\.(?:Popen|run|call)|os\.system)\s*\(/i, kind: "command-exec" },
  { pattern: /\b(?:spawn|spawnSync)\s*\(/i, kind: "command-exec" },
  { pattern: /\.(?:query|execute|exec)\s*\(/i, kind: "sql-query" },
  { pattern: /\.innerHTML\s*=/i, kind: "xss" },
  { pattern: /\bdocument\.write\s*\(/i, kind: "xss" },
  { pattern: /\bdangerouslySetInnerHTML/i, kind: "xss" },
  { pattern: /\b(?:readFile|readFileSync|open)\s*\(/i, kind: "path-traversal" },
  { pattern: /\.redirect\s*\(/i, kind: "redirect" },
  { pattern: /\b(?:render_template_string|nunjucks\.renderString|Handlebars\.compile)\s*\(/i, kind: "template" },
];

const SANITIZER_PATTERNS: RegExp[] = [
  /\bDOMPurify\.sanitize\s*\(/i,
  /\bsanitizeHtml\s*\(/i,
  /\bescapeHtml\s*\(/i,
  /\bencodeURIComponent\s*\(/i,
  /\bvalidator\.\w+\s*\(/i,
  /\b(?:joi|yup|zod|ajv)\b.*\.(?:validate|parse|safeParse)\s*\(/i,
  /\$\d+/,
  /\?\s*(?:,|\))/,
  /\bpath\.(?:normalize|resolve|basename)\s*\(/i,
  /\bPreparedStatement\b/i,
];

function isSanitized(expression: string): boolean {
  return SANITIZER_PATTERNS.some((p) => p.test(expression));
}

// ─── Export Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze a file's exports to find which exported bindings carry taint.
 * Detects:
 * - Exported variables assigned from taint sources
 * - Exported functions that return tainted data
 * - Exported functions that pass tainted parameters through to dangerous sinks
 */
function analyzeTaintedExports(code: string, filePath: string): TaintedExport[] {
  const lines = code.split("\n");
  const exports: TaintedExport[] = [];

  // Track tainted variables within the file
  const taintedVars = new Map<string, { sourceKind: TaintSourceKind; sourceExpr: string; sourceLine: number }>();

  // Pass 1: Find tainted variable assignments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Variable assignment: const x = req.body.foo
    const assignMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+)/);
    if (assignMatch) {
      const [, varName, rhs] = assignMatch;
      if (isSanitized(rhs)) continue;

      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(rhs)) {
          taintedVars.set(varName, { sourceKind: src.kind, sourceExpr: rhs.trim(), sourceLine: lineNum });
          break;
        }
      }

      // Propagation from tainted variable
      if (!taintedVars.has(varName)) {
        for (const [tv, info] of taintedVars) {
          if (new RegExp(`\\b${tv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(rhs)) {
            taintedVars.set(varName, info);
            break;
          }
        }
      }
    }
  }

  // Pass 2: Find exported tainted bindings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Direct export of tainted variable: export const x = req.body...
    const directExportMatch = line.match(/export\s+(?:const|let|var)\s+(\w+)\s*=\s*(.+)/);
    if (directExportMatch) {
      const [, name, rhs] = directExportMatch;
      for (const src of SOURCE_PATTERNS) {
        if (src.pattern.test(rhs)) {
          exports.push({
            exportedName: name,
            kind: "tainted-variable",
            sourceKind: src.kind,
            sourceExpression: rhs.trim(),
            sourceLine: lineNum,
          });
          break;
        }
      }
    }

    // Named export of already-tainted variable: export { x }
    const namedExportMatch = line.match(/export\s*\{([^}]+)\}/);
    if (namedExportMatch) {
      const names = namedExportMatch[1].split(",").map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return { local: parts[0].trim(), exported: (parts[1] ?? parts[0]).trim() };
      });
      for (const { local, exported } of names) {
        if (taintedVars.has(local)) {
          const info = taintedVars.get(local)!;
          exports.push({
            exportedName: exported,
            kind: "tainted-variable",
            sourceKind: info.sourceKind,
            sourceExpression: info.sourceExpr,
            sourceLine: info.sourceLine,
          });
        }
      }
    }

    // Exported function that takes params and passes them to sinks
    // export function processInput(userInput: string) { exec(userInput); }
    const exportFnMatch = line.match(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
    if (exportFnMatch) {
      const [, fnName, params] = exportFnMatch;
      const paramNames = params
        .split(",")
        .map((p) =>
          p
            .trim()
            .split(/[:\s=]/)[0]
            .trim(),
        )
        .filter(Boolean);

      // Look ahead in the function body for sinks using these params
      const bodyStart = i;
      let braceDepth = 0;
      let foundOpen = false;

      for (let j = i; j < Math.min(i + 100, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            braceDepth++;
            foundOpen = true;
          }
          if (ch === "}") {
            braceDepth--;
          }
        }
        if (foundOpen && braceDepth <= 0) {
          // Scan body for param → sink flows
          const body = lines.slice(bodyStart, j + 1).join("\n");
          const taintedIndices: number[] = [];

          for (let pi = 0; pi < paramNames.length; pi++) {
            const pName = paramNames[pi];
            if (!pName) continue;
            const pEsc = pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pRe = new RegExp(`\\b${pEsc}\\b`);

            for (const sink of SINK_PATTERNS) {
              // Check each line of the body for a sink that uses this param
              for (let bi = bodyStart; bi <= j && bi < lines.length; bi++) {
                if (sink.pattern.test(lines[bi]) && pRe.test(lines[bi]) && !isSanitized(lines[bi])) {
                  taintedIndices.push(pi);
                  break;
                }
              }
            }
          }

          if (taintedIndices.length > 0) {
            exports.push({
              exportedName: fnName,
              kind: "tainted-param-passthrough",
              sourceKind: "external-data",
              sourceExpression: `parameter(s) of ${fnName}()`,
              sourceLine: lineNum,
              taintedParamIndices: taintedIndices,
            });
          }

          // Also check if the function returns tainted data
          if (/\breturn\b/.test(body)) {
            let foundReturn = false;
            // Check if return statement directly contains a taint source
            for (const src of SOURCE_PATTERNS) {
              const returnSourceMatch = body.match(new RegExp(`return\\s+(.*${src.pattern.source}.*)`, "im"));
              if (returnSourceMatch) {
                exports.push({
                  exportedName: fnName,
                  kind: "tainted-return",
                  sourceKind: src.kind,
                  sourceExpression: returnSourceMatch[1].trim().replace(/;\s*$/, ""),
                  sourceLine: lineNum,
                });
                foundReturn = true;
                break;
              }
            }
            if (!foundReturn) {
              for (const [tv, info] of taintedVars) {
                const tvEsc = tv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                if (new RegExp(`return\\s+.*\\b${tvEsc}\\b`).test(body)) {
                  exports.push({
                    exportedName: fnName,
                    kind: "tainted-return",
                    sourceKind: info.sourceKind,
                    sourceExpression: info.sourceExpr,
                    sourceLine: info.sourceLine,
                  });
                  break;
                }
              }
            }
          }
          break;
        }
      }
    }

    // export default function — same as above but with "default" as export name
    const defaultFnMatch = line.match(/export\s+default\s+(?:async\s+)?function\s*(\w*)\s*\(([^)]*)\)/);
    if (defaultFnMatch) {
      const [, fnName, params] = defaultFnMatch;
      const paramNames = params
        .split(",")
        .map((p) =>
          p
            .trim()
            .split(/[:\s=]/)[0]
            .trim(),
        )
        .filter(Boolean);
      const bodyStart = i;
      let braceDepth = 0;
      let foundOpen = false;

      for (let j = i; j < Math.min(i + 100, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            braceDepth++;
            foundOpen = true;
          }
          if (ch === "}") {
            braceDepth--;
          }
        }
        if (foundOpen && braceDepth <= 0) {
          const body = lines.slice(bodyStart, j + 1).join("\n");
          const taintedIndices: number[] = [];

          for (let pi = 0; pi < paramNames.length; pi++) {
            const pName = paramNames[pi];
            if (!pName) continue;
            const pEsc = pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pRe = new RegExp(`\\b${pEsc}\\b`);

            for (const sink of SINK_PATTERNS) {
              for (let bi = bodyStart; bi <= j && bi < lines.length; bi++) {
                if (sink.pattern.test(lines[bi]) && pRe.test(lines[bi]) && !isSanitized(lines[bi])) {
                  taintedIndices.push(pi);
                  break;
                }
              }
            }
          }

          if (taintedIndices.length > 0) {
            exports.push({
              exportedName: fnName || "default",
              kind: "tainted-param-passthrough",
              sourceKind: "external-data",
              sourceExpression: `parameter(s) of ${fnName || "default"}()`,
              sourceLine: lineNum,
              taintedParamIndices: taintedIndices,
            });
          }
          break;
        }
      }
    }

    // CommonJS: module.exports = function(...)  or  module.exports = { ... }
    const cjsExportFnMatch = line.match(/module\.exports\s*=\s*(?:async\s+)?function\s*(\w*)\s*\(([^)]*)\)/);
    if (cjsExportFnMatch) {
      const [, fnName, params] = cjsExportFnMatch;
      const paramNames = params
        .split(",")
        .map((p) =>
          p
            .trim()
            .split(/[:\s=]/)[0]
            .trim(),
        )
        .filter(Boolean);
      const bodyStart = i;
      let braceDepth = 0;
      let foundOpen = false;

      for (let j = i; j < Math.min(i + 100, lines.length); j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            braceDepth++;
            foundOpen = true;
          }
          if (ch === "}") {
            braceDepth--;
          }
        }
        if (foundOpen && braceDepth <= 0) {
          const body = lines.slice(bodyStart, j + 1).join("\n");
          const taintedIndices: number[] = [];

          for (let pi = 0; pi < paramNames.length; pi++) {
            const pName = paramNames[pi];
            if (!pName) continue;
            const pEsc = pName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pRe = new RegExp(`\\b${pEsc}\\b`);

            for (const sink of SINK_PATTERNS) {
              for (let bi = bodyStart; bi <= j && bi < lines.length; bi++) {
                if (sink.pattern.test(lines[bi]) && pRe.test(lines[bi]) && !isSanitized(lines[bi])) {
                  taintedIndices.push(pi);
                  break;
                }
              }
            }
          }

          if (taintedIndices.length > 0) {
            exports.push({
              exportedName: "default",
              kind: "tainted-param-passthrough",
              sourceKind: "external-data",
              sourceExpression: `parameter(s) of ${fnName || "default"}()`,
              sourceLine: lineNum,
              taintedParamIndices: taintedIndices,
            });
          }

          // Check if return directly contains a source
          if (/\breturn\b/.test(body)) {
            for (const src of SOURCE_PATTERNS) {
              const returnSourceMatch = body.match(new RegExp(`return\\s+(.*${src.pattern.source}.*)`, "im"));
              if (returnSourceMatch) {
                exports.push({
                  exportedName: "default",
                  kind: "tainted-return",
                  sourceKind: src.kind,
                  sourceExpression: returnSourceMatch[1].trim().replace(/;\s*$/, ""),
                  sourceLine: lineNum,
                });
                break;
              }
            }
          }
          break;
        }
      }
    }
  }

  return exports;
}

// ─── Import Parsing ──────────────────────────────────────────────────────────

/**
 * Parse import statements from a source file. Supports:
 * - import { foo } from "./module"
 * - import { foo as bar } from "./module"
 * - import defaultExport from "./module"
 * - const { foo } = require("./module")
 * - const foo = require("./module")
 * - import * as ns from "./module"
 */
function parseImports(code: string): ImportBinding[] {
  const lines = code.split("\n");
  const imports: ImportBinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip abnormally long lines to prevent polynomial-time regex matching
    if (line.length > 500) continue;
    const lineNum = i + 1;

    // ES named imports: import { foo, bar as baz } from "./module"
    const namedImportMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
    if (namedImportMatch) {
      const [, names, moduleSpec] = namedImportMatch;
      if (!isRelativeImport(moduleSpec)) continue;
      for (const name of names.split(",")) {
        const parts = name.trim().split(/\s+as\s+/);
        imports.push({
          moduleSpecifier: moduleSpec,
          importedName: parts[0].trim(),
          localName: (parts[1] ?? parts[0]).trim(),
          line: lineNum,
        });
      }
      continue;
    }

    // ES default import: import foo from "./module"
    const defaultImportMatch = line.match(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
    if (defaultImportMatch) {
      const [, name, moduleSpec] = defaultImportMatch;
      if (!isRelativeImport(moduleSpec)) continue;
      // Skip if it looks like import { which was already handled
      if (name === "type") continue;
      imports.push({
        moduleSpecifier: moduleSpec,
        importedName: "default",
        localName: name,
        line: lineNum,
      });
      continue;
    }

    // Namespace import: import * as ns from "./module"
    const nsImportMatch = line.match(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/);
    if (nsImportMatch) {
      const [, name, moduleSpec] = nsImportMatch;
      if (!isRelativeImport(moduleSpec)) continue;
      imports.push({
        moduleSpecifier: moduleSpec,
        importedName: "*",
        localName: name,
        line: lineNum,
      });
      continue;
    }

    // CommonJS: const foo = require("./module")
    const requireMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      const [, name, moduleSpec] = requireMatch;
      if (!isRelativeImport(moduleSpec)) continue;
      imports.push({
        moduleSpecifier: moduleSpec,
        importedName: "default",
        localName: name,
        line: lineNum,
      });
      continue;
    }

    // CommonJS destructured: const { foo, bar } = require("./module")
    const requireDestructMatch = line.match(
      /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    );
    if (requireDestructMatch) {
      const [, names, moduleSpec] = requireDestructMatch;
      if (!isRelativeImport(moduleSpec)) continue;
      for (const name of names.split(",")) {
        const parts = name.trim().split(/\s*:\s*/);
        imports.push({
          moduleSpecifier: moduleSpec,
          importedName: parts[0].trim(),
          localName: (parts[1] ?? parts[0]).trim(),
          line: lineNum,
        });
      }
    }
  }

  return imports;
}

function isRelativeImport(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

// ─── Module Resolution ───────────────────────────────────────────────────────

/**
 * Resolve a relative import specifier to a file path in the project.
 */
function resolveModulePath(importerPath: string, moduleSpecifier: string, knownPaths: Set<string>): string | null {
  // Compute the directory of the importing file
  const dir = importerPath.replace(/\/[^/]+$/, "") || ".";
  const parts = dir.split("/");
  const importParts = moduleSpecifier.replace(/^\.\//, "").split("/");

  for (const part of importParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  const base = parts.join("/");

  // Try exact match, then with common extensions
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.tsx`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.js`,
    `${base}/index.tsx`,
    `${base}/index.jsx`,
  ];

  for (const candidate of candidates) {
    if (knownPaths.has(candidate)) return candidate;
    // Also try without leading ./
    const trimmed = candidate.replace(/^\.\//, "");
    if (knownPaths.has(trimmed)) return trimmed;
  }

  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze taint flows across multiple files in a project. Traces tainted data
 * from sources in one file through export/import boundaries to sinks in
 * another file.
 *
 * Returns both intra-file flows (from the standard taint tracker) and
 * cross-file flows where taint crosses module boundaries.
 */
export function analyzeCrossFileTaint(
  files: Array<{ path: string; content: string; language: string }>,
): CrossFileTaintFlow[] {
  const crossFlows: CrossFileTaintFlow[] = [];
  const knownPaths = new Set(files.map((f) => f.path));

  // Step 1: Analyze each file's tainted exports
  const exportsByFile = new Map<string, TaintedExport[]>();
  for (const f of files) {
    const lang = normalizeLanguage(f.language);
    if (lang !== "javascript" && lang !== "typescript") continue;
    const taintedExports = analyzeTaintedExports(f.content, f.path);
    if (taintedExports.length > 0) {
      exportsByFile.set(f.path, taintedExports);
    }
  }

  // If no files have tainted exports, no cross-file flows possible
  if (exportsByFile.size === 0) return crossFlows;

  // Step 2: For each file, check if its imports reference tainted exports
  for (const f of files) {
    const lang = normalizeLanguage(f.language);
    if (lang !== "javascript" && lang !== "typescript") continue;

    const imports = parseImports(f.content);
    if (imports.length === 0) continue;

    const lines = f.content.split("\n");

    for (const imp of imports) {
      // Resolve which file this import points to
      const resolvedPath = resolveModulePath(f.path, imp.moduleSpecifier, knownPaths);
      if (!resolvedPath) continue;

      const fileExports = exportsByFile.get(resolvedPath);
      if (!fileExports) continue;

      // Check if the imported binding matches a tainted export
      for (const exp of fileExports) {
        const nameMatches =
          imp.importedName === exp.exportedName ||
          (imp.importedName === "default" && exp.exportedName === "default") ||
          imp.importedName === "*"; // Namespace imports get all exports

        if (!nameMatches) continue;

        // Determine the local name to track in this file
        const localName = imp.importedName === "*" ? `${imp.localName}.${exp.exportedName}` : imp.localName;

        const localNameEsc = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const localNameRe = new RegExp(`\\b${localNameEsc}\\b`);

        if (exp.kind === "tainted-variable" || exp.kind === "tainted-return") {
          // The imported binding IS tainted — check if it reaches any sink
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const lineNum = li + 1;
            if (lineNum === imp.line) continue; // skip the import line itself
            if (!localNameRe.test(line)) continue;
            if (isSanitized(line)) continue;

            for (const sink of SINK_PATTERNS) {
              if (sink.pattern.test(line)) {
                crossFlows.push({
                  sourceFile: resolvedPath,
                  sinkFile: f.path,
                  source: {
                    line: exp.sourceLine,
                    expression: exp.sourceExpression,
                    kind: exp.sourceKind,
                  },
                  sink: {
                    line: lineNum,
                    api: sink.pattern.source.slice(0, 40),
                    kind: sink.kind,
                  },
                  exportedBinding: exp.exportedName,
                  importedAs: localName,
                  confidence: 0.75, // Cross-file flows get slightly lower confidence
                });
                break; // One sink per line
              }
            }

            // Also track propagation: if the imported tainted value is assigned
            // to another variable, track that variable to sinks too
            const reassignMatch = line.match(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*.*\\b${localNameEsc}\\b`));
            if (reassignMatch) {
              const derivedVar = reassignMatch[1];
              const derivedEsc = derivedVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const derivedRe = new RegExp(`\\b${derivedEsc}\\b`);

              // Scan remaining lines for the derived variable reaching a sink
              for (let dli = li + 1; dli < lines.length; dli++) {
                const dline = lines[dli];
                if (!derivedRe.test(dline)) continue;
                if (isSanitized(dline)) continue;

                for (const sink of SINK_PATTERNS) {
                  if (sink.pattern.test(dline)) {
                    crossFlows.push({
                      sourceFile: resolvedPath,
                      sinkFile: f.path,
                      source: {
                        line: exp.sourceLine,
                        expression: exp.sourceExpression,
                        kind: exp.sourceKind,
                      },
                      sink: {
                        line: dli + 1,
                        api: sink.pattern.source.slice(0, 40),
                        kind: sink.kind,
                      },
                      exportedBinding: exp.exportedName,
                      importedAs: `${localName} → ${derivedVar}`,
                      confidence: 0.65, // Lower confidence for derived propagation
                    });
                    break;
                  }
                }
              }
            }
          }
        } else if (exp.kind === "tainted-param-passthrough") {
          // The exported function passes its params to sinks — check if callers
          // pass tainted data to those parameters
          const fnCallRe = new RegExp(`\\b${localNameEsc}\\s*\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\)`);

          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const lineNum = li + 1;
            const callMatch = line.match(fnCallRe);
            if (!callMatch) continue;

            const argsStr = callMatch[1];
            // Simple argument splitting (handles basic cases)
            const args = splitArguments(argsStr);

            for (const paramIdx of exp.taintedParamIndices ?? []) {
              if (paramIdx >= args.length) continue;
              const arg = args[paramIdx].trim();

              // Check if this argument is tainted (from a source pattern)
              for (const src of SOURCE_PATTERNS) {
                if (src.pattern.test(arg)) {
                  crossFlows.push({
                    sourceFile: f.path,
                    sinkFile: resolvedPath,
                    source: {
                      line: lineNum,
                      expression: arg,
                      kind: src.kind,
                    },
                    sink: {
                      line: exp.sourceLine,
                      api: `${exp.exportedName}() param[${paramIdx}]`,
                      kind: "code-execution", // Generic — the actual sink is in the callee
                    },
                    exportedBinding: exp.exportedName,
                    importedAs: localName,
                    confidence: 0.7,
                  });
                  break;
                }
              }
            }
          }
        }
      }
    }
  }

  return deduplicateCrossFlows(crossFlows);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Split a function call's argument string into individual arguments.
 * Handles nested parentheses but not template literals or complex expressions.
 */
function splitArguments(argsStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of argsStr) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current);

  return args;
}

function deduplicateCrossFlows(flows: CrossFileTaintFlow[]): CrossFileTaintFlow[] {
  const seen = new Set<string>();
  return flows.filter((f) => {
    const key = `${f.sourceFile}:${f.source.line}→${f.sinkFile}:${f.sink.line}:${f.sink.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
