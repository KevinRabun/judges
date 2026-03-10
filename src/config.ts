// ─── Configuration Module ────────────────────────────────────────────────────
// Loads and validates .judgesrc / .judgesrc.json project configuration.
// Supports cascading config: child directories override parent settings.
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import type { JudgesConfig, Severity, JudgeDefinition } from "./types.js";
import type { JudgesPlugin } from "./plugins.js";
import { registerPlugin } from "./plugins.js";
import { ConfigError } from "./errors.js";
import { normalizeLanguage } from "./language-patterns.js";

const VALID_SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low", "info"]);
const VALID_FORMATS = new Set(["text", "json", "sarif", "markdown", "html", "junit", "codeclimate"]);

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

  // extends
  if (obj.extends !== undefined) {
    if (typeof obj.extends === "string") {
      config.extends = obj.extends;
    } else if (Array.isArray(obj.extends) && obj.extends.every((e: unknown) => typeof e === "string")) {
      config.extends = obj.extends as string[];
    } else {
      throw new ConfigError('Invalid .judgesrc: "extends" must be a string or array of strings');
    }
  }

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

  // exclude
  if (obj.exclude !== undefined) {
    if (!Array.isArray(obj.exclude) || !obj.exclude.every((e: unknown) => typeof e === "string")) {
      throw new ConfigError('Invalid .judgesrc: "exclude" must be an array of strings');
    }
    config.exclude = obj.exclude as string[];
  }

  // include
  if (obj.include !== undefined) {
    if (!Array.isArray(obj.include) || !obj.include.every((e: unknown) => typeof e === "string")) {
      throw new ConfigError('Invalid .judgesrc: "include" must be an array of strings');
    }
    config.include = obj.include as string[];
  }

  // maxFiles
  if (obj.maxFiles !== undefined) {
    if (typeof obj.maxFiles !== "number" || !Number.isInteger(obj.maxFiles) || obj.maxFiles < 1) {
      throw new ConfigError('Invalid .judgesrc: "maxFiles" must be an integer >= 1');
    }
    config.maxFiles = obj.maxFiles;
  }

  // preset
  if (obj.preset !== undefined) {
    if (typeof obj.preset !== "string") {
      throw new ConfigError('Invalid .judgesrc: "preset" must be a string');
    }
    config.preset = obj.preset;
  }

  // failOnFindings
  if (obj.failOnFindings !== undefined) {
    if (typeof obj.failOnFindings !== "boolean") {
      throw new ConfigError('Invalid .judgesrc: "failOnFindings" must be a boolean');
    }
    config.failOnFindings = obj.failOnFindings;
  }

  // baseline
  if (obj.baseline !== undefined) {
    if (typeof obj.baseline !== "string") {
      throw new ConfigError('Invalid .judgesrc: "baseline" must be a string (file path)');
    }
    config.baseline = obj.baseline;
  }

  // format
  if (obj.format !== undefined) {
    if (typeof obj.format !== "string" || !VALID_FORMATS.has(obj.format)) {
      throw new ConfigError(
        'Invalid .judgesrc: "format" must be one of text, json, sarif, markdown, html, junit, codeclimate',
      );
    }
    config.format = obj.format as JudgesConfig["format"];
  }

  // plugins
  if (obj.plugins !== undefined) {
    if (!Array.isArray(obj.plugins) || !obj.plugins.every((p: unknown) => typeof p === "string")) {
      throw new ConfigError('Invalid .judgesrc: "plugins" must be an array of strings (module specifiers)');
    }
    config.plugins = obj.plugins as string[];
  }

  // failOnScoreBelow
  if (obj.failOnScoreBelow !== undefined) {
    if (typeof obj.failOnScoreBelow !== "number" || obj.failOnScoreBelow < 0 || obj.failOnScoreBelow > 10) {
      throw new ConfigError('Invalid .judgesrc: "failOnScoreBelow" must be a number between 0 and 10');
    }
    config.failOnScoreBelow = obj.failOnScoreBelow;
  }

  // judgeWeights
  if (obj.judgeWeights !== undefined) {
    if (typeof obj.judgeWeights !== "object" || obj.judgeWeights === null || Array.isArray(obj.judgeWeights)) {
      throw new ConfigError('Invalid .judgesrc: "judgeWeights" must be an object mapping judge IDs to numbers');
    }
    const weights: Record<string, number> = {};
    for (const [key, val] of Object.entries(obj.judgeWeights as Record<string, unknown>)) {
      if (typeof val !== "number" || val < 0) {
        throw new ConfigError(`Invalid .judgesrc: judgeWeights["${key}"] must be a non-negative number`);
      }
      weights[key] = val;
    }
    config.judgeWeights = weights;
  }

  // overrides
  if (obj.overrides !== undefined) {
    if (!Array.isArray(obj.overrides)) {
      throw new ConfigError('Invalid .judgesrc: "overrides" must be an array of override objects');
    }
    const parsedOverrides: JudgesConfig["overrides"] = [];
    for (let i = 0; i < obj.overrides.length; i++) {
      const entry = obj.overrides[i] as Record<string, unknown>;
      if (typeof entry !== "object" || entry === null || typeof entry.files !== "string") {
        throw new ConfigError(`Invalid .judgesrc: overrides[${i}] must have a "files" glob string`);
      }
      // Clone the entry, strip 'files', parse the rest as partial config
      const { files, ...rest } = entry;
      let partial: JudgesConfig = {};
      if (Object.keys(rest).length > 0) {
        try {
          partial = parseConfig(JSON.stringify(rest));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new ConfigError(`Invalid .judgesrc: overrides[${i}]: ${msg}`);
        }
      }
      parsedOverrides.push({ files: files as string, ...partial });
    }
    config.overrides = parsedOverrides;
  }

  // languageProfiles
  if (obj.languageProfiles !== undefined) {
    if (
      typeof obj.languageProfiles !== "object" ||
      obj.languageProfiles === null ||
      Array.isArray(obj.languageProfiles)
    ) {
      throw new ConfigError(
        'Invalid .judgesrc: "languageProfiles" must be an object mapping language names to config overrides',
      );
    }
    const profiles: JudgesConfig["languageProfiles"] = {};
    for (const [lang, val] of Object.entries(obj.languageProfiles as Record<string, unknown>)) {
      if (typeof val !== "object" || val === null) {
        throw new ConfigError(`Invalid .judgesrc: languageProfiles["${lang}"] must be an object`);
      }
      try {
        const partial = parseConfig(JSON.stringify(val));
        (profiles as Record<string, JudgesConfig>)[lang] = partial;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new ConfigError(`Invalid .judgesrc: languageProfiles["${lang}"]: ${msg}`);
      }
    }
    config.languageProfiles = profiles;
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
          let cfg = parseConfig(readFileSync(p, "utf-8"));
          // Resolve extends relative to the config file's directory
          cfg = resolveExtendsConfig(cfg, current);
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
 * Arrays (disabledRules, disabledJudges, languages, exclude, include, plugins) are
 * concatenated (union). Scalars (minSeverity, maxFiles, preset, failOnFindings,
 * baseline, format) use the leaf value.
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
    if (cfg.plugins) {
      merged.plugins = [...new Set([...(merged.plugins ?? []), ...cfg.plugins])];
    }

    // Scalars: leaf wins
    if (cfg.minSeverity !== undefined) merged.minSeverity = cfg.minSeverity;
    if (cfg.maxFiles !== undefined) merged.maxFiles = cfg.maxFiles;
    if (cfg.preset !== undefined) merged.preset = cfg.preset;
    if (cfg.failOnFindings !== undefined) merged.failOnFindings = cfg.failOnFindings;
    if (cfg.baseline !== undefined) merged.baseline = cfg.baseline;
    if (cfg.format !== undefined) merged.format = cfg.format;
    if (cfg.failOnScoreBelow !== undefined) merged.failOnScoreBelow = cfg.failOnScoreBelow;

    // Deep-merge ruleOverrides
    if (cfg.ruleOverrides) {
      merged.ruleOverrides = { ...(merged.ruleOverrides ?? {}), ...cfg.ruleOverrides };
    }

    // Deep-merge judgeWeights
    if (cfg.judgeWeights) {
      merged.judgeWeights = { ...(merged.judgeWeights ?? {}), ...cfg.judgeWeights };
    }

    // Overrides: concatenate (later entries take precedence naturally)
    if (cfg.overrides) {
      merged.overrides = [...(merged.overrides ?? []), ...cfg.overrides];
    }
  }

  return merged;
}

