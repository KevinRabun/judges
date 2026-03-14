/**
 * Finding-trend-report — Generate trend reports from historical findings.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendPoint {
  date: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  score: number;
  ruleCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadVerdictHistory(dir: string): Array<{ date: string; verdict: TribunalVerdict }> {
  if (!existsSync(dir)) return [];
  const results: Array<{ date: string; verdict: TribunalVerdict }> = [];
  const files = readdirSync(dir) as unknown as string[];
  for (const f of files) {
    if (!String(f).endsWith(".json")) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, String(f)), "utf-8"));
      if (data && data.findings) {
        const date = data.timestamp || String(f).replace(".json", "");
        results.push({ date, verdict: data });
      }
    } catch {
      /* skip */
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function buildTrend(history: Array<{ date: string; verdict: TribunalVerdict }>): TrendPoint[] {
  return history.map((h) => ({
    date: h.date,
    totalFindings: h.verdict.findings.length,
    criticalCount: h.verdict.criticalCount,
    highCount: h.verdict.highCount,
    score: h.verdict.overallScore,
    ruleCount: new Set(h.verdict.findings.map((f) => f.ruleId)).size,
  }));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTrendReport(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const lastIdx = argv.indexOf("--last");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : join(process.cwd(), ".judges", "verdicts");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const last = lastIdx >= 0 ? parseInt(argv[lastIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-trend-report — Generate trend reports

Usage:
  judges finding-trend-report [--dir <path>] [--format table|json|chart]
                               [--last <n>]

Options:
  --dir <path>       Directory with historical verdict files
  --format <fmt>     Output format: table (default), json, chart
  --last <n>         Show only last N data points
  --help, -h         Show this help
`);
    return;
  }

  const history = loadVerdictHistory(dir);
  if (history.length === 0) {
    console.log("No verdict history found.");
    return;
  }

  let trend = buildTrend(history);
  if (last > 0) trend = trend.slice(-last);

  if (format === "json") {
    console.log(JSON.stringify(trend, null, 2));
    return;
  }

  if (format === "chart") {
    console.log("\nFinding Trend (ASCII Chart)");
    console.log("═".repeat(60));
    const maxFindings = Math.max(...trend.map((t) => t.totalFindings), 1);
    for (const t of trend) {
      const barLen = Math.round((t.totalFindings / maxFindings) * 40);
      const bar = "█".repeat(barLen);
      const dateStr = t.date.slice(0, 10).padEnd(12);
      console.log(`${dateStr} ${bar} ${t.totalFindings}`);
    }
    console.log("═".repeat(60));
    return;
  }

  console.log(`\nFinding Trend Report (${trend.length} data points)`);
  console.log("═".repeat(70));
  console.log(
    `${"Date".padEnd(22)} ${"Findings".padEnd(10)} ${"Crit".padEnd(6)} ${"High".padEnd(6)} ${"Score".padEnd(7)} Rules`,
  );
  console.log("─".repeat(70));

  for (const t of trend) {
    const dateStr = t.date.slice(0, 19).padEnd(22);
    console.log(
      `${dateStr} ${String(t.totalFindings).padEnd(10)} ${String(t.criticalCount).padEnd(6)} ` +
        `${String(t.highCount).padEnd(6)} ${String(t.score).padEnd(7)} ${t.ruleCount}`,
    );
  }

  if (trend.length >= 2) {
    const first = trend[0];
    const latest = trend[trend.length - 1];
    const findingDelta = latest.totalFindings - first.totalFindings;
    const scoreDelta = latest.score - first.score;
    console.log("─".repeat(70));
    const fd = findingDelta >= 0 ? `+${findingDelta}` : `${findingDelta}`;
    const sd = scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`;
    console.log(`Trend: findings ${fd}, score ${sd}`);
  }
  console.log("═".repeat(70));
}
