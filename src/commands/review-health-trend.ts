import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-health-trend ────────────────────────────────────────────
   Track review health over time by computing a composite health
   score from finding counts, severities, and pass rates. Shows
   whether code health is improving, stable, or declining.
   ─────────────────────────────────────────────────────────────────── */

interface HealthSnapshot {
  period: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  passRate: number;
}

interface HealthTrend {
  snapshots: HealthSnapshot[];
  trend: string;
  currentScore: number;
  averageScore: number;
}

function computeHealthScore(verdict: TribunalVerdict): number {
  const findings = verdict.findings ?? [];
  if (findings.length === 0) return 100;

  let penalty = 0;
  for (const f of findings) {
    if (f.severity === "critical") penalty += 15;
    else if (f.severity === "high") penalty += 10;
    else if (f.severity === "medium") penalty += 5;
    else if (f.severity === "low") penalty += 2;
    else penalty += 1;
  }

  return Math.max(0, 100 - penalty);
}

function buildTrend(historyDir: string): HealthTrend {
  if (!existsSync(historyDir)) {
    return { snapshots: [], trend: "unknown", currentScore: 0, averageScore: 0 };
  }

  const files = readdirSync(historyDir) as unknown as string[];
  const jsonFiles = files.filter((f) => String(f).endsWith(".json")).sort();

  const snapshots: HealthSnapshot[] = [];

  for (const file of jsonFiles) {
    const raw = readFileSync(join(historyDir, String(file)), "utf-8");
    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(raw) as TribunalVerdict;
    } catch {
      continue;
    }

    const score = computeHealthScore(verdict);
    const findings = verdict.findings ?? [];
    const criticals = findings.filter((f) => f.severity === "critical").length;
    const passRate = verdict.overallVerdict === "pass" ? 100 : 0;

    snapshots.push({
      period: String(file).replace(/\.json$/, ""),
      score,
      findingCount: findings.length,
      criticalCount: criticals,
      passRate,
    });
  }

  if (snapshots.length === 0) {
    return { snapshots, trend: "unknown", currentScore: 0, averageScore: 0 };
  }

  const currentScore = snapshots[snapshots.length - 1].score;
  const averageScore = Math.round(snapshots.reduce((sum, s) => sum + s.score, 0) / snapshots.length);

  let trend: string;
  if (snapshots.length < 3) {
    trend = "insufficient data";
  } else {
    const recent = snapshots.slice(-3);
    const first = recent[0].score;
    const last = recent[recent.length - 1].score;
    if (last > first + 5) trend = "improving";
    else if (last < first - 5) trend = "declining";
    else trend = "stable";
  }

  return { snapshots, trend, currentScore, averageScore };
}

export function runReviewHealthTrend(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-health-trend [options]

Track review health over time with composite scoring.

Options:
  --history <dir>      Directory with verdict JSON files (default: .judges/history)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const histIdx = argv.indexOf("--history");
  const historyDir =
    histIdx !== -1 && argv[histIdx + 1]
      ? join(process.cwd(), argv[histIdx + 1])
      : join(process.cwd(), ".judges", "history");

  const result = buildTrend(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n=== Review Health Trend ===\n`);
  console.log(`  Current Score: ${result.currentScore}/100`);
  console.log(`  Average Score: ${result.averageScore}/100`);
  console.log(`  Trend:         ${result.trend}`);
  console.log(`  Data Points:   ${result.snapshots.length}`);

  if (result.snapshots.length > 0) {
    console.log();
    for (const s of result.snapshots) {
      const bar = "█".repeat(Math.round(s.score / 5));
      console.log(`  ${s.period.padEnd(20)} ${String(s.score).padStart(3)}/100 ${bar}`);
    }
  }
}
