/**
 * Review-scope-limit — Limit review scope to specific files, directories, or rules.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScopeFilter {
  type: "rule-prefix" | "severity" | "judge";
  value: string;
}

interface ScopeResult {
  originalCount: number;
  filteredCount: number;
  removedCount: number;
  filters: ScopeFilter[];
  findings: Array<{ ruleId: string; title: string; severity: string }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function applyScope(verdict: TribunalVerdict, filters: ScopeFilter[]): ScopeResult {
  const original = verdict.findings;
  let filtered = [...original];

  for (const filter of filters) {
    if (filter.type === "rule-prefix") {
      filtered = filtered.filter((f) => f.ruleId.startsWith(filter.value));
    } else if (filter.type === "severity") {
      filtered = filtered.filter((f) => (f.severity || "medium").toLowerCase() === filter.value.toLowerCase());
    }
  }

  return {
    originalCount: original.length,
    filteredCount: filtered.length,
    removedCount: original.length - filtered.length,
    filters,
    findings: filtered.map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
    })),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewScopeLimit(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const prefixIdx = argv.indexOf("--prefix");
  const severityIdx = argv.indexOf("--severity");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const prefix = prefixIdx >= 0 ? argv[prefixIdx + 1] : undefined;
  const severity = severityIdx >= 0 ? argv[severityIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-scope-limit — Limit review scope

Usage:
  judges review-scope-limit --file <verdict.json> [--prefix <RULE-PREFIX>]
                            [--severity <level>] [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --prefix <prefix>    Filter by rule prefix (e.g., AUTH, CYBER)
  --severity <level>   Filter by severity (critical, high, medium, low)
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

  const filters: ScopeFilter[] = [];
  if (prefix !== undefined) filters.push({ type: "rule-prefix", value: prefix });
  if (severity !== undefined) filters.push({ type: "severity", value: severity });

  const result = applyScope(verdict, filters);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nScope-Limited Review`);
  console.log("═".repeat(65));
  console.log(
    `  Original: ${result.originalCount}  →  Filtered: ${result.filteredCount}  (removed: ${result.removedCount})`,
  );
  if (filters.length > 0) {
    console.log(`  Filters: ${filters.map((f) => `${f.type}=${f.value}`).join(", ")}`);
  }
  console.log("─".repeat(65));
  console.log(`${"Rule".padEnd(20)} ${"Severity".padEnd(10)} Title`);
  console.log("─".repeat(65));

  for (const f of result.findings) {
    const rule = f.ruleId.length > 18 ? f.ruleId.slice(0, 18) + "…" : f.ruleId;
    const title = f.title.length > 30 ? f.title.slice(0, 30) + "…" : f.title;
    console.log(`${rule.padEnd(20)} ${f.severity.padEnd(10)} ${title}`);
  }
  console.log("═".repeat(65));
}
