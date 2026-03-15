/**
 * Finding-context-enrich — Enrich findings with surrounding code context and metadata.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichedFinding {
  ruleId: string;
  title: string;
  severity: string;
  description: string;
  recommendation: string;
  codeSnippet: string[];
  lineStart: number;
  lineEnd: number;
  contextLines: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractContext(
  filePath: string,
  lineNumbers: number[],
  contextSize: number,
): { snippet: string[]; start: number; end: number } {
  if (!existsSync(filePath)) {
    return { snippet: [], start: 0, end: 0 };
  }
  const lines = readFileSync(filePath, "utf-8").split("\n");
  if (lineNumbers.length === 0) {
    return { snippet: [], start: 0, end: 0 };
  }
  const minLine = Math.max(0, Math.min(...lineNumbers) - 1 - contextSize);
  const maxLine = Math.min(lines.length, Math.max(...lineNumbers) + contextSize);
  return {
    snippet: lines.slice(minLine, maxLine),
    start: minLine + 1,
    end: maxLine,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingContextEnrich(argv: string[]): void {
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const fileIdx = argv.indexOf("--file");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : "";
  const contextIdx = argv.indexOf("--context");
  const contextSize = contextIdx >= 0 ? parseInt(argv[contextIdx + 1], 10) : 3;
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-context-enrich — Enrich findings with code context

Usage:
  judges finding-context-enrich --findings <path> --file <path> [--context <n>] [--format table|json]

Options:
  --findings <path>  Path to findings JSON file
  --file <path>      Source file to extract context from
  --context <n>      Lines of context around findings (default: 3)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!findingsPath || !existsSync(findingsPath)) {
    console.error("Provide --findings <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
  const enriched: EnrichedFinding[] = [];

  for (const f of findings) {
    const lineNumbers = f.lineNumbers ?? [];
    const ctx = filePath ? extractContext(filePath, lineNumbers, contextSize) : { snippet: [], start: 0, end: 0 };
    enriched.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      description: f.description,
      recommendation: f.recommendation,
      codeSnippet: ctx.snippet,
      lineStart: ctx.start,
      lineEnd: ctx.end,
      contextLines: contextSize,
    });
  }

  if (format === "json") {
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }

  console.log(`\nEnriched Findings (${enriched.length})`);
  console.log("═".repeat(80));

  for (const e of enriched) {
    console.log(`\n  [${e.severity.toUpperCase()}] ${e.ruleId}: ${e.title}`);
    console.log(`  ${e.description}`);
    console.log(`  Recommendation: ${e.recommendation}`);

    if (e.codeSnippet.length > 0) {
      console.log(`  Code (lines ${e.lineStart}–${e.lineEnd}):`);
      for (let i = 0; i < e.codeSnippet.length; i++) {
        console.log(`    ${String(e.lineStart + i).padStart(4)} | ${e.codeSnippet[i]}`);
      }
    }
    console.log("  " + "─".repeat(75));
  }

  console.log("═".repeat(80));
}
