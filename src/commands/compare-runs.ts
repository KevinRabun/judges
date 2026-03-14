/**
 * Compare evaluation runs — side-by-side comparison of two evaluation
 * snapshots to show what changed.
 *
 * Uses local .judges-runs/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RunSnapshot {
  id: string;
  label?: string;
  timestamp: string;
  findings: Finding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface RunComparison {
  runA: string;
  runB: string;
  added: Finding[];
  removed: Finding[];
  unchanged: number;
  severityDelta: Record<string, number>;
  ruleChanges: Record<string, { added: number; removed: number }>;
}

const RUNS_DIR = ".judges-runs";

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
}

function findingKey(f: Finding): string {
  return `${f.ruleId}:${f.title}:${(f.lineNumbers || []).join(",")}`;
}

export function saveRun(findings: Finding[], label?: string): RunSnapshot {
  ensureDir();
  const id = `run-${Date.now()}`;
  const snapshot: RunSnapshot = {
    id,
    label,
    timestamp: new Date().toISOString(),
    findings,
    summary: {
      total: findings.length,
      critical: findings.filter((f) => f.severity === "critical").length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
    },
  };
  writeFileSync(join(RUNS_DIR, `${id}.json`), JSON.stringify(snapshot, null, 2));
  return snapshot;
}

export function listRuns(): RunSnapshot[] {
  ensureDir();
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => JSON.parse(readFileSync(join(RUNS_DIR, f), "utf-8")));
}

export function compareRuns(runAId: string, runBId: string): RunComparison {
  const runA: RunSnapshot = JSON.parse(readFileSync(join(RUNS_DIR, `${runAId}.json`), "utf-8"));
  const runB: RunSnapshot = JSON.parse(readFileSync(join(RUNS_DIR, `${runBId}.json`), "utf-8"));

  const keysA = new Set(runA.findings.map(findingKey));
  const keysB = new Set(runB.findings.map(findingKey));
  const findingsMapA = new Map(runA.findings.map((f) => [findingKey(f), f]));
  const findingsMapB = new Map(runB.findings.map((f) => [findingKey(f), f]));

  const added: Finding[] = [];
  const removed: Finding[] = [];
  let unchanged = 0;

  for (const key of keysB) {
    if (!keysA.has(key)) {
      added.push(findingsMapB.get(key)!);
    } else {
      unchanged++;
    }
  }
  for (const key of keysA) {
    if (!keysB.has(key)) {
      removed.push(findingsMapA.get(key)!);
    }
  }

  const severityDelta: Record<string, number> = {
    critical: runB.summary.critical - runA.summary.critical,
    high: runB.summary.high - runA.summary.high,
    medium: runB.summary.medium - runA.summary.medium,
    low: runB.summary.low - runA.summary.low,
  };

  // Rule-level changes
  const ruleChanges: Record<string, { added: number; removed: number }> = {};
  for (const f of added) {
    if (!ruleChanges[f.ruleId]) ruleChanges[f.ruleId] = { added: 0, removed: 0 };
    ruleChanges[f.ruleId].added++;
  }
  for (const f of removed) {
    if (!ruleChanges[f.ruleId]) ruleChanges[f.ruleId] = { added: 0, removed: 0 };
    ruleChanges[f.ruleId].removed++;
  }

  return { runA: runAId, runB: runBId, added, removed, unchanged, severityDelta, ruleChanges };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCompareRuns(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges compare-runs — Compare evaluation runs side by side

Usage:
  judges compare-runs --save                    Save current results as a run
  judges compare-runs --save --label "baseline" Save with label
  judges compare-runs --list                    List saved runs
  judges compare-runs --compare <runA> <runB>   Compare two runs
  judges compare-runs --latest                  Compare last two runs

Options:
  --save                 Save .judges-results.json as a run snapshot
  --label <text>         Label for the snapshot
  --list                 List all saved runs
  --compare <A> <B>      Compare two run IDs
  --latest               Compare the two most recent runs
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Save run
  if (argv.includes("--save")) {
    const resultsFile = ".judges-results.json";
    if (!existsSync(resultsFile)) {
      console.error("  ❌ No .judges-results.json found. Run an evaluation first.");
      return;
    }
    const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
    const findings: Finding[] = Array.isArray(data) ? data : data.findings || [];
    const label = argv.find((_a: string, i: number) => argv[i - 1] === "--label");
    const run = saveRun(findings, label);
    if (format === "json") {
      console.log(JSON.stringify(run, null, 2));
    } else {
      console.log(`  ✅ Run saved: ${run.id}${label ? ` (${label})` : ""} — ${run.summary.total} findings`);
    }
    return;
  }

  // List runs
  if (argv.includes("--list")) {
    const runs = listRuns();
    if (runs.length === 0) {
      console.log("\n  No runs saved. Use --save to capture a snapshot.\n");
      return;
    }
    if (format === "json") {
      console.log(
        JSON.stringify(
          runs.map((r) => ({ id: r.id, label: r.label, timestamp: r.timestamp, total: r.summary.total })),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Saved Runs (${runs.length})\n  ──────────────`);
      for (const r of runs) {
        const lbl = r.label ? ` (${r.label})` : "";
        console.log(`    ${r.id}${lbl}  ${r.timestamp.split("T")[0]}  ${r.summary.total} findings`);
      }
      console.log("");
    }
    return;
  }

  // Compare latest
  if (argv.includes("--latest")) {
    const runs = listRuns();
    if (runs.length < 2) {
      console.error("  ❌ Need at least 2 saved runs. Use --save to capture more.");
      return;
    }
    const comparison = compareRuns(runs[runs.length - 2].id, runs[runs.length - 1].id);
    printComparison(comparison, format);
    return;
  }

  // Compare specific runs
  const compareIdx = argv.indexOf("--compare");
  if (compareIdx >= 0 && argv[compareIdx + 1] && argv[compareIdx + 2]) {
    const runAId = argv[compareIdx + 1];
    const runBId = argv[compareIdx + 2];
    try {
      const comparison = compareRuns(runAId, runBId);
      printComparison(comparison, format);
    } catch {
      console.error(`  ❌ Could not load runs. Check IDs with --list.`);
    }
    return;
  }

  // Default: show latest
  const runs = listRuns();
  if (runs.length === 0) {
    console.log("\n  No runs saved. Use --save to start tracking.\n");
  } else {
    const latest = runs[runs.length - 1];
    console.log(`\n  Latest Run: ${latest.id}${latest.label ? ` (${latest.label})` : ""}`);
    console.log(`  Date: ${latest.timestamp}`);
    console.log(
      `  Findings: ${latest.summary.total} (C:${latest.summary.critical} H:${latest.summary.high} M:${latest.summary.medium} L:${latest.summary.low})\n`,
    );
  }
}

function printComparison(comp: RunComparison, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(comp, null, 2));
    return;
  }

  console.log(`\n  Run Comparison: ${comp.runA} → ${comp.runB}`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Unchanged: ${comp.unchanged}`);
  console.log(`  Added:     ${comp.added.length}`);
  console.log(`  Removed:   ${comp.removed.length}`);
  console.log("");

  console.log("  Severity Changes:");
  for (const [sev, delta] of Object.entries(comp.severityDelta)) {
    const sign = delta > 0 ? "+" : "";
    const icon = delta > 0 ? "📈" : delta < 0 ? "📉" : "➡️";
    console.log(`    ${sev.padEnd(10)} ${sign}${delta} ${icon}`);
  }

  if (comp.added.length > 0) {
    console.log("\n  New Findings:");
    for (const f of comp.added.slice(0, 10)) {
      console.log(`    + [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title.slice(0, 50)}`);
    }
    if (comp.added.length > 10) console.log(`    ... and ${comp.added.length - 10} more`);
  }

  if (comp.removed.length > 0) {
    console.log("\n  Resolved Findings:");
    for (const f of comp.removed.slice(0, 10)) {
      console.log(`    - [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title.slice(0, 50)}`);
    }
    if (comp.removed.length > 10) console.log(`    ... and ${comp.removed.length - 10} more`);
  }

  if (Object.keys(comp.ruleChanges).length > 0) {
    console.log("\n  Rule Changes:");
    for (const [rule, changes] of Object.entries(comp.ruleChanges)) {
      console.log(`    ${rule.padEnd(15)} +${changes.added} / -${changes.removed}`);
    }
  }
  console.log("");
}
