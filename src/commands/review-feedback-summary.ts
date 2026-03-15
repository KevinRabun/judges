import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-feedback-summary ────────────────────────────────────────
   Summarize reviewer feedback trends by analyzing finding patterns
   across review history. Identifies top rules, recurring themes,
   and improvement areas. All data stays local.
   ─────────────────────────────────────────────────────────────────── */

interface FeedbackTrend {
  ruleId: string;
  title: string;
  frequency: number;
  avgSeverity: string;
  trend: string;
}

interface FeedbackSummary {
  totalReviews: number;
  totalFindings: number;
  avgFindingsPerReview: number;
  avgScore: number;
  topRules: FeedbackTrend[];
  verdictDistribution: Record<string, number>;
}

function severityRank(sev: string): number {
  const ranks: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return ranks[sev] ?? 0;
}

function rankToSeverity(rank: number): string {
  if (rank >= 4.5) return "critical";
  if (rank >= 3.5) return "high";
  if (rank >= 2.5) return "medium";
  if (rank >= 1.5) return "low";
  return "info";
}

function buildSummary(historyDir: string): FeedbackSummary {
  const ruleMap = new Map<string, { title: string; severities: number[]; dates: string[] }>();
  let totalFindings = 0;
  let totalReviews = 0;
  const scores: number[] = [];
  const verdictDist: Record<string, number> = {};

  if (!existsSync(historyDir)) {
    return {
      totalReviews: 0,
      totalFindings: 0,
      avgFindingsPerReview: 0,
      avgScore: 0,
      topRules: [],
      verdictDistribution: {},
    };
  }

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict;
      totalReviews++;
      scores.push(data.overallScore ?? 0);
      verdictDist[data.overallVerdict] = (verdictDist[data.overallVerdict] ?? 0) + 1;
      const date = data.timestamp ?? file.replace(".json", "");

      for (const f of data.findings ?? []) {
        totalFindings++;
        const entry = ruleMap.get(f.ruleId) ?? { title: f.title, severities: [], dates: [] };
        entry.severities.push(severityRank(f.severity));
        entry.dates.push(date);
        ruleMap.set(f.ruleId, entry);
      }
    } catch {
      // Skip malformed
    }
  }

  const topRules: FeedbackTrend[] = [];
  for (const [ruleId, data] of ruleMap) {
    const avgRank = data.severities.reduce((a, b) => a + b, 0) / data.severities.length;
    const uniqueDates = [...new Set(data.dates)];
    let trend: string;
    if (uniqueDates.length >= 5) trend = "persistent";
    else if (uniqueDates.length >= 3) trend = "recurring";
    else if (uniqueDates.length >= 2) trend = "occasional";
    else trend = "isolated";

    topRules.push({
      ruleId,
      title: data.title,
      frequency: uniqueDates.length,
      avgSeverity: rankToSeverity(avgRank),
      trend,
    });
  }

  topRules.sort((a, b) => b.frequency - a.frequency);

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    totalReviews,
    totalFindings,
    avgFindingsPerReview: totalReviews > 0 ? Math.round(totalFindings / totalReviews) : 0,
    avgScore,
    topRules: topRules.slice(0, 15),
    verdictDistribution: verdictDist,
  };
}

export function runReviewFeedbackSummary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-feedback-summary [options]

Summarize reviewer feedback trends from history.

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

  const summary = buildSummary(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`\n=== Feedback Summary ===\n`);
  console.log(`  Total Reviews:    ${summary.totalReviews}`);
  console.log(`  Total Findings:   ${summary.totalFindings}`);
  console.log(`  Avg/Review:       ${summary.avgFindingsPerReview}`);
  console.log(`  Avg Score:        ${summary.avgScore}/100`);

  if (Object.keys(summary.verdictDistribution).length > 0) {
    console.log(`\n  Verdict Distribution:`);
    for (const [verdict, count] of Object.entries(summary.verdictDistribution)) {
      console.log(`    ${verdict}: ${count}`);
    }
  }

  if (summary.topRules.length > 0) {
    console.log(`\n  Top Rules:\n`);
    console.log("  " + "Rule ID".padEnd(30) + "Freq".padEnd(6) + "Severity".padEnd(10) + "Trend");
    console.log("  " + "-".repeat(60));
    for (const r of summary.topRules) {
      console.log("  " + r.ruleId.padEnd(30) + String(r.frequency).padEnd(6) + r.avgSeverity.padEnd(10) + r.trend);
    }
  }
}
