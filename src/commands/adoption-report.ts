/**
 * Adoption report — team-level adoption metrics dashboard
 * showing PR coverage, remediation velocity, and cost savings.
 *
 * All data sourced from local history files.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdoptionMetrics {
  totalScans: number;
  totalFindings: number;
  findingsFixed: number;
  fixRate: number;
  avgRemediationDays: number;
  activeDevelopers: number;
  topCategories: { category: string; count: number }[];
  weeklyTrend: { week: string; scans: number; findings: number }[];
  costSaved: number;
  adoptionScore: number; // 0-100
}

// ─── Data loading ───────────────────────────────────────────────────────────

function loadJsonSafe<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function countDevs(): number {
  const scoreDir = ".judges-scores";
  if (!existsSync(scoreDir)) return 0;
  try {
    const { readdirSync } = require("fs");
    return (readdirSync(scoreDir) as string[]).filter((f: string) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function loadLeaderboard(): Array<{ findingsReviewed: number; findingsFixed: number; scansRun: number }> {
  const file = join(".judges-leaderboard", "leaderboard.json");
  const data = loadJsonSafe<{
    developers: Array<{ findingsReviewed: number; findingsFixed: number; scansRun: number }>;
  }>(file, { developers: [] });
  return data.developers || [];
}

function loadDigestData(): Array<{ timestamp: string; findingCount: number }> {
  const file = ".judges-digest.json";
  const data = loadJsonSafe<{ snapshots: Array<{ timestamp: string; findingCount: number }> }>(file, { snapshots: [] });
  return data.snapshots || [];
}

function loadCostData(): { estimatedCost: number; snapshots: Array<{ estimatedCost: number }> } {
  const file = join(".judges-cost-forecast", "history.json");
  return loadJsonSafe(file, { estimatedCost: 0, snapshots: [] });
}

function loadGateData(): { results: Array<{ passed: boolean; total: number; timestamp: string }> } {
  const file = join(".judges-quality-gate", "gate-history.json");
  return loadJsonSafe(file, { results: [] });
}

// ─── Core ───────────────────────────────────────────────────────────────────

function computeMetrics(): AdoptionMetrics {
  const devs = loadLeaderboard();
  const digests = loadDigestData();
  const costData = loadCostData();
  const gateData = loadGateData();
  const devCount = Math.max(countDevs(), devs.length);

  const totalScans = devs.reduce((s, d) => s + d.scansRun, 0) || gateData.results.length;
  const totalFindings = devs.reduce((s, d) => s + d.findingsReviewed, 0);
  const findingsFixed = devs.reduce((s, d) => s + d.findingsFixed, 0);
  const fixRate = totalFindings > 0 ? Math.round((findingsFixed / totalFindings) * 100) : 0;

  // Category analysis from digest data
  const categoryMap = new Map<string, number>();
  for (const d of digests) {
    const count = d.findingCount || 0;
    const existing = categoryMap.get("general") || 0;
    categoryMap.set("general", existing + count);
  }
  const topCategories = [...categoryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Weekly trend from gate data
  const weeklyMap = new Map<string, { scans: number; findings: number }>();
  for (const r of gateData.results) {
    const week = r.timestamp.slice(0, 10);
    const entry = weeklyMap.get(week) || { scans: 0, findings: 0 };
    entry.scans++;
    entry.findings += r.total;
    weeklyMap.set(week, entry);
  }
  const weeklyTrend = [...weeklyMap.entries()].map(([week, data]) => ({ week, ...data })).slice(-12);

  // Cost saved estimate
  const costSaved =
    costData.snapshots.length > 1
      ? Math.max(
          0,
          costData.snapshots[0].estimatedCost - costData.snapshots[costData.snapshots.length - 1].estimatedCost,
        )
      : 0;

  // Adoption score: 0-100
  let adoptionScore = 0;
  if (totalScans > 0) adoptionScore += 20;
  if (totalScans > 50) adoptionScore += 10;
  if (devCount >= 3) adoptionScore += 15;
  if (devCount >= 10) adoptionScore += 10;
  if (fixRate >= 50) adoptionScore += 15;
  if (fixRate >= 80) adoptionScore += 10;
  if (gateData.results.length > 0) adoptionScore += 10;
  if (costData.snapshots.length > 0) adoptionScore += 10;

  return {
    totalScans,
    totalFindings,
    findingsFixed,
    fixRate,
    avgRemediationDays: 0, // Would need timestamp analysis
    activeDevelopers: devCount,
    topCategories,
    weeklyTrend,
    costSaved,
    adoptionScore: Math.min(100, adoptionScore),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAdoptionReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges adoption-report — Team adoption metrics dashboard

Usage:
  judges adoption-report
  judges adoption-report --summary
  judges adoption-report --trends
  judges adoption-report --executive

Options:
  --summary               One-line adoption summary
  --trends                Show weekly scan/findings trends
  --executive             Executive summary (short, formatted for leadership)
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const metrics = computeMetrics();

  // Summary
  if (argv.includes("--summary")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          { adoptionScore: metrics.adoptionScore, totalScans: metrics.totalScans, fixRate: metrics.fixRate },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `  Adoption: ${metrics.adoptionScore}/100 | Scans: ${metrics.totalScans} | Fix rate: ${metrics.fixRate}% | Devs: ${metrics.activeDevelopers}`,
      );
    }
    return;
  }

  // Trends
  if (argv.includes("--trends")) {
    if (format === "json") {
      console.log(JSON.stringify(metrics.weeklyTrend, null, 2));
    } else {
      console.log(`\n  Weekly Trends\n  ──────────────────────────`);
      if (metrics.weeklyTrend.length === 0) {
        console.log("    No trend data yet. Use pr-quality-gate --check to record gate decisions.");
      } else {
        for (const w of metrics.weeklyTrend) {
          const bar = "█".repeat(Math.min(40, w.scans));
          console.log(
            `    ${w.week}  ${w.scans.toString().padEnd(4)} scans  ${w.findings.toString().padEnd(4)} findings  ${bar}`,
          );
        }
      }
      console.log("");
    }
    return;
  }

  // Executive summary
  if (argv.includes("--executive")) {
    if (format === "json") {
      console.log(JSON.stringify(metrics, null, 2));
    } else {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║     Judges Adoption — Executive Report   ║
  ╠══════════════════════════════════════════╣
  ║  Adoption Score:  ${metrics.adoptionScore.toString().padEnd(3)}/100                  ║
  ║  Active Devs:     ${metrics.activeDevelopers.toString().padEnd(24)}║
  ║  Total Scans:     ${metrics.totalScans.toString().padEnd(24)}║
  ║  Findings Caught: ${metrics.totalFindings.toString().padEnd(24)}║
  ║  Fix Rate:        ${(metrics.fixRate + "%").padEnd(24)}║
  ║  Cost Saved:      $${metrics.costSaved.toLocaleString().padEnd(23)}║
  ╚══════════════════════════════════════════╝
`);
    }
    return;
  }

  // Full report
  if (format === "json") {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log(`\n  Judges Adoption Report\n  ──────────────────────────`);
    console.log(`  Adoption Score:    ${metrics.adoptionScore}/100`);
    console.log(`  Active Developers: ${metrics.activeDevelopers}`);
    console.log(`  Total Scans:       ${metrics.totalScans}`);
    console.log(`  Total Findings:    ${metrics.totalFindings}`);
    console.log(`  Findings Fixed:    ${metrics.findingsFixed}`);
    console.log(`  Fix Rate:          ${metrics.fixRate}%`);
    console.log(`  Cost Saved:        $${metrics.costSaved.toLocaleString()}`);
    if (metrics.topCategories.length > 0) {
      console.log(`\n  Top Categories:`);
      for (const c of metrics.topCategories) {
        console.log(`    ${c.category.padEnd(15)} ${c.count} findings`);
      }
    }
    if (metrics.weeklyTrend.length > 0) {
      console.log(`\n  Recent Trends:`);
      for (const w of metrics.weeklyTrend.slice(-5)) {
        console.log(`    ${w.week}  ${w.scans} scans, ${w.findings} findings`);
      }
    }
    console.log("");
  }
}
