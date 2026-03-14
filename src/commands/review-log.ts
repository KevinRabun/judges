/**
 * Review-log — Structured audit log of all review actions for compliance.
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewLogEntry {
  timestamp: string;
  action: string;
  command: string;
  filesReviewed: number;
  findingsCount: number;
  severity: { critical: number; high: number; medium: number; low: number };
  duration: number;
  user: string;
  commit: string;
}

interface LogSummary {
  totalEntries: number;
  recentEntries: ReviewLogEntry[];
  totalFilesReviewed: number;
  totalFindings: number;
  averageDuration: number;
  firstEntry: string;
  lastEntry: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLogDir(): string {
  return join(".", ".judges", "logs");
}

function getLogFile(): string {
  const dir = getLogDir();
  const date = new Date().toISOString().slice(0, 7); // YYYY-MM
  return join(dir, `review-log-${date}.jsonl`);
}

function appendLog(entry: ReviewLogEntry): void {
  const dir = getLogDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const logFile = getLogFile();
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
}

function readAllLogs(): ReviewLogEntry[] {
  const dir = getLogDir();
  if (!existsSync(dir)) return [];

  const entries: ReviewLogEntry[] = [];
  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".jsonl")).sort();

  for (const f of files) {
    try {
      const content = readFileSync(join(dir, f), "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line) as ReviewLogEntry);
        } catch {
          // skip invalid lines
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  return entries;
}

function summarizeLogs(entries: ReviewLogEntry[]): LogSummary {
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      recentEntries: [],
      totalFilesReviewed: 0,
      totalFindings: 0,
      averageDuration: 0,
      firstEntry: "",
      lastEntry: "",
    };
  }

  const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const totalFiles = entries.reduce((s, e) => s + e.filesReviewed, 0);
  const totalFindings = entries.reduce((s, e) => s + e.findingsCount, 0);
  const totalDuration = entries.reduce((s, e) => s + e.duration, 0);

  return {
    totalEntries: entries.length,
    recentEntries: sorted.slice(-10),
    totalFilesReviewed: totalFiles,
    totalFindings,
    averageDuration: Math.round(totalDuration / entries.length),
    firstEntry: sorted[0].timestamp,
    lastEntry: sorted[sorted.length - 1].timestamp,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewLog(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-log — Structured audit log of review actions

Usage:
  judges review-log show                    Show log summary
  judges review-log record --command eval --files 10 --findings 5
  judges review-log export                  Export all logs as JSON
  judges review-log --format json           JSON output

Subcommands:
  show                 Show log summary and recent entries
  record               Record a review action to the log
  export               Export complete log as JSON

Record Options:
  --command <name>     Command that was run
  --files <n>          Number of files reviewed
  --findings <n>       Number of findings
  --critical <n>       Critical findings count
  --high <n>           High findings count
  --medium <n>         Medium findings count
  --low <n>            Low findings count
  --duration <ms>      Duration in milliseconds
  --commit <hash>      Associated commit

Logs are stored locally in .judges/logs/ as monthly JSONL files.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "review-log") || "show";

  if (subcommand === "record") {
    const getNum = (flag: string): number => {
      const val = argv.find((_a: string, i: number) => argv[i - 1] === flag);
      return val ? parseInt(val, 10) : 0;
    };
    const getStr = (flag: string): string => {
      return argv.find((_a: string, i: number) => argv[i - 1] === flag) || "";
    };

    const entry: ReviewLogEntry = {
      timestamp: new Date().toISOString(),
      action: "review",
      command: getStr("--command") || "unknown",
      filesReviewed: getNum("--files"),
      findingsCount: getNum("--findings"),
      severity: {
        critical: getNum("--critical"),
        high: getNum("--high"),
        medium: getNum("--medium"),
        low: getNum("--low"),
      },
      duration: getNum("--duration"),
      user: process.env.USER || process.env.USERNAME || "unknown",
      commit: getStr("--commit"),
    };

    appendLog(entry);
    console.log(
      `Logged review action: ${entry.command} (${entry.findingsCount} findings, ${entry.filesReviewed} files).`,
    );
    return;
  }

  if (subcommand === "export") {
    const entries = readAllLogs();
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  // Show
  const entries = readAllLogs();
  const summary = summarizeLogs(entries);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`\n  Review Log\n  ─────────────────────────────`);
  console.log(`    Total entries: ${summary.totalEntries}`);
  console.log(`    Total files reviewed: ${summary.totalFilesReviewed}`);
  console.log(`    Total findings: ${summary.totalFindings}`);
  console.log(`    Average duration: ${summary.averageDuration}ms`);

  if (summary.firstEntry) {
    console.log(`    Period: ${summary.firstEntry.slice(0, 10)} to ${summary.lastEntry.slice(0, 10)}`);
  }

  if (summary.recentEntries.length > 0) {
    console.log("\n    Recent entries:");
    for (const e of summary.recentEntries) {
      console.log(
        `      ${e.timestamp.slice(0, 19)} ${e.command} — ${e.findingsCount} findings, ${e.filesReviewed} files, ${e.duration}ms`,
      );
    }
  }

  console.log();
}

// Export for use by other commands
export { appendLog, ReviewLogEntry };
