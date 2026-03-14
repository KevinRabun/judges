/**
 * Finding-trend — Show finding trends over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendSnapshot {
  timestamp: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface TrendStore {
  version: string;
  snapshots: TrendSnapshot[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const TREND_FILE = ".judges/finding-trends.json";

function loadStore(): TrendStore {
  if (!existsSync(TREND_FILE)) {
    return { version: "1.0.0", snapshots: [] };
  }
  try {
    return JSON.parse(readFileSync(TREND_FILE, "utf-8")) as TrendStore;
  } catch {
    return { version: "1.0.0", snapshots: [] };
  }
}

function saveStore(store: TrendStore): void {
  mkdirSync(dirname(TREND_FILE), { recursive: true });
  writeFileSync(TREND_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countFromResults(file: string): {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const counts = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  if (!existsSync(file)) return counts;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    const findings = Array.isArray(data) ? data : data.findings || [];
    for (const f of findings) {
      counts.total++;
      const sev = (f.severity || "medium").toLowerCase();
      if (sev === "critical") counts.critical++;
      else if (sev === "high") counts.high++;
      else if (sev === "medium") counts.medium++;
      else counts.low++;
    }
  } catch {
    // ignore
  }
  return counts;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTrend(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-trend — Show finding trends over time

Usage:
  judges finding-trend                     Show trend summary
  judges finding-trend record --file <f>   Record a snapshot from results file
  judges finding-trend list                List all snapshots
  judges finding-trend clear               Clear all trend data

Options:
  --file <path>     Results file to snapshot
  --last <n>        Show last N snapshots (default: 10)
  --format json     JSON output
  --help, -h        Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["record", "list", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "record") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    const counts = countFromResults(file);
    const snapshot: TrendSnapshot = { timestamp: new Date().toISOString(), ...counts };
    store.snapshots.push(snapshot);
    saveStore(store);
    console.log(
      `Recorded: ${counts.total} findings (${counts.critical}C/${counts.high}H/${counts.medium}M/${counts.low}L)`,
    );
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", snapshots: [] });
    console.log("Trend data cleared.");
    return;
  }

  // Default / list: show trend
  const lastN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "10", 10);
  const recent = store.snapshots.slice(-lastN);

  if (recent.length === 0) {
    console.log("No trend data. Use 'judges finding-trend record --file <f>' to start tracking.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(recent, null, 2));
    return;
  }

  console.log("\nFinding Trends:");
  console.log("═".repeat(70));
  console.log("  Date                  Total   Crit   High   Med    Low");
  console.log("─".repeat(70));
  for (const s of recent) {
    const d = s.timestamp.slice(0, 19).replace("T", " ");
    console.log(
      `  ${d}  ${String(s.total).padStart(5)}  ${String(s.critical).padStart(5)}  ${String(s.high).padStart(5)}  ${String(s.medium).padStart(5)}  ${String(s.low).padStart(5)}`,
    );
  }
  console.log("═".repeat(70));

  if (recent.length >= 2) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const delta = last.total - first.total;
    const direction = delta > 0 ? "↑ increasing" : delta < 0 ? "↓ decreasing" : "→ stable";
    console.log(`  Trend: ${direction} (${delta >= 0 ? "+" : ""}${delta} findings)`);
  }
}
