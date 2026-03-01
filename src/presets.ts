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
 * List all available preset names and descriptions.
 */
export function listPresets(): Array<{ name: string; description: string }> {
  return Object.entries(PRESETS).map(([key, preset]) => ({
    name: key,
    description: preset.description,
  }));
}
