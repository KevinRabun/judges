/**
 * Cost forecast — projects 30/60/90-day security debt and
 * remediation cost trends from local finding history.
 *
 * All data stays local — no upload or external services.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CostSnapshot {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalFindings: number;
  estimatedCost: number;
}

interface CostForecast {
  snapshots: CostSnapshot[];
  projections: { period: string; estimatedCost: number; findings: number }[];
  trend: "improving" | "stable" | "degrading";
  updatedAt: string;
}

const COST_DIR = ".judges-cost-forecast";
const COST_FILE = join(COST_DIR, "history.json");

// Cost per finding by severity (industry averages, configurable)
const DEFAULT_COST_PER_FINDING: Record<string, number> = {
  critical: 15000,
  high: 5000,
  medium: 1500,
  low: 300,
};

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(COST_DIR)) mkdirSync(COST_DIR, { recursive: true });
}

function loadHistory(): CostForecast {
  if (!existsSync(COST_FILE)) {
    return { snapshots: [], projections: [], trend: "stable", updatedAt: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(COST_FILE, "utf-8"));
  } catch {
    return { snapshots: [], projections: [], trend: "stable", updatedAt: new Date().toISOString() };
  }
}

function saveHistory(data: CostForecast): void {
  ensureDir();
  data.updatedAt = new Date().toISOString();
  writeFileSync(COST_FILE, JSON.stringify(data, null, 2));
}

function estimateCost(snap: Omit<CostSnapshot, "estimatedCost" | "date" | "totalFindings">): number {
  return (
    snap.critical * DEFAULT_COST_PER_FINDING.critical +
    snap.high * DEFAULT_COST_PER_FINDING.high +
    snap.medium * DEFAULT_COST_PER_FINDING.medium +
    snap.low * DEFAULT_COST_PER_FINDING.low
  );
}

export function recordSnapshot(critical: number, high: number, medium: number, low: number): CostSnapshot {
  const totalFindings = critical + high + medium + low;
  const estimatedCostVal = estimateCost({ critical, high, medium, low });

  const snapshot: CostSnapshot = {
    date: new Date().toISOString().slice(0, 10),
    critical,
    high,
    medium,
    low,
    totalFindings,
    estimatedCost: estimatedCostVal,
  };

  const history = loadHistory();
  history.snapshots.push(snapshot);
  if (history.snapshots.length > 365) history.snapshots = history.snapshots.slice(-365);

  // Compute trend
  if (history.snapshots.length >= 2) {
    const recent = history.snapshots.slice(-5);
    const first = recent[0].estimatedCost;
    const last = recent[recent.length - 1].estimatedCost;
    if (last < first * 0.9) history.trend = "improving";
    else if (last > first * 1.1) history.trend = "degrading";
    else history.trend = "stable";
  }

  // Project forward
  history.projections = [];
  const avgRate =
    history.snapshots.length >= 2
      ? (history.snapshots[history.snapshots.length - 1].totalFindings - history.snapshots[0].totalFindings) /
        history.snapshots.length
      : 0;
  const currentFindings = totalFindings;
  const currentCost = estimatedCostVal;

  for (const period of [30, 60, 90]) {
    const projFindings = Math.max(0, Math.round(currentFindings + avgRate * period));
    const projCost = Math.round(currentCost * (projFindings / Math.max(1, currentFindings)));
    history.projections.push({
      period: `${period}-day`,
      estimatedCost: projCost,
      findings: projFindings,
    });
  }

  saveHistory(history);
  return snapshot;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCostForecast(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges cost-forecast — Security debt cost projections

Usage:
  judges cost-forecast --record --critical 2 --high 5 --medium 12 --low 20
  judges cost-forecast --report
  judges cost-forecast --projections
  judges cost-forecast --cost-table

Options:
  --record                  Record a new cost snapshot
  --critical <n>            Number of critical findings (default: 0)
  --high <n>                Number of high findings (default: 0)
  --medium <n>              Number of medium findings (default: 0)
  --low <n>                 Number of low findings (default: 0)
  --report                  Show full cost history and trends
  --projections             Show 30/60/90-day projections
  --cost-table              Show cost-per-finding table
  --format json             JSON output
  --help, -h                Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Cost table
  if (argv.includes("--cost-table")) {
    if (format === "json") {
      console.log(JSON.stringify(DEFAULT_COST_PER_FINDING, null, 2));
    } else {
      console.log(`\n  Cost Per Finding (Industry Averages)\n  ──────────────────────────`);
      console.log(`    Critical:  $${DEFAULT_COST_PER_FINDING.critical.toLocaleString()}`);
      console.log(`    High:      $${DEFAULT_COST_PER_FINDING.high.toLocaleString()}`);
      console.log(`    Medium:    $${DEFAULT_COST_PER_FINDING.medium.toLocaleString()}`);
      console.log(`    Low:       $${DEFAULT_COST_PER_FINDING.low.toLocaleString()}`);
      console.log(`\n  Based on: NIST/Ponemon incident cost research\n`);
    }
    return;
  }

  // Record snapshot
  if (argv.includes("--record")) {
    const critical = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--critical") || "0", 10);
    const high = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--high") || "0", 10);
    const medium = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--medium") || "0", 10);
    const low = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--low") || "0", 10);

    const snap = recordSnapshot(critical, high, medium, low);
    if (format === "json") {
      console.log(JSON.stringify(snap, null, 2));
    } else {
      console.log(`\n  ✅ Cost Snapshot Recorded — ${snap.date}`);
      console.log(
        `     Findings: ${snap.totalFindings} (C:${snap.critical} H:${snap.high} M:${snap.medium} L:${snap.low})`,
      );
      console.log(`     Estimated cost: $${snap.estimatedCost.toLocaleString()}\n`);
    }
    return;
  }

  // Projections
  if (argv.includes("--projections")) {
    const history = loadHistory();
    if (history.projections.length === 0) {
      console.log("  No data yet. Record snapshots with --record first.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(history.projections, null, 2));
    } else {
      console.log(`\n  Cost Projections (trend: ${history.trend})\n  ──────────────────────────`);
      for (const p of history.projections) {
        console.log(
          `    ${p.period.padEnd(10)} ${p.findings.toString().padEnd(8)} findings  $${p.estimatedCost.toLocaleString()}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Full report
  const history = loadHistory();
  if (format === "json") {
    console.log(JSON.stringify(history, null, 2));
  } else {
    console.log(`\n  Cost Forecast Report\n  ──────────────────────────`);
    console.log(`  Trend: ${history.trend} | Snapshots: ${history.snapshots.length}`);
    if (history.snapshots.length > 0) {
      console.log(`\n  Recent History:`);
      for (const s of history.snapshots.slice(-10)) {
        console.log(
          `    ${s.date}  ${s.totalFindings.toString().padEnd(6)} findings  $${s.estimatedCost.toLocaleString()}`,
        );
      }
    }
    if (history.projections.length > 0) {
      console.log(`\n  Projections:`);
      for (const p of history.projections) {
        console.log(
          `    ${p.period.padEnd(10)} ${p.findings.toString().padEnd(6)} findings  $${p.estimatedCost.toLocaleString()}`,
        );
      }
    }
    console.log("");
  }
}
