/**
 * Finding-group-by — Group findings by a specified field for better organization.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingGroupBy(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-group-by — Group findings by a field

Usage:
  judges finding-group-by --file <results.json> [options]

Options:
  --file <path>      Result file to analyze (required)
  --by <field>       Group by: severity, ruleId, confidence, category (default: severity)
  --sort count|name  Sort groups by count or name (default: count)
  --format json      JSON output
  --help, -h         Show this help
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const by = argv.find((_a: string, i: number) => argv[i - 1] === "--by") || "severity";
  const sort = argv.find((_a: string, i: number) => argv[i - 1] === "--sort") || "count";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  const groups = new Map<string, Finding[]>();

  for (const f of findings) {
    let key: string;
    if (by === "ruleId") key = f.ruleId || "unknown";
    else if (by === "confidence")
      key = f.confidence !== undefined && f.confidence !== null ? String(f.confidence) : "unset";
    else if (by === "category") key = f.ruleId ? f.ruleId.split("-")[0] : "unknown";
    else key = f.severity || "unknown";

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const sorted = [...groups.entries()];
  if (sort === "name") sorted.sort((a, b) => a[0].localeCompare(b[0]));
  else sorted.sort((a, b) => b[1].length - a[1].length);

  if (format === "json") {
    const result = sorted.map(([key, items]) => ({ group: key, count: items.length, findings: items }));
    console.log(
      JSON.stringify(
        { totalFindings: findings.length, groupCount: sorted.length, groupBy: by, groups: result },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nFindings Grouped by ${by}:`);
  console.log("═".repeat(65));
  console.log(`  Total: ${findings.length} findings in ${sorted.length} groups`);
  console.log("─".repeat(65));

  for (const [key, items] of sorted) {
    const bar = "█".repeat(Math.min(items.length, 30));
    console.log(`  ${key.padEnd(20)} ${String(items.length).padStart(4)}  ${bar}`);
    for (const f of items.slice(0, 3)) {
      console.log(`    └─ ${f.title || f.ruleId || "untitled"}`);
    }
    if (items.length > 3) console.log(`    └─ ... and ${items.length - 3} more`);
  }
  console.log("═".repeat(65));
}
