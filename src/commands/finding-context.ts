/**
 * Finding-context — Enrich findings with surrounding code context.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichedFinding {
  ruleId: string;
  title: string;
  severity: string;
  lineNumbers: number[];
  contextBefore: string[];
  contextAfter: string[];
  codeAtLine: string[];
  recommendation: string;
}

interface ContextReport {
  timestamp: string;
  sourceFile: string;
  totalFindings: number;
  enriched: EnrichedFinding[];
}

// ─── Context Extraction ─────────────────────────────────────────────────────

function extractContext(
  fileContent: string,
  lineNumbers: number[],
  contextSize: number,
): { before: string[]; after: string[]; atLine: string[] } {
  const lines = fileContent.split("\n");
  if (lineNumbers.length === 0) {
    return { before: [], after: [], atLine: [] };
  }

  const minLine = Math.min(...lineNumbers);
  const maxLine = Math.max(...lineNumbers);

  const beforeStart = Math.max(0, minLine - 1 - contextSize);
  const beforeEnd = Math.max(0, minLine - 1);
  const afterStart = Math.min(lines.length, maxLine);
  const afterEnd = Math.min(lines.length, maxLine + contextSize);

  return {
    before: lines.slice(beforeStart, beforeEnd),
    after: lines.slice(afterStart, afterEnd),
    atLine: lineNumbers.map((n) => lines[n - 1] || "").filter(Boolean),
  };
}

function enrichFinding(finding: Finding, fileContent: string, contextSize: number): EnrichedFinding {
  const lineNumbers = finding.lineNumbers || [];
  const ctx = extractContext(fileContent, lineNumbers, contextSize);

  return {
    ruleId: finding.ruleId || "unknown",
    title: finding.title || "",
    severity: finding.severity || "medium",
    lineNumbers,
    contextBefore: ctx.before,
    contextAfter: ctx.after,
    codeAtLine: ctx.atLine,
    recommendation: finding.recommendation || "",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingContext(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-context — Enrich findings with surrounding code context

Usage:
  judges finding-context --verdict report.json --source src/api.ts
  judges finding-context --verdict report.json --source src/api.ts --context 10

Options:
  --verdict <path>      Path to a tribunal verdict JSON file
  --source <path>       Source file to extract context from
  --context <n>         Number of context lines (default: 5)
  --format json         JSON output
  --help, -h            Show this help

Shows each finding alongside the surrounding source code, making it
easier to understand the issue without switching to an editor.

Report saved to .judges/finding-context.json.
`);
    return;
  }

  const verdictPath = argv.find((_a: string, i: number) => argv[i - 1] === "--verdict");
  const sourcePath = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const contextSize = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--context") || "5", 10);
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!verdictPath || !existsSync(verdictPath)) {
    console.error("Error: --verdict is required and must exist.");
    process.exitCode = 1;
    return;
  }

  if (!sourcePath || !existsSync(sourcePath)) {
    console.error("Error: --source is required and must exist.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(verdictPath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Could not parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const fileContent = readFileSync(sourcePath, "utf-8");
  const findings = verdict.findings || [];

  if (findings.length === 0) {
    console.log("No findings to enrich.");
    return;
  }

  const enriched = findings.map((f) => enrichFinding(f, fileContent, contextSize));

  const report: ContextReport = {
    timestamp: new Date().toISOString(),
    sourceFile: sourcePath,
    totalFindings: enriched.length,
    enriched,
  };

  const outPath = join(".judges", "finding-context.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nFinding Context (±${contextSize} lines):`);
  console.log("═".repeat(70));
  console.log(`  Source: ${sourcePath}  Findings: ${enriched.length}`);
  console.log("═".repeat(70));

  for (const ef of enriched) {
    console.log(`\n  [${ef.severity.toUpperCase()}] ${ef.ruleId}`);
    console.log(`  ${ef.title}`);
    if (ef.lineNumbers.length > 0) {
      console.log(`  Lines: ${ef.lineNumbers.join(", ")}`);
    }

    if (ef.contextBefore.length > 0) {
      console.log("  ┌─ context before ─");
      for (const l of ef.contextBefore) {
        console.log(`  │ ${l}`);
      }
    }

    if (ef.codeAtLine.length > 0) {
      console.log("  ├─ finding ─");
      for (const l of ef.codeAtLine) {
        console.log(`  │ ➤ ${l}`);
      }
    }

    if (ef.contextAfter.length > 0) {
      console.log("  ├─ context after ─");
      for (const l of ef.contextAfter) {
        console.log(`  │ ${l}`);
      }
      console.log("  └─");
    }

    if (ef.recommendation) {
      console.log(`  Fix: ${ef.recommendation}`);
    }
  }
  console.log("\n" + "═".repeat(70));
  console.log(`  Report saved to ${outPath}`);
}
