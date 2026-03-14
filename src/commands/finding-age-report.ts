/**
 * Finding-age-report — Report on finding ages and staleness.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgeEntry {
  findingId: string;
  ruleId: string;
  severity: string;
  firstSeen: string;
  lastSeen: string;
}

interface AgeStore {
  version: string;
  entries: AgeEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const AGE_FILE = ".judges/finding-ages.json";

function loadStore(): AgeStore {
  if (!existsSync(AGE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(AGE_FILE, "utf-8")) as AgeStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: AgeStore): void {
  mkdirSync(dirname(AGE_FILE), { recursive: true });
  writeFileSync(AGE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAgeReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-age-report — Report on finding ages

Usage:
  judges finding-age-report                         Show age report
  judges finding-age-report update --file <results>  Update ages from results
  judges finding-age-report stale --days <n>         Show findings older than N days
  judges finding-age-report clear                    Clear age data

Options:
  --file <path>     Results file
  --days <n>        Staleness threshold (default: 30)
  --format json     JSON output
  --help, -h        Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["update", "stale", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "update") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let findings: Array<{ ruleId?: string; severity?: string; title?: string }>;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      findings = Array.isArray(data) ? data : data.findings || [];
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    const now = new Date().toISOString();
    let newCount = 0;
    let updatedCount = 0;

    for (const f of findings) {
      const id = f.ruleId || f.title || "unknown";
      const existing = store.entries.find((e) => e.findingId === id);
      if (existing) {
        existing.lastSeen = now;
        updatedCount++;
      } else {
        store.entries.push({
          findingId: id,
          ruleId: f.ruleId || "",
          severity: f.severity || "medium",
          firstSeen: now,
          lastSeen: now,
        });
        newCount++;
      }
    }

    saveStore(store);
    console.log(`Updated: ${newCount} new, ${updatedCount} existing findings.`);
    return;
  }

  if (subcommand === "stale") {
    const days = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--days") || "30", 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stale = store.entries.filter((e) => new Date(e.firstSeen).getTime() < cutoff);

    if (stale.length === 0) {
      console.log(`No findings older than ${days} days.`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(stale, null, 2));
      return;
    }

    console.log(`\nStale Findings (> ${days} days): ${stale.length}`);
    console.log("═".repeat(65));
    for (const e of stale) {
      const ageDays = Math.round((Date.now() - new Date(e.firstSeen).getTime()) / 86400000);
      console.log(`  ${e.findingId.padEnd(30)} ${e.severity.padEnd(10)} ${ageDays} days old`);
    }
    console.log("═".repeat(65));
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Age data cleared.");
    return;
  }

  // Default: show report
  if (store.entries.length === 0) {
    console.log("No age data. Use 'judges finding-age-report update --file <f>' to start tracking.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.entries, null, 2));
    return;
  }

  // Group by age bucket
  const now = Date.now();
  const buckets = { "< 1 day": 0, "1-7 days": 0, "7-30 days": 0, "30-90 days": 0, "> 90 days": 0 };
  for (const e of store.entries) {
    const ageDays = (now - new Date(e.firstSeen).getTime()) / 86400000;
    if (ageDays < 1) buckets["< 1 day"]++;
    else if (ageDays < 7) buckets["1-7 days"]++;
    else if (ageDays < 30) buckets["7-30 days"]++;
    else if (ageDays < 90) buckets["30-90 days"]++;
    else buckets["> 90 days"]++;
  }

  console.log(`\nFinding Age Report (${store.entries.length} tracked):`);
  console.log("═".repeat(40));
  for (const [bucket, count] of Object.entries(buckets)) {
    if (count > 0) console.log(`  ${bucket.padEnd(15)} ${count}`);
  }
  console.log("═".repeat(40));

  const avgAge =
    store.entries.reduce((sum, e) => sum + (now - new Date(e.firstSeen).getTime()), 0) /
    store.entries.length /
    86400000;
  console.log(`  Average age: ${avgAge.toFixed(1)} days`);
}
