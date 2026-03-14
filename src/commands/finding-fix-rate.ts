/**
 * Finding-fix-rate — Track how quickly findings are being resolved over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FixEvent {
  ruleId: string;
  severity: string;
  foundAt: string;
  fixedAt: string;
  daysToFix: number;
}

interface FixRateStore {
  version: string;
  events: FixEvent[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const FIX_RATE_FILE = join(".judges", "fix-rate.json");

function loadStore(): FixRateStore {
  if (!existsSync(FIX_RATE_FILE)) return { version: "1.0.0", events: [] };
  try {
    return JSON.parse(readFileSync(FIX_RATE_FILE, "utf-8")) as FixRateStore;
  } catch {
    return { version: "1.0.0", events: [] };
  }
}

function saveStore(store: FixRateStore): void {
  mkdirSync(dirname(FIX_RATE_FILE), { recursive: true });
  writeFileSync(FIX_RATE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFixRate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-fix-rate — Track finding resolution speed

Usage:
  judges finding-fix-rate show                     Show fix rate metrics
  judges finding-fix-rate record --rule SEC-001 --severity high --days 3
  judges finding-fix-rate trend                    Show trend over time
  judges finding-fix-rate clear                    Clear all data

Subcommands:
  show                  Show fix rate summary
  record                Record a fix event
  trend                 Show fix rate trends
  clear                 Clear all data

Options:
  --rule <ruleId>       Rule ID of the fixed finding
  --severity <level>    Severity (critical, high, medium, low)
  --days <n>            Days to fix
  --last <n>            Show last N events (default: 20)
  --format json         JSON output
  --help, -h            Show this help

Tracks how quickly findings are resolved. Data in .judges/fix-rate.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "trend", "clear"].includes(a)) || "show";
  const store = loadStore();

  if (subcommand === "record") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "UNKNOWN";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "medium";
    const days = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--days") || "1", 10);
    const now = new Date();
    const foundDate = new Date(now.getTime() - days * 86400000);

    store.events.push({
      ruleId,
      severity,
      foundAt: foundDate.toISOString(),
      fixedAt: now.toISOString(),
      daysToFix: days,
    });
    saveStore(store);
    console.log(`Recorded fix: ${ruleId} (${severity}) resolved in ${days} day(s).`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", events: [] });
    console.log("Fix rate data cleared.");
    return;
  }

  if (subcommand === "trend") {
    if (store.events.length === 0) {
      console.log("No fix events recorded yet.");
      return;
    }
    // Group by month
    const monthly = new Map<string, number[]>();
    for (const e of store.events) {
      const month = e.fixedAt.slice(0, 7);
      const list = monthly.get(month) || [];
      list.push(e.daysToFix);
      monthly.set(month, list);
    }

    if (format === "json") {
      const trend = [...monthly.entries()].map(([month, days]) => ({
        month,
        avgDays: days.reduce((s, d) => s + d, 0) / days.length,
        fixes: days.length,
      }));
      console.log(JSON.stringify(trend, null, 2));
      return;
    }

    console.log("\nFix Rate Trend:");
    console.log("─".repeat(50));
    for (const [month, days] of monthly) {
      const avg = days.reduce((s, d) => s + d, 0) / days.length;
      const bar = "█".repeat(Math.min(Math.round(avg), 30));
      console.log(`  ${month}  avg ${avg.toFixed(1)}d  (${days.length} fixes)  ${bar}`);
    }
    console.log("─".repeat(50));
    return;
  }

  // show
  if (store.events.length === 0) {
    console.log("No fix events recorded. Use 'judges finding-fix-rate record' to track fixes.");
    return;
  }

  const avgDays = store.events.reduce((s, e) => s + e.daysToFix, 0) / store.events.length;
  const criticals = store.events.filter((e) => e.severity === "critical");
  const avgCriticalDays = criticals.length > 0 ? criticals.reduce((s, e) => s + e.daysToFix, 0) / criticals.length : 0;

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          totalFixes: store.events.length,
          avgDaysToFix: avgDays,
          avgCriticalDaysToFix: avgCriticalDays,
          bySeverity: {
            critical: criticals.length,
            high: store.events.filter((e) => e.severity === "high").length,
            medium: store.events.filter((e) => e.severity === "medium").length,
            low: store.events.filter((e) => e.severity === "low").length,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\nFix Rate Summary:");
  console.log("─".repeat(40));
  console.log(`  Total fixes:           ${store.events.length}`);
  console.log(`  Avg days to fix:       ${avgDays.toFixed(1)}`);
  console.log(`  Avg critical fix time: ${avgCriticalDays > 0 ? avgCriticalDays.toFixed(1) + "d" : "N/A"}`);
  console.log(`  Critical fixes:        ${criticals.length}`);
  console.log(`  High fixes:            ${store.events.filter((e) => e.severity === "high").length}`);
  console.log(`  Medium fixes:          ${store.events.filter((e) => e.severity === "medium").length}`);
  console.log(`  Low fixes:             ${store.events.filter((e) => e.severity === "low").length}`);
  console.log("─".repeat(40));
}
