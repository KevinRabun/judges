/**
 * Finding-category-stats — Statistics about finding categories.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryStat {
  category: string;
  count: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  rules: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferCategory(ruleId: string): string {
  const prefix = ruleId.split("/")[0] || ruleId.split("-")[0] || "general";
  return prefix.toLowerCase();
}

function computeStats(verdict: TribunalVerdict): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const f of verdict.findings) {
    const category = inferCategory(f.ruleId);
    const stat = map.get(category) || {
      category,
      count: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      rules: [],
    };

    stat.count++;
    const sev = (f.severity || "medium").toLowerCase();
    if (sev === "critical") stat.criticalCount++;
    else if (sev === "high") stat.highCount++;
    else if (sev === "medium") stat.mediumCount++;
    else stat.lowCount++;

    if (!stat.rules.includes(f.ruleId)) stat.rules.push(f.ruleId);
    map.set(category, stat);
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCategoryStats(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-category-stats — Finding category statistics

Usage:
  judges finding-category-stats --file <verdict.json> [--format table|json|markdown]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json, markdown
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

  const stats = computeStats(verdict);

  if (format === "json") {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log("| Category | Total | Critical | High | Medium | Low | Rules |");
    console.log("|----------|-------|----------|------|--------|-----|-------|");
    for (const s of stats) {
      console.log(
        `| ${s.category} | ${s.count} | ${s.criticalCount} | ${s.highCount} | ${s.mediumCount} | ${s.lowCount} | ${s.rules.length} |`,
      );
    }
    return;
  }

  console.log(`\nCategory Statistics (${stats.length} categories)`);
  console.log("═".repeat(70));
  console.log(
    `${"Category".padEnd(20)} ${"Total".padEnd(7)} ${"Crit".padEnd(6)} ${"High".padEnd(6)} ${"Med".padEnd(6)} ${"Low".padEnd(6)} Rules`,
  );
  console.log("─".repeat(70));

  for (const s of stats) {
    const cat = s.category.length > 18 ? s.category.slice(0, 18) + "…" : s.category;
    console.log(
      `${cat.padEnd(20)} ${String(s.count).padEnd(7)} ${String(s.criticalCount).padEnd(6)} ` +
        `${String(s.highCount).padEnd(6)} ${String(s.mediumCount).padEnd(6)} ${String(s.lowCount).padEnd(6)} ${s.rules.length}`,
    );
  }

  console.log("─".repeat(70));
  const total = stats.reduce((s, e) => s + e.count, 0);
  console.log(`${total} findings across ${stats.length} categories`);
  console.log("═".repeat(70));
}
