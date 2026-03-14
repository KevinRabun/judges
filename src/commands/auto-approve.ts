/**
 * Auto-approve — Auto-approve findings below a configurable threshold.
 */

import { readFileSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApprovalPolicy {
  maxLowFindings: number;
  maxMediumFindings: number;
  allowedRules: string[];
  requireMinScore: number;
  blockOnSecurity: boolean;
  autoApproveClean: boolean;
}

interface ApprovalResult {
  approved: boolean;
  reason: string;
  autoApproved: number;
  manualRequired: number;
  policyViolations: string[];
  findings: { approved: Finding[]; flagged: Finding[] };
}

// ─── Default policy ────────────────────────────────────────────────────────

function defaultPolicy(): ApprovalPolicy {
  return {
    maxLowFindings: 10,
    maxMediumFindings: 3,
    allowedRules: [],
    requireMinScore: 70,
    blockOnSecurity: true,
    autoApproveClean: true,
  };
}

// ─── Severity classification ────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function isSecurity(finding: Finding): boolean {
  const rid = (finding.ruleId || "").toLowerCase();
  return /sql|inject|xss|csrf|traversal|auth|secret|crypt|ssrf|deserial/i.test(rid);
}

// ─── Approval engine ───────────────────────────────────────────────────────

function evaluateApproval(verdict: TribunalVerdict, policy: ApprovalPolicy): ApprovalResult {
  const findings = verdict.findings || [];
  const violations: string[] = [];
  const approved: Finding[] = [];
  const flagged: Finding[] = [];

  // Check score threshold
  if ((verdict.overallScore ?? 0) < policy.requireMinScore) {
    violations.push(`Score ${verdict.overallScore} is below minimum ${policy.requireMinScore}`);
  }

  // Classify findings
  const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const f of findings) {
    const sev = f.severity || "low";
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;

    const sevLevel = SEVERITY_ORDER[sev] ?? 3;

    // Critical and high are always flagged
    if (sevLevel <= 1) {
      flagged.push(f);
      continue;
    }

    // Security findings blocked if policy says so
    if (policy.blockOnSecurity && isSecurity(f)) {
      flagged.push(f);
      continue;
    }

    // Low findings auto-approved
    if (sev === "low") {
      approved.push(f);
      continue;
    }

    // Medium finding — check against allowed rules
    if (policy.allowedRules.length > 0 && policy.allowedRules.includes(f.ruleId)) {
      approved.push(f);
    } else {
      flagged.push(f);
    }
  }

  // Check threshold violations
  if (severityCounts["critical"] > 0) {
    violations.push(`${severityCounts["critical"]} critical finding(s) detected`);
  }
  if (severityCounts["high"] > 0) {
    violations.push(`${severityCounts["high"]} high finding(s) detected`);
  }
  if (severityCounts["medium"] > policy.maxMediumFindings) {
    violations.push(`${severityCounts["medium"]} medium findings exceed max of ${policy.maxMediumFindings}`);
  }
  if (severityCounts["low"] > policy.maxLowFindings) {
    violations.push(`${severityCounts["low"]} low findings exceed max of ${policy.maxLowFindings}`);
  }

  const isApproved = violations.length === 0 || (findings.length === 0 && policy.autoApproveClean);

  let reason: string;
  if (isApproved && findings.length === 0) {
    reason = "Clean review — no findings";
  } else if (isApproved) {
    reason = "All findings within policy thresholds";
  } else {
    reason = violations.join("; ");
  }

  return {
    approved: isApproved,
    reason,
    autoApproved: approved.length,
    manualRequired: flagged.length,
    policyViolations: violations,
    findings: { approved, flagged },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAutoApprove(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges auto-approve — Auto-approve findings below threshold

Usage:
  judges auto-approve --input verdict.json
  judges auto-approve --input verdict.json --policy policy.json
  judges auto-approve --input verdict.json --format json

Options:
  --input <file>       TribunalVerdict JSON file (required)
  --policy <file>      Approval policy JSON file (optional, uses defaults)
  --min-score <n>      Minimum score for approval (default: 70)
  --format json        JSON output
  --help, -h           Show this help

Policy defaults:
  maxLowFindings: 10, maxMediumFindings: 3, requireMinScore: 70,
  blockOnSecurity: true, autoApproveClean: true

Auto-approves low-severity findings and flags critical/high findings
for manual review. Reduces noise while maintaining safety.
`);
    return;
  }

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const policyPath = argv.find((_a: string, i: number) => argv[i - 1] === "--policy");
  const minScoreStr = argv.find((_a: string, i: number) => argv[i - 1] === "--min-score");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!inputPath) {
    console.error("Error: --input is required. Provide a verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(inputPath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Cannot read or parse ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  let policy = defaultPolicy();
  if (policyPath) {
    try {
      const custom = JSON.parse(readFileSync(policyPath, "utf-8")) as Partial<ApprovalPolicy>;
      policy = { ...policy, ...custom };
    } catch {
      console.error(`Error: Cannot read policy file ${policyPath}`);
      process.exitCode = 1;
      return;
    }
  }

  if (minScoreStr) {
    policy.requireMinScore = parseInt(minScoreStr, 10);
  }

  const result = evaluateApproval(verdict, policy);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          ...result,
          findings: { autoApproved: result.findings.approved.length, flagged: result.findings.flagged.length },
        },
        null,
        2,
      ),
    );
    if (!result.approved) process.exitCode = 1;
    return;
  }

  const icon = result.approved ? "✅" : "❌";
  console.log(
    `\n  Auto-Approval Result: ${icon} ${result.approved ? "APPROVED" : "REQUIRES REVIEW"}\n  ─────────────────────────────`,
  );
  console.log(`    Reason: ${result.reason}`);
  console.log(`    Score: ${verdict.overallScore ?? 0}/100`);
  console.log(`    Auto-approved: ${result.autoApproved} finding(s)`);
  console.log(`    Manual review: ${result.manualRequired} finding(s)`);

  if (result.policyViolations.length > 0) {
    console.log(`\n    Policy Violations:`);
    for (const v of result.policyViolations) {
      console.log(`      ❌ ${v}`);
    }
  }

  if (result.findings.flagged.length > 0) {
    console.log(`\n    Flagged Findings:`);
    for (const f of result.findings.flagged.slice(0, 10)) {
      console.log(`      🔴 [${f.severity}] ${f.ruleId}: ${f.title}`);
    }
    if (result.findings.flagged.length > 10) {
      console.log(`      ... and ${result.findings.flagged.length - 10} more`);
    }
  }

  console.log();
  if (!result.approved) process.exitCode = 1;
}
