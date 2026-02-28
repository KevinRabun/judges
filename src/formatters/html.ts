/**
 * HTML Report Formatter — Self-contained HTML output with inline CSS.
 *
 * Generates a single-file HTML report with:
 *   - Executive summary with score gauge
 *   - Severity filter toggles
 *   - Per-judge accordion drill-down
 *   - Finding details with line numbers and suggested fixes
 *   - Dark/light theme auto-detection
 */

import type { TribunalVerdict, JudgeEvaluation, Finding } from "../types.js";

// ─── HTML Escaping ──────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Severity Colors ────────────────────────────────────────────────────────

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

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "pass":
      return "#16a34a";
    case "warning":
      return "#ca8a04";
    case "fail":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

// ─── Finding Row ────────────────────────────────────────────────────────────

function renderFinding(f: Finding): string {
  const lines = f.lineNumbers?.length ? `Line ${f.lineNumbers.join(", ")}` : "";
  const color = severityColor(f.severity);
  const fix = f.suggestedFix
    ? `<details class="fix"><summary>Suggested Fix</summary><pre><code>${esc(f.suggestedFix)}</code></pre></details>`
    : "";
  return `
    <div class="finding" data-severity="${f.severity}">
      <div class="finding-header">
        <span class="badge" style="background:${color}">${f.severity.toUpperCase()}</span>
        <span class="rule-id">${esc(f.ruleId)}</span>
        <span class="finding-title">${esc(f.title)}</span>
        ${lines ? `<span class="line-ref">${esc(lines)}</span>` : ""}
      </div>
      <p class="finding-desc">${esc(f.description)}</p>
      <p class="finding-rec"><strong>Recommendation:</strong> ${esc(f.recommendation)}</p>
      ${f.reference ? `<p class="finding-ref"><a href="${esc(f.reference)}" target="_blank" rel="noopener">${esc(f.reference)}</a></p>` : ""}
      ${fix}
    </div>`;
}

// ─── Judge Section ──────────────────────────────────────────────────────────

function renderJudge(evaluation: JudgeEvaluation): string {
  const icon = evaluation.verdict === "pass" ? "✅" : evaluation.verdict === "warning" ? "⚠️" : "❌";
  const findingsHtml =
    evaluation.findings.length > 0
      ? evaluation.findings.map(renderFinding).join("")
      : '<p class="no-findings">No findings</p>';

  return `
    <details class="judge-section">
      <summary>
        <span class="judge-icon">${icon}</span>
        <span class="judge-name">${esc(evaluation.judgeName)}</span>
        <span class="judge-score">${evaluation.score}/100</span>
        <span class="judge-count">${evaluation.findings.length} finding(s)</span>
      </summary>
      <div class="judge-body">
        <p class="judge-summary">${esc(evaluation.summary)}</p>
        ${findingsHtml}
      </div>
    </details>`;
}

// ─── Main Export ────────────────────────────────────────────────────────────

