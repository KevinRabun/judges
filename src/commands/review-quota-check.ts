/**
 * Review-quota-check — Check review quotas and rate limits.
 */

import { readFileSync, existsSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuotaStatus {
  directory: string;
  filesReviewed: number;
  dailyLimit: number;
  remainingToday: number;
  isOverLimit: boolean;
  todayDate: string;
  recentReviews: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkQuota(dir: string, limit: number): QuotaStatus {
  const today = todayStr();
  const recentReviews: string[] = [];
  let filesReviewed = 0;

  if (!existsSync(dir)) {
    return {
      directory: dir,
      filesReviewed: 0,
      dailyLimit: limit,
      remainingToday: limit,
      isOverLimit: false,
      todayDate: today,
      recentReviews,
    };
  }

  const files = readdirSync(dir) as unknown as string[];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const full = dir.endsWith("/") || dir.endsWith("\\") ? dir + f : dir + "/" + f;
    try {
      const raw = readFileSync(full, "utf-8");
      const data = JSON.parse(raw);
      const ts = data.timestamp || data.date || "";
      if (typeof ts === "string" && ts.startsWith(today)) {
        filesReviewed++;
        recentReviews.push(f);
      }
    } catch {
      // skip invalid
    }
  }

  return {
    directory: dir,
    filesReviewed,
    dailyLimit: limit,
    remainingToday: Math.max(0, limit - filesReviewed),
    isOverLimit: filesReviewed >= limit,
    todayDate: today,
    recentReviews,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewQuotaCheck(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const limitIdx = argv.indexOf("--limit");
  const formatIdx = argv.indexOf("--format");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".judges/verdicts";
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : 100;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-quota-check — Check review quotas and limits

Usage:
  judges review-quota-check [--dir <path>] [--limit <n>] [--format table|json]

Options:
  --dir <path>       Verdict directory (default: .judges/verdicts)
  --limit <n>        Daily review limit (default: 100)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const status = checkQuota(dir, limit);

  if (format === "json") {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`\nReview Quota Status (${status.todayDate})`);
  console.log("═".repeat(50));
  console.log(`  Directory:       ${status.directory}`);
  console.log(`  Reviews today:   ${status.filesReviewed}`);
  console.log(`  Daily limit:     ${status.dailyLimit}`);
  console.log(`  Remaining:       ${status.remainingToday}`);
  console.log(`  Status:          ${status.isOverLimit ? "OVER LIMIT" : "OK"}`);
  console.log("═".repeat(50));

  if (status.recentReviews.length > 0) {
    console.log("\nRecent reviews today:");
    for (const r of status.recentReviews.slice(0, 10)) {
      console.log(`  - ${r}`);
    }
    if (status.recentReviews.length > 10) {
      console.log(`  ... and ${status.recentReviews.length - 10} more`);
    }
  }
}
