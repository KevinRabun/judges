/**
 * Review-team-stats — Aggregate review statistics for team visibility.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamStats {
  totalReviews: number;
  avgScore: number;
  totalFindings: number;
  avgFindings: number;
  verdictBreakdown: Record<string, number>;
  topRules: Array<{ ruleId: string; count: number }>;
  scoreDistribution: { high: number; medium: number; low: number };
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function computeTeamStats(verdicts: TribunalVerdict[]): TeamStats {
  const totalReviews = verdicts.length;
  const scores = verdicts.map((v) => v.overallScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / totalReviews);

  const allFindings = verdicts.flatMap((v) => v.findings);
  const totalFindings = allFindings.length;
  const avgFindings = Math.round(totalFindings / totalReviews);

  const verdictBreakdown: Record<string, number> = {};
  for (const v of verdicts) {
    verdictBreakdown[v.overallVerdict] = (verdictBreakdown[v.overallVerdict] || 0) + 1;
  }

  const ruleCounts = new Map<string, number>();
  for (const f of allFindings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) || 0) + 1);
  }
  const topRules = [...ruleCounts.entries()]
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const scoreDistribution = {
    high: scores.filter((s) => s >= 80).length,
    medium: scores.filter((s) => s >= 50 && s < 80).length,
    low: scores.filter((s) => s < 50).length,
  };

  return { totalReviews, avgScore, totalFindings, avgFindings, verdictBreakdown, topRules, scoreDistribution };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTeamStats(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-team-stats — Team review statistics

Usage:
  judges review-team-stats --dir <verdicts-dir> [--format table|json]

Options:
  --dir <path>         Directory of verdict JSON files (required)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const verdicts: TribunalVerdict[] = [];

  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")));
    } catch {
      // skip
    }
  }

  if (verdicts.length === 0) {
    console.error("Error: no valid verdict files found");
    process.exitCode = 1;
    return;
  }

  const stats = computeTeamStats(verdicts);

  if (format === "json") {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`\nTeam Review Stats (${stats.totalReviews} reviews)`);
  console.log("═".repeat(55));
  console.log(`  Avg Score:       ${stats.avgScore}`);
  console.log(`  Total Findings:  ${stats.totalFindings}`);
  console.log(`  Avg Findings:    ${stats.avgFindings}`);
  console.log(
    `  Score Dist:      High: ${stats.scoreDistribution.high}  Med: ${stats.scoreDistribution.medium}  Low: ${stats.scoreDistribution.low}`,
  );
  console.log(
    `  Verdicts:        ${Object.entries(stats.verdictBreakdown)
      .map(([v, c]) => `${v}:${c}`)
      .join(", ")}`,
  );
  console.log(`\n  Top Rules:`);
  for (const r of stats.topRules) {
    const rule = r.ruleId.length > 30 ? r.ruleId.slice(0, 30) + "…" : r.ruleId;
    console.log(`    ${rule.padEnd(32)} ${r.count}`);
  }
  console.log("═".repeat(55));
}
