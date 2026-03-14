/**
 * Security maturity — assesses organization's security posture
 * maturity level based on Judges usage and finding data.
 *
 * All analysis from local files — no external data.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MaturityDimension {
  name: string;
  level: number; // 1-5
  maxLevel: number;
  description: string;
  evidence: string[];
  nextSteps: string[];
}

interface MaturityAssessment {
  overallLevel: number;
  overallLabel: string;
  dimensions: MaturityDimension[];
  score: number; // 0-100
  timestamp: string;
}

const MATURITY_LABELS = ["Initial", "Developing", "Defined", "Managed", "Optimizing"];

// ─── Core ───────────────────────────────────────────────────────────────────

function fileExists(path: string): boolean {
  return existsSync(path);
}

function loadJsonSafe<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function assessMaturity(): MaturityAssessment {
  const dimensions: MaturityDimension[] = [];

  // 1. Scanning adoption
  {
    let level = 1;
    const evidence: string[] = [];
    const nextSteps: string[] = [];

    if (fileExists(".judgesrc")) {
      level = 2;
      evidence.push(".judgesrc configured");
    }
    if (fileExists(".judges-scores")) {
      level = 3;
      evidence.push("Developer scoring active");
    }
    if (fileExists(join(".judges-leaderboard", "leaderboard.json"))) {
      level = 4;
      evidence.push("Team leaderboard active");
    }
    if (fileExists(join(".judges-quality-gate", "policy.json"))) {
      level = 5;
      evidence.push("Quality gate policy set");
    }

    if (level < 2) nextSteps.push("Configure .judgesrc with team presets");
    if (level < 3) nextSteps.push("Enable developer scoring with `judges dev-score`");
    if (level < 4) nextSteps.push("Set up team leaderboard with `judges team-leaderboard`");
    if (level < 5) nextSteps.push("Configure quality gate policy with `judges pr-quality-gate --set-policy`");

    dimensions.push({
      name: "Scanning Adoption",
      level,
      maxLevel: 5,
      description: "How widely Judges is used across the team",
      evidence,
      nextSteps,
    });
  }

  // 2. Finding management
  {
    let level = 1;
    const evidence: string[] = [];
    const nextSteps: string[] = [];

    if (fileExists(".judges-suppressions.json")) {
      level = 2;
      evidence.push("Suppressions configured");
    }
    if (fileExists(join(".judges-audit-trail", "trail.json"))) {
      level = 3;
      evidence.push("Audit trail active");
    }
    if (fileExists(".judges-votes.json")) {
      level = 4;
      evidence.push("Consensus voting enabled");
    }
    if (fileExists(join(".judges-auto-fix", "fix-history.json"))) {
      level = 5;
      evidence.push("Auto-fix suggestions used");
    }

    if (level < 2) nextSteps.push("Configure finding suppressions with `judges suppress`");
    if (level < 3) nextSteps.push("Enable audit trail with `judges audit-trail`");
    if (level < 4) nextSteps.push("Set up consensus voting with `judges vote`");
    if (level < 5) nextSteps.push("Use auto-fix suggestions with `judges auto-fix`");

    dimensions.push({
      name: "Finding Management",
      level,
      maxLevel: 5,
      description: "How findings are triaged, tracked, and resolved",
      evidence,
      nextSteps,
    });
  }

  // 3. Compliance & governance
  {
    let level = 1;
    const evidence: string[] = [];
    const nextSteps: string[] = [];

    if (fileExists(join(".judges-reg-watch", "watch.json")) || fileExists(".judges-reg-watch.json")) {
      level = 2;
      evidence.push("Regulatory watch configured");
    }
    if (fileExists(".judges-policy-audit.json")) {
      level = 3;
      evidence.push("Policy audit active");
    }
    if (fileExists(join(".judges-audit-bundle", "manifest.json"))) {
      level = 4;
      evidence.push("Audit bundles generated");
    }
    const costData = loadJsonSafe<{ snapshots: unknown[] }>(join(".judges-cost-forecast", "history.json"), {
      snapshots: [],
    });
    if (costData.snapshots.length > 0) {
      level = 5;
      evidence.push("Cost forecasting active");
    }

    if (level < 2) nextSteps.push("Set up regulatory watch with `judges reg-watch`");
    if (level < 3) nextSteps.push("Run policy audit with `judges policy-audit`");
    if (level < 4) nextSteps.push("Generate audit bundles with `judges audit-bundle`");
    if (level < 5) nextSteps.push("Track costs with `judges cost-forecast`");

    dimensions.push({
      name: "Compliance & Governance",
      level,
      maxLevel: 5,
      description: "Regulatory compliance and audit readiness",
      evidence,
      nextSteps,
    });
  }

  // 4. Team collaboration
  {
    let level = 1;
    const evidence: string[] = [];
    const nextSteps: string[] = [];

    if (fileExists(".judges-correlations.json")) {
      level = 2;
      evidence.push("Finding correlation active");
    }
    if (fileExists(".judges-digest.json")) {
      level = 3;
      evidence.push("Digest reports active");
    }
    if (fileExists(join(".judges-shared-rules"))) {
      level = 4;
      evidence.push("Rule sharing enabled");
    }
    if (fileExists(join(".judges-patterns"))) {
      level = 5;
      evidence.push("Pattern registry active");
    }

    if (level < 2) nextSteps.push("Enable correlation with `judges correlate`");
    if (level < 3) nextSteps.push("Set up digests with `judges digest`");
    if (level < 4) nextSteps.push("Share rules with `judges rule-share`");
    if (level < 5) nextSteps.push("Build pattern registry with `judges pattern-registry`");

    dimensions.push({
      name: "Team Collaboration",
      level,
      maxLevel: 5,
      description: "Knowledge sharing and team review processes",
      evidence,
      nextSteps,
    });
  }

  // 5. AI-specific readiness
  {
    let level = 1;
    const evidence: string[] = [];
    const nextSteps: string[] = [];

    if (fileExists(".judges-model-risk.json")) {
      level = 2;
      evidence.push("Model risk profiling active");
    }
    if (fileExists(join(".judges-model-trust", "trust-history.json"))) {
      level = 3;
      evidence.push("AI model trust scoring active");
    }
    if (fileExists(join(".judges-prompt-audit", "audit-history.json"))) {
      level = 4;
      evidence.push("Prompt injection auditing active");
    }
    if (fileExists(join(".judges-learn"))) {
      level = 5;
      evidence.push("Developer learning paths active");
    }

    if (level < 2) nextSteps.push("Profile AI model risks with `judges model-risk`");
    if (level < 3) nextSteps.push("Score AI model trust with `judges ai-model-trust`");
    if (level < 4) nextSteps.push("Audit for prompt injection with `judges ai-prompt-audit`");
    if (level < 5) nextSteps.push("Set up learning paths with `judges learn`");

    dimensions.push({
      name: "AI Readiness",
      level,
      maxLevel: 5,
      description: "AI-specific code review maturity",
      evidence,
      nextSteps,
    });
  }

  // Overall
  const avgLevel = Math.round(dimensions.reduce((s, d) => s + d.level, 0) / dimensions.length);
  const score = Math.round((dimensions.reduce((s, d) => s + d.level, 0) / (dimensions.length * 5)) * 100);

  return {
    overallLevel: avgLevel,
    overallLabel: MATURITY_LABELS[avgLevel - 1] || "Unknown",
    dimensions,
    score,
    timestamp: new Date().toISOString(),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSecurityMaturity(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges security-maturity — Security posture maturity assessment

Usage:
  judges security-maturity
  judges security-maturity --dimension "Scanning Adoption"
  judges security-maturity --roadmap

Options:
  --dimension <name>    Show details for a specific dimension
  --roadmap             Show prioritized improvement roadmap
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const assessment = assessMaturity();

  // Single dimension
  const dimName = argv.find((_a: string, i: number) => argv[i - 1] === "--dimension");
  if (dimName) {
    const dim = assessment.dimensions.find((d) => d.name.toLowerCase().includes(dimName.toLowerCase()));
    if (!dim) {
      console.error(`  Dimension not found. Available: ${assessment.dimensions.map((d) => d.name).join(", ")}`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(dim, null, 2));
    } else {
      console.log(`\n  ${dim.name} — Level ${dim.level}/${dim.maxLevel} (${MATURITY_LABELS[dim.level - 1]})`);
      console.log(`  ──────────────────────────`);
      console.log(`  ${dim.description}`);
      if (dim.evidence.length) {
        console.log(`\n  Evidence:`);
        for (const e of dim.evidence) console.log(`    ✅ ${e}`);
      }
      if (dim.nextSteps.length) {
        console.log(`\n  Next steps:`);
        for (const s of dim.nextSteps) console.log(`    → ${s}`);
      }
      console.log("");
    }
    return;
  }

  // Roadmap
  if (argv.includes("--roadmap")) {
    const allSteps = assessment.dimensions
      .sort((a, b) => a.level - b.level)
      .flatMap((d) => d.nextSteps.map((s) => ({ dimension: d.name, level: d.level, step: s })));

    if (format === "json") {
      console.log(JSON.stringify(allSteps, null, 2));
    } else {
      console.log(`\n  Security Maturity Roadmap\n  ──────────────────────────`);
      console.log(
        `  Current: Level ${assessment.overallLevel} (${assessment.overallLabel}) — ${assessment.score}/100\n`,
      );
      for (const s of allSteps) {
        console.log(`    [L${s.level}] ${s.dimension.padEnd(25)} → ${s.step}`);
      }
      console.log("");
    }
    return;
  }

  // Full assessment
  if (format === "json") {
    console.log(JSON.stringify(assessment, null, 2));
  } else {
    console.log(`\n  Security Maturity Assessment`);
    console.log(
      `  Overall: Level ${assessment.overallLevel}/5 (${assessment.overallLabel}) — Score: ${assessment.score}/100`,
    );
    console.log(`  ──────────────────────────`);
    for (const d of assessment.dimensions) {
      const bar = "█".repeat(d.level) + "░".repeat(d.maxLevel - d.level);
      console.log(`    ${d.name.padEnd(25)} ${bar} ${d.level}/${d.maxLevel} (${MATURITY_LABELS[d.level - 1]})`);
    }
    console.log(`\n  Run --roadmap to see improvement steps\n`);
  }
}
