import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-ci-insight ──────────────────────────────────────────────
   CI pipeline performance insights from review data — correlate
   review findings with build times, failure rates, and deployment
   frequency to identify quality-pipeline bottlenecks.
   ─────────────────────────────────────────────────────────────────── */

interface CiInsight {
  metric: string;
  value: string;
  trend: string;
  recommendation: string;
}

function analyzeCiData(verdicts: TribunalVerdict[]): CiInsight[] {
  const insights: CiInsight[] = [];

  if (verdicts.length === 0) return insights;

  const totalFindings = verdicts.reduce((sum, v) => sum + (v.findings?.length ?? 0), 0);
  const avgFindings = totalFindings / verdicts.length;

  const criticalTotal = verdicts.reduce((sum, v) => sum + (v.criticalCount ?? 0), 0);
  const highTotal = verdicts.reduce((sum, v) => sum + (v.highCount ?? 0), 0);

  const passRate = verdicts.filter((v) => v.overallVerdict === "pass").length / verdicts.length;

  const scores = verdicts.map((v) => v.overallScore ?? 0);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const recentHalf = verdicts.slice(Math.floor(verdicts.length / 2));
  const olderHalf = verdicts.slice(0, Math.floor(verdicts.length / 2));
  const recentAvg =
    recentHalf.length > 0 ? recentHalf.reduce((s, v) => s + (v.overallScore ?? 0), 0) / recentHalf.length : 0;
  const olderAvg =
    olderHalf.length > 0 ? olderHalf.reduce((s, v) => s + (v.overallScore ?? 0), 0) / olderHalf.length : 0;
  const scoreTrend = recentAvg > olderAvg ? "improving" : recentAvg < olderAvg ? "declining" : "stable";

  insights.push({
    metric: "Average Findings per Review",
    value: avgFindings.toFixed(1),
    trend: avgFindings > 5 ? "high" : "normal",
    recommendation:
      avgFindings > 5
        ? "High finding density may slow CI — consider pre-commit hooks"
        : "Finding density is manageable",
  });

  insights.push({
    metric: "Review Pass Rate",
    value: `${(passRate * 100).toFixed(1)}%`,
    trend: passRate < 0.7 ? "concerning" : "healthy",
    recommendation:
      passRate < 0.7 ? "Low pass rate — review coding guidelines or adjust thresholds" : "Pass rate is healthy",
  });

  insights.push({
    metric: "Critical + High Findings",
    value: `${criticalTotal + highTotal} total`,
    trend: criticalTotal > 0 ? "attention" : "good",
    recommendation:
      criticalTotal > 0 ? "Critical findings should block deployment" : "No critical findings — pipeline can proceed",
  });

  insights.push({
    metric: "Quality Score Trend",
    value: `${avgScore.toFixed(1)} avg`,
    trend: scoreTrend,
    recommendation:
      scoreTrend === "declining" ? "Quality declining — investigate recent changes" : "Quality trend is positive",
  });

  insights.push({
    metric: "Reviews Analyzed",
    value: `${verdicts.length}`,
    trend: verdicts.length < 5 ? "limited data" : "sufficient",
    recommendation:
      verdicts.length < 5 ? "Need more review runs for reliable insights" : "Sufficient data for trend analysis",
  });

  return insights;
}

export function runReviewCiInsight(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-ci-insight [options]

CI pipeline performance insights from review data.

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

  const verdicts: TribunalVerdict[] = [];

  if (existsSync(dirPath)) {
    const files = (readdirSync(dirPath) as unknown as string[]).filter((f: string) => f.endsWith(".json")).sort();
    for (const file of files) {
      const content = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
      verdicts.push(content);
    }
  }

  const lastVerdict = join(process.cwd(), ".judges", "last-verdict.json");
  if (existsSync(lastVerdict)) {
    const data = JSON.parse(readFileSync(lastVerdict, "utf-8")) as TribunalVerdict;
    verdicts.push(data);
  }

  if (verdicts.length === 0) {
    console.log("No verdict data found. Run reviews first or provide --dir.");
    return;
  }

  const insights = analyzeCiData(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(insights, null, 2));
    return;
  }

  console.log("\n=== CI Pipeline Insights ===\n");
  console.log(`Data points: ${verdicts.length} review(s)\n`);

  for (const insight of insights) {
    console.log(`${insight.metric}: ${insight.value} [${insight.trend}]`);
    console.log(`  → ${insight.recommendation}`);
    console.log();
  }
}
