/**
 * Finding-resolution-track — Track finding resolution status over time.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ResolutionEntry {
  ruleId: string;
  severity: string;
  title: string;
  status: "open" | "resolved" | "wontfix" | "deferred";
  firstSeen: string;
  lastSeen: string;
  resolvedAt?: string;
}

interface ResolutionStore {
  entries: ResolutionEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingResolutionTrack(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const storeIdx = argv.indexOf("--store");
  const resolveIdx = argv.indexOf("--resolve");
  const deferIdx = argv.indexOf("--defer");
  const wontfixIdx = argv.indexOf("--wontfix");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-resolutions.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-resolution-track — Track finding resolution status

Usage:
  judges finding-resolution-track [--file <review.json>] [--store <path>]
                                  [--resolve <ruleId>] [--defer <ruleId>]
                                  [--wontfix <ruleId>] [--format table|json]

Options:
  --file <path>       Import findings from review result
  --store <path>      Resolution store file (default: .judges-resolutions.json)
  --resolve <ruleId>  Mark a rule as resolved
  --defer <ruleId>    Mark a rule as deferred
  --wontfix <ruleId>  Mark a rule as wontfix
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  // Load or init store
  let store: ResolutionStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as ResolutionStore;
  } else {
    store = { entries: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  const today = new Date().toISOString().split("T")[0];

  // Mark resolved
  if (resolveIdx >= 0) {
    const ruleId = argv[resolveIdx + 1];
    const entry = store.entries.find((e) => e.ruleId === ruleId && e.status === "open");
    if (entry) {
      entry.status = "resolved";
      entry.resolvedAt = today;
      store.lastUpdated = today;
      writeFileSync(storePath, JSON.stringify(store, null, 2));
      console.log(`Marked ${ruleId} as resolved.`);
    } else {
      console.error(`No open entry found for ${ruleId}`);
      process.exitCode = 1;
    }
    return;
  }

  // Mark deferred
  if (deferIdx >= 0) {
    const ruleId = argv[deferIdx + 1];
    const entry = store.entries.find((e) => e.ruleId === ruleId && e.status === "open");
    if (entry) {
      entry.status = "deferred";
      store.lastUpdated = today;
      writeFileSync(storePath, JSON.stringify(store, null, 2));
      console.log(`Marked ${ruleId} as deferred.`);
    } else {
      console.error(`No open entry found for ${ruleId}`);
      process.exitCode = 1;
    }
    return;
  }

  // Mark wontfix
  if (wontfixIdx >= 0) {
    const ruleId = argv[wontfixIdx + 1];
    const entry = store.entries.find((e) => e.ruleId === ruleId && e.status === "open");
    if (entry) {
      entry.status = "wontfix";
      store.lastUpdated = today;
      writeFileSync(storePath, JSON.stringify(store, null, 2));
      console.log(`Marked ${ruleId} as wontfix.`);
    } else {
      console.error(`No open entry found for ${ruleId}`);
      process.exitCode = 1;
    }
    return;
  }

  // Import findings from review
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
    } catch {
      console.error(`Error: failed to parse review file: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    let added = 0;
    for (const f of verdict.findings) {
      const existing = store.entries.find((e) => e.ruleId === f.ruleId && e.title === f.title);
      if (existing) {
        existing.lastSeen = today;
      } else {
        store.entries.push({
          ruleId: f.ruleId,
          severity: f.severity,
          title: f.title,
          status: "open",
          firstSeen: today,
          lastSeen: today,
        });
        added++;
      }
    }

    store.lastUpdated = today;
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Imported ${added} new finding(s), updated ${verdict.findings.length - added} existing.`);
    return;
  }

  // Display current state
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  const open = store.entries.filter((e) => e.status === "open");
  const resolved = store.entries.filter((e) => e.status === "resolved");
  const deferred = store.entries.filter((e) => e.status === "deferred");

  console.log(`\nResolution Tracking: ${store.entries.length} total`);
  console.log(`  Open: ${open.length}  Resolved: ${resolved.length}  Deferred: ${deferred.length}`);
  console.log("═".repeat(65));

  for (const e of store.entries) {
    const statusBadge =
      e.status === "open" ? "[ ]" : e.status === "resolved" ? "[✓]" : e.status === "deferred" ? "[~]" : "[x]";
    console.log(`  ${statusBadge} ${e.ruleId.padEnd(20)} [${e.severity}] ${e.title}`);
    console.log(`      First: ${e.firstSeen}  Last: ${e.lastSeen}${e.resolvedAt ? `  Resolved: ${e.resolvedAt}` : ""}`);
  }

  console.log("═".repeat(65));
}
