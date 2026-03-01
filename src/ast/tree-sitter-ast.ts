// ─────────────────────────────────────────────────────────────────────────────
// Tree-sitter AST — Unified real syntax-tree analysis for all languages
// ─────────────────────────────────────────────────────────────────────────────
// Uses web-tree-sitter (WASM-based, zero native deps) to parse source code
// into a full syntax tree, then walks the tree to extract function metrics,
// dead code, deep nesting, type-safety issues, and imports.
//
// Supports: TypeScript, JavaScript, Python, Go, Rust, Java, C#, C++
//
// Graceful degradation: if tree-sitter WASM grammars aren't available at
// runtime, the caller can fall back to the structural parser.
// ─────────────────────────────────────────────────────────────────────────────

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { CodeStructure, FunctionInfo } from "./types.js";

// Support both ESM (import.meta.url) and CJS (esbuild bundle) environments.
// When bundled by esbuild with --format=cjs, import.meta.url is undefined,
// so we fall back to __filename (which esbuild injects for CJS bundles).
const _importMetaUrl: string | undefined = typeof import.meta?.url === "string" ? import.meta.url : undefined;

const require = _importMetaUrl
  ? createRequire(_importMetaUrl)
  : typeof globalThis.require === "function"
    ? globalThis.require
    : createRequire(__filename ?? import.meta.url);

// ─── Lazy Initialization ────────────────────────────────────────────────────

let initPromise: Promise<boolean> | null = null;
let parserModule: TreeSitterModule | null = null;

interface TreeSitterModule {
  Parser: TreeSitterParserClass;
  Language: TreeSitterLanguageClass;
}

interface TreeSitterParserClass {
  new (): TreeSitterParser;
  init(): Promise<void>;
}

interface TreeSitterParser {
  setLanguage(lang: TreeSitterLanguage): void;
  parse(code: string): TreeSitterTree;
}

interface TreeSitterLanguageClass {
  load(path: string): Promise<TreeSitterLanguage>;
}

interface TreeSitterLanguage {
  nodeTypeCount: number;
  fields: string[];
}

interface TreeSitterTree {
  rootNode: SyntaxNode;
}

interface SyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
  childForFieldName(name: string): SyntaxNode | null;
  childCount: number;
  namedChildCount: number;
  parent: SyntaxNode | null;
}

// Grammar file name mapping
const GRAMMAR_FILES: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-typescript.wasm", // TS grammar is a superset of JS
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  java: "tree-sitter-java.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  cpp: "tree-sitter-cpp.wasm",
};

// Cached language instances
const languageCache = new Map<string, TreeSitterLanguage>();

// Resolve grammar directory relative to this module.
// In ESM: use import.meta.url; in CJS (esbuild bundle): use __filename.
const _moduleDir: string = _importMetaUrl
  ? dirname(fileURLToPath(_importMetaUrl))
  : typeof __dirname === "string"
    ? __dirname
    : dirname(__filename ?? "");

// In development: src/ast/ → ../../grammars/
// In dist: dist/ast/ → ../../grammars/
// In vscode bundle: out/ → ../grammars/ (but tree-sitter gracefully degrades)
const GRAMMAR_DIR = join(_moduleDir, "..", "..", "grammars");

async function ensureInit(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const mod = require("web-tree-sitter") as TreeSitterModule;
      await mod.Parser.init();
      parserModule = mod;
      return true;
    } catch {
      return false;
    }
  })();
  return initPromise;
}

