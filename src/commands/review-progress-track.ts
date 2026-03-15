/**
 * Review-progress-track — Track review progress over time.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProgressEntry {
  timestamp: string;
  label: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
}

interface ProgressLog {
  version: number;
  entries: ProgressEntry[];
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function loadProgress(path: string): ProgressLog {
  if (!existsSync(path)) {
    return { version: 1, entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, entries: [] };
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewProgressTrack(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const logIdx = argv.indexOf("--log");
  const labelIdx = argv.indexOf("--label");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const logPath = logIdx >= 0 ? argv[logIdx + 1] : ".judges-progress.json";
  const label = labelIdx >= 0 ? argv[labelIdx + 1] : new Date().toISOString().slice(0, 10);
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-progress-track — Track review progress over time

Usage:
  judges review-progress-track [--file <verdict.json>] [--log <path>]
                               [--label <name>] [--format table|json]

Options:
  --file <path>      Add verdict to progress log
  --log <path>       Progress log file (default: .judges-progress.json)
  --label <name>     Label for this entry (default: current date)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const log = loadProgress(logPath);

  // Add mode
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.error("Error: invalid JSON");
      process.exitCode = 1;
      return;
    }

    log.entries.push({
      timestamp: new Date().toISOString(),
      label,
      score: verdict.overallScore,
      findingCount: verdict.findings.length,
      criticalCount: verdict.criticalCount,
      highCount: verdict.highCount,
    });

    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`Added progress entry "${label}" (${log.entries.length} total)`);
    return;
  }

  // View mode
  if (format === "json") {
    console.log(JSON.stringify(log, null, 2));
    return;
  }

  console.log(`\nReview Progress (${log.entries.length} entries)`);
  console.log("═".repeat(65));
  console.log(`${"Label".padEnd(18)} ${"Score".padEnd(8)} ${"Findings".padEnd(10)} ${"Critical".padEnd(10)} High`);
  console.log("─".repeat(65));

  for (const e of log.entries) {
    const lbl = e.label.length > 16 ? e.label.slice(0, 16) + "…" : e.label;
    console.log(
      `${lbl.padEnd(18)} ${String(e.score).padEnd(8)} ${String(e.findingCount).padEnd(10)} ${String(e.criticalCount).padEnd(10)} ${e.highCount}`,
    );
  }

  if (log.entries.length >= 2) {
    const first = log.entries[0];
    const last = log.entries[log.entries.length - 1];
    const delta = last.score - first.score;
    console.log("─".repeat(65));
    console.log(`  Score trend: ${delta >= 0 ? "+" : ""}${delta} (${first.label} → ${last.label})`);
  }
  console.log("═".repeat(65));
}
