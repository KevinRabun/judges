/**
 * Finding-explain — Explain findings in natural language with context and examples.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Explanation ────────────────────────────────────────────────────────────

interface Explanation {
  ruleId: string;
  severity: string;
  title: string;
  why: string;
  impact: string;
  howToFix: string;
  example: string;
  judgeDomain: string;
}

function explainFinding(f: Finding): Explanation {
  const judges = defaultRegistry.getJudges();
  const prefix = f.ruleId.split("-")[0];
  const judge = judges.find((j) => j.rulePrefix === prefix);
  const domain = judge !== undefined ? judge.domain : "general";

  const impactMap: Record<string, string> = {
    critical: "Immediate risk — can lead to security breach, data loss, or system failure",
    high: "Significant risk — may cause serious issues if left unaddressed",
    medium: "Moderate concern — should be addressed in normal development cycle",
    low: "Minor concern — consider fixing during refactoring",
    info: "Informational — awareness item with no immediate risk",
  };

  return {
    ruleId: f.ruleId,
    severity: f.severity,
    title: f.title,
    why: f.description,
    impact: impactMap[f.severity] !== undefined ? impactMap[f.severity] : "Unknown impact level",
    howToFix: f.recommendation,
    example: f.suggestedFix !== undefined ? f.suggestedFix : "No code example available — see recommendation above.",
    judgeDomain: domain,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingExplain(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const ruleFilter = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-explain — Explain findings in detail

Usage:
  judges finding-explain --file <review.json> [--rule <ruleId>]
                         [--format table|json]

Options:
  --file <path>    Review result JSON file
  --rule <id>      Filter to specific rule ID
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
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
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings;
  if (ruleFilter) {
    findings = findings.filter((f) => f.ruleId === ruleFilter);
  }

  const explanations = findings.map((f) => explainFinding(f));

  if (format === "json") {
    console.log(JSON.stringify(explanations, null, 2));
    return;
  }

  console.log(`\nFinding Explanations: ${explanations.length} finding(s)`);
  console.log("═".repeat(65));

  for (const exp of explanations) {
    console.log(`\n── ${exp.ruleId} [${exp.severity}] ──`);
    console.log(`  Title:   ${exp.title}`);
    console.log(`  Domain:  ${exp.judgeDomain}`);
    console.log(`  Why:     ${exp.why}`);
    console.log(`  Impact:  ${exp.impact}`);
    console.log(`  Fix:     ${exp.howToFix}`);
    console.log(`  Example: ${exp.example}`);
  }
  console.log("\n" + "═".repeat(65));
}
