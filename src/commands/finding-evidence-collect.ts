/**
 * Finding-evidence-collect — Collect evidence for findings from source files.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvidenceItem {
  ruleId: string;
  title: string;
  severity: string;
  lineNumbers: number[];
  codeSnippet: string;
  recommendation: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function collectEvidence(verdict: TribunalVerdict, sourceFile?: string): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  let sourceLines: string[] = [];

  if (sourceFile && existsSync(sourceFile)) {
    sourceLines = readFileSync(sourceFile, "utf-8").split("\n");
  }

  for (const f of verdict.findings) {
    const lines = f.lineNumbers || [];
    let snippet = "";

    if (sourceLines.length > 0 && lines.length > 0) {
      const contextLines = 2;
      const startLine = Math.max(0, lines[0] - 1 - contextLines);
      const endLine = Math.min(sourceLines.length, lines[lines.length - 1] + contextLines);
      snippet = sourceLines
        .slice(startLine, endLine)
        .map((l, i) => {
          const lineNum = startLine + i + 1;
          const marker = lines.includes(lineNum) ? ">>>" : "   ";
          return `${marker} ${String(lineNum).padStart(4)}: ${l}`;
        })
        .join("\n");
    }

    items.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      lineNumbers: lines,
      codeSnippet: snippet,
      recommendation: f.recommendation,
    });
  }

  return items;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingEvidenceCollect(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const ruleFilter = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-evidence-collect — Collect evidence for findings

Usage:
  judges finding-evidence-collect --file <verdict.json> [--source <src.ts>]
                                  [--rule <id>] [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file for code snippets
  --rule <id>        Filter by rule ID
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
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
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

  let items = collectEvidence(verdict, sourceFile);
  if (ruleFilter) {
    items = items.filter((i) => i.ruleId.includes(ruleFilter));
  }

  if (format === "json") {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  console.log(`\nEvidence Collection (${items.length} findings)`);
  console.log("═".repeat(70));

  for (const item of items) {
    console.log(`\n  [${item.severity.toUpperCase()}] ${item.ruleId}: ${item.title}`);
    if (item.lineNumbers.length > 0) {
      console.log(`  Lines: ${item.lineNumbers.join(", ")}`);
    }
    if (item.codeSnippet) {
      console.log("  Code:");
      for (const line of item.codeSnippet.split("\n").slice(0, 8)) {
        console.log(`    ${line}`);
      }
      const snippetLines = item.codeSnippet.split("\n").length;
      if (snippetLines > 8) {
        console.log(`    ... +${snippetLines - 8} more lines`);
      }
    }
    console.log(`  Recommendation: ${item.recommendation.slice(0, 80)}`);
    console.log("  " + "─".repeat(65));
  }
  console.log("═".repeat(70));
}
