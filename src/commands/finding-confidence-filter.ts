/**
 * Finding-confidence-filter — Filter findings by confidence level.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingConfidenceFilter(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-confidence-filter — Filter findings by confidence level

Usage:
  judges finding-confidence-filter --file results.json --min 0.8
  judges finding-confidence-filter --file results.json --tier high
  judges finding-confidence-filter --file results.json --min 0.5 --max 0.9

Options:
  --file <path>         Path to review result JSON
  --min <n>             Minimum confidence (0.0–1.0)
  --max <n>             Maximum confidence (0.0–1.0)
  --tier <level>        Filter by tier: high, medium, low
  --format json         JSON output
  --help, -h            Show this help

Filters findings from a review result file based on confidence scores.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
  const minConf = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--min") || "0");
  const maxConf = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--max") || "1");
  const tier = argv.find((_a: string, i: number) => argv[i - 1] === "--tier") || "";

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

  interface FindingLike {
    confidence?: number;
    confidenceTier?: string;
    ruleId?: string;
    title?: string;
    severity?: string;
  }

  const filtered = findings.filter((f: unknown) => {
    const finding = f as FindingLike;
    const conf = typeof finding.confidence === "number" ? finding.confidence : 0.5;

    if (tier) {
      const fTier = typeof finding.confidenceTier === "string" ? finding.confidenceTier : "";
      return fTier.toLowerCase() === tier.toLowerCase();
    }

    return conf >= minConf && conf <= maxConf;
  });

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, filtered: filtered.length, findings: filtered }, null, 2));
    return;
  }

  console.log(`\nConfidence Filter: ${filtered.length} of ${findings.length} findings`);
  if (tier) console.log(`  Tier: ${tier}`);
  else console.log(`  Range: ${minConf.toFixed(1)} – ${maxConf.toFixed(1)}`);
  console.log("─".repeat(60));

  for (const f of filtered as FindingLike[]) {
    const conf = typeof f.confidence === "number" ? f.confidence.toFixed(2) : "?";
    console.log(
      `  [${String(f.severity || "?").toUpperCase()}] ${f.ruleId || ""} — ${f.title || "untitled"}  (conf=${conf})`,
    );
  }

  if (filtered.length === 0) {
    console.log("  No findings match the filter.");
  }
  console.log("─".repeat(60));
}
