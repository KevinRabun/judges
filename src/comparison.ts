/**
 * Comparison Benchmarks — Compare judges against other code review tools
 *
 * Provides structured comparison data showing how judges performs relative to
 * ESLint, SonarQube, Semgrep, CodeQL, and Bandit across multiple dimensions.
 *
 * This is data-driven: real comparisons require running the other tools,
 * but we provide the framework and known capability matrices.
 */

import type { Finding } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolCapability {
  /** Tool name */
  tool: string;
  /** What it checks */
  category: string;
  /** Coverage level: full, partial, none */
  coverage: "full" | "partial" | "none";
  /** Notes about the coverage */
  notes?: string;
}

export interface ComparisonResult {
  /** Our findings count */
  judgesFindings: number;
  /** Other tool findings count */
  otherFindings: number;
  /** Findings unique to judges */
  uniqueToJudges: number;
  /** Findings unique to the other tool */
  uniqueToOther: number;
  /** Overlapping findings */
  overlap: number;
  /** Categories where judges found more */
  judgesAdvantage: string[];
  /** Categories where other tool found more */
  otherAdvantage: string[];
}

export interface ToolProfile {
  name: string;
  type: "linter" | "sast" | "reviewer";
  languages: string[];
  categories: string[];
  strengths: string[];
  weaknesses: string[];
  pricing: string;
}

// ─── Tool Profiles ───────────────────────────────────────────────────────────

export const TOOL_PROFILES: ToolProfile[] = [
  {
    name: "ESLint",
    type: "linter",
    languages: ["javascript", "typescript"],
    categories: ["code-style", "best-practices", "potential-errors"],
    strengths: ["Massive plugin ecosystem", "Auto-fixable rules", "Deep JS/TS knowledge", "IDE integration"],
    weaknesses: ["JS/TS only", "No security focus by default", "No architectural analysis", "No AI-code detection"],
    pricing: "Free (OSS)",
  },
  {
    name: "SonarQube",
    type: "sast",
    languages: ["javascript", "typescript", "python", "java", "csharp", "go", "rust", "cpp"],
    categories: ["bugs", "vulnerabilities", "code-smells", "security-hotspots"],
    strengths: ["Multi-language", "Quality gates", "Historical tracking", "Enterprise features"],
    weaknesses: ["Heavy infrastructure", "Slow analysis", "No AI-code detection", "Complex setup"],
    pricing: "Free (Community) / $150+/mo (Enterprise)",
  },
  {
    name: "Semgrep",
    type: "sast",
    languages: ["javascript", "typescript", "python", "java", "go", "rust", "ruby"],
    categories: ["security", "best-practices", "correctness"],
    strengths: ["Pattern-based rules", "Fast analysis", "Custom rules easy to write", "Good security coverage"],
    weaknesses: [
      "Limited architectural analysis",
      "No AI-code detection",
      "Cloud rules require account",
      "No code review personas",
    ],
    pricing: "Free (OSS) / Team plans",
  },
  {
    name: "CodeQL",
    type: "sast",
    languages: ["javascript", "typescript", "python", "java", "csharp", "go", "cpp", "ruby"],
    categories: ["security", "correctness", "data-flow"],
    strengths: [
      "Deep data-flow analysis",
      "GitHub-native integration",
      "Powerful query language",
      "Excellent security coverage",
    ],
    weaknesses: [
      "Requires compilation for some languages",
      "Complex query authoring",
      "Slow analysis",
      "No architectural/design review",
    ],
    pricing: "Free for OSS / GitHub Advanced Security",
  },
  {
    name: "Bandit",
    type: "sast",
    languages: ["python"],
    categories: ["security"],
    strengths: ["Python-focused security", "Fast", "Simple setup", "CI-friendly"],
    weaknesses: ["Python only", "Limited to security", "No architecture analysis", "High false-positive rate"],
    pricing: "Free (OSS)",
  },
];

// ─── Capability Matrix ───────────────────────────────────────────────────────

/**
 * The 10 trust dimensions that judges covers, mapped against other tools.
 */
