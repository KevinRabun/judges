/**
 * Finding-recurrence — Track findings that keep coming back after being fixed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecurrenceRecord {
  fingerprint: string;
  ruleId: string;
  title: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  resolvedCount: number;
}

interface RecurrenceStore {
  version: string;
  records: RecurrenceRecord[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const RECURRENCE_FILE = join(".judges", "finding-recurrence.json");

function loadStore(): RecurrenceStore {
  if (!existsSync(RECURRENCE_FILE)) return { version: "1.0.0", records: [] };
  try {
    return JSON.parse(readFileSync(RECURRENCE_FILE, "utf-8")) as RecurrenceStore;
  } catch {
    return { version: "1.0.0", records: [] };
  }
}

function saveStore(store: RecurrenceStore): void {
  mkdirSync(dirname(RECURRENCE_FILE), { recursive: true });
  writeFileSync(RECURRENCE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function fingerprint(f: Finding): string {
  return [f.ruleId || "", f.title || "", String(f.severity || "")].join("|").toLowerCase();
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRecurrence(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-recurrence — Track recurring findings

Usage:
  judges finding-recurrence update --file verdict.json  Update records
  judges finding-recurrence show                        Show recurring findings
  judges finding-recurrence show --min 3                Show findings with 3+ occurrences
  judges finding-recurrence clear                       Clear all data

Subcommands:
  update                Update recurrence records from verdict
  show                  Show recurring findings
  clear                 Clear all data

Options:
  --file <path>         Verdict JSON file (for update)
  --min <n>             Minimum occurrences to show (default: 2)
  --format json         JSON output
  --help, -h            Show this help

Tracks findings that keep reappearing. Data in .judges/finding-recurrence.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["update", "show", "clear"].includes(a)) || "show";
  const store = loadStore();

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
      console.error("Error: Failed to parse verdict file.");
      process.exitCode = 1;
      return;
    }

    const now = new Date().toISOString();
    const seenFingerprints = new Set<string>();
    let newCount = 0;
    let recurCount = 0;

    for (const f of verdict.findings || []) {
      const fp = fingerprint(f);
      seenFingerprints.add(fp);
      const existing = store.records.find((r) => r.fingerprint === fp);
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = now;
        recurCount++;
      } else {
        store.records.push({
          fingerprint: fp,
          ruleId: f.ruleId || "",
          title: f.title || "",
          occurrences: 1,
          firstSeen: now,
          lastSeen: now,
          resolvedCount: 0,
        });
        newCount++;
      }
    }

    // Mark resolved findings
    for (const r of store.records) {
      if (!seenFingerprints.has(r.fingerprint) && r.occurrences > 0) {
        r.resolvedCount++;
      }
    }

    saveStore(store);
    console.log(`Updated: ${newCount} new, ${recurCount} recurring findings tracked.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", records: [] });
    console.log("Recurrence data cleared.");
    return;
  }

  // show
  const minOccurrences = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--min") || "2", 10);
  const recurring = store.records.filter((r) => r.occurrences >= minOccurrences);
  recurring.sort((a, b) => b.occurrences - a.occurrences);

  if (format === "json") {
    console.log(JSON.stringify(recurring, null, 2));
    return;
  }

  if (recurring.length === 0) {
    console.log(`No findings with ${minOccurrences}+ occurrences.`);
    return;
  }

  console.log(`\nRecurring Findings (${minOccurrences}+ occurrences):`);
  console.log("─".repeat(70));
  console.log("  Occurrences  Rule         Title");
  console.log("─".repeat(70));
  for (const r of recurring.slice(0, 30)) {
    console.log(`  ${String(r.occurrences).padEnd(12)} ${(r.ruleId || "-").padEnd(13)} ${r.title.slice(0, 40)}`);
  }
  console.log("─".repeat(70));
  console.log(`  ${recurring.length} recurring finding(s) found`);
  if (recurring.length > 30) console.log(`  (showing top 30 of ${recurring.length})`);
}
