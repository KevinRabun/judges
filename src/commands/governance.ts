/**
 * `judges governance` — Multi-repo governance dashboard.
 *
 * Aggregates snapshot data from multiple repos into a unified governance view.
 * Teams self-host their own snapshot files; this command reads them from a
 * directory of exported snapshots (each repo pushes to a shared location).
 *
 * Usage:
 *   judges governance --dir ./governance-data         # read snapshots from dir
 *   judges governance --dir ./governance-data --html  # HTML dashboard output
 *   judges governance --dir ./governance-data --json  # JSON output
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, basename } from "path";
import type { SnapshotStore, TrendReport } from "./snapshot.js";
import { computeTrend, detectRegressions, type RegressionAlert } from "./snapshot.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepoSummary {
  repo: string;
  trend: TrendReport;
  regressions: RegressionAlert[];
  lastRun: string;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface GovernanceReport {
  repos: RepoSummary[];
  overallHealth: "healthy" | "at-risk" | "critical";
  totalFindings: number;
  repoCount: number;
  criticalRepos: string[];
  generatedAt: string;
}

// ─── Grade Calculation ──────────────────────────────────────────────────────

function gradeFromTrend(trend: TrendReport): "A" | "B" | "C" | "D" | "F" {
  const t = trend.stats;
  if (t.currentTotal === 0 && t.trend === "improving") return "A";
  if (t.currentTotal <= 3 && t.trend !== "regressing") return "A";
  if (t.currentTotal <= 10 && t.trend !== "regressing") return "B";
  if (t.currentTotal <= 20) return "C";
  if (t.currentTotal <= 50) return "D";
  return "F";
}

// ─── Snapshot Directory Loading ─────────────────────────────────────────────

function loadSnapshotFiles(dir: string): Map<string, SnapshotStore> {
  const repos = new Map<string, SnapshotStore>();
  if (!existsSync(dir)) return repos;

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const raw = readFileSync(resolve(dir, file), "utf-8");
      const store = JSON.parse(raw) as SnapshotStore;
      if (store.version === 1 && Array.isArray(store.snapshots)) {
        // Use filename (minus extension) as repo name
        const repoName = basename(file, ".json").replace(/-snapshots$/, "");
        repos.set(repoName, store);
      }
    } catch {
      // Skip invalid files
    }
  }

  return repos;
}

// ─── Report Generation ──────────────────────────────────────────────────────

export function buildGovernanceReport(dir: string): GovernanceReport {
  const stores = loadSnapshotFiles(dir);
  const repos: RepoSummary[] = [];
  let totalFindings = 0;
  const criticalRepos: string[] = [];

  for (const [repoName, store] of stores) {
    const trend = computeTrend(store);
    const regressions = detectRegressions(store);
    const grade = gradeFromTrend(trend);

    repos.push({
      repo: repoName,
      trend,
      regressions,
      lastRun: trend.stats.lastRun,
      grade,
    });

    totalFindings += trend.stats.currentTotal;
    if (grade === "D" || grade === "F" || regressions.some((r) => r.severity === "error")) {
      criticalRepos.push(repoName);
    }
  }

  // Sort by grade (worst first) then by findings count
  const gradeOrder: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
  repos.sort(
    (a, b) =>
      (gradeOrder[a.grade] ?? 5) - (gradeOrder[b.grade] ?? 5) ||
      b.trend.stats.currentTotal - a.trend.stats.currentTotal,
  );

  const overallHealth: "healthy" | "at-risk" | "critical" =
    criticalRepos.length === 0 ? "healthy" : criticalRepos.length <= repos.length * 0.3 ? "at-risk" : "critical";

  return {
    repos,
    overallHealth,
    totalFindings,
    repoCount: repos.length,
    criticalRepos,
    generatedAt: new Date().toISOString(),
  };
}

// ─── CLI Formatters ─────────────────────────────────────────────────────────

function formatGovernanceText(report: GovernanceReport): string {
  const lines: string[] = [];
  const healthIcon = report.overallHealth === "healthy" ? "✅" : report.overallHealth === "at-risk" ? "⚠️ " : "🔴";

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║        Judges Panel — Governance Dashboard                  ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Health    : ${healthIcon} ${report.overallHealth.toUpperCase()}`);
  lines.push(`  Repos     : ${report.repoCount}`);
  lines.push(`  Findings  : ${report.totalFindings} total across all repos`);
  if (report.criticalRepos.length > 0) {
    lines.push(`  Critical  : ${report.criticalRepos.join(", ")}`);
  }
  lines.push(`  Generated : ${report.generatedAt.slice(0, 10)}`);
  lines.push("");

  lines.push("  Repository Summary:");
  lines.push("  " + "─".repeat(58));
  lines.push(`  ${"Repository".padEnd(30)} Grade  Findings  Trend`);
  lines.push("  " + "─".repeat(58));

  for (const r of report.repos) {
    const trendIcon = r.trend.stats.trend === "improving" ? "📉" : r.trend.stats.trend === "regressing" ? "📈" : "➡️ ";
    const findings = String(r.trend.stats.currentTotal).padStart(6);
    lines.push(`  ${r.repo.padEnd(30)} ${r.grade.padEnd(6)} ${findings}   ${trendIcon} ${r.trend.stats.trend}`);
    if (r.regressions.length > 0) {
      for (const alert of r.regressions.slice(0, 2)) {
        const icon = alert.severity === "error" ? "🔴" : "🟡";
        lines.push(`    ${icon} ${alert.message}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

function formatGovernanceHtml(report: GovernanceReport): string {
  const healthColor =
    report.overallHealth === "healthy" ? "#16a34a" : report.overallHealth === "at-risk" ? "#ca8a04" : "#dc2626";
  const gradeColor: Record<string, string> = { A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626" };

  const rows = report.repos
    .map(
      (r) =>
        `<tr>
      <td>${esc(r.repo)}</td>
      <td style="color:${gradeColor[r.grade] ?? "#666"};font-weight:700">${r.grade}</td>
      <td>${r.trend.stats.currentTotal}</td>
      <td>${r.trend.stats.trend}</td>
      <td>${r.regressions.length}</td>
      <td>${r.lastRun.slice(0, 10)}</td>
    </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Judges Governance Dashboard</title>
<style>
  :root{--bg:#fff;--fg:#1a1a1a;--card:#f9fafb;--border:#e5e7eb;--muted:#6b7280}
  @media(prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--card:#1e293b;--border:#334155;--muted:#94a3b8}}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);padding:2rem}
  h1{margin-bottom:1rem}
  .badge{display:inline-block;padding:.25rem .75rem;border-radius:4px;font-weight:700}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  th,td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid var(--border)}
  th{font-size:.75rem;text-transform:uppercase;color:var(--muted)}
</style></head><body>
<h1>Judges Panel &mdash; Governance Dashboard</h1>
<p><span class="badge" style="background:${healthColor};color:#fff">${esc(report.overallHealth.toUpperCase())}</span>
${report.repoCount} repos, ${report.totalFindings} total findings</p>
<table><thead><tr><th>Repository</th><th>Grade</th><th>Findings</th><th>Trend</th><th>Alerts</th><th>Last Run</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="margin-top:2rem;font-size:.75rem;color:var(--muted)">Generated ${report.generatedAt.slice(0, 10)} by Judges Panel</p>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── CLI Command ────────────────────────────────────────────────────────────

export function runGovernance(argv: string[]): void {
  let dir = ".";
  let format = "text";

  for (let i = 3; i < argv.length; i++) {
    switch (argv[i]) {
      case "--dir":
      case "-d":
        dir = argv[++i] || ".";
        break;
      case "--html":
        format = "html";
        break;
      case "--json":
        format = "json";
        break;
      case "--format":
        format = argv[++i] || "text";
        break;
    }
  }

  if (!existsSync(dir)) {
    console.error(`Error: Directory not found: ${dir}`);
    console.error("Usage: judges governance --dir ./governance-data");
    process.exit(1);
  }

  const report = buildGovernanceReport(dir);

  if (report.repoCount === 0) {
    console.log("\n  No snapshot files found. Export repo snapshots as JSON files to the governance directory.");
    console.log(`  Expected: ${resolve(dir)}/*.json\n`);
    return;
  }

  switch (format) {
    case "json":
      console.log(JSON.stringify(report, null, 2));
      break;
    case "html":
      console.log(formatGovernanceHtml(report));
      break;
    default:
      console.log(formatGovernanceText(report));
  }
}
