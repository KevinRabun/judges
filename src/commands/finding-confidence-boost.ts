import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-confidence-boost ───────────────────────────────────────
   Identify findings whose confidence can be boosted by
   cross-referencing with other findings, patches, or evidence.
   ─────────────────────────────────────────────────────────────────── */

interface ConfidenceBoost {
  ruleId: string;
  title: string;
  originalConfidence: number;
  boostedConfidence: number;
  boostReasons: string[];
}

function boostConfidence(findings: Finding[]): ConfidenceBoost[] {
  // Build a map of rule occurrences for corroboration
  const ruleCounts = new Map<string, number>();
  for (const f of findings) {
    const prefix = f.ruleId.split("-")[0];
    ruleCounts.set(prefix, (ruleCounts.get(prefix) ?? 0) + 1);
  }

  const boosts: ConfidenceBoost[] = [];

  for (const f of findings) {
    const original = f.confidence ?? 0.5;
    let boosted = original;
    const reasons: string[] = [];

    // Multiple findings from same domain = corroboration
    const prefix = f.ruleId.split("-")[0];
    const domainCount = ruleCounts.get(prefix) ?? 0;
    if (domainCount >= 3) {
      boosted = Math.min(1, boosted + 0.1);
      reasons.push(`${domainCount} corroborating findings in domain`);
    }

    // Has patch = higher confidence the issue is real
    if (f.patch !== undefined && f.patch !== null) {
      boosted = Math.min(1, boosted + 0.05);
      reasons.push("patch available confirms issue");
    }

    // High severity + evidence = boost
    if ((f.severity === "critical" || f.severity === "high") && f.evidenceBasis) {
      boosted = Math.min(1, boosted + 0.05);
      reasons.push("evidence-backed high severity");
    }

    if (reasons.length > 0) {
      boosts.push({
        ruleId: f.ruleId,
        title: f.title,
        originalConfidence: Math.round(original * 100),
        boostedConfidence: Math.round(boosted * 100),
        boostReasons: reasons,
      });
    }
  }

  boosts.sort((a, b) => b.boostedConfidence - b.originalConfidence - (a.boostedConfidence - a.originalConfidence));

  return boosts;
}

export function runFindingConfidenceBoost(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-confidence-boost [options]

Identify findings eligible for confidence boost.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to analyze.");
    return;
  }

  const boosts = boostConfidence(findings);

  if (format === "json") {
    console.log(JSON.stringify(boosts, null, 2));
    return;
  }

  console.log(`\n=== Confidence Boost Analysis (${boosts.length} eligible) ===\n`);
  for (const b of boosts) {
    const delta = b.boostedConfidence - b.originalConfidence;
    console.log(`${b.ruleId}: ${b.title}`);
    console.log(`  ${b.originalConfidence}% → ${b.boostedConfidence}% (+${delta}%)`);
    for (const r of b.boostReasons) {
      console.log(`    • ${r}`);
    }
    console.log();
  }
}
