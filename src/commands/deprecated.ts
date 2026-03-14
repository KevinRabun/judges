/**
 * Rule deprecation lifecycle management.
 *
 * Provides a registry of deprecated Judges rules with migration guidance,
 * sunset dates, and replacement rules. Emits warnings when deprecated
 * rules appear in findings or config.
 *
 * Usage:
 *   judges deprecated                        # List all deprecated rules
 *   judges deprecated --check .judgesrc      # Check config for deprecated rules
 *   judges deprecated --format json          # JSON output
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeprecatedRule {
  /** The deprecated rule ID */
  ruleId: string;
  /** When it was deprecated (version) */
  deprecatedIn: string;
  /** When it will be removed (version, or "TBD") */
  removedIn: string;
  /** Why it was deprecated */
  reason: string;
  /** Replacement rule(s), if any */
  replacements: string[];
  /** Migration guidance */
  migration: string;
}

export interface DeprecationWarning {
  ruleId: string;
  location: "config" | "finding";
  message: string;
  replacements: string[];
}

// ─── Deprecated Rules Registry ──────────────────────────────────────────────

const DEPRECATED_RULES: DeprecatedRule[] = [
  {
    ruleId: "SEC-EVAL-001",
    deprecatedIn: "3.10.0",
    removedIn: "4.0.0",
    reason: "Merged into SEC-INJ-001 for unified injection detection",
    replacements: ["SEC-INJ-001"],
    migration:
      "Replace SEC-EVAL-001 references in ruleOverrides with SEC-INJ-001. The new rule covers eval(), Function(), and other injection vectors.",
  },
  {
    ruleId: "PERF-LOOP-001",
    deprecatedIn: "3.15.0",
    removedIn: "4.0.0",
    reason:
      "Superseded by the more comprehensive PERF-COMPLEXITY-001 which covers loops, recursion, and algorithmic complexity",
    replacements: ["PERF-COMPLEXITY-001"],
    migration: "Update ruleOverrides to use PERF-COMPLEXITY-001. The new rule has more granular severity options.",
  },
  {
    ruleId: "DOC-INLINE-001",
    deprecatedIn: "3.20.0",
    removedIn: "4.0.0",
    reason: "Split into DOC-FUNC-001 (function docs) and DOC-CLASS-001 (class docs) for more targeted analysis",
    replacements: ["DOC-FUNC-001", "DOC-CLASS-001"],
    migration:
      "Replace DOC-INLINE-001 in ruleOverrides with DOC-FUNC-001 and/or DOC-CLASS-001 depending on your needs.",
  },
  {
    ruleId: "DATA-PII-001",
    deprecatedIn: "3.25.0",
    removedIn: "4.0.0",
    reason: "Replaced by DATA-001 which includes PII detection alongside other sensitive data patterns",
    replacements: ["DATA-001"],
    migration: "Update references from DATA-PII-001 to DATA-001. The new rule has broader coverage.",
  },
  {
    ruleId: "SEC-CRYPTO-WEAK",
    deprecatedIn: "3.30.0",
    removedIn: "4.0.0",
    reason: "Renamed to SEC-CRYPTO-001 for consistent naming convention",
    replacements: ["SEC-CRYPTO-001"],
    migration: "Simply rename SEC-CRYPTO-WEAK to SEC-CRYPTO-001 in all config references.",
  },
];

// ─── Registry API ───────────────────────────────────────────────────────────

export function getDeprecatedRules(): DeprecatedRule[] {
  return [...DEPRECATED_RULES];
}

export function isRuleDeprecated(ruleId: string): DeprecatedRule | undefined {
  return DEPRECATED_RULES.find((r) => r.ruleId === ruleId);
}

/**
 * Check a config for references to deprecated rules.
 * Scans disabledRules, ruleOverrides, and customRules.
 */
