import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-quality-baseline ────────────────────────────────────────
   Establish and compare quality baselines from review history.
   Shows current metrics versus the established baseline and
   highlights deviations. All data stays local.
   ─────────────────────────────────────────────────────────────────── */

interface BaselineMetrics {
  avgScore: number;
  avgFindings: number;
  avgCritical: number;
  avgHigh: number;
  passRate: number;
}

interface BaselineComparison {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  status: string;
}

function computeBaseline(historyDir: string): BaselineMetrics | undefined {
  if (!existsSync(historyDir)) return undefined;

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return undefined;

  const scores: number[] = [];
  const findingCounts: number[] = [];
  const criticalCounts: number[] = [];
  const highCounts: number[] = [];
  let passes = 0;

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
      scores.push(data.overallScore ?? 0);
      findingCounts.push((data.findings ?? []).length);
      criticalCounts.push(data.criticalCount ?? 0);
      highCounts.push(data.highCount ?? 0);
      if (data.overallVerdict === "pass") passes++;
    } catch {
      // Skip
    }
  }

  if (scores.length === 0) return undefined;

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    avgScore: avg(scores),
    avgFindings: avg(findingCounts),
    avgCritical: avg(criticalCounts),
    avgHigh: avg(highCounts),
    passRate: Math.round((passes / scores.length) * 100),
  };
}

function compareToBaseline(baseline: BaselineMetrics, current: TribunalVerdict): BaselineComparison[] {
  const comparisons: BaselineComparison[] = [];

  const curScore = current.overallScore ?? 0;
  const curFindings = (current.findings ?? []).length;
  const curCritical = current.criticalCount ?? 0;
  const curHigh = current.highCount ?? 0;

  function status(delta: number, higherIsBetter: boolean): string {
    if (delta === 0) return "On baseline";
    if (higherIsBetter) return delta > 0 ? "Above baseline" : "Below baseline";
    return delta < 0 ? "Better than baseline" : "Worse than baseline";
  }

  comparisons.push({
    metric: "Score",
    baseline: baseline.avgScore,
    current: curScore,
    delta: curScore - baseline.avgScore,
    status: status(curScore - baseline.avgScore, true),
  });

  comparisons.push({
    metric: "Findings",
    baseline: baseline.avgFindings,
    current: curFindings,
    delta: curFindings - baseline.avgFindings,
    status: status(curFindings - baseline.avgFindings, false),
  });

  comparisons.push({
    metric: "Critical",
    baseline: baseline.avgCritical,
    current: curCritical,
    delta: curCritical - baseline.avgCritical,
    status: status(curCritical - baseline.avgCritical, false),
  });

  comparisons.push({
    metric: "High",
    baseline: baseline.avgHigh,
    current: curHigh,
    delta: curHigh - baseline.avgHigh,
    status: status(curHigh - baseline.avgHigh, false),
  });

  return comparisons;
}

export function runReviewQualityBaseline(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-quality-baseline [options]

Compare current review against quality baseline.

Options:
  --report <path>      Path to current verdict JSON
  --history <path>     Path to review history directory
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

  const baseline = computeBaseline(historyDir);
  if (baseline === undefined) {
    console.log("No review history to compute baseline. Run more reviews first.");
    return;
  }

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const current = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const comparisons = compareToBaseline(baseline, current);

  if (format === "json") {
    console.log(JSON.stringify({ baseline, comparisons }, null, 2));
    return;
  }

  console.log(`\n=== Quality Baseline Comparison ===\n`);

  console.log(
    "  " + "Metric".padEnd(12) + "Baseline".padEnd(12) + "Current".padEnd(12) + "Delta".padEnd(10) + "Status",
  );
  console.log("  " + "-".repeat(55));

  for (const c of comparisons) {
    const deltaStr = c.delta >= 0 ? `+${c.delta}` : String(c.delta);
    console.log(
      "  " +
        c.metric.padEnd(12) +
        String(c.baseline).padEnd(12) +
        String(c.current).padEnd(12) +
        deltaStr.padEnd(10) +
        c.status,
    );
  }
}
