/**
 * Finding-impact — Estimate business impact of each finding.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImpactAssessment {
  ruleId: string;
  severity: string;
  title: string;
  businessImpact: "critical" | "high" | "medium" | "low" | "info";
  estimatedCost: string;
  exploitability: string;
  blastRadius: string;
  recommendation: string;
}

interface ImpactReport {
  timestamp: string;
  totalFindings: number;
  assessments: ImpactAssessment[];
  summary: { critical: number; high: number; medium: number; low: number; info: number };
}

// ─── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_IMPACT: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

const COST_ESTIMATES: Record<string, string> = {
  critical: "$50,000–$500,000+ (breach, compliance penalty)",
  high: "$10,000–$50,000 (data loss, downtime)",
  medium: "$1,000–$10,000 (technical debt, moderate risk)",
  low: "$100–$1,000 (minor refactor)",
  info: "Minimal (best practice improvement)",
};

const EXPLOITABILITY: Record<string, string> = {
  critical: "Easily exploitable, active attack vectors known",
  high: "Exploitable with moderate skill",
  medium: "Requires specific conditions to exploit",
  low: "Difficult to exploit in practice",
  info: "Not directly exploitable",
};

function assessFinding(finding: Finding): ImpactAssessment {
  const severity = finding.severity || "medium";
  const impact = SEVERITY_IMPACT[severity] || "medium";
  const ruleId = finding.ruleId || "unknown";
  const isInjection = /inject|sqli|xss|command/i.test(ruleId);
  const isAuth = /auth|session|token|cred/i.test(ruleId);
  const isCrypto = /crypt|hash|random|secret/i.test(ruleId);

  let blastRadius = "Localized to component";
  if (isInjection || isAuth) blastRadius = "System-wide, potential data exfiltration";
  else if (isCrypto) blastRadius = "All encrypted data at risk";

  return {
    ruleId,
    severity,
    title: finding.title || "",
    businessImpact: isInjection && impact !== "critical" ? "high" : impact,
    estimatedCost: COST_ESTIMATES[impact] || COST_ESTIMATES["medium"],
    exploitability: EXPLOITABILITY[impact] || EXPLOITABILITY["medium"],
    blastRadius,
    recommendation: finding.recommendation || "Review and remediate.",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingImpact(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-impact — Estimate business impact of findings

Usage:
  judges finding-impact --file report.json
  judges finding-impact --file report.json --format json

Options:
  --file <path>         Path to a tribunal verdict JSON file
  --format json         Output as JSON
  --min-impact <level>  Filter by minimum impact (critical|high|medium|low|info)
  --help, -h            Show this help

Analyzes each finding and estimates:
  • Business impact level (critical → info)
  • Estimated remediation cost
  • Exploitability assessment
  • Blast radius (scope of potential damage)

Impact assessments are stored in .judges/finding-impact.json.
`);
    return;
  }

  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minImpact = argv.find((_a: string, i: number) => argv[i - 1] === "--min-impact") || "info";

  if (!filePath || !existsSync(filePath)) {
    console.error("Error: --file is required and must exist.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Could not parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  if (findings.length === 0) {
    console.log("No findings to assess.");
    return;
  }

  const impactLevels = ["info", "low", "medium", "high", "critical"];
  const minIdx = impactLevels.indexOf(minImpact);
  const assessments = findings.map(assessFinding).filter((a) => impactLevels.indexOf(a.businessImpact) >= minIdx);

  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const a of assessments) {
    summary[a.businessImpact]++;
  }

  const report: ImpactReport = {
    timestamp: new Date().toISOString(),
    totalFindings: assessments.length,
    assessments,
    summary,
  };

  // Save
  const outPath = join(".judges", "finding-impact.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nFinding Impact Assessment:");
  console.log("═".repeat(70));
  console.log(`  Total findings assessed: ${assessments.length}`);
  console.log(
    `  Critical: ${summary.critical}  High: ${summary.high}  Medium: ${summary.medium}  Low: ${summary.low}  Info: ${summary.info}`,
  );
  console.log("═".repeat(70));

  for (const a of assessments) {
    console.log(`\n  [${a.businessImpact.toUpperCase()}] ${a.ruleId}`);
    console.log(`    Title:          ${a.title}`);
    console.log(`    Est. Cost:      ${a.estimatedCost}`);
    console.log(`    Exploitability: ${a.exploitability}`);
    console.log(`    Blast Radius:   ${a.blastRadius}`);
    console.log(`    Recommendation: ${a.recommendation}`);
  }
  console.log("\n" + "═".repeat(70));
  console.log(`  Report saved to ${outPath}`);
}
