/**
 * Finding-severity-heatmap — Severity distribution heatmap visualization.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityHeatmap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-severity-heatmap — Severity distribution heatmap

Usage:
  judges finding-severity-heatmap --file <review.json> [--format table|json]
  judges finding-severity-heatmap --dir <path> [--format table|json]

Options:
  --file <path>    Single review JSON file
  --dir <path>     Directory of review JSON files
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  const verdicts: Array<{ name: string; verdict: TribunalVerdict }> = [];

  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }
    try {
      verdicts.push({ name: filePath, verdict: JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict });
    } catch {
      console.error(`Error: failed to parse: ${filePath}`);
      process.exitCode = 1;
      return;
    }
  } else if (dirPath) {
    if (!existsSync(dirPath)) {
      console.error(`Error: directory not found: ${dirPath}`);
      process.exitCode = 1;
      return;
    }
    const files = (readdirSync(dirPath) as unknown as string[]).filter(
      (f) => typeof f === "string" && f.endsWith(".json"),
    );
    for (const file of files) {
      try {
        const v = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
        if (v.overallVerdict !== undefined) {
          verdicts.push({ name: file, verdict: v });
        }
      } catch {
        // skip
      }
    }
  } else {
    console.error("Error: --file or --dir is required");
    process.exitCode = 1;
    return;
  }

  const severities = ["critical", "high", "medium", "low", "info"];
  const heatmap: Array<{ review: string; counts: Record<string, number>; total: number }> = [];

  for (const { name, verdict } of verdicts) {
    const counts: Record<string, number> = {};
    for (const sev of severities) {
      counts[sev] = 0;
    }
    for (const f of verdict.findings) {
      counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    }
    heatmap.push({ review: name, counts, total: verdict.findings.length });
  }

  if (format === "json") {
    console.log(JSON.stringify(heatmap, null, 2));
    return;
  }

  console.log(`\nSeverity Heatmap: ${heatmap.length} review(s)`);
  console.log("═".repeat(75));
  console.log(
    `  ${"Review".padEnd(25)} ${"CRIT".padEnd(6)} ${"HIGH".padEnd(6)} ${"MED".padEnd(6)} ${"LOW".padEnd(6)} ${"INFO".padEnd(6)} Total`,
  );
  console.log("  " + "─".repeat(65));

  for (const row of heatmap) {
    const name = row.review.length > 24 ? row.review.substring(0, 21) + "..." : row.review;
    const cells = severities.map((s) => {
      const count = row.counts[s];
      if (count === 0) return "  ·  ";
      if (count >= 10) return ` ${count}  `;
      return `  ${count}  `;
    });
    console.log(`  ${name.padEnd(25)} ${cells.join(" ")} ${row.total}`);
  }

  // Totals row
  const totals = severities.map((s) => heatmap.reduce((sum, r) => sum + r.counts[s], 0));
  const totalAll = totals.reduce((a, b) => a + b, 0);
  console.log("  " + "─".repeat(65));
  console.log(`  ${"TOTAL".padEnd(25)} ${totals.map((t) => String(t).padStart(3).padEnd(6)).join(" ")} ${totalAll}`);
  console.log("═".repeat(75));
}
