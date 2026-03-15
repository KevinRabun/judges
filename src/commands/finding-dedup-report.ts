/**
 * Finding-dedup-report — Generate a deduplicated findings report.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DedupResult {
  uniqueFindings: number;
  duplicatesRemoved: number;
  findings: Array<{
    ruleId: string;
    title: string;
    severity: string;
    occurrences: number;
    lineNumbers: number[];
  }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function deduplicateFindings(verdict: TribunalVerdict): DedupResult {
  const grouped = new Map<string, { title: string; severity: string; occurrences: number; lineNumbers: number[] }>();

  for (const f of verdict.findings) {
    const existing = grouped.get(f.ruleId);
    if (existing) {
      existing.occurrences++;
      const newLines = f.lineNumbers || [];
      for (const ln of newLines) {
        if (!existing.lineNumbers.includes(ln)) {
          existing.lineNumbers.push(ln);
        }
      }
    } else {
      grouped.set(f.ruleId, {
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        occurrences: 1,
        lineNumbers: [...(f.lineNumbers || [])],
      });
    }
  }

  const findings = [...grouped.entries()]
    .map(([ruleId, data]) => ({
      ruleId,
      title: data.title,
      severity: data.severity,
      occurrences: data.occurrences,
      lineNumbers: data.lineNumbers.sort((a, b) => a - b),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    uniqueFindings: findings.length,
    duplicatesRemoved: verdict.findings.length - findings.length,
    findings,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDedupReport(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dedup-report — Deduplicated findings report

Usage:
  judges finding-dedup-report --file <verdict.json> [--format table|json]

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

  const result = deduplicateFindings(verdict);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nDeduplicated Findings Report`);
  console.log("═".repeat(70));
  console.log(
    `  Original: ${verdict.findings.length}  →  Unique: ${result.uniqueFindings}  (removed: ${result.duplicatesRemoved})`,
  );
  console.log("─".repeat(70));
  console.log(`${"Rule".padEnd(20)} ${"Severity".padEnd(10)} ${"Occurs".padEnd(8)} ${"Lines".padEnd(15)} Title`);
  console.log("─".repeat(70));

  for (const f of result.findings) {
    const rule = f.ruleId.length > 18 ? f.ruleId.slice(0, 18) + "…" : f.ruleId;
    const title = f.title.length > 20 ? f.title.slice(0, 20) + "…" : f.title;
    const lines = f.lineNumbers.length > 0 ? f.lineNumbers.slice(0, 3).join(",") : "—";
    const linesStr = f.lineNumbers.length > 3 ? lines + "…" : lines;
    console.log(
      `${rule.padEnd(20)} ${f.severity.padEnd(10)} ${String(f.occurrences).padEnd(8)} ${linesStr.padEnd(15)} ${title}`,
    );
  }
  console.log("═".repeat(70));
}
