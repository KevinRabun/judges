/**
 * Review-config-validate — Validate review configuration files.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewConfigValidate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-config-validate — Validate review configuration files

Usage:
  judges review-config-validate
  judges review-config-validate --file .judgesrc
  judges review-config-validate --strict

Options:
  --file <path>         Config file to validate (default: .judgesrc)
  --strict              Enable strict validation
  --format json         JSON output
  --help, -h            Show this help

Checks configuration for common errors and best practices.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const configPath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || ".judgesrc";
  const strict = argv.includes("--strict");

  if (!existsSync(configPath)) {
    console.log(`Config file not found: ${configPath}`);
    console.log("Create one with 'judges init' or specify --file.");
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.log(`Failed to parse config: ${configPath}`);
    return;
  }

  const issues: ValidationIssue[] = [];

  // Check preset
  const validPresets = [
    "strict",
    "lenient",
    "security-only",
    "startup",
    "compliance",
    "performance",
    "react",
    "express",
    "fastapi",
    "django",
    "spring-boot",
    "rails",
    "nextjs",
  ];
  if (config.preset && typeof config.preset === "string" && !validPresets.includes(config.preset)) {
    issues.push({ field: "preset", message: `Unknown preset "${config.preset}"`, severity: "warning" });
  }

  // Check disabledJudges
  if (config.disabledJudges && !Array.isArray(config.disabledJudges)) {
    issues.push({ field: "disabledJudges", message: "Should be an array of judge IDs", severity: "error" });
  }

  // Check disabledRules
  if (config.disabledRules && !Array.isArray(config.disabledRules)) {
    issues.push({ field: "disabledRules", message: "Should be an array of rule IDs", severity: "error" });
  }

  // Check minSeverity
  const validSeverities = ["critical", "high", "medium", "low", "info"];
  if (config.minSeverity && typeof config.minSeverity === "string" && !validSeverities.includes(config.minSeverity)) {
    issues.push({ field: "minSeverity", message: `Invalid severity "${config.minSeverity}"`, severity: "error" });
  }

  // Check ruleOverrides
  if (config.ruleOverrides && typeof config.ruleOverrides !== "object") {
    issues.push({ field: "ruleOverrides", message: "Should be an object", severity: "error" });
  }

  // Strict checks
  if (strict) {
    if (!config.preset) {
      issues.push({ field: "preset", message: "No preset specified (recommended)", severity: "warning" });
    }
    if (Array.isArray(config.disabledJudges) && config.disabledJudges.length > 10) {
      issues.push({
        field: "disabledJudges",
        message: "Many judges disabled — consider using a preset instead",
        severity: "warning",
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (format === "json") {
    console.log(
      JSON.stringify({ valid: errors.length === 0, errors: errors.length, warnings: warnings.length, issues }, null, 2),
    );
    return;
  }

  if (issues.length === 0) {
    console.log(`Config valid: ${configPath}`);
    return;
  }

  console.log(`\nConfig Validation: ${configPath}`);
  console.log("─".repeat(50));

  for (const i of issues) {
    const icon = i.severity === "error" ? "ERROR" : "WARN";
    console.log(`  [${icon}] ${i.field}: ${i.message}`);
  }

  console.log("─".repeat(50));
  console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
}
