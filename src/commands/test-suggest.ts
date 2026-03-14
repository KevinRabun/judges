/**
 * Test suggest — analyze AI-generated code and suggest specific
 * test scenarios (edge cases, error paths, boundary conditions)
 * that the code likely missed.
 *
 * All analysis local.
 */

import { existsSync, readFileSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TestSuggestion {
  category: string;
  description: string;
  priority: "high" | "medium" | "low";
  targetLine?: number;
  testCode?: string;
}

interface FunctionInfo {
  name: string;
  line: number;
  params: string[];
  hasReturn: boolean;
  isAsync: boolean;
  body: string;
}

// ─── Function extraction ────────────────────────────────────────────────────

function extractFunctions(content: string, lines: string[]): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const fnPatterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/g,
    /(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*{/g,
  ];

  for (const pattern of fnPatterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const lineIdx = content.substring(0, m.index).split("\n").length;
      const name = m[1];
      const params = (m[2] || m[3] || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      // Extract rough function body
      let braceCount = 0;
      let bodyStart = -1;
      let bodyEnd = -1;
      for (let i = lineIdx - 1; i < lines.length; i++) {
        if (lines[i].includes("{") && bodyStart === -1) bodyStart = i;
        braceCount += (lines[i].match(/{/g) || []).length;
        braceCount -= (lines[i].match(/}/g) || []).length;
        if (bodyStart !== -1 && braceCount <= 0) {
          bodyEnd = i;
          break;
        }
      }

      const body = bodyStart >= 0 && bodyEnd >= 0 ? lines.slice(bodyStart, bodyEnd + 1).join("\n") : "";
      const hasReturn = /\breturn\b/.test(body);
      const isAsync = /\basync\b/.test(m[0]);

      functions.push({ name, line: lineIdx, params, hasReturn, isAsync, body });
    }
  }

  // Deduplicate by name and line
  const seen = new Set<string>();
  return functions.filter((f) => {
    const key = `${f.name}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Test suggestion generators ─────────────────────────────────────────────

function suggestTests(fn: FunctionInfo, _content: string): TestSuggestion[] {
  const suggestions: TestSuggestion[] = [];

  // 1. Null/undefined parameter tests
  for (const param of fn.params) {
    const paramName = param.split(/[:=]/)[0].trim().replace(/[?!]/g, "");
    if (paramName) {
      suggestions.push({
        category: "Null Input",
        description: `Test ${fn.name}() with ${paramName} = null/undefined`,
        priority: "high",
        targetLine: fn.line,
        testCode: `it("should handle null ${paramName}", () => { expect(() => ${fn.name}(${fn.params.map((p) => (p.split(/[:=]/)[0].trim() === paramName ? "null" : "'valid'")).join(", ")})).not.toThrow(); });`,
      });
    }
  }

  // 2. Empty input tests
  if (fn.params.length > 0) {
    suggestions.push({
      category: "Empty Input",
      description: `Test ${fn.name}() with empty string/array/object inputs`,
      priority: "high",
      targetLine: fn.line,
    });
  }

  // 3. Error path tests
  if (/\bthrow\b/.test(fn.body)) {
    suggestions.push({
      category: "Error Path",
      description: `Test error throwing conditions in ${fn.name}()`,
      priority: "high",
      targetLine: fn.line,
    });
  }

  // 4. Async error handling
  if (fn.isAsync) {
    suggestions.push({
      category: "Async Error",
      description: `Test ${fn.name}() with rejected promises and timeout scenarios`,
      priority: "high",
      targetLine: fn.line,
    });

    if (/\bawait\b/.test(fn.body) && !/\btry\s*{/.test(fn.body)) {
      suggestions.push({
        category: "Unhandled Rejection",
        description: `${fn.name}() has await without try/catch — test rejection behavior`,
        priority: "high",
        targetLine: fn.line,
      });
    }
  }

  // 5. Boundary conditions
  if (/\b(?:length|size|count|index|i|j)\b/.test(fn.body)) {
    suggestions.push({
      category: "Boundary",
      description: `Test ${fn.name}() with boundary values (0, -1, MAX_SAFE_INTEGER, empty collection)`,
      priority: "medium",
      targetLine: fn.line,
    });
  }

  // 6. Type coercion
  if (/\b(?:parseInt|parseFloat|Number\(|String\(|\.toString\()/.test(fn.body)) {
    suggestions.push({
      category: "Type Coercion",
      description: `Test ${fn.name}() with unexpected types (NaN, Infinity, "not a number")`,
      priority: "medium",
      targetLine: fn.line,
    });
  }

  // 7. Regular expression edge cases
  if (/new\s+RegExp|\/[^/]+\/[gimsuy]*/.test(fn.body)) {
    suggestions.push({
      category: "Regex Edge Case",
      description: `Test ${fn.name}() with regex edge cases (empty string, special characters, very long input)`,
      priority: "medium",
      targetLine: fn.line,
    });
  }

  // 8. File/IO operations
  if (/\bread(?:File|dir)|write(?:File)|open|close|exists/.test(fn.body)) {
    suggestions.push({
      category: "File IO",
      description: `Test ${fn.name}() with missing files, permission errors, and empty files`,
      priority: "high",
      targetLine: fn.line,
    });
  }

  // 9. State mutation
  if (/\.push\(|\.splice\(|\.pop\(|\.shift\(|delete\s/.test(fn.body)) {
    suggestions.push({
      category: "State Mutation",
      description: `Test ${fn.name}() for unintended side effects on input data`,
      priority: "medium",
      targetLine: fn.line,
    });
  }

  // 10. Return value consistency
  if (fn.hasReturn) {
    const returnCount = (fn.body.match(/\breturn\b/g) || []).length;
    if (returnCount > 2) {
      suggestions.push({
        category: "Return Consistency",
        description: `${fn.name}() has ${returnCount} return paths — test each returns consistent type`,
        priority: "medium",
        targetLine: fn.line,
      });
    }
  }

  return suggestions;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTestSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges test-suggest — Suggest test scenarios for AI-generated code

Usage:
  judges test-suggest <file>
  judges test-suggest src/service.ts --priority high
  judges test-suggest handler.js --format json

Options:
  --priority <level>  Filter by priority (high, medium, low)
  --function <name>   Focus on a specific function
  --format json       JSON output
  --help, -h          Show this help

Categories: Null Input, Empty Input, Error Path, Async Error,
Boundary, Type Coercion, Regex Edge Case, File IO,
State Mutation, Return Consistency
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const priorityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--priority");
  const fnFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--function");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));

  if (!target || !existsSync(target)) {
    console.error("  Please provide a valid source file");
    return;
  }

  let content: string;
  try {
    content = readFileSync(target, "utf-8");
  } catch {
    console.error(`  Cannot read: ${target}`);
    return;
  }

  const lines = content.split("\n");
  let functions = extractFunctions(content, lines);

  if (fnFilter) {
    functions = functions.filter((f) => f.name === fnFilter);
    if (functions.length === 0) {
      console.error(`  Function not found: ${fnFilter}`);
      return;
    }
  }

  let allSuggestions: Array<TestSuggestion & { functionName: string }> = [];
  for (const fn of functions) {
    const suggestions = suggestTests(fn, content);
    allSuggestions.push(...suggestions.map((s) => ({ ...s, functionName: fn.name })));
  }

  if (priorityFilter) {
    allSuggestions = allSuggestions.filter((s) => s.priority === priorityFilter);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        { file: target, functions: functions.length, suggestions: allSuggestions, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    console.log(`\n  Test Suggestions for ${target}`);
    console.log(
      `  Functions: ${functions.length} | Suggestions: ${allSuggestions.length}\n  ──────────────────────────`,
    );

    if (allSuggestions.length === 0) {
      console.log(`    No test suggestions generated.\n`);
      return;
    }

    for (const priority of ["high", "medium", "low"]) {
      const items = allSuggestions.filter((s) => s.priority === priority);
      if (items.length === 0) continue;
      console.log(`\n    ${priority.toUpperCase()} PRIORITY (${items.length})`);
      for (const s of items) {
        console.log(`      [${s.category}] ${s.functionName}() — ${s.description}`);
        if (s.testCode) {
          console.log(`        Code: ${s.testCode.substring(0, 100)}${s.testCode.length > 100 ? "..." : ""}`);
        }
      }
    }
    console.log("");
  }
}
