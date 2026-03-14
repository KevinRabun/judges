/**
 * Review-progress-bar — Show review progress indicators for long-running reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProgressEntry {
  phase: string;
  total: number;
  completed: number;
  startedAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stateFile(): string {
  return join(process.cwd(), ".judges", "progress-state.json");
}

function loadState(): Record<string, ProgressEntry> {
  const f = stateFile();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state: Record<string, ProgressEntry>): void {
  const f = stateFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(state, null, 2));
}

function renderBar(completed: number, total: number, width: number): string {
  const ratio = total > 0 ? completed / total : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${pct}% (${completed}/${total})`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewProgressBar(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-progress-bar — Track and display review progress

Usage:
  judges review-progress-bar init   --phase <name> --total <n>
  judges review-progress-bar update --phase <name> --completed <n>
  judges review-progress-bar show   [--phase <name>] [--width <n>]
  judges review-progress-bar reset  [--phase <name>]
  judges review-progress-bar clear

Options:
  --phase <name>       Phase name (e.g., parsing, analysis, reporting)
  --total <n>          Total items to process
  --completed <n>      Items completed so far
  --width <n>          Bar width in characters (default: 40)
  --help, -h           Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const state = loadState();

  if (sub === "init") {
    const phase = args.find((_a: string, i: number) => args[i - 1] === "--phase");
    const totalStr = args.find((_a: string, i: number) => args[i - 1] === "--total");
    if (!phase || !totalStr) {
      console.error("Error: --phase and --total required");
      process.exitCode = 1;
      return;
    }
    const total = parseInt(totalStr, 10);
    if (isNaN(total) || total < 1) {
      console.error("Error: --total must be a positive integer");
      process.exitCode = 1;
      return;
    }
    const now = new Date().toISOString();
    state[phase] = { phase, total, completed: 0, startedAt: now, updatedAt: now };
    saveState(state);
    console.log(`Progress initialized: ${phase} (0/${total})`);
  } else if (sub === "update") {
    const phase = args.find((_a: string, i: number) => args[i - 1] === "--phase");
    const compStr = args.find((_a: string, i: number) => args[i - 1] === "--completed");
    if (!phase || !compStr) {
      console.error("Error: --phase and --completed required");
      process.exitCode = 1;
      return;
    }
    if (!state[phase]) {
      console.error(`Error: phase "${phase}" not found. Run init first.`);
      process.exitCode = 1;
      return;
    }
    const completed = parseInt(compStr, 10);
    if (isNaN(completed) || completed < 0) {
      console.error("Error: --completed must be a non-negative integer");
      process.exitCode = 1;
      return;
    }
    state[phase].completed = Math.min(completed, state[phase].total);
    state[phase].updatedAt = new Date().toISOString();
    saveState(state);
    console.log(`Updated: ${phase} — ${renderBar(state[phase].completed, state[phase].total, 30)}`);
  } else if (sub === "show") {
    const phase = args.find((_a: string, i: number) => args[i - 1] === "--phase");
    const widthStr = args.find((_a: string, i: number) => args[i - 1] === "--width");
    const width = widthStr ? parseInt(widthStr, 10) : 40;

    const entries = phase ? (state[phase] ? [state[phase]] : []) : Object.values(state);
    if (entries.length === 0) {
      console.log("No active progress tracking.");
      return;
    }

    console.log("\nReview Progress:");
    console.log("═".repeat(60));
    for (const e of entries) {
      console.log(`  ${e.phase.padEnd(20)} ${renderBar(e.completed, e.total, width)}`);
    }

    // Overall
    if (entries.length > 1) {
      const totalAll = entries.reduce((s, e) => s + e.total, 0);
      const compAll = entries.reduce((s, e) => s + e.completed, 0);
      console.log("─".repeat(60));
      console.log(`  ${"OVERALL".padEnd(20)} ${renderBar(compAll, totalAll, width)}`);
    }
    console.log("═".repeat(60));
  } else if (sub === "reset") {
    const phase = args.find((_a: string, i: number) => args[i - 1] === "--phase");
    if (phase) {
      if (state[phase]) {
        state[phase].completed = 0;
        state[phase].updatedAt = new Date().toISOString();
        saveState(state);
        console.log(`Reset: ${phase}`);
      } else {
        console.error(`Phase "${phase}" not found.`);
        process.exitCode = 1;
      }
    } else {
      for (const k of Object.keys(state)) {
        state[k].completed = 0;
        state[k].updatedAt = new Date().toISOString();
      }
      saveState(state);
      console.log("All phases reset.");
    }
  } else if (sub === "clear") {
    saveState({});
    console.log("Progress tracking cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
