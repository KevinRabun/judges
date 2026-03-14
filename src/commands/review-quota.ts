/**
 * Review-quota — Track review usage quotas locally.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UsageEntry {
  date: string;
  reviewCount: number;
  filesReviewed: number;
  findingsGenerated: number;
}

interface QuotaStore {
  version: string;
  dailyLimit: number;
  monthlyLimit: number;
  usage: UsageEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const QUOTA_FILE = join(".judges", "review-quota.json");

function loadQuota(): QuotaStore {
  if (!existsSync(QUOTA_FILE)) return { version: "1.0.0", dailyLimit: 100, monthlyLimit: 3000, usage: [] };
  try {
    return JSON.parse(readFileSync(QUOTA_FILE, "utf-8")) as QuotaStore;
  } catch {
    return { version: "1.0.0", dailyLimit: 100, monthlyLimit: 3000, usage: [] };
  }
}

function saveQuota(store: QuotaStore): void {
  mkdirSync(dirname(QUOTA_FILE), { recursive: true });
  writeFileSync(QUOTA_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewQuota(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-quota — Track review usage quotas

Usage:
  judges review-quota show                         Show current usage
  judges review-quota record --files 5 --findings 12  Record usage
  judges review-quota set --daily 200 --monthly 5000   Set limits
  judges review-quota reset                        Reset usage data

Subcommands:
  show                 Show current usage and quotas
  record               Record a review session
  set                  Set daily/monthly limits
  reset                Reset all usage data

Options:
  --files <n>           Number of files reviewed
  --findings <n>        Number of findings generated
  --daily <n>           Daily review limit
  --monthly <n>         Monthly review limit
  --format json         JSON output
  --help, -h            Show this help

Quotas are tracked locally in .judges/review-quota.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["show", "record", "set", "reset"].includes(a)) || "show";
  const store = loadQuota();

  if (subcommand === "record") {
    const files = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--files") || "1", 10);
    const findings = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);

    const todayStr = today();
    const existing = store.usage.find((u) => u.date === todayStr);
    if (existing) {
      existing.reviewCount++;
      existing.filesReviewed += files;
      existing.findingsGenerated += findings;
    } else {
      store.usage.push({ date: todayStr, reviewCount: 1, filesReviewed: files, findingsGenerated: findings });
    }

    saveQuota(store);
    console.log(`Recorded: ${files} files, ${findings} findings.`);
    return;
  }

  if (subcommand === "set") {
    const daily = argv.find((_a: string, i: number) => argv[i - 1] === "--daily");
    const monthly = argv.find((_a: string, i: number) => argv[i - 1] === "--monthly");
    if (daily) store.dailyLimit = parseInt(daily, 10);
    if (monthly) store.monthlyLimit = parseInt(monthly, 10);
    saveQuota(store);
    console.log(`Limits set — daily: ${store.dailyLimit}, monthly: ${store.monthlyLimit}`);
    return;
  }

  if (subcommand === "reset") {
    store.usage = [];
    saveQuota(store);
    console.log("Usage data reset.");
    return;
  }

  // Show
  const todayStr = today();
  const monthStr = thisMonth();

  const todayUsage = store.usage.find((u) => u.date === todayStr);
  const dailyReviews = todayUsage ? todayUsage.reviewCount : 0;
  const monthlyReviews = store.usage
    .filter((u) => u.date.startsWith(monthStr))
    .reduce((sum, u) => sum + u.reviewCount, 0);

  const dailyPct = store.dailyLimit > 0 ? Math.round((dailyReviews / store.dailyLimit) * 100) : 0;
  const monthlyPct = store.monthlyLimit > 0 ? Math.round((monthlyReviews / store.monthlyLimit) * 100) : 0;

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          daily: { used: dailyReviews, limit: store.dailyLimit, percent: dailyPct },
          monthly: { used: monthlyReviews, limit: store.monthlyLimit, percent: monthlyPct },
          today: todayUsage || null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const dailyBar =
    "█".repeat(Math.min(Math.round(dailyPct / 5), 20)) + "░".repeat(Math.max(20 - Math.round(dailyPct / 5), 0));
  const monthlyBar =
    "█".repeat(Math.min(Math.round(monthlyPct / 5), 20)) + "░".repeat(Math.max(20 - Math.round(monthlyPct / 5), 0));

  console.log(`\n  Review Quota\n  ═════════════════════════════`);
  console.log(`    Daily:   ${dailyBar} ${dailyReviews}/${store.dailyLimit} (${dailyPct}%)`);
  console.log(`    Monthly: ${monthlyBar} ${monthlyReviews}/${store.monthlyLimit} (${monthlyPct}%)`);

  if (todayUsage) {
    console.log(
      `\n    Today: ${todayUsage.reviewCount} reviews, ${todayUsage.filesReviewed} files, ${todayUsage.findingsGenerated} findings`,
    );
  }

  if (dailyPct >= 90) console.log("\n    ⚠️  Approaching daily limit!");
  if (monthlyPct >= 90) console.log("    ⚠️  Approaching monthly limit!");

  console.log();
}
