// ─────────────────────────────────────────────────────────────────────────────
// AST Analysis Types
// ─────────────────────────────────────────────────────────────────────────────
// Shared types returned by both the TypeScript compiler-based parser and the
// lightweight structural parser for other languages.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structural information about a single function/method.
 */
export interface FunctionInfo {
  /** Function/method name (or "<anonymous>") */
  name: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Total line count including signature */
  lineCount: number;
  /** Number of parameters */
  parameterCount: number;
  /** McCabe cyclomatic complexity */
  cyclomaticComplexity: number;
  /** Maximum nesting depth within the function */
  maxNestingDepth: number;
  /** Decorators applied to the function/method (Python, Java, C#). Empty for languages without decorators. */
  decorators?: string[];
  /** Class name if this is a method */
  className?: string;
  /** Whether this function is async */
  isAsync?: boolean;
}

/**
 * Structural analysis result for a source file.
 */
export interface CodeStructure {
  /** Detected language */
  language: string;
  /** Total lines in the file */
  totalLines: number;
  /** All functions/methods found */
  functions: FunctionInfo[];
  /** File-level cyclomatic complexity (sum of all functions) */
  fileCyclomaticComplexity: number;
  /** Maximum nesting depth across all functions */
  maxNestingDepth: number;
  /** Line numbers containing dead/unreachable code */
  deadCodeLines: number[];
  /** Line numbers with nesting depth > 4 */
  deepNestLines: number[];
  /** Line numbers with type-safety issues (e.g., `any` usage) */
  typeAnyLines: number[];
  /** Imported module/package names (e.g., "express", "helmet", "DOMPurify") */
  imports: string[];
  /** Class names discovered in the file (Python, Java, C#, etc.) */
  classes?: string[];
}
