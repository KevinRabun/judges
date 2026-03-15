/**
 * Review-org-dashboard — Organization-wide review dashboard.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrgSummary {
  totalRepos: number;
  totalReviews: number;
  totalFindings: number;
  avgScore: number;
  repoStats: RepoStat[];
}

interface RepoStat {
  repo: string;
  reviews: number;
  findings: number;
  avgScore: number;
  lastReview: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOrgDashboard(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".judges/org-reports";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-org-dashboard — Organization-wide review dashboard

Usage:
  judges review-org-dashboard [--dir <path>] [--format table|json]

Options:
  --dir <path>     Org reports directory (default: .judges/org-reports)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help

Expects JSON files in the directory, each representing a repo summary:
  {"repo":"my-app","reviews":25,"findings":42,"avgScore":7.5,"lastReview":"2026-03-10"}
`);
    return;
  }

  if (!existsSync(dir)) {
    console.log(`Org reports directory not found: ${dir}`);
    console.log("Create the directory and add repo summary files.");
    return;
  }

  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No org report files found.");
    return;
  }

  const repoStats: RepoStat[] = [];

  for (const file of files) {
    const content = JSON.parse(readFileSync(join(dir, file), "utf-8")) as RepoStat;
    repoStats.push(content);
  }

  repoStats.sort((a, b) => b.findings - a.findings);

  const summary: OrgSummary = {
    totalRepos: repoStats.length,
    totalReviews: repoStats.reduce((s, r) => s + r.reviews, 0),
    totalFindings: repoStats.reduce((s, r) => s + r.findings, 0),
    avgScore:
      repoStats.length > 0
        ? Math.round((repoStats.reduce((s, r) => s + r.avgScore, 0) / repoStats.length) * 10) / 10
        : 0,
    repoStats,
  };

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`\nOrganization Dashboard`);
  console.log("═".repeat(75));
  console.log(
    `  Repos: ${summary.totalRepos}  |  Reviews: ${summary.totalReviews}  |  Findings: ${summary.totalFindings}  |  Avg Score: ${summary.avgScore}`,
  );
  console.log("");
  console.log(
    `  ${"Repo".padEnd(25)} ${"Reviews".padEnd(10)} ${"Findings".padEnd(10)} ${"Score".padEnd(8)} Last Review`,
  );
  console.log("  " + "─".repeat(70));

  for (const r of repoStats) {
    console.log(
      `  ${r.repo.padEnd(25)} ${String(r.reviews).padEnd(10)} ${String(r.findings).padEnd(10)} ${String(r.avgScore).padEnd(8)} ${r.lastReview}`,
    );
  }

  console.log("═".repeat(75));
}
