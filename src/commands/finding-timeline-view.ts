/**
 * Finding-timeline-view — Show findings on a timeline.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineEntry {
  date: string;
  verdict: string;
  score: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  file: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadTimeline(dir: string): TimelineEntry[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir) as unknown as string[];
  const entries: TimelineEntry[] = [];

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const full = dir.endsWith("/") || dir.endsWith("\\") ? dir + f : dir + "/" + f;
    try {
      const raw = readFileSync(full, "utf-8");
      const v: TribunalVerdict = JSON.parse(raw);
      const date = v.timestamp || "";
      entries.push({
        date: typeof date === "string" ? date.slice(0, 10) : "",
        verdict: v.overallVerdict || "unknown",
        score: v.overallScore || 0,
        totalFindings: v.findings ? v.findings.length : 0,
        criticalCount: v.criticalCount || 0,
        highCount: v.highCount || 0,
        file: f,
      });
    } catch {
      // skip invalid
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTimelineView(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const lastIdx = argv.indexOf("--last");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".judges/verdicts";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const last = lastIdx >= 0 ? parseInt(argv[lastIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-timeline-view — Show findings on a timeline

Usage:
  judges finding-timeline-view [--dir <path>] [--last <n>]
                               [--format table|json|chart]

Options:
  --dir <path>       Verdict directory (default: .judges/verdicts)
  --last <n>         Show only last N entries
  --format <fmt>     Output format: table (default), json, chart
  --help, -h         Show this help
`);
    return;
  }

  let entries = loadTimeline(dir);
  if (entries.length === 0) {
    console.log("No verdict history found.");
    return;
  }
  if (last > 0) entries = entries.slice(-last);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (format === "chart") {
    console.log(`\nFindings Timeline (${entries.length} entries)`);
    console.log("═".repeat(60));
    const maxFindings = Math.max(...entries.map((e) => e.totalFindings), 1);
    for (const e of entries) {
      const barLen = Math.round((e.totalFindings / maxFindings) * 40);
      const bar = "█".repeat(barLen) + "░".repeat(40 - barLen);
      console.log(`${e.date} ${bar} ${e.totalFindings}`);
    }
    console.log("═".repeat(60));
    return;
  }

  console.log(`\nFindings Timeline (${entries.length} entries)`);
  console.log("═".repeat(75));
  console.log(
    `${"Date".padEnd(12)} ${"Verdict".padEnd(10)} ${"Score".padEnd(7)} ${"Total".padEnd(7)} ${"Crit".padEnd(6)} ${"High".padEnd(6)} File`,
  );
  console.log("─".repeat(75));

  for (const e of entries) {
    const file = e.file.length > 20 ? "…" + e.file.slice(-19) : e.file;
    console.log(
      `${e.date.padEnd(12)} ${e.verdict.padEnd(10)} ${String(e.score).padEnd(7)} ${String(e.totalFindings).padEnd(7)} ${String(e.criticalCount).padEnd(6)} ${String(e.highCount).padEnd(6)} ${file}`,
    );
  }

  console.log("═".repeat(75));

  // trend indicator
  if (entries.length >= 2) {
    const first = entries[0].totalFindings;
    const latest = entries[entries.length - 1].totalFindings;
    const trend = latest < first ? "improving" : latest > first ? "worsening" : "stable";
    console.log(`\nTrend: ${trend} (${first} → ${latest} findings)`);
  }
}
