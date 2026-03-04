// ─── Configuration Module ────────────────────────────────────────────────────
// Loads and validates .judgesrc / .judgesrc.json project configuration.
// Supports cascading config: child directories override parent settings.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import type { JudgesConfig, Severity } from "./types.js";
import { ConfigError } from "./errors.js";

const VALID_SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low", "info"]);

/**
 * Parse a JSON string into a JudgesConfig, with validation.
 */
export function parseConfig(jsonStr: string): JudgesConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new ConfigError("Invalid .judgesrc: not valid JSON");
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError("Invalid .judgesrc: root must be a JSON object");
  }

  const obj = raw as Record<string, unknown>;
  const config: JudgesConfig = {};

  // disabledRules
  if (obj.disabledRules !== undefined) {
    if (!Array.isArray(obj.disabledRules) || !obj.disabledRules.every((r: unknown) => typeof r === "string")) {
      throw new ConfigError('Invalid .judgesrc: "disabledRules" must be an array of strings');
    }
    config.disabledRules = obj.disabledRules as string[];
  }

  // disabledJudges
  if (obj.disabledJudges !== undefined) {
    if (!Array.isArray(obj.disabledJudges) || !obj.disabledJudges.every((r: unknown) => typeof r === "string")) {
      throw new ConfigError('Invalid .judgesrc: "disabledJudges" must be an array of strings');
    }
    config.disabledJudges = obj.disabledJudges as string[];
  }

  // minSeverity
  if (obj.minSeverity !== undefined) {
    if (typeof obj.minSeverity !== "string" || !VALID_SEVERITIES.has(obj.minSeverity as Severity)) {
      throw new ConfigError('Invalid .judgesrc: "minSeverity" must be one of critical, high, medium, low, info');
    }
    config.minSeverity = obj.minSeverity as Severity;
  }

  // languages
  if (obj.languages !== undefined) {
    if (!Array.isArray(obj.languages) || !obj.languages.every((l: unknown) => typeof l === "string")) {
      throw new ConfigError('Invalid .judgesrc: "languages" must be an array of strings');
    }
    config.languages = obj.languages as string[];
  }

  // ruleOverrides
  if (obj.ruleOverrides !== undefined) {
    if (typeof obj.ruleOverrides !== "object" || obj.ruleOverrides === null || Array.isArray(obj.ruleOverrides)) {
      throw new ConfigError('Invalid .judgesrc: "ruleOverrides" must be an object');
    }
    const overrides: Record<string, { disabled?: boolean; severity?: Severity }> = {};
    for (const [key, val] of Object.entries(obj.ruleOverrides as Record<string, unknown>)) {
      if (typeof val !== "object" || val === null) {
        throw new ConfigError(`Invalid .judgesrc: ruleOverrides["${key}"] must be an object`);
      }
      const entry = val as Record<string, unknown>;
      const override: { disabled?: boolean; severity?: Severity } = {};
      if (entry.disabled !== undefined) {
        override.disabled = Boolean(entry.disabled);
      }
      if (entry.severity !== undefined) {
        if (typeof entry.severity !== "string" || !VALID_SEVERITIES.has(entry.severity as Severity)) {
          throw new ConfigError(`Invalid .judgesrc: ruleOverrides["${key}"].severity must be a valid severity`);
        }
        override.severity = entry.severity as Severity;
      }
      overrides[key] = override;
    }
    config.ruleOverrides = overrides;
  }

  return config;
}

/**
 * Create a default (empty) configuration.
 */
export function defaultConfig(): JudgesConfig {
  return {};
}

// ─── Cascading Config ───────────────────────────────────────────────────────

/** Config file names to search for, in priority order. */
const CONFIG_NAMES = [".judgesrc", ".judgesrc.json"];

/**
 * Discover .judgesrc files by walking up from `startDir` to `rootDir`.
 * Returns configs from root → leaf order (leaf overrides root).
 */
export function discoverCascadingConfigs(startDir: string, rootDir?: string): JudgesConfig[] {
  const configs: Array<{ dir: string; config: JudgesConfig }> = [];
  let current = resolve(startDir);
  const stop = rootDir ? resolve(rootDir) : undefined;

  // Walk up the directory tree
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);

    for (const name of CONFIG_NAMES) {
      const p = join(current, name);
      if (existsSync(p)) {
        try {
          const cfg = parseConfig(readFileSync(p, "utf-8"));
          configs.push({ dir: current, config: cfg });
        } catch {
          // Skip invalid config files
        }
        break; // Only use the first matching file per directory
      }
    }

    if (stop && current === stop) break;
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  // Reverse so root comes first — leaf configs override root configs
  configs.reverse();
  return configs.map((c) => c.config);
}

/**
 * Merge multiple configs (root → leaf order). Later entries override earlier.
 * Arrays (disabledRules, disabledJudges, languages, exclude, include) are
 * concatenated (union). Scalars (minSeverity, maxFiles) use the leaf value.
 * ruleOverrides are deep-merged.
 */
export function mergeConfigs(...configs: JudgesConfig[]): JudgesConfig {
  const merged: JudgesConfig = {};

  for (const cfg of configs) {
    // Concatenate arrays (deduplicated)
    if (cfg.disabledRules) {
      merged.disabledRules = [...new Set([...(merged.disabledRules ?? []), ...cfg.disabledRules])];
    }
    if (cfg.disabledJudges) {
      merged.disabledJudges = [...new Set([...(merged.disabledJudges ?? []), ...cfg.disabledJudges])];
    }
    if (cfg.languages) {
      merged.languages = [...new Set([...(merged.languages ?? []), ...cfg.languages])];
    }
    if (cfg.exclude) {
      merged.exclude = [...new Set([...(merged.exclude ?? []), ...cfg.exclude])];
    }
    if (cfg.include) {
      merged.include = [...new Set([...(merged.include ?? []), ...cfg.include])];
    }

    // Scalars: leaf wins
    if (cfg.minSeverity !== undefined) merged.minSeverity = cfg.minSeverity;
    if (cfg.maxFiles !== undefined) merged.maxFiles = cfg.maxFiles;

    // Deep-merge ruleOverrides
    if (cfg.ruleOverrides) {
      merged.ruleOverrides = { ...(merged.ruleOverrides ?? {}), ...cfg.ruleOverrides };
    }
  }

  return merged;
}

/**
 * Load a cascading config for a specific file path.
 * Walks from the file's directory up to rootDir, merging all .judgesrc files.
 */
export function loadCascadingConfig(filePath: string, rootDir?: string): JudgesConfig {
  const dir = dirname(resolve(filePath));
  const configs = discoverCascadingConfigs(dir, rootDir);
  return configs.length > 0 ? mergeConfigs(...configs) : {};
}
