import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-trend-alert ────────────────────────────────────────────
   Alert on emerging finding trends by comparing recent review
   verdicts against historical baselines. Identifies spikes in
   specific rules or severity levels to catch regressions early.
   ─────────────────────────────────────────────────────────────────── */

interface TrendAlert {
  ruleId: string;
  severity: string;
  currentCount: number;
  baselineCount: number;
  delta: number;
  alertLevel: string;
  message: string;
}

function detectTrends(currentFindings: Finding[], baselineFindings: Finding[]): TrendAlert[] {
  const alerts: TrendAlert[] = [];

  const currentCounts = new Map<string, { count: number; severity: string }>();
  for (const f of currentFindings) {
    const existing = currentCounts.get(f.ruleId);
    if (existing !== undefined) {
      existing.count += 1;
    } else {
      currentCounts.set(f.ruleId, { count: 1, severity: f.severity });
    }
  }

  const baselineCounts = new Map<string, number>();
  for (const f of baselineFindings) {
    baselineCounts.set(f.ruleId, (baselineCounts.get(f.ruleId) ?? 0) + 1);
  }

  for (const [ruleId, data] of currentCounts) {
    const baseline = baselineCounts.get(ruleId) ?? 0;
    const delta = data.count - baseline;

    if (delta <= 0) continue;

    let alertLevel: string;
    let message: string;

    if (delta >= 5 || (baseline === 0 && data.count >= 3)) {
      alertLevel = "critical";
      message =
        baseline === 0
          ? `New rule ${ruleId} appeared with ${data.count} findings`
          : `Spike: ${ruleId} increased by ${delta} (${baseline} → ${data.count})`;
    } else if (delta >= 2) {
      alertLevel = "warning";
      message = `${ruleId} increased by ${delta} (${baseline} → ${data.count})`;
    } else {
      alertLevel = "info";
      message = `${ruleId} increased by ${delta}`;
    }

    alerts.push({
      ruleId,
      severity: data.severity,
      currentCount: data.count,
      baselineCount: baseline,
      delta,
      alertLevel,
      message,
    });
  }

  alerts.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return (order[a.alertLevel] ?? 3) - (order[b.alertLevel] ?? 3);
  });

  return alerts;
}

export function runFindingTrendAlert(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-trend-alert [options]

Alert on emerging finding trends compared to baseline.

Options:
  --current <path>     Path to current verdict JSON
  --baseline <path>    Path to baseline verdict JSON
  --dir <path>         Directory with historical verdicts
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const currentIdx = argv.indexOf("--current");
  const currentPath =
    currentIdx !== -1 && argv[currentIdx + 1]
      ? join(process.cwd(), argv[currentIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  let currentFindings: Finding[] = [];
  if (existsSync(currentPath)) {
    const data = JSON.parse(readFileSync(currentPath, "utf-8")) as TribunalVerdict;
    currentFindings = data.findings ?? [];
  }

  let baselineFindings: Finding[] = [];
  const baselineIdx = argv.indexOf("--baseline");
  if (baselineIdx !== -1 && argv[baselineIdx + 1]) {
    const bPath = join(process.cwd(), argv[baselineIdx + 1]);
    if (existsSync(bPath)) {
      const data = JSON.parse(readFileSync(bPath, "utf-8")) as TribunalVerdict;
      baselineFindings = data.findings ?? [];
    }
  } else {
    const dirIdx = argv.indexOf("--dir");
    const histDir =
      dirIdx !== -1 && argv[dirIdx + 1]
        ? join(process.cwd(), argv[dirIdx + 1])
        : join(process.cwd(), ".judges", "history");
    if (existsSync(histDir)) {
      const files = (readdirSync(histDir) as unknown as string[]).filter((f: string) => f.endsWith(".json")).sort();
      if (files.length > 0) {
        const latest = files[files.length - 1];
        const data = JSON.parse(readFileSync(join(histDir, latest), "utf-8")) as TribunalVerdict;
        baselineFindings = data.findings ?? [];
      }
    }
  }

  if (currentFindings.length === 0) {
    console.log("No current findings found. Run a review first or provide --current.");
    return;
  }

  const alerts = detectTrends(currentFindings, baselineFindings);

  if (format === "json") {
    console.log(JSON.stringify(alerts, null, 2));
    return;
  }

  console.log("\n=== Finding Trend Alerts ===\n");
  if (alerts.length === 0) {
    console.log("No significant trends detected.");
    return;
  }

  const critical = alerts.filter((a) => a.alertLevel === "critical").length;
  const warning = alerts.filter((a) => a.alertLevel === "warning").length;
  console.log(`Alerts: ${critical} critical, ${warning} warning, ${alerts.length - critical - warning} info\n`);

  for (const alert of alerts) {
    console.log(`[${alert.alertLevel.toUpperCase()}] ${alert.message}`);
    console.log(`  Severity: ${alert.severity} | Delta: +${alert.delta}`);
  }
}
