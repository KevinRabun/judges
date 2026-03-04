// ─── Named Presets ───────────────────────────────────────────────────────────
// Pre-configured evaluation profiles for common use cases.
// ──────────────────────────────────────────────────────────────────────────────

import type { JudgesConfig, Severity } from "./types.js";

export interface Preset {
  name: string;
  description: string;
  config: JudgesConfig;
}

/**
 * Built-in presets for quick configuration.
 */
export const PRESETS: Record<string, Preset> = {
  strict: {
    name: "Strict",
    description: "All judges, all severities. No findings tolerated. Best for production code reviews.",
    config: {
      minSeverity: "info" as Severity,
    },
  },

  lenient: {
    name: "Lenient",
    description: "Only critical and high severity findings. Good for early development.",
    config: {
      minSeverity: "high" as Severity,
    },
  },

  "security-only": {
    name: "Security Only",
    description: "Focus on security-related judges. Perfect for security audits.",
    config: {
      disabledJudges: [
        "cost-effectiveness",
        "scalability",
        "accessibility",
        "documentation",
        "internationalization",
        "ux",
        "maintainability",
        "caching",
        "portability",
        "ci-cd",
        "code-structure",
        "agent-instructions",
      ],
      minSeverity: "low" as Severity,
    },
  },

  startup: {
    name: "Startup / MVP",
    description: "Only critical issues and core security. Ship fast without shipping broken.",
    config: {
      minSeverity: "high" as Severity,
      disabledJudges: [
        "accessibility",
        "documentation",
        "internationalization",
        "backwards-compatibility",
        "portability",
        "maintainability",
        "code-structure",
      ],
    },
  },

  compliance: {
    name: "Compliance",
    description: "Focus on compliance, data security, sovereignty, and privacy judges.",
    config: {
      disabledJudges: [
        "cost-effectiveness",
        "scalability",
        "accessibility",
        "ux",
        "caching",
        "portability",
        "code-structure",
        "agent-instructions",
        "maintainability",
        "documentation",
        "internationalization",
      ],
      minSeverity: "low" as Severity,
    },
  },

  performance: {
    name: "Performance",
    description: "Focus on performance, caching, scalability, and concurrency judges.",
    config: {
      disabledJudges: [
        "compliance",
        "data-sovereignty",
        "documentation",
        "internationalization",
        "accessibility",
        "backwards-compatibility",
        "portability",
        "ux",
        "ethics-bias",
        "agent-instructions",
        "code-structure",
      ],
      minSeverity: "low" as Severity,
    },
  },
};

/**
 * Get a preset by name, or undefined if not found.
 */
export function getPreset(name: string): Preset | undefined {
  return PRESETS[name];
}

/**
 * Compose multiple presets into a single merged config.
 * Rules:
 * - disabledJudges: intersection (only disable judges disabled in ALL specified presets)
 * - disabledRules: union (disable rules disabled in ANY preset)
 * - minSeverity: most permissive (lowest threshold) wins
 * - ruleOverrides: merge all, later presets override earlier for same rule
 * - languages: union of all specified languages (empty = all)
 * - exclude/include: union of all patterns
 *
 * This enables stacking presets like "security-only,performance" to get
 * both security AND performance judges without unnecessary judges.
 */
export function composePresets(names: string[]): Preset | undefined {
  const resolved = names.map((n) => PRESETS[n.trim()]).filter(Boolean);
  if (resolved.length === 0) return undefined;
  if (resolved.length === 1) return resolved[0];

  const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

  // Start with the first preset's config
  const merged: JudgesConfig = { ...resolved[0].config };

  for (let i = 1; i < resolved.length; i++) {
    const cfg = resolved[i].config;

    // disabledJudges: intersection — only keep judges disabled in BOTH
    if (merged.disabledJudges && cfg.disabledJudges) {
      const otherSet = new Set(cfg.disabledJudges);
      merged.disabledJudges = merged.disabledJudges.filter((j) => otherSet.has(j));
    } else {
      // If either has no disabled list, the intersection is empty (enable all)
      merged.disabledJudges = [];
    }

    // disabledRules: union
    if (cfg.disabledRules) {
      merged.disabledRules = [...new Set([...(merged.disabledRules || []), ...cfg.disabledRules])];
    }

    // minSeverity: most permissive (lower index = more restrictive)
    if (cfg.minSeverity) {
      const currentIdx = severityOrder.indexOf(merged.minSeverity || "info");
      const newIdx = severityOrder.indexOf(cfg.minSeverity);
      if (newIdx > currentIdx) {
        merged.minSeverity = cfg.minSeverity;
      }
    }

    // ruleOverrides: merge
    if (cfg.ruleOverrides) {
      merged.ruleOverrides = { ...(merged.ruleOverrides || {}), ...cfg.ruleOverrides };
    }

    // languages: union
    if (cfg.languages) {
      merged.languages = [...new Set([...(merged.languages || []), ...cfg.languages])];
    }

    // exclude: union
    if (cfg.exclude) {
      merged.exclude = [...new Set([...(merged.exclude || []), ...cfg.exclude])];
    }

    // include: union
    if (cfg.include) {
      merged.include = [...new Set([...(merged.include || []), ...cfg.include])];
    }

    // maxFiles: take the smaller limit
    if (cfg.maxFiles !== undefined) {
      merged.maxFiles = merged.maxFiles !== undefined ? Math.min(merged.maxFiles, cfg.maxFiles) : cfg.maxFiles;
    }
  }

  return {
    name: resolved.map((r) => r.name).join(" + "),
    description: `Composed: ${resolved.map((r) => r.name).join(" + ")}`,
    config: merged,
  };
}

/**
 * List all available preset names and descriptions.
 */
export function listPresets(): Array<{ name: string; description: string }> {
  return Object.entries(PRESETS).map(([key, preset]) => ({
    name: key,
    description: preset.description,
  }));
}
