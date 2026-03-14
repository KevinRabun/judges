/**
 * Finding-correlate — Correlate related findings across files.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CorrelationGroup {
  ruleId: string;
  severity: string;
  count: number;
  findings: Array<{ title: string; lineNumbers: number[] }>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCorrelate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-correlate — Correlate related findings across files

Usage:
  judges finding-correlate --file <results> [options]

Options:
  --file <path>         Results file with findings (required)
  --group-by <field>    Group by: rule, severity, title (default: rule)
  --min-count <n>       Minimum group size to show (default: 2)
  --format json         JSON output
  --help, -h            Show this help

Groups related findings to identify patterns and systemic issues.
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

  const groupBy = argv.find((_a: string, i: number) => argv[i - 1] === "--group-by") || "rule";
  const minCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--min-count") || "2", 10);
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let findings: Array<{ ruleId?: string; severity?: string; title?: string; lineNumbers?: number[] }>;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  // Group findings
  const groups = new Map<string, CorrelationGroup>();
  for (const f of findings) {
    let key: string;
    if (groupBy === "severity") key = (f.severity || "medium").toLowerCase();
    else if (groupBy === "title") key = f.title || "unknown";
    else key = f.ruleId || "unknown";

    if (!groups.has(key)) {
      groups.set(key, { ruleId: key, severity: f.severity || "medium", count: 0, findings: [] });
    }
    const g = groups.get(key)!;
    g.count++;
    g.findings.push({ title: f.title || "", lineNumbers: f.lineNumbers || [] });
  }

  const sorted = [...groups.values()].filter((g) => g.count >= minCount).sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    console.log("No correlated groups found (try lowering --min-count).");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(sorted, null, 2));
    return;
  }

  console.log(`\nCorrelated Findings (grouped by ${groupBy}, min ${minCount}):`);
  console.log("═".repeat(65));
  for (const g of sorted) {
    console.log(`\n  [${g.severity.toUpperCase()}] ${g.ruleId} — ${g.count} occurrences`);
    for (const f of g.findings.slice(0, 5)) {
      const lines = f.lineNumbers.length > 0 ? ` (L${f.lineNumbers.join(",")})` : "";
      console.log(`    • ${f.title}${lines}`);
    }
    if (g.findings.length > 5) console.log(`    ... and ${g.findings.length - 5} more`);
  }
  console.log("\n" + "═".repeat(65));
  console.log(`  ${sorted.length} groups, ${sorted.reduce((s, g) => s + g.count, 0)} total findings`);
}
