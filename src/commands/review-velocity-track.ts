import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-velocity-track ──────────────────────────────────────────
   Track review velocity and throughput over time — how many reviews
   are completed, average findings per review, and pass rates across
   time periods to measure team improvement.
   ─────────────────────────────────────────────────────────────────── */

interface VelocityData {
  period: string;
  reviewCount: number;
  totalFindings: number;
  avgFindings: number;
  passRate: number;
  avgScore: number;
}

function computeVelocity(verdicts: Array<{ timestamp: string; verdict: TribunalVerdict }>): VelocityData[] {
  const periods = new Map<string, TribunalVerdict[]>();

  for (const entry of verdicts) {
    const date = entry.timestamp.substring(0, 10);
    const group = periods.get(date);
    if (group !== undefined) {
      group.push(entry.verdict);
    } else {
      periods.set(date, [entry.verdict]);
    }
  }

  const velocityData: VelocityData[] = [];
  const sortedPeriods = [...periods.keys()].sort();

  for (const period of sortedPeriods) {
    const vdcts = periods.get(period) ?? [];
    const totalFindings = vdcts.reduce((sum, v) => sum + (v.findings?.length ?? 0), 0);
    const passCount = vdcts.filter((v) => v.overallVerdict === "pass").length;
    const totalScore = vdcts.reduce((sum, v) => sum + (v.overallScore ?? 0), 0);

    velocityData.push({
      period,
      reviewCount: vdcts.length,
      totalFindings,
      avgFindings: vdcts.length > 0 ? totalFindings / vdcts.length : 0,
      passRate: vdcts.length > 0 ? passCount / vdcts.length : 0,
      avgScore: vdcts.length > 0 ? totalScore / vdcts.length : 0,
    });
  }

  return velocityData;
}

export function runReviewVelocityTrack(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-velocity-track [options]

Track review velocity and throughput over time.

Options:
  --dir <path>       Directory with verdict JSON files
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const dirPath =
    dirIdx !== -1 && argv[dirIdx + 1]
      ? join(process.cwd(), argv[dirIdx + 1])
      : join(process.cwd(), ".judges", "history");

  const verdicts: Array<{ timestamp: string; verdict: TribunalVerdict }> = [];

  if (existsSync(dirPath)) {
    const files = (readdirSync(dirPath) as unknown as string[]).filter((f: string) => f.endsWith(".json")).sort();
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
      verdicts.push({
        timestamp: data.timestamp ?? file.replace(/\.json$/, ""),
        verdict: data,
      });
    }
  }

  const defaultPath = join(process.cwd(), ".judges", "last-verdict.json");
  if (existsSync(defaultPath)) {
    const data = JSON.parse(readFileSync(defaultPath, "utf-8")) as TribunalVerdict;
    verdicts.push({
      timestamp: data.timestamp ?? new Date().toISOString(),
      verdict: data,
    });
  }

  if (verdicts.length === 0) {
    console.log("No verdict data found. Run reviews first or provide --dir.");
    return;
  }

  const velocity = computeVelocity(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(velocity, null, 2));
    return;
  }

  console.log("\n=== Review Velocity ===\n");
  console.log(`Total data points: ${verdicts.length}\n`);

  for (const v of velocity) {
    console.log(`${v.period}: ${v.reviewCount} review(s)`);
    console.log(`  Findings: ${v.totalFindings} total, ${v.avgFindings.toFixed(1)} avg`);
    console.log(`  Pass rate: ${(v.passRate * 100).toFixed(0)}%`);
    console.log(`  Avg score: ${v.avgScore.toFixed(1)}`);
    console.log();
  }

  if (velocity.length >= 2) {
    const first = velocity[0];
    const last = velocity[velocity.length - 1];
    const trend =
      last.avgScore > first.avgScore ? "improving" : last.avgScore < first.avgScore ? "declining" : "stable";
    console.log(`Trend: ${trend} (${first.avgScore.toFixed(1)} → ${last.avgScore.toFixed(1)})`);
  }
}
