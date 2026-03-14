/**
 * Review-milestone — Track and celebrate review milestones.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Milestone {
  name: string;
  threshold: number;
  achievedAt: string;
}

interface MilestoneStore {
  version: string;
  totalReviews: number;
  totalFindings: number;
  totalFixes: number;
  milestones: Milestone[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const MILESTONE_FILE = join(".judges", "milestones.json");

function loadStore(): MilestoneStore {
  if (!existsSync(MILESTONE_FILE))
    return { version: "1.0.0", totalReviews: 0, totalFindings: 0, totalFixes: 0, milestones: [] };
  try {
    return JSON.parse(readFileSync(MILESTONE_FILE, "utf-8")) as MilestoneStore;
  } catch {
    return { version: "1.0.0", totalReviews: 0, totalFindings: 0, totalFixes: 0, milestones: [] };
  }
}

function saveStore(store: MilestoneStore): void {
  mkdirSync(dirname(MILESTONE_FILE), { recursive: true });
  writeFileSync(MILESTONE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Milestone Definitions ─────────────────────────────────────────────────

const REVIEW_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const FINDING_MILESTONES = [50, 100, 250, 500, 1000, 5000];
const FIX_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

function checkMilestones(store: MilestoneStore): string[] {
  const newMilestones: string[] = [];
  const achieved = new Set(store.milestones.map((m) => m.name));

  for (const t of REVIEW_MILESTONES) {
    const name = `${t}-reviews`;
    if (store.totalReviews >= t && !achieved.has(name)) {
      store.milestones.push({ name, threshold: t, achievedAt: new Date().toISOString() });
      newMilestones.push(`${t} Reviews milestone achieved!`);
    }
  }
  for (const t of FINDING_MILESTONES) {
    const name = `${t}-findings`;
    if (store.totalFindings >= t && !achieved.has(name)) {
      store.milestones.push({ name, threshold: t, achievedAt: new Date().toISOString() });
      newMilestones.push(`${t} Findings detected milestone!`);
    }
  }
  for (const t of FIX_MILESTONES) {
    const name = `${t}-fixes`;
    if (store.totalFixes >= t && !achieved.has(name)) {
      store.milestones.push({ name, threshold: t, achievedAt: new Date().toISOString() });
      newMilestones.push(`${t} Fixes applied milestone!`);
    }
  }
  return newMilestones;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMilestone(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-milestone — Track and celebrate review milestones

Usage:
  judges review-milestone show                     Show all milestones
  judges review-milestone record --reviews 1       Increment review count
  judges review-milestone record --findings 5      Increment findings count
  judges review-milestone record --fixes 2         Increment fixes count
  judges review-milestone reset                    Reset all milestone data

Options:
  --reviews <n>         Add N reviews to counter
  --findings <n>        Add N findings to counter
  --fixes <n>           Add N fixes to counter
  --format json         JSON output
  --help, -h            Show this help

Track progress and celebrate milestones. Data in .judges/milestones.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "reset"].includes(a)) || "show";
  const store = loadStore();

  if (subcommand === "record") {
    const reviews = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--reviews") || "0", 10);
    const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);
    const fixes = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--fixes") || "0", 10);

    store.totalReviews += reviews;
    store.totalFindings += findings;
    store.totalFixes += fixes;

    const newMs = checkMilestones(store);
    saveStore(store);

    if (newMs.length > 0) {
      console.log("\nNew Milestones Achieved!");
      for (const m of newMs) console.log(`  * ${m}`);
      console.log();
    } else {
      console.log(
        `Updated: ${store.totalReviews} reviews, ${store.totalFindings} findings, ${store.totalFixes} fixes.`,
      );
    }
    return;
  }

  if (subcommand === "reset") {
    saveStore({ version: "1.0.0", totalReviews: 0, totalFindings: 0, totalFixes: 0, milestones: [] });
    console.log("Milestone data reset.");
    return;
  }

  // show
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nReview Milestones:");
  console.log("─".repeat(50));
  console.log(`  Total reviews:   ${store.totalReviews}`);
  console.log(`  Total findings:  ${store.totalFindings}`);
  console.log(`  Total fixes:     ${store.totalFixes}`);
  console.log();

  if (store.milestones.length > 0) {
    console.log("  Achieved:");
    for (const m of store.milestones) {
      console.log(`    * ${m.name} — ${m.achievedAt.slice(0, 10)}`);
    }
  } else {
    console.log("  No milestones achieved yet. Keep reviewing!");
  }

  // Show next milestones
  const nextReview = REVIEW_MILESTONES.find((t) => t > store.totalReviews);
  const nextFinding = FINDING_MILESTONES.find((t) => t > store.totalFindings);
  const nextFix = FIX_MILESTONES.find((t) => t > store.totalFixes);
  console.log("\n  Next milestones:");
  if (nextReview) console.log(`    Reviews:  ${nextReview} (${nextReview - store.totalReviews} to go)`);
  if (nextFinding) console.log(`    Findings: ${nextFinding} (${nextFinding - store.totalFindings} to go)`);
  if (nextFix) console.log(`    Fixes:    ${nextFix} (${nextFix - store.totalFixes} to go)`);
  console.log("─".repeat(50));
}
