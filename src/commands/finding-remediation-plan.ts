/**
 * Finding-remediation-plan — Generate remediation plans for findings.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RemediationItem {
  ruleId: string;
  severity: string;
  title: string;
  recommendation: string;
  effort: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function estimateEffort(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "immediate";
    case "high":
      return "1-2 days";
    case "medium":
      return "3-5 days";
    case "low":
      return "backlog";
    default:
      return "unknown";
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRemediationPlan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-remediation-plan — Generate remediation plans

Usage:
  judges finding-remediation-plan --file results.json
  judges finding-remediation-plan --file results.json --min-severity high

Options:
  --file <path>         Path to review result JSON
  --min-severity <s>    Minimum severity to include (critical, high, medium, low)
  --format json         JSON output
  --help, -h            Show this help

Generates a prioritized remediation plan from review findings.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
  const minSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity") || "";

  if (!filePath) {
    console.log("Specify --file <path> to a review result JSON.");
    return;
  }

  if (!existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.log(`Failed to parse: ${filePath}`);
    return;
  }

  const findings = Array.isArray(data.findings) ? data.findings : [];
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  const minIdx = minSeverity ? severityOrder.indexOf(minSeverity.toLowerCase()) : severityOrder.length - 1;

  const items: RemediationItem[] = [];

  for (const f of findings) {
    if (typeof f !== "object" || !f) continue;
    const record = f as Record<string, unknown>;
    const severity = typeof record.severity === "string" ? record.severity.toLowerCase() : "medium";
    const sevIdx = severityOrder.indexOf(severity);
    if (sevIdx > minIdx) continue;

    items.push({
      ruleId: typeof record.ruleId === "string" ? record.ruleId : "",
      severity,
      title: typeof record.title === "string" ? record.title : "",
      recommendation: typeof record.recommendation === "string" ? record.recommendation : "",
      effort: estimateEffort(severity),
    });
  }

  // Sort by severity
  items.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  if (format === "json") {
    console.log(JSON.stringify({ totalFindings: findings.length, planItems: items.length, items }, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log("No findings match the criteria.");
    return;
  }

  console.log("\nRemediation Plan:");
  console.log("═".repeat(65));

  let phase = 0;
  let lastSeverity = "";
  for (const item of items) {
    if (item.severity !== lastSeverity) {
      phase++;
      lastSeverity = item.severity;
      console.log(`\n  Phase ${phase}: ${item.severity.toUpperCase()} (${item.effort})`);
      console.log("  " + "─".repeat(50));
    }
    console.log(`    ${item.ruleId}: ${item.title}`);
    if (item.recommendation) {
      console.log(`      → ${item.recommendation.slice(0, 80)}`);
    }
  }

  console.log("\n═".repeat(65));
  console.log(`${items.length} items across ${phase} phases.`);
}
