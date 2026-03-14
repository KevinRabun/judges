/**
 * Review-schedule — Configure scheduled review cadences (stored locally).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
  createdAt: string;
  lastRun: string;
  description: string;
}

interface ScheduleStore {
  version: string;
  schedules: ScheduleEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SCHEDULE_FILE = join(".judges", "schedules.json");

function loadSchedules(): ScheduleStore {
  if (!existsSync(SCHEDULE_FILE)) return { version: "1.0.0", schedules: [] };
  try {
    return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8")) as ScheduleStore;
  } catch {
    return { version: "1.0.0", schedules: [] };
  }
}

function saveSchedules(store: ScheduleStore): void {
  mkdirSync(dirname(SCHEDULE_FILE), { recursive: true });
  writeFileSync(SCHEDULE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Cron generation ────────────────────────────────────────────────────────

function generateCiConfig(schedule: ScheduleEntry, ci: string): string {
  if (ci === "github-actions") {
    return `# ${schedule.name}: ${schedule.description}
name: Scheduled Review - ${schedule.name}
on:
  schedule:
    - cron: '${schedule.cron}'
  workflow_dispatch:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @kevinrabun/judges ${schedule.command}
`;
  }

  // Generic
  return `# Schedule: ${schedule.name}\n# Cron: ${schedule.cron}\n# Command: judges ${schedule.command}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSchedule(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-schedule — Configure scheduled review cadences

Usage:
  judges review-schedule list                        List schedules
  judges review-schedule add --name daily --cron "0 8 * * *" --command "eval src/"
  judges review-schedule remove --id sched-xxx       Remove a schedule
  judges review-schedule enable --id sched-xxx       Enable a schedule
  judges review-schedule disable --id sched-xxx      Disable a schedule
  judges review-schedule generate --id sched-xxx --ci github-actions

Subcommands:
  list                 List all configured schedules
  add                  Add a new scheduled review
  remove               Remove a schedule
  enable               Enable a schedule
  disable              Disable a schedule
  generate             Generate CI configuration for a schedule

Options:
  --name <name>         Schedule name
  --cron <expr>         Cron expression
  --command <cmd>       Judges command to run
  --id <id>             Schedule ID
  --ci <type>           CI system (github-actions)
  --description <text>  Description
  --format json         JSON output
  --help, -h            Show this help

Schedules are stored locally in .judges/schedules.json.
Use 'generate' to create CI workflow files for automated execution.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["list", "add", "remove", "enable", "disable", "generate"].includes(a)) || "list";
  const store = loadSchedules();

  if (subcommand === "add") {
    const name =
      argv.find((_a: string, i: number) => argv[i - 1] === "--name") || `schedule-${store.schedules.length + 1}`;
    const cron = argv.find((_a: string, i: number) => argv[i - 1] === "--cron") || "0 8 * * 1-5";
    const command = argv.find((_a: string, i: number) => argv[i - 1] === "--command") || "eval .";
    const description = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || "";

    const entry: ScheduleEntry = {
      id: `sched-${Date.now().toString(36)}`,
      name,
      cron,
      command,
      enabled: true,
      createdAt: new Date().toISOString(),
      lastRun: "",
      description,
    };

    store.schedules.push(entry);
    saveSchedules(store);
    console.log(`Added schedule '${name}' (${entry.id}) — cron: ${cron}`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    store.schedules = store.schedules.filter((s) => s.id !== id);
    saveSchedules(store);
    console.log(`Removed schedule '${id}'.`);
    return;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const entry = store.schedules.find((s) => s.id === id);
    if (!entry) {
      console.error(`Error: Schedule '${id}' not found.`);
      process.exitCode = 1;
      return;
    }
    entry.enabled = subcommand === "enable";
    saveSchedules(store);
    console.log(`Schedule '${id}' ${subcommand}d.`);
    return;
  }

  if (subcommand === "generate") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    const ci = argv.find((_a: string, i: number) => argv[i - 1] === "--ci") || "github-actions";
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const entry = store.schedules.find((s) => s.id === id);
    if (!entry) {
      console.error(`Error: Schedule '${id}' not found.`);
      process.exitCode = 1;
      return;
    }
    console.log(generateCiConfig(entry, ci));
    return;
  }

  // List
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\n  Review Schedules (${store.schedules.length})\n  ═════════════════════════════`);

  if (store.schedules.length === 0) {
    console.log('    No schedules. Add one with: judges review-schedule add --name daily --cron "0 8 * * *"');
  }

  for (const s of store.schedules) {
    const status = s.enabled ? "✅" : "⏸️";
    console.log(`    ${status} ${s.id} — ${s.name} (${s.cron}) command: ${s.command}`);
    if (s.description) console.log(`       ${s.description}`);
  }

  console.log();
}
