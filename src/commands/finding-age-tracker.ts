/**
 * Finding-age-tracker — Track the age of findings over time.
 *
 * Records when findings first appear and tracks their age,
 * helping prioritize long-standing issues.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgeRecord {
  ruleId: string;
  title: string;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ageFile(): string {
  return join(process.cwd(), ".judges", "finding-ages.json");
}

function loadAges(): AgeRecord[] {
  const f = ageFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveAges(ages: AgeRecord[]): void {
  const f = ageFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(ages, null, 2));
}

function daysBetween(d1: string, d2: string): number {
  const ms = new Date(d2).getTime() - new Date(d1).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function ageLabel(days: number): string {
  if (days === 0) return "new";
  if (days <= 7) return `${days}d`;
  if (days <= 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAgeTracker(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges finding-age-tracker — Track finding ages

Usage:
  judges finding-age-tracker update --file <verdict.json>
  judges finding-age-tracker show   [--min-age <days>] [--format table|json]
  judges finding-age-tracker clear

Options:
  --file <path>      Verdict JSON to record (for update)
  --min-age <days>   Show only findings older than N days
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (sub === "update") {
    const fileIdx = argv.indexOf("--file");
    const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
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

    const ages = loadAges();
    const now = new Date().toISOString();
    const ageMap = new Map(ages.map((a) => [`${a.ruleId}:${a.title}`, a]));

    for (const f of verdict.findings) {
      const key = `${f.ruleId}:${f.title}`;
      const existing = ageMap.get(key);
      if (existing) {
        existing.lastSeen = now;
        existing.occurrences++;
      } else {
        ageMap.set(key, {
          ruleId: f.ruleId,
          title: f.title,
          firstSeen: now,
          lastSeen: now,
          occurrences: 1,
        });
      }
    }

    saveAges([...ageMap.values()]);
    console.log(`Updated: ${verdict.findings.length} findings recorded (${ageMap.size} total tracked)`);
  } else if (sub === "show") {
    const minAgeIdx = argv.indexOf("--min-age");
    const formatIdx = argv.indexOf("--format");
    const minAge = minAgeIdx >= 0 ? parseInt(argv[minAgeIdx + 1], 10) : 0;
    const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

    const ages = loadAges();
    if (ages.length === 0) {
      console.log("No age data recorded. Run 'update' first.");
      return;
    }

    const now = new Date().toISOString();
    const filtered = ages
      .map((a) => ({ ...a, ageDays: daysBetween(a.firstSeen, now) }))
      .filter((a) => a.ageDays >= minAge)
      .sort((a, b) => b.ageDays - a.ageDays);

    if (format === "json") {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    console.log(`\nFinding Age Tracker (${filtered.length} findings)`);
    console.log("═".repeat(70));
    console.log(`${"Age".padEnd(8)} ${"Seen".padEnd(6)} ${"Rule".padEnd(25)} Title`);
    console.log("─".repeat(70));

    for (const a of filtered) {
      const age = ageLabel(a.ageDays).padEnd(8);
      const seen = String(a.occurrences).padEnd(6);
      const rule = a.ruleId.length > 23 ? a.ruleId.slice(0, 23) + "…" : a.ruleId;
      const title = a.title.length > 25 ? a.title.slice(0, 25) + "…" : a.title;
      console.log(`${age} ${seen} ${rule.padEnd(25)} ${title}`);
    }

    console.log("─".repeat(70));
    const avgAge =
      filtered.length > 0 ? (filtered.reduce((s, a) => s + a.ageDays, 0) / filtered.length).toFixed(1) : "0";
    console.log(`Average age: ${avgAge} days`);
    console.log("═".repeat(70));
  } else if (sub === "clear") {
    saveAges([]);
    console.log("Finding age data cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
