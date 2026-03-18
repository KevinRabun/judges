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

import type ts from "typescript";
import { createRequire } from "node:module";
import { normalizeLanguage } from "../language-patterns.js";

// Lazy-load the TypeScript compiler API so that modules which transitively
// import this file (e.g. the VS Code extension bundle) do not crash at load
// time when the `typescript` package is not available at runtime.
//
// In CJS bundles (esbuild for VS Code extension), `import.meta.url` is empty
// but the bundler emits a CJS `require` for externals — so `require` just
// works.  In native ESM (tests, CLI), we use `createRequire` from the real
// `import.meta.url`.
let _ts: typeof ts | undefined;
function getTS(): typeof ts {
  if (!_ts) {
    const metaUrl = typeof import.meta?.url === "string" ? import.meta.url : undefined;
    const req = metaUrl ? createRequire(metaUrl) : require;
    _ts = req("typescript") as typeof ts;
  }
  return _ts;
}

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
// Quantifiers use [ \t] instead of \s and bounded counts to prevent
// polynomial-time regex matching on adversarial input (CodeQL js/polynomial-redos).
// Merged `[ \t]*!?[ \t]*` into `[ \t]*!?` — when `!` is absent the two
// `[ \t]*` segments would compete for the same spaces/tabs, causing
// polynomial backtracking (CodeQL js/polynomial-redos).
const GUARD_PATTERNS: RegExp[] = [
  // Type checks
  /typeof[ \t]+\w+[ \t]*(?:!==?|===?)[ \t]*['"](?:string|number|boolean|object|undefined)['"]/i,
  // Truthiness / nullish checks followed by return/throw
  /if[ \t]*\([ \t]*!?\w+[ \t]*\)[ \t]*(?:return|throw|res\.status\(4\d\d\))/i,
  // Validation function calls
  /if[ \t]*\([ \t]*!?(?:isValid|validate|check|verify|sanitize|assert)\w*[ \t]*\(/i,
  // Length/range checks
  /if[ \t]*\([ \t]*\w+\.length[ \t]*(?:[<>=!]+)/i,
  /if[ \t]*\([ \t]*\w+[ \t]*(?:<|>|<=|>=)[ \t]*\d+/i,
  // Regex test guards
  /if[ \t]*\([ \t]*!?\/[^/]+\/\.test[ \t]*\(\w+\)/i,
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
  _taintMap: Map<string, TaintEntry>,
): Map<string, FunctionTaintInfo> {
  const ts = getTS();
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
  const ts = getTS();
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

// ─── Language-Specific Pattern Sets ──────────────────────────────────────────

interface LanguagePatternSet {
  /** Additional source patterns beyond the global set */
  sources: Array<{ pattern: RegExp; kind: TaintSourceKind }>;
  /** Additional sink patterns beyond the global set */
  sinks: Array<{ pattern: RegExp; kind: TaintSinkKind }>;
  /** Additional sanitizer patterns beyond the global set */
  sanitizers: RegExp[];
  /** Language-specific assignment regex (capture group 1 = variable name, 2 = RHS) */
  assignPattern: RegExp;
  /** Additional guard clause patterns */
  guards: RegExp[];
}

const PYTHON_PATTERNS: LanguagePatternSet = {
  sources: [
    {
      pattern: /\brequest\.(?:form|args|json|data|values|files|cookies|headers)\b(?:\[|\.get\s*\()/i,
      kind: "http-param",
    },
    { pattern: /\brequest\.GET\b(?:\[|\.get\s*\()/i, kind: "http-param" },
    { pattern: /\brequest\.POST\b(?:\[|\.get\s*\()/i, kind: "http-param" },
    { pattern: /\brequest\.(?:query_params|query_string)\b/i, kind: "http-param" },
    { pattern: /\bflask\.request\.\w+/i, kind: "http-param" },
    { pattern: /\binput\s*\(/i, kind: "user-input" },
    { pattern: /\bsys\.stdin\b/i, kind: "user-input" },
    { pattern: /\bos\.environ\b(?:\[|\.get\s*\()/i, kind: "environment" },
    { pattern: /\burlparse\s*\(|parse_qs\s*\(/i, kind: "url-param" },
    { pattern: /\bopen\s*\(.*\)\.read/i, kind: "external-data" },
    { pattern: /\brequests\.(?:get|post|put|delete)\s*\(/i, kind: "external-data" },
    { pattern: /\bjson\.loads?\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bexec\s*\(/i, kind: "code-execution" },
    { pattern: /\beval\s*\(/i, kind: "code-execution" },
    { pattern: /\bcompile\s*\(.*\).*\bexec\b/i, kind: "code-execution" },
    { pattern: /\bos\.system\s*\(/i, kind: "command-exec" },
    { pattern: /\bos\.popen\s*\(/i, kind: "command-exec" },
    {
      pattern: /\bsubprocess\.(?:Popen|run|call|check_output|check_call|getoutput|getstatusoutput)\s*\(/i,
      kind: "command-exec",
    },
    { pattern: /\bcursor\.execute\s*\(/i, kind: "sql-query" },
    { pattern: /\b(?:connection|conn|db)\.execute\s*\(/i, kind: "sql-query" },
    { pattern: /\braw\s*\(\s*["'`]?\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\.(?:extra|raw)\s*\(/i, kind: "sql-query" },
    { pattern: /\brender_template_string\s*\(/i, kind: "template" },
    { pattern: /\bTemplate\s*\(.*\)\.render\s*\(/i, kind: "template" },
    { pattern: /\bJinja2\.\w*\.from_string\s*\(/i, kind: "template" },
    { pattern: /\bmarkup\s*\(.*\+/i, kind: "xss" },
    { pattern: /\bopen\s*\(.*user|path|file|name/i, kind: "path-traversal" },
    { pattern: /\bredirect\s*\(/i, kind: "redirect" },
    { pattern: /\bpickle\.loads?\s*\(/i, kind: "deserialization" },
    { pattern: /\byaml\.(?:load|unsafe_load)\s*\(/i, kind: "deserialization" },
    { pattern: /\bmarshal\.loads?\s*\(/i, kind: "deserialization" },
  ],
  sanitizers: [
    /\bbleach\.clean\s*\(/i,
    /\bmarkup_safe\b/i,
    /\bescape\s*\(/i,
    /\bMarkup\b/i,
    /\bquote\s*\(/i,
    /\bshlex\.quote\s*\(/i,
    /\bshellescape\s*\(/i,
    /\bsanitize\w*\s*\(/i,
    /\bvalidator\.\w+\s*\(/i,
    /\bpydantic\b/i,
    /\b%s\b.*\bexecute\s*\(/i, // parameterized query
    /\bparamstyle\b/i,
    /\bsqlalchemy\.text\s*\(/i,
  ],
  assignPattern: /^\s*(\w+)\s*(?::\s*\w[\w[\], |]*\s*)?=\s*(.+)/,
  guards: [
    /if[ \t]+(?:not[ \t]+)?isinstance\s*\(/i,
    /if[ \t]+(?:not[ \t]+)?\w+\s*(?:is|==|!=)\s*None/i,
    /raise[ \t]+(?:ValueError|TypeError|ValidationError)/i,
    /assert[ \t]+isinstance\s*\(/i,
    /\.validate\s*\(|\.is_valid\s*\(/i,
  ],
};

const JAVA_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\b(?:request|req|httpRequest)\.getParameter\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getAttribute\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getHeader\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getQueryString\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getInputStream\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getReader\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.getCookies\s*\(/i, kind: "http-param" },
    { pattern: /\b@RequestParam\b/i, kind: "http-param" },
    { pattern: /\b@PathVariable\b/i, kind: "url-param" },
    { pattern: /\b@RequestBody\b/i, kind: "http-param" },
    { pattern: /\b@RequestHeader\b/i, kind: "http-param" },
    { pattern: /\bSystem\.getenv\s*\(/i, kind: "environment" },
    { pattern: /\bScanner\s*\(\s*System\.in\b/i, kind: "user-input" },
    { pattern: /\bBufferedReader\b.*\bInputStreamReader\b.*\bSystem\.in\b/i, kind: "user-input" },
    { pattern: /\bargs\[/i, kind: "user-input" },
    { pattern: /\bnew\s+ObjectMapper\b.*\.read/i, kind: "external-data" },
    { pattern: /\bURL\s*\(.*\)\.openStream\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bRuntime\.getRuntime\s*\(\)\.exec\s*\(/i, kind: "command-exec" },
    { pattern: /\bProcessBuilder\b/i, kind: "command-exec" },
    { pattern: /\bStatement\b.*\.(?:execute|executeQuery|executeUpdate)\s*\(/i, kind: "sql-query" },
    { pattern: /\.(?:createQuery|createNativeQuery)\s*\(/i, kind: "sql-query" },
    { pattern: /\bString\.format\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\bScriptEngine\b.*\.eval\s*\(/i, kind: "code-execution" },
    { pattern: /\bClass\.forName\s*\(/i, kind: "code-execution" },
    { pattern: /\.newInstance\s*\(/i, kind: "code-execution" },
    { pattern: /\bXStream\b.*\.fromXML\s*\(/i, kind: "deserialization" },
    { pattern: /\bObjectInputStream\b.*\.readObject\s*\(/i, kind: "deserialization" },
    { pattern: /\bnew\s+File\s*\(/i, kind: "path-traversal" },
    { pattern: /\bFiles\.(?:read|write|copy|move|newInputStream)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bresponse\.sendRedirect\s*\(/i, kind: "redirect" },
    { pattern: /\.(?:forward|include)\s*\(/i, kind: "redirect" },
    { pattern: /\bVelocity\b.*\.evaluate\s*\(/i, kind: "template" },
    { pattern: /\bFreemarkerConfiguration\b/i, kind: "template" },
  ],
  sanitizers: [
    /\bPreparedStatement\b/i,
    /\bEncoder\.encode\s*\(/i,
    /\bOWASP\.\w+\.encode\s*\(/i,
    /\bHtmlUtils\.htmlEscape\s*\(/i,
    /\bStringEscapeUtils\.escape\w+\s*\(/i,
    /\bPattern\.matches\s*\(/i,
    /\b@Valid\b/i,
    /\b@Validated\b/i,
    /\bBindingResult\b/i,
    /\bInputValidator\b/i,
    /\bwhitelist\s*\(/i,
    /\bSanitizers\.\w+\s*\(/i,
  ],
  assignPattern:
    /^\s*(?:(?:final|var|String|int|long|double|boolean|byte|short|float|char|Object|List|Map|Set|Integer|Long|Double|Boolean|Optional|HttpServletRequest)\s+)*(\w+)\s*=\s*(.+);/,
  guards: [
    /if[ \t]*\([ \t]*\w+[ \t]*==[ \t]*null/i,
    /\bObjects\.requireNonNull\s*\(/i,
    /\bOptional\.ofNullable\s*\(/i,
    /\bif[ \t]*\([ \t]*!?\w+\.(?:isEmpty|isBlank|matches|startsWith)\s*\(/i,
    /throw[ \t]+new[ \t]+(?:IllegalArgumentException|ValidationException)/i,
  ],
};

const GO_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\br\.(?:FormValue|PostFormValue)\s*\(/i, kind: "http-param" },
    { pattern: /\br\.URL\.Query\s*\(\)/i, kind: "http-param" },
    { pattern: /\br\.Header\.Get\s*\(/i, kind: "http-param" },
    { pattern: /\br\.Body\b/i, kind: "http-param" },
    { pattern: /\bc\.(?:Query|Param|PostForm|FormValue|GetHeader)\s*\(/i, kind: "http-param" },
    { pattern: /\bc\.(?:BindJSON|ShouldBindJSON|Bind)\s*\(/i, kind: "http-param" },
    { pattern: /\bos\.Getenv\s*\(/i, kind: "environment" },
    { pattern: /\bos\.Args\b/i, kind: "user-input" },
    { pattern: /\bflag\.(?:String|Int|Bool|Arg)\s*\(/i, kind: "user-input" },
    { pattern: /\bbufio\.NewReader\s*\(\s*os\.Stdin\b/i, kind: "user-input" },
    { pattern: /\bjson\.(?:Unmarshal|NewDecoder)\s*\(/i, kind: "external-data" },
    { pattern: /\bhttp\.Get\s*\(/i, kind: "external-data" },
    { pattern: /\bioutil\.ReadAll\s*\(/i, kind: "external-data" },
    { pattern: /\bio\.ReadAll\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bexec\.Command\s*\(/i, kind: "command-exec" },
    { pattern: /\bexec\.CommandContext\s*\(/i, kind: "command-exec" },
    { pattern: /\bos\.(?:StartProcess|Exec)\s*\(/i, kind: "command-exec" },
    { pattern: /\bdb\.(?:Query|Exec|QueryRow|QueryContext|ExecContext)\s*\(/i, kind: "sql-query" },
    { pattern: /\bsql\.(?:Open|Query)\s*\(/i, kind: "sql-query" },
    { pattern: /\bfmt\.Sprintf\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\btemplate\.(?:New|Must)\s*\(.*\.Parse\s*\(/i, kind: "template" },
    { pattern: /\bhtml\/template\b.*\.Execute\s*\(/i, kind: "template" },
    { pattern: /\btext\/template\b.*\.Execute\s*\(/i, kind: "template" },
    { pattern: /\bos\.(?:Open|Create|OpenFile|ReadFile|WriteFile)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bfilepath\.Join\s*\(.*\+/i, kind: "path-traversal" },
    { pattern: /\bhttp\.Redirect\s*\(/i, kind: "redirect" },
    { pattern: /\bgob\.NewDecoder\b.*\.Decode\s*\(/i, kind: "deserialization" },
    { pattern: /\bencoding\/gob\b/i, kind: "deserialization" },
    { pattern: /\byaml\.Unmarshal\s*\(/i, kind: "deserialization" },
  ],
  sanitizers: [
    /\bhtml\.EscapeString\s*\(/i,
    /\burl\.QueryEscape\s*\(/i,
    /\burl\.PathEscape\s*\(/i,
    /\btemplate\.HTMLEscapeString\s*\(/i,
    /\bstrconv\.(?:Atoi|ParseInt|ParseFloat|ParseBool)\s*\(/i,
    /\bregexp\.MustCompile\b.*\.(?:MatchString|FindString)\s*\(/i,
    /\bfilepath\.Clean\s*\(/i,
    /\bpath\.Clean\s*\(/i,
    /\bsqlx?\.\w*Prepared\b/i,
    /\bValidate\.\w+\s*\(/i,
  ],
  assignPattern: /^\s*(?:var\s+)?(\w+)\s*(?::=|=)\s*(.+)/,
  guards: [
    /if[ \t]+\w+[ \t]*(?:==|!=)[ \t]*nil/i,
    /if[ \t]+err[ \t]*!=[ \t]*nil/i,
    /if[ \t]+!?(?:strings\.Contains|strings\.HasPrefix|regexp)\b/i,
    /if[ \t]+len\s*\(\w+\)[ \t]*(?:==|!=|<|>|<=|>=)/i,
  ],
};

const CSHARP_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\bRequest\.(?:Form|QueryString|Query|Params|Headers|Cookies)\b/i, kind: "http-param" },
    { pattern: /\bRequest\.(?:Body|InputStream)\b/i, kind: "http-param" },
    { pattern: /\b\[FromQuery\]/i, kind: "http-param" },
    { pattern: /\b\[FromBody\]/i, kind: "http-param" },
    { pattern: /\b\[FromForm\]/i, kind: "http-param" },
    { pattern: /\b\[FromHeader\]/i, kind: "http-param" },
    { pattern: /\b\[FromRoute\]/i, kind: "url-param" },
    { pattern: /\bHttpContext\.Request\b/i, kind: "http-param" },
    { pattern: /\bEnvironment\.GetEnvironmentVariable\s*\(/i, kind: "environment" },
    { pattern: /\bConsole\.ReadLine\s*\(/i, kind: "user-input" },
    { pattern: /\bargs\[/i, kind: "user-input" },
    { pattern: /\bHttpClient\b.*\.(?:GetAsync|PostAsync|GetStringAsync)\s*\(/i, kind: "external-data" },
    { pattern: /\bJsonSerializer\.Deserialize\s*\(/i, kind: "external-data" },
    { pattern: /\bJsonConvert\.DeserializeObject\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bProcess\.Start\s*\(/i, kind: "command-exec" },
    { pattern: /\bProcessStartInfo\b/i, kind: "command-exec" },
    { pattern: /\bSqlCommand\b.*\.(?:ExecuteReader|ExecuteNonQuery|ExecuteScalar)\s*\(/i, kind: "sql-query" },
    { pattern: /\bnew\s+SqlCommand\s*\(\s*(?:\$"|".*\+)/i, kind: "sql-query" },
    { pattern: /\.(?:FromSqlRaw|ExecuteSqlRaw|SqlQuery)\s*\(/i, kind: "sql-query" },
    { pattern: /\bstring\.Format\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\bCSharpScript\.EvaluateAsync\s*\(/i, kind: "code-execution" },
    { pattern: /\bAssembly\.Load\s*\(/i, kind: "code-execution" },
    { pattern: /\bActivator\.CreateInstance\s*\(/i, kind: "code-execution" },
    { pattern: /\bBinaryFormatter\b.*\.Deserialize\s*\(/i, kind: "deserialization" },
    { pattern: /\bXmlSerializer\b.*\.Deserialize\s*\(/i, kind: "deserialization" },
    { pattern: /\bFile\.(?:ReadAllText|ReadAllBytes|ReadAllLines|Open|OpenRead)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bPath\.Combine\s*\(.*\+/i, kind: "path-traversal" },
    { pattern: /\bResponse\.Redirect\s*\(/i, kind: "redirect" },
    { pattern: /\bRedirectToAction\s*\(/i, kind: "redirect" },
    { pattern: /\b@Html\.Raw\s*\(/i, kind: "xss" },
    { pattern: /\bHtmlHelper\b.*\.Raw\s*\(/i, kind: "xss" },
  ],
  sanitizers: [
    /\bHtmlEncoder\.Default\.Encode\s*\(/i,
    /\bWebUtility\.HtmlEncode\s*\(/i,
    /\bUrlEncoder\.Default\.Encode\s*\(/i,
    /\bAntiXssEncoder\.\w+\s*\(/i,
    /\b\[ValidateAntiForgeryToken\]/i,
    /\bModelState\.IsValid\b/i,
    /\b\[Required\]/i,
    /\b\[StringLength\b/i,
    /\b\[RegularExpression\b/i,
    /\bSqlParameter\b/i,
    /\bParameterized\b/i,
    /\bAddWithValue\s*\(/i,
    /\bInputValidator\b/i,
  ],
  assignPattern:
    /^\s*(?:(?:var|string|int|long|double|bool|float|decimal|object|dynamic|char|byte|List|Dictionary|IEnumerable|Task)\s*(?:<[^>]+>\s*)?)?(\w+)\s*=\s*(.+);/,
  guards: [
    /if[ \t]*\([ \t]*\w+[ \t]*(?:==|!=)[ \t]*null/i,
    /\bif[ \t]*\([ \t]*!?string\.IsNullOrEmpty\s*\(/i,
    /\bif[ \t]*\([ \t]*!?string\.IsNullOrWhiteSpace\s*\(/i,
    /\?\?[ \t]+throw\b/i,
    /\bargument\w*Exception\b/i,
    /\bModelState\.IsValid\b/i,
  ],
};

const RUST_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\b(?:web|actix_web)::(?:Query|Form|Json|Path)\b/i, kind: "http-param" },
    { pattern: /\breq\.(?:body|param|query|header)\s*\(/i, kind: "http-param" },
    { pattern: /\baxum::extract::(?:Query|Form|Json|Path)\b/i, kind: "http-param" },
    { pattern: /\bstd::env::(?:var|args)\b/i, kind: "environment" },
    { pattern: /\bstd::io::stdin\b/i, kind: "user-input" },
    { pattern: /\bserde_json::from_str\s*\(/i, kind: "external-data" },
    { pattern: /\breqwest::(?:get|Client)\b/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bCommand::new\s*\(/i, kind: "command-exec" },
    { pattern: /\bstd::process::Command\b/i, kind: "command-exec" },
    { pattern: /\.(?:query|execute|query_as|query_scalar)\s*\(/i, kind: "sql-query" },
    { pattern: /\bformat!\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\bstd::fs::(?:read_to_string|read|write|File::open)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bFile::open\s*\(/i, kind: "path-traversal" },
    { pattern: /\bserde_json::from_value\s*\(/i, kind: "deserialization" },
    { pattern: /\bbincode::deserialize\s*\(/i, kind: "deserialization" },
    { pattern: /\bRedirect::to\s*\(/i, kind: "redirect" },
  ],
  sanitizers: [
    /\bhtml_escape\s*\(/i,
    /\bammonia::clean\s*\(/i,
    /\bencode_safe\s*\(/i,
    /\bsqlx::query!\s*\(/i,
    /\b\.bind\s*\(/i,
    /\.parse::<(?:i32|i64|u32|u64|f64|usize|bool)>/i,
    /\bvalidate\s*\(\)/i,
    /\bPath::new\s*\(.*\)\.canonicalize\s*\(/i,
  ],
  assignPattern: /^\s*(?:let\s+(?:mut\s+)?)?(\w+)\s*(?::\s*[\w<>&, [\]]+\s*)?=\s*(.+);/,
  guards: [
    /\bmatch\s+\w+\s*\{/i,
    /if[ \t]+let[ \t]+Some\b/i,
    /\.(?:unwrap_or|unwrap_or_else|unwrap_or_default)\s*\(/i,
    /\.is_(?:some|none|ok|err)\s*\(\)/i,
    /\bensure!\s*\(/i,
    /\banyhow::ensure!\s*\(/i,
  ],
};

const PHP_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\$_(?:GET|POST|REQUEST|COOKIE|SERVER|FILES)\[/i, kind: "http-param" },
    { pattern: /\$request->(?:input|get|post|query|all)\s*\(/i, kind: "http-param" },
    { pattern: /\$_ENV\[|getenv\s*\(/i, kind: "environment" },
    { pattern: /\$argv\b|fgets\s*\(\s*STDIN\b/i, kind: "user-input" },
    { pattern: /file_get_contents\s*\(\s*['"]php:\/\/input/i, kind: "http-param" },
    { pattern: /json_decode\s*\(\s*file_get_contents/i, kind: "external-data" },
    { pattern: /\$_SESSION\[/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\b(?:exec|system|passthru|shell_exec|popen|proc_open)\s*\(/i, kind: "command-exec" },
    { pattern: /\beval\s*\(|preg_replace\b.*\/e/i, kind: "code-execution" },
    { pattern: /\bmysqli?_query\s*\(/i, kind: "sql-query" },
    { pattern: /\$(?:pdo|db|conn)->(?:query|exec)\s*\(/i, kind: "sql-query" },
    { pattern: /->(?:where|whereRaw|selectRaw|orderByRaw)\s*\(/i, kind: "sql-query" },
    { pattern: /\binclude\s*\(|\brequire\s*\(|include_once\s*\(|require_once\s*\(/i, kind: "path-traversal" },
    { pattern: /\bfile_(?:get_contents|put_contents)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bfopen\s*\(/i, kind: "path-traversal" },
    { pattern: /\bheader\s*\(\s*['"]Location:/i, kind: "redirect" },
    { pattern: /\bunserialize\s*\(/i, kind: "deserialization" },
    { pattern: /\becho\b|\bprint\b/i, kind: "xss" },
  ],
  sanitizers: [
    /\bhtmlspecialchars\s*\(/i,
    /\bhtmlentities\s*\(/i,
    /\bstrip_tags\s*\(/i,
    /\baddslashes\s*\(/i,
    /\bmysqli?_real_escape_string\s*\(/i,
    /\bPDO::quote\s*\(/i,
    /->(?:prepare|bindParam|bindValue)\s*\(/i,
    /\bintval\s*\(|\bfloatval\s*\(|\b\(int\)|\b\(float\)/i,
    /\bfilter_(?:var|input)\s*\(/i,
    /\bpreg_match\s*\(/i,
    /\brealpath\s*\(|basename\s*\(/i,
  ],
  assignPattern: /^\s*\$(\w+)\s*=\s*(.+);/,
  guards: [
    /if[ \t]*\([ \t]*!?(?:isset|empty|is_null|is_numeric|is_string|is_array)\s*\(/i,
    /if[ \t]*\([ \t]*!?\$\w+\s*(?:===?|!==?)\s*(?:null|false|''|"")\b/i,
    /\bvalidate\s*\(/i,
    /\bpreg_match\s*\(/i,
    /\bfilter_(?:var|input)\s*\(/i,
  ],
};

const RUBY_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\bparams\[/i, kind: "http-param" },
    { pattern: /\bparams\.(?:require|permit|fetch)\s*\(/i, kind: "http-param" },
    { pattern: /\brequest\.(?:body|env|headers|params)\b/i, kind: "http-param" },
    { pattern: /\bENV\[|ENV\.fetch\s*\(/i, kind: "environment" },
    { pattern: /\bARGV\b|\bgets\b|\breadline\b/i, kind: "user-input" },
    { pattern: /\bJSON\.parse\s*\(/i, kind: "external-data" },
    { pattern: /\bNet::HTTP\b.*\.(?:get|post)\s*\(/i, kind: "external-data" },
    { pattern: /\bsession\[/i, kind: "external-data" },
    { pattern: /\bcookies\[/i, kind: "http-param" },
  ],
  sinks: [
    { pattern: /\bsystem\s*\(|\bexec\s*\(|\b`[^`]*#\{/i, kind: "command-exec" },
    { pattern: /\b%x\{|Kernel\.system\s*\(/i, kind: "command-exec" },
    { pattern: /\beval\s*\(|instance_eval\s*\(|class_eval\s*\(/i, kind: "code-execution" },
    { pattern: /\bsend\s*\(|public_send\s*\(/i, kind: "code-execution" },
    { pattern: /\.(?:where|find_by_sql|execute|select)\s*\(\s*(?:"|'|%|#)/i, kind: "sql-query" },
    { pattern: /\.connection\.execute\s*\(/i, kind: "sql-query" },
    { pattern: /\bFile\.(?:open|read|write|delete)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bredirect_to\s*\(/i, kind: "redirect" },
    { pattern: /\bMarshal\.load\s*\(|YAML\.load\s*\(/i, kind: "deserialization" },
    { pattern: /\b\.html_safe\b/i, kind: "xss" },
    { pattern: /\braw\s*\(/i, kind: "xss" },
  ],
  sanitizers: [
    /\bERB::Util\.html_escape\s*\(/i,
    /\bCGI\.escapeHTML\s*\(/i,
    /\bsanitize\s*\(/i,
    /\bparams\.(?:require|permit)\s*\(/i,
    /\.to_i\b|\.to_f\b/i,
    /\bActiveRecord::Base\.connection\.quote\s*\(/i,
    /\.(?:where|find_by)\s*\(\s*\w+\s*:\s/i,
    /\bMarshal\.safe_load\b|YAML\.safe_load\s*\(/i,
    /\bRegexp\.match\s*\(/i,
    /\bFile\.expand_path\b.*\.start_with\?\s*\(/i,
  ],
  assignPattern: /^\s*(\w+)\s*=\s*(.+)/,
  guards: [
    /\bunless\s+\w+\.(?:nil\?|blank\?|empty\?)\b/i,
    /if[ \t]+\w+\.(?:present\?|valid\?)\b/i,
    /\braise\s+\w+Error\b/i,
    /\.(?:validates?|validate!)\s/i,
  ],
};

const KOTLIN_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\brequest\.(?:getParameter|getAttribute|getHeader)\s*\(/i, kind: "http-param" },
    { pattern: /\b@RequestParam\b|\b@PathVariable\b|\b@RequestBody\b/i, kind: "http-param" },
    { pattern: /\bcall\.receive\b/i, kind: "http-param" },
    { pattern: /\bcall\.parameters\[/i, kind: "http-param" },
    { pattern: /\bSystem\.getenv\s*\(/i, kind: "environment" },
    { pattern: /\breadLine\s*\(\)|Scanner\s*\(\s*System\.`in`\)/i, kind: "user-input" },
    { pattern: /\bargs\[/i, kind: "user-input" },
    { pattern: /\bGson\(\)\.fromJson\s*\(/i, kind: "external-data" },
    { pattern: /\bJson\.decodeFromString\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bRuntime\.getRuntime\(\)\.exec\s*\(/i, kind: "command-exec" },
    { pattern: /\bProcessBuilder\s*\(/i, kind: "command-exec" },
    { pattern: /\.(?:executeQuery|executeUpdate|createQuery|nativeQuery)\s*\(/i, kind: "sql-query" },
    { pattern: /\bString\.format\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /"\$\{?\w+\}?.*(?:SELECT|INSERT|UPDATE|DELETE)\b/i, kind: "sql-query" },
    { pattern: /\bFile\s*\(\s*(?:\$|[^")]+\+)/i, kind: "path-traversal" },
    { pattern: /\bScriptEngine\b.*\.eval\s*\(/i, kind: "code-execution" },
    { pattern: /\bObjectInputStream\b.*\.readObject\s*\(/i, kind: "deserialization" },
  ],
  sanitizers: [
    /\bPreparedStatement\b/i,
    /\bEncoder\.encode\s*\(/i,
    /\bHtmlUtils\.htmlEscape\s*\(/i,
    /\bStringEscapeUtils\.escape\w+\s*\(/i,
    /\b@Valid\b|\b@Validated\b/i,
    /\brequire\s*\{|check\s*\{/i,
    /\.(?:toIntOrNull|toLongOrNull|toDoubleOrNull)\s*\(/i,
    /\bRegex\s*\(.*\)\.matches\s*\(/i,
  ],
  assignPattern: /^\s*(?:(?:val|var|private|internal)\s+)?(\w+)\s*(?::\s*[\w<>?, [\]]+\s*)?=\s*(.+)/,
  guards: [
    /if[ \t]*\([ \t]*\w+[ \t]*(?:==|!=)[ \t]*null\b/i,
    /\?\.\s*let\s*\{/i,
    /\brequire\s*\(/i,
    /\bcheck\s*\(/i,
    /if[ \t]*\([ \t]*!?\w+\.(?:isBlank|isEmpty|isNullOrBlank|isNullOrEmpty)\s*\(/i,
  ],
};

const SWIFT_PATTERNS: LanguagePatternSet = {
  sources: [
    { pattern: /\breq\.(?:content|query|parameters)\b/i, kind: "http-param" },
    { pattern: /\brequest\.(?:content|query|body)\b/i, kind: "http-param" },
    { pattern: /\bURLComponents\b.*\.queryItems\b/i, kind: "url-param" },
    { pattern: /\bProcessInfo\.processInfo\.environment\[/i, kind: "environment" },
    { pattern: /\bCommandLine\.arguments\b/i, kind: "user-input" },
    { pattern: /\breadLine\s*\(/i, kind: "user-input" },
    { pattern: /\bJSONDecoder\(\)\.decode\s*\(/i, kind: "external-data" },
    { pattern: /\bURLSession\b.*\.data\s*\(/i, kind: "external-data" },
  ],
  sinks: [
    { pattern: /\bProcess\(\)\s*.*arguments/i, kind: "command-exec" },
    { pattern: /\bNSTask\b/i, kind: "command-exec" },
    { pattern: /\.(?:execute|prepare)\s*\(\s*(?:".*\\|".*\+)/i, kind: "sql-query" },
    { pattern: /\bFileManager\b.*\.(?:contentsOfFile|createFile)\s*\(/i, kind: "path-traversal" },
    { pattern: /\bURL\s*\(\s*fileURLWithPath:\s*(?:\w+\s*\+|"\\)/i, kind: "path-traversal" },
    { pattern: /\bJSContext\b.*\.evaluateScript\s*\(/i, kind: "code-execution" },
    { pattern: /\bNSExpression\s*\(/i, kind: "code-execution" },
    { pattern: /\bNSKeyedUnarchiver\b.*\.unarchiveObject\s*\(/i, kind: "deserialization" },
    { pattern: /\bResponse\.redirect\s*\(/i, kind: "redirect" },
  ],
  sanitizers: [
    /\baddingPercentEncoding\s*\(/i,
    /\.replacingOccurrences\s*\(of:.*with:/i,
    /\bInt\s*\(|Double\s*\(|Float\s*\(/i,
    /\bNSRegularExpression\b/i,
    /\bguard\s+let\b/i,
    /\b\.standardizedFileURL\b|\.resolvingSymlinksInPath\b/i,
  ],
  assignPattern: /^\s*(?:(?:let|var)\s+)?(\w+)\s*(?::\s*[\w<>?, [\]?!]+\s*)?=\s*(.+)/,
  guards: [
    /guard[ \t]+let\b/i,
    /if[ \t]+let\b/i,
    /guard[ \t]+!?\w+\.(?:isEmpty|isNil)\b/i,
    /\bprecondition\s*\(/i,
    /\bassert\s*\(/i,
  ],
};

// Map normalized languages to their pattern sets
const LANGUAGE_PATTERN_MAP: Record<string, LanguagePatternSet> = {
  python: PYTHON_PATTERNS,
  java: JAVA_PATTERNS,
  go: GO_PATTERNS,
  csharp: CSHARP_PATTERNS,
  rust: RUST_PATTERNS,
  php: PHP_PATTERNS,
  ruby: RUBY_PATTERNS,
  kotlin: KOTLIN_PATTERNS,
  swift: SWIFT_PATTERNS,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze a source file for taint flows: paths from untrusted input to
 * dangerous sinks through variable assignments and string concatenation.
 *
 * For JS/TS, uses the TypeScript compiler AST for precise variable tracking.
 * For Python, Java, Go, C#, and Rust: uses language-specific source/sink/
 * sanitizer patterns for deeper analysis.
 * For other languages, falls back to generic regex-based analysis.
 */
export function analyzeTaintFlows(code: string, language: string): TaintFlow[] {
  const lang = normalizeLanguage(language);

  switch (lang) {
    case "javascript":
    case "typescript":
      try {
        return analyzeTypeScriptTaint(code, lang);
      } catch {
        // typescript package unavailable (e.g. VS Code extension bundle) —
        // fall through to regex-based analysis
        return analyzeRegexTaint(code, LANGUAGE_PATTERN_MAP[lang]);
      }
    default: {
      const langPatterns = LANGUAGE_PATTERN_MAP[lang];
      return analyzeRegexTaint(code, langPatterns);
    }
  }
}

// ─── TypeScript / JavaScript Taint Analysis ──────────────────────────────────

function analyzeTypeScriptTaint(code: string, language: "javascript" | "typescript"): TaintFlow[] {
  const ts = getTS();
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

/**
 * Language-aware sanitizer check: combines global sanitizers with
 * language-specific ones when available.
 */
function isLangSanitized(expression: string, langPatterns?: LanguagePatternSet): boolean {
  if (isSanitized(expression)) return true;
  if (langPatterns) {
    for (const p of langPatterns.sanitizers) {
      if (p.test(expression)) return true;
    }
  }
  return false;
}

/**
 * Language-aware guard clause detection: combines global guards with
 * language-specific guard patterns.
 */
function detectLangGuardClauses(
  varName: string,
  sourceLine: number,
  sinkLine: number,
  codeLines: string[],
  langPatterns?: LanguagePatternSet,
): number {
  const baseReduction = detectGuardClauses(varName, sourceLine, sinkLine, codeLines);
  if (!langPatterns) return baseReduction;

  const start = Math.min(sourceLine, sinkLine) - 1;
  const end = Math.max(sourceLine, sinkLine);
  let extraGuards = 0;

  for (let i = start; i < end && i < codeLines.length; i++) {
    const line = codeLines[i];
    if (!containsWordBoundary(line, varName)) continue;
    for (const guard of langPatterns.guards) {
      if (guard.test(line)) {
        extraGuards++;
        break;
      }
    }
  }

  return Math.min(baseReduction + extraGuards * 0.1, 0.35);
}

function analyzeRegexTaint(code: string, langPatterns?: LanguagePatternSet): TaintFlow[] {
  const codeLines = code.split("\n");
  const flows: TaintFlow[] = [];

  // Track tainted variable names
  const tainted = new Map<string, { sourceExpr: string; sourceKind: TaintSourceKind; sourceLine: number }>();

  // Merge source and sink patterns: language-specific + global
  const allSources = langPatterns ? [...langPatterns.sources, ...SOURCE_PATTERNS] : SOURCE_PATTERNS;
  const allSinks = langPatterns ? [...langPatterns.sinks, ...SINK_PATTERNS] : SINK_PATTERNS;

  // Use language-specific assignment pattern if available
  const assignPattern = langPatterns?.assignPattern ?? /^\s*(?:(?:let|const|var|val|auto)\s+)?(\w+)\s*[:=]\s*(.+)/;

  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    const lineNum = i + 1;

    // Check for source assignments
    const assignMatch = line.match(assignPattern);
    if (assignMatch) {
      const [, varName, rhs] = assignMatch;

      // Skip sanitized assignments
      if (isLangSanitized(rhs, langPatterns)) continue;

      // Direct source
      for (const src of allSources) {
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
    if (isLangSanitized(line, langPatterns)) continue;

    // Check for sinks using tainted data
    for (const sink of allSinks) {
      if (!sink.pattern.test(line)) continue;

      // Check tainted variables (word-boundary aware)
      for (const [varName, info] of tainted) {
        if (containsWordBoundary(line, varName) && lineNum !== info.sourceLine) {
          const guardReduction = detectLangGuardClauses(varName, info.sourceLine, lineNum, codeLines, langPatterns);
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
      for (const src of allSources) {
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
