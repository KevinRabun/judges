/**
 * Review-compliance-report — Generate compliance reports from review data.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  detail: string;
}

interface ComplianceReport {
  framework: string;
  timestamp: string;
  overallStatus: "compliant" | "non-compliant" | "partial";
  checks: ComplianceCheck[];
  score: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function generateReport(verdict: TribunalVerdict, framework: string): ComplianceReport {
  const checks: ComplianceCheck[] = [];

  // Security findings check
  const secFindings = verdict.findings.filter((f) => {
    const combined = `${f.ruleId} ${f.title}`.toLowerCase();
    return (
      combined.includes("auth") ||
      combined.includes("inject") ||
      combined.includes("xss") ||
      combined.includes("crypt") ||
      combined.includes("vuln")
    );
  });
  checks.push({
    name: "Security Findings",
    status: secFindings.length === 0 ? "pass" : secFindings.length <= 2 ? "warning" : "fail",
    detail: `${secFindings.length} security-related findings`,
  });

  // Critical findings check
  checks.push({
    name: "No Critical Findings",
    status: verdict.criticalCount === 0 ? "pass" : "fail",
    detail: `${verdict.criticalCount} critical findings`,
  });

  // Minimum score check
  const minScore = framework === "strict" ? 80 : 60;
  checks.push({
    name: `Minimum Score (${minScore})`,
    status: verdict.overallScore >= minScore ? "pass" : verdict.overallScore >= minScore - 10 ? "warning" : "fail",
    detail: `Score: ${verdict.overallScore}`,
  });

  // Finding density check
  const density = verdict.findings.length;
  checks.push({
    name: "Finding Density",
    status: density <= 5 ? "pass" : density <= 15 ? "warning" : "fail",
    detail: `${density} total findings`,
  });

  // Judge coverage check
  const judgeCount = verdict.evaluations.length;
  checks.push({
    name: "Judge Coverage",
    status: judgeCount >= 3 ? "pass" : judgeCount >= 1 ? "warning" : "fail",
    detail: `${judgeCount} judges evaluated`,
  });

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const score = Math.round((passCount / checks.length) * 100);

  const overallStatus: ComplianceReport["overallStatus"] =
    failCount === 0 ? "compliant" : failCount <= 1 ? "partial" : "non-compliant";

  return {
    framework,
    timestamp: new Date().toISOString(),
    overallStatus,
    checks,
    score,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComplianceReport(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const fwIdx = argv.indexOf("--framework");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const framework = fwIdx >= 0 ? argv[fwIdx + 1] : "default";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compliance-report — Generate compliance reports

Usage:
  judges review-compliance-report --file <verdict.json> [--framework <name>]
                                  [--output <file>] [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --framework <name>   Compliance framework: default, strict
  --output <path>      Write report to file
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
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

  const report = generateReport(verdict, framework);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Compliance report written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const statusEmoji =
    report.overallStatus === "compliant" ? "PASS" : report.overallStatus === "partial" ? "PARTIAL" : "FAIL";

  console.log(`\nCompliance Report: ${statusEmoji} (${report.score}%)`);
  console.log("═".repeat(60));
  console.log(`  Framework: ${report.framework}`);
  console.log("─".repeat(60));

  for (const c of report.checks) {
    const icon = c.status === "pass" ? "[PASS]" : c.status === "warning" ? "[WARN]" : "[FAIL]";
    console.log(`  ${icon.padEnd(8)} ${c.name.padEnd(24)} ${c.detail}`);
  }
  console.log("═".repeat(60));
}
