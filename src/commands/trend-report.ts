/**
 * Trend-report — Track finding trends over time to show improvement trajectory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendSnapshot {
  timestamp: string;
  commit: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  filesScanned: number;
  findingsPerFile: number;
}

interface TrendReport {
  snapshots: TrendSnapshot[];
  trend: "improving" | "stable" | "degrading";
  changePercent: number;
  averageFindings: number;
  bestSnapshot: TrendSnapshot | null;
  worstSnapshot: TrendSnapshot | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTrendDir(): string {
  return join(".", ".judges", "trends");
}

function loadSnapshots(): TrendSnapshot[] {
  const dir = getTrendDir();
  const indexPath = join(dir, "trend-index.json");
  if (!existsSync(indexPath)) return [];
  try {
    return JSON.parse(readFileSync(indexPath, "utf-8")) as TrendSnapshot[];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: TrendSnapshot[]): void {
  const dir = getTrendDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "trend-index.json"), JSON.stringify(snapshots, null, 2), "utf-8");
}

function computeTrend(snapshots: TrendSnapshot[]): TrendReport {
  if (snapshots.length === 0) {
    return {
      snapshots: [],
      trend: "stable",
      changePercent: 0,
      averageFindings: 0,
      bestSnapshot: null,
      worstSnapshot: null,
    };
  }

  const sorted = [...snapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const totalSum = sorted.reduce((s, snap) => s + snap.totalFindings, 0);
  const avg = Math.round(totalSum / sorted.length);

  const best = sorted.reduce((b, s) => (s.totalFindings < b.totalFindings ? s : b), sorted[0]);
  const worst = sorted.reduce((w, s) => (s.totalFindings > w.totalFindings ? s : w), sorted[0]);

  let trend: "improving" | "stable" | "degrading" = "stable";
  let changePercent = 0;

  if (sorted.length >= 2) {
    const first = sorted[0].totalFindings;
    const last = sorted[sorted.length - 1].totalFindings;
    if (first > 0) {
      changePercent = Math.round(((last - first) / first) * 100);
    }
    if (changePercent < -10) trend = "improving";
    else if (changePercent > 10) trend = "degrading";
  }

  return { snapshots: sorted, trend, changePercent, averageFindings: avg, bestSnapshot: best, worstSnapshot: worst };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTrendReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges trend-report — Track finding trends over time

Usage:
  judges trend-report record --total 15 --critical 1 --high 3 --medium 6 --low 5 --files 42
  judges trend-report show                    Show trend analysis
  judges trend-report show --format json      JSON output

Subcommands:
  record        Record a snapshot of current findings
  show          Analyze and display trend data

Record Options:
  --total <n>       Total findings count
  --critical <n>    Critical severity count
  --high <n>        High severity count
  --medium <n>      Medium severity count
  --low <n>         Low severity count
  --files <n>       Files scanned count
  --commit <hash>   Associated commit hash

Show Options:
  --format json     JSON output
  --help, -h        Show this help

Snapshots are stored locally in .judges/trends/.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "trend-report") || "show";

  if (subcommand === "record") {
    const getNum = (flag: string): number => {
      const val = argv.find((_a: string, i: number) => argv[i - 1] === flag);
      return val ? parseInt(val, 10) : 0;
    };

    const total = getNum("--total");
    const critical = getNum("--critical");
    const high = getNum("--high");
    const medium = getNum("--medium");
    const low = getNum("--low");
    const filesScanned = getNum("--files");
    const commit = argv.find((_a: string, i: number) => argv[i - 1] === "--commit") || "unknown";

    const snapshot: TrendSnapshot = {
      timestamp: new Date().toISOString(),
      commit,
      totalFindings: total,
      critical,
      high,
      medium,
      low,
      filesScanned,
      findingsPerFile: filesScanned > 0 ? Math.round((total / filesScanned) * 100) / 100 : 0,
    };

    const snapshots = loadSnapshots();
    snapshots.push(snapshot);
    saveSnapshots(snapshots);
    console.log(`Recorded snapshot: ${total} findings across ${filesScanned} files.`);
    return;
  }

  // Show
  const snapshots = loadSnapshots();
  const report = computeTrend(snapshots);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Trend Report\n  ─────────────────────────────`);
  console.log(`    Snapshots: ${report.snapshots.length}`);
  console.log(`    Average findings: ${report.averageFindings}`);

  const trendIcon = report.trend === "improving" ? "📉" : report.trend === "degrading" ? "📈" : "➡️";
  console.log(
    `    Trend: ${trendIcon} ${report.trend} (${report.changePercent > 0 ? "+" : ""}${report.changePercent}%)`,
  );

  if (report.bestSnapshot) {
    console.log(
      `\n    Best: ${report.bestSnapshot.totalFindings} findings (${report.bestSnapshot.timestamp.slice(0, 10)})`,
    );
  }
  if (report.worstSnapshot) {
    console.log(
      `    Worst: ${report.worstSnapshot.totalFindings} findings (${report.worstSnapshot.timestamp.slice(0, 10)})`,
    );
  }

  if (report.snapshots.length > 0) {
    console.log("\n    Recent snapshots:");
    const recent = report.snapshots.slice(-5);
    for (const snap of recent) {
      console.log(
        `      ${snap.timestamp.slice(0, 10)}  ${snap.totalFindings} findings  (C:${snap.critical} H:${snap.high} M:${snap.medium} L:${snap.low})`,
      );
    }
  }

  console.log();
}
