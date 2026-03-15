import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-fix-estimate ───────────────────────────────────────────
   Estimate fix effort for each finding based on severity, whether
   a patch is available, and finding complexity. Helps teams plan
   remediation sprints by providing time-boxed estimates.
   ─────────────────────────────────────────────────────────────────── */

interface FixEstimate {
  ruleId: string;
  title: string;
  severity: string;
  hasPatch: boolean;
  estimateMinutes: number;
  estimateLabel: string;
  recommendation: string;
}

interface EstimateReport {
  totalFindings: number;
  totalMinutes: number;
  totalHours: number;
  estimates: FixEstimate[];
}

function estimateFixTime(finding: { severity: string; patch?: unknown; recommendation: string }): {
  minutes: number;
  label: string;
} {
  const hasPatch = finding.patch !== undefined && finding.patch !== null;
  const recLength = finding.recommendation.length;

  let baseMinutes: number;
  if (finding.severity === "critical") baseMinutes = 120;
  else if (finding.severity === "high") baseMinutes = 60;
  else if (finding.severity === "medium") baseMinutes = 30;
  else if (finding.severity === "low") baseMinutes = 15;
  else baseMinutes = 10;

  if (hasPatch) baseMinutes = Math.round(baseMinutes * 0.4);
  if (recLength > 200) baseMinutes = Math.round(baseMinutes * 1.2);

  let label: string;
  if (baseMinutes <= 10) label = "trivial (~10 min)";
  else if (baseMinutes <= 30) label = "quick (~30 min)";
  else if (baseMinutes <= 60) label = "moderate (~1 hr)";
  else if (baseMinutes <= 120) label = "significant (~2 hr)";
  else label = "major (2+ hr)";

  return { minutes: baseMinutes, label };
}

export function runFindingFixEstimate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-fix-estimate [options]

Estimate fix effort for each finding.

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
  const findings = data.findings ?? [];

  const estimates: FixEstimate[] = [];
  let totalMinutes = 0;

  for (const f of findings) {
    const hasPatch = f.patch !== undefined && f.patch !== null;
    const est = estimateFixTime(f);
    totalMinutes += est.minutes;

    estimates.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      hasPatch,
      estimateMinutes: est.minutes,
      estimateLabel: est.label,
      recommendation: f.recommendation,
    });
  }

  estimates.sort((a, b) => b.estimateMinutes - a.estimateMinutes);

  const report: EstimateReport = {
    totalFindings: estimates.length,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    estimates,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Fix Estimates (${report.totalFindings} findings, ~${report.totalHours} hours total) ===\n`);

  if (estimates.length === 0) {
    console.log("No findings to estimate.");
    return;
  }

  for (const e of estimates) {
    const patchTag = e.hasPatch ? " [patch]" : "";
    console.log(`  ${e.estimateLabel.padEnd(22)} [${e.severity}] ${e.ruleId}${patchTag}`);
    console.log(`                         ${e.title}`);
  }
}
