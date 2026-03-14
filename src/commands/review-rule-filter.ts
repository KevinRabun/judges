/**
 * Review-rule-filter — Filter review results by rule criteria.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FilterCriteria {
  includeRules?: string[];
  excludeRules?: string[];
  minSeverity?: string;
  rulePrefix?: string;
  titleContains?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function matchesFilter(finding: Finding, criteria: FilterCriteria): boolean {
  if (criteria.includeRules && criteria.includeRules.length > 0) {
    if (!criteria.includeRules.includes(finding.ruleId)) return false;
  }
  if (criteria.excludeRules && criteria.excludeRules.length > 0) {
    if (criteria.excludeRules.includes(finding.ruleId)) return false;
  }
  if (criteria.minSeverity) {
    const threshold = SEVERITY_ORDER[criteria.minSeverity.toLowerCase()] ?? 0;
    const findingSev = SEVERITY_ORDER[(finding.severity || "medium").toLowerCase()] ?? 2;
    if (findingSev < threshold) return false;
  }
  if (criteria.rulePrefix) {
    if (!finding.ruleId.startsWith(criteria.rulePrefix)) return false;
  }
  if (criteria.titleContains) {
    if (!finding.title.toLowerCase().includes(criteria.titleContains.toLowerCase())) return false;
  }
  return true;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRuleFilter(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const includeIdx = argv.indexOf("--include");
  const excludeIdx = argv.indexOf("--exclude");
  const sevIdx = argv.indexOf("--min-severity");
  const prefixIdx = argv.indexOf("--prefix");
  const titleIdx = argv.indexOf("--title");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-rule-filter — Filter review results by rule criteria

Usage:
  judges review-rule-filter --file <verdict.json> [options]

Options:
  --file <path>          Path to verdict JSON file (required)
  --include <rules>      Comma-separated list of rule IDs to include
  --exclude <rules>      Comma-separated list of rule IDs to exclude
  --min-severity <sev>   Minimum severity: critical, high, medium, low, info
  --prefix <prefix>      Filter by rule ID prefix
  --title <text>         Filter by title containing text
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help
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

  const criteria: FilterCriteria = {};
  if (includeIdx >= 0) criteria.includeRules = argv[includeIdx + 1].split(",");
  if (excludeIdx >= 0) criteria.excludeRules = argv[excludeIdx + 1].split(",");
  if (sevIdx >= 0) criteria.minSeverity = argv[sevIdx + 1];
  if (prefixIdx >= 0) criteria.rulePrefix = argv[prefixIdx + 1];
  if (titleIdx >= 0) criteria.titleContains = argv[titleIdx + 1];

  const filtered = verdict.findings.filter((f) => matchesFilter(f, criteria));
  const excluded = verdict.findings.length - filtered.length;

  if (format === "json") {
    console.log(
      JSON.stringify(
        { total: verdict.findings.length, filtered: filtered.length, excluded, findings: filtered },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nFiltered Findings (${filtered.length} of ${verdict.findings.length})`);
  console.log("═".repeat(70));

  if (filtered.length === 0) {
    console.log("No findings match the filter criteria.");
  } else {
    console.log(`${"Rule".padEnd(30)} ${"Severity".padEnd(10)} Title`);
    console.log("─".repeat(70));

    for (const f of filtered) {
      const rule = f.ruleId.length > 28 ? f.ruleId.slice(0, 28) + "…" : f.ruleId;
      const sev = (f.severity || "medium").padEnd(10);
      const title = f.title.length > 28 ? f.title.slice(0, 28) + "…" : f.title;
      console.log(`${rule.padEnd(30)} ${sev} ${title}`);
    }
  }

  console.log("─".repeat(70));
  console.log(`${excluded} findings excluded by filters`);
  console.log("═".repeat(70));
}
