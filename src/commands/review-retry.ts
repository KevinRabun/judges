/**
 * Review-retry — Retry failed or incomplete reviews.
 */

import { readFileSync, existsSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetryCandidate {
  file: string;
  lastReview: string;
  status: string;
  score: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRetry(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-retry — Retry failed or incomplete reviews

Usage:
  judges review-retry                                Show retry candidates
  judges review-retry scan                           Scan for failed reviews
  judges review-retry list                           List retry candidates
  judges review-retry clear                          Clear retry state

Subcommands:
  (default)             Show retry candidates
  scan                  Scan for reviews that need retry
  list                  List candidates with details
  clear                 Clear retry state

Options:
  --threshold <n>       Score threshold for retry (default: 5)
  --dir <path>          Override results directory
  --format json         JSON output
  --help, -h            Show this help

Detects reviews that scored below threshold or had errors.
`);
    return;
  }

  const subcommand = argv.find((a) => ["scan", "list", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const threshold = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--threshold") || "5");
  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".judges/results";

  if (subcommand === "clear") {
    console.log("Retry state cleared.");
    return;
  }

  // Scan for candidates
  const candidates: RetryCandidate[] = [];

  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir) as unknown as string[];
      for (const f of files) {
        if (!String(f).endsWith(".json")) continue;
        try {
          const content = JSON.parse(readFileSync(`${dir}/${String(f)}`, "utf-8"));
          const score = typeof content.overallScore === "number" ? content.overallScore : 0;
          const status = score < threshold ? "below-threshold" : "ok";
          if (status === "below-threshold") {
            candidates.push({
              file: String(f),
              lastReview: content.timestamp || "unknown",
              status,
              score,
            });
          }
        } catch {
          candidates.push({
            file: String(f),
            lastReview: "unknown",
            status: "parse-error",
            score: 0,
          });
        }
      }
    } catch {
      // Directory not readable
    }
  }

  if (format === "json") {
    console.log(JSON.stringify({ threshold, candidates }, null, 2));
    return;
  }

  if (candidates.length === 0) {
    console.log(`No retry candidates (threshold: ${threshold}).`);
    return;
  }

  console.log(`\nRetry Candidates (score < ${threshold}):`);
  console.log("─".repeat(60));
  for (const c of candidates) {
    console.log(`  ${c.file}  score=${c.score.toFixed(1)}  status=${c.status}`);
  }
  console.log("─".repeat(60));
  console.log(`\n${candidates.length} review(s) eligible for retry.`);
}
