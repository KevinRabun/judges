/**
 * Config-lint — Lint and validate .judgesrc configuration files.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LintIssue {
  level: "error" | "warning" | "info";
  field: string;
  message: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_PRESETS = [
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
  "terraform",
  "kubernetes",
];

const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];

function lintConfig(config: Record<string, unknown>, issues: LintIssue[]): void {
  // Check preset
  if (config["preset"] !== undefined) {
    const preset = String(config["preset"]);
    const presets = preset.split(",").map((p) => p.trim());
    for (const p of presets) {
      if (!VALID_PRESETS.includes(p)) {
        issues.push({
          level: "warning",
          field: "preset",
          message: `Unknown preset '${p}'. Valid: ${VALID_PRESETS.join(", ")}`,
        });
      }
    }
  }

  // Check minSeverity
  if (config["minSeverity"] !== undefined) {
    const sev = String(config["minSeverity"]).toLowerCase();
    if (!VALID_SEVERITIES.includes(sev)) {
      issues.push({
        level: "error",
        field: "minSeverity",
        message: `Invalid severity '${sev}'. Valid: ${VALID_SEVERITIES.join(", ")}`,
      });
    }
  }

  // Check disabledJudges
  if (config["disabledJudges"] !== undefined) {
    if (!Array.isArray(config["disabledJudges"])) {
      issues.push({ level: "error", field: "disabledJudges", message: "Must be an array of strings" });
    }
  }

  // Check disabledRules
  if (config["disabledRules"] !== undefined) {
    if (!Array.isArray(config["disabledRules"])) {
      issues.push({ level: "error", field: "disabledRules", message: "Must be an array of strings" });
    }
  }

  // Check ruleOverrides
  if (config["ruleOverrides"] !== undefined) {
    if (typeof config["ruleOverrides"] !== "object" || config["ruleOverrides"] === null) {
      issues.push({ level: "error", field: "ruleOverrides", message: "Must be an object" });
    }
  }

  // Warn about unknown fields
  const knownFields = new Set([
    "preset",
    "minSeverity",
    "disabledJudges",
    "disabledRules",
    "ruleOverrides",
    "format",
    "failOnFindings",
    "minScore",
    "exclude",
    "include",
    "maxFiles",
    "language",
    "baseline",
  ]);
  for (const key of Object.keys(config)) {
    if (!knownFields.has(key)) {
      issues.push({ level: "info", field: key, message: `Unknown field '${key}' — may be ignored` });
    }
  }

  // Check format
  if (config["format"] !== undefined) {
    const validFormats = ["text", "json", "sarif", "markdown", "html", "pdf", "junit", "codeclimate", "github-actions"];
    if (!validFormats.includes(String(config["format"]))) {
      issues.push({
        level: "warning",
        field: "format",
        message: `Unknown format '${config["format"]}'. Valid: ${validFormats.join(", ")}`,
      });
    }
  }

  // Check minScore
  if (config["minScore"] !== undefined) {
    const score = Number(config["minScore"]);
    if (isNaN(score) || score < 0 || score > 100) {
      issues.push({ level: "error", field: "minScore", message: "Must be a number between 0 and 100" });
    }
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runConfigLint(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges config-lint — Lint and validate .judgesrc configuration

Usage:
  judges config-lint                           Lint .judgesrc in current dir
  judges config-lint --file custom.judgesrc    Lint specific file
  judges config-lint --strict                  Treat warnings as errors
  judges config-lint --format json             JSON output

Options:
  --file <path>         Configuration file to lint (default: .judgesrc)
  --strict              Treat warnings as errors
  --format json         JSON output
  --help, -h            Show this help

Validates configuration for correctness: preset names,
severity levels, field types, and unknown properties.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const configFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || ".judgesrc";
  const strict = argv.includes("--strict");

  if (!existsSync(configFile)) {
    console.error(`Error: Configuration file not found: ${configFile}`);
    process.exitCode = 1;
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configFile, "utf-8")) as Record<string, unknown>;
  } catch (e) {
    console.error(`Error: Invalid JSON in ${configFile}: ${e instanceof Error ? e.message : "parse error"}`);
    process.exitCode = 1;
    return;
  }

  const issues: LintIssue[] = [];
  lintConfig(config, issues);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const infos = issues.filter((i) => i.level === "info");

  const hasErrors = errors.length > 0 || (strict && warnings.length > 0);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          file: configFile,
          valid: !hasErrors,
          errors: errors.length,
          warnings: warnings.length,
          infos: infos.length,
          issues,
        },
        null,
        2,
      ),
    );
    if (hasErrors) process.exitCode = 1;
    return;
  }

  console.log(`\n  Config Lint: ${configFile}\n  ─────────────────────────────`);

  if (issues.length === 0) {
    console.log("    ✅ Configuration is valid. No issues found.");
    console.log();
    return;
  }

  for (const issue of issues) {
    const icon = issue.level === "error" ? "❌" : issue.level === "warning" ? "⚠️" : "ℹ️";
    console.log(`    ${icon} [${issue.level.toUpperCase()}] ${issue.field}: ${issue.message}`);
  }

  console.log();
  console.log(`    Errors: ${errors.length}, Warnings: ${warnings.length}, Info: ${infos.length}`);

  if (hasErrors) {
    console.log("    ❌ Configuration has errors.");
    process.exitCode = 1;
  } else {
    console.log("    ✅ Configuration is valid (with warnings).");
  }

  console.log();
}