export const CAPABILITY_MATRIX: ToolCapability[] = [
  // Security
  { tool: "judges", category: "Security (OWASP Top 10)", coverage: "full" },
  { tool: "ESLint", category: "Security (OWASP Top 10)", coverage: "partial", notes: "With eslint-plugin-security" },
  { tool: "SonarQube", category: "Security (OWASP Top 10)", coverage: "full" },
  { tool: "Semgrep", category: "Security (OWASP Top 10)", coverage: "full" },
  { tool: "CodeQL", category: "Security (OWASP Top 10)", coverage: "full" },
  { tool: "Bandit", category: "Security (OWASP Top 10)", coverage: "partial", notes: "Python only" },

  // Reliability
  { tool: "judges", category: "Reliability (error handling, edge cases)", coverage: "full" },
  { tool: "ESLint", category: "Reliability (error handling, edge cases)", coverage: "partial" },
  { tool: "SonarQube", category: "Reliability (error handling, edge cases)", coverage: "full" },
  { tool: "Semgrep", category: "Reliability (error handling, edge cases)", coverage: "partial" },
  { tool: "CodeQL", category: "Reliability (error handling, edge cases)", coverage: "partial" },
  { tool: "Bandit", category: "Reliability (error handling, edge cases)", coverage: "none" },

  // Performance
  { tool: "judges", category: "Performance (N+1, caching, async)", coverage: "full" },
  { tool: "ESLint", category: "Performance (N+1, caching, async)", coverage: "partial", notes: "Async patterns only" },
  { tool: "SonarQube", category: "Performance (N+1, caching, async)", coverage: "partial" },
  { tool: "Semgrep", category: "Performance (N+1, caching, async)", coverage: "none" },
  { tool: "CodeQL", category: "Performance (N+1, caching, async)", coverage: "none" },
  { tool: "Bandit", category: "Performance (N+1, caching, async)", coverage: "none" },

  // Accessibility
  { tool: "judges", category: "Accessibility (WCAG)", coverage: "full" },
  { tool: "ESLint", category: "Accessibility (WCAG)", coverage: "partial", notes: "jsx-a11y plugin" },
  { tool: "SonarQube", category: "Accessibility (WCAG)", coverage: "none" },
  { tool: "Semgrep", category: "Accessibility (WCAG)", coverage: "none" },
  { tool: "CodeQL", category: "Accessibility (WCAG)", coverage: "none" },
  { tool: "Bandit", category: "Accessibility (WCAG)", coverage: "none" },

  // Architecture / Code Structure
  { tool: "judges", category: "Architecture / Code Structure", coverage: "full" },
  { tool: "ESLint", category: "Architecture / Code Structure", coverage: "partial", notes: "Complexity rules only" },
  { tool: "SonarQube", category: "Architecture / Code Structure", coverage: "partial" },
  { tool: "Semgrep", category: "Architecture / Code Structure", coverage: "none" },
  { tool: "CodeQL", category: "Architecture / Code Structure", coverage: "none" },
  { tool: "Bandit", category: "Architecture / Code Structure", coverage: "none" },

  // AI Code Detection
  { tool: "judges", category: "AI Code Detection", coverage: "full" },
  { tool: "ESLint", category: "AI Code Detection", coverage: "none" },
  { tool: "SonarQube", category: "AI Code Detection", coverage: "none" },
  { tool: "Semgrep", category: "AI Code Detection", coverage: "none" },
  { tool: "CodeQL", category: "AI Code Detection", coverage: "none" },
  { tool: "Bandit", category: "AI Code Detection", coverage: "none" },

  // Compliance
  { tool: "judges", category: "Compliance (FedRAMP, GDPR)", coverage: "full" },
  { tool: "ESLint", category: "Compliance (FedRAMP, GDPR)", coverage: "none" },
  { tool: "SonarQube", category: "Compliance (FedRAMP, GDPR)", coverage: "partial", notes: "Some OWASP mapping" },
  { tool: "Semgrep", category: "Compliance (FedRAMP, GDPR)", coverage: "partial", notes: "Via custom rules" },
  { tool: "CodeQL", category: "Compliance (FedRAMP, GDPR)", coverage: "none" },
  { tool: "Bandit", category: "Compliance (FedRAMP, GDPR)", coverage: "none" },

  // API Design
  { tool: "judges", category: "API Design Review", coverage: "full" },
  { tool: "ESLint", category: "API Design Review", coverage: "none" },
  { tool: "SonarQube", category: "API Design Review", coverage: "none" },
  { tool: "Semgrep", category: "API Design Review", coverage: "none" },
  { tool: "CodeQL", category: "API Design Review", coverage: "none" },
  { tool: "Bandit", category: "API Design Review", coverage: "none" },

  // Cost & Cloud Readiness
  { tool: "judges", category: "Cost & Cloud Readiness", coverage: "full" },
  { tool: "ESLint", category: "Cost & Cloud Readiness", coverage: "none" },
  { tool: "SonarQube", category: "Cost & Cloud Readiness", coverage: "none" },
  { tool: "Semgrep", category: "Cost & Cloud Readiness", coverage: "none" },
  { tool: "CodeQL", category: "Cost & Cloud Readiness", coverage: "none" },
  { tool: "Bandit", category: "Cost & Cloud Readiness", coverage: "none" },

  // CI/CD Pipeline Review
  { tool: "judges", category: "CI/CD Pipeline Review", coverage: "full" },
  { tool: "ESLint", category: "CI/CD Pipeline Review", coverage: "none" },
  { tool: "SonarQube", category: "CI/CD Pipeline Review", coverage: "none" },
  { tool: "Semgrep", category: "CI/CD Pipeline Review", coverage: "partial", notes: "Dockerfile rules" },
  { tool: "CodeQL", category: "CI/CD Pipeline Review", coverage: "none" },
  { tool: "Bandit", category: "CI/CD Pipeline Review", coverage: "none" },
];

