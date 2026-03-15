import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-progress-report ─────────────────────────────────────────
   Generate progress reports showing how review quality has changed
   over time. Compares recent vs historical scores, finding counts,
   and verdict distributions. All data read from local history.
   ─────────────────────────────────────────────────────────────────── */

interface ProgressPeriod {
  label: string;
  reviews: number;
  avgScore: number;
  avgFindings: number;
  passRate: number;
}

interface ProgressReport {
  overall: ProgressPeriod;
  recent: ProgressPeriod;
  older: ProgressPeriod;
  improving: boolean;
  scoreChange: number;
  findingChange: number;
}

function buildProgress(historyDir: string): ProgressReport | undefined {
  if (!existsSync(historyDir)) return undefined;

  const files = (readdirSync(historyDir) as unknown as string[])
    .filter((f) => typeof f === "string" && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return undefined;

  const verdicts: TribunalVerdict[] = [];
  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict);
    } catch {
      // Skip
    }
  }

  if (verdicts.length === 0) return undefined;

  const midpoint = Math.floor(verdicts.length / 2);
  const olderSet = verdicts.slice(0, midpoint || 1);
  const recentSet = verdicts.slice(midpoint || 1);

  function toPeriod(label: string, set: TribunalVerdict[]): ProgressPeriod {
    const scores = set.map((v) => v.overallScore ?? 0);
    const findingCounts = set.map((v) => (v.findings ?? []).length);
    const passes = set.filter((v) => v.overallVerdict === "pass").length;

    return {
      label,
      reviews: set.length,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      avgFindings:
        findingCounts.length > 0 ? Math.round(findingCounts.reduce((a, b) => a + b, 0) / findingCounts.length) : 0,
      passRate: set.length > 0 ? Math.round((passes / set.length) * 100) : 0,
    };
  }

  const overall = toPeriod("Overall", verdicts);
  const recent = toPeriod("Recent", recentSet);
  const older = toPeriod("Older", olderSet);

  return {
    overall,
    recent,
    older,
    improving: recent.avgScore >= older.avgScore,
    scoreChange: recent.avgScore - older.avgScore,
    findingChange: recent.avgFindings - older.avgFindings,
  };
}

export function runReviewProgressReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-progress-report [options]

Generate a progress report from review history.

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

  const report = buildProgress(historyDir);

  if (report === undefined) {
    console.log("No review history found. Run reviews to build history.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const trend = report.improving ? "↑ Improving" : "↓ Declining";
  console.log(`\n=== Progress Report (${trend}) ===\n`);

  console.log(
    "  " +
      "Period".padEnd(12) +
      "Reviews".padEnd(10) +
      "Avg Score".padEnd(12) +
      "Avg Findings".padEnd(14) +
      "Pass Rate",
  );
  console.log("  " + "-".repeat(55));

  for (const period of [report.older, report.recent, report.overall]) {
    console.log(
      "  " +
        period.label.padEnd(12) +
        String(period.reviews).padEnd(10) +
        String(period.avgScore).padEnd(12) +
        String(period.avgFindings).padEnd(14) +
        `${period.passRate}%`,
    );
  }

  console.log(`\n  Score change: ${report.scoreChange >= 0 ? "+" : ""}${report.scoreChange}`);
  console.log(`  Finding change: ${report.findingChange >= 0 ? "+" : ""}${report.findingChange}`);
}
