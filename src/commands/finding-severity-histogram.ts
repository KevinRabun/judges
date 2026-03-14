/**
 * Finding-severity-histogram — Visualize finding severity distribution.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityHistogram(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-severity-histogram — Visualize severity distribution

Usage:
  judges finding-severity-histogram --file <results> [options]

Options:
  --file <path>     Results file with findings (required)
  --width <n>       Bar width in characters (default: 40)
  --format json     JSON output
  --help, -h        Show this help
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

  const barWidth = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--width") || "40", 10);
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let findings: Array<{ severity?: string }>;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    const sev = (f.severity || "medium").toLowerCase();
    counts[sev] = (counts[sev] || 0) + 1;
  }

  const maxCount = Math.max(...Object.values(counts), 1);

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, distribution: counts }, null, 2));
    return;
  }

  console.log(`\nSeverity Histogram (${findings.length} findings):`);
  console.log("═".repeat(barWidth + 25));

  const order = ["critical", "high", "medium", "low", "info"];
  for (const sev of order) {
    const count = counts[sev] || 0;
    const barLen = Math.round((count / maxCount) * barWidth);
    const bar = "#".repeat(barLen);
    const pct = findings.length > 0 ? ((count / findings.length) * 100).toFixed(1) : "0.0";
    console.log(`  ${sev.padEnd(10)} ${bar.padEnd(barWidth)} ${String(count).padStart(5)} (${pct}%)`);
  }

  console.log("═".repeat(barWidth + 25));
}
