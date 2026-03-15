import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-policy-enforce ──────────────────────────────────────────
   Enforce organizational review policies — minimum score, required
   judges, maximum finding counts — and report violations.
   ─────────────────────────────────────────────────────────────────── */

interface PolicyRule {
  name: string;
  type: string;
  value: number | string;
}

interface PolicyResult {
  rule: string;
  passed: boolean;
  detail: string;
}

function enforcePolicies(data: TribunalVerdict, policies: PolicyRule[]): PolicyResult[] {
  const results: PolicyResult[] = [];

  for (const policy of policies) {
    let passed = true;
    let detail: string;

    if (policy.type === "min-score") {
      const threshold = Number(policy.value);
      passed = data.overallScore >= threshold;
      detail = `Score: ${data.overallScore} (min ${threshold})`;
    } else if (policy.type === "max-critical") {
      const max = Number(policy.value);
      passed = data.criticalCount <= max;
      detail = `Critical: ${data.criticalCount} (max ${max})`;
    } else if (policy.type === "max-high") {
      const max = Number(policy.value);
      passed = data.highCount <= max;
      detail = `High: ${data.highCount} (max ${max})`;
    } else if (policy.type === "require-pass") {
      passed = data.overallVerdict === "pass";
      detail = `Verdict: ${data.overallVerdict}`;
    } else if (policy.type === "max-findings") {
      const max = Number(policy.value);
      const count = (data.findings ?? []).length;
      passed = count <= max;
      detail = `Findings: ${count} (max ${max})`;
    } else {
      detail = `Unknown policy type: ${policy.type}`;
    }

    results.push({ rule: policy.name, passed, detail });
  }

  return results;
}

export function runReviewPolicyEnforce(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-policy-enforce [options]

Enforce review policies.

Options:
  --report <path>      Path to verdict JSON file
  --policy <path>      Path to policy config JSON
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

  const polIdx = argv.indexOf("--policy");
  const polPath =
    polIdx !== -1 && argv[polIdx + 1]
      ? join(process.cwd(), argv[polIdx + 1])
      : join(process.cwd(), ".judges", "review-policy.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  let policies: PolicyRule[];
  if (existsSync(polPath)) {
    const polData = JSON.parse(readFileSync(polPath, "utf-8"));
    policies = polData.policies ?? [];
  } else {
    policies = [
      { name: "Minimum score", type: "min-score", value: 70 },
      { name: "No critical findings", type: "max-critical", value: 0 },
      { name: "Require pass verdict", type: "require-pass", value: "true" },
    ];
  }

  const results = enforcePolicies(data, policies);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("\n=== Policy Enforcement ===\n");
  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`  [${icon}] ${r.rule}: ${r.detail}`);
  }
  const allPass = results.every((r) => r.passed);
  console.log(`\n${allPass ? "All policies met." : "Policy violations detected."}`);
}
