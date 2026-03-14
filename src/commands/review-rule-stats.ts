/**
 * Review-rule-stats — Show per-rule statistics across reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RuleStat {
  ruleId: string;
  totalFindings: number;
  severityCounts: Record<string, number>;
  lastSeen: string;
  reviewCount: number;
}

interface RuleStatsStore {
  version: string;
  rules: Record<string, RuleStat>;
  totalReviews: number;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STATS_FILE = ".judges/rule-stats.json";

function loadStore(): RuleStatsStore {
  if (!existsSync(STATS_FILE)) return { version: "1.0.0", rules: {}, totalReviews: 0 };
  try {
    return JSON.parse(readFileSync(STATS_FILE, "utf-8")) as RuleStatsStore;
  } catch {
    return { version: "1.0.0", rules: {}, totalReviews: 0 };
  }
}

function saveStore(store: RuleStatsStore): void {
  mkdirSync(dirname(STATS_FILE), { recursive: true });
  writeFileSync(STATS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRuleStats(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-rule-stats — Per-rule statistics across reviews

Usage:
  judges review-rule-stats                     Show rule statistics
  judges review-rule-stats record --file <f>   Record findings from results file
  judges review-rule-stats top --count <n>     Show top N most triggered rules
  judges review-rule-stats rule --id <ruleId>  Show stats for a specific rule
  judges review-rule-stats clear               Clear all stats

Options:
  --file <path>     Results file
  --count <n>       Number of top rules (default: 10)
  --id <ruleId>     Rule ID to query
  --sort <field>    Sort by: count, severity, recent (default: count)
  --format json     JSON output
  --help, -h        Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["record", "top", "rule", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "record") {
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

    let findings: Array<{ ruleId?: string; severity?: string }>;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      findings = Array.isArray(data) ? data : data.findings || [];
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    store.totalReviews++;
    const now = new Date().toISOString();
    const seenRules = new Set<string>();

    for (const f of findings) {
      const ruleId = f.ruleId || "unknown";
      const sev = (f.severity || "medium").toLowerCase();
      if (!store.rules[ruleId]) {
        store.rules[ruleId] = { ruleId, totalFindings: 0, severityCounts: {}, lastSeen: now, reviewCount: 0 };
      }
      const stat = store.rules[ruleId];
      stat.totalFindings++;
      stat.severityCounts[sev] = (stat.severityCounts[sev] || 0) + 1;
      stat.lastSeen = now;
      seenRules.add(ruleId);
    }

    for (const ruleId of seenRules) {
      store.rules[ruleId].reviewCount++;
    }

    saveStore(store);
    console.log(
      `Recorded ${findings.length} findings across ${seenRules.size} rules. Total reviews: ${store.totalReviews}.`,
    );
    return;
  }

  if (subcommand === "rule") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const stat = store.rules[id];
    if (!stat) {
      console.log(`No stats for rule '${id}'.`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(stat, null, 2));
      return;
    }

    console.log(`\nRule: ${stat.ruleId}`);
    console.log("═".repeat(40));
    console.log(`  Total findings:   ${stat.totalFindings}`);
    console.log(`  Reviews with rule: ${stat.reviewCount} / ${store.totalReviews}`);
    console.log(`  Last seen:        ${stat.lastSeen.slice(0, 19)}`);
    console.log(`  By severity:`);
    for (const [sev, count] of Object.entries(stat.severityCounts)) {
      console.log(`    ${sev.padEnd(12)} ${count}`);
    }
    console.log("═".repeat(40));
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", rules: {}, totalReviews: 0 });
    console.log("Rule stats cleared.");
    return;
  }

  // Default / top: show top rules
  const ruleList = Object.values(store.rules);
  if (ruleList.length === 0) {
    console.log("No rule stats. Use 'judges review-rule-stats record --file <f>' to start tracking.");
    return;
  }

  const count = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--count") || "10", 10);
  const sortField = argv.find((_a: string, i: number) => argv[i - 1] === "--sort") || "count";

  if (sortField === "recent") {
    ruleList.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  } else if (sortField === "severity") {
    const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    ruleList.sort((a, b) => {
      const aMax = Math.max(...Object.entries(a.severityCounts).map(([s, c]) => (sevOrder[s] || 0) * c));
      const bMax = Math.max(...Object.entries(b.severityCounts).map(([s, c]) => (sevOrder[s] || 0) * c));
      return bMax - aMax;
    });
  } else {
    ruleList.sort((a, b) => b.totalFindings - a.totalFindings);
  }

  const top = ruleList.slice(0, count);

  if (format === "json") {
    console.log(JSON.stringify({ totalReviews: store.totalReviews, topRules: top }, null, 2));
    return;
  }

  console.log(`\nRule Statistics (${ruleList.length} rules, ${store.totalReviews} reviews):`);
  console.log("═".repeat(70));
  console.log("  Rule ID".padEnd(35) + "Count".padStart(7) + "Reviews".padStart(9) + "  Last Seen");
  console.log("─".repeat(70));
  for (const r of top) {
    const ruleDisplay = r.ruleId.length > 30 ? r.ruleId.slice(0, 27) + "..." : r.ruleId;
    console.log(
      `  ${ruleDisplay.padEnd(33)} ${String(r.totalFindings).padStart(7)} ${String(r.reviewCount).padStart(7)}   ${r.lastSeen.slice(0, 10)}`,
    );
  }
  console.log("═".repeat(70));
}
