/**
 * Review-deployment-gate — Configure deployment gates based on review thresholds.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GateRule {
  name: string;
  metric: "score" | "criticalCount" | "highCount" | "totalFindings";
  operator: "gte" | "lte" | "eq";
  threshold: number;
  blocking: boolean;
}

interface GateConfig {
  gates: GateRule[];
  lastUpdated: string;
}

interface GateEvaluation {
  name: string;
  metric: string;
  threshold: number;
  actual: number;
  passed: boolean;
  blocking: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function evaluateGate(rule: GateRule, metrics: Record<string, number>): GateEvaluation {
  const actual = metrics[rule.metric] ?? 0;
  let passed = false;
  if (rule.operator === "gte") passed = actual >= rule.threshold;
  else if (rule.operator === "lte") passed = actual <= rule.threshold;
  else if (rule.operator === "eq") passed = actual === rule.threshold;

  return {
    name: rule.name,
    metric: rule.metric,
    threshold: rule.threshold,
    actual,
    passed,
    blocking: rule.blocking,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDeploymentGate(argv: string[]): void {
  const configIdx = argv.indexOf("--config");
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-deployment-gate.json";
  const metricsIdx = argv.indexOf("--metrics");
  const metricsPath = metricsIdx >= 0 ? argv[metricsIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const initMode = argv.includes("--init");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-deployment-gate — Configure deployment gates

Usage:
  judges review-deployment-gate --metrics <path> [--config <path>] [--format table|json]
  judges review-deployment-gate --init [--config <path>]

Options:
  --metrics <path>  Path to metrics JSON ({score, criticalCount, highCount, totalFindings})
  --config <path>   Gate config file (default: .judges-deployment-gate.json)
  --init            Create default gate config
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (initMode) {
    const defaultConfig: GateConfig = {
      gates: [
        { name: "Min Score", metric: "score", operator: "gte", threshold: 70, blocking: true },
        { name: "No Criticals", metric: "criticalCount", operator: "lte", threshold: 0, blocking: true },
        { name: "Max High", metric: "highCount", operator: "lte", threshold: 3, blocking: false },
      ],
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default gate config: ${configPath}`);
    return;
  }

  if (!metricsPath || !existsSync(metricsPath)) {
    console.error("Provide --metrics <path> to a valid metrics JSON file.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(configPath)) {
    console.error(`Gate config not found: ${configPath}. Run with --init to create one.`);
    process.exitCode = 1;
    return;
  }

  const metrics = JSON.parse(readFileSync(metricsPath, "utf-8")) as Record<string, number>;
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as GateConfig;
  const results = config.gates.map((g) => evaluateGate(g, metrics));

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const allPassed = results.every((r) => r.passed || !r.blocking);

  console.log(`\nDeployment Gate Evaluation`);
  console.log("═".repeat(70));
  console.log(`  ${"Gate".padEnd(20)} ${"Metric".padEnd(18)} ${"Threshold".padEnd(12)} ${"Actual".padEnd(10)} Result`);
  console.log("  " + "─".repeat(65));

  for (const r of results) {
    const status = r.passed ? "PASS" : r.blocking ? "BLOCK" : "WARN";
    console.log(
      `  ${r.name.padEnd(20)} ${r.metric.padEnd(18)} ${String(r.threshold).padEnd(12)} ${String(r.actual).padEnd(10)} ${status}`,
    );
  }

  console.log(`\n  Overall: ${allPassed ? "DEPLOY ALLOWED" : "DEPLOY BLOCKED"}`);
  console.log("═".repeat(70));

  if (!allPassed) {
    process.exitCode = 1;
  }
}
