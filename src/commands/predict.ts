/**
 * Predict — applies trend analysis to finding snapshots to
 * forecast remediation timelines and regression-prone files.
 *
 * All data from local snapshot history.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Snapshot {
  timestamp: string;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface Prediction {
  metric: string;
  currentValue: number;
  trend: "decreasing" | "increasing" | "stable";
  ratePerDay: number;
  estimatedZeroDate: string | null;
  confidence: number;
}

interface PredictionReport {
  predictions: Prediction[];
  regressionRisk: Array<{ file: string; regressionCount: number; risk: string }>;
  timestamp: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function loadSnapshots(): Snapshot[] {
  const paths = [
    join(".judges-snapshots", "history.json"),
    ".judges-snapshots.json",
    join(".judges-burndown", "snapshots.json"),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(data)) return data;
      if (data.snapshots) return data.snapshots;
    } catch {
      /* skip */
    }
  }

  return [];
}

function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const yMean = sumY / n;
  const ssTot = sumY2 - n * yMean * yMean;
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

function predictMetric(snapshots: Snapshot[], field: keyof Omit<Snapshot, "timestamp">): Prediction {
  if (snapshots.length < 2) {
    return {
      metric: field,
      currentValue: (snapshots[0]?.[field] as number) || 0,
      trend: "stable",
      ratePerDay: 0,
      estimatedZeroDate: null,
      confidence: 0,
    };
  }

  const t0 = new Date(snapshots[0].timestamp).getTime();
  const points = snapshots.map((s) => ({
    x: (new Date(s.timestamp).getTime() - t0) / (1000 * 60 * 60 * 24), // days
    y: s[field] as number,
  }));

  const { slope, r2 } = linearRegression(points);
  const current = points[points.length - 1].y;

  let trend: Prediction["trend"] = "stable";
  if (slope < -0.1) trend = "decreasing";
  else if (slope > 0.1) trend = "increasing";

  let estimatedZeroDate: string | null = null;
  if (slope < 0 && current > 0) {
    const daysToZero = -current / slope;
    const zeroDate = new Date(Date.now() + daysToZero * 24 * 60 * 60 * 1000);
    estimatedZeroDate = zeroDate.toISOString().split("T")[0];
  }

  return {
    metric: field,
    currentValue: current,
    trend,
    ratePerDay: Math.round(slope * 100) / 100,
    estimatedZeroDate,
    confidence: Math.round(r2 * 100),
  };
}

function loadRegressionData(): Array<{ file: string; regressionCount: number; risk: string }> {
  const paths = [".judges-regressions.json", join(".judges-regression-alert", "history.json")];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      const files = Array.isArray(data) ? data : data.regressions || [];
      const counts = new Map<string, number>();
      for (const r of files) {
        const file = r.file || r.path || "unknown";
        counts.set(file, (counts.get(file) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([file, count]) => ({
          file,
          regressionCount: count,
          risk: count > 3 ? "high" : count > 1 ? "medium" : "low",
        }))
        .sort((a, b) => b.regressionCount - a.regressionCount);
    } catch {
      /* skip */
    }
  }
  return [];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-predictions";

export function runPredict(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges predict — Forecast remediation timelines and regression risk

Usage:
  judges predict
  judges predict --metric critical
  judges predict --regressions
  judges predict --save

Options:
  --metric <name>       Predict specific metric (findings, critical, high, medium, low)
  --regressions         Show regression-prone files prediction
  --save                Save predictions to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const snapshots = loadSnapshots();

  if (snapshots.length < 2 && !argv.includes("--regressions")) {
    console.log("  Need at least 2 snapshots for predictions.");
    console.log("  Run scans over time and they'll be recorded automatically.");
    return;
  }

  // Single metric
  const metricName = argv.find((_a: string, i: number) => argv[i - 1] === "--metric") as
    | keyof Omit<Snapshot, "timestamp">
    | undefined;
  if (metricName) {
    const pred = predictMetric(snapshots, metricName);
    if (format === "json") {
      console.log(JSON.stringify(pred, null, 2));
    } else {
      console.log(`\n  Prediction: ${pred.metric}\n  ──────────────────────────`);
      console.log(`    Current: ${pred.currentValue}`);
      console.log(`    Trend: ${pred.trend} (${pred.ratePerDay >= 0 ? "+" : ""}${pred.ratePerDay}/day)`);
      console.log(`    Confidence: ${pred.confidence}%`);
      if (pred.estimatedZeroDate) console.log(`    Estimated zero: ${pred.estimatedZeroDate}`);
      console.log("");
    }
    return;
  }

  // Regressions
  if (argv.includes("--regressions")) {
    const regressions = loadRegressionData();
    if (format === "json") {
      console.log(JSON.stringify(regressions, null, 2));
    } else {
      console.log(`\n  Regression-Prone Files\n  ──────────────────────────`);
      if (regressions.length === 0) {
        console.log(`    No regression data found.\n`);
        return;
      }
      for (const r of regressions.slice(0, 15)) {
        console.log(`    [${r.risk.toUpperCase().padEnd(6)}] ${r.file} (${r.regressionCount} regressions)`);
      }
      console.log("");
    }
    return;
  }

  // Full prediction
  const metrics: Array<keyof Omit<Snapshot, "timestamp">> = ["findings", "critical", "high", "medium", "low"];
  const predictions = metrics.map((m) => predictMetric(snapshots, m));
  const regressions = loadRegressionData();

  const report: PredictionReport = {
    predictions,
    regressionRisk: regressions.slice(0, 10),
    timestamp: new Date().toISOString(),
  };

  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "prediction-report.json"), JSON.stringify(report, null, 2));
    console.log(`  Saved to ${STORE}/prediction-report.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Prediction Report (${snapshots.length} snapshots)`);
    console.log(`  ──────────────────────────`);
    for (const p of predictions) {
      const arrow = p.trend === "decreasing" ? "↓" : p.trend === "increasing" ? "↑" : "→";
      const zero = p.estimatedZeroDate ? ` → zero by ${p.estimatedZeroDate}` : "";
      console.log(
        `    ${p.metric.padEnd(12)} ${String(p.currentValue).padEnd(6)} ${arrow} ${p.ratePerDay >= 0 ? "+" : ""}${p.ratePerDay}/day  (${p.confidence}% conf)${zero}`,
      );
    }
    if (regressions.length > 0) {
      console.log(`\n  Regression-Prone Files:`);
      for (const r of regressions.slice(0, 5)) {
        console.log(`    [${r.risk.toUpperCase().padEnd(6)}] ${r.file}`);
      }
    }
    console.log("");
  }
}
