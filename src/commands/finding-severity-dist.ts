/**
 * Finding-severity-dist — Show severity distribution of findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeverityBucket {
  severity: string;
  count: number;
  percentage: number;
  rules: string[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityDist(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-severity-dist — Show severity distribution

Usage:
  judges finding-severity-dist --file <verdict.json> [--format table|json|chart]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json, chart
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

  if (verdict.findings.length === 0) {
    console.log("No findings to analyze.");
    return;
  }

  const counts = new Map<string, { count: number; rules: Set<string> }>();
  const order = ["critical", "high", "medium", "low", "info"];

  for (const f of verdict.findings) {
    const sev = (f.severity || "medium").toLowerCase();
    const entry = counts.get(sev) || { count: 0, rules: new Set<string>() };
    entry.count++;
    entry.rules.add(f.ruleId);
    counts.set(sev, entry);
  }

  const total = verdict.findings.length;
  const buckets: SeverityBucket[] = order
    .filter((s) => counts.has(s))
    .map((s) => {
      const entry = counts.get(s)!;
      return {
        severity: s,
        count: entry.count,
        percentage: Math.round((entry.count / total) * 1000) / 10,
        rules: [...entry.rules],
      };
    });

  // add any severities not in standard order
  for (const [sev, entry] of counts) {
    if (!order.includes(sev)) {
      buckets.push({
        severity: sev,
        count: entry.count,
        percentage: Math.round((entry.count / total) * 1000) / 10,
        rules: [...entry.rules],
      });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify({ total, buckets }, null, 2));
    return;
  }

  if (format === "chart") {
    console.log(`\nSeverity Distribution (${total} findings)`);
    console.log("═".repeat(55));
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    for (const b of buckets) {
      const barLen = Math.round((b.count / maxCount) * 30);
      const bar = "█".repeat(barLen) + "░".repeat(30 - barLen);
      console.log(`${b.severity.padEnd(10)} ${bar} ${b.count} (${b.percentage}%)`);
    }
    console.log("═".repeat(55));
    return;
  }

  console.log(`\nSeverity Distribution (${total} findings)`);
  console.log("═".repeat(60));
  console.log(`${"Severity".padEnd(12)} ${"Count".padEnd(8)} ${"Pct".padEnd(8)} Rules`);
  console.log("─".repeat(60));

  for (const b of buckets) {
    const rules = b.rules.length > 3 ? b.rules.slice(0, 3).join(", ") + ` +${b.rules.length - 3}` : b.rules.join(", ");
    console.log(`${b.severity.padEnd(12)} ${String(b.count).padEnd(8)} ${(b.percentage + "%").padEnd(8)} ${rules}`);
  }

  console.log("═".repeat(60));
}
