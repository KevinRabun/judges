/**
 * Config validation — validate .judgesrc against the JSON schema
 * and report errors with line numbers and fix suggestions.
 */

import type { JudgesConfig } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─── Known Fields ───────────────────────────────────────────────────────────

const KNOWN_TOP_FIELDS = new Set([
  "preset",
  "presets",
  "severity",
  "minSeverity",
  "format",
  "disabledJudges",
  "disabledRules",
  "ruleOverrides",
  "parallel",
  "concurrency",
  "failOnFindings",
  "summary",
  "baseline",
  "exclude",
  "include",
  "judges",
  "notifications",
  "qualityGate",
  "plugins",
  "extends",
  "language",
  "framework",
  "dataAdapter",
  "smartSelect",
  "customRules",
  "organizationPolicy",
  "cache",
  "autoFix",
  "triage",
  "deprecated",
  "ignorePatterns",
]);

const KNOWN_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);
const KNOWN_FORMATS = new Set([
  "text",
  "json",
  "sarif",
  "markdown",
  "html",
  "pdf",
  "junit",
  "codeclimate",
  "github-actions",
]);

// ─── Validation Logic ───────────────────────────────────────────────────────

export function validateConfig(config: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check for unknown top-level fields
  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_FIELDS.has(key)) {
      warnings.push({
        path: key,
        message: `Unknown field "${key}"`,
        suggestion: findClosestMatch(key, KNOWN_TOP_FIELDS),
      });
    }
  }

  // Validate severity
  if (config.minSeverity !== undefined) {
    if (typeof config.minSeverity !== "string" || !KNOWN_SEVERITIES.has(config.minSeverity as string)) {
      errors.push({
        path: "minSeverity",
        message: `Invalid severity "${config.minSeverity}". Must be one of: ${[...KNOWN_SEVERITIES].join(", ")}`,
      });
    }
  }

  // Validate format
  if (config.format !== undefined) {
    if (typeof config.format !== "string" || !KNOWN_FORMATS.has(config.format as string)) {
      errors.push({
        path: "format",
        message: `Invalid format "${config.format}". Must be one of: ${[...KNOWN_FORMATS].join(", ")}`,
      });
    }
  }

  // Validate disabledJudges is array of strings
  if (config.disabledJudges !== undefined) {
    if (!Array.isArray(config.disabledJudges)) {
      errors.push({
        path: "disabledJudges",
        message: "disabledJudges must be an array of strings",
      });
    }
  }

  // Validate disabledRules is array of strings
  if (config.disabledRules !== undefined) {
    if (!Array.isArray(config.disabledRules)) {
      errors.push({
        path: "disabledRules",
        message: "disabledRules must be an array of strings",
      });
    }
  }

  // Validate ruleOverrides
  if (config.ruleOverrides !== undefined) {
    if (typeof config.ruleOverrides !== "object" || config.ruleOverrides === null) {
      errors.push({
        path: "ruleOverrides",
        message: "ruleOverrides must be an object",
      });
    } else {
      for (const [rule, override] of Object.entries(config.ruleOverrides as Record<string, unknown>)) {
        if (typeof override === "object" && override !== null) {
          const ov = override as Record<string, unknown>;
          if (ov.severity && !KNOWN_SEVERITIES.has(ov.severity as string)) {
            errors.push({
              path: `ruleOverrides.${rule}.severity`,
              message: `Invalid severity "${ov.severity}"`,
            });
          }
        }
      }
    }
  }

  // Validate concurrency
  if (config.concurrency !== undefined) {
    if (typeof config.concurrency !== "number" || (config.concurrency as number) < 1) {
      errors.push({
        path: "concurrency",
        message: "concurrency must be a positive number",
      });
    }
  }

  // Validate exclude/include patterns
  for (const field of ["exclude", "include"] as const) {
    if (config[field] !== undefined) {
      if (!Array.isArray(config[field])) {
        errors.push({
          path: field,
          message: `${field} must be an array of glob patterns`,
        });
      }
    }
  }

  // Validate notifications
  if (config.notifications !== undefined) {
    const notifs = config.notifications as Record<string, unknown>;
    if (notifs.channels && !Array.isArray(notifs.channels)) {
      errors.push({
        path: "notifications.channels",
        message: "notifications.channels must be an array",
      });
    }
  }

  // Validate qualityGate
  if (config.qualityGate !== undefined) {
    const qg = config.qualityGate as Record<string, unknown>;
    if (qg.maxFindings !== undefined && (typeof qg.maxFindings !== "number" || (qg.maxFindings as number) < 0)) {
      errors.push({
        path: "qualityGate.maxFindings",
        message: "qualityGate.maxFindings must be a non-negative number",
      });
    }
    if (
      qg.minScore !== undefined &&
      (typeof qg.minScore !== "number" || (qg.minScore as number) < 0 || (qg.minScore as number) > 100)
    ) {
      errors.push({
        path: "qualityGate.minScore",
        message: "qualityGate.minScore must be between 0 and 100",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function findClosestMatch(input: string, candidates: Set<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = levenshtein(input.toLowerCase(), c.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = c;
    }
  }

  return best ? `Did you mean "${best}"?` : undefined;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runValidateConfig(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges validate-config — Validate .judgesrc configuration

Usage:
  judges validate-config                        Validate .judgesrc in current directory
  judges validate-config --config path/to/.judgesrc   Validate specific file

Options:
  --config <path>    Config file to validate (default: .judgesrc)
  --format json      JSON output
  --strict           Treat warnings as errors
  --help, -h         Show this help
`);
    return;
  }

  const { readFileSync, existsSync } = require("fs");
  const { resolve } = require("path");

  const configPath = argv.find((_a: string, i: number) => argv[i - 1] === "--config") || ".judgesrc";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const strict = argv.includes("--strict");
  const resolved = resolve(configPath);

  if (!existsSync(resolved)) {
    console.error(`Error: config file not found: ${resolved}`);
    process.exit(1);
  }

  let config: JudgesConfig;
  try {
    config = JSON.parse(readFileSync(resolved, "utf-8"));
  } catch (e) {
    console.error(`Error: invalid JSON in ${resolved}: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  const result = validateConfig(config as unknown as Record<string, unknown>);

  if (strict && result.warnings.length > 0) {
    result.valid = false;
    result.errors.push(...result.warnings);
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }

  if (result.valid && result.warnings.length === 0) {
    console.log(`\n  ✅ Config is valid: ${resolved}\n`);
    return;
  }

  console.log(`\n  Config Validation: ${resolved}\n`);

  if (result.errors.length > 0) {
    console.log(`  ❌ Errors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`    ${e.path}: ${e.message}`);
      if (e.suggestion) console.log(`      💡 ${e.suggestion}`);
    }
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log(`  ⚠️  Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`    ${w.path}: ${w.message}`);
      if (w.suggestion) console.log(`      💡 ${w.suggestion}`);
    }
    console.log("");
  }

  process.exit(result.valid ? 0 : 1);
}
