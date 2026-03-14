/**
 * Finding-diff-highlight — Highlight diff regions related to findings.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDiffHighlight(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-diff-highlight — Highlight findings in diff context

Usage:
  judges finding-diff-highlight --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --diff <path>      Diff file to annotate (optional — uses inline if omitted)
  --context <n>      Lines of context around findings (default: 3)
  --format json      JSON output
  --help, -h         Show this help

Shows findings alongside the code sections they reference.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const diffPath = argv.find((_a: string, i: number) => argv[i - 1] === "--diff");
  const contextStr = argv.find((_a: string, i: number) => argv[i - 1] === "--context");
  const contextLines = contextStr ? parseInt(contextStr, 10) : 3;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  const withLines = findings.filter(
    (f) => f.lineNumbers !== undefined && f.lineNumbers !== null && f.lineNumbers.length > 0,
  );

  // Load diff if provided
  let diffLines: string[] = [];
  if (diffPath && existsSync(diffPath)) {
    diffLines = readFileSync(diffPath, "utf-8").split("\n");
  }

  interface Highlight {
    finding: Finding;
    lines: number[];
    context: { lineNum: number; content: string; isFinding: boolean }[];
  }

  const highlights: Highlight[] = [];

  for (const f of withLines) {
    const fLines = f.lineNumbers || [];
    const ctx: { lineNum: number; content: string; isFinding: boolean }[] = [];

    if (diffLines.length > 0) {
      for (const ln of fLines) {
        const start = Math.max(0, ln - contextLines - 1);
        const end = Math.min(diffLines.length, ln + contextLines);
        for (let i = start; i < end; i++) {
          if (!ctx.some((c) => c.lineNum === i + 1)) {
            ctx.push({ lineNum: i + 1, content: diffLines[i] || "", isFinding: fLines.includes(i + 1) });
          }
        }
      }
      ctx.sort((a, b) => a.lineNum - b.lineNum);
    }

    highlights.push({ finding: f, lines: fLines, context: ctx });
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          totalFindings: findings.length,
          withLineNumbers: withLines.length,
          highlights: highlights.map((h) => ({
            ruleId: h.finding.ruleId,
            title: h.finding.title,
            severity: h.finding.severity,
            lines: h.lines,
            context: h.context,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nDiff Highlights:`);
  console.log("═".repeat(70));
  console.log(`  ${withLines.length} findings with line references (${findings.length} total)`);
  console.log("─".repeat(70));

  for (const h of highlights.slice(0, 15)) {
    console.log(`\n  ⚠ ${h.finding.ruleId || "unknown"} [${(h.finding.severity || "medium").toUpperCase()}]`);
    console.log(`    ${h.finding.title || "Untitled finding"}`);
    console.log(`    Lines: ${h.lines.join(", ")}`);

    if (h.context.length > 0) {
      console.log("");
      for (const c of h.context) {
        const marker = c.isFinding ? ">>>" : "   ";
        console.log(`    ${marker} ${String(c.lineNum).padStart(4)} │ ${c.content}`);
      }
    }
  }

  if (highlights.length > 15) console.log(`\n  ... and ${highlights.length - 15} more findings`);
  console.log("\n" + "═".repeat(70));
}
