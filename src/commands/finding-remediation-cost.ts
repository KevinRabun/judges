import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-remediation-cost ───────────────────────────────────────
   Estimate remediation cost of findings using configurable
   cost-per-severity rates. Helps teams prioritize budget
   allocation for security and quality fixes.
   ─────────────────────────────────────────────────────────────────── */

interface CostConfig {
  currency: string;
  rates: Record<string, number>;
}

interface CostEstimate {
  ruleId: string;
  title: string;
  severity: string;
  estimatedCost: number;
}

interface CostReport {
  currency: string;
  totalCost: number;
  bySeverity: Record<string, { count: number; cost: number }>;
  estimates: CostEstimate[];
}

const DEFAULT_RATES: Record<string, number> = {
  critical: 5000,
  high: 2000,
  medium: 500,
  low: 100,
  info: 0,
};

function estimateCosts(findings: Finding[], config: CostConfig): CostReport {
  const bySeverity: Record<string, { count: number; cost: number }> = {};
  const estimates: CostEstimate[] = [];
  let totalCost = 0;

  for (const f of findings) {
    const rate = config.rates[f.severity] ?? DEFAULT_RATES[f.severity] ?? 0;
    totalCost += rate;

    const entry = bySeverity[f.severity] ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += rate;
    bySeverity[f.severity] = entry;

    estimates.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      estimatedCost: rate,
    });
  }

  estimates.sort((a, b) => b.estimatedCost - a.estimatedCost);

  return { currency: config.currency, totalCost, bySeverity, estimates };
}

export function runFindingRemediationCost(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-remediation-cost [options]

Estimate remediation costs for findings.

Options:
  --report <path>      Path to verdict JSON file
  --config <path>      Path to cost config JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const confIdx = argv.indexOf("--config");
  const confPath =
    confIdx !== -1 && argv[confIdx + 1]
      ? join(process.cwd(), argv[confIdx + 1])
      : join(process.cwd(), ".judges", "cost-config.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  let config: CostConfig;
  if (existsSync(confPath)) {
    config = JSON.parse(readFileSync(confPath, "utf-8")) as CostConfig;
  } else {
    config = { currency: "USD", rates: DEFAULT_RATES };
  }

  const report = estimateCosts(findings, config);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Remediation Cost Estimate ===\n`);
  console.log(`Total: ${report.currency} ${report.totalCost.toLocaleString()}\n`);

  console.log("By severity:");
  for (const [sev, data_] of Object.entries(report.bySeverity)) {
    console.log(`  ${sev}: ${data_.count} findings — ${report.currency} ${data_.cost.toLocaleString()}`);
  }
  console.log();
}
