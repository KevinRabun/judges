/**
 * Review-report-schedule — Configure and view scheduled report generation.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  id: string;
  frequency: "daily" | "weekly" | "monthly";
  format: string;
  outputDir: string;
  createdAt: string;
}

interface ScheduleConfig {
  version: number;
  schedules: ScheduleEntry[];
}

// ─── Logic ──────────────────────────────────────────────────────────────────

function loadSchedule(path: string): ScheduleConfig {
  if (!existsSync(path)) {
    return { version: 1, schedules: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: 1, schedules: [] };
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewReportSchedule(argv: string[]): void {
  const configIdx = argv.indexOf("--config");
  const addIdx = argv.indexOf("--add");
  const freqIdx = argv.indexOf("--frequency");
  const fmtIdx = argv.indexOf("--report-format");
  const outIdx = argv.indexOf("--output-dir");
  const removeIdx = argv.indexOf("--remove");
  const formatIdx = argv.indexOf("--format");
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-schedule.json";
  const addId = addIdx >= 0 ? argv[addIdx + 1] : undefined;
  const frequency = freqIdx >= 0 ? (argv[freqIdx + 1] as ScheduleEntry["frequency"]) : "weekly";
  const reportFormat = fmtIdx >= 0 ? argv[fmtIdx + 1] : "markdown";
  const outputDir = outIdx >= 0 ? argv[outIdx + 1] : "./reports";
  const removeId = removeIdx >= 0 ? argv[removeIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-report-schedule — Manage report schedules

Usage:
  judges review-report-schedule [--config <path>] [--add <id>]
                                [--frequency daily|weekly|monthly]
                                [--report-format <fmt>] [--output-dir <path>]
                                [--remove <id>] [--format table|json]

Options:
  --config <path>        Schedule config file (default: .judges-schedule.json)
  --add <id>             Add a new schedule
  --frequency <freq>     Schedule frequency (default: weekly)
  --report-format <fmt>  Report format (default: markdown)
  --output-dir <path>    Output directory (default: ./reports)
  --remove <id>          Remove a schedule by ID
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help
`);
    return;
  }

  const config = loadSchedule(configPath);

  // Remove mode
  if (removeId) {
    config.schedules = config.schedules.filter((s) => s.id !== removeId);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Removed schedule "${removeId}"`);
    return;
  }

  // Add mode
  if (addId) {
    const existing = config.schedules.find((s) => s.id === addId);
    if (existing) {
      console.error(`Error: schedule "${addId}" already exists`);
      process.exitCode = 1;
      return;
    }

    config.schedules.push({
      id: addId,
      frequency,
      format: reportFormat,
      outputDir,
      createdAt: new Date().toISOString(),
    });

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Added schedule "${addId}" (${frequency})`);
    return;
  }

  // List mode
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\nReport Schedules (${config.schedules.length})`);
  console.log("═".repeat(65));
  console.log(`${"ID".padEnd(18)} ${"Frequency".padEnd(12)} ${"Format".padEnd(12)} Output Dir`);
  console.log("─".repeat(65));

  for (const s of config.schedules) {
    const id = s.id.length > 16 ? s.id.slice(0, 16) + "…" : s.id;
    console.log(`${id.padEnd(18)} ${s.frequency.padEnd(12)} ${s.format.padEnd(12)} ${s.outputDir}`);
  }
  console.log("═".repeat(65));
}
