/**
 * Setup-wizard — Interactive guided setup for new users and teams.
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SetupProfile {
  preset: string;
  ciSystem: string;
  languages: string[];
  strictness: string;
  features: string[];
}

// ─── Presets ────────────────────────────────────────────────────────────────

const SETUP_PRESETS: Record<string, { description: string; config: Record<string, unknown> }> = {
  "quick-start": {
    description: "Minimal setup — evaluate files with sensible defaults",
    config: { preset: "lenient", format: "text" },
  },
  "security-first": {
    description: "Focus on security findings — strict severity thresholds",
    config: { preset: "security-only", minSeverity: "medium", failOnFindings: true },
  },
  "ci-integration": {
    description: "Optimized for CI/CD pipelines — JSON output, quality gates",
    config: { preset: "strict", format: "sarif", failOnFindings: true, minScore: 70 },
  },
  "team-review": {
    description: "Team-oriented — shared config, audit logging, PR summaries",
    config: { preset: "strict", format: "markdown" },
  },
  compliance: {
    description: "Compliance-focused — full audit trail, evidence collection",
    config: { preset: "compliance", format: "sarif" },
  },
};

// ─── CI Templates ───────────────────────────────────────────────────────────

function generateGitHubActions(profile: SetupProfile): string {
  return `name: Judges Code Review
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @kevinrabun/judges-cli eval . --preset ${profile.preset} --format sarif --fail-on-findings
`;
}

function generateGitLabCI(profile: SetupProfile): string {
  return `judges-review:
  image: node:20
  script:
    - npx @kevinrabun/judges-cli eval . --preset ${profile.preset} --format sarif --fail-on-findings
  only:
    - merge_requests
    - main
`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSetupWizard(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges setup-wizard — Guided setup for new users

Usage:
  judges setup-wizard                            Interactive setup
  judges setup-wizard --profile quick-start      Use preset profile
  judges setup-wizard --list-profiles            List available profiles
  judges setup-wizard --generate-ci github-actions  Generate CI config
  judges setup-wizard --init                     Create .judgesrc and CI config

Profiles:
  quick-start       Minimal setup with sensible defaults
  security-first    Security-focused with strict thresholds
  ci-integration    Optimized for CI/CD pipelines
  team-review       Team-oriented with shared config
  compliance        Full compliance with audit trails

Options:
  --profile <name>       Select a setup profile
  --list-profiles        List all available profiles
  --generate-ci <type>   Generate CI config (github-actions, gitlab-ci)
  --init                 Write configuration files
  --output <dir>         Output directory (default: current)
  --format json          JSON output
  --help, -h             Show this help

Generates .judgesrc configuration and CI workflow files
based on your team's needs. All data stays local.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (argv.includes("--list-profiles")) {
    if (format === "json") {
      console.log(JSON.stringify(SETUP_PRESETS, null, 2));
      return;
    }
    console.log("\n  Setup Profiles\n  ═════════════════════════════");
    for (const [name, info] of Object.entries(SETUP_PRESETS)) {
      console.log(`    ${name.padEnd(20)} ${info.description}`);
    }
    console.log();
    return;
  }

  const profileName = argv.find((_a: string, i: number) => argv[i - 1] === "--profile") || "quick-start";
  const ciType = argv.find((_a: string, i: number) => argv[i - 1] === "--generate-ci");
  const outputDir = argv.find((_a: string, i: number) => argv[i - 1] === "--output") || ".";
  const doInit = argv.includes("--init");

  const preset = SETUP_PRESETS[profileName];
  if (!preset) {
    console.error(`Error: Unknown profile '${profileName}'. Use --list-profiles to see options.`);
    process.exitCode = 1;
    return;
  }

  const profile: SetupProfile = {
    preset: profileName,
    ciSystem: ciType || "github-actions",
    languages: [],
    strictness: profileName === "security-first" || profileName === "compliance" ? "strict" : "moderate",
    features: [],
  };

  if (ciType) {
    const ciConfig = ciType === "gitlab-ci" ? generateGitLabCI(profile) : generateGitHubActions(profile);
    console.log(ciConfig);
    return;
  }

  if (doInit) {
    // Write .judgesrc
    const rcPath = join(outputDir, ".judgesrc");
    if (!existsSync(rcPath)) {
      writeFileSync(rcPath, JSON.stringify(preset.config, null, 2), "utf-8");
      console.log(`Created ${rcPath}`);
    } else {
      console.log(`${rcPath} already exists, skipping.`);
    }

    // Write CI config
    const ciDir = join(outputDir, ".github", "workflows");
    const ciPath = join(ciDir, "judges-review.yml");
    if (!existsSync(ciPath)) {
      mkdirSync(dirname(ciPath), { recursive: true });
      writeFileSync(ciPath, generateGitHubActions(profile), "utf-8");
      console.log(`Created ${ciPath}`);
    } else {
      console.log(`${ciPath} already exists, skipping.`);
    }

    console.log("\nSetup complete! Next steps:");
    console.log("  1. Run: npx @kevinrabun/judges-cli eval <file>");
    console.log("  2. Customize .judgesrc for your needs");
    console.log("  3. Commit the CI workflow for automated reviews");
    return;
  }

  // Show setup summary
  if (format === "json") {
    console.log(JSON.stringify({ profile: profileName, ...preset }, null, 2));
    return;
  }

  console.log(`\n  Setup Wizard — ${profileName}\n  ═════════════════════════════`);
  console.log(`    Profile: ${profileName}`);
  console.log(`    Description: ${preset.description}`);
  console.log(`    Configuration:`);
  for (const [key, value] of Object.entries(preset.config)) {
    console.log(`      ${key}: ${value}`);
  }
  console.log();
  console.log("  To apply this configuration:");
  console.log(`    judges setup-wizard --profile ${profileName} --init`);
  console.log();
  console.log("  To generate CI config:");
  console.log(`    judges setup-wizard --profile ${profileName} --generate-ci github-actions`);
  console.log();
}
