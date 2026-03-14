/**
 * `judges dedup-report` — Cross-run finding deduplication report.
 *
 * Shows which findings are new vs recurring vs fixed across runs.
 * Built on the existing finding-lifecycle tracking infrastructure.
 *
 * Usage:
 *   judges dedup-report                       # Show finding delta report
 *   judges dedup-report --format json         # JSON output
 *   judges dedup-report --stats               # Summary statistics only
 */

import { loadFindingStore, getFindingStats } from "../finding-lifecycle.js";
import type { TrackedFinding } from "../finding-lifecycle.js";
import { resolve } from "path";

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runDedupReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges dedup-report — Cross-run finding deduplication report

Usage:
  judges dedup-report [dir]                 Show finding delta report
  judges dedup-report --stats               Summary statistics only
  judges dedup-report --recurring           Show only recurring findings
  judges dedup-report --new                 Show only new findings since last run
  judges dedup-report --fixed               Show recently fixed findings
  judges dedup-report --format json         JSON output

Reads .judges-findings.json from the project directory to show:
  • New findings introduced since last run
  • Recurring findings (persistent across runs)
  • Fixed findings (no longer detected)
  • Trend analysis (improving / stable / degrading)

Options:
  --dir <path>         Project directory (default: current)
  --stats              Show summary statistics only
  --recurring          Filter to recurring findings
  --new                Filter to newly introduced findings
  --fixed              Filter to fixed findings
  --format <fmt>       Output format: text, json
  --help, -h           Show this help
`);
    return;
  }

  const dir = resolve(
    argv.find((_a, i) => argv[i - 1] === "--dir") ||
      argv.find((a, i) => i > 1 && !a.startsWith("-") && argv[i - 1] !== "--format" && argv[i - 1] !== "--dir") ||
      ".",
  );
  const format = argv.find((_a, i) => argv[i - 1] === "--format") || "text";
  const statsOnly = argv.includes("--stats");
  const showRecurring = argv.includes("--recurring");
  const showNew = argv.includes("--new");
  const showFixed = argv.includes("--fixed");

  const store = loadFindingStore(dir);

  if (store.findings.length === 0) {
    console.log("\n  No finding history found. Run 'judges eval' first to build the finding store.\n");
    return;
  }

  const stats = getFindingStats(store);

  if (format === "json") {
    const data: Record<string, unknown> = { stats, runNumber: store.runNumber, lastRunAt: store.lastRunAt };
    if (!statsOnly) {
      const openFindings = store.findings.filter((f) => f.status === "open");
      const fixedFindings = store.findings.filter((f) => f.status === "fixed");
      const newFindings = openFindings.filter((f) => f.runCount === 1);
      const recurringFindings = openFindings.filter((f) => f.runCount > 1);

      if (showNew) data.findings = newFindings;
      else if (showRecurring) data.findings = recurringFindings;
      else if (showFixed) data.findings = fixedFindings;
      else data.findings = { new: newFindings, recurring: recurringFindings, fixed: fixedFindings };
    }
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Text output
  console.log(`\n  Finding Deduplication Report  —  Run #${store.runNumber}  (${store.lastRunAt})\n`);

  // Stats
  console.log(`  Total tracked:    ${stats.totalOpen + stats.totalFixed}`);
  console.log(`  Open:             ${stats.totalOpen}`);
  console.log(`  Fixed:            ${stats.totalFixed}`);
  console.log(`  Triaged:          ${stats.totalTriaged}`);
  console.log(`  Avg age (days):   ${Math.round(stats.avgAge)}`);
  console.log("");

  // Severity breakdown
  console.log("  By severity:");
  for (const [sev, count] of Object.entries(stats.bySeverity)) {
    if (count > 0) {
      console.log(`    ${sev.toUpperCase().padEnd(10)} ${count}`);
    }
  }
  console.log("");

  if (statsOnly) return;

  const openFindings = store.findings.filter((f) => f.status === "open");
  const fixedFindings = store.findings.filter((f) => f.status === "fixed");
  const newFindings = openFindings.filter((f) => f.runCount === 1);
  const recurringFindings = openFindings.filter((f) => f.runCount > 1);

  // New findings
  if (!showRecurring && !showFixed && newFindings.length > 0) {
    console.log(`  ─── New Findings (${newFindings.length}) ───\n`);
    printFindings(newFindings);
  }

  // Recurring
  if (!showNew && !showFixed && recurringFindings.length > 0) {
    console.log(`  ─── Recurring Findings (${recurringFindings.length}) ───\n`);
    printFindings(recurringFindings, true);
  }

  // Fixed
  if (!showNew && !showRecurring && fixedFindings.length > 0) {
    const recentFixed = fixedFindings.filter((f) => {
      if (!f.fixedAt) return false;
      const fixedDate = new Date(f.fixedAt);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return fixedDate >= weekAgo;
    });
    if (recentFixed.length > 0) {
      console.log(`  ─── Recently Fixed (${recentFixed.length}) ───\n`);
      printFindings(recentFixed);
    }
  }

  console.log("");
}

function printFindings(findings: TrackedFinding[], showRunCount: boolean = false): void {
  for (const f of findings.slice(0, 20)) {
    const runInfo = showRunCount ? ` (${f.runCount} runs)` : "";
    console.log(`  • [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}${runInfo}`);
    console.log(`    ${f.filePath}`);
  }
  if (findings.length > 20) {
    console.log(`  ... and ${findings.length - 20} more`);
  }
  console.log("");
}