/**
 * Resolve `extends` references in a config. Each value in `extends` is treated
 * as a file path (relative to `baseDir`). The referenced configs are loaded
 * and merged (left-to-right), then the current config is applied on top.
 *
 * Circular extends are detected and rejected with a ConfigError.
 *
 * @param config - The config to resolve
 * @param baseDir - Directory for resolving relative extends paths
 * @param seen - Set of already-resolved paths (for cycle detection)
 * @returns The fully resolved and merged config
 */
export function resolveExtendsConfig(
  config: JudgesConfig,
  baseDir: string,
  seen: Set<string> = new Set(),
): JudgesConfig {
  if (!config.extends) return config;

  const extendsList = Array.isArray(config.extends) ? config.extends : [config.extends];
  const baseConfigs: JudgesConfig[] = [];

  for (const ext of extendsList) {
    const resolvedPath = resolve(baseDir, ext);
    if (seen.has(resolvedPath)) {
      throw new ConfigError(`Circular extends detected: ${resolvedPath}`);
    }
    if (!existsSync(resolvedPath)) {
      throw new ConfigError(`Extended config not found: ${resolvedPath}`);
    }
    seen.add(resolvedPath);

    try {
      const content = readFileSync(resolvedPath, "utf-8");
      let parentConfig = parseConfig(content);
      // Recursively resolve the parent's extends (with cycle detection)
      parentConfig = resolveExtendsConfig(parentConfig, dirname(resolvedPath), seen);
      baseConfigs.push(parentConfig);
    } catch (e) {
      if (e instanceof ConfigError) throw e;
      throw new ConfigError(
        `Failed to load extended config ${resolvedPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Merge: bases first (left-to-right), then current config on top
  const { extends: _ext, ...currentWithoutExtends } = config;
  return mergeConfigs(...baseConfigs, currentWithoutExtends);
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

// ─── Plugin Loading ─────────────────────────────────────────────────────────

/**
 * Validate that a value looks like a JudgeDefinition.
 * Checks required string fields (id, name, domain, description, systemPrompt,
 * rulePrefix) and an optional analyze function.
 */
export function isValidJudgeDefinition(val: unknown): val is JudgeDefinition {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.domain === "string" &&
    typeof obj.description === "string" &&
    typeof obj.systemPrompt === "string" &&
    typeof obj.rulePrefix === "string" &&
    (obj.analyze === undefined || typeof obj.analyze === "function")
  );
}

/**
 * Validate that a value looks like a JudgesPlugin.
 */
function isValidPlugin(val: unknown): val is JudgesPlugin {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.version === "string";
}

/**
 * Load and register plugins from module specifiers declared in config.
 *
 * Each plugin is a module specifier (npm package name or relative/absolute
 * file path) that must export one of:
 *   - `default: JudgesPlugin`       — a full plugin object (name, version, judges, rules, hooks)
 *   - `plugin: JudgesPlugin`        — named export
 *   - `judges: JudgeDefinition[]`   — an array of judge definitions (auto-wrapped)
 *   - `default: JudgeDefinition[]`  — default export as an array (auto-wrapped)
 *
 * Plugins that export a full JudgesPlugin object are registered via
 * registerPlugin() to enable hooks, custom rules, and full lifecycle.
 * Simple judge arrays are wrapped into a minimal plugin automatically.
 *
 * @param pluginSpecifiers - Array of module specifiers from config.plugins
 * @param baseDir - Base directory for resolving relative paths
 * @param logError - Optional error logger (defaults to console.error)
 * @returns Array of plugin judge definitions that were loaded
 */
export async function loadPluginJudges(
  pluginSpecifiers: string[],
  baseDir?: string,
  logError: (msg: string) => void = console.error,
): Promise<JudgeDefinition[]> {
  const loaded: JudgeDefinition[] = [];

  for (const specifier of pluginSpecifiers) {
    try {
      // Resolve relative paths against baseDir
      const resolvedSpec =
        specifier.startsWith(".") || specifier.startsWith("/")
          ? resolve(baseDir ?? process.cwd(), specifier)
          : specifier;

      // Dynamic import the module
      const mod = (await import(resolvedSpec)) as Record<string, unknown>;

      // Strategy 1: Full JudgesPlugin export (best — gets hooks, rules, etc.)
      const pluginObj = isValidPlugin(mod.default) ? mod.default : isValidPlugin(mod.plugin) ? mod.plugin : null;
      if (pluginObj) {
        const reg = registerPlugin(pluginObj);
        if (pluginObj.judges) {
          loaded.push(...pluginObj.judges);
        }
        if (!reg.rulesRegistered && !reg.judgesRegistered) {
          logError(`Plugin "${specifier}": registered but has no rules or judges`);
        }
        continue;
      }

      // Strategy 2: Bare JudgeDefinition array — wrap into a minimal plugin
      let candidates: unknown[] = [];
      if (Array.isArray(mod.judges)) {
        candidates = mod.judges;
      } else if (Array.isArray(mod.default)) {
        candidates = mod.default;
      }

      const validJudges = candidates.filter(isValidJudgeDefinition);
      if (validJudges.length > 0) {
        registerPlugin({
          name: specifier,
          version: "0.0.0",
          judges: validJudges,
        });
        loaded.push(...validJudges);
        continue;
      }

      logError(
        `Plugin "${specifier}": no valid plugin or judge definitions found. ` +
          `Export a JudgesPlugin object or an array of JudgeDefinition objects.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Plugin "${specifier}": failed to load — ${msg}`);
    }
  }

  return loaded;
}

/**
 * Synchronously validate plugin specifiers without loading them.
 * Returns an array of validation error messages (empty if all valid).
 */
export function validatePluginSpecifiers(specifiers: string[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const spec of specifiers) {
    if (typeof spec !== "string" || spec.trim().length === 0) {
      errors.push(`Invalid plugin specifier: must be a non-empty string`);
      continue;
    }
    if (seen.has(spec)) {
      errors.push(`Duplicate plugin specifier: "${spec}"`);
    }
    seen.add(spec);
  }

  return errors;
}

// ─── Per-File Config Overrides ──────────────────────────────────────────────

/**
 * Apply path-scoped overrides to a base config for a specific file.
 *
 * Each override entry carries a glob `files` pattern (e.g. `"**\/*.test.ts"`).
 * If the file path matches, the override's partial config is merged on top
 * of the base config. Multiple matching overrides are applied in order.
 *
 * @param config  - The resolved base config
 * @param filePath - The relative file path to match against override globs
 * @returns A new config with matching overrides applied
 */
export function applyOverridesForFile(config: JudgesConfig, filePath: string): JudgesConfig {
  if (!config.overrides || config.overrides.length === 0) {
    return config;
  }

  // Normalize path separators for glob matching
  const normalized = filePath.replace(/\\/g, "/");

  const matchingOverrides: JudgesConfig[] = [];
  for (const override of config.overrides) {
    if (globMatch(normalized, override.files)) {
      // Extract config fields (everything except 'files')
      const { files: _files, ...partial } = override;
      matchingOverrides.push(partial as JudgesConfig);
    }
  }

  if (matchingOverrides.length === 0) {
    return config;
  }

  // Merge: base config first, then matching overrides in order
  const { overrides: _overrides, ...baseWithoutOverrides } = config;
  return mergeConfigs(baseWithoutOverrides, ...matchingOverrides);
}

/**
 * Simple glob matcher supporting `*`, `**`, and `?`.
 * - `*` matches any characters except `/`
 * - `**` matches any characters including `/` (directory recursion)
 * - `?` matches exactly one character except `/`
 */
function globMatch(path: string, pattern: string): boolean {
  // Escape regex special chars except *, ?, and /
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // ** — match anything including path separators
        regex += ".*";
        i++; // skip second *
        // Skip optional trailing /
        if (pattern[i + 1] === "/") i++;
      } else {
        // * — match anything except /
        regex += "[^/]*";
      }
    } else if (ch === "?") {
      regex += "[^/]";
    } else if (".+^${}()|[]\\".includes(ch)) {
      regex += "\\" + ch;
    } else {
      regex += ch;
    }
  }

  return new RegExp("^" + regex + "$", "i").test(path);
}

// ─── Language Profile Application ────────────────────────────────────────────

/**
 * Apply language-specific config overrides from languageProfiles.
 * The language string is normalised to a LangFamily before lookup.
 *
 * @param config   - Base config (may include languageProfiles)
 * @param language - The detected language (e.g. "typescript", "python")
 * @returns A new config with the matching language profile merged on top
 */
export function applyLanguageProfile(config: JudgesConfig, language: string): JudgesConfig {
  if (!config.languageProfiles) return config;

  const normalised = normalizeLanguage(language);
  const profile = (config.languageProfiles as Record<string, JudgesConfig>)[normalised];
  if (!profile) return config;

  const { languageProfiles: _lp, ...baseWithoutProfiles } = config;
  return mergeConfigs(baseWithoutProfiles, profile);
}
