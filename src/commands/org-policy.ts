/**
 * Org policy — defines, validates, and enforces organization-wide
 * policy manifests that cascade into per-repo .judgesrc files.
 *
 * All data stored locally.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrgPolicy {
  name: string;
  version: string;
  minSeverity: string;
  requiredJudges: string[];
  bannedRules: string[];
  maxSuppressionsPerRepo: number;
  requiredPreset: string;
  enforcedOptions: Record<string, unknown>;
  lastUpdated: string;
}

interface ComplianceResult {
  compliant: boolean;
  violations: string[];
  warnings: string[];
  checkedAt: string;
}

// ─── Default Policy ─────────────────────────────────────────────────────────

const DEFAULT_POLICY: OrgPolicy = {
  name: "default",
  version: "1.0.0",
  minSeverity: "medium",
  requiredJudges: [],
  bannedRules: [],
  maxSuppressionsPerRepo: 50,
  requiredPreset: "",
  enforcedOptions: {},
  lastUpdated: new Date().toISOString(),
};

// ─── Compliance Check ───────────────────────────────────────────────────────

function checkCompliance(policy: OrgPolicy): ComplianceResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // Check .judgesrc exists
  if (!existsSync(".judgesrc")) {
    violations.push("Missing .judgesrc configuration file");
  } else {
    try {
      const config = JSON.parse(readFileSync(".judgesrc", "utf-8"));

      // Check min severity
      if (policy.minSeverity) {
        const sevOrder = ["critical", "high", "medium", "low", "info"];
        const policyIdx = sevOrder.indexOf(policy.minSeverity);
        const configIdx = sevOrder.indexOf(config.minSeverity || "low");
        if (configIdx > policyIdx) {
          violations.push(
            `minSeverity '${config.minSeverity || "low"}' is less strict than policy requirement '${policy.minSeverity}'`,
          );
        }
      }

      // Check required judges
      const disabledJudges: string[] = config.disabledJudges || [];
      for (const required of policy.requiredJudges) {
        if (disabledJudges.includes(required)) {
          violations.push(`Required judge '${required}' is disabled in .judgesrc`);
        }
      }

      // Check banned rules
      const enabledRules = config.ruleOverrides ? Object.keys(config.ruleOverrides) : [];
      for (const banned of policy.bannedRules) {
        if (enabledRules.includes(banned)) {
          warnings.push(`Banned rule '${banned}' has overrides in .judgesrc`);
        }
      }

      // Check preset
      if (policy.requiredPreset && config.preset !== policy.requiredPreset) {
        violations.push(
          `Required preset '${policy.requiredPreset}' not configured (found: '${config.preset || "none"}')`,
        );
      }
    } catch {
      violations.push("Invalid .judgesrc — cannot parse JSON");
    }
  }

  // Check suppressions count
  if (existsSync(".judges-suppressions.json")) {
    try {
      const supps = JSON.parse(readFileSync(".judges-suppressions.json", "utf-8"));
      const count = Array.isArray(supps) ? supps.length : supps.suppressions?.length || 0;
      if (count > policy.maxSuppressionsPerRepo) {
        violations.push(`Suppressions count (${count}) exceeds policy limit (${policy.maxSuppressionsPerRepo})`);
      }
    } catch {
      /* skip */
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-org-policy";

export function runOrgPolicy(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges org-policy — Organization-wide policy management

Usage:
  judges org-policy --init
  judges org-policy --check
  judges org-policy --show
  judges org-policy --set-required-judges "owasp-judge,crypto-judge"
  judges org-policy --set-min-severity medium

Options:
  --init                Create default org policy file
  --check               Check repo compliance against org policy
  --show                Show current org policy
  --set-required-judges Comma-separated list of required judge IDs
  --set-banned-rules    Comma-separated list of banned rule IDs
  --set-min-severity    Minimum severity level
  --set-preset          Required preset name
  --set-max-suppressions Maximum allowed suppressions per repo
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const policyPath = join(STORE, "org-policy.json");

  // Init
  if (argv.includes("--init")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    if (existsSync(policyPath)) {
      console.log("  Org policy already exists. Edit directly or use --set-* options.");
      return;
    }
    writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2));
    console.log(`  Initialized org policy at ${policyPath}`);
    return;
  }

  // Load policy
  let policy: OrgPolicy;
  if (existsSync(policyPath)) {
    policy = JSON.parse(readFileSync(policyPath, "utf-8"));
  } else {
    if (!argv.includes("--init")) {
      console.log("  No org policy found. Run --init to create one.");
      return;
    }
    policy = DEFAULT_POLICY;
  }

  // Set options
  let modified = false;
  const reqJudges = argv.find((_a: string, i: number) => argv[i - 1] === "--set-required-judges");
  if (reqJudges) {
    policy.requiredJudges = reqJudges.split(",");
    modified = true;
  }

  const bannedRules = argv.find((_a: string, i: number) => argv[i - 1] === "--set-banned-rules");
  if (bannedRules) {
    policy.bannedRules = bannedRules.split(",");
    modified = true;
  }

  const minSev = argv.find((_a: string, i: number) => argv[i - 1] === "--set-min-severity");
  if (minSev) {
    policy.minSeverity = minSev;
    modified = true;
  }

  const preset = argv.find((_a: string, i: number) => argv[i - 1] === "--set-preset");
  if (preset) {
    policy.requiredPreset = preset;
    modified = true;
  }

  const maxSupp = argv.find((_a: string, i: number) => argv[i - 1] === "--set-max-suppressions");
  if (maxSupp) {
    policy.maxSuppressionsPerRepo = parseInt(maxSupp, 10);
    modified = true;
  }

  if (modified) {
    policy.lastUpdated = new Date().toISOString();
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(policyPath, JSON.stringify(policy, null, 2));
    console.log("  Org policy updated.");
  }

  // Check compliance
  if (argv.includes("--check")) {
    const result = checkCompliance(policy);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n  Org Policy Compliance\n  ──────────────────────────`);
      console.log(`  Status: ${result.compliant ? "✅ Compliant" : "❌ Non-compliant"}\n`);
      for (const v of result.violations) console.log(`    ❌ ${v}`);
      for (const w of result.warnings) console.log(`    ⚠️  ${w}`);
      if (result.compliant && result.warnings.length === 0) console.log(`    All checks passed`);
      console.log("");
    }
    return;
  }

  // Show
  if (argv.includes("--show") || !modified) {
    if (format === "json") {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log(`\n  Org Policy: ${policy.name} v${policy.version}`);
      console.log(`  ──────────────────────────`);
      console.log(`    Min severity:       ${policy.minSeverity}`);
      console.log(`    Required preset:    ${policy.requiredPreset || "(none)"}`);
      console.log(
        `    Required judges:    ${policy.requiredJudges.length > 0 ? policy.requiredJudges.join(", ") : "(none)"}`,
      );
      console.log(
        `    Banned rules:       ${policy.bannedRules.length > 0 ? policy.bannedRules.join(", ") : "(none)"}`,
      );
      console.log(`    Max suppressions:   ${policy.maxSuppressionsPerRepo}`);
      console.log(`    Last updated:       ${policy.lastUpdated}\n`);
    }
  }
}
