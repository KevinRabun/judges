/**
 * Team Config — Shareable team/org configuration
 *
 * Generate and manage shareable configuration files that teams can
 * distribute via npm packages or git repositories.
 *
 * Usage:
 *   judges config export            Export current config as shareable package
 *   judges config import <source>   Import a shared config
 *   judges config merge <file>      Merge configs together
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import type { JudgesConfig, RuleOverride } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamConfig {
  /** Config format version */
  version: string;
  /** Config name for identification */
  name: string;
  /** Description */
  description?: string;
  /** Organization name */
  org?: string;
  /** Base Judges config */
  config: JudgesConfig;
  /** Named extensions (overrides) by team */
  extends?: string;
  /** Rule overrides by ID */
  ruleOverrides?: Record<string, RuleOverride>;
  /** Shared presets */
  presets?: Record<string, JudgesConfig>;
}

// ─── Config Merge ────────────────────────────────────────────────────────────

/**
 * Merge two JudgesConfig objects. Later values override earlier ones.
 */
export function mergeConfigs(base: JudgesConfig, overlay: JudgesConfig): JudgesConfig {
  const merged: JudgesConfig = { ...base };

  if (overlay.minSeverity) merged.minSeverity = overlay.minSeverity;

  // Merge disabled judges (union of both)
  if (overlay.disabledJudges) {
    const existing = new Set(merged.disabledJudges || []);
    for (const j of overlay.disabledJudges) existing.add(j);
    merged.disabledJudges = [...existing];
  }

  // Merge disabled rules (union of both)
  if (overlay.disabledRules) {
    const existing = new Set(merged.disabledRules || []);
    for (const r of overlay.disabledRules) existing.add(r);
    merged.disabledRules = [...existing];
  }

  // Merge languages (union of both)
  if (overlay.languages) {
    const existing = new Set(merged.languages || []);
    for (const l of overlay.languages) existing.add(l);
    merged.languages = [...existing];
  }

  // Merge rule overrides
  if (overlay.ruleOverrides) {
    merged.ruleOverrides = { ...(merged.ruleOverrides || {}), ...overlay.ruleOverrides };
  }

  return merged;
}

// ─── Export / Import ─────────────────────────────────────────────────────────

/**
 * Export current project config as a shareable TeamConfig.
 */
export function exportTeamConfig(projectDir: string = "."): TeamConfig {
  const configPath = resolve(projectDir, ".judgesrc");
  const configJsonPath = resolve(projectDir, ".judgesrc.json");

  let config: JudgesConfig = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      /* empty */
    }
  } else if (existsSync(configJsonPath)) {
    try {
      config = JSON.parse(readFileSync(configJsonPath, "utf-8"));
    } catch {
      /* empty */
    }
  }

  return {
    version: "1.0.0",
    name: basename(resolve(projectDir)),
    description: `Shared judges config from ${basename(resolve(projectDir))}`,
    config,
  };
}

/**
 * Import a TeamConfig and write it as .judgesrc.
 */
export function importTeamConfig(source: string, targetDir: string = "."): void {
  const sourcePath = resolve(source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Config source not found: ${sourcePath}`);
  }

  const teamConfig: TeamConfig = JSON.parse(readFileSync(sourcePath, "utf-8"));
  const targetPath = resolve(targetDir, ".judgesrc");

  // If existing config, merge
  if (existsSync(targetPath)) {
    const existing = JSON.parse(readFileSync(targetPath, "utf-8"));
    const merged = mergeConfigs(existing, teamConfig.config);
    writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(targetPath, JSON.stringify(teamConfig.config, null, 2) + "\n", "utf-8");
  }
}

// ─── CLI Handler ─────────────────────────────────────────────────────────────

export function parseConfigArgs(argv: string[]): {
  subcommand: string;
  source?: string;
  output?: string;
} {
  const subcommand = argv[3] || "export";
  let source: string | undefined;
  let output: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output" || arg === "-o") {
      output = argv[++i];
    } else if (!arg.startsWith("-") && !source) {
      source = arg;
    }
  }

  return { subcommand, source, output };
}

export function runConfig(argv: string[]): void {
  const { subcommand, source, output } = parseConfigArgs(argv);

  switch (subcommand) {
    case "export": {
      const teamConfig = exportTeamConfig(".");
      const outPath = output || ".judges-team-config.json";
      writeFileSync(resolve(outPath), JSON.stringify(teamConfig, null, 2) + "\n", "utf-8");
      console.log(`\n  ✅ Exported team config to ${outPath}`);
      console.log(`  Share this file with your team or publish as an npm package.`);
      console.log("");
      process.exit(0);
      break;
    }

    case "import": {
      if (!source) {
        console.error("Error: Specify a config file to import.");
        console.error("Usage: judges config import <file>");
        process.exit(1);
      }
      try {
        importTeamConfig(source, ".");
        console.log(`\n  ✅ Imported team config from ${source}`);
        console.log(`  Config merged into .judgesrc`);
        console.log("");
      } catch (err: unknown) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case "merge": {
      if (!source) {
        console.error("Error: Specify a config file to merge.");
        process.exit(1);
      }
      try {
        importTeamConfig(source, ".");
        console.log(`\n  ✅ Merged config from ${source} into .judgesrc`);
        console.log("");
      } catch (err: unknown) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    default: {
      console.log(`
Judges Panel — Team Config Management

USAGE:
  judges config export [--output file]    Export shareable config
  judges config import <file>             Import a shared config
  judges config merge <file>              Merge config into existing .judgesrc
`);
      process.exit(0);
    }
  }
}
