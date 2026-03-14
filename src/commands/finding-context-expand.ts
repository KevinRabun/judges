/**
 * Finding-context-expand — Expand finding context with surrounding source code.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingContextExpand(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-context-expand — Expand finding context

Usage:
  judges finding-context-expand --file <results.json> --source <path> [options]

Options:
  --file <path>      Result file (required)
  --source <path>    Source file to read context from (required)
  --lines <n>        Lines of context above/below (default: 5)
  --rule <ruleId>    Filter to specific rule
  --format json      JSON output
  --help, -h         Show this help

Shows findings with expanded source code context.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const source = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const linesStr = argv.find((_a: string, i: number) => argv[i - 1] === "--lines");
  const rule = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const contextLines = linesStr ? parseInt(linesStr, 10) : 5;

  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!source) {
    console.error("Error: --source required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(source)) {
    console.error(`Error: source not found: ${source}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const sourceLines = readFileSync(source, "utf-8").split("\n");

  let findings: Finding[] = verdict.findings || [];
  if (rule) findings = findings.filter((f) => f.ruleId === rule);

  const withLines = findings.filter(
    (f) => f.lineNumbers !== undefined && f.lineNumbers !== null && f.lineNumbers.length > 0,
  );

  interface ExpandedFinding {
    ruleId: string;
    title: string;
    severity: string;
    context: { lineNum: number; content: string; isFinding: boolean }[];
  }

  const expanded: ExpandedFinding[] = [];

  for (const f of withLines) {
    const fLines = f.lineNumbers || [];
    const ctx: { lineNum: number; content: string; isFinding: boolean }[] = [];

    for (const ln of fLines) {
      const start = Math.max(0, ln - contextLines - 1);
      const end = Math.min(sourceLines.length, ln + contextLines);
      for (let i = start; i < end; i++) {
        if (!ctx.some((c) => c.lineNum === i + 1)) {
          ctx.push({ lineNum: i + 1, content: sourceLines[i] || "", isFinding: fLines.includes(i + 1) });
        }
      }
    }
    ctx.sort((a, b) => a.lineNum - b.lineNum);
    expanded.push({ ruleId: f.ruleId, title: f.title, severity: f.severity, context: ctx });
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, expanded: expanded.length, findings: expanded }, null, 2));
    return;
  }

  console.log(`\nExpanded Context:`);
  console.log("═".repeat(70));
  console.log(`  ${expanded.length} findings with line context from ${source}`);
  console.log("─".repeat(70));

  for (const e of expanded.slice(0, 10)) {
    console.log(`\n  ${e.ruleId} [${(e.severity || "medium").toUpperCase()}]`);
    console.log(`    ${e.title}`);
    console.log("");
    for (const c of e.context) {
      const marker = c.isFinding ? ">>>" : "   ";
      console.log(`    ${marker} ${String(c.lineNum).padStart(4)} │ ${c.content}`);
    }
  }

  if (expanded.length > 10) console.log(`\n  ... and ${expanded.length - 10} more`);
  console.log("\n" + "═".repeat(70));
}
