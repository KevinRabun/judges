/**
 * Review-timeline — Show review activity timeline.
 */

import { readFileSync, existsSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineEntry {
  date: string;
  file: string;
  score: number;
  findings: number;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTimeline(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-timeline — Show review activity timeline

Usage:
  judges review-timeline
  judges review-timeline --dir .judges/results
  judges review-timeline --last 10

Options:
  --dir <path>          Results directory (default: .judges/results)
  --last <n>            Show last N entries
  --format json         JSON output
  --help, -h            Show this help

Scans review result files and displays a chronological timeline.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".judges/results";
  const last = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "0", 10);

  if (!existsSync(dir)) {
    console.log(`Results directory not found: ${dir}`);
    return;
  }

  const entries: TimelineEntry[] = [];

  try {
    const files = readdirSync(dir) as unknown as string[];
    for (const f of files) {
      if (!String(f).endsWith(".json")) continue;
      try {
        const content = JSON.parse(readFileSync(`${dir}/${String(f)}`, "utf-8"));
        entries.push({
          date: typeof content.timestamp === "string" ? content.timestamp : "unknown",
          file: String(f),
          score: typeof content.overallScore === "number" ? content.overallScore : 0,
          findings: Array.isArray(content.findings) ? content.findings.length : 0,
        });
      } catch {
        // Skip unparseable
      }
    }
  } catch {
    console.log(`Cannot read: ${dir}`);
    return;
  }

  // Sort by date
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const display = last > 0 ? entries.slice(-last) : entries;

  if (display.length === 0) {
    console.log("No review entries found.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(display, null, 2));
    return;
  }

  console.log("\nReview Timeline:");
  console.log("═".repeat(65));
  for (const e of display) {
    const bar = "█".repeat(Math.round(e.score));
    console.log(`  ${e.date.slice(0, 16)}  ${bar.padEnd(10)} ${e.score.toFixed(1)}  findings=${e.findings}  ${e.file}`);
  }
  console.log("═".repeat(65));
  console.log(`${display.length} entries shown.`);
}
