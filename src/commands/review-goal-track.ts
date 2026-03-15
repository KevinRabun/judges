import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-goal-track ──────────────────────────────────────────────
   Track team review quality goals over time by comparing actual
   scores and finding counts against defined targets. Uses local
   history files — no external data storage required.
   ─────────────────────────────────────────────────────────────────── */

interface Goal {
  name: string;
  metric: "score" | "criticalCount" | "highCount" | "findingCount";
  target: number;
  direction: "above" | "below";
}

interface GoalResult {
  name: string;
  metric: string;
  target: number;
  current: number;
  met: boolean;
  trend: string;
}

const DEFAULT_GOALS: Goal[] = [
  { name: "Quality Score", metric: "score", target: 70, direction: "above" },
  { name: "Zero Critical", metric: "criticalCount", target: 0, direction: "below" },
  { name: "Low High Count", metric: "highCount", target: 3, direction: "below" },
  { name: "Finding Budget", metric: "findingCount", target: 20, direction: "below" },
];

function loadGoals(goalsPath: string | undefined): Goal[] {
  if (goalsPath && existsSync(goalsPath)) {
    try {
      return JSON.parse(readFileSync(goalsPath, "utf-8")) as Goal[];
    } catch {
      console.log("Warning: could not parse goals file, using defaults");
    }
  }
  return DEFAULT_GOALS;
}

function getMetricValue(verdict: TribunalVerdict, metric: Goal["metric"]): number {
  switch (metric) {
    case "score":
      return verdict.overallScore ?? 0;
    case "criticalCount":
      return verdict.criticalCount ?? 0;
    case "highCount":
      return verdict.highCount ?? 0;
    case "findingCount":
      return (verdict.findings ?? []).length;
  }
}

function computeTrend(historyDir: string, metric: Goal["metric"]): string {
  if (!existsSync(historyDir)) return "—";

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length < 2) return "—";

  const recent = files.slice(-5);
  const values: number[] = [];
  for (const file of recent) {
    try {
      const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
      values.push(getMetricValue(data, metric));
    } catch {
      // Skip
    }
  }

  if (values.length < 2) return "—";
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return "↑ improving";
  if (last < first) return "↓ declining";
  return "→ stable";
}

function evaluateGoals(verdict: TribunalVerdict, goals: Goal[], historyDir: string): GoalResult[] {
  const results: GoalResult[] = [];

  for (const goal of goals) {
    const current = getMetricValue(verdict, goal.metric);
    const met = goal.direction === "above" ? current >= goal.target : current <= goal.target;
    const trend = computeTrend(historyDir, goal.metric);

    results.push({
      name: goal.name,
      metric: goal.metric,
      target: goal.target,
      current,
      met,
      trend,
    });
  }

  return results;
}

export function runReviewGoalTrack(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-goal-track [options]

Track review quality goals over time.

Options:
  --report <path>      Path to verdict JSON
  --history <path>     Path to history directory
  --goals <path>       Path to custom goals JSON
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

  const goalsIdx = argv.indexOf("--goals");
  const goalsPath = goalsIdx !== -1 && argv[goalsIdx + 1] ? join(process.cwd(), argv[goalsIdx + 1]) : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const goals = loadGoals(goalsPath);
  const results = evaluateGoals(data, goals, historyDir);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const metCount = results.filter((r) => r.met).length;
  console.log(`\n=== Goal Tracking (${metCount}/${results.length} goals met) ===\n`);

  console.log("  " + "Status".padEnd(8) + "Goal".padEnd(20) + "Current".padEnd(10) + "Target".padEnd(10) + "Trend");
  console.log("  " + "-".repeat(60));

  for (const r of results) {
    const icon = r.met ? "✓" : "✗";
    console.log(
      "  " + icon.padEnd(8) + r.name.padEnd(20) + String(r.current).padEnd(10) + String(r.target).padEnd(10) + r.trend,
    );
  }
}
