import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-review-cadence ──────────────────────────────────────────
   Analyze the cadence of reviews — how frequently reviews are run,
   score trends over time, and whether cadence meets team targets.
   Uses local verdict history files.
   ─────────────────────────────────────────────────────────────────── */

interface CadenceEntry {
  date: string;
  score: number;
  findingCount: number;
  verdict: string;
}

interface CadenceReport {
  totalReviews: number;
  avgScore: number;
  avgFindings: number;
  recentEntries: CadenceEntry[];
  cadenceAssessment: string;
}

function analyzeCadence(historyDir: string): CadenceReport {
  const entries: CadenceEntry[] = [];

  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir) as unknown as string[];
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".json")) {
        const filePath = join(historyDir, file);
        try {
          const data = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
          entries.push({
            date: data.timestamp ?? file.replace(".json", ""),
            score: data.overallScore,
            findingCount: (data.findings ?? []).length,
            verdict: data.overallVerdict,
          });
        } catch {
          // Skip malformed files
        }
      }
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  const totalReviews = entries.length;
  const avgScore = totalReviews > 0 ? Math.round(entries.reduce((s, e) => s + e.score, 0) / totalReviews) : 0;
  const avgFindings = totalReviews > 0 ? Math.round(entries.reduce((s, e) => s + e.findingCount, 0) / totalReviews) : 0;

  let cadenceAssessment: string;
  if (totalReviews >= 20) cadenceAssessment = "Excellent — frequent reviews";
  else if (totalReviews >= 10) cadenceAssessment = "Good — regular reviews";
  else if (totalReviews >= 5) cadenceAssessment = "Fair — increase review frequency";
  else cadenceAssessment = "Low — establish regular review cadence";

  return {
    totalReviews,
    avgScore,
    avgFindings,
    recentEntries: entries.slice(-10),
    cadenceAssessment,
  };
}

export function runReviewReviewCadence(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-review-cadence [options]

Analyze review cadence and trends.

Options:
  --history <path>     Path to history directory
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

  const report = analyzeCadence(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n=== Review Cadence ===\n");
  console.log(`Total reviews: ${report.totalReviews}`);
  console.log(`Average score: ${report.avgScore}`);
  console.log(`Average findings: ${report.avgFindings}`);
  console.log(`Assessment: ${report.cadenceAssessment}\n`);

  if (report.recentEntries.length > 0) {
    console.log("Recent reviews:");
    for (const e of report.recentEntries) {
      console.log(`  ${e.date}: score=${e.score}, findings=${e.findingCount}, verdict=${e.verdict}`);
    }
  } else {
    console.log("No review history found.");
    console.log(`Store verdict JSON files in: ${historyDir}`);
  }
  console.log();
}
