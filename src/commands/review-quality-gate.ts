import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-quality-gate ────────────────────────────────────────────
   Define and evaluate quality gates — pass/fail thresholds for
   findings severity counts, overall score, and coverage metrics.
   All config is local (no external data processing).
   ─────────────────────────────────────────────────────────────────── */

interface QualityGate {
  name: string;
  maxCritical: number;
  maxHigh: number;
  minScore: number;
  maxTotal: number;
}

interface GateResult {
  gate: string;
  passed: boolean;
  details: string[];
}

function evaluateGates(findings: Finding[], score: number, gates: QualityGate[]): GateResult[] {
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  const results: GateResult[] = [];
  for (const gate of gates) {
    const details: string[] = [];
    let passed = true;

    if (criticalCount > gate.maxCritical) {
      passed = false;
      details.push(`Critical findings: ${criticalCount} (max ${gate.maxCritical})`);
    }
    if (highCount > gate.maxHigh) {
      passed = false;
      details.push(`High findings: ${highCount} (max ${gate.maxHigh})`);
    }
    if (score < gate.minScore) {
      passed = false;
      details.push(`Score: ${score} (min ${gate.minScore})`);
    }
    if (findings.length > gate.maxTotal) {
      passed = false;
      details.push(`Total findings: ${findings.length} (max ${gate.maxTotal})`);
    }

    if (passed) {
      details.push("All checks passed");
    }

    results.push({ gate: gate.name, passed, details });
  }
  return results;
}

export function runReviewQualityGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-quality-gate [options]

Evaluate quality gates against review findings.

Options:
  --report <path>      Path to verdict JSON file
  --gates <path>       Path to quality gates config JSON
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

  const gatesIdx = argv.indexOf("--gates");
  const gatesPath =
    gatesIdx !== -1 && argv[gatesIdx + 1]
      ? join(process.cwd(), argv[gatesIdx + 1])
      : join(process.cwd(), ".judges", "quality-gates.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  let gates: QualityGate[];
  if (existsSync(gatesPath)) {
    const gateData = JSON.parse(readFileSync(gatesPath, "utf-8"));
    gates = gateData.gates ?? [];
  } else {
    gates = [{ name: "Default", maxCritical: 0, maxHigh: 2, minScore: 70, maxTotal: 20 }];
  }

  const results = evaluateGates(findings, data.overallScore, gates);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("\n=== Quality Gate Results ===\n");
  for (const r of results) {
    const status = r.passed ? "PASSED" : "FAILED";
    console.log(`[${status}] ${r.gate}`);
    for (const d of r.details) {
      console.log(`  - ${d}`);
    }
    console.log();
  }

  const allPassed = results.every((r) => r.passed);
  console.log(allPassed ? "All quality gates passed." : "Some quality gates failed.");
}
