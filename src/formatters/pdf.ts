/**
 * PDF-Ready Report Formatter — Print-optimized HTML output.
 *
 * Generates a single-file HTML report optimized for "Print → Save as PDF":
 *   - Clean print layout with page breaks
 *   - No interactive elements (no JavaScript)
 *   - Fixed-width tables for consistent rendering
 *   - @media print styles for proper pagination
 *   - Executive summary on first page
 */

import type { TribunalVerdict, Finding } from "../types.js";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "high":
      return "#ea580c";
    case "medium":
      return "#ca8a04";
    case "low":
      return "#2563eb";
    case "info":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}

function renderFinding(f: Finding): string {
  const color = severityColor(f.severity);
  return `<tr>
    <td><span style="color:${color};font-weight:600">${esc(f.severity.toUpperCase())}</span></td>
    <td><code>${esc(f.ruleId)}</code></td>
    <td>${esc(f.title)}</td>
    <td>${f.lineNumbers?.join(", ") ?? "—"}</td>
    <td>${esc(f.confidenceTier ?? "—")}</td>
  </tr>
  <tr class="detail-row">
    <td colspan="5">
      <div class="detail">${esc(f.description)}${f.recommendation ? `<br><strong>Recommendation:</strong> ${esc(f.recommendation)}` : ""}</div>
    </td>
  </tr>`;
}

export function verdictToPdfHtml(verdict: TribunalVerdict, filePath?: string): string {
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const severityCounts = {
    critical: allFindings.filter((f) => f.severity === "critical").length,
    high: allFindings.filter((f) => f.severity === "high").length,
    medium: allFindings.filter((f) => f.severity === "medium").length,
    low: allFindings.filter((f) => f.severity === "low").length,
    info: allFindings.filter((f) => f.severity === "info").length,
  };
  const timestamp = new Date(verdict.timestamp).toLocaleString();
  const fileLabel = filePath ? esc(filePath) : "stdin";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Judges Panel Report — ${fileLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; line-height: 1.5; padding: 2rem; max-width: 210mm; margin: 0 auto; font-size: 10pt; }
  h1 { font-size: 18pt; margin-bottom: 2pt; }
  h2 { font-size: 13pt; margin: 1.5rem 0 0.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 4pt; page-break-after: avoid; }
  .meta { color: #6b7280; font-size: 9pt; margin-bottom: 1rem; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  .summary-table td { padding: 8pt 12pt; text-align: center; border: 1px solid #e5e7eb; }
  .summary-table .value { font-size: 18pt; font-weight: 700; display: block; }
  .summary-table .label { font-size: 7pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  table.findings { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 1rem; }
  table.findings th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4pt 6pt; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
  table.findings td { border: 1px solid #e5e7eb; padding: 4pt 6pt; vertical-align: top; }
  table.findings code { font-size: 8pt; background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; }
  .detail-row td { background: #fafbfc; }
  .detail { font-size: 8.5pt; color: #374151; }
  .judge-header { background: #f9fafb; padding: 6pt; border: 1px solid #e5e7eb; margin-bottom: -1px; }
  .judge-header .name { font-weight: 600; }
  .judge-header .score { float: right; font-weight: 700; }
  footer { margin-top: 2rem; text-align: center; color: #9ca3af; font-size: 7pt; border-top: 1px solid #e5e7eb; padding-top: 8pt; }

  @media print {
    body { padding: 0; max-width: none; }
    h2 { page-break-after: avoid; }
    table.findings { page-break-inside: auto; }
    table.findings tr { page-break-inside: avoid; }
    .detail-row { page-break-inside: avoid; }
    .judge-section { page-break-inside: avoid; }
    footer { page-break-before: avoid; }
    @page { margin: 15mm 12mm; size: A4; }
  }
</style>
</head>
<body>
<h1>Judges Panel Report</h1>
<p class="meta">File: ${fileLabel} &middot; Generated: ${timestamp}</p>

<table class="summary-table">
  <tr>
    <td><span class="value" style="color:${verdict.overallVerdict === "pass" ? "#16a34a" : verdict.overallVerdict === "warning" ? "#ca8a04" : "#dc2626"}">${verdict.overallVerdict.toUpperCase()}</span><span class="label">Verdict</span></td>
    <td><span class="value">${verdict.overallScore}</span><span class="label">Score / 100</span></td>
    <td><span class="value">${totalFindings}</span><span class="label">Total Findings</span></td>
    <td><span class="value">${verdict.evaluations.length}</span><span class="label">Judges</span></td>
  </tr>
  <tr>
    <td><span class="value" style="color:${severityColor("critical")}">${severityCounts.critical}</span><span class="label">Critical</span></td>
    <td><span class="value" style="color:${severityColor("high")}">${severityCounts.high}</span><span class="label">High</span></td>
    <td><span class="value" style="color:${severityColor("medium")}">${severityCounts.medium}</span><span class="label">Medium</span></td>
    <td><span class="value" style="color:${severityColor("low")}">${severityCounts.low}</span><span class="label">Low</span></td>
  </tr>
</table>

${verdict.evaluations
  .filter((e) => e.findings.length > 0)
  .map(
    (e) => `<h2>${esc(e.judgeName)}</h2>
<div class="judge-header">
  <span class="name">${esc(e.judgeId)}</span>
  <span class="score">Score: ${e.score}/100 — ${e.verdict.toUpperCase()}</span>
</div>
<table class="findings">
  <thead><tr><th style="width:70px">Severity</th><th style="width:100px">Rule</th><th>Title</th><th style="width:40px">Line</th><th style="width:70px">Confidence</th></tr></thead>
  <tbody>${e.findings.map(renderFinding).join("\n")}</tbody>
</table>`,
  )
  .join("\n")}

${totalFindings === 0 ? '<p style="color:#16a34a;text-align:center;margin:2rem 0;font-size:12pt">✓ No findings — all judges passed.</p>' : ""}

<footer>Generated by Judges Panel &middot; Open in browser and use File → Print → Save as PDF</footer>
</body>
</html>`;
}
