/**
 * Finding-timeline — Track finding trends across commits over time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineEntry {
  id: string;
  timestamp: string;
  commit: string;
  label: string;
  totalFindings: number;
  bySeverity: Record<string, number>;
  score: number;
}

interface TimelineStore {
  version: string;
  entries: TimelineEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const TIMELINE_FILE = join(".judges", "finding-timeline.json");

function loadTimeline(): TimelineStore {
  if (!existsSync(TIMELINE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(TIMELINE_FILE, "utf-8")) as TimelineStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveTimeline(store: TimelineStore): void {
  mkdirSync(dirname(TIMELINE_FILE), { recursive: true });
  writeFileSync(TIMELINE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const sev = f.severity || "unknown";
    counts[sev] = (counts[sev] || 0) + 1;
  }
  return counts;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTimeline(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-timeline — Track finding trends across commits

Usage:
  judges finding-timeline record --file verdict.json --label "v1.0"
  judges finding-timeline show
  judges finding-timeline show --last 10
  judges finding-timeline clear

Subcommands:
  record               Record a data point from a verdict
  show                 Show timeline with trend visualization
  clear                Clear all timeline data

Options:
  --file <path>         Verdict JSON (for record)
  --label <text>        Label for this data point
  --commit <hash>       Git commit hash (auto-detected if omitted)
  --last <n>            Show only last N entries
  --format json         JSON output
  --help, -h            Show this help

Tracks findings over time to show improvement trends.
Data is stored locally in .judges/finding-timeline.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["record", "show", "clear"].includes(a)) || "show";
  const store = loadTimeline();

  if (subcommand === "record") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file || !existsSync(file)) {
      console.error("Error: --file with a valid verdict JSON is required.");
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
    } catch {
      console.error(`Error: Could not parse ${file}`);
      process.exitCode = 1;
      return;
    }

    const label =
      argv.find((_a: string, i: number) => argv[i - 1] === "--label") || `entry-${store.entries.length + 1}`;
    let commit = argv.find((_a: string, i: number) => argv[i - 1] === "--commit") || "";
    if (!commit) {
      try {
        commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      } catch {
        commit = "unknown";
      }
    }

    const findings = verdict.findings || [];
    const entry: TimelineEntry = {
      id: `tl-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      commit,
      label,
      totalFindings: findings.length,
      bySeverity: countBySeverity(findings),
      score: verdict.overallScore || 0,
    };

    store.entries.push(entry);
    saveTimeline(store);
    console.log(`Recorded timeline entry '${label}' — ${findings.length} findings, score ${entry.score}`);
    return;
  }

  if (subcommand === "clear") {
    saveTimeline({ version: "1.0.0", entries: [] });
    console.log("Timeline cleared.");
    return;
  }

  // Show
  const lastN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "0", 10);
  const entries = lastN > 0 ? store.entries.slice(-lastN) : store.entries;

  if (format === "json") {
    console.log(JSON.stringify({ total: store.entries.length, shown: entries.length, entries }, null, 2));
    return;
  }

  console.log(`\n  Finding Timeline (${entries.length} entries)\n  ═════════════════════════════`);

  if (entries.length === 0) {
    console.log("    No data. Record with: judges finding-timeline record --file verdict.json");
    console.log();
    return;
  }

  // ASCII chart
  const maxFindings = Math.max(...entries.map((e) => e.totalFindings), 1);
  const barWidth = 30;

  for (const entry of entries) {
    const barLen = Math.round((entry.totalFindings / maxFindings) * barWidth);
    const bar = "█".repeat(barLen) + "░".repeat(barWidth - barLen);
    const date = entry.timestamp.slice(0, 10);
    console.log(`    ${date} ${entry.label.padEnd(15)} ${bar} ${entry.totalFindings} findings (score: ${entry.score})`);
  }

  // Show trend
  if (entries.length >= 2) {
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = last.totalFindings - first.totalFindings;
    const scoreDelta = last.score - first.score;
    console.log();
    console.log(
      `    Trend: findings ${delta >= 0 ? "+" : ""}${delta}, score ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`,
    );
    console.log(`    ${delta <= 0 && scoreDelta >= 0 ? "📈 Improving" : delta > 0 ? "📉 Declining" : "➡️ Stable"}`);
  }

  console.log();
}
