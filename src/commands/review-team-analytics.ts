import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-team-analytics ──────────────────────────────────────────
   Team-level review analytics — aggregate statistics on review
   patterns, finding trends, and quality scores to help teams
   understand their code quality posture over time.
   ─────────────────────────────────────────────────────────────────── */

interface TeamAnalytics {
  totalReviews: number;
  totalFindings: number;
  avgFindingsPerReview: number;
  passRate: number;
  avgScore: number;
  severityDistribution: Record<string, number>;
  topRules: Array<{ ruleId: string; count: number }>;
  qualityTrend: string;
}

function computeTeamAnalytics(verdicts: TribunalVerdict[]): TeamAnalytics {
  const totalFindings = verdicts.reduce((sum, v) => sum + (v.findings?.length ?? 0), 0);
  const passCount = verdicts.filter((v) => v.overallVerdict === "pass").length;
  const totalScore = verdicts.reduce((sum, v) => sum + (v.overallScore ?? 0), 0);

  const severityDist: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const ruleCounts = new Map<string, number>();

  for (const v of verdicts) {
    for (const f of v.findings ?? []) {
      severityDist[f.severity] = (severityDist[f.severity] ?? 0) + 1;
      ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
    }
  }

  const topRules = [...ruleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count }));

  const half = Math.floor(verdicts.length / 2);
  const recentScores = verdicts.slice(half).map((v) => v.overallScore ?? 0);
  const olderScores = verdicts.slice(0, half).map((v) => v.overallScore ?? 0);
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;
  const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : 0;
  const qualityTrend = recentAvg > olderAvg ? "improving" : recentAvg < olderAvg ? "declining" : "stable";

  return {
    totalReviews: verdicts.length,
    totalFindings,
    avgFindingsPerReview: verdicts.length > 0 ? totalFindings / verdicts.length : 0,
    passRate: verdicts.length > 0 ? passCount / verdicts.length : 0,
    avgScore: verdicts.length > 0 ? totalScore / verdicts.length : 0,
    severityDistribution: severityDist,
    topRules,
    qualityTrend,
  };
}

export function runReviewTeamAnalytics(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-team-analytics [options]

Team-level review analytics and statistics.

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
      const data = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
      verdicts.push(data);
    }
  }

  const defaultPath = join(process.cwd(), ".judges", "last-verdict.json");
  if (existsSync(defaultPath)) {
    verdicts.push(JSON.parse(readFileSync(defaultPath, "utf-8")) as TribunalVerdict);
  }

  if (verdicts.length === 0) {
    console.log("No verdict data found. Run reviews first or provide --dir.");
    return;
  }

  const analytics = computeTeamAnalytics(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(analytics, null, 2));
    return;
  }

  console.log("\n=== Team Review Analytics ===\n");
  console.log(`Reviews: ${analytics.totalReviews}`);
  console.log(`Total findings: ${analytics.totalFindings}`);
  console.log(`Avg findings/review: ${analytics.avgFindingsPerReview.toFixed(1)}`);
  console.log(`Pass rate: ${(analytics.passRate * 100).toFixed(1)}%`);
  console.log(`Avg score: ${analytics.avgScore.toFixed(1)}`);
  console.log(`Quality trend: ${analytics.qualityTrend}`);

  console.log("\nSeverity Distribution:");
  for (const [sev, count] of Object.entries(analytics.severityDistribution)) {
    if (count > 0) {
      console.log(`  ${sev}: ${count}`);
    }
  }

  if (analytics.topRules.length > 0) {
    console.log("\nTop Rules:");
    for (const rule of analytics.topRules) {
      console.log(`  ${rule.ruleId}: ${rule.count}`);
    }
  }
}
