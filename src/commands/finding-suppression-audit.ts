/**
 * Finding-suppression-audit — Audit suppressed/ignored findings for review.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionRecord {
  ruleId: string;
  title: string;
  severity: string;
  suppressionType: "inline-comment" | "config-disabled" | "severity-filter" | "manual-ignore";
  reason: string;
  risk: "high" | "medium" | "low";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function auditSuppressions(
  verdict: TribunalVerdict,
  sourceFile?: string,
  disabledRules?: string[],
  minSeverity?: string,
): SuppressionRecord[] {
  const records: SuppressionRecord[] = [];
  const disabled = new Set(disabledRules || []);

  // check source for inline suppressions
  let sourceLines: string[] = [];
  if (sourceFile && existsSync(sourceFile)) {
    sourceLines = readFileSync(sourceFile, "utf-8").split("\n");
  }

  // inline comment suppressions
  const suppressionPatterns = [
    /eslint-disable/,
    /noqa/,
    /noinspection/,
    /@SuppressWarnings/,
    /NOSONAR/,
    /judges-ignore/,
    /# type:\s*ignore/,
  ];

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    for (const pat of suppressionPatterns) {
      if (pat.test(line)) {
        records.push({
          ruleId: `LINE-${i + 1}`,
          title: `Inline suppression at line ${i + 1}`,
          severity: "medium",
          suppressionType: "inline-comment",
          reason: line.trim().slice(0, 80),
          risk: "medium",
        });
        break;
      }
    }
  }

  // config-disabled rules
  for (const ruleId of disabled) {
    const finding = verdict.findings.find((f) => f.ruleId === ruleId);
    records.push({
      ruleId,
      title: finding ? finding.title : `Disabled rule: ${ruleId}`,
      severity: finding ? (finding.severity || "medium").toLowerCase() : "unknown",
      suppressionType: "config-disabled",
      reason: "Rule disabled in configuration",
      risk: "high",
    });
  }

  // severity-filtered findings
  if (minSeverity !== undefined) {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const threshold = sevOrder[minSeverity] || 2;
    for (const f of verdict.findings) {
      const fSev = (f.severity || "medium").toLowerCase();
      if ((sevOrder[fSev] || 2) > threshold) {
        records.push({
          ruleId: f.ruleId,
          title: f.title,
          severity: fSev,
          suppressionType: "severity-filter",
          reason: `Below minimum severity: ${minSeverity}`,
          risk: "low",
        });
      }
    }
  }

  return records;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSuppressionAudit(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const disabledIdx = argv.indexOf("--disabled");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const disabledStr = disabledIdx >= 0 ? argv[disabledIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-suppression-audit — Audit suppressed findings

Usage:
  judges finding-suppression-audit --file <verdict.json> [--source <src.ts>]
                                   [--disabled <RULE1,RULE2>] [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --source <path>      Source file to check for inline suppressions
  --disabled <rules>   Comma-separated disabled rule IDs
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

  const disabled = disabledStr ? disabledStr.split(",").map((s) => s.trim()) : [];
  const records = auditSuppressions(verdict, sourceFile, disabled);

  if (format === "json") {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const highRisk = records.filter((r) => r.risk === "high").length;
  const medRisk = records.filter((r) => r.risk === "medium").length;

  console.log(`\nSuppression Audit (${records.length} suppressions)`);
  console.log("═".repeat(75));
  console.log(
    `  High risk: ${highRisk}  |  Medium risk: ${medRisk}  |  Low risk: ${records.length - highRisk - medRisk}`,
  );
  console.log("─".repeat(75));
  console.log(`${"Risk".padEnd(8)} ${"Type".padEnd(18)} ${"Rule".padEnd(18)} ${"Severity".padEnd(10)} Reason`);
  console.log("─".repeat(75));

  for (const r of records) {
    const reason = r.reason.length > 25 ? r.reason.slice(0, 25) + "…" : r.reason;
    console.log(
      `${r.risk.padEnd(8)} ${r.suppressionType.padEnd(18)} ${r.ruleId.padEnd(18)} ${r.severity.padEnd(10)} ${reason}`,
    );
  }
  console.log("═".repeat(75));
}
