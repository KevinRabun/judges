/**
 * Finding-severity-trend — Track severity distribution trends over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeveritySnapshot {
  timestamp: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function trendFile(): string {
  return join(process.cwd(), ".judges", "severity-trend.json");
}

function loadTrend(): SeveritySnapshot[] {
  const f = trendFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveTrend(data: SeveritySnapshot[]): void {
  const f = trendFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(data.slice(-200), null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityTrend(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges finding-severity-trend — Track severity trends over time

Usage:
  judges finding-severity-trend record --file <results.json>
  judges finding-severity-trend show   [--last <n>] [--format json]
  judges finding-severity-trend clear

Subcommands:
  record       Record severity distribution from a result file
  show         Show trend data
  clear        Clear trend history

Options:
  --file <path>    Result file to record from
  --last <n>       Show last N snapshots (default: 10)
  --format json    JSON output
  --help, -h       Show this help
`);
    return;
  }

  const args = argv.slice(1);

  if (sub === "record") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let data: { findings?: Array<{ severity?: string }> };
    try {
      data = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.error("Error: could not parse file");
      process.exitCode = 1;
      return;
    }

    const findings = data.findings || [];
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) {
      const sev = (f.severity || "medium").toLowerCase();
      if (sev in counts) counts[sev]++;
    }

    const snapshot: SeveritySnapshot = {
      timestamp: new Date().toISOString(),
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      info: counts.info,
      total: findings.length,
    };

    const trend = loadTrend();
    trend.push(snapshot);
    saveTrend(trend);
    console.log(
      `Recorded: ${findings.length} findings (C:${counts.critical} H:${counts.high} M:${counts.medium} L:${counts.low} I:${counts.info})`,
    );
  } else if (sub === "show") {
    const lastStr = args.find((_a: string, i: number) => args[i - 1] === "--last");
    const last = lastStr ? parseInt(lastStr, 10) : 10;
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";

    const trend = loadTrend();
    const display = trend.slice(-last);

    if (format === "json") {
      console.log(JSON.stringify({ snapshots: display.length, trend: display }, null, 2));
      return;
    }

    if (display.length === 0) {
      console.log("No trend data recorded yet.");
      return;
    }

    console.log(`\nSeverity Trend (last ${display.length} snapshots):`);
    console.log("═".repeat(70));
    console.log(
      `  ${"Date".padEnd(12)} ${"Total".padStart(6)} ${"Crit".padStart(5)} ${"High".padStart(5)} ${"Med".padStart(5)} ${"Low".padStart(5)} ${"Info".padStart(5)}`,
    );
    console.log("─".repeat(70));
    for (const s of display) {
      console.log(
        `  ${s.timestamp.slice(0, 10).padEnd(12)} ${String(s.total).padStart(6)} ${String(s.critical).padStart(5)} ${String(s.high).padStart(5)} ${String(s.medium).padStart(5)} ${String(s.low).padStart(5)} ${String(s.info).padStart(5)}`,
      );
    }
    console.log("═".repeat(70));
  } else if (sub === "clear") {
    saveTrend([]);
    console.log("Severity trend data cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
