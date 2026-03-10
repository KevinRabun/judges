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

  // ── Framework-Aware Presets ────────────────────────────────────────────────

  react: {
    name: "React",
    description: "Tuned for React/Next.js apps — enables accessibility, XSS protection, disables backend-only judges.",
    config: {
      disabledJudges: ["database", "iac-security", "cloud-readiness", "data-sovereignty", "compliance"],
      disabledRules: [
        "CONSOLE_LOG_PRODUCTION", // console usage in dev is normal
      ],
      minSeverity: "low" as Severity,
    },
  },

  express: {
    name: "Express",
    description: "Tuned for Express.js APIs — emphasizes middleware security, authentication, CORS, and rate limiting.",
    config: {
      disabledJudges: ["accessibility", "ux", "internationalization", "portability"],
      minSeverity: "low" as Severity,
    },
  },

  fastapi: {
    name: "FastAPI",
    description: "Tuned for Python FastAPI — focuses on input validation, async patterns, and API security.",
    config: {
      languages: ["python"],
      disabledJudges: ["accessibility", "ux", "internationalization", "portability"],
      minSeverity: "low" as Severity,
    },
  },

  django: {
    name: "Django",
    description: "Tuned for Django apps — emphasizes template security, ORM misuse, CSRF, admin security.",
    config: {
      languages: ["python"],
      disabledJudges: ["portability"],
      minSeverity: "low" as Severity,
    },
  },

  "spring-boot": {
    name: "Spring Boot",
    description: "Tuned for Java Spring Boot — emphasizes injection, configuration, actuator security.",
    config: {
      languages: ["java"],
      disabledJudges: ["accessibility", "ux", "internationalization", "portability"],
      minSeverity: "low" as Severity,
    },
  },

  rails: {
    name: "Rails",
    description: "Tuned for Ruby on Rails — emphasizes mass assignment, CSRF, SQL injection, strong params.",
    config: {
      languages: ["ruby"],
      disabledJudges: ["portability"],
      minSeverity: "low" as Severity,
    },
  },

  nextjs: {
    name: "Next.js",
    description: "Tuned for Next.js — covers both server and client security, API routes, SSR/ISR patterns.",
    config: {
      disabledJudges: ["database", "iac-security", "data-sovereignty", "compliance"],
      minSeverity: "low" as Severity,
    },
  },

  terraform: {
    name: "Terraform",
    description: "Tuned for Terraform/OpenTofu IaC — focuses on infrastructure security, cloud-readiness, compliance.",
    config: {
      languages: ["terraform", "hcl"],
      disabledJudges: [
        "accessibility",
        "ux",
        "internationalization",
        "caching",
        "code-structure",
        "backwards-compatibility",
        "documentation",
        "concurrency",
        "agent-instructions",
      ],
      minSeverity: "low" as Severity,
    },
  },

  kubernetes: {
    name: "Kubernetes",
    description: "Tuned for Kubernetes manifests — security contexts, RBAC, resource limits, network policies.",
    config: {
      languages: ["yaml"],
      disabledJudges: [
        "accessibility",
        "ux",
        "internationalization",
        "caching",
        "code-structure",
        "backwards-compatibility",
        "documentation",
        "concurrency",
        "agent-instructions",
        "scalability",
      ],
      minSeverity: "low" as Severity,
    },
  },

  onboarding: {
    name: "Onboarding",
    description:
      "Smart defaults for first-time adoption — suppresses noisy absence-based rules, " +
      "focuses on high-confidence security/correctness findings only. " +
      "Ideal for introducing Judges into an existing codebase without alert fatigue.",
    config: {
      minSeverity: "high" as Severity,
      disabledJudges: [
        "compliance",
        "ethics-bias",
        "data-sovereignty",
        "cost-effectiveness",
        "documentation",
        "internationalization",
        "accessibility",
        "ux",
        "agent-instructions",
      ],
    },
  },

  // ── Industry-Vertical Presets ─────────────────────────────────────────────

  fintech: {
    name: "Fintech",
    description:
      "For financial services — PCI DSS compliance, cryptography, authentication, " +
      "data security, audit logging, rate limiting, and fraud prevention patterns.",
    config: {
      minSeverity: "low" as Severity,
      disabledJudges: [
        "accessibility",
        "ux",
        "internationalization",
        "portability",
        "agent-instructions",
        "code-structure",
      ],
      ruleOverrides: {
        "AUTH-001": { severity: "critical" as Severity },
        "CRYPTO-001": { severity: "critical" as Severity },
        "DATA-001": { severity: "critical" as Severity },
      },
    },
  },

  healthtech: {
    name: "Healthtech",
    description:
      "For healthcare applications — HIPAA compliance, data sovereignty, encryption at rest, " +
      "audit trails, logging privacy, and sensitive data handling.",
    config: {
      minSeverity: "low" as Severity,
      disabledJudges: [
        "cost-effectiveness",
        "ux",
        "portability",
        "agent-instructions",
        "code-structure",
        "backwards-compatibility",
      ],
      ruleOverrides: {
        "DATA-001": { severity: "critical" as Severity },
        "SOV-001": { severity: "critical" as Severity },
        "COMP-001": { severity: "critical" as Severity },
      },
    },
  },

  saas: {
    name: "SaaS",
    description:
      "For multi-tenant SaaS platforms — tenant isolation, rate limiting, scalability, " +
      "API security, caching, authentication, and observability.",
    config: {
      minSeverity: "low" as Severity,
      disabledJudges: ["data-sovereignty", "compliance", "internationalization", "portability", "agent-instructions"],
    },
  },

  "open-source": {
    name: "Open Source",
    description:
      "For open-source projects — documentation quality, backwards compatibility, " +
      "security, code structure, and dependency health.",
    config: {
      minSeverity: "low" as Severity,
      disabledJudges: ["compliance", "data-sovereignty", "cost-effectiveness", "ux", "logging-privacy"],
    },
  },

  government: {
    name: "Government",
    description:
      "For government and public sector — FedRAMP/NIST compliance, data sovereignty, " +
      "accessibility (Section 508), audit logging, and security hardening.",
    config: {
      minSeverity: "info" as Severity,
      disabledJudges: ["cost-effectiveness", "ux", "portability", "agent-instructions", "code-structure"],
      ruleOverrides: {
        "AUTH-001": { severity: "critical" as Severity },
        "SOV-001": { severity: "critical" as Severity },
        "COMP-001": { severity: "critical" as Severity },
        "A11Y-001": { severity: "high" as Severity },
      },
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