async function getLanguage(lang: string): Promise<TreeSitterLanguage | null> {
  if (languageCache.has(lang)) return languageCache.get(lang)!;
  const file = GRAMMAR_FILES[lang];
  if (!file) return null;
  try {
    const grammar = await parserModule!.Language.load(join(GRAMMAR_DIR, file));
    languageCache.set(lang, grammar);
    return grammar;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check whether tree-sitter analysis is available for a given language.
 * Must be called (and awaited) before analyzeWithTreeSitter.
 */
export async function isTreeSitterAvailable(lang: string): Promise<boolean> {
  const ready = await ensureInit();
  if (!ready) return false;
  const grammar = await getLanguage(lang);
  return grammar !== null;
}

/**
 * Synchronous readiness check — returns true only if tree-sitter's WASM
 * runtime AND the grammar for `lang` have already been loaded into memory.
 * This is safe to call from synchronous code paths; if the async init
 * hasn't finished yet, it simply returns false and the caller falls back
 * to the structural parser.
 */
export function isTreeSitterReadySync(lang: string): boolean {
  return parserModule !== null && languageCache.has(lang);
}

/**
 * Synchronous tree-sitter analysis. Can ONLY be called when
 * isTreeSitterReadySync(lang) returns true (i.e. parser module and grammar
 * are already loaded). parser.parse() is synchronous in web-tree-sitter
 * once the WASM runtime and grammar are in memory.
 *
 * Returns the same CodeStructure interface as analyzeWithTreeSitter.
 * Throws if preconditions are not met.
 */
export function analyzeWithTreeSitterSync(code: string, language: string): CodeStructure {
  if (!parserModule) throw new Error("Tree-sitter not initialized");
  const grammar = languageCache.get(language);
  if (!grammar) throw new Error(`Tree-sitter grammar for ${language} not loaded`);
  return parseAndAnalyze(code, language, grammar);
}

/**
 * Analyse source code using tree-sitter's real syntax tree.
 * Returns the same CodeStructure interface as the TypeScript and
 * structural parsers — but with much higher precision for non-JS/TS languages.
 *
 * IMPORTANT: Call isTreeSitterAvailable(lang) first. If it returns false,
 * fall back to analyzeStructurally().
 */
export async function analyzeWithTreeSitter(code: string, language: string): Promise<CodeStructure> {
  if (!parserModule) throw new Error("Tree-sitter not initialized");
  const grammar = await getLanguage(language);
  if (!grammar) throw new Error(`Tree-sitter grammar for ${language} not available`);
  return parseAndAnalyze(code, language, grammar);
}

/**
 * Shared parsing + analysis logic used by both sync and async entry points.
 */
function parseAndAnalyze(code: string, language: string, grammar: TreeSitterLanguage): CodeStructure {
  const parser = new parserModule!.Parser();
  parser.setLanguage(grammar);
  const tree = parser.parse(code);
  const root = tree.rootNode;
  const lines = code.split("\n");

  // Extract all analysis data from the tree
  const functions = extractFunctions(root, language);
  const deadCodeLines = detectDeadCode(root, language);
  const deepNestLines = detectDeepNesting(root, language);
  const typeAnyLines = detectWeakTypes(root, language);
  const imports = extractImports(root, language);
  const classes = extractClasses(root, language);

  // Compute file-level metrics
  const fileCyclomaticComplexity = functions.reduce((sum, f) => sum + f.cyclomaticComplexity, 0) || 1;
  const maxNestingDepth = functions.reduce((max, f) => Math.max(max, f.maxNestingDepth), 0);

  return {
    language,
    totalLines: lines.length,
    functions,
    fileCyclomaticComplexity,
    maxNestingDepth,
    deadCodeLines,
    deepNestLines,
    typeAnyLines,
    imports,
    classes: classes.length > 0 ? classes : undefined,
  };
}

// ─── Function Extraction ────────────────────────────────────────────────────

/** Node types that represent function/method definitions per language */
const FUNCTION_NODE_TYPES: Record<string, string[]> = {
  typescript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
    "generator_function_declaration",
    "generator_function",
  ],
  javascript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
    "generator_function_declaration",
    "generator_function",
  ],
  python: ["function_definition"],
  go: ["function_declaration", "method_declaration"],
  rust: ["function_item"],
  java: ["method_declaration", "constructor_declaration"],
  csharp: ["method_declaration", "constructor_declaration", "local_function_statement"],
  cpp: ["function_definition"],
};

