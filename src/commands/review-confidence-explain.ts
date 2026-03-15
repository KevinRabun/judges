import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-confidence-explain ──────────────────────────────────────
   Explain why a verdict has a certain confidence level, breaking down
   the contributing factors and evidence so reviewers can understand
   and trust the AI's reasoning.
   ─────────────────────────────────────────────────────────────────── */

interface ConfidenceExplanation {
  finding: string;
  confidence: number;
  tier: string;
  factors: string[];
  evidenceBasis: string;
  recommendation: string;
}

function explainConfidence(findings: Finding[]): ConfidenceExplanation[] {
  const explanations: ConfidenceExplanation[] = [];

  for (const f of findings) {
    const factors: string[] = [];
    const conf = f.confidence ?? 0.5;

    if (conf >= 0.9) {
      factors.push("High pattern match confidence");
      factors.push("Strong structural evidence");
    } else if (conf >= 0.7) {
      factors.push("Moderate pattern match");
      factors.push("Partial structural evidence");
    } else {
      factors.push("Low pattern match — heuristic-based");
      factors.push("Limited structural evidence");
    }

    if (f.evidenceBasis !== undefined && f.evidenceBasis !== null) {
      factors.push(`Evidence basis: ${f.evidenceBasis}`);
    }

    if (f.isAbsenceBased === true) {
      factors.push("Absence-based detection (missing safeguard)");
    }

    if (f.lineNumbers !== undefined && f.lineNumbers.length > 0) {
      factors.push(`Pinpointed to ${f.lineNumbers.length} line(s)`);
    }

    if (f.patch !== undefined && f.patch !== null) {
      factors.push("Auto-fix patch available");
    }

    const tier = f.confidenceTier ?? (conf >= 0.9 ? "high" : conf >= 0.7 ? "medium" : "low");

    explanations.push({
      finding: f.ruleId,
      confidence: conf,
      tier,
      factors,
      evidenceBasis: f.evidenceBasis ?? "pattern-match",
      recommendation: conf < 0.7 ? "Manual verification recommended" : "Confidence level supports automated action",
    });
  }

  return explanations;
}

export function runReviewConfidenceExplain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-confidence-explain [options]

Explain verdict confidence levels and contributing factors.

Options:
  --report <path>   Path to a tribunal verdict JSON file
  --format <fmt>    Output format: table (default) or json
  -h, --help        Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath = reportIdx !== -1 && argv[reportIdx + 1] ? argv[reportIdx + 1] : null;

  let findings: Finding[] = [];

  if (reportPath !== null) {
    const resolved = join(process.cwd(), reportPath);
    if (!existsSync(resolved)) {
      console.error(`Report not found: ${resolved}`);
      process.exitCode = 1;
      return;
    }
    const data = JSON.parse(readFileSync(resolved, "utf-8")) as TribunalVerdict;
    findings = data.findings ?? [];
  } else {
    const defaultPath = join(process.cwd(), ".judges", "last-verdict.json");
    if (existsSync(defaultPath)) {
      const data = JSON.parse(readFileSync(defaultPath, "utf-8")) as TribunalVerdict;
      findings = data.findings ?? [];
    }
  }

  if (findings.length === 0) {
    console.log("No findings to explain. Provide --report or run a review first.");
    return;
  }

  const explanations = explainConfidence(findings);

  if (format === "json") {
    console.log(JSON.stringify(explanations, null, 2));
    return;
  }

  console.log("\n=== Confidence Explanations ===\n");
  for (const ex of explanations) {
    console.log(`Finding: ${ex.finding}`);
    console.log(`  Confidence: ${(ex.confidence * 100).toFixed(0)}% (${ex.tier})`);
    console.log(`  Evidence: ${ex.evidenceBasis}`);
    console.log(`  Factors:`);
    for (const factor of ex.factors) {
      console.log(`    - ${factor}`);
    }
    console.log(`  ${ex.recommendation}`);
    console.log();
  }
}
