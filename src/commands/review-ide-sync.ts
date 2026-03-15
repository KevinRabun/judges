/**
 * Review-ide-sync — Sync review results to IDE-compatible formats.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Output Formats ─────────────────────────────────────────────────────────

interface IdeDiagnostic {
  file: string;
  line: number;
  severity: string;
  message: string;
  source: string;
  code: string;
}

function toVscodeDiagnostics(findings: Finding[], sourceFile: string): IdeDiagnostic[] {
  return findings.map((f) => ({
    file: sourceFile,
    line: f.lineNumbers !== undefined && f.lineNumbers.length > 0 ? f.lineNumbers[0] : 1,
    severity:
      f.severity === "critical" || f.severity === "high"
        ? "error"
        : f.severity === "medium"
          ? "warning"
          : "information",
    message: `${f.title}: ${f.recommendation}`,
    source: "judges",
    code: f.ruleId,
  }));
}

function toJetbrainsDiagnostics(findings: Finding[], sourceFile: string): Record<string, unknown> {
  return {
    format: "jetbrains-inspections",
    inspections: findings.map((f) => ({
      file: sourceFile,
      line: f.lineNumbers !== undefined && f.lineNumbers.length > 0 ? f.lineNumbers[0] : 1,
      severity: f.severity === "critical" ? "ERROR" : f.severity === "high" ? "WARNING" : "WEAK WARNING",
      description: `[${f.ruleId}] ${f.title} — ${f.recommendation}`,
      category: "Judges Review",
    })),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIdeSync(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const targetIdx = argv.indexOf("--target");
  const outputIdx = argv.indexOf("--output");
  const sourceIdx = argv.indexOf("--source");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const target = targetIdx >= 0 ? argv[targetIdx + 1] : "vscode";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : "unknown";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ide-sync — Sync review results to IDE format

Usage:
  judges review-ide-sync --file <review.json> [--target vscode|jetbrains]
                         [--source <file>] [--output <path>]

Options:
  --file <path>     Review result JSON file
  --target <ide>    IDE format: vscode (default), jetbrains
  --source <file>   Original source file path for diagnostics
  --output <path>   Write output to file
  --help, -h        Show this help
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

  let result: unknown;

  if (target === "jetbrains") {
    result = toJetbrainsDiagnostics(verdict.findings, sourceFile);
  } else {
    result = toVscodeDiagnostics(verdict.findings, sourceFile);
  }

  const output = JSON.stringify(result, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`IDE diagnostics written to ${outputPath} (${target} format)`);
    return;
  }

  console.log(output);
}
