/**
 * Finding-false-positive-learn — Track false positive patterns to improve future triage.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FalsePositiveEntry {
  ruleId: string;
  pattern: string;
  reason: string;
  reportedAt: string;
  occurrences: number;
}

interface FalsePositiveStore {
  entries: FalsePositiveEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFalsePositiveLearn(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-false-positives.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const addMode = argv.includes("--add");
  const ruleIdx = argv.indexOf("--rule");
  const ruleId = ruleIdx >= 0 ? argv[ruleIdx + 1] : "";
  const patternIdx = argv.indexOf("--pattern");
  const pattern = patternIdx >= 0 ? argv[patternIdx + 1] : "";
  const reasonIdx = argv.indexOf("--reason");
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-false-positive-learn — Track false positive patterns

Usage:
  judges finding-false-positive-learn [--store <path>] [--format table|json]
  judges finding-false-positive-learn --add --rule <id> --pattern <pat> --reason <text> [--store <path>]

Options:
  --store <path>     FP store file (default: .judges-false-positives.json)
  --add              Add a new false positive pattern
  --rule <id>        Rule ID of the false positive
  --pattern <pat>    Code pattern that triggers the FP
  --reason <text>    Why this is a false positive
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const store: FalsePositiveStore = existsSync(storePath)
    ? (JSON.parse(readFileSync(storePath, "utf-8")) as FalsePositiveStore)
    : { entries: [], lastUpdated: new Date().toISOString() };

  if (addMode) {
    if (!ruleId || !pattern || !reason) {
      console.error("Provide --rule, --pattern, and --reason when using --add.");
      process.exitCode = 1;
      return;
    }

    const existing = store.entries.find((e) => e.ruleId === ruleId && e.pattern === pattern);
    if (existing) {
      existing.occurrences += 1;
      existing.reason = reason;
    } else {
      store.entries.push({
        ruleId,
        pattern,
        reason,
        reportedAt: new Date().toISOString(),
        occurrences: 1,
      });
    }

    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Recorded false positive pattern for ${ruleId}.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nFalse Positive Patterns");
  console.log("═".repeat(80));

  if (store.entries.length === 0) {
    console.log("  No false positive patterns recorded yet.");
  } else {
    console.log(`  ${"Rule ID".padEnd(25)} ${"Pattern".padEnd(20)} ${"Count".padEnd(8)} Reason`);
    console.log("  " + "─".repeat(75));

    for (const e of store.entries) {
      const pat = e.pattern.length > 18 ? e.pattern.slice(0, 15) + "..." : e.pattern;
      const rsn = e.reason.length > 25 ? e.reason.slice(0, 22) + "..." : e.reason;
      console.log(`  ${e.ruleId.padEnd(25)} ${pat.padEnd(20)} ${String(e.occurrences).padEnd(8)} ${rsn}`);
    }
  }

  console.log(`\n  Total patterns: ${store.entries.length}`);
  console.log("═".repeat(80));
}
