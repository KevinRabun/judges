/**
 * Team-config — Team-level shared configuration management.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamConfig {
  version: string;
  team: string;
  preset: string;
  enabledJudges: string[];
  disabledRules: string[];
  severityOverrides: Record<string, string>;
  customPatterns: { name: string; pattern: string; severity: string; message: string }[];
  ignorePatterns: string[];
  reviewGate: {
    maxCritical: number;
    maxHigh: number;
    maxTotal: number;
    blockOnSecurity: boolean;
  };
  formatting: {
    defaultFormat: string;
    includeRecommendations: boolean;
    includeEvidence: boolean;
  };
}

// ─── Default config ────────────────────────────────────────────────────────

function defaultTeamConfig(): TeamConfig {
  return {
    version: "1.0.0",
    team: "default",
    preset: "recommended",
    enabledJudges: [
      "data-security",
      "cybersecurity",
      "authentication",
      "database",
      "reliability",
      "performance",
      "maintainability",
      "documentation",
      "testing",
      "error-handling",
    ],
    disabledRules: [],
    severityOverrides: {},
    customPatterns: [],
    ignorePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/fixtures/**"],
    reviewGate: {
      maxCritical: 0,
      maxHigh: 5,
      maxTotal: 25,
      blockOnSecurity: true,
    },
    formatting: {
      defaultFormat: "text",
      includeRecommendations: true,
      includeEvidence: true,
    },
  };
}

// ─── Validation ────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

function validateConfig(config: TeamConfig): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!config.version) issues.push("Missing version");
  if (!config.team) issues.push("Missing team name");
  if (!config.enabledJudges || config.enabledJudges.length === 0) {
    warnings.push("No judges enabled — all judges will be used");
  }

  const validPresets = new Set(["strict", "recommended", "lenient", "security-only", "quality-only"]);
  if (config.preset && !validPresets.has(config.preset)) {
    warnings.push(`Unknown preset '${config.preset}' — using 'recommended' defaults`);
  }

  if (config.reviewGate) {
    if (config.reviewGate.maxCritical < 0) issues.push("maxCritical cannot be negative");
    if (config.reviewGate.maxHigh < 0) issues.push("maxHigh cannot be negative");
    if (config.reviewGate.maxTotal < 0) issues.push("maxTotal cannot be negative");
  }

  for (const cp of config.customPatterns || []) {
    if (!cp.name) issues.push("Custom pattern missing name");
    if (!cp.pattern) issues.push(`Custom pattern '${cp.name}' missing regex pattern`);
    try {
      new RegExp(cp.pattern);
    } catch {
      issues.push(`Custom pattern '${cp.name}' has invalid regex: ${cp.pattern}`);
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}

// ─── Config merging ────────────────────────────────────────────────────────

function mergeConfigs(base: TeamConfig, override: Partial<TeamConfig>): TeamConfig {
  return {
    ...base,
    ...override,
    reviewGate: { ...base.reviewGate, ...(override.reviewGate || {}) },
    formatting: { ...base.formatting, ...(override.formatting || {}) },
    enabledJudges: override.enabledJudges || base.enabledJudges,
    disabledRules: [...(base.disabledRules || []), ...(override.disabledRules || [])],
    ignorePatterns: override.ignorePatterns || base.ignorePatterns,
    severityOverrides: { ...(base.severityOverrides || {}), ...(override.severityOverrides || {}) },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTeamConfig(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges team-config — Team-level shared configuration

Usage:
  judges team-config init                   Create team-config.json template
  judges team-config show                   Show current configuration
  judges team-config validate               Validate configuration
  judges team-config merge --base base.json --override local.json
  judges team-config --format json          JSON output

Subcommands:
  init                 Create a team-config.json template
  show                 Display current configuration
  validate             Validate configuration file
  merge                Merge base config with local overrides

Options:
  --config <path>      Config file path (default: team-config.json)
  --base <path>        Base config for merge
  --override <path>    Override config for merge
  --format json        JSON output
  --help, -h           Show this help

Team config defines shared review settings: enabled judges, severity
overrides, review gate thresholds, and formatting preferences. Commit
to your repository to share across the team.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const configPath = argv.find((_a: string, i: number) => argv[i - 1] === "--config") || "team-config.json";
  const subcommand =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        a !== "team-config" &&
        argv[argv.indexOf(a) - 1] !== "--config" &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--base" &&
        argv[argv.indexOf(a) - 1] !== "--override",
    ) || "show";

  if (subcommand === "init") {
    if (existsSync(configPath)) {
      console.error(`Error: ${configPath} already exists.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(configPath, JSON.stringify(defaultTeamConfig(), null, 2), "utf-8");
    console.log(`Created ${configPath}. Edit and commit to share with your team.`);
    return;
  }

  if (subcommand === "merge") {
    const basePath = argv.find((_a: string, i: number) => argv[i - 1] === "--base");
    const overridePath = argv.find((_a: string, i: number) => argv[i - 1] === "--override");

    if (!basePath || !overridePath) {
      console.error("Error: Both --base and --override paths are required.");
      process.exitCode = 1;
      return;
    }

    try {
      const base = JSON.parse(readFileSync(basePath, "utf-8")) as TeamConfig;
      const override = JSON.parse(readFileSync(overridePath, "utf-8")) as Partial<TeamConfig>;
      const merged = mergeConfigs(base, override);

      if (format === "json") {
        console.log(JSON.stringify(merged, null, 2));
      } else {
        console.log("Merged configuration:");
        console.log(JSON.stringify(merged, null, 2));
      }
    } catch {
      console.error("Error: Cannot read or parse config files.");
      process.exitCode = 1;
    }
    return;
  }

  // Load config
  let config: TeamConfig;
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as TeamConfig;
    } catch {
      console.error(`Error: ${configPath} is not valid JSON.`);
      process.exitCode = 1;
      return;
    }
  } else {
    config = defaultTeamConfig();
  }

  if (subcommand === "validate") {
    const result = validateConfig(config);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
      return;
    }

    const icon = result.valid ? "✅" : "❌";
    console.log(
      `\n  Config Validation: ${icon} ${result.valid ? "VALID" : "INVALID"}\n  ─────────────────────────────`,
    );

    if (result.issues.length > 0) {
      console.log(`\n    Issues (${result.issues.length}):`);
      for (const issue of result.issues) console.log(`      ❌ ${issue}`);
    }
    if (result.warnings.length > 0) {
      console.log(`\n    Warnings (${result.warnings.length}):`);
      for (const w of result.warnings) console.log(`      ⚠️  ${w}`);
    }
    if (result.valid && result.warnings.length === 0) console.log("    No issues found.");
    console.log();
    if (!result.valid) process.exitCode = 1;
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`\n  Team Configuration\n  ─────────────────────────────`);
  console.log(`    Team: ${config.team}`);
  console.log(`    Preset: ${config.preset}`);
  console.log(`    Source: ${existsSync(configPath) ? configPath : "defaults"}`);

  console.log(`\n    Enabled Judges (${config.enabledJudges.length}):`);
  for (const j of config.enabledJudges) console.log(`      ✅ ${j}`);

  if (config.disabledRules.length > 0) {
    console.log(`\n    Disabled Rules (${config.disabledRules.length}):`);
    for (const r of config.disabledRules) console.log(`      ⬜ ${r}`);
  }

  console.log("\n    Review Gate:");
  console.log(`      Max critical: ${config.reviewGate.maxCritical}`);
  console.log(`      Max high: ${config.reviewGate.maxHigh}`);
  console.log(`      Max total: ${config.reviewGate.maxTotal}`);
  console.log(`      Block on security: ${config.reviewGate.blockOnSecurity}`);

  console.log("\n    Formatting:");
  console.log(`      Default format: ${config.formatting.defaultFormat}`);
  console.log(`      Include recommendations: ${config.formatting.includeRecommendations}`);
  console.log(`      Include evidence: ${config.formatting.includeEvidence}`);

  console.log();
}
