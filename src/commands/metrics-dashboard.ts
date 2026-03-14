/**
 * `judges metrics-dashboard` — Interactive HTML metrics dashboard.
 *
 * Generates a self-contained HTML page with charts visualising:
 * - Findings over time (from snapshot data)
 * - Fix rates and time saved (from finding lifecycle data)
 * - Severity distribution
 * - Judge performance breakdown
 * - Feedback-driven calibration improvements
 *
 * All data comes from the user's own local stores (or configured adapter).
 * Judges never hosts or processes user data — dashboards are generated
 * client-side from the user's own files.
 *
 * Usage:
 *   judges metrics-dashboard                       # output HTML to stdout
 *   judges metrics-dashboard --output report.html  # write to file
 *   judges metrics-dashboard --format json         # raw data
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { FindingStore } from "../finding-lifecycle.js";
import { computeMetrics, type RoiMetrics } from "./metrics.js";

// ─── Data Loading ───────────────────────────────────────────────────────────

interface SnapshotPoint {
  timestamp: string;
  totalFindings: number;
  bySeverity: Record<string, number>;
  byJudge: Record<string, number>;
  score: number;
  verdict: string;
}

interface SnapshotStore {
  snapshots: SnapshotPoint[];
}

function loadSnapshots(dir: string): SnapshotStore {
  const p = resolve(dir, ".judges-snapshots.json");
  if (!existsSync(p)) return { snapshots: [] };
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { snapshots: [] };
  }
}

function loadFindingStoreLocal(dir: string): FindingStore | undefined {
  const p = resolve(dir, ".judges-findings.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

interface FeedbackStoreLocal {
  entries: Array<{ ruleId: string; verdict: string; timestamp: string }>;
}

function loadFeedbackLocal(dir: string): FeedbackStoreLocal {
  const p = resolve(dir, ".judges-feedback.json");
  if (!existsSync(p)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

// ─── HTML Dashboard ─────────────────────────────────────────────────────────

export function renderMetricsDashboardHtml(dir: string): string {
  const metrics = computeMetrics(resolve(dir));
  const snapshots = loadSnapshots(dir);
  const _findingStore = loadFindingStoreLocal(dir);
  const feedback = loadFeedbackLocal(dir);

  const _snapshotJson = JSON.stringify(snapshots.snapshots.slice(-50));
  const _metricsJson = JSON.stringify(metrics);
  const _severityJson = JSON.stringify(metrics.findings.bySeverity);
  const _feedbackJson = JSON.stringify(aggregateFeedbackByWeek(feedback));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Judges — Metrics Dashboard</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --text2: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --red: #f85149; --orange: #db6d28;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f6f8fa; --surface: #ffffff; --border: #d0d7de;
      --text: #1f2328; --text2: #656d76; --accent: #0969da;
      --green: #1a7f37; --yellow: #9a6700; --red: #cf222e; --orange: #bc4c00;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
         background: var(--bg); color: var(--text); padding: 2rem; line-height: 1.5; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.2rem; margin: 1.5rem 0 0.8rem; color: var(--text2); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.2rem; }
  .card .label { font-size: 0.8rem; color: var(--text2); text-transform: uppercase; letter-spacing: 0.05em; }
  .card .value { font-size: 2rem; font-weight: 700; margin-top: 0.3rem; }
  .card .sub { font-size: 0.85rem; color: var(--text2); margin-top: 0.2rem; }
  .green { color: var(--green); } .yellow { color: var(--yellow); } .red { color: var(--red); }
  .chart-container { background: var(--surface); border: 1px solid var(--border);
                     border-radius: 8px; padding: 1.2rem; margin: 1rem 0; }
  svg { width: 100%; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th, td { padding: 0.5rem 0.8rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  th { color: var(--text2); font-weight: 600; }
  .bar { height: 18px; border-radius: 3px; display: inline-block; vertical-align: middle; }
  .legend { display: flex; gap: 1rem; flex-wrap: wrap; margin: 0.5rem 0; font-size: 0.85rem; }
  .legend span::before { content: ''; display: inline-block; width: 10px; height: 10px;
                          border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .trend-arrow { font-size: 1.5rem; }
  footer { margin-top: 2rem; font-size: 0.8rem; color: var(--text2); text-align: center; }
</style>
</head>
<body>
<h1>Judges — Metrics Dashboard</h1>
<p style="color:var(--text2)">Period: ${metrics.period.from.slice(0, 10)} → ${metrics.period.to.slice(0, 10)}</p>

<h2>Overview</h2>
<div class="grid">
  <div class="card">
    <div class="label">Total Findings</div>
    <div class="value">${metrics.findings.totalDetected}</div>
    <div class="sub">${metrics.findings.totalOpen} open · ${metrics.findings.totalFixed} fixed</div>
  </div>
  <div class="card">
    <div class="label">Fix Rate</div>
    <div class="value ${metrics.findings.fixRate >= 0.7 ? "green" : metrics.findings.fixRate >= 0.4 ? "yellow" : "red"}">${(metrics.findings.fixRate * 100).toFixed(1)}%</div>
    <div class="sub">${metrics.findings.totalFixed} of ${metrics.findings.totalDetected} resolved</div>
  </div>
  <div class="card">
    <div class="label">Time Saved</div>
    <div class="value green">~${metrics.timeSaved.estimatedHours}h</div>
    <div class="sub">${metrics.timeSaved.estimatedMinutes} minutes total</div>
  </div>
  <div class="card">
    <div class="label">Trend</div>
    <div class="value">
      <span class="trend-arrow ${metrics.trend.direction === "improving" ? "green" : metrics.trend.direction === "degrading" ? "red" : "yellow"}">${metrics.trend.direction === "improving" ? "↗" : metrics.trend.direction === "degrading" ? "↘" : "→"}</span>
    </div>
    <div class="sub">${metrics.trend.direction} — ${metrics.trend.newFindingsPerRun.toFixed(1)} new / ${metrics.trend.fixedFindingsPerRun.toFixed(1)} fixed per run</div>
  </div>
  <div class="card">
    <div class="label">False Positives</div>
    <div class="value ${metrics.findings.totalFalsePositive === 0 ? "green" : "yellow"}">${metrics.findings.totalFalsePositive}</div>
    <div class="sub">${metrics.findings.totalAcceptedRisk} accepted risk</div>
  </div>
  <div class="card">
    <div class="label">Feedback Entries</div>
    <div class="value">${feedback.entries.length}</div>
    <div class="sub">Used for calibration</div>
  </div>
</div>

<h2>Severity Distribution</h2>
<div class="chart-container">
  ${renderSeverityBars(metrics)}
</div>

<h2>Time Saved Breakdown</h2>
<div class="chart-container">
  <table>
    <thead><tr><th>Category</th><th>Count</th><th>Per Item</th><th>Total</th></tr></thead>
    <tbody>${metrics.timeSaved.breakdown.map((b) => `<tr><td>${escapeHtml(b.category)}</td><td>${b.count}</td><td>${b.minutesPerItem} min</td><td>${b.totalMinutes} min</td></tr>`).join("")}</tbody>
  </table>
</div>

${
  snapshots.snapshots.length > 1
    ? `
<h2>Findings Over Time</h2>
<div class="chart-container">
  ${renderTrendChart(snapshots.snapshots)}
</div>`
    : ""
}

${
  feedback.entries.length > 0
    ? `
<h2>Feedback Activity</h2>
<div class="chart-container">
  ${renderFeedbackChart(feedback)}
</div>`
    : ""
}

<footer>
  Generated by Judges Panel · ${new Date().toISOString().slice(0, 10)} ·
  Data sourced from local project files — judges never hosts or processes your data
</footer>
</body>
</html>`;
}

// ─── Chart Renderers ────────────────────────────────────────────────────────

function renderSeverityBars(metrics: RoiMetrics): string {
  const severities = ["critical", "high", "medium", "low", "info"];
  const colors: Record<string, string> = {
    critical: "var(--red)",
    high: "var(--orange)",
    medium: "var(--yellow)",
    low: "var(--accent)",
    info: "var(--text2)",
  };
  const max = Math.max(1, ...severities.map((s) => metrics.findings.bySeverity[s]?.detected ?? 0));

  return `<table>
    <thead><tr><th>Severity</th><th>Detected</th><th>Fixed</th><th></th></tr></thead>
    <tbody>${severities
      .map((s) => {
        const d = metrics.findings.bySeverity[s]?.detected ?? 0;
        const f = metrics.findings.bySeverity[s]?.fixed ?? 0;
        const pct = max > 0 ? (d / max) * 100 : 0;
        return `<tr><td style="text-transform:capitalize">${s}</td><td>${d}</td><td>${f}</td><td><span class="bar" style="width:${pct}%;background:${colors[s]}"></span></td></tr>`;
      })
      .join("")}</tbody>
  </table>`;
}

function renderTrendChart(snapshots: SnapshotPoint[]): string {
  const pts = snapshots.slice(-30);
  if (pts.length < 2) return "<p>Not enough data points for trend chart.</p>";

  const maxFindings = Math.max(1, ...pts.map((p) => p.totalFindings));
  const w = 800;
  const h = 200;
  const pad = 40;
  const xStep = (w - 2 * pad) / (pts.length - 1);

  const points = pts.map((p, i) => ({
    x: pad + i * xStep,
    y: h - pad - (p.totalFindings / maxFindings) * (h - 2 * pad),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--border)" />
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="var(--border)" />
    <text x="${pad - 5}" y="${pad + 4}" fill="var(--text2)" font-size="11" text-anchor="end">${maxFindings}</text>
    <text x="${pad - 5}" y="${h - pad + 4}" fill="var(--text2)" font-size="11" text-anchor="end">0</text>
    <text x="${pad}" y="${h - pad + 16}" fill="var(--text2)" font-size="10">${pts[0].timestamp.slice(0, 10)}</text>
    <text x="${w - pad}" y="${h - pad + 16}" fill="var(--text2)" font-size="10" text-anchor="end">${pts[pts.length - 1].timestamp.slice(0, 10)}</text>
    <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" />
    ${points.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--accent)"><title>${pts[i].timestamp.slice(0, 10)}: ${pts[i].totalFindings} findings</title></circle>`).join("")}
  </svg>
  <div class="legend"><span style="color:var(--accent)">● Total findings over time (last ${pts.length} snapshots)</span></div>`;
}

function renderFeedbackChart(feedback: FeedbackStoreLocal): string {
  const weeks = aggregateFeedbackByWeek(feedback);
  if (weeks.length === 0) return "<p>No feedback data.</p>";

  const max = Math.max(1, ...weeks.map((w) => w.tp + w.fp + w.wontfix));
  const w = 800;
  const h = 180;
  const pad = 40;
  const barWidth = Math.max(8, Math.min(40, (w - 2 * pad) / weeks.length - 4));

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--border)" />
    ${weeks
      .map((wk, i) => {
        const x = pad + i * ((w - 2 * pad) / weeks.length) + 2;
        const totalH = ((wk.tp + wk.fp + wk.wontfix) / max) * (h - 2 * pad);
        const tpH = (wk.tp / max) * (h - 2 * pad);
        const fpH = (wk.fp / max) * (h - 2 * pad);
        const wfH = (wk.wontfix / max) * (h - 2 * pad);
        const baseY = h - pad;
        return `
        <rect x="${x}" y="${baseY - tpH}" width="${barWidth}" height="${tpH}" fill="var(--green)" rx="2"><title>Week ${wk.week}: ${wk.tp} TP</title></rect>
        <rect x="${x}" y="${baseY - tpH - fpH}" width="${barWidth}" height="${fpH}" fill="var(--red)" rx="2"><title>Week ${wk.week}: ${wk.fp} FP</title></rect>
        <rect x="${x}" y="${baseY - totalH}" width="${barWidth}" height="${wfH}" fill="var(--yellow)" rx="2"><title>Week ${wk.week}: ${wk.wontfix} Won't Fix</title></rect>`;
      })
      .join("")}
  </svg>
  <div class="legend">
    <span style="color:var(--green)">● True Positive</span>
    <span style="color:var(--red)">● False Positive</span>
    <span style="color:var(--yellow)">● Won't Fix</span>
  </div>`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface WeekBucket {
  week: string;
  tp: number;
  fp: number;
  wontfix: number;
}

function aggregateFeedbackByWeek(feedback: FeedbackStoreLocal): WeekBucket[] {
  const buckets = new Map<string, WeekBucket>();
  for (const e of feedback.entries) {
    const d = new Date(e.timestamp);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { week: key, tp: 0, fp: 0, wontfix: 0 };
    if (e.verdict === "tp") b.tp++;
    else if (e.verdict === "fp") b.fp++;
    else b.wontfix++;
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12);
}

// ─── CLI Entry ──────────────────────────────────────────────────────────────

export function runMetricsDashboard(argv: string[]): void {
  let format = "html";
  let outputPath: string | undefined;
  let dir = ".";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--format" && argv[i + 1]) format = argv[++i];
    else if ((arg === "--output" || arg === "-o") && argv[i + 1]) outputPath = argv[++i];
    else if (arg === "--dir" && argv[i + 1]) dir = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`
judges metrics-dashboard — Interactive HTML metrics dashboard

Usage:
  judges metrics-dashboard                       Output HTML to stdout
  judges metrics-dashboard -o report.html        Write to file
  judges metrics-dashboard --format json         Raw metrics data
  judges metrics-dashboard --dir ./project       Target project directory

Options:
  --format <fmt>   Output format: html (default), json
  --output, -o     Write to file instead of stdout
  --dir <path>     Project directory (default: cwd)
  -h, --help       Show this help
`);
      process.exit(0);
    }
  }

  if (format === "json") {
    const metrics = computeMetrics(resolve(dir));
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  const html = renderMetricsDashboardHtml(dir);
  if (outputPath) {
    writeFileSync(outputPath, html, "utf-8");
    console.log(`  ✅ Metrics dashboard written to ${outputPath}`);
  } else {
    console.log(html);
  }
}
