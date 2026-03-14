/**
 * Review-contract — versionable document defining exactly what Judges reviews.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContractRule {
  judge: string;
  enabled: boolean;
  severity: string;
  escalation: string;
}

interface ReviewContract {
  version: string;
  team: string;
  created: string;
  updated: string;
  rules: ContractRule[];
  severityThresholds: {
    blockMerge: string;
    requireHumanReview: string;
    informational: string;
  };
  acceptedRisks: string[];
  reviewSLA: {
    maxLatencyMs: number;
    maxFindingsPerPR: number;
  };
}

// ─── Default contract template ─────────────────────────────────────────────

function defaultContract(): ReviewContract {
  return {
    version: "1.0.0",
    team: "default",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    rules: [
      { judge: "data-security", enabled: true, severity: "critical", escalation: "block" },
      { judge: "cybersecurity", enabled: true, severity: "critical", escalation: "block" },
      { judge: "authentication", enabled: true, severity: "high", escalation: "block" },
      { judge: "database", enabled: true, severity: "high", escalation: "block" },
      { judge: "reliability", enabled: true, severity: "medium", escalation: "review" },
      { judge: "performance", enabled: true, severity: "medium", escalation: "review" },
      { judge: "maintainability", enabled: true, severity: "low", escalation: "inform" },
      { judge: "documentation", enabled: true, severity: "low", escalation: "inform" },
      { judge: "testing", enabled: true, severity: "medium", escalation: "review" },
      { judge: "error-handling", enabled: true, severity: "medium", escalation: "review" },
    ],
    severityThresholds: {
      blockMerge: "critical",
      requireHumanReview: "high",
      informational: "low",
    },
    acceptedRisks: [],
    reviewSLA: {
      maxLatencyMs: 30000,
      maxFindingsPerPR: 25,
    },
  };
}

// ─── Contract verification ─────────────────────────────────────────────────

interface VerificationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  coverage: number;
}

function verifyContract(contract: ReviewContract): VerificationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!contract.version) issues.push("Missing contract version");
  if (!contract.rules || contract.rules.length === 0) issues.push("No rules defined — contract is empty");
  if (!contract.severityThresholds) issues.push("Missing severity thresholds");

  // Check rule validity
  const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
  const validEscalations = new Set(["block", "review", "inform", "ignore"]);

  for (const rule of contract.rules) {
    if (!rule.judge) issues.push("Rule with missing judge name");
    if (rule.severity && !validSeverities.has(rule.severity)) {
      warnings.push(`Rule ${rule.judge}: unknown severity '${rule.severity}'`);
    }
    if (rule.escalation && !validEscalations.has(rule.escalation)) {
      warnings.push(`Rule ${rule.judge}: unknown escalation '${rule.escalation}'`);
    }
  }

  // Check for security coverage
  const securityJudges = contract.rules.filter(
    (r) => r.enabled && ["data-security", "cybersecurity", "authentication"].includes(r.judge),
  );
  if (securityJudges.length === 0) {
    warnings.push("No security judges enabled — consider enabling data-security, cybersecurity, or authentication");
  }

  // Check SLA
  if (contract.reviewSLA) {
    if (contract.reviewSLA.maxLatencyMs > 120000) {
      warnings.push(`Review SLA latency (${contract.reviewSLA.maxLatencyMs}ms) exceeds 2 minutes`);
    }
    if (contract.reviewSLA.maxFindingsPerPR > 50) {
      warnings.push(`Max findings per PR (${contract.reviewSLA.maxFindingsPerPR}) is high — may cause alert fatigue`);
    }
  }

  // Accepted risks
  if (contract.acceptedRisks.length > 10) {
    warnings.push(`${contract.acceptedRisks.length} accepted risks — review if all are still valid`);
  }

  const enabledCount = contract.rules.filter((r) => r.enabled).length;
  const totalAvailable = 45; // approximate
  const coverage = Math.round((enabledCount / totalAvailable) * 100);

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    coverage,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewContract(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-contract — Define and verify what Judges reviews

Usage:
  judges review-contract init                Create default review-contract.json
  judges review-contract verify              Verify contract is valid
  judges review-contract show                Show current contract
  judges review-contract --format json       JSON output

Options:
  init                  Create a new review-contract.json template
  verify                Validate the current contract
  show                  Display the current contract
  --format json         JSON output
  --help, -h            Show this help

A review contract defines: which judges are enabled, severity thresholds,
escalation policies, review SLA, and accepted risks. The contract is
diffable and reviewable in PRs.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand =
    argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0 && argv[argv.indexOf(a) - 1] !== "--format") || "show";
  const contractPath = join(".", "review-contract.json");

  if (subcommand === "init") {
    if (existsSync(contractPath)) {
      console.error("Error: review-contract.json already exists. Delete it first or edit manually.");
      process.exitCode = 1;
      return;
    }
    const contract = defaultContract();
    writeFileSync(contractPath, JSON.stringify(contract, null, 2), "utf-8");
    console.log("Created review-contract.json with default template.");
    console.log("Edit rules, thresholds, and SLA to match your team's requirements.");
    return;
  }

  // Load existing contract
  if (!existsSync(contractPath)) {
    console.error("Error: No review-contract.json found. Run 'judges review-contract init' to create one.");
    process.exitCode = 1;
    return;
  }

  let contract: ReviewContract;
  try {
    contract = JSON.parse(readFileSync(contractPath, "utf-8")) as ReviewContract;
  } catch {
    console.error("Error: review-contract.json is not valid JSON.");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "verify") {
    const result = verifyContract(contract);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const icon = result.valid ? "✅" : "❌";
      console.log(
        `\n  Contract Verification: ${icon} ${result.valid ? "VALID" : "INVALID"}\n  ─────────────────────────────`,
      );
      console.log(`    Coverage: ${result.coverage}%`);

      if (result.issues.length > 0) {
        console.log(`\n    Issues (${result.issues.length}):`);
        for (const issue of result.issues) console.log(`      ❌ ${issue}`);
      }

      if (result.warnings.length > 0) {
        console.log(`\n    Warnings (${result.warnings.length}):`);
        for (const w of result.warnings) console.log(`      ⚠️  ${w}`);
      }

      if (result.valid && result.warnings.length === 0) {
        console.log("    No issues found.");
      }
      console.log();
    }

    if (!result.valid) process.exitCode = 1;
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(contract, null, 2));
  } else {
    console.log(`\n  Review Contract v${contract.version}\n  ─────────────────────────────`);
    console.log(`    Team:    ${contract.team}`);
    console.log(`    Updated: ${contract.updated}\n`);

    console.log(`    Rules (${contract.rules.length}):`);
    for (const rule of contract.rules) {
      const icon = rule.enabled ? "✅" : "⬜";
      const escIcon = rule.escalation === "block" ? "🛑" : rule.escalation === "review" ? "🔍" : "ℹ️";
      console.log(`      ${icon} ${rule.judge} — ${rule.severity} / ${escIcon} ${rule.escalation}`);
    }

    console.log(`\n    Thresholds:`);
    console.log(`      Block merge:    ${contract.severityThresholds.blockMerge}`);
    console.log(`      Human review:   ${contract.severityThresholds.requireHumanReview}`);
    console.log(`      Informational:  ${contract.severityThresholds.informational}`);

    console.log(`\n    SLA:`);
    console.log(`      Max latency:     ${contract.reviewSLA.maxLatencyMs}ms`);
    console.log(`      Max findings/PR: ${contract.reviewSLA.maxFindingsPerPR}`);

    if (contract.acceptedRisks.length > 0) {
      console.log(`\n    Accepted Risks:`);
      for (const risk of contract.acceptedRisks) console.log(`      ⚠️  ${risk}`);
    }
    console.log();
  }
}
