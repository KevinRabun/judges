/**
 * Finding-duplicate-rule — Detect duplicate or overlapping rules in findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  key: string;
  count: number;
  ruleIds: string[];
  titles: string[];
  lineOverlap: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectDuplicates(verdict: TribunalVerdict): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  for (const f of verdict.findings) {
    // Group by normalized title (lowercase, trimmed)
    const key = f.title.toLowerCase().trim();
    const group = groups.get(key) || { key, count: 0, ruleIds: [], titles: [], lineOverlap: false };
    group.count++;
    if (!group.ruleIds.includes(f.ruleId)) group.ruleIds.push(f.ruleId);
    if (!group.titles.includes(f.title)) group.titles.push(f.title);
    groups.set(key, group);
  }

  // Check for line number overlaps between different rule IDs
  const lineMap = new Map<number, string[]>();
  for (const f of verdict.findings) {
    if (f.lineNumbers) {
      for (const ln of f.lineNumbers) {
        const rules = lineMap.get(ln) || [];
        if (!rules.includes(f.ruleId)) rules.push(f.ruleId);
        lineMap.set(ln, rules);
      }
    }
  }

  // Flag groups where multiple rules point to same lines
  for (const [_ln, rules] of lineMap) {
    if (rules.length > 1) {
      for (const [, group] of groups) {
        if (rules.some((r) => group.ruleIds.includes(r))) {
          group.lineOverlap = true;
        }
      }
    }
  }

  return [...groups.values()]
    .filter((g) => g.count > 1 || g.ruleIds.length > 1 || g.lineOverlap)
    .sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDuplicateRule(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-duplicate-rule — Detect duplicate or overlapping rules

Usage:
  judges finding-duplicate-rule --file <verdict.json> [--format table|json]

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

  const duplicates = detectDuplicates(verdict);

  if (format === "json") {
    console.log(JSON.stringify(duplicates, null, 2));
    return;
  }

  if (duplicates.length === 0) {
    console.log("No duplicate or overlapping rules detected.");
    return;
  }

  console.log(`\nDuplicate/Overlapping Rules (${duplicates.length} groups)`);
  console.log("═".repeat(70));

  for (const g of duplicates) {
    const overlap = g.lineOverlap ? " [LINE OVERLAP]" : "";
    console.log(`\n  "${g.titles[0]}" × ${g.count}${overlap}`);
    console.log(`  Rules: ${g.ruleIds.join(", ")}`);
  }

  console.log("\n" + "═".repeat(70));
  const totalDups = duplicates.reduce((s, g) => s + g.count - 1, 0);
  console.log(`${totalDups} duplicate findings across ${duplicates.length} groups`);
}
