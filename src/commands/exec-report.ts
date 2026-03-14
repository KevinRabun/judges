/**
 * Exec report — executive security dashboard.
 * Generates non-technical HTML report with risk posture summary,
 * recurring issue trends, severity distribution, and remediation guidance.
 *
 * All data local.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReportFinding {
  ruleId: string;
  severity: string;
  title: string;
  confidence?: number;
}

interface ReportData {
  findings: ReportFinding[];
  totalFiles?: number;
  timestamp?: string;
}

interface SeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

// ─── Data loading ───────────────────────────────────────────────────────────

function loadReportData(inputPath: string): ReportData {
  const content = readFileSync(inputPath, "utf-8");
  const data = JSON.parse(content);

  // SARIF format
  if (data.$schema?.includes("sarif") || data.runs) {
    const findings: ReportFinding[] = [];
    for (const run of data.runs || []) {
      for (const result of run.results || []) {
        findings.push({
          ruleId: result.ruleId || "unknown",
          severity: result.level === "error" ? "high" : result.level === "warning" ? "medium" : "low",
          title: result.message?.text || result.ruleId || "Unknown",
          confidence: result.properties?.confidence,
        });
      }
    }
    return { findings };
  }

  // Judges tribunal output
  if (data.findings) {
    return {
      findings: data.findings.map((f: ReportFinding) => ({
        ruleId: f.ruleId || "unknown",
        severity: f.severity || "medium",
        title: f.title || f.ruleId || "Unknown",
        confidence: f.confidence,
      })),
    };
  }

  // Array
  if (Array.isArray(data)) {
    return {
      findings: data.map((f: ReportFinding) => ({
        ruleId: f.ruleId || "unknown",
        severity: f.severity || "medium",
        title: f.title || "Unknown",
        confidence: f.confidence,
      })),
    };
  }

  return { findings: [] };
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function getSeverityBreakdown(findings: ReportFinding[]): SeverityBreakdown {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
    total: findings.length,
  };
}

function getTopRecurring(
  findings: ReportFinding[],
  limit = 10,
): Array<{ ruleId: string; count: number; severity: string }> {
  const counts: Record<string, { count: number; severity: string }> = {};
  for (const f of findings) {
    if (!counts[f.ruleId]) counts[f.ruleId] = { count: 0, severity: f.severity };
    counts[f.ruleId].count++;
  }
  return Object.entries(counts)
    .map(([ruleId, v]) => ({ ruleId, count: v.count, severity: v.severity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function getRiskScore(breakdown: SeverityBreakdown): { score: number; label: string; color: string } {
  const raw = breakdown.critical * 10 + breakdown.high * 5 + breakdown.medium * 2 + breakdown.low * 1;
  const maxReasonable = 100;
  const score = Math.min(100, Math.round((raw / Math.max(maxReasonable, raw)) * 100));
  const inverted = 100 - score; // higher = better
  if (inverted >= 80) return { score: inverted, label: "Low Risk", color: "#22c55e" };
  if (inverted >= 60) return { score: inverted, label: "Moderate Risk", color: "#eab308" };
  if (inverted >= 40) return { score: inverted, label: "Elevated Risk", color: "#f97316" };
  return { score: inverted, label: "High Risk", color: "#ef4444" };
}

// ─── HTML generation ────────────────────────────────────────────────────────

function generateHtml(data: ReportData): string {
  const breakdown = getSeverityBreakdown(data.findings);
  const topRecurring = getTopRecurring(data.findings);
  const risk = getRiskScore(breakdown);
  const ts = data.timestamp || new Date().toISOString();

  const sevBarData = [
    { label: "Critical", count: breakdown.critical, color: "#ef4444" },
    { label: "High", count: breakdown.high, color: "#f97316" },
    { label: "Medium", count: breakdown.medium, color: "#eab308" },
    { label: "Low", count: breakdown.low, color: "#22c55e" },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Executive Report — Judges</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
  .container { max-width: 1000px; margin: 0 auto; padding: 2rem; }
  .header { text-align: center; margin-bottom: 2rem; }
  .header h1 { font-size: 1.8rem; color: #0f172a; }
  .header .subtitle { color: #64748b; margin-top: 0.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
  .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card h3 { font-size: 0.875rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .card .value { font-size: 2rem; font-weight: 700; margin-top: 0.5rem; }
  .risk-gauge { text-align: center; padding: 2rem; }
  .risk-score { font-size: 3rem; font-weight: 800; }
  .risk-label { font-size: 1.2rem; margin-top: 0.25rem; }
  .bar-chart { margin: 1.5rem 0; }
  .bar-row { display: flex; align-items: center; margin: 0.5rem 0; }
  .bar-label { width: 80px; font-size: 0.875rem; color: #64748b; }
  .bar { height: 28px; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; color: white; font-weight: 600; font-size: 0.8rem; min-width: 30px; transition: width 0.3s; }
  .table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  .table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .table th { background: #f1f5f9; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; color: white; }
  .badge-critical { background: #ef4444; }
  .badge-high { background: #f97316; }
  .badge-medium { background: #eab308; color: #1e293b; }
  .badge-low { background: #22c55e; }
  .section { margin: 2rem 0; }
  .section h2 { font-size: 1.2rem; color: #0f172a; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0; }
  .footer { text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.8rem; }
  @media print { body { background: white; } .container { max-width: 100%; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🔒 Security Executive Report</h1>
    <div class="subtitle">Generated by Judges — ${new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>

  <div class="grid">
    <div class="card risk-gauge">
      <h3>Risk Posture</h3>
      <div class="risk-score" style="color: ${risk.color}">${risk.score}</div>
      <div class="risk-label" style="color: ${risk.color}">${risk.label}</div>
    </div>
    <div class="card">
      <h3>Total Findings</h3>
      <div class="value">${breakdown.total}</div>
    </div>
    <div class="card">
      <h3>Critical + High</h3>
      <div class="value" style="color: #ef4444">${breakdown.critical + breakdown.high}</div>
    </div>
    <div class="card">
      <h3>Actionable Items</h3>
      <div class="value">${breakdown.critical + breakdown.high + breakdown.medium}</div>
    </div>
  </div>

  <div class="section">
    <h2>Severity Distribution</h2>
    <div class="bar-chart">
      ${sevBarData
        .map((s) => {
          const pct = breakdown.total > 0 ? Math.max(5, (s.count / breakdown.total) * 100) : 0;
          return `<div class="bar-row">
        <div class="bar-label">${s.label}</div>
        <div class="bar" style="width: ${pct}%; background: ${s.color};">${s.count}</div>
      </div>`;
        })
        .join("\n      ")}
    </div>
  </div>

  <div class="section">
    <h2>Top Recurring Issues</h2>
    ${
      topRecurring.length > 0
        ? `<table class="table">
      <thead><tr><th>Rule</th><th>Count</th><th>Severity</th></tr></thead>
      <tbody>
        ${topRecurring.map((r) => `<tr><td>${escapeHtml(r.ruleId)}</td><td>${r.count}</td><td><span class="badge badge-${r.severity}">${r.severity}</span></td></tr>`).join("\n        ")}
      </tbody>
    </table>`
        : "<p>No recurring issues found.</p>"
    }
  </div>

  <div class="section">
    <h2>Recommendations</h2>
    <ul style="padding-left: 1.5rem; line-height: 1.8;">
      ${breakdown.critical > 0 ? "<li><strong>Immediate:</strong> Address " + breakdown.critical + " critical finding(s) — these represent active security risks.</li>" : ""}
      ${breakdown.high > 0 ? "<li><strong>Short-term:</strong> Remediate " + breakdown.high + " high severity finding(s) within the next sprint.</li>" : ""}
      ${breakdown.medium > 0 ? "<li><strong>Medium-term:</strong> Plan fixes for " + breakdown.medium + " medium severity issue(s) in the backlog.</li>" : ""}
      <li><strong>Process:</strong> Establish a baseline and track trend over time with <code>judges trend</code>.</li>
      <li><strong>Prevention:</strong> Integrate Judges into CI/CD to catch issues before merge.</li>
    </ul>
  </div>

  <div class="footer">
    Generated by Judges • ${ts} • All data processed locally
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runExecReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges exec-report — Generate executive security dashboard

Usage:
  judges exec-report <findings.json>
  judges exec-report report.sarif.json --output dashboard.html

Options:
  --output <file>   Output HTML filename (default: exec-report.html)
  --format json     JSON data output instead of HTML
  --help, -h        Show this help

Input accepts: Judges JSON, SARIF, or finding arrays.
Output: Clean HTML report suitable for CISO/VP-level presentation.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "html";
  const outputName = argv.find((_a: string, i: number) => argv[i - 1] === "--output") || "exec-report.html";
  const inputFile = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--"));

  if (!inputFile || !existsSync(inputFile)) {
    console.error("  Please provide a valid findings file (JSON or SARIF)");
    return;
  }

  let data: ReportData;
  try {
    data = loadReportData(inputFile);
  } catch (err) {
    console.error(`  Failed to parse findings: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  data.timestamp = new Date().toISOString();

  if (format === "json") {
    const breakdown = getSeverityBreakdown(data.findings);
    const topRecurring = getTopRecurring(data.findings);
    const risk = getRiskScore(breakdown);
    console.log(
      JSON.stringify(
        { risk, breakdown, topRecurring, totalFindings: data.findings.length, timestamp: data.timestamp },
        null,
        2,
      ),
    );
    return;
  }

  // Generate HTML
  const html = generateHtml(data);
  const outDir = join(".", ".judges-reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, outputName);
  writeFileSync(outPath, html);

  const breakdown = getSeverityBreakdown(data.findings);
  const risk = getRiskScore(breakdown);

  console.log(`\n  Executive Report Generated`);
  console.log(`  ──────────────────────────`);
  console.log(`    Risk Score: ${risk.score}/100 (${risk.label})`);
  console.log(
    `    Findings:  ${breakdown.total} (${breakdown.critical}C / ${breakdown.high}H / ${breakdown.medium}M / ${breakdown.low}L)`,
  );
  console.log(`    Output:    ${outPath}`);
  console.log(`\n    Open in browser to view the dashboard.\n`);
}
