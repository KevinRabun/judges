/**
 * Finding-context-window — Show findings with surrounding code context.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContextResult {
  ruleId: string;
  title: string;
  severity: string;
  lines: number[];
  context: Array<{ lineNumber: number; code: string; isFinding: boolean }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildContext(verdict: TribunalVerdict, sourceFile: string, windowSize: number): ContextResult[] {
  const source = readFileSync(sourceFile, "utf-8");
  const sourceLines = source.split("\n");
  const results: ContextResult[] = [];

  for (const f of verdict.findings) {
    const lineNums = f.lineNumbers || [];
    if (lineNums.length === 0) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        lines: [],
        context: [],
      });
      continue;
    }

    const contextLines: Array<{ lineNumber: number; code: string; isFinding: boolean }> = [];
    const addedLines = new Set<number>();

    for (const ln of lineNums) {
      const start = Math.max(1, ln - windowSize);
      const end = Math.min(sourceLines.length, ln + windowSize);

      for (let i = start; i <= end; i++) {
        if (addedLines.has(i)) continue;
        addedLines.add(i);
        contextLines.push({
          lineNumber: i,
          code: sourceLines[i - 1],
          isFinding: lineNums.includes(i),
        });
      }
    }

    contextLines.sort((a, b) => a.lineNumber - b.lineNumber);

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      lines: lineNums,
      context: contextLines,
    });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingContextWindow(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const windowIdx = argv.indexOf("--window");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const windowSize = windowIdx >= 0 ? parseInt(argv[windowIdx + 1], 10) : 3;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-context-window — Show findings with code context

Usage:
  judges finding-context-window --file <verdict.json> --source <src.ts>
                                [--window <n>] [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file for context (required)
  --window <n>       Context lines before/after (default: 3)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!sourceFile) {
    console.error("Error: --source required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(sourceFile)) {
    console.error(`Error: not found: ${sourceFile}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const results = buildContext(verdict, sourceFile, windowSize);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nFinding Context (${results.length} findings, window=${windowSize})`);

  for (const r of results) {
    console.log("\n" + "═".repeat(70));
    console.log(`[${r.severity}] ${r.ruleId}: ${r.title}`);

    if (r.context.length === 0) {
      console.log("  (no line number data)");
      continue;
    }

    console.log("─".repeat(70));
    for (const c of r.context) {
      const marker = c.isFinding ? ">>>" : "   ";
      const lineStr = String(c.lineNumber).padStart(5);
      console.log(`${marker} ${lineStr} | ${c.code}`);
    }
  }

  console.log("\n" + "═".repeat(70));
}
