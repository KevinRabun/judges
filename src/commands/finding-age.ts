/**
 * Finding-age — Track how long findings have been unresolved.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgeRecord {
  fingerprint: string;
  ruleId: string;
  title: string;
  severity: string;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
  resolvedAt: string;
  ageInDays: number;
}

interface AgeStore {
  version: string;
  records: AgeRecord[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const AGE_FILE = join(".judges", "finding-age.json");

function loadAgeStore(): AgeStore {
  if (!existsSync(AGE_FILE)) return { version: "1.0.0", records: [] };
  try {
    return JSON.parse(readFileSync(AGE_FILE, "utf-8")) as AgeStore;
  } catch {
    return { version: "1.0.0", records: [] };
  }
}

function saveAgeStore(store: AgeStore): void {
  mkdirSync(dirname(AGE_FILE), { recursive: true });
  writeFileSync(AGE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function findingFingerprint(f: Finding): string {
  return [f.ruleId || "", f.title || "", String(f.severity || "")].join("|").toLowerCase();
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-age — Track how long findings have been unresolved

Usage:
  judges finding-age update --file verdict.json    Update age records
  judges finding-age show                          Show finding ages
  judges finding-age show --stale 30               Show findings older than 30 days
  judges finding-age clear                         Clear all records

Subcommands:
  update               Update records from a verdict file
  show                 Show age report
  clear                Clear all tracking data

Options:
  --file <path>         Verdict JSON (for update)
  --stale <days>        Show only findings older than N days
  --format json         JSON output
  --help, -h            Show this help

Tracks first-seen dates and age of findings across reviews.
Data stored locally in .judges/finding-age.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["update", "show", "clear"].includes(a)) || "show";
  const store = loadAgeStore();

  if (subcommand === "update") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file || !existsSync(file)) {
      console.error("Error: --file with valid verdict JSON is required.");
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

    const now = new Date().toISOString();
    const currentFingerprints = new Set<string>();

    for (const f of verdict.findings || []) {
      const fp = findingFingerprint(f);
      currentFingerprints.add(fp);

      const existing = store.records.find((r) => r.fingerprint === fp);
      if (existing) {
        existing.lastSeen = now;
        existing.ageInDays = daysBetween(existing.firstSeen, now);
        existing.resolved = false;
        existing.resolvedAt = "";
      } else {
        store.records.push({
          fingerprint: fp,
          ruleId: f.ruleId || "",
          title: f.title || "",
          severity: f.severity || "unknown",
          firstSeen: now,
          lastSeen: now,
          resolved: false,
          resolvedAt: "",
          ageInDays: 0,
        });
      }
    }

    // Mark resolved findings
    for (const r of store.records) {
      if (!currentFingerprints.has(r.fingerprint) && !r.resolved) {
        r.resolved = true;
        r.resolvedAt = now;
      }
    }

    saveAgeStore(store);
    console.log(`Updated ${store.records.length} finding age records.`);
    return;
  }

  if (subcommand === "clear") {
    saveAgeStore({ version: "1.0.0", records: [] });
    console.log("Finding age records cleared.");
    return;
  }

  // Show
  const staleStr = argv.find((_a: string, i: number) => argv[i - 1] === "--stale");
  const staleDays = staleStr ? parseInt(staleStr, 10) : 0;

  let records = store.records.filter((r) => !r.resolved);
  if (staleDays > 0) {
    records = records.filter((r) => r.ageInDays >= staleDays);
  }

  records.sort((a, b) => b.ageInDays - a.ageInDays);

  if (format === "json") {
    console.log(
      JSON.stringify({ total: store.records.length, unresolved: records.length, staleDays, records }, null, 2),
    );
    return;
  }

  console.log(`\n  Finding Age Report\n  ═════════════════════════════`);
  console.log(`    Total tracked: ${store.records.length}`);
  console.log(`    Unresolved: ${records.length}`);
  console.log(`    Resolved: ${store.records.filter((r) => r.resolved).length}`);
  if (staleDays > 0) console.log(`    Showing: older than ${staleDays} days`);
  console.log();

  if (records.length === 0) {
    console.log("    No unresolved findings matching criteria.");
  }

  for (const r of records) {
    const icon = r.ageInDays > 30 ? "🔴" : r.ageInDays > 7 ? "🟡" : "🟢";
    console.log(
      `    ${icon} ${r.ageInDays}d — [${r.severity.toUpperCase()}] ${r.title || r.ruleId} (since ${r.firstSeen.slice(0, 10)})`,
    );
  }

  console.log();
}
