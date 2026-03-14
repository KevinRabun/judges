/**
 * Review-benchmark-self — Benchmark your review metrics against your own history.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BenchmarkSnapshot {
  date: string;
  avgScore: number;
  totalFindings: number;
  criticalCount: number;
  reviewCount: number;
  passRate: number;
}

interface BenchmarkStore {
  version: string;
  snapshots: BenchmarkSnapshot[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const BENCHMARK_FILE = join(".judges", "self-benchmark.json");

function loadStore(): BenchmarkStore {
  if (!existsSync(BENCHMARK_FILE)) return { version: "1.0.0", snapshots: [] };
  try {
    return JSON.parse(readFileSync(BENCHMARK_FILE, "utf-8")) as BenchmarkStore;
  } catch {
    return { version: "1.0.0", snapshots: [] };
  }
}

function saveStore(store: BenchmarkStore): void {
  mkdirSync(dirname(BENCHMARK_FILE), { recursive: true });
  writeFileSync(BENCHMARK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBenchmarkSelf(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-benchmark-self — Benchmark against your own history

Usage:
  judges review-benchmark-self show                Show benchmarks
  judges review-benchmark-self snapshot            Take a snapshot
  judges review-benchmark-self snapshot --score 8.5 --findings 3 --reviews 10
  judges review-benchmark-self compare             Compare latest vs baseline
  judges review-benchmark-self clear               Clear all data

Subcommands:
  show                  Show all snapshots
  snapshot              Take a new snapshot
  compare               Compare latest to first (baseline)
  clear                 Clear all data

Options:
  --score <n>           Average score
  --findings <n>        Total findings
  --reviews <n>         Number of reviews
  --criticals <n>       Critical finding count
  --pass-rate <n>       Pass rate percentage
  --format json         JSON output
  --help, -h            Show this help

Track your improvement over time. Data in .judges/self-benchmark.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "snapshot", "compare", "clear"].includes(a)) || "show";
  const store = loadStore();

  if (subcommand === "snapshot") {
    const avgScore = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const totalFindings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);
    const criticalCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--criticals") || "0", 10);
    const reviewCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--reviews") || "0", 10);
    const passRate = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--pass-rate") || "0");

    store.snapshots.push({
      date: new Date().toISOString().slice(0, 10),
      avgScore,
      totalFindings,
      criticalCount,
      reviewCount,
      passRate,
    });
    saveStore(store);
    console.log(`Snapshot recorded for ${new Date().toISOString().slice(0, 10)}.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", snapshots: [] });
    console.log("Benchmark data cleared.");
    return;
  }

  if (subcommand === "compare") {
    if (store.snapshots.length < 2) {
      console.log("Need at least 2 snapshots to compare. Take more snapshots first.");
      return;
    }

    const baseline = store.snapshots[0];
    const latest = store.snapshots[store.snapshots.length - 1];

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            baseline,
            latest,
            improvements: {
              scoreDelta: latest.avgScore - baseline.avgScore,
              findingDelta: latest.totalFindings - baseline.totalFindings,
              passRateDelta: latest.passRate - baseline.passRate,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log("\nSelf-Benchmark Comparison:");
    console.log("─".repeat(55));
    console.log("                     Baseline         Latest         Delta");
    console.log("─".repeat(55));
    console.log(`  Date:              ${baseline.date.padEnd(17)}${latest.date}`);

    const scoreDelta = latest.avgScore - baseline.avgScore;
    const scoreSign = scoreDelta >= 0 ? "+" : "";
    console.log(
      `  Avg Score:         ${baseline.avgScore.toFixed(1).padEnd(17)}${latest.avgScore.toFixed(1).padEnd(15)}${scoreSign}${scoreDelta.toFixed(1)}`,
    );

    const findingDelta = latest.totalFindings - baseline.totalFindings;
    const findingSign = findingDelta <= 0 ? "" : "+";
    console.log(
      `  Findings:          ${String(baseline.totalFindings).padEnd(17)}${String(latest.totalFindings).padEnd(15)}${findingSign}${findingDelta}`,
    );

    const passRateDelta = latest.passRate - baseline.passRate;
    const passSign = passRateDelta >= 0 ? "+" : "";
    console.log(
      `  Pass Rate:         ${(baseline.passRate.toFixed(1) + "%").padEnd(17)}${(latest.passRate.toFixed(1) + "%").padEnd(15)}${passSign}${passRateDelta.toFixed(1)}%`,
    );

    console.log("─".repeat(55));
    if (scoreDelta > 0) console.log("  Trend: Improving!");
    else if (scoreDelta < 0) console.log("  Trend: Declining — consider reviewing recent changes.");
    else console.log("  Trend: Stable");
    console.log();
    return;
  }

  // show
  if (format === "json") {
    console.log(JSON.stringify(store.snapshots, null, 2));
    return;
  }

  if (store.snapshots.length === 0) {
    console.log("No benchmarks recorded. Use 'judges review-benchmark-self snapshot' to start.");
    return;
  }

  console.log("\nSelf-Benchmark History:");
  console.log("─".repeat(65));
  console.log("  Date         Score   Findings  Criticals  Reviews  Pass Rate");
  console.log("─".repeat(65));
  for (const s of store.snapshots) {
    console.log(
      `  ${s.date}   ${s.avgScore.toFixed(1).padEnd(8)}${String(s.totalFindings).padEnd(10)}${String(s.criticalCount).padEnd(11)}${String(s.reviewCount).padEnd(9)}${s.passRate.toFixed(1)}%`,
    );
  }
  console.log("─".repeat(65));
}
