import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-team-coverage ───────────────────────────────────────────
   Show review coverage distribution across team members by analyzing
   who reviewed which files. Uses locally stored review metadata.
   ─────────────────────────────────────────────────────────────────── */

interface CoverageEntry {
  reviewer: string;
  reviewCount: number;
  filesReviewed: number;
  findingsRaised: number;
  avgScore: number;
  lastActive: string;
}

function gatherCoverage(historyDir: string): CoverageEntry[] {
  const reviewerMap = new Map<
    string,
    { reviews: number; files: Set<string>; findings: number; scores: number[]; lastDate: string }
  >();

  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir) as unknown as string[];
  for (const file of files) {
    if (typeof file !== "string" || !file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(historyDir, file), "utf-8")) as TribunalVerdict & {
        reviewer?: string;
        filesReviewed?: string[];
      };
      const reviewer = raw.reviewer ?? "unassigned";
      const existing = reviewerMap.get(reviewer) ?? {
        reviews: 0,
        files: new Set<string>(),
        findings: 0,
        scores: [],
        lastDate: "",
      };
      existing.reviews++;
      existing.findings += (raw.findings ?? []).length;
      existing.scores.push(raw.overallScore ?? 0);
      for (const f of raw.filesReviewed ?? []) existing.files.add(f);
      const date = raw.timestamp ?? file.replace(".json", "");
      if (date > existing.lastDate) existing.lastDate = date;
      reviewerMap.set(reviewer, existing);
    } catch {
      // Skip malformed files
    }
  }

  const entries: CoverageEntry[] = [];
  for (const [reviewer, data] of reviewerMap) {
    const avg = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;
    entries.push({
      reviewer,
      reviewCount: data.reviews,
      filesReviewed: data.files.size,
      findingsRaised: data.findings,
      avgScore: Math.round(avg * 100) / 100,
      lastActive: data.lastDate,
    });
  }

  entries.sort((a, b) => b.reviewCount - a.reviewCount);
  return entries;
}

export function runReviewTeamCoverage(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-team-coverage [options]

Show review coverage distribution across team members.

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

  const entries = gatherCoverage(historyDir);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\n=== Team Review Coverage (${entries.length} reviewers) ===\n`);

  if (entries.length === 0) {
    console.log("No review history found. Reviews will be tracked locally as they occur.");
    return;
  }

  console.log(
    "  " +
      "Reviewer".padEnd(20) +
      "Reviews".padEnd(10) +
      "Files".padEnd(8) +
      "Findings".padEnd(10) +
      "Avg Score".padEnd(12) +
      "Last Active",
  );
  console.log("  " + "-".repeat(75));

  for (const e of entries) {
    console.log(
      "  " +
        e.reviewer.padEnd(20) +
        String(e.reviewCount).padEnd(10) +
        String(e.filesReviewed).padEnd(8) +
        String(e.findingsRaised).padEnd(10) +
        String(e.avgScore).padEnd(12) +
        e.lastActive,
    );
  }
}
