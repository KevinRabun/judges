/**
 * Finding-auto-group — Auto-group related findings into logical categories.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingGroup {
  category: string;
  count: number;
  sevBreakdown: Record<string, number>;
  ruleIds: string[];
  titles: string[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ name: string; keywords: string[] }> = [
  { name: "Security", keywords: ["auth", "inject", "xss", "csrf", "vuln", "secret", "crypt", "sanitiz"] },
  { name: "Performance", keywords: ["perf", "optim", "cache", "memory", "leak", "slow", "latency"] },
  { name: "Reliability", keywords: ["error", "exception", "null", "undefined", "crash", "race"] },
  { name: "Style", keywords: ["naming", "format", "indent", "whitespace", "convention", "lint"] },
  { name: "Complexity", keywords: ["complex", "cyclomatic", "nesting", "depth", "refactor"] },
  { name: "API", keywords: ["api", "endpoint", "route", "request", "response", "rest", "graphql"] },
  { name: "Data", keywords: ["data", "schema", "valid", "type", "model", "serial"] },
];

function categorize(ruleId: string, title: string): string {
  const combined = `${ruleId} ${title}`.toLowerCase();
  for (const cat of CATEGORY_PATTERNS) {
    if (cat.keywords.some((kw) => combined.includes(kw))) {
      return cat.name;
    }
  }
  return "Other";
}

function groupFindings(verdict: TribunalVerdict): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const f of verdict.findings) {
    const category = categorize(f.ruleId, f.title);
    const existing = groups.get(category);

    if (existing) {
      existing.count++;
      const sev = (f.severity || "medium").toLowerCase();
      existing.sevBreakdown[sev] = (existing.sevBreakdown[sev] || 0) + 1;
      if (!existing.ruleIds.includes(f.ruleId)) existing.ruleIds.push(f.ruleId);
      if (existing.titles.length < 5) existing.titles.push(f.title);
    } else {
      const sev = (f.severity || "medium").toLowerCase();
      groups.set(category, {
        category,
        count: 1,
        sevBreakdown: { [sev]: 1 },
        ruleIds: [f.ruleId],
        titles: [f.title],
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoGroup(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-auto-group — Auto-group findings into categories

Usage:
  judges finding-auto-group --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
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

  const groups = groupFindings(verdict);

  if (format === "json") {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  console.log(`\nFinding Groups (${groups.length} categories)`);
  console.log("═".repeat(70));
  console.log(`${"Category".padEnd(16)} ${"Count".padEnd(8)} ${"Severities".padEnd(26)} Rules`);
  console.log("─".repeat(70));

  for (const g of groups) {
    const sevStr = Object.entries(g.sevBreakdown)
      .map(([s, c]) => `${s}:${c}`)
      .join(", ");
    const sevDisplay = sevStr.length > 24 ? sevStr.slice(0, 24) + "…" : sevStr;
    const ruleStr = g.ruleIds.slice(0, 3).join(", ");
    console.log(`${g.category.padEnd(16)} ${String(g.count).padEnd(8)} ${sevDisplay.padEnd(26)} ${ruleStr}`);
  }
  console.log("═".repeat(70));
}
