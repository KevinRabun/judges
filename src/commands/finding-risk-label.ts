import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-risk-label ─────────────────────────────────────────────
   Label findings with risk categories (exploitable, data-loss,
   compliance, operational, reputational) based on rule patterns
   and severity. All labeling runs locally.
   ─────────────────────────────────────────────────────────────────── */

type RiskCategory = "exploitable" | "data-loss" | "compliance" | "operational" | "reputational";

interface LabeledFinding {
  ruleId: string;
  title: string;
  severity: string;
  riskLabels: RiskCategory[];
}

const RISK_PATTERNS: Record<RiskCategory, string[]> = {
  exploitable: ["injection", "xss", "rce", "deserialization", "ssrf", "command"],
  "data-loss": ["leak", "exposure", "pii", "secret", "credential", "token"],
  compliance: ["audit", "log", "gdpr", "hipaa", "pci", "compliance", "license"],
  operational: ["perf", "memory", "timeout", "resource", "deadlock", "crash"],
  reputational: ["quality", "smell", "complexity", "dead-code", "duplicate"],
};

function labelFindings(verdict: TribunalVerdict): LabeledFinding[] {
  const results: LabeledFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const combined = (f.ruleId + " " + f.title).toLowerCase();
    const labels: RiskCategory[] = [];

    for (const [category, patterns] of Object.entries(RISK_PATTERNS)) {
      for (const pattern of patterns) {
        if (combined.includes(pattern)) {
          labels.push(category as RiskCategory);
          break;
        }
      }
    }

    // High/critical severity without specific match gets "operational"
    if (labels.length === 0 && (f.severity === "critical" || f.severity === "high")) {
      labels.push("operational");
    }

    results.push({ ruleId: f.ruleId, title: f.title, severity: f.severity, riskLabels: labels });
  }

  results.sort((a, b) => b.riskLabels.length - a.riskLabels.length);
  return results;
}

export function runFindingRiskLabel(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-risk-label [options]

Label findings with risk categories.

Options:
  --report <path>      Path to verdict JSON
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

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const labeled = labelFindings(data);

  if (format === "json") {
    console.log(JSON.stringify(labeled, null, 2));
    return;
  }

  const withLabels = labeled.filter((l) => l.riskLabels.length > 0);
  console.log(`\n=== Risk Labels (${withLabels.length} labeled of ${labeled.length} findings) ===\n`);

  if (withLabels.length === 0) {
    console.log("No risk labels matched.");
    return;
  }

  for (const entry of withLabels) {
    console.log(`  ${entry.severity.toUpperCase().padEnd(9)} ${entry.ruleId}`);
    console.log(`           ${entry.title}`);
    console.log(`           Labels: ${entry.riskLabels.join(", ")}`);
    console.log();
  }
}
