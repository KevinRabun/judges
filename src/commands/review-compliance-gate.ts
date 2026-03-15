/**
 * Review-compliance-gate — Gate reviews based on compliance policy.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CompliancePolicy {
  version: number;
  name: string;
  rules: ComplianceRule[];
}

interface ComplianceRule {
  id: string;
  description: string;
  type: "max-critical" | "max-high" | "min-score" | "required-judges" | "no-unfixed";
  threshold: number;
  requiredJudges?: string[];
}

interface ComplianceResult {
  policy: string;
  passed: boolean;
  results: Array<{ ruleId: string; passed: boolean; detail: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadPolicy(policyPath: string): CompliancePolicy {
  if (!existsSync(policyPath)) {
    return {
      version: 1,
      name: "default",
      rules: [
        { id: "no-critical", description: "No critical findings", type: "max-critical", threshold: 0 },
        { id: "max-high-5", description: "Max 5 high findings", type: "max-high", threshold: 5 },
        { id: "min-score-50", description: "Minimum score of 50", type: "min-score", threshold: 50 },
      ],
    };
  }
  try {
    return JSON.parse(readFileSync(policyPath, "utf-8"));
  } catch {
    return { version: 1, name: "default", rules: [] };
  }
}

function evaluateCompliance(verdict: TribunalVerdict, policy: CompliancePolicy): ComplianceResult {
  const results: ComplianceResult["results"] = [];

  for (const rule of policy.rules) {
    let passed = true;
    let detail = "";

    switch (rule.type) {
      case "max-critical":
        passed = verdict.criticalCount <= rule.threshold;
        detail = `Critical: ${verdict.criticalCount} (max: ${rule.threshold})`;
        break;

      case "max-high":
        passed = verdict.highCount <= rule.threshold;
        detail = `High: ${verdict.highCount} (max: ${rule.threshold})`;
        break;

      case "min-score":
        passed = verdict.overallScore >= rule.threshold;
        detail = `Score: ${verdict.overallScore} (min: ${rule.threshold})`;
        break;

      case "required-judges": {
        const activeJudges = new Set(verdict.evaluations.map((e) => e.judgeId));
        const missing = (rule.requiredJudges || []).filter((j) => !activeJudges.has(j));
        passed = missing.length === 0;
        detail = passed ? "All required judges active" : `Missing: ${missing.join(", ")}`;
        break;
      }

      case "no-unfixed":
        passed = verdict.findings.every((f) => f.patch !== undefined && f.patch !== null);
        detail = passed ? "All findings have fixes" : "Some findings lack fixes";
        break;
    }

    results.push({ ruleId: rule.id, passed, detail });
  }

  return {
    policy: policy.name,
    passed: results.every((r) => r.passed),
    results,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComplianceGate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const policyIdx = argv.indexOf("--policy");
  const actionIdx = argv.indexOf("--action");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const policyPath = policyIdx >= 0 ? argv[policyIdx + 1] : ".judges-compliance.json";
  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "check";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compliance-gate — Compliance gate for reviews

Usage:
  judges review-compliance-gate --file <verdict.json> [--policy <path>]
                                [--action check|init|show] [--format table|json]

Options:
  --file <path>      Verdict JSON file (for check)
  --policy <path>    Policy file (default: .judges-compliance.json)
  --action <act>     Action: check (default), init, show
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const policy = loadPolicy(policyPath);

  if (action === "init") {
    const dir = dirname(policyPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    console.log(`Compliance policy initialized: ${policyPath}`);
    return;
  }

  if (action === "show") {
    if (format === "json") {
      console.log(JSON.stringify(policy, null, 2));
      return;
    }
    console.log(`\nCompliance Policy: ${policy.name}`);
    console.log("═".repeat(60));
    for (const r of policy.rules) {
      console.log(`  ${r.id.padEnd(20)} ${r.type.padEnd(18)} threshold=${r.threshold}`);
    }
    console.log("═".repeat(60));
    return;
  }

  // check
  if (!filePath) {
    console.error("Error: --file required for check");
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

  const result = evaluateCompliance(verdict, policy);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  console.log(`\nCompliance Gate: ${result.passed ? "PASS" : "FAIL"} (policy: ${result.policy})`);
  console.log("═".repeat(60));
  console.log(`${"Status".padEnd(8)} ${"Rule".padEnd(22)} Detail`);
  console.log("─".repeat(60));

  for (const r of result.results) {
    console.log(`${(r.passed ? "PASS" : "FAIL").padEnd(8)} ${r.ruleId.padEnd(22)} ${r.detail}`);
  }
  console.log("═".repeat(60));

  if (!result.passed) process.exitCode = 1;
}
