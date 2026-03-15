/**
 * Finding-code-context — Show surrounding code context for each finding.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FindingWithContext {
  ruleId: string;
  severity: string;
  title: string;
  lineNumbers: number[];
  context: string[];
  recommendation: string;
}

function extractContext(sourceFile: string, lineNumbers: number[], contextLines: number): string[] {
  if (!existsSync(sourceFile)) {
    return [`(source file not found: ${sourceFile})`];
  }

  const allLines = readFileSync(sourceFile, "utf-8").split("\n");
  const result: string[] = [];

  for (const ln of lineNumbers) {
    const start = Math.max(0, ln - contextLines - 1);
    const end = Math.min(allLines.length, ln + contextLines);
    result.push(`--- Line ${ln} ---`);
    for (let i = start; i < end; i++) {
      const marker = i === ln - 1 ? ">>>" : "   ";
      result.push(`${marker} ${String(i + 1).padStart(4)}: ${allLines[i]}`);
    }
  }

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCodeContext(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const linesIdx = argv.indexOf("--context-lines");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const contextLines = linesIdx >= 0 ? parseInt(argv[linesIdx + 1], 10) : 3;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-code-context — Show code context for findings

Usage:
  judges finding-code-context --file <review.json> --source <file>
                              [--context-lines <n>] [--format table|json]

Options:
  --file <path>         Review result JSON file
  --source <file>       Original source code file
  --context-lines <n>   Lines of context around finding (default: 3)
  --format <fmt>        Output format: table (default), json
  --help, -h            Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings.filter((f) => f.lineNumbers !== undefined && f.lineNumbers.length > 0);

  const result: FindingWithContext[] = findings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    lineNumbers: f.lineNumbers !== undefined ? f.lineNumbers : [],
    context: sourceFile
      ? extractContext(sourceFile, f.lineNumbers !== undefined ? f.lineNumbers : [], contextLines)
      : ["(no --source provided)"],
    recommendation: f.recommendation,
  }));

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nCode Context: ${result.length} finding(s) with line references`);
  console.log("═".repeat(70));

  for (const item of result) {
    console.log(`\n── ${item.ruleId} [${item.severity}] ──`);
    console.log(`  ${item.title}`);
    if (item.context.length > 0) {
      for (const line of item.context) {
        console.log(`  ${line}`);
      }
    }
    console.log(`  Fix: ${item.recommendation}`);
  }

  console.log("\n" + "═".repeat(70));
}
