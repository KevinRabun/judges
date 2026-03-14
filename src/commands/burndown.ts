/**
 * Burndown — track finding resolution progress over time and
 * visualize whether the team is on track to meet targets.
 *
 * Data stored locally in .judges-burndown.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BurndownEntry {
  timestamp: string;
  date: string;
  totalFindings: number;
  bySeverity: Record<string, number>;
  gitCommit?: string;
}

interface BurndownDb {
  entries: BurndownEntry[];
  target?: { count: number; deadline: string };
}

const BURNDOWN_FILE = ".judges-burndown.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = BURNDOWN_FILE): BurndownDb {
  if (!existsSync(file)) return { entries: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: BurndownDb, file = BURNDOWN_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function getGitCommit(): string | undefined {
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return undefined;
  }
}

export function recordSnapshot(findings: Finding[]): BurndownEntry {
  const db = loadDb();
  const now = new Date();
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  const entry: BurndownEntry = {
    timestamp: now.toISOString(),
    date: now.toISOString().split("T")[0],
    totalFindings: findings.length,
    bySeverity,
    gitCommit: getGitCommit(),
  };

  db.entries.push(entry);

  // Keep last 365 entries max
  if (db.entries.length > 365) {
    db.entries = db.entries.slice(-365);
  }

  saveDb(db);
  return entry;
}

export function setTarget(count: number, deadline: string): void {
  const db = loadDb();
  db.target = { count, deadline };
  saveDb(db);
}

export function getBurndownData(): BurndownDb {
  return loadDb();
}

function renderChart(db: BurndownDb): string {
  if (db.entries.length === 0) return "  No data points. Run evaluations to populate.";

  const lines: string[] = [];
  const maxFindings = Math.max(...db.entries.map((e) => e.totalFindings), 1);
  const chartWidth = 50;
  const recent = db.entries.slice(-20); // Last 20 entries

  for (const entry of recent) {
    const barLen = Math.round((entry.totalFindings / maxFindings) * chartWidth);
    const bar = "█".repeat(barLen) + "░".repeat(chartWidth - barLen);
    lines.push(`  ${entry.date}  ${bar}  ${entry.totalFindings}`);
  }

  return lines.join("\n");
}

function calculateTrajectory(db: BurndownDb): string {
  if (db.entries.length < 2) return "  Need at least 2 data points for trajectory.";

  const first = db.entries[0];
  const last = db.entries[db.entries.length - 1];
  const daysBetween = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 86_400_000;
  const delta = last.totalFindings - first.totalFindings;
  const ratePerDay = daysBetween > 0 ? Math.round((delta / daysBetween) * 10) / 10 : 0;

  const parts: string[] = [
    `  Start: ${first.totalFindings} findings (${first.date})`,
    `  Now:   ${last.totalFindings} findings (${last.date})`,
    `  Rate:  ${ratePerDay >= 0 ? "+" : ""}${ratePerDay}/day`,
  ];

  if (db.target) {
    const remaining = last.totalFindings - db.target.count;
    if (remaining <= 0) {
      parts.push(`  Target: ${db.target.count} by ${db.target.deadline} — ✅ ACHIEVED`);
    } else if (ratePerDay >= 0) {
      parts.push(`  Target: ${db.target.count} by ${db.target.deadline} — ⚠️ Findings increasing`);
    } else {
      const daysNeeded = Math.abs(Math.ceil(remaining / ratePerDay));
      const eta = new Date();
      eta.setDate(eta.getDate() + daysNeeded);
      const onTrack = eta.getTime() <= new Date(db.target.deadline).getTime();
      parts.push(
        `  Target: ${db.target.count} by ${db.target.deadline} — ${onTrack ? "✅ On track" : "⚠️ Behind schedule"}`,
        `  ETA:    ${eta.toISOString().split("T")[0]} (${daysNeeded} days at current rate)`,
      );
    }
  }

  return parts.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runBurndown(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges burndown — Track finding resolution progress

Usage:
  judges burndown --record --input results.json    Record a data point
  judges burndown --show                           Show burndown chart
  judges burndown --set-target 50 --deadline 2025-06-01
  judges burndown --trajectory                     Show trajectory analysis

Options:
  --record              Record current findings as data point
  --input <path>        Results JSON file
  --show                Display burndown chart
  --set-target <n>      Set target finding count
  --deadline <date>     Target deadline (YYYY-MM-DD)
  --trajectory          Show rate and ETA analysis
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Record snapshot
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (argv.includes("--record") && inputPath) {
    if (!existsSync(inputPath)) {
      console.error(`Error: file not found: ${inputPath}`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(inputPath, "utf-8"));
    const findings: Finding[] = data.evaluations
      ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
      : data.findings || data;

    const entry = recordSnapshot(findings);
    if (format === "json") {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(`  Recorded: ${entry.totalFindings} findings on ${entry.date}`);
    }
    return;
  }

  // Set target
  const targetStr = argv.find((_a: string, i: number) => argv[i - 1] === "--set-target");
  const deadline = argv.find((_a: string, i: number) => argv[i - 1] === "--deadline");
  if (targetStr && deadline) {
    setTarget(parseInt(targetStr, 10), deadline);
    console.log(`  Target set: ${targetStr} findings by ${deadline}`);
    return;
  }

  const db = getBurndownData();

  // Trajectory
  if (argv.includes("--trajectory")) {
    if (format === "json") {
      console.log(JSON.stringify(db, null, 2));
    } else {
      console.log("\n  Trajectory Analysis\n  ───────────────────");
      console.log(calculateTrajectory(db));
      console.log("");
    }
    return;
  }

  // Show chart (default)
  if (format === "json") {
    console.log(JSON.stringify(db, null, 2));
  } else {
    console.log("\n  Finding Burndown\n  ────────────────");
    console.log(renderChart(db));
    console.log("");
    console.log(calculateTrajectory(db));
    console.log("");
  }
}
