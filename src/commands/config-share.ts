/**
 * Team Config — Shareable team/org configuration
 *
 * Generate and manage shareable configuration files that teams can
 * distribute via npm packages, git repositories, or URLs.
 *
 * Usage:
 *   judges config export            Export current config as shareable package
 *   judges config import <source>   Import a shared config
 *   judges config merge <file>      Merge configs together
 *   judges config pull <url>        Pull config from a remote URL
 *   judges config lock              Lock current config as org policy baseline
 *   judges config validate          Validate config against policy lock
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

    case "pull": {
      if (!source) {
        console.error("Error: Specify a URL to pull config from.");
        console.error("Usage: judges config pull <url>");
        process.exit(1);
      }
      pullRemoteConfig(source, ".")
        .then((tc) => {
          console.log(`\n  ✅ Pulled config "${tc.name}" from remote`);
          console.log(`  Config merged into .judgesrc`);
          console.log("");
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        });
      break;
    }

    case "lock": {
      const lock = writePolicyLock(".", source);
      console.log(`\n  ✅ Policy lock created: .judges-policy-lock.json`);
      if (lock.maxMinSeverity) {
        console.log(`  Max severity threshold: ${lock.maxMinSeverity}`);
      }
      console.log(`  Teams must comply with this policy baseline.`);
      console.log("");
      process.exit(0);
      break;
    }

    case "validate": {
      const lock = readPolicyLock(".");
      if (!lock) {
        console.error("Error: No .judges-policy-lock.json found. Run 'judges config lock' first.");
        process.exit(1);
      }
      const configPath = resolve(".judgesrc");
      const configJsonPath = resolve(".judgesrc.json");
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
      const result = validatePolicyCompliance(config, lock);
      if (result.valid) {
        console.log(`\n  ✅ Config complies with org policy.`);
        console.log("");
        process.exit(0);
      } else {
        console.error(`\n  ❌ Policy violations found:`);
        for (const v of result.violations) {
          console.error(`     • ${v}`);
        }
        console.error("");
        process.exit(1);
      }
      break;
    }

    default: {
      console.log(`
Judges Panel — Team Config Management

USAGE:
  judges config export [--output file]    Export shareable config
  judges config import <file>             Import a shared config
  judges config merge <file>              Merge config into existing .judgesrc
  judges config pull <url>                Pull config from remote URL
  judges config lock                      Lock current config as org policy
  judges config validate                  Validate config against policy lock
`);
      process.exit(0);
    }
  }
}

// ─── Policy Lock ─────────────────────────────────────────────────────────────
// A policy lock file (.judges-policy-lock.json) pins org-level policy
// requirements that project configs must comply with.
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyLock {
  /** Lock version for forward compatibility */
  version: string;
  /** When the lock was created */
  createdAt: string;
  /** Source URL the policy was pulled from (if any) */
  source?: string;
  /** Minimum judges version required */
  minJudgesVersion?: string;
  /** Judges that MUST be enabled (cannot appear in disabledJudges) */
  requiredJudges?: string[];
  /** Rules that MUST be enabled (cannot appear in disabledRules) */
  requiredRules?: string[];
  /** Maximum allowed minSeverity (e.g. "medium" means low/info not allowed) */
  maxMinSeverity?: string;
  /** The full org config to enforce as baseline */
  baselineConfig?: JudgesConfig;
}

export interface PolicyValidationResult {
  valid: boolean;
  violations: string[];
}

/**
 * Write a policy lock file from the current project config.
 */
export function writePolicyLock(projectDir: string = ".", source?: string): PolicyLock {
  const teamConfig = exportTeamConfig(projectDir);
  const lock: PolicyLock = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    source,
    baselineConfig: teamConfig.config,
  };

  // Infer required judges: any judge NOT in disabledJudges is required
  if (teamConfig.config.disabledJudges && teamConfig.config.disabledJudges.length > 0) {
    // We don't enforce specific judges — just record the baseline
  }

  // Infer required rules: any rule NOT in disabledRules is required
  if (teamConfig.config.disabledRules && teamConfig.config.disabledRules.length > 0) {
    lock.requiredRules = []; // All rules not in disabledRules are required
  }

  if (teamConfig.config.minSeverity) {
    lock.maxMinSeverity = teamConfig.config.minSeverity;
  }

  const lockPath = resolve(projectDir, ".judges-policy-lock.json");
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf-8");

  return lock;
}

