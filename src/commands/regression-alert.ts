/**
 * Regression alerting — compare current scan results against a saved
 * baseline snapshot to detect quality regressions.
 *
 * Snapshots are stored locally in .judges-baseline.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BaselineSnapshot {
  timestamp: string;
  gitCommit?: string;
  gitBranch?: string;
  totalFindings: number;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  findingIds: string[];
}

export interface RegressionReport {
  status: "improved" | "stable" | "regressed";
  newFindings: string[];
  fixedFindings: string[];
  delta: number;
  severityDelta: Record<string, number>;
  ruleDelta: Record<string, number>;
  baseline: BaselineSnapshot;
  current: BaselineSnapshot;
}

const BASELINE_FILE = ".judges-baseline.json";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFindingId(f: Finding): string {
  return `${f.ruleId}::${f.title}`;
}

function getGitInfo(): { commit?: string; branch?: string } {
  try {
    const { execSync } = require("child_process");
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    return { commit, branch };
  } catch {
    return {};
  }
}

export function buildSnapshot(findings: Finding[]): BaselineSnapshot {
  const git = getGitInfo();
  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const findingIds: string[] = [];

  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    findingIds.push(makeFindingId(f));
  }

  return {
    timestamp: new Date().toISOString(),
    gitCommit: git.commit,
    gitBranch: git.branch,
    totalFindings: findings.length,
    bySeverity,
    byRule,
    findingIds,
  };
}

export function saveBaseline(snapshot: BaselineSnapshot, file = BASELINE_FILE): void {
  writeFileSync(file, JSON.stringify(snapshot, null, 2));
}

export function loadBaseline(file = BASELINE_FILE): BaselineSnapshot | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8"));
}

export function compareSnapshots(baseline: BaselineSnapshot, current: BaselineSnapshot): RegressionReport {
  const baseSet = new Set(baseline.findingIds);
  const currSet = new Set(current.findingIds);

  const newFindings = current.findingIds.filter((id) => !baseSet.has(id));
  const fixedFindings = baseline.findingIds.filter((id) => !currSet.has(id));
  const delta = current.totalFindings - baseline.totalFindings;

  const severityDelta: Record<string, number> = {};
  const allSeverities = new Set([...Object.keys(baseline.bySeverity), ...Object.keys(current.bySeverity)]);
  for (const sev of allSeverities) {
    severityDelta[sev] = (current.bySeverity[sev] || 0) - (baseline.bySeverity[sev] || 0);
  }

  const ruleDelta: Record<string, number> = {};
  const allRules = new Set([...Object.keys(baseline.byRule), ...Object.keys(current.byRule)]);
  for (const rule of allRules) {
    const d = (current.byRule[rule] || 0) - (baseline.byRule[rule] || 0);
    if (d !== 0) ruleDelta[rule] = d;
  }

  let status: RegressionReport["status"] = "stable";
  if (delta > 0 || newFindings.length > 0) status = "regressed";
  else if (delta < 0 || fixedFindings.length > 0) status = "improved";

  return {
    status,
    newFindings,
    fixedFindings,
    delta,
    severityDelta,
    ruleDelta,
    baseline,
    current,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runRegressionAlert(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges regression-alert — Detect quality regressions between scans

Usage:
  judges regression-alert --save --input results.json     Save current results as baseline
  judges regression-alert --check --input results.json    Compare current results against baseline
  judges regression-alert --show                          Show current baseline

Options:
  --save                Save current results as the baseline
  --check               Compare against saved baseline
  --show                Display stored baseline info
  --input <path>        Results JSON file
  --fail-on-regression  Exit with code 1 if regressions detected (CI mode)
  --threshold <n>       Only alert if >= n new findings (default: 1)
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const failOnRegression = argv.includes("--fail-on-regression");
  const thresholdStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
  const threshold = thresholdStr ? parseInt(thresholdStr, 10) : 1;

  // Show baseline
  if (argv.includes("--show")) {
    const baseline = loadBaseline();
    if (!baseline) {
      console.log("\n  No baseline saved. Run with --save first.\n");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(baseline, null, 2));
    } else {
      console.log(`
  Baseline Snapshot
  ─────────────────
  Saved:     ${baseline.timestamp}
  Commit:    ${baseline.gitCommit || "unknown"}
  Branch:    ${baseline.gitBranch || "unknown"}
  Findings:  ${baseline.totalFindings}
`);
      for (const [sev, count] of Object.entries(baseline.bySeverity)) {
        console.log(`    ${sev.padEnd(10)} ${count}`);
      }
      console.log("");
    }
    return;
  }

  // Both --save and --check need input
  if (!inputPath) {
    console.error("Error: --input <path> required");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const findings: Finding[] = data.evaluations
    ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
    : data.findings || data;

  const snapshot = buildSnapshot(findings);

  // Save baseline
  if (argv.includes("--save")) {
    saveBaseline(snapshot);
    if (format === "json") {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(`\n  Baseline saved: ${snapshot.totalFindings} findings (${snapshot.gitCommit || "no git"})\n`);
    }
    return;
  }

  // Check against baseline
  if (argv.includes("--check")) {
    const baseline = loadBaseline();
    if (!baseline) {
      console.error("Error: No baseline saved. Run with --save first.");
      process.exit(1);
    }

    const report = compareSnapshots(baseline, snapshot);

    if (format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const icon = report.status === "improved" ? "✅" : report.status === "regressed" ? "🚨" : "➖";
      console.log(
        `\n  ${icon} Status: ${report.status.toUpperCase()} (delta: ${report.delta >= 0 ? "+" : ""}${report.delta})`,
      );
      console.log(`  Baseline: ${baseline.totalFindings} findings (${baseline.gitCommit || "?"})`);
      console.log(`  Current:  ${snapshot.totalFindings} findings (${snapshot.gitCommit || "?"})\n`);

      if (report.newFindings.length > 0) {
        console.log(`  New findings (${report.newFindings.length}):`);
        for (const id of report.newFindings.slice(0, 20)) {
          console.log(`    + ${id}`);
        }
        if (report.newFindings.length > 20) {
          console.log(`    ... and ${report.newFindings.length - 20} more`);
        }
      }

      if (report.fixedFindings.length > 0) {
        console.log(`\n  Fixed findings (${report.fixedFindings.length}):`);
        for (const id of report.fixedFindings.slice(0, 20)) {
          console.log(`    - ${id}`);
        }
        if (report.fixedFindings.length > 20) {
          console.log(`    ... and ${report.fixedFindings.length - 20} more`);
        }
      }

      if (Object.keys(report.severityDelta).length > 0) {
        console.log("\n  By severity:");
        for (const [sev, d] of Object.entries(report.severityDelta)) {
          if (d !== 0) console.log(`    ${sev.padEnd(10)} ${d >= 0 ? "+" : ""}${d}`);
        }
      }
      console.log("");
    }

    if (failOnRegression && report.newFindings.length >= threshold) {
      console.error(`  ❌ Regression detected: ${report.newFindings.length} new finding(s) (threshold: ${threshold})`);
      process.exit(1);
    }
    return;
  }

  console.log("Use --save, --check, or --show. See --help for details.");
}
