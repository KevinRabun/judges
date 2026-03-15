import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-release-gate ────────────────────────────────────────────
   Evaluate whether a codebase passes release-level quality gates.
   Stricter than merge gates — checks critical/high counts, overall
   score, and verdict for release readiness.
   ─────────────────────────────────────────────────────────────────── */

interface ReleaseGateConfig {
  maxCritical: number;
  maxHigh: number;
  minScore: number;
  requirePass: boolean;
}

interface GateCheck {
  check: string;
  passed: boolean;
  detail: string;
}

interface ReleaseGateResult {
  releaseReady: boolean;
  checks: GateCheck[];
}

function evaluateReleaseGate(data: TribunalVerdict, config: ReleaseGateConfig): ReleaseGateResult {
  const checks: GateCheck[] = [];

  const critOk = data.criticalCount <= config.maxCritical;
  checks.push({
    check: `Critical findings ≤ ${config.maxCritical}`,
    passed: critOk,
    detail: `Found: ${data.criticalCount}`,
  });

  const highOk = data.highCount <= config.maxHigh;
  checks.push({
    check: `High findings ≤ ${config.maxHigh}`,
    passed: highOk,
    detail: `Found: ${data.highCount}`,
  });

  const scoreOk = data.overallScore >= config.minScore;
  checks.push({
    check: `Score ≥ ${config.minScore}`,
    passed: scoreOk,
    detail: `Score: ${data.overallScore}`,
  });

  if (config.requirePass) {
    const verdictOk = data.overallVerdict === "pass";
    checks.push({
      check: "Verdict is pass",
      passed: verdictOk,
      detail: `Verdict: ${data.overallVerdict}`,
    });
  }

  const releaseReady = checks.every((c) => c.passed);
  return { releaseReady, checks };
}

export function runReviewReleaseGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-release-gate [options]

Evaluate release-level quality gate.

Options:
  --report <path>      Path to verdict JSON file
  --config <path>      Path to release gate config JSON
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

  const confIdx = argv.indexOf("--config");
  const confPath =
    confIdx !== -1 && argv[confIdx + 1]
      ? join(process.cwd(), argv[confIdx + 1])
      : join(process.cwd(), ".judges", "release-gate.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  let config: ReleaseGateConfig;
  if (existsSync(confPath)) {
    config = JSON.parse(readFileSync(confPath, "utf-8")) as ReleaseGateConfig;
  } else {
    config = { maxCritical: 0, maxHigh: 0, minScore: 80, requirePass: true };
  }

  const result = evaluateReleaseGate(data, config);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const status = result.releaseReady ? "RELEASE READY" : "NOT RELEASE READY";
  console.log(`\n=== ${status} ===\n`);

  for (const c of result.checks) {
    const icon = c.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${c.check} — ${c.detail}`);
  }
  console.log();
}
