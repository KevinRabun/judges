/**
 * Language Packs — Preset rule configurations per language
 *
 * Provides curated rule sets optimized for specific languages and frameworks.
 * Each pack enables/disables judges and adjusts severity thresholds to
 * reduce noise and focus on language-relevant patterns.
 *
 * Usage:
 *   judges eval --pack react src/App.tsx
 *   judges pack list
 */

import type { JudgesConfig, Severity } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LanguagePack {
  id: string;
  name: string;
  description: string;
  languages: string[];
  config: JudgesConfig;
  /** Extra rule ID prefixes to prioritize */
  priorityRules?: string[];
  /** Tags for discoverability */
  tags?: string[];
}

// ─── Built-in Language Packs ─────────────────────────────────────────────────

export const LANGUAGE_PACKS: Record<string, LanguagePack> = {
  react: {
    id: "react",
    name: "React / Next.js",
    description: "Frontend-focused: accessibility, XSS, client-side security, component patterns",
    languages: ["typescript", "javascript"],
    config: {
      disabledJudges: ["database", "data-sovereignty", "ci-cd", "cloud-readiness", "rate-limiting"],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["SEC-", "A11Y-", "UX-", "PERF-"],
    tags: ["frontend", "react", "nextjs"],
  },

  api: {
    id: "api",
    name: "REST/GraphQL API",
    description: "Backend API focus: auth, rate limiting, input validation, error handling",
    languages: ["typescript", "javascript", "python", "go", "java", "csharp"],
    config: {
      disabledJudges: ["accessibility", "internationalization", "ux"],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["SEC-", "AUTH-", "RATE-", "API-", "ERR-"],
    tags: ["backend", "api", "rest"],
  },

  python: {
    id: "python",
    name: "Python",
    description: "Python-specific: injection, deserialization, type safety, package security",
    languages: ["python"],
    config: {
      minSeverity: "low" as Severity,
    },
    priorityRules: ["SEC-", "CYBER-", "DEP-"],
    tags: ["python", "django", "flask", "fastapi"],
  },

  infrastructure: {
    id: "infrastructure",
    name: "Infrastructure / IaC",
    description: "Terraform, Docker, CI/CD: config management, secrets, cloud readiness",
    languages: ["terraform", "dockerfile", "yaml", "bash"],
    config: {
      disabledJudges: [
        "accessibility",
        "internationalization",
        "ux",
        "database",
        "backwards-compatibility",
        "api-design",
      ],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["CONF-", "CLOUD-", "CICD-", "SEC-"],
    tags: ["infrastructure", "devops", "terraform", "docker"],
  },

  mobile: {
    id: "mobile",
    name: "Mobile App",
    description: "Mobile-focused: data security, auth, offline, performance",
    languages: ["typescript", "javascript", "swift", "kotlin", "java"],
    config: {
      disabledJudges: ["database", "ci-cd", "cloud-readiness", "data-sovereignty"],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["SEC-", "AUTH-", "DATA-", "PERF-"],
    tags: ["mobile", "ios", "android", "react-native"],
  },

  "data-pipeline": {
    id: "data-pipeline",
    name: "Data Pipeline",
    description: "Data engineering: SQL injection, data security, compliance, observability",
    languages: ["python", "typescript", "java", "scala"],
    config: {
      disabledJudges: ["accessibility", "internationalization", "ux", "api-design", "backwards-compatibility"],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["DB-", "DATA-", "COMP-", "LOGPRIV-"],
    tags: ["data", "etl", "pipeline", "spark"],
  },

  "ai-agent": {
    id: "ai-agent",
    name: "AI Agent / LLM App",
    description: "AI safety: prompt injection, agent instructions, data security, ethics",
    languages: ["typescript", "javascript", "python"],
    config: {
      disabledJudges: ["database", "ci-cd", "backwards-compatibility", "portability"],
      minSeverity: "low" as Severity,
    },
    priorityRules: ["AGENT-", "AICS-", "SEC-", "ETHICS-", "DATA-"],
    tags: ["ai", "llm", "agent", "chatbot"],
  },
};

// ─── Pack Lookup ─────────────────────────────────────────────────────────────

/**
 * Get a language pack by ID.
 */
export function getLanguagePack(id: string): LanguagePack | undefined {
  return LANGUAGE_PACKS[id];
}

/**
 * List all available language packs.
 */
export function listLanguagePacks(): Array<{ id: string; name: string; description: string; languages: string[] }> {
  return Object.values(LANGUAGE_PACKS).map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    languages: pack.languages,
  }));
}

/**
 * Auto-detect the best language pack for a given language.
 */
export function suggestPack(language: string): LanguagePack | undefined {
  // Find packs whose languages array includes the given language
  const candidates = Object.values(LANGUAGE_PACKS).filter((p) => p.languages.includes(language));
  return candidates[0]; // Return first match or undefined
}

// ─── CLI Handler ─────────────────────────────────────────────────────────────

export function runPack(argv: string[]): void {
  const subcommand = argv[3] || "list";

  if (subcommand === "list" || subcommand === "--help" || subcommand === "-h") {
    const packs = listLanguagePacks();
    console.log(`\n  Language Packs (${packs.length}):`);
    console.log("  " + "─".repeat(60));
    for (const p of packs) {
      console.log(`  ${p.id.padEnd(20)} ${p.name}`);
      console.log(`  ${"".padEnd(20)} ${p.description}`);
      console.log(`  ${"".padEnd(20)} Languages: ${p.languages.join(", ")}`);
      console.log("");
    }
    console.log("  Usage: judges eval --pack <id> <file>");
    console.log("");
    process.exit(0);
  }

  console.error(`Unknown pack subcommand: ${subcommand}`);
  process.exit(1);
}