function extractFunctions(root: SyntaxNode, language: string): FunctionInfo[] {
  const funcTypes = FUNCTION_NODE_TYPES[language] || [];
  const functions: FunctionInfo[] = [];
  const classRanges = extractClassRanges(root, language);

  walkTree(root, (node) => {
    if (funcTypes.includes(node.type)) {
      const info = analyzeFunctionNode(node, language, classRanges);
      if (info) functions.push(info);
    }
  });

  return functions;
}

interface ClassRange {
  name: string;
  startLine: number;
  endLine: number;
}

function extractClassRanges(root: SyntaxNode, language: string): ClassRange[] {
  const classTypes = CLASS_NODE_TYPES[language] || [];
  const ranges: ClassRange[] = [];

  walkTree(root, (node) => {
    if (classTypes.includes(node.type)) {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        ranges.push({
          name: nameNode.text,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }
  });

  return ranges;
}

function analyzeFunctionNode(node: SyntaxNode, language: string, classRanges: ClassRange[]): FunctionInfo | null {
  // Get function name
  const nameNode = node.childForFieldName("name");
  let name = nameNode?.text || "<anonymous>";

  // C++: name is inside the declarator chain
  // function_definition → declarator (function_declarator) → declarator (identifier / qualified_identifier)
  if (language === "cpp" && name === "<anonymous>") {
    const decl = node.childForFieldName("declarator");
    if (decl) {
      const nameDecl = decl.childForFieldName("declarator");
      if (nameDecl) {
        name = nameDecl.text;
      }
    }
  }

  // TypeScript/JavaScript: arrow functions and function expressions get their
  // name from the parent variable_declarator or property assignment
  if ((language === "typescript" || language === "javascript") && name === "<anonymous>" && node.parent) {
    if (node.parent.type === "variable_declarator") {
      const nameChild = node.parent.childForFieldName("name");
      if (nameChild) name = nameChild.text;
    } else if (node.parent.type === "pair" || node.parent.type === "property_assignment") {
      const key = node.parent.childForFieldName("key");
      if (key) name = key.text;
    }
  }

  // For Go method_declaration, extract receiver type
  if (language === "go" && node.type === "method_declaration") {
    const receiver = node.childForFieldName("receiver");
    if (receiver) {
      // Extract the type from the receiver parameter list
      const typeNode = findFirstByType(receiver, "type_identifier");
      if (typeNode) {
        name = `${typeNode.text}.${name}`;
      }
    }
  }

  // Check if function is inside a class
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const containingClass = classRanges.find((c) => startLine >= c.startLine && endLine <= c.endLine);

  if (containingClass && language !== "go") {
    name = `${containingClass.name}.${name}`;
  }

  // Count parameters
  const paramCount = countParameters(node, language);

  // Compute cyclomatic complexity
  const complexity = computeCyclomaticComplexity(node, language);

  // Compute max nesting depth
  const maxNesting = computeMaxNesting(node, language, 0);

  // Check for decorators (Python, Java, C#)
  const decorators = extractDecorators(node, language);

  // Check for async
  const isAsync = checkIsAsync(node, language);

  const info: FunctionInfo = {
    name,
    startLine,
    endLine,
    lineCount: endLine - startLine + 1,
    parameterCount: paramCount,
    cyclomaticComplexity: complexity,
    maxNestingDepth: maxNesting,
  };

  if (decorators.length > 0) info.decorators = decorators;
  if (containingClass) info.className = containingClass.name;
  if (isAsync) info.isAsync = true;

  return info;
}

// ─── Parameter Counting ─────────────────────────────────────────────────────

function countParameters(funcNode: SyntaxNode, language: string): number {
  let paramsNode: SyntaxNode | null;

  switch (language) {
    case "typescript":
    case "javascript":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter(
        (c) => c.type === "required_parameter" || c.type === "optional_parameter" || c.type === "rest_parameter",
      ).length;

    case "python":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      // Count identifier children, excluding 'self' and 'cls'
      return paramsNode.namedChildren.filter((c) => {
        if (c.type === "identifier" && (c.text === "self" || c.text === "cls")) return false;
        // Also handle typed_parameter, typed_default_parameter, etc.
        if (
          c.type === "identifier" ||
          c.type === "default_parameter" ||
          c.type === "typed_parameter" ||
          c.type === "typed_default_parameter" ||
          c.type === "list_splat_pattern" ||
          c.type === "dictionary_splat_pattern"
        ) {
          // For typed_parameter, check if it's self/cls
          if (c.type === "typed_parameter") {
            const nameChild = c.namedChildren[0];
            if (nameChild && (nameChild.text === "self" || nameChild.text === "cls")) return false;
          }
          return true;
        }
        return false;
      }).length;

    case "go":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter((c) => c.type === "parameter_declaration").length;

    case "rust":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter((c) => c.type === "parameter" || c.type === "self_parameter").length;

    case "java":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter((c) => c.type === "formal_parameter" || c.type === "spread_parameter")
        .length;

    case "csharp":
      paramsNode = funcNode.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter((c) => c.type === "parameter").length;

    case "cpp": {
      // C++: parameters sit inside function_definition → declarator (function_declarator) → parameters
      const declarator = funcNode.childForFieldName("declarator");
      if (!declarator) return 0;
      paramsNode = declarator.childForFieldName("parameters");
      if (!paramsNode) return 0;
      return paramsNode.namedChildren.filter(
        (c) => c.type === "parameter_declaration" || c.type === "variadic_parameter_declaration",
      ).length;
    }

    default:
      return 0;
  }
}

// ─── Cyclomatic Complexity ──────────────────────────────────────────────────
// CC = 1 + number of decision points

const DECISION_NODE_TYPES: Record<string, Set<string>> = {
  typescript: new Set([
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
  ]),
  javascript: new Set([
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
  ]),
  python: new Set([
    "if_statement",
    "elif_clause",
    "for_statement",
    "while_statement",
    "except_clause",
    "conditional_expression",
    "for_in_clause",
    // Boolean operators — each 'and'/'or' is a decision point
    "boolean_operator",
  ]),
  go: new Set(["if_statement", "for_statement", "expression_case", "default_case", "type_case", "communication_case"]),
  rust: new Set(["if_expression", "for_expression", "while_expression", "loop_expression", "match_arm"]),
  java: new Set([
    "if_statement",
    "for_statement",
    "enhanced_for_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "switch_block_statement_group",
    "ternary_expression",
  ]),
  csharp: new Set([
    "if_statement",
    "for_statement",
    "for_each_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "switch_section",
    "conditional_expression",
  ]),
  cpp: new Set([
    "if_statement",
    "for_statement",
    "for_range_loop",
    "while_statement",
    "do_statement",
    "case_statement",
    "catch_clause",
    "conditional_expression",
  ]),
};

function computeCyclomaticComplexity(funcNode: SyntaxNode, language: string): number {
  let complexity = 1; // base path
  const decisionTypes = DECISION_NODE_TYPES[language] || new Set();

  walkTree(funcNode, (node) => {
    if (decisionTypes.has(node.type)) {
      complexity++;
    }
    // Check binary expressions for logical operators (&&, ||)
    if (node.type === "binary_expression") {
      const op = node.children.find((c) => c.type === "&&" || c.type === "||" || c.text === "&&" || c.text === "||");
      if (op) complexity++;
    }
  });

  return complexity;
}

// ─── Nesting Depth ──────────────────────────────────────────────────────────

const NESTING_NODE_TYPES: Record<string, Set<string>> = {
  typescript: new Set([
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_statement",
    "try_statement",
    "arrow_function",
    "function_expression",
  ]),
  javascript: new Set([
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_statement",
    "try_statement",
    "arrow_function",
    "function_expression",
  ]),
  python: new Set([
    "if_statement",
    "for_statement",
    "while_statement",
    "with_statement",
    "try_statement",
    "except_clause",
    "for_in_clause",
    "function_definition",
    "class_definition",
  ]),
  go: new Set([
    "if_statement",
    "for_statement",
    "select_statement",
    "type_switch_statement",
    "expression_switch_statement",
    "func_literal",
  ]),
  rust: new Set([
    "if_expression",
    "for_expression",
    "while_expression",
    "loop_expression",
    "match_expression",
    "closure_expression",
  ]),
  java: new Set([
    "if_statement",
    "for_statement",
    "enhanced_for_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_expression",
    "lambda_expression",
  ]),
  csharp: new Set([
    "if_statement",
    "for_statement",
    "for_each_statement",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_statement",
    "lambda_expression",
  ]),
  cpp: new Set([
    "if_statement",
    "for_statement",
    "for_range_loop",
    "while_statement",
    "do_statement",
    "try_statement",
    "switch_statement",
    "lambda_expression",
  ]),
};

function computeMaxNesting(node: SyntaxNode, language: string, currentDepth: number): number {
  const nestingTypes = NESTING_NODE_TYPES[language] || new Set();
  let maxDepth = currentDepth;

  for (const child of node.namedChildren) {
    let childDepth = currentDepth;
    if (nestingTypes.has(child.type)) {
      childDepth = currentDepth + 1;
      if (childDepth > maxDepth) maxDepth = childDepth;
    }
    const subMax = computeMaxNesting(child, language, childDepth);
    if (subMax > maxDepth) maxDepth = subMax;
  }

  return maxDepth;
}

// ─── Dead Code Detection ────────────────────────────────────────────────────

/** Node types that represent terminal statements (control flow never continues past them) */
const TERMINAL_TYPES: Record<string, Set<string>> = {
  typescript: new Set(["return_statement", "throw_statement", "break_statement", "continue_statement"]),
  javascript: new Set(["return_statement", "throw_statement", "break_statement", "continue_statement"]),
  python: new Set(["return_statement", "raise_statement", "break_statement", "continue_statement"]),
  go: new Set(["return_statement", "break_statement", "continue_statement"]),
  rust: new Set(["return_expression", "break_expression", "continue_expression"]),
  java: new Set(["return_statement", "throw_statement", "break_statement", "continue_statement"]),
  csharp: new Set(["return_statement", "throw_statement", "break_statement", "continue_statement"]),
  cpp: new Set(["return_statement", "throw_statement", "break_statement", "continue_statement"]),
};

/** Node types that represent blocks containing sequential statements */
const BLOCK_TYPES: Record<string, Set<string>> = {
  typescript: new Set(["statement_block"]),
  javascript: new Set(["statement_block"]),
  python: new Set(["block"]),
  go: new Set(["block"]),
  rust: new Set(["block"]),
  java: new Set(["block"]),
  csharp: new Set(["block"]),
  cpp: new Set(["compound_statement"]),
};

function detectDeadCode(root: SyntaxNode, language: string): number[] {
  const deadLines: number[] = [];
  const terminalTypes = TERMINAL_TYPES[language] || new Set();
  const blockTypes = BLOCK_TYPES[language] || new Set();

  walkTree(root, (node) => {
    if (!blockTypes.has(node.type)) return;

    const children = node.namedChildren;
    let foundTerminal = false;

    for (const child of children) {
      if (foundTerminal) {
        // Everything after a terminal statement is dead code
        for (let line = child.startPosition.row + 1; line <= child.endPosition.row + 1; line++) {
          deadLines.push(line);
        }
      }
      // Check if this child IS a terminal or CONTAINS a bare terminal
      // (only direct children, not nested in sub-blocks)
      if (terminalTypes.has(child.type)) {
        foundTerminal = true;
      }
      // For expression_statement wrapping a return (Rust)
      if (child.type === "expression_statement") {
        const expr = child.namedChildren[0];
        if (expr && terminalTypes.has(expr.type)) {
          foundTerminal = true;
        }
      }
    }
  });

  return [...new Set(deadLines)].sort((a, b) => a - b);
}

// ─── Deep Nesting Detection ─────────────────────────────────────────────────

function detectDeepNesting(root: SyntaxNode, language: string): number[] {
  const deepLines: number[] = [];
  const nestingTypes = NESTING_NODE_TYPES[language] || new Set();
  const threshold = 4; // Depth > 4 is "deep"

  function walk(node: SyntaxNode, depth: number): void {
    for (const child of node.namedChildren) {
      let childDepth = depth;
      if (nestingTypes.has(child.type)) {
        childDepth = depth + 1;
      }
      if (childDepth > threshold) {
        // Mark all lines in this deeply-nested node
        for (let line = child.startPosition.row + 1; line <= child.endPosition.row + 1; line++) {
          deepLines.push(line);
        }
      }
      walk(child, childDepth);
    }
  }

  walk(root, 0);
  return [...new Set(deepLines)].sort((a, b) => a - b);
}

// ─── Weak Type Detection ────────────────────────────────────────────────────

const WEAK_TYPE_PATTERNS: Record<string, (node: SyntaxNode) => boolean> = {
  typescript: (node) => {
    // 'any' keyword in type annotations
    if (node.type === "predefined_type" && node.text === "any") return true;
    if (node.type === "type_identifier" && node.text === "any") return true;
    return false;
  },
  javascript: () => false, // JS has no static type annotations
  python: (node) => {
    // typing.Any or just Any in type annotations
    if (node.type === "type" || node.type === "annotation") {
      return node.text.includes("Any");
    }
    return false;
  },
  go: (node) => {
    // interface{} or any keyword
    if (node.type === "interface_type") {
      // Empty interface
      return node.namedChildren.length === 0;
    }
    if (node.type === "type_identifier" && node.text === "any") return true;
    return false;
  },
  rust: (node) => {
    // unsafe blocks and unsafe function declarations
    if (node.type === "unsafe_block") return true;
    // unsafe fn ... — the function_item's text starts with "unsafe"
    if (node.type === "function_item" && node.text.trimStart().startsWith("unsafe ")) return true;
    if (node.type === "type_cast_expression") {
      return node.text.includes("*const") || node.text.includes("*mut");
    }
    return false;
  },
  java: (node) => {
    // Object type, Class<?>
    if (node.type === "type_identifier" && node.text === "Object") return true;
    if (node.type === "generic_type" && node.text.includes("Class<?>")) return true;
    return false;
  },
  csharp: (node) => {
    // dynamic, object
    if (node.type === "predefined_type" && (node.text === "dynamic" || node.text === "object")) {
      return true;
    }
    if (node.type === "identifier" && node.text === "dynamic") return true;
    return false;
  },
  cpp: (node) => {
    // void* pointers (unsafe), auto keyword (type-erased)
    if (node.type === "pointer_declarator") {
      const parent = node.parent;
      if (parent && parent.text.includes("void")) return true;
    }
    if (node.type === "auto" || (node.type === "primitive_type" && node.text === "auto")) return true;
    return false;
  },
};

function detectWeakTypes(root: SyntaxNode, language: string): number[] {
  const weakLines: number[] = [];
  const checker = WEAK_TYPE_PATTERNS[language];
  if (!checker) return weakLines;

  walkTree(root, (node) => {
    if (checker(node)) {
      weakLines.push(node.startPosition.row + 1);
    }
  });

  return [...new Set(weakLines)].sort((a, b) => a - b);
}

// ─── Import Extraction ──────────────────────────────────────────────────────

const IMPORT_NODE_TYPES: Record<string, string[]> = {
  typescript: ["import_statement"],
  javascript: ["import_statement"],
  python: ["import_statement", "import_from_statement"],
  go: ["import_declaration"],
  rust: ["use_declaration"],
  java: ["import_declaration"],
  csharp: ["using_directive"],
  cpp: ["preproc_include"],
};

function extractImports(root: SyntaxNode, language: string): string[] {
  const imports: string[] = [];
  const importTypes = IMPORT_NODE_TYPES[language] || [];

  walkTree(root, (node) => {
    if (!importTypes.includes(node.type)) return;

    switch (language) {
      case "typescript":
      case "javascript":
        // import { foo } from "module"; import "module"; import * as x from "module"
        {
          const source = node.childForFieldName("source");
          if (source) {
            imports.push(source.text.replace(/['"]/g, ""));
          }
        }
        break;

      case "python":
        if (node.type === "import_statement") {
          // import os, import os.path
          for (const child of node.namedChildren) {
            if (child.type === "dotted_name" || child.type === "aliased_import") {
              const name =
                child.type === "aliased_import" ? child.childForFieldName("name")?.text || child.text : child.text;
              if (name) imports.push(name);
            }
          }
        } else if (node.type === "import_from_statement") {
          // from flask import Flask
          const moduleNode = node.childForFieldName("module_name");
          if (moduleNode) imports.push(moduleNode.text);
        }
        break;

      case "go":
        // import "fmt" or import ( "fmt" "net/http" )
        walkTree(node, (child) => {
          if (child.type === "import_spec" || child.type === "interpreted_string_literal") {
            const text = child.text.replace(/"/g, "");
            if (text && text !== "(" && text !== ")") imports.push(text);
          }
        });
        break;

      case "rust":
        // use std::io; use crate::module_name;
        {
          const pathNode = node.namedChildren.find(
            (c) =>
              c.type === "scoped_identifier" ||
              c.type === "identifier" ||
              c.type === "use_wildcard" ||
              c.type === "use_list" ||
              c.type === "scoped_use_list",
          );
          if (pathNode) {
            // Extract the root crate/module name
            const fullPath = pathNode.text;
            const rootModule = fullPath.split("::")[0];
            if (rootModule) imports.push(rootModule);
          }
        }
        break;

      case "java":
        // import com.example.Foo;
        {
          const nameNode = node.namedChildren.find((c) => c.type === "scoped_identifier" || c.type === "identifier");
          if (nameNode) imports.push(nameNode.text);
        }
        break;

      case "csharp":
        // using System.IO;
        {
          const nameNode = node.namedChildren.find((c) => c.type === "qualified_name" || c.type === "identifier");
          if (nameNode) imports.push(nameNode.text);
        }
        break;

      case "cpp":
        // #include <header> or #include "header"
        {
          const pathNode = node.namedChildren.find(
            (c) => c.type === "string_literal" || c.type === "system_lib_string",
          );
          if (pathNode) {
            imports.push(pathNode.text.replace(/[<>"]/g, ""));
          }
        }
        break;
    }
  });

  // TypeScript/JavaScript: also detect require("module") calls
  if (language === "typescript" || language === "javascript") {
    walkTree(root, (node) => {
      if (node.type !== "call_expression") return;
      const fn = node.childForFieldName("function");
      if (!fn || fn.text !== "require") return;
      const args = node.childForFieldName("arguments");
      if (!args) return;
      const firstArg = args.namedChildren[0];
      if (firstArg && (firstArg.type === "string" || firstArg.type === "template_string")) {
        imports.push(firstArg.text.replace(/['"]/g, ""));
      }
    });
  }

  return imports;
}

// ─── Class Extraction ───────────────────────────────────────────────────────

const CLASS_NODE_TYPES: Record<string, string[]> = {
  typescript: ["class_declaration"],
  javascript: ["class_declaration"],
  python: ["class_definition"],
  go: ["type_declaration"],
  rust: ["struct_item", "enum_item"],
  java: ["class_declaration", "interface_declaration", "enum_declaration"],
  csharp: ["class_declaration", "struct_declaration", "interface_declaration", "enum_declaration"],
  cpp: ["class_specifier", "struct_specifier"],
};

function extractClasses(root: SyntaxNode, language: string): string[] {
  const classes: string[] = [];
  const classTypes = CLASS_NODE_TYPES[language] || [];

  walkTree(root, (node) => {
    if (!classTypes.includes(node.type)) return;

    if (language === "go" && node.type === "type_declaration") {
      // Only count struct types:  type Foo struct { ... }
      const spec = node.namedChildren.find((c) => c.type === "type_spec");
      if (spec) {
        const typeBody = spec.childForFieldName("type");
        if (typeBody && typeBody.type === "struct_type") {
          const nameNode = spec.childForFieldName("name");
          if (nameNode) classes.push(nameNode.text);
        }
      }
      return;
    }

    const nameNode = node.childForFieldName("name");
    if (nameNode) classes.push(nameNode.text);
  });

  return classes;
}

// ─── Decorator / Annotation Extraction ──────────────────────────────────────

function extractDecorators(funcNode: SyntaxNode, language: string): string[] {
  const decorators: string[] = [];

  switch (language) {
    case "typescript": {
      // TypeScript decorators are similar to Python
      const parent = funcNode.parent;
      if (parent) {
        for (const child of parent.namedChildren) {
          if (child.type === "decorator" && child.endPosition.row < funcNode.startPosition.row) {
            decorators.push(child.text.replace(/^@/, "").split("(")[0]);
          }
        }
      }
      break;
    }
    case "python": {
      // Decorators are siblings before the function_definition, but in the
      // tree-sitter grammar they're children of a decorated_definition parent.
      const parent = funcNode.parent;
      if (parent && parent.type === "decorated_definition") {
        for (const child of parent.namedChildren) {
          if (child.type === "decorator") {
            // Extract decorator name (without the @)
            const text = child.text.replace(/^@/, "").split("(")[0];
            decorators.push(text);
          }
        }
      }
      break;
    }
    case "java": {
      // Annotations are modifiers before the method
      const modifiers = funcNode.childForFieldName("modifiers") || funcNode.childForFieldName("modifier");
      if (modifiers) {
        for (const child of modifiers.namedChildren) {
          if (child.type === "marker_annotation" || child.type === "annotation") {
            decorators.push(child.text.replace(/^@/, "").split("(")[0]);
          }
        }
      }
      break;
    }
    case "csharp": {
      // Attribute lists before the method
      const parent = funcNode.parent;
      if (parent) {
        for (const child of parent.namedChildren) {
          if (child.type === "attribute_list" && child.endPosition.row < funcNode.startPosition.row) {
            decorators.push(child.text.replace(/[[\]]/g, "").split("(")[0]);
          }
        }
      }
      break;
    }
  }

  return decorators;
}

// ─── Async Detection ────────────────────────────────────────────────────────

function checkIsAsync(funcNode: SyntaxNode, language: string): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
      // async keyword is a direct child of the function node
      return funcNode.children.some((c) => c.type === "async");

    case "python":
      // In Python tree-sitter, async functions have type "function_definition"
      // but the parent is a "decorated_definition" or the text starts with "async"
      return funcNode.text.trimStart().startsWith("async ");

    case "rust":
      // async fn
      return funcNode.text.trimStart().startsWith("async ");

    case "java":
    case "csharp": {
      // Check modifiers for 'async' keyword
      const modifiers = funcNode.childForFieldName("modifiers");
      if (modifiers) {
        return modifiers.children.some((c) => c.text === "async");
      }
      return false;
    }

    default:
      return false;
  }
}

// ─── Tree Walking Helper ────────────────────────────────────────────────────

function walkTree(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
  callback(node);
  for (const child of node.children) {
    walkTree(child, callback);
  }
}

function findFirstByType(node: SyntaxNode, type: string): SyntaxNode | null {
  if (node.type === type) return node;
  for (const child of node.children) {
    const found = findFirstByType(child, type);
    if (found) return found;
  }
  return null;
}
