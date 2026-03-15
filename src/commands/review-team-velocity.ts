import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-team-velocity ───────────────────────────────────────────
   Track team review velocity metrics: reviews per period, findings
   resolved, score trends. Uses local history files to compute
   velocity without external data storage.
   ─────────────────────────────────────────────────────────────────── */

interface VelocityPeriod {
  period: string;
  reviews: number;
  findings: number;
  avgScore: number;
  passRate: number;
}

interface VelocityReport {
  totalReviews: number;
  periods: VelocityPeriod[];
  avgReviewsPerPeriod: number;
  acceleration: string;
}

function computeVelocity(historyDir: string): VelocityReport {
  const empty: VelocityReport = {
    totalReviews: 0,
    periods: [],
    avgReviewsPerPeriod: 0,
    acceleration: "unknown",
  };

  if (!existsSync(historyDir)) return empty;

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return empty;

  // Group by month from timestamps
  const monthMap = new Map<string, { reviews: number; findings: number; scores: number[]; passes: number }>();

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
      const ts = data.timestamp ?? file.replace(".json", "");
      const month = ts.slice(0, 7) || "unknown";
      const entry = monthMap.get(month) ?? { reviews: 0, findings: 0, scores: [], passes: 0 };
      entry.reviews++;
      entry.findings += (data.findings ?? []).length;
      entry.scores.push(data.overallScore ?? 0);
      if (data.overallVerdict === "pass") entry.passes++;
      monthMap.set(month, entry);
    } catch {
      // Skip
    }
  }

  const periods: VelocityPeriod[] = [];
  for (const [month, data] of monthMap) {
    const avgScore =
      data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;
    periods.push({
      period: month,
      reviews: data.reviews,
      findings: data.findings,
      avgScore,
      passRate: data.reviews > 0 ? Math.round((data.passes / data.reviews) * 100) : 0,
    });
  }

  periods.sort((a, b) => a.period.localeCompare(b.period));

  const totalReviews = periods.reduce((s, p) => s + p.reviews, 0);
  const avgPerPeriod = periods.length > 0 ? Math.round(totalReviews / periods.length) : 0;

  let acceleration = "stable";
  if (periods.length >= 2) {
    const firstHalf = periods.slice(0, Math.floor(periods.length / 2));
    const secondHalf = periods.slice(Math.floor(periods.length / 2));
    const firstAvg = firstHalf.reduce((s, p) => s + p.reviews, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, p) => s + p.reviews, 0) / secondHalf.length;
    if (secondAvg > firstAvg * 1.1) acceleration = "accelerating";
    else if (secondAvg < firstAvg * 0.9) acceleration = "decelerating";
  }

  return { totalReviews, periods, avgReviewsPerPeriod: avgPerPeriod, acceleration };
}

export function runReviewTeamVelocity(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-team-velocity [options]

Track team review velocity metrics.

Options:
  --history <path>     Path to review history directory
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

  const report = computeVelocity(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Team Velocity (${report.totalReviews} reviews, ${report.acceleration}) ===\n`);

  if (report.periods.length === 0) {
    console.log("No review history found.");
    return;
  }

  console.log(
    "  " + "Period".padEnd(12) + "Reviews".padEnd(10) + "Findings".padEnd(10) + "Avg Score".padEnd(12) + "Pass Rate",
  );
  console.log("  " + "-".repeat(55));

  for (const p of report.periods) {
    console.log(
      "  " +
        p.period.padEnd(12) +
        String(p.reviews).padEnd(10) +
        String(p.findings).padEnd(10) +
        String(p.avgScore).padEnd(12) +
        `${p.passRate}%`,
    );
  }

  console.log(`\n  Avg Reviews/Period: ${report.avgReviewsPerPeriod}`);
  console.log(`  Trend: ${report.acceleration}`);
}
