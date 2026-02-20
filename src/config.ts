// ─── Configuration Module ────────────────────────────────────────────────────
// Loads and validates .judgesrc / .judgesrc.json project configuration.
// ──────────────────────────────────────────────────────────────────────────────

import type { JudgesConfig, Severity } from "./types.js";

const VALID_SEVERITIES = new Set<Severity>(["critical", "high", "medium", "low", "info"]);

/**
 * Parse a JSON string into a JudgesConfig, with validation.
 */
export function parseConfig(jsonStr: string): JudgesConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error("Invalid .judgesrc: not valid JSON");
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid .judgesrc: root must be a JSON object");
  }

  const obj = raw as Record<string, unknown>;
  const config: JudgesConfig = {};

  // disabledRules
  if (obj.disabledRules !== undefined) {
    if (!Array.isArray(obj.disabledRules) || !obj.disabledRules.every((r: unknown) => typeof r === "string")) {
      throw new Error('Invalid .judgesrc: "disabledRules" must be an array of strings');
    }
    config.disabledRules = obj.disabledRules as string[];
  }

  // disabledJudges
  if (obj.disabledJudges !== undefined) {
    if (!Array.isArray(obj.disabledJudges) || !obj.disabledJudges.every((r: unknown) => typeof r === "string")) {
      throw new Error('Invalid .judgesrc: "disabledJudges" must be an array of strings');
    }
    config.disabledJudges = obj.disabledJudges as string[];
  }

  // minSeverity
  if (obj.minSeverity !== undefined) {
    if (typeof obj.minSeverity !== "string" || !VALID_SEVERITIES.has(obj.minSeverity as Severity)) {
      throw new Error('Invalid .judgesrc: "minSeverity" must be one of critical, high, medium, low, info');
    }
    config.minSeverity = obj.minSeverity as Severity;
  }

  // languages
  if (obj.languages !== undefined) {
    if (!Array.isArray(obj.languages) || !obj.languages.every((l: unknown) => typeof l === "string")) {
      throw new Error('Invalid .judgesrc: "languages" must be an array of strings');
    }
    config.languages = obj.languages as string[];
  }

  // ruleOverrides
  if (obj.ruleOverrides !== undefined) {
    if (typeof obj.ruleOverrides !== "object" || obj.ruleOverrides === null || Array.isArray(obj.ruleOverrides)) {
      throw new Error('Invalid .judgesrc: "ruleOverrides" must be an object');
    }
    const overrides: Record<string, { disabled?: boolean; severity?: Severity }> = {};
    for (const [key, val] of Object.entries(obj.ruleOverrides as Record<string, unknown>)) {
      if (typeof val !== "object" || val === null) {
        throw new Error(`Invalid .judgesrc: ruleOverrides["${key}"] must be an object`);
      }
      const entry = val as Record<string, unknown>;
      const override: { disabled?: boolean; severity?: Severity } = {};
      if (entry.disabled !== undefined) {
        override.disabled = Boolean(entry.disabled);
      }
      if (entry.severity !== undefined) {
        if (typeof entry.severity !== "string" || !VALID_SEVERITIES.has(entry.severity as Severity)) {
          throw new Error(`Invalid .judgesrc: ruleOverrides["${key}"].severity must be a valid severity`);
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