// ─── Comparison Logic ────────────────────────────────────────────────────────

/**
 * Generate a capability summary comparing judges to a specific tool.
 */
export function compareCapabilities(toolName: string): {
  judgesOnly: string[];
  otherOnly: string[];
  both: string[];
  judgesPartial: string[];
  otherPartial: string[];
} {
  const categories = [...new Set(CAPABILITY_MATRIX.map((c) => c.category))];

  const judgesOnly: string[] = [];
  const otherOnly: string[] = [];
  const both: string[] = [];
  const judgesPartial: string[] = [];
  const otherPartial: string[] = [];

  for (const cat of categories) {
    const judgesCap = CAPABILITY_MATRIX.find((c) => c.tool === "judges" && c.category === cat);
    const otherCap = CAPABILITY_MATRIX.find(
      (c) => c.tool.toLowerCase() === toolName.toLowerCase() && c.category === cat,
    );

    if (!otherCap || otherCap.coverage === "none") {
      if (judgesCap && judgesCap.coverage !== "none") {
        judgesOnly.push(cat);
      }
    } else if (judgesCap?.coverage === "full" && otherCap.coverage === "full") {
      both.push(cat);
    } else if (judgesCap?.coverage === "full" && otherCap.coverage === "partial") {
      judgesPartial.push(cat);
    } else if (judgesCap?.coverage === "partial" && otherCap.coverage === "full") {
      otherPartial.push(cat);
    }
  }

  return { judgesOnly, otherOnly, both, judgesPartial, otherPartial };
}

/**
 * Format a comparison report as text.
 */
export function formatComparisonReport(toolName: string): string {
  const profile = TOOL_PROFILES.find((t) => t.name.toLowerCase() === toolName.toLowerCase());
  const comparison = compareCapabilities(toolName);

  const lines: string[] = [];
  lines.push(`╔══════════════════════════════════════════════════════════════╗`);
  lines.push(`║  judges vs ${(profile?.name || toolName).padEnd(48)} ║`);
  lines.push(`╚══════════════════════════════════════════════════════════════╝`);
  lines.push("");

  if (profile) {
    lines.push(`Type: ${profile.type} | Languages: ${profile.languages.length} | Pricing: ${profile.pricing}`);
    lines.push("");
  }

  if (comparison.judgesOnly.length > 0) {
    lines.push(`✅ Unique to judges (${comparison.judgesOnly.length} categories):`);
    for (const cat of comparison.judgesOnly) {
      lines.push(`   • ${cat}`);
    }
    lines.push("");
  }

  if (comparison.both.length > 0) {
    lines.push(`🤝 Both tools cover fully (${comparison.both.length} categories):`);
    for (const cat of comparison.both) {
      lines.push(`   • ${cat}`);
    }
    lines.push("");
  }

  if (comparison.judgesPartial.length > 0) {
    lines.push(`📊 judges covers fully, ${toolName} partially:`);
    for (const cat of comparison.judgesPartial) {
      lines.push(`   • ${cat}`);
    }
    lines.push("");
  }

  if (comparison.otherPartial.length > 0) {
    lines.push(`📊 ${toolName} covers fully, judges partially:`);
    for (const cat of comparison.otherPartial) {
      lines.push(`   • ${cat}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(62));
  lines.push(
    `judges covers ${comparison.judgesOnly.length + comparison.both.length + comparison.judgesPartial.length}/10 categories ` +
      `vs ${toolName}'s ${comparison.both.length + comparison.otherPartial.length}/10`,
  );

  return lines.join("\n");
}

/**
 * Generate a full comparison matrix across all tools.
 */
export function formatFullComparisonMatrix(): string {
  const tools = ["judges", ...TOOL_PROFILES.map((t) => t.name)];
  const categories = [...new Set(CAPABILITY_MATRIX.map((c) => c.category))];

  const lines: string[] = [];
  lines.push("Capability Matrix: judges vs Other Tools");
  lines.push("═".repeat(90));

  // Header
  const header = "Category".padEnd(40) + tools.map((t) => t.substring(0, 8).padEnd(10)).join("");
  lines.push(header);
  lines.push("─".repeat(90));

  for (const cat of categories) {
    let row = cat.substring(0, 38).padEnd(40);
    for (const tool of tools) {
      const cap = CAPABILITY_MATRIX.find((c) => c.tool.toLowerCase() === tool.toLowerCase() && c.category === cat);
      const icon = cap?.coverage === "full" ? "●" : cap?.coverage === "partial" ? "◐" : "○";
      row += icon.padEnd(10);
    }
    lines.push(row);
  }

  lines.push("─".repeat(90));
  lines.push("● = Full coverage  ◐ = Partial  ○ = None");

  return lines.join("\n");
}