export function checkConfigForDeprecated(config: Record<string, unknown>): DeprecationWarning[] {
  const warnings: DeprecationWarning[] = [];

  // Check disabledRules
  const disabled = (config.disabledRules || []) as string[];
  for (const ruleId of disabled) {
    const dep = isRuleDeprecated(ruleId);
    if (dep) {
      warnings.push({
        ruleId,
        location: "config",
        message: `disabledRules contains deprecated rule "${ruleId}" (deprecated in v${dep.deprecatedIn}). ${dep.migration}`,
        replacements: dep.replacements,
      });
    }
  }

  // Check ruleOverrides keys
  const overrides = (config.ruleOverrides || {}) as Record<string, unknown>;
  for (const ruleId of Object.keys(overrides)) {
    const dep = isRuleDeprecated(ruleId);
    if (dep) {
      warnings.push({
        ruleId,
        location: "config",
        message: `ruleOverrides references deprecated rule "${ruleId}" (deprecated in v${dep.deprecatedIn}). ${dep.migration}`,
        replacements: dep.replacements,
      });
    }
  }

  // Check lockedRules
  const locked = (config.lockedRules || []) as string[];
  for (const ruleId of locked) {
    const dep = isRuleDeprecated(ruleId);
    if (dep) {
      warnings.push({
        ruleId,
        location: "config",
        message: `lockedRules contains deprecated rule "${ruleId}" (deprecated in v${dep.deprecatedIn}). ${dep.migration}`,
        replacements: dep.replacements,
      });
    }
  }

  return warnings;
}

/**
 * Check findings for deprecated rules and annotate them.
 */
export function annotateDeprecatedFindings(
  findings: Array<{ ruleId: string; [key: string]: unknown }>,
): DeprecationWarning[] {
  const warnings: DeprecationWarning[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    if (seen.has(finding.ruleId)) continue;
    const dep = isRuleDeprecated(finding.ruleId);
    if (dep) {
      seen.add(finding.ruleId);
      warnings.push({
        ruleId: finding.ruleId,
        location: "finding",
        message: `Rule "${finding.ruleId}" is deprecated since v${dep.deprecatedIn}. ${dep.reason}`,
        replacements: dep.replacements,
      });
    }
  }

  return warnings;
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runDeprecatedCommand(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges deprecated — Rule deprecation lifecycle

Usage:
  judges deprecated                        List all deprecated rules
  judges deprecated --check .judgesrc      Check config for deprecated references
  judges deprecated --format json          JSON output

Shows deprecated rules with migration guidance, replacement rules, and removal timeline.

Options:
  --check <path>     Check a .judgesrc for deprecated rule references
  --format <fmt>     Output format: text, json
  --help, -h         Show this help
`);
    return;
  }

  const format = argv.find((_a, i) => argv[i - 1] === "--format") || "text";
  const checkPath = argv.find((_a, i) => argv[i - 1] === "--check");

  // Check config mode
  if (checkPath) {
    try {
      const { readFileSync, existsSync } = require("fs");
      if (!existsSync(checkPath)) {
        console.log(`\n  File not found: ${checkPath}\n`);
        return;
      }
      const config = JSON.parse(readFileSync(checkPath, "utf-8"));
      const warnings = checkConfigForDeprecated(config);

      if (format === "json") {
        console.log(JSON.stringify({ warnings }, null, 2));
        return;
      }

      console.log(`\n  Checking ${checkPath} for deprecated rules...\n`);
      if (warnings.length === 0) {
        console.log("  ✅ No deprecated rule references found.\n");
      } else {
        for (const w of warnings) {
          console.log(`  ⚠️  ${w.message}`);
          if (w.replacements.length > 0) {
            console.log(`      → Replace with: ${w.replacements.join(", ")}`);
          }
          console.log("");
        }
      }
      return;
    } catch (err) {
      console.error(`\n  Error checking config: ${err instanceof Error ? err.message : String(err)}\n`);
      return;
    }
  }

  // List all deprecated rules
  const rules = getDeprecatedRules();

  if (format === "json") {
    console.log(JSON.stringify({ deprecatedRules: rules }, null, 2));
    return;
  }

  console.log("\n  Deprecated Rules\n");
  console.log(`  ${"RULE ID".padEnd(20)}  ${"DEPRECATED IN".padEnd(15)}  ${"REMOVED IN".padEnd(12)}  REPLACEMENT(S)`);
  console.log(`  ${"─".repeat(20)}  ${"─".repeat(15)}  ${"─".repeat(12)}  ${"─".repeat(25)}`);

  for (const rule of rules) {
    console.log(
      `  ${rule.ruleId.padEnd(20)}  v${rule.deprecatedIn.padEnd(14)}  v${rule.removedIn.padEnd(11)}  ${rule.replacements.join(", ") || "—"}`,
    );
  }

  console.log(`\n  ${rules.length} deprecated rule(s). Run with --check <config> to scan your .judgesrc.\n`);
}
