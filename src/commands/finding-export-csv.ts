/**
 * Finding-export-csv — Export findings as CSV.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingExportCsv(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-export-csv — Export findings as CSV

Usage:
  judges finding-export-csv --file results.json
  judges finding-export-csv --file results.json --out findings.csv

Options:
  --file <path>         Path to review result JSON
  --out <path>          Output CSV file (default: stdout)
  --format json         JSON output (metadata only)
  --help, -h            Show this help

Exports findings from a review result JSON file as CSV format.
`);
    return;
  }

  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
  const outPath = argv.find((_a: string, i: number) => argv[i - 1] === "--out") || "";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!filePath) {
    console.log("Specify --file <path> to a review result JSON.");
    return;
  }

  if (!existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.log(`Failed to parse: ${filePath}`);
    return;
  }

  const findings = Array.isArray(data.findings) ? data.findings : [];

  if (findings.length === 0) {
    console.log("No findings to export.");
    return;
  }

  // Build CSV
  const headers = ["ruleId", "severity", "title", "description", "confidence", "recommendation"];
  const rows: string[] = [headers.join(",")];

  for (const f of findings) {
    if (typeof f !== "object" || !f) continue;
    const record = f as Record<string, unknown>;
    const row = headers.map((h) => {
      const val = record[h];
      const str = val !== null && val !== undefined ? String(val) : "";
      // Escape CSV: quote if contains comma, newline, or double-quote
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    rows.push(row.join(","));
  }

  const csv = rows.join("\n");

  if (outPath) {
    writeFileSync(outPath, csv, "utf-8");
    console.log(`Exported ${findings.length} findings to ${outPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify({ findingCount: findings.length, columns: headers }, null, 2));
    return;
  }

  console.log(csv);
}
