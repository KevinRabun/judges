import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-time-to-fix ────────────────────────────────────────────
   Estimate time-to-fix for findings based on severity and
   historical data. Uses local history files.
   ─────────────────────────────────────────────────────────────────── */

interface TimeEstimate {
  ruleId: string;
  title: string;
  severity: string;
  estimatedMinutes: number;
  basis: string;
}

const DEFAULT_MINUTES: Record<string, number> = {
  critical: 240,
  high: 120,
  medium: 60,
  low: 30,
  info: 10,
};

function estimateFixTimes(data: TribunalVerdict, historyDir: string): TimeEstimate[] {
  const findings = data.findings ?? [];
  const historicalAvg = new Map<string, number>();

  // Load historical averages if available
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    const ruleTimings = new Map<string, number[]>();

    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".json")) {
        try {
          const hist = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
          for (const f of hist.findings ?? []) {
            const times = ruleTimings.get(f.ruleId) ?? [];
            times.push(DEFAULT_MINUTES[f.severity] ?? 60);
            ruleTimings.set(f.ruleId, times);
          }
        } catch {
          // Skip malformed files
        }
      }
    }

    for (const [ruleId, times] of ruleTimings) {
      const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
      historicalAvg.set(ruleId, avg);
    }
  }

  const estimates: TimeEstimate[] = [];
  for (const f of findings) {
    const historical = historicalAvg.get(f.ruleId);
    const minutes = historical ?? DEFAULT_MINUTES[f.severity] ?? 60;
    const basis = historical !== undefined ? "historical average" : "severity estimate";

    estimates.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      estimatedMinutes: minutes,
      basis,
    });
  }

  estimates.sort((a, b) => b.estimatedMinutes - a.estimatedMinutes);
  return estimates;
}

export function runFindingTimeToFix(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-time-to-fix [options]

Estimate time to fix findings.

Options:
  --report <path>      Path to verdict JSON file
  --history <path>     Path to history directory
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const estimates = estimateFixTimes(data, historyDir);

  if (estimates.length === 0) {
    console.log("No findings — no fix time estimates needed.");
    return;
  }

  const totalMinutes = estimates.reduce((s, e) => s + e.estimatedMinutes, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  if (format === "json") {
    console.log(JSON.stringify({ totalMinutes, totalHours, estimates }, null, 2));
    return;
  }

  console.log(`\n=== Time-to-Fix Estimates (total: ${totalHours}h) ===\n`);
  for (const e of estimates) {
    console.log(`  ${e.ruleId}: ${e.title}`);
    console.log(`    ${e.estimatedMinutes}min (${e.basis}) — ${e.severity}`);
  }
  console.log();
}
