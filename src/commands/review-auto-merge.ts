/**
 * Review-auto-merge — Auto-merge reviews that pass all checks.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AutoMergePolicy {
  maxFindings: number;
  maxCritical: number;
  maxHigh: number;
  minScore: number;
  requireCleanBuild: boolean;
}

interface AutoMergeStore {
  version: string;
  policy: AutoMergePolicy;
  history: Array<{ timestamp: string; result: "merged" | "blocked"; reason: string }>;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/auto-merge.json";

function loadStore(): AutoMergeStore {
  if (!existsSync(STORE_FILE)) {
    return {
      version: "1.0.0",
      policy: { maxFindings: 0, maxCritical: 0, maxHigh: 0, minScore: 80, requireCleanBuild: true },
      history: [],
    };
  }
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as AutoMergeStore;
  } catch {
    return {
      version: "1.0.0",
      policy: { maxFindings: 0, maxCritical: 0, maxHigh: 0, minScore: 80, requireCleanBuild: true },
      history: [],
    };
  }
}

function saveStore(store: AutoMergeStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAutoMerge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-auto-merge — Auto-merge reviews that pass checks

Usage:
  judges review-auto-merge check --file <results>    Check if results pass merge policy
  judges review-auto-merge policy                    Show current merge policy
  judges review-auto-merge set --max-findings <n> --min-score <n>
  judges review-auto-merge history                   Show merge history
  judges review-auto-merge clear                     Clear history

Options:
  --file <path>         Results file to evaluate
  --max-findings <n>    Max allowed findings (default: 0)
  --max-critical <n>    Max allowed critical findings (default: 0)
  --max-high <n>        Max allowed high findings (default: 0)
  --min-score <n>       Minimum score to pass (default: 80)
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["check", "policy", "set", "history", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "set") {
    const maxFindings = argv.find((_a: string, i: number) => argv[i - 1] === "--max-findings");
    const maxCritical = argv.find((_a: string, i: number) => argv[i - 1] === "--max-critical");
    const maxHigh = argv.find((_a: string, i: number) => argv[i - 1] === "--max-high");
    const minScore = argv.find((_a: string, i: number) => argv[i - 1] === "--min-score");
    if (maxFindings) store.policy.maxFindings = parseInt(maxFindings, 10);
    if (maxCritical) store.policy.maxCritical = parseInt(maxCritical, 10);
    if (maxHigh) store.policy.maxHigh = parseInt(maxHigh, 10);
    if (minScore) store.policy.minScore = parseInt(minScore, 10);
    saveStore(store);
    console.log("Merge policy updated.");
    return;
  }

  if (subcommand === "policy") {
    if (format === "json") {
      console.log(JSON.stringify(store.policy, null, 2));
      return;
    }
    console.log("\nAuto-Merge Policy:");
    console.log("═".repeat(40));
    console.log(`  Max findings:  ${store.policy.maxFindings}`);
    console.log(`  Max critical:  ${store.policy.maxCritical}`);
    console.log(`  Max high:      ${store.policy.maxHigh}`);
    console.log(`  Min score:     ${store.policy.minScore}`);
    console.log(`  Clean build:   ${store.policy.requireCleanBuild}`);
    console.log("═".repeat(40));
    return;
  }

  if (subcommand === "check") {
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

    let data: { findings?: Array<{ severity?: string }>; overallScore?: number };
    try {
      data = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    const findings = data.findings || [];
    const score = data.overallScore || 0;
    const critCount = findings.filter((f) => (f.severity || "").toLowerCase() === "critical").length;
    const highCount = findings.filter((f) => (f.severity || "").toLowerCase() === "high").length;

    const reasons: string[] = [];
    if (findings.length > store.policy.maxFindings)
      reasons.push(`${findings.length} findings > ${store.policy.maxFindings}`);
    if (critCount > store.policy.maxCritical) reasons.push(`${critCount} critical > ${store.policy.maxCritical}`);
    if (highCount > store.policy.maxHigh) reasons.push(`${highCount} high > ${store.policy.maxHigh}`);
    if (score < store.policy.minScore) reasons.push(`score ${score} < ${store.policy.minScore}`);

    const result = reasons.length === 0 ? "merged" : "blocked";
    store.history.push({
      timestamp: new Date().toISOString(),
      result,
      reason: reasons.join("; ") || "all checks passed",
    });
    saveStore(store);

    if (format === "json") {
      console.log(JSON.stringify({ result, reasons, findings: findings.length, score }, null, 2));
      if (result === "blocked") process.exitCode = 1;
      return;
    }

    console.log(result === "merged" ? "Auto-merge: APPROVED" : "Auto-merge: BLOCKED");
    for (const r of reasons) console.log(`  - ${r}`);
    if (result === "blocked") process.exitCode = 1;
    return;
  }

  if (subcommand === "history") {
    if (store.history.length === 0) {
      console.log("No merge history.");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(store.history, null, 2));
      return;
    }
    console.log(`\nMerge History (${store.history.length}):`);
    console.log("═".repeat(60));
    for (const h of store.history.slice(-20)) {
      console.log(`  ${h.timestamp.slice(0, 19)}  ${h.result.padEnd(8)}  ${h.reason}`);
    }
    console.log("═".repeat(60));
    return;
  }

  if (subcommand === "clear") {
    store.history = [];
    saveStore(store);
    console.log("Merge history cleared.");
    return;
  }

  // Default: show policy
  if (format === "json") {
    console.log(JSON.stringify({ policy: store.policy, historyCount: store.history.length }, null, 2));
    return;
  }
  console.log("\nAuto-Merge Status:");
  console.log(`  Policy: max ${store.policy.maxFindings} findings, min score ${store.policy.minScore}`);
  console.log(`  History: ${store.history.length} entries`);
}
