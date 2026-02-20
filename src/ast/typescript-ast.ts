// ─────────────────────────────────────────────────────────────────────────────
// TypeScript / JavaScript AST Analysis
// ─────────────────────────────────────────────────────────────────────────────
// Uses the TypeScript compiler API to parse JS/TS source into a real AST and
// extract structural metrics: cyclomatic complexity, nesting depth, function
// length, dead code, parameter count, type-safety issues, and more.
// ─────────────────────────────────────────────────────────────────────────────

import ts from "typescript";
import type { FunctionInfo, CodeStructure } from "./types.js";

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse JS/TS source code using the TypeScript compiler and extract
 * structural metrics.
 */
export function analyzeTypeScript(
  code: string,
  language: "javascript" | "typescript"
): CodeStructure {
  const scriptKind =
    language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    "input." + (language === "typescript" ? "ts" : "js"),
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind
  );

  const functions: FunctionInfo[] = [];
  const deadCodeLines: number[] = [];
  const deepNestLines: number[] = [];
  const typeAnyLines: number[] = [];
  const totalLines = code.split("\n").length;

  // Walk the AST
  visitNode(sourceFile, 0, sourceFile, functions, deadCodeLines, deepNestLines, typeAnyLines);

  // Compute file-level cyclomatic complexity
  const fileCyclomaticComplexity = functions.reduce(
    (sum, f) => sum + f.cyclomaticComplexity,
    0
  ) || 1;

  const maxNestingDepth = functions.reduce(
    (max, f) => Math.max(max, f.maxNestingDepth),
    0
  );

  return {
    language,
    totalLines,
    functions,
    fileCyclomaticComplexity,
    maxNestingDepth,
    deadCodeLines,
    deepNestLines,
    typeAnyLines,
  };
}

// ─── AST Walker ──────────────────────────────────────────────────────────────

function visitNode(
  node: ts.Node,
  depth: number,
  sourceFile: ts.SourceFile,
  functions: FunctionInfo[],
  deadCodeLines: number[],
  deepNestLines: number[],
  typeAnyLines: number[]
): void {
  // Track deep nesting (depth > 4 for block-level nodes)
  if (isBlockLike(node) && depth > 4) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    deepNestLines.push(line);
  }

  // Detect function-like declarations
  if (isFunctionLike(node)) {
    const info = analyzeFunctionNode(node, sourceFile);
    functions.push(info);
  }

  // Detect dead code: statements after return/throw/break/continue in a block
  if (ts.isBlock(node)) {
    const stmts = node.statements;
    let unreachable = false;
    for (const stmt of stmts) {
      if (unreachable) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
        deadCodeLines.push(line);
      }
      if (
        ts.isReturnStatement(stmt) ||
        ts.isThrowStatement(stmt) ||
        ts.isBreakStatement(stmt) ||
        ts.isContinueStatement(stmt)
      ) {
        unreachable = true;
      }
    }
  }

  // Detect 'any' type annotations
  if (ts.isTypeReferenceNode(node)) {
    const typeName = node.getText(sourceFile);
    if (typeName === "any") {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      typeAnyLines.push(line);
    }
  }
  if (node.kind === ts.SyntaxKind.AnyKeyword) {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    typeAnyLines.push(line);
  }

  // Recurse into children
  const childDepth = isBlockLike(node) ? depth + 1 : depth;
  ts.forEachChild(node, (child) =>
    visitNode(child, childDepth, sourceFile, functions, deadCodeLines, deepNestLines, typeAnyLines)
  );
}

// ─── Function Analysis ───────────────────────────────────────────────────────

function analyzeFunctionNode(
  node: ts.Node,
  sourceFile: ts.SourceFile
): FunctionInfo {
  const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  const startLine = startPos.line + 1;
  const endLine = endPos.line + 1;
  const lineCount = endLine - startLine + 1;

  const name = getFunctionName(node) || "<anonymous>";
  const paramCount = getFunctionParameterCount(node);
  const complexity = computeCyclomaticComplexity(node);
  const maxNesting = computeMaxNesting(node, 0);

  return {
    name,
    startLine,
    endLine,
    lineCount,
    parameterCount: paramCount,
    cyclomaticComplexity: complexity,
    maxNestingDepth: maxNesting,
  };
}

function getFunctionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name?.getText();
  }
  if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  if (
    ts.isPropertyAssignment(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  if (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent)) {
    const decl = node.parent;
    if (ts.isIdentifier(decl.name)) return decl.name.text;
  }
  return undefined;
}

function getFunctionParameterCount(node: ts.Node): number {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return node.parameters.length;
  }
  return 0;
}

// ─── Cyclomatic Complexity ───────────────────────────────────────────────────
// CC = 1 + number of decision points (if, for, while, case, &&, ||, ?:, catch)

function computeCyclomaticComplexity(node: ts.Node): number {
  let complexity = 1; // base path

  function walk(n: ts.Node): void {
    switch (n.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression: // ternary ?:
        complexity++;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const binOp = (n as ts.BinaryExpression).operatorToken.kind;
        if (
          binOp === ts.SyntaxKind.AmpersandAmpersandToken ||
          binOp === ts.SyntaxKind.BarBarToken ||
          binOp === ts.SyntaxKind.QuestionQuestionToken
        ) {
          complexity++;
        }
        break;
      }
    }
    ts.forEachChild(n, walk);
  }

  ts.forEachChild(node, walk);
  return complexity;
}

// ─── Nesting Depth ───────────────────────────────────────────────────────────

function computeMaxNesting(node: ts.Node, currentDepth: number): number {
  let maxDepth = currentDepth;

  function walk(n: ts.Node, depth: number): void {
    let newDepth = depth;
    if (isNestingNode(n)) {
      newDepth = depth + 1;
      if (newDepth > maxDepth) maxDepth = newDepth;
    }
    ts.forEachChild(n, (child) => walk(child, newDepth));
  }

  ts.forEachChild(node, (child) => walk(child, currentDepth));
  return maxDepth;
}

function isNestingNode(node: ts.Node): boolean {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.SwitchStatement:
    case ts.SyntaxKind.TryStatement:
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.FunctionExpression:
      return true;
    default:
      return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isBlockLike(node: ts.Node): boolean {
  return (
    ts.isBlock(node) ||
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node)
  );
}
