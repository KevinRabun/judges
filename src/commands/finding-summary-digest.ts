/**
 * Finding-summary-digest — Generate concise digests of finding summaries.
 *
 * Creates executive-style summaries of review results suitable for
 * stakeholder communication and quick decision-making.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityEmoji(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "[CRIT]";
    case "high":
      return "[HIGH]";
    case "medium":
      return "[MED]";
    case "low":
      return "[LOW]";
    default:
      return "[INFO]";
  }
}

function generateDigest(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  const total = verdict.findings.length;

  // Header
  lines.push("REVIEW DIGEST");
  lines.push("=".repeat(50));

  // Status
  const status = verdict.overallVerdict === "pass" ? "PASS" : "FAIL";
  lines.push(`Status: ${status} | Score: ${verdict.overallScore} | Findings: ${total}`);
  lines.push("");

  // Severity distribution
  const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of verdict.findings) {
    const sev = (f.severity || "medium").toLowerCase();
    sevCounts[sev] = (sevCounts[sev] || 0) + 1;
  }
  lines.push("Severity Distribution:");
  for (const [sev, count] of Object.entries(sevCounts)) {
    if (count > 0) {
      const bar = "█".repeat(Math.min(count, 20));
      lines.push(`  ${sev.padEnd(10)} ${bar} ${count}`);
    }
  }
  lines.push("");

  // Top findings by severity
  const criticalAndHigh = verdict.findings
    .filter((f) => ["critical", "high"].includes((f.severity || "medium").toLowerCase()))
    .slice(0, 5);

  if (criticalAndHigh.length > 0) {
    lines.push("Priority Findings:");
    for (const f of criticalAndHigh) {
      lines.push(`  ${severityEmoji(f.severity || "medium")} ${f.title}`);
      if (f.recommendation) {
        const rec = f.recommendation.length > 60 ? f.recommendation.slice(0, 60) + "…" : f.recommendation;
        lines.push(`         Fix: ${rec}`);
      }
    }
    lines.push("");
  }

  // Rule coverage
  const rules = new Set(verdict.findings.map((f) => f.ruleId));
  lines.push(`Rules triggered: ${rules.size}`);

  // Judge participation
  if (verdict.evaluations && verdict.evaluations.length > 0) {
    const passing = verdict.evaluations.filter((e) => e.verdict === "pass").length;
    lines.push(`Judges: ${passing}/${verdict.evaluations.length} passing`);
  }

  lines.push("");
  lines.push("=".repeat(50));

  // Action items
  if (sevCounts["critical"] > 0) {
    lines.push(`ACTION REQUIRED: ${sevCounts["critical"]} critical finding(s) must be addressed before merge.`);
  } else if (sevCounts["high"] > 0) {
    lines.push(`RECOMMENDED: Address ${sevCounts["high"]} high-severity finding(s) before merge.`);
  } else if (total > 0) {
    lines.push(`ADVISORY: ${total} finding(s) for review. No blockers detected.`);
  } else {
    lines.push("CLEAN: No findings detected.");
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSummaryDigest(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "text";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-summary-digest — Generate concise finding digests

Usage:
  judges finding-summary-digest --file <verdict.json> [--format text|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: text (default), json
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
    console.error(`Error: file not found: ${filePath}`);
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

  if (format === "json") {
    const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of verdict.findings) {
      const sev = (f.severity || "medium").toLowerCase();
      sevCounts[sev] = (sevCounts[sev] || 0) + 1;
    }
    console.log(
      JSON.stringify(
        {
          status: verdict.overallVerdict,
          score: verdict.overallScore,
          totalFindings: verdict.findings.length,
          severityCounts: sevCounts,
          rulesTriggered: new Set(verdict.findings.map((f) => f.ruleId)).size,
          topFindings: verdict.findings
            .slice(0, 5)
            .map((f) => ({ title: f.title, severity: f.severity, ruleId: f.ruleId })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(generateDigest(verdict));
}
