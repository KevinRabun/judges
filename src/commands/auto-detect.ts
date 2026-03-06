// ─── Project Auto-Detection for Init Wizard ──────────────────────────────────
// Detects project type, languages, and frameworks from file system signals,
// then recommends appropriate presets and configuration for `judges init`.
//
// All detection functions are pure and testable — they operate on arrays of
// file paths and/or package.json content, not direct filesystem access.
// ──────────────────────────────────────────────────────────────────────────────

import { PRESETS } from "../presets.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectSignals {
  /** Primary language(s) detected */
  languages: string[];
  /** Frameworks detected (e.g. "express", "react", "django") */
  frameworks: string[];
  /** Project type classification */
  projectType: ProjectType;
  /** Whether the project has CI configured */
  hasCI: boolean;
  /** Whether the project has Docker/container support */
  hasDocker: boolean;
  /** Whether the project uses a monorepo structure */
  isMonorepo: boolean;
}

export type ProjectType =
  | "web-api"
  | "web-frontend"
  | "full-stack"
  | "cli-tool"
  | "library"
  | "infrastructure"
  | "data-science"
  | "mobile"
  | "unknown";

export interface PresetRecommendation {
  /** The preset name to use */
  preset: string;
  /** Why this preset was recommended */
  reason: string;
  /** Confidence: how well the signals match */
  confidence: "high" | "medium" | "low";
  /** Additional configuration suggestions */
  suggestions: string[];
}

// ─── Language & Framework Detection ─────────────────────────────────────────