export function verdictToHtml(verdict: TribunalVerdict, filePath?: string): string {
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const severityCounts = {
    critical: allFindings.filter((f) => f.severity === "critical").length,
    high: allFindings.filter((f) => f.severity === "high").length,
    medium: allFindings.filter((f) => f.severity === "medium").length,
    low: allFindings.filter((f) => f.severity === "low").length,
    info: allFindings.filter((f) => f.severity === "info").length,
  };

  const vColor = verdictColor(verdict.overallVerdict);
  const timestamp = new Date(verdict.timestamp).toLocaleString();
  const fileLabel = filePath ? esc(filePath) : "stdin";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Judges Panel Report — ${fileLabel}</title>
<style>
  :root { --bg: #ffffff; --fg: #1a1a1a; --card: #f9fafb; --border: #e5e7eb; --muted: #6b7280; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f172a; --fg: #e2e8f0; --card: #1e293b; --border: #334155; --muted: #94a3b8; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; padding: 2rem; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .summary-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; text-align: center; }
  .summary-card .value { font-size: 2rem; font-weight: 700; }
  .summary-card .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .filters { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .filter-btn { border: 1px solid var(--border); background: var(--card); color: var(--fg); padding: 0.25rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
  .filter-btn.active { background: var(--fg); color: var(--bg); }
  .judge-section { background: var(--card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.75rem; }
  .judge-section summary { padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; font-weight: 500; }
  .judge-section summary::-webkit-details-marker { display: none; }
  .judge-section summary::before { content: "▶"; font-size: 0.7rem; transition: transform 0.2s; }
  .judge-section[open] summary::before { transform: rotate(90deg); }
  .judge-score { margin-left: auto; font-weight: 700; }
  .judge-count { color: var(--muted); font-size: 0.8rem; }
  .judge-body { padding: 0 1rem 1rem; }
  .judge-summary { color: var(--muted); font-size: 0.875rem; margin-bottom: 0.75rem; }
  .finding { border-left: 3px solid var(--border); padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; background: var(--bg); border-radius: 0 4px 4px 0; }
  .finding-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
  .badge { color: #fff; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }
  .rule-id { font-weight: 600; font-size: 0.85rem; }
  .finding-title { font-weight: 500; }
  .line-ref { color: var(--muted); font-size: 0.8rem; }
  .finding-desc, .finding-rec, .finding-ref { font-size: 0.85rem; margin-top: 0.25rem; }
  .finding-ref a { color: #3b82f6; }
  .fix summary { font-size: 0.8rem; cursor: pointer; color: #3b82f6; margin-top: 0.25rem; }
  .fix pre { background: var(--card); padding: 0.5rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem; margin-top: 0.25rem; }
  .no-findings { color: var(--muted); font-style: italic; }
  footer { margin-top: 2rem; text-align: center; color: var(--muted); font-size: 0.75rem; }
</style>
</head>
<body>
<h1>Judges Panel Report</h1>
<p class="meta">File: ${fileLabel} &middot; ${timestamp}</p>

<div class="summary-grid">
  <div class="summary-card">
    <div class="value" style="color:${vColor}">${verdict.overallVerdict.toUpperCase()}</div>
    <div class="label">Verdict</div>
  </div>
  <div class="summary-card">
    <div class="value">${verdict.overallScore}</div>
    <div class="label">Score / 100</div>
  </div>
  <div class="summary-card">
    <div class="value">${totalFindings}</div>
    <div class="label">Findings</div>
  </div>
  <div class="summary-card">
    <div class="value">${verdict.evaluations.length}</div>
    <div class="label">Judges</div>
  </div>
</div>

<div class="summary-grid">
  <div class="summary-card">
    <div class="value" style="color:${severityColor("critical")}">${severityCounts.critical}</div>
    <div class="label">Critical</div>
  </div>
  <div class="summary-card">
    <div class="value" style="color:${severityColor("high")}">${severityCounts.high}</div>
    <div class="label">High</div>
  </div>
  <div class="summary-card">
    <div class="value" style="color:${severityColor("medium")}">${severityCounts.medium}</div>
    <div class="label">Medium</div>
  </div>
  <div class="summary-card">
    <div class="value" style="color:${severityColor("low")}">${severityCounts.low}</div>
    <div class="label">Low</div>
  </div>
</div>

<div class="filters">
  <button class="filter-btn active" onclick="filterFindings('all')">All</button>
  <button class="filter-btn" onclick="filterFindings('critical')">Critical (${severityCounts.critical})</button>
  <button class="filter-btn" onclick="filterFindings('high')">High (${severityCounts.high})</button>
  <button class="filter-btn" onclick="filterFindings('medium')">Medium (${severityCounts.medium})</button>
  <button class="filter-btn" onclick="filterFindings('low')">Low (${severityCounts.low})</button>
</div>

${verdict.evaluations.map(renderJudge).join("\n")}

<footer>Generated by <a href="https://github.com/KevinRabun/judges" style="color:#3b82f6">Judges Panel</a> v3.4.0</footer>

<script>
function filterFindings(severity) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.finding').forEach(el => {
    if (severity === 'all' || el.dataset.severity === severity) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}
</script>
</body>
</html>`;
}
