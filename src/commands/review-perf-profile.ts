/**
 * Review-perf-profile — Profile review performance and timing.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PerfMetric {
  component: string;
  metric: string;
  value: number;
  unit: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function profileReview(verdict: TribunalVerdict, sourceFile?: string): PerfMetric[] {
  const metrics: PerfMetric[] = [];
  const judges = defaultRegistry.getJudges();

  // findings per judge
  const judgeFindings = new Map<string, number>();
  for (const f of verdict.findings) {
    for (const j of judges) {
      if (f.ruleId.startsWith(j.rulePrefix)) {
        judgeFindings.set(j.id, (judgeFindings.get(j.id) || 0) + 1);
        break;
      }
    }
  }

  // judge count
  metrics.push({ component: "judges", metric: "total-judges", value: judges.length, unit: "count" });
  metrics.push({ component: "judges", metric: "active-judges", value: judgeFindings.size, unit: "count" });

  // findings metrics
  metrics.push({ component: "findings", metric: "total-findings", value: verdict.findings.length, unit: "count" });
  metrics.push({ component: "findings", metric: "critical", value: verdict.criticalCount, unit: "count" });
  metrics.push({ component: "findings", metric: "high", value: verdict.highCount, unit: "count" });

  // source file size
  if (sourceFile && existsSync(sourceFile)) {
    const content = readFileSync(sourceFile, "utf-8");
    metrics.push({ component: "source", metric: "file-size", value: content.length, unit: "bytes" });
    metrics.push({ component: "source", metric: "line-count", value: content.split("\n").length, unit: "lines" });
  }

  // evaluations count
  metrics.push({ component: "evaluations", metric: "total", value: verdict.evaluations.length, unit: "count" });

  // average score
  if (verdict.evaluations.length > 0) {
    const avgScore = verdict.evaluations.reduce((s, e) => s + e.score, 0) / verdict.evaluations.length;
    metrics.push({ component: "evaluations", metric: "avg-score", value: Math.round(avgScore), unit: "score" });
  }

  return metrics;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPerfProfile(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-perf-profile — Profile review performance

Usage:
  judges review-perf-profile --file <verdict.json> [--source <src.ts>]
                             [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file for size metrics
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const metrics = profileReview(verdict, sourceFile);

  if (format === "json") {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  console.log(`\nReview Performance Profile`);
  console.log("═".repeat(60));
  console.log(`${"Component".padEnd(16)} ${"Metric".padEnd(20)} ${"Value".padEnd(12)} Unit`);
  console.log("─".repeat(60));

  for (const m of metrics) {
    console.log(`${m.component.padEnd(16)} ${m.metric.padEnd(20)} ${String(m.value).padEnd(12)} ${m.unit}`);
  }
  console.log("═".repeat(60));
}