const LANG_INDICATORS: Record<string, string[]> = {
  typescript: [".ts", ".tsx"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python: [".py"],
  rust: [".rs"],
  go: [".go"],
  java: [".java"],
  csharp: [".cs"],
  cpp: [".cpp", ".cc", ".cxx", ".h", ".hpp"],
  ruby: [".rb"],
  php: [".php"],
  kotlin: [".kt", ".kts"],
  swift: [".swift"],
};

const FRAMEWORK_FILES: Record<string, string[]> = {
  react: ["src/App.tsx", "src/App.jsx", "src/app.tsx", "src/app.jsx"],
  nextjs: ["next.config.js", "next.config.ts", "next.config.mjs"],
  express: [], // detected from package.json
  fastapi: [], // detected from requirements
  django: ["manage.py"],
  flask: [], // detected from requirements
  angular: ["angular.json"],
  vue: ["vue.config.js", "vue.config.ts"],
  svelte: ["svelte.config.js", "svelte.config.ts"],
  terraform: ["main.tf", "variables.tf"],
  docker: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
};

const PKG_FRAMEWORK_MAP: Record<string, string> = {
  express: "express",
  fastify: "fastify",
  koa: "koa",
  hapi: "hapi",
  nestjs: "@nestjs/core",
  react: "react",
  "react-native": "react-native",
  vue: "vue",
  angular: "@angular/core",
  svelte: "svelte",
  nextjs: "next",
  nuxt: "nuxt",
  gatsby: "gatsby",
  electron: "electron",
};

const PY_FRAMEWORK_MAP: Record<string, string> = {
  django: "django",
  flask: "flask",
  fastapi: "fastapi",
  tornado: "tornado",
  starlette: "starlette",
  pyramid: "pyramid",
};

/**
 * Detect primary languages from a list of file paths.
 */
export function detectLanguages(files: string[]): string[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const lower = file.toLowerCase();
    for (const [lang, exts] of Object.entries(LANG_INDICATORS)) {
      if (exts.some((ext) => lower.endsWith(ext))) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
}

/**
 * Detect frameworks from file paths and optional package.json dependencies.
 */
export function detectFrameworksFromFiles(
  files: string[],
  packageJsonDeps?: Record<string, string>,
  requirementsTxt?: string,
): string[] {
  const found = new Set<string>();

  // Check file-based indicators
  const fileSet = new Set(files.map((f) => f.replace(/\\/g, "/")));
  for (const [framework, indicators] of Object.entries(FRAMEWORK_FILES)) {
    if (indicators.length > 0 && indicators.some((ind) => fileSet.has(ind))) {
      found.add(framework);
    }
  }

  // Check package.json dependencies
  if (packageJsonDeps) {
    for (const [framework, pkg] of Object.entries(PKG_FRAMEWORK_MAP)) {
      if (packageJsonDeps[pkg]) {
        found.add(framework);
      }
    }
  }

  // Check Python requirements
  if (requirementsTxt) {
    const lower = requirementsTxt.toLowerCase();
    for (const [framework, pkg] of Object.entries(PY_FRAMEWORK_MAP)) {
      if (lower.includes(pkg)) {
        found.add(framework);
      }
    }
  }

  // Docker detection from file names
  if (
    files.some((f) => {
      const base = f.replace(/\\/g, "/").split("/").pop() ?? "";
      return base === "Dockerfile" || base.startsWith("docker-compose");
    })
  ) {
    found.add("docker");
  }

  return [...found].sort();
}

/**
 * Classify the project type from detected signals.
 */
export function classifyProjectType(languages: string[], frameworks: string[], files: string[]): ProjectType {
  const frameworkSet = new Set(frameworks);
  const fileSet = new Set(files.map((f) => f.replace(/\\/g, "/").split("/").pop() ?? ""));

  // Infrastructure
  if (frameworkSet.has("terraform") || files.some((f) => f.endsWith(".tf") || f.endsWith(".bicep"))) {
    return "infrastructure";
  }

  // Mobile
  if (
    frameworkSet.has("react-native") ||
    frameworkSet.has("flutter") ||
    languages.includes("swift") ||
    languages.includes("kotlin")
  ) {
    // Only mobile if no strong web signals
    if (!frameworkSet.has("express") && !frameworkSet.has("fastapi") && !frameworkSet.has("django")) {
      return "mobile";
    }
  }

  // Data science
  if (
    files.some((f) => f.endsWith(".ipynb")) ||
    files.some((f) => f.endsWith(".py") && (f.includes("notebook") || f.includes("analysis")))
  ) {
    return "data-science";
  }

  const hasWebFrontend =
    frameworkSet.has("react") || frameworkSet.has("vue") || frameworkSet.has("angular") || frameworkSet.has("svelte");
  const hasWebBackend =
    frameworkSet.has("express") ||
    frameworkSet.has("fastify") ||
    frameworkSet.has("koa") ||
    frameworkSet.has("django") ||
    frameworkSet.has("flask") ||
    frameworkSet.has("fastapi") ||
    frameworkSet.has("nestjs");

  if (hasWebFrontend && hasWebBackend) return "full-stack";
  if (hasWebBackend) return "web-api";
  if (hasWebFrontend) return "web-frontend";

  // CLI tool
  if (
    fileSet.has("cli.ts") ||
    fileSet.has("cli.js") ||
    fileSet.has("cli.py") ||
    files.some((f) => f.includes("bin/") || f.includes("commands/"))
  ) {
    return "cli-tool";
  }

  // Library — has index/lib but no web framework
  if (files.some((f) => f.includes("lib/") || f.includes("src/index."))) {
    return "library";
  }

  return "unknown";
}

/**
 * Detect CI configuration from file list.
 */
export function detectCI(files: string[]): boolean {
  return files.some((f) => {
    const norm = f.replace(/\\/g, "/");
    return (
      norm.includes(".github/workflows/") ||
      norm.includes(".gitlab-ci") ||
      norm.includes("azure-pipelines") ||
      norm.includes("Jenkinsfile") ||
      norm.includes(".circleci/")
    );
  });
}

/**
 * Detect monorepo structure from file list.
 */
export function detectMonorepo(files: string[]): boolean {
  return files.some((f) => {
    const norm = f.replace(/\\/g, "/");
    return (
      norm.includes("packages/") ||
      norm.includes("apps/") ||
      norm.includes("lerna.json") ||
      norm.includes("pnpm-workspace.yaml") ||
      norm.includes("turbo.json")
    );
  });
}

/**
 * Gather all project signals from detected data.
 */
export function detectProjectSignals(
  files: string[],
  packageJsonDeps?: Record<string, string>,
  requirementsTxt?: string,
): ProjectSignals {
  const languages = detectLanguages(files);
  const frameworks = detectFrameworksFromFiles(files, packageJsonDeps, requirementsTxt);
  const projectType = classifyProjectType(languages, frameworks, files);
  const hasCI = detectCI(files);
  const hasDocker = frameworks.includes("docker");
  const isMonorepo = detectMonorepo(files);

  return { languages, frameworks, projectType, hasCI, hasDocker, isMonorepo };
}

// ─── Preset Recommendation ─────────────────────────────────────────────────

/**
 * Recommend a preset based on detected project signals.
 */
export function recommendPreset(signals: ProjectSignals): PresetRecommendation {
  const suggestions: string[] = [];

  // Infrastructure projects → strict + compliance
  if (signals.projectType === "infrastructure") {
    suggestions.push("Consider enabling the IaC security judge");
    return {
      preset: "strict",
      reason: "Infrastructure-as-code projects benefit from thorough security and compliance review",
      confidence: "high",
      suggestions,
    };
  }

  // Data science → lenient (exploratory code)
  if (signals.projectType === "data-science") {
    return {
      preset: "lenient",
      reason: "Data science projects typically prioritize exploratory flexibility over strict compliance",
      confidence: "medium",
      suggestions: ["Focus on security for any data pipeline code shipping to production"],
    };
  }

  // Web API → security focus + strict
  if (signals.projectType === "web-api") {
    if (!signals.hasCI) suggestions.push("Add CI integration to catch issues in PRs");
    return {
      preset: "security-only",
      reason: "API services are externally accessible — security review is the highest priority",
      confidence: "high",
      suggestions,
    };
  }

  // Full-stack → default (needs both security and quality)
  if (signals.projectType === "full-stack") {
    if (!signals.hasCI) suggestions.push("Add CI integration for automated code review");
    if (signals.isMonorepo) suggestions.push("Consider per-package .judgesrc configs for large monorepos");
    return {
      preset: "strict",
      reason: "Full-stack applications need comprehensive review across frontend and backend",
      confidence: "high",
      suggestions,
    };
  }

  // Web frontend → lenient (less security surface)
  if (signals.projectType === "web-frontend") {
    return {
      preset: "lenient",
      reason: "Frontend projects have less direct security surface; focus on critical issues",
      confidence: "medium",
      suggestions: ["Enable the accessibility judge for public-facing applications"],
    };
  }

  // CLI tool → default
  if (signals.projectType === "cli-tool") {
    return {
      preset: "strict",
      reason: "CLI tools benefit from comprehensive quality and security review",
      confidence: "medium",
      suggestions: [],
    };
  }

  // Library → strict (shared code must be solid)
  if (signals.projectType === "library") {
    return {
      preset: "strict",
      reason: "Libraries are consumed by many projects — high quality standards are important",
      confidence: "high",
      suggestions: ["Enable backwards-compatibility judge to catch API breakage"],
    };
  }

  // Default fallback
  return {
    preset: "strict",
    reason: "General-purpose review covers all quality dimensions",
    confidence: "low",
    suggestions: ["Once your project is established, consider narrowing to a focused preset"],
  };
}

/**
 * Format project signals as a readable summary for the init wizard.
 */
export function formatProjectSummary(signals: ProjectSignals): string {
  const lines: string[] = [];

  lines.push("  📦 Detected Project Signals:");
  lines.push("  " + "─".repeat(50));

  if (signals.languages.length > 0) {
    lines.push(`    Languages   : ${signals.languages.join(", ")}`);
  }
  if (signals.frameworks.length > 0) {
    lines.push(`    Frameworks  : ${signals.frameworks.join(", ")}`);
  }
  lines.push(`    Project type: ${signals.projectType}`);
  lines.push(`    CI detected : ${signals.hasCI ? "yes" : "no"}`);
  lines.push(`    Docker      : ${signals.hasDocker ? "yes" : "no"}`);
  lines.push(`    Monorepo    : ${signals.isMonorepo ? "yes" : "no"}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Format a preset recommendation for display.
 */
export function formatRecommendation(rec: PresetRecommendation): string {
  const lines: string[] = [];

  const preset = PRESETS[rec.preset];
  const presetDesc = preset ? preset.description : "";
  lines.push(`  💡 Recommended preset: "${rec.preset}" (confidence: ${rec.confidence})`);
  if (presetDesc) lines.push(`     ${presetDesc}`);
  lines.push(`     Reason: ${rec.reason}`);

  if (rec.suggestions.length > 0) {
    lines.push("");
    lines.push("  📌 Suggestions:");
    for (const s of rec.suggestions) {
      lines.push(`     • ${s}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