/**
 * Read an existing policy lock file.
 */
export function readPolicyLock(projectDir: string = "."): PolicyLock | null {
  const lockPath = resolve(projectDir, ".judges-policy-lock.json");
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, "utf-8"));
  } catch {
    return null;
  }
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

/**
 * Validate a project config against an org policy lock.
 *
 * Checks that the config doesn't disable required judges/rules and
 * doesn't exceed the severity threshold.
 */
export function validatePolicyCompliance(config: JudgesConfig, lock: PolicyLock): PolicyValidationResult {
  const violations: string[] = [];

  // Check required judges
  if (lock.requiredJudges && config.disabledJudges) {
    for (const required of lock.requiredJudges) {
      if (config.disabledJudges.includes(required)) {
        violations.push(`Required judge "${required}" is disabled`);
      }
    }
  }

  // Check required rules
  if (lock.requiredRules && config.disabledRules) {
    for (const required of lock.requiredRules) {
      if (config.disabledRules.includes(required)) {
        violations.push(`Required rule "${required}" is disabled`);
      }
    }
  }

  // Check severity threshold
  if (lock.maxMinSeverity && config.minSeverity) {
    const lockIdx = SEVERITY_ORDER.indexOf(lock.maxMinSeverity);
    const configIdx = SEVERITY_ORDER.indexOf(config.minSeverity);
    if (configIdx > lockIdx) {
      violations.push(`minSeverity "${config.minSeverity}" exceeds policy maximum "${lock.maxMinSeverity}"`);
    }
  }

  // Check against baseline — if baseline has disabled judges/rules,
  // project cannot add NEW disabled judges/rules beyond what was locked
  if (lock.baselineConfig) {
    const baselineDisabledJudges = new Set(lock.baselineConfig.disabledJudges ?? []);
    if (config.disabledJudges) {
      for (const j of config.disabledJudges) {
        if (!baselineDisabledJudges.has(j)) {
          violations.push(`Judge "${j}" disabled in project but not in org policy baseline`);
        }
      }
    }

    const baselineDisabledRules = new Set(lock.baselineConfig.disabledRules ?? []);
    if (config.disabledRules) {
      for (const r of config.disabledRules) {
        if (!baselineDisabledRules.has(r)) {
          violations.push(`Rule "${r}" disabled in project but not in org policy baseline`);
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Pull a remote TeamConfig from a URL and import it locally.
 *
 * Supports HTTPS URLs pointing to JSON TeamConfig files. The pulled
 * config is merged into the local .judgesrc.
 */
export async function pullRemoteConfig(url: string, targetDir: string = "."): Promise<TeamConfig> {
  // Validate URL to prevent SSRF — only allow HTTPS
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Only HTTPS URLs are supported (got ${parsed.protocol})`);
  }

  // Block private/internal IP ranges
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    hostname === "[::1]"
  ) {
    throw new Error("URLs pointing to private/internal addresses are not allowed");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: HTTP ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  let teamConfig: TeamConfig;
  try {
    teamConfig = JSON.parse(text);
  } catch {
    throw new Error("Response is not valid JSON");
  }

  // Basic shape validation
  if (!teamConfig.version || !teamConfig.config) {
    throw new Error("Response is not a valid TeamConfig (missing version or config)");
  }

  // Merge into local config
  const targetPath = resolve(targetDir, ".judgesrc");
  if (existsSync(targetPath)) {
    const existing = JSON.parse(readFileSync(targetPath, "utf-8"));
    const merged = mergeConfigs(existing, teamConfig.config);
    writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  } else {
    writeFileSync(targetPath, JSON.stringify(teamConfig.config, null, 2) + "\n", "utf-8");
  }

  return teamConfig;
}
