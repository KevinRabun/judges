/**
 * Review-team-summary — Aggregate team review metrics.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewEntry {
  reviewer: string;
  score: number;
  findingCount: number;
  date: string;
  tags: string[];
}

interface MemberSummary {
  reviewer: string;
  reviewCount: number;
  avgScore: number;
  totalFindings: number;
  lastActive: string;
}

interface TeamSummaryReport {
  timestamp: string;
  teamSize: number;
  totalReviews: number;
  avgScore: number;
  members: MemberSummary[];
  topPerformer: string;
  recentActivity: number;
}

interface TeamStore {
  version: string;
  entries: ReviewEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = join(".judges", "team-reviews.json");

function loadStore(): TeamStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as TeamStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: TeamStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTeamSummary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-team-summary — Aggregate team review metrics

Usage:
  judges review-team-summary                         Show team summary
  judges review-team-summary add --reviewer alice --score 8.5 --findings 3
  judges review-team-summary list                    List all entries
  judges review-team-summary clear                   Clear all data

Subcommands:
  (default)             Show aggregated team summary
  add                   Add a review entry
  list                  List raw entries
  clear                 Clear all team data

Options:
  --reviewer <name>     Reviewer name
  --score <n>           Review score
  --findings <n>        Number of findings
  --tags <t1,t2>        Comma-separated tags
  --days <n>            Recent activity window (default: 30)
  --format json         JSON output
  --help, -h            Show this help

Data stored locally in .judges/team-reviews.json.
Note: Judges does not store or process user data — all team data
is local and managed by the user.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const reviewer = argv.find((_a: string, i: number) => argv[i - 1] === "--reviewer") || "";
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const findingCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);
    const tagsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--tags") || "";
    const tags = tagsArg
      ? tagsArg
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (!reviewer) {
      console.error("Error: --reviewer is required.");
      process.exitCode = 1;
      return;
    }

    store.entries.push({ reviewer, score, findingCount, date: new Date().toISOString(), tags });
    saveStore(store);
    console.log(`Added review entry for "${reviewer}" (score=${score}, findings=${findingCount}).`);
    return;
  }

  if (subcommand === "list") {
    if (store.entries.length === 0) {
      console.log("No team review entries.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(store.entries, null, 2));
      return;
    }
    console.log("\nTeam Review Entries:");
    console.log("─".repeat(70));
    for (const e of store.entries) {
      console.log(
        `  ${e.date.slice(0, 10)}  ${e.reviewer.padEnd(15)} score=${e.score.toFixed(1)}  findings=${e.findingCount}`,
      );
    }
    console.log("─".repeat(70));
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Team review data cleared.");
    return;
  }

  // Default: show summary
  if (store.entries.length === 0) {
    console.log("No team review data. Use 'judges review-team-summary add' to add entries.");
    return;
  }

  const days = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--days") || "30", 10);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Aggregate by reviewer
  const byReviewer = new Map<string, ReviewEntry[]>();
  for (const e of store.entries) {
    const list = byReviewer.get(e.reviewer) || [];
    list.push(e);
    byReviewer.set(e.reviewer, list);
  }

  const members: MemberSummary[] = [];
  for (const [reviewer, entries] of byReviewer) {
    const avgScore = entries.reduce((s, e) => s + e.score, 0) / entries.length;
    const totalFindings = entries.reduce((s, e) => s + e.findingCount, 0);
    const lastActive = entries.sort((a, b) => b.date.localeCompare(a.date))[0].date;
    members.push({ reviewer, reviewCount: entries.length, avgScore, totalFindings, lastActive });
  }

  members.sort((a, b) => b.avgScore - a.avgScore);

  const totalReviews = store.entries.length;
  const avgScore = store.entries.reduce((s, e) => s + e.score, 0) / totalReviews;
  const recentActivity = store.entries.filter((e) => e.date >= cutoff).length;
  const topPerformer = members.length > 0 ? members[0].reviewer : "N/A";

  const report: TeamSummaryReport = {
    timestamp: new Date().toISOString(),
    teamSize: members.length,
    totalReviews,
    avgScore,
    members,
    topPerformer,
    recentActivity,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nTeam Review Summary:");
  console.log("═".repeat(70));
  console.log(`  Team size: ${members.length}  Total reviews: ${totalReviews}  Avg score: ${avgScore.toFixed(1)}`);
  console.log(`  Recent activity (${days}d): ${recentActivity} review(s)  Top: ${topPerformer}`);
  console.log("═".repeat(70));

  console.log("\n  Members:");
  console.log("  " + "─".repeat(68));
  console.log(
    `  ${"Reviewer".padEnd(18)} ${"Reviews".padEnd(10)} ${"Avg Score".padEnd(12)} ${"Findings".padEnd(10)} Last Active`,
  );
  console.log("  " + "─".repeat(68));
  for (const m of members) {
    console.log(
      `  ${m.reviewer.padEnd(18)} ${String(m.reviewCount).padEnd(10)} ${m.avgScore.toFixed(1).padEnd(12)} ${String(m.totalFindings).padEnd(10)} ${m.lastActive.slice(0, 10)}`,
    );
  }
  console.log("  " + "─".repeat(68));
  console.log(`\n  Report saved to ${STORE_FILE}`);
  writeFileSync(join(".judges", "team-summary.json"), JSON.stringify(report, null, 2), "utf-8");
}
