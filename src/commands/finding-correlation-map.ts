/**
 * Finding-correlation-map — Map correlations between related findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Correlation {
  finding1: { ruleId: string; title: string };
  finding2: { ruleId: string; title: string };
  relationship: string;
  sharedLines: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findCorrelations(findings: Finding[]): Correlation[] {
  const correlations: Correlation[] = [];

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];

      // Same line overlap
      const aLines = a.lineNumbers !== undefined ? a.lineNumbers : [];
      const bLines = b.lineNumbers !== undefined ? b.lineNumbers : [];
      const shared = aLines.filter((ln) => bLines.includes(ln));

      if (shared.length > 0) {
        correlations.push({
          finding1: { ruleId: a.ruleId, title: a.title },
          finding2: { ruleId: b.ruleId, title: b.title },
          relationship: "co-located",
          sharedLines: shared,
        });
        continue;
      }

      // Same rule prefix (same domain)
      const prefixA = a.ruleId.split("-")[0];
      const prefixB = b.ruleId.split("-")[0];
      if (prefixA === prefixB && a.severity === b.severity) {
        correlations.push({
          finding1: { ruleId: a.ruleId, title: a.title },
          finding2: { ruleId: b.ruleId, title: b.title },
          relationship: "same-domain-same-severity",
          sharedLines: [],
        });
      }
    }
  }

  return correlations;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCorrelationMap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-correlation-map — Map finding correlations

Usage:
  judges finding-correlation-map --file <review.json> [--format table|json]

Options:
  --file <path>    Review result JSON file
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
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
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const correlations = findCorrelations(verdict.findings);

  if (format === "json") {
    console.log(JSON.stringify({ total: correlations.length, correlations }, null, 2));
    return;
  }

  console.log(`\nFinding Correlations: ${correlations.length} relationship(s)`);
  console.log("═".repeat(65));

  if (correlations.length === 0) {
    console.log("  No correlations found between findings.");
    console.log("═".repeat(65));
    return;
  }

  for (const c of correlations) {
    console.log(`\n  ${c.finding1.ruleId} ↔ ${c.finding2.ruleId}`);
    console.log(`    Relationship: ${c.relationship}`);
    if (c.sharedLines.length > 0) {
      console.log(`    Shared lines: ${c.sharedLines.join(", ")}`);
    }
    console.log(`    A: ${c.finding1.title}`);
    console.log(`    B: ${c.finding2.title}`);
  }

  console.log("\n" + "═".repeat(65));
}
