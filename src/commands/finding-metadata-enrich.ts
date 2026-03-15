/**
 * Finding-metadata-enrich — Enrich findings with additional metadata.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EnrichedFinding {
  ruleId: string;
  title: string;
  severity: string;
  judge: string;
  domain: string;
  hasRecommendation: boolean;
  hasPatch: boolean;
  lineCount: number;
  confidenceLevel: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function enrichFindings(verdict: TribunalVerdict): EnrichedFinding[] {
  const judges = defaultRegistry.getJudges();

  return verdict.findings.map((f) => {
    const judge = judges.find((j) => f.ruleId.startsWith(j.rulePrefix));

    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      judge: judge ? judge.id : "unknown",
      domain: judge ? judge.domain : "unknown",
      hasRecommendation: f.recommendation.length > 0,
      hasPatch: f.patch !== undefined && f.patch !== null,
      lineCount: (f.lineNumbers || []).length,
      confidenceLevel:
        f.confidence !== undefined && f.confidence !== null
          ? f.confidence > 0.8
            ? "high"
            : f.confidence > 0.5
              ? "medium"
              : "low"
          : "unknown",
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingMetadataEnrich(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const filterIdx = argv.indexOf("--domain");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const domainFilter = filterIdx >= 0 ? argv[filterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-metadata-enrich — Enrich findings with metadata

Usage:
  judges finding-metadata-enrich --file <verdict.json> [--domain <filter>]
                                 [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --domain <name>    Filter by judge domain
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

  let enriched = enrichFindings(verdict);
  if (domainFilter) {
    enriched = enriched.filter((e) => e.domain.toLowerCase().includes(domainFilter.toLowerCase()));
  }

  if (format === "json") {
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }

  console.log(`\nEnriched Findings (${enriched.length})`);
  console.log("═".repeat(80));
  console.log(
    `${"Rule".padEnd(18)} ${"Severity".padEnd(10)} ${"Judge".padEnd(14)} ${"Domain".padEnd(12)} ${"Conf".padEnd(8)} Patch`,
  );
  console.log("─".repeat(80));

  for (const e of enriched) {
    const rule = e.ruleId.length > 16 ? e.ruleId.slice(0, 16) + "…" : e.ruleId;
    const judge = e.judge.length > 12 ? e.judge.slice(0, 12) + "…" : e.judge;
    const domain = e.domain.length > 10 ? e.domain.slice(0, 10) + "…" : e.domain;
    console.log(
      `${rule.padEnd(18)} ${e.severity.padEnd(10)} ${judge.padEnd(14)} ${domain.padEnd(12)} ${e.confidenceLevel.padEnd(8)} ${e.hasPatch ? "yes" : "no"}`,
    );
  }
  console.log("═".repeat(80));
}
