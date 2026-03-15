/**
 * Review-output-transform — Transform review output between formats.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Transformers ───────────────────────────────────────────────────────────

function toMarkdown(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  lines.push(`# Review Report`);
  lines.push(``);
  lines.push(`- **Verdict:** ${verdict.overallVerdict}`);
  lines.push(`- **Score:** ${verdict.overallScore}`);
  lines.push(`- **Findings:** ${verdict.findings.length}`);
  lines.push(``);

  if (verdict.findings.length > 0) {
    lines.push(`## Findings`);
    lines.push(``);
    lines.push(`| Severity | Rule | Title | Recommendation |`);
    lines.push(`|----------|------|-------|----------------|`);
    for (const f of verdict.findings) {
      lines.push(`| ${f.severity} | ${f.ruleId} | ${f.title} | ${f.recommendation} |`);
    }
  }

  return lines.join("\n");
}

function toCsv(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  lines.push("ruleId,severity,title,description,recommendation,lineNumbers,confidence");
  for (const f of verdict.findings) {
    const ln = f.lineNumbers !== undefined ? f.lineNumbers.join(";") : "";
    const conf = f.confidence !== undefined ? String(f.confidence) : "";
    const desc = f.description.replace(/"/g, '""');
    const title = f.title.replace(/"/g, '""');
    const rec = f.recommendation.replace(/"/g, '""');
    lines.push(`"${f.ruleId}","${f.severity}","${title}","${desc}","${rec}","${ln}","${conf}"`);
  }
  return lines.join("\n");
}

function toSummaryText(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  lines.push(`Review Summary`);
  lines.push(`==============`);
  lines.push(`Verdict: ${verdict.overallVerdict}  Score: ${verdict.overallScore}`);
  lines.push(`Findings: ${verdict.findings.length} (${verdict.criticalCount} critical, ${verdict.highCount} high)`);
  lines.push(``);
  for (const f of verdict.findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    lines.push(`  → ${f.recommendation}`);
  }
  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOutputTransform(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const toIdx = argv.indexOf("--to");
  const outputIdx = argv.indexOf("--output");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const targetFormat = toIdx >= 0 ? argv[toIdx + 1] : "markdown";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-output-transform — Transform output formats

Usage:
  judges review-output-transform --file <review.json> --to <format>
                                 [--output <file>]

Options:
  --file <path>    Review result JSON file
  --to <format>    Target: markdown, csv, text, json
  --output <path>  Write transformed output to file
  --help, -h       Show this help
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

  let output: string;
  switch (targetFormat) {
    case "markdown":
      output = toMarkdown(verdict);
      break;
    case "csv":
      output = toCsv(verdict);
      break;
    case "text":
      output = toSummaryText(verdict);
      break;
    case "json":
      output = JSON.stringify(verdict, null, 2);
      break;
    default:
      console.error(`Error: unknown format: ${targetFormat}. Use markdown, csv, text, or json.`);
      process.exitCode = 1;
      return;
  }

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`Transformed to ${targetFormat}, written to ${outputPath}`);
    return;
  }

  console.log(output);
}
