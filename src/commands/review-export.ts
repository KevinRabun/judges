/**
 * Review-export — Unified export of review results to multiple formats.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Format helpers ─────────────────────────────────────────────────────────

function toCSV(verdict: TribunalVerdict): string {
  const findings = verdict.findings || [];
  const header = "severity,ruleId,title,recommendation,confidence,lines";
  const rows = findings.map((f) => {
    const sev = (f.severity || "").replace(/,/g, ";");
    const rule = (f.ruleId || "").replace(/,/g, ";");
    const title = (f.title || "").replace(/,/g, ";").replace(/"/g, '""');
    const rec = (f.recommendation || "").replace(/,/g, ";").replace(/"/g, '""');
    const conf = f.confidence ?? "";
    const lines = f.lineNumbers ? f.lineNumbers.join(";") : "";
    return `${sev},${rule},"${title}","${rec}",${conf},${lines}`;
  });
  return [header, ...rows].join("\n");
}

function toMarkdown(verdict: TribunalVerdict): string {
  const findings = verdict.findings || [];
  const lines: string[] = [];

  lines.push("# Review Results");
  lines.push("");
  lines.push(`**Score**: ${verdict.overallScore || 0}/100`);
  lines.push(`**Verdict**: ${verdict.overallVerdict || "n/a"}`);
  lines.push(`**Findings**: ${findings.length}`);
  lines.push(`**Timestamp**: ${verdict.timestamp || new Date().toISOString()}`);
  lines.push("");

  if (verdict.summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(verdict.summary);
    lines.push("");
  }

  if (findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push("| Severity | Rule | Title | Lines |");
    lines.push("|----------|------|-------|-------|");

    for (const f of findings) {
      const sev = f.severity || "unknown";
      const rule = f.ruleId || "";
      const title = (f.title || "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
      const lineNums = f.lineNumbers ? f.lineNumbers.join(", ") : "";
      lines.push(`| ${sev} | ${rule} | ${title} | ${lineNums} |`);
    }
    lines.push("");

    // Details
    lines.push("## Details");
    lines.push("");
    for (const f of findings) {
      lines.push(`### [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
      lines.push("");
      if (f.description) lines.push(f.description);
      if (f.recommendation) {
        lines.push("");
        lines.push(`**Recommendation**: ${f.recommendation}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function toHTML(verdict: TribunalVerdict): string {
  const findings = verdict.findings || [];
  const severityColor: Record<string, string> = {
    critical: "#d32f2f",
    high: "#f57c00",
    medium: "#fbc02d",
    low: "#388e3c",
    info: "#1976d2",
  };

  const rows = findings
    .map((f) => {
      const color = severityColor[(f.severity || "").toLowerCase()] || "#666";
      return `<tr>
      <td style="color:${color};font-weight:bold">${(f.severity || "").toUpperCase()}</td>
      <td>${f.ruleId || ""}</td>
      <td>${f.title || ""}</td>
      <td>${f.lineNumbers ? f.lineNumbers.join(", ") : ""}</td>
      <td>${f.recommendation || ""}</td>
    </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Review Results</title>
<style>body{font-family:system-ui;max-width:900px;margin:0 auto;padding:20px}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}
th{background:#f5f5f5}.summary{background:#f0f7ff;padding:16px;border-radius:8px;margin:16px 0}</style>
</head>
<body>
<h1>Review Results</h1>
<div class="summary">
<strong>Score:</strong> ${verdict.overallScore || 0}/100 |
<strong>Verdict:</strong> ${verdict.overallVerdict || "n/a"} |
<strong>Findings:</strong> ${findings.length}
</div>
${verdict.summary ? `<p>${verdict.summary}</p>` : ""}
<table><thead><tr><th>Severity</th><th>Rule</th><th>Title</th><th>Lines</th><th>Recommendation</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewExport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-export — Export review results to various formats

Usage:
  judges review-export --file verdict.json --to csv --output results.csv
  judges review-export --file verdict.json --to markdown --output report.md
  judges review-export --file verdict.json --to html --output report.html

Options:
  --file <path>         Verdict JSON to export
  --to <format>         Export format: csv, markdown, html, json
  --output <path>       Output file path
  --stdout              Print to stdout instead of file
  --help, -h            Show this help

Exports review verdicts to CSV, Markdown, HTML, or pretty-printed JSON.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const toFormat = argv.find((_a: string, i: number) => argv[i - 1] === "--to") || "markdown";
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
  const toStdout = argv.includes("--stdout");

  if (!file) {
    console.error("Error: --file is required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(file)) {
    console.error(`Error: File not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Could not parse ${file}`);
    process.exitCode = 1;
    return;
  }

  let content: string;
  switch (toFormat.toLowerCase()) {
    case "csv":
      content = toCSV(verdict);
      break;
    case "markdown":
    case "md":
      content = toMarkdown(verdict);
      break;
    case "html":
      content = toHTML(verdict);
      break;
    case "json":
      content = JSON.stringify(verdict, null, 2);
      break;
    default:
      console.error(`Error: Unknown format '${toFormat}'. Supported: csv, markdown, html, json`);
      process.exitCode = 1;
      return;
  }

  if (toStdout || !outputFile) {
    console.log(content);
    return;
  }

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, content, "utf-8");
  console.log(`Exported ${toFormat} to ${outputFile} (${(verdict.findings || []).length} findings)`);
}
