/**
 * Review-priority — Smart finding prioritization by context and impact.
 */

import { readFileSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PrioritizedFinding {
  rank: number;
  priority: string;
  score: number;
  ruleId: string;
  severity: string;
  title: string;
  reason: string;
}

// ─── Scoring weights ────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 40,
  low: 15,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  security: 30,
  reliability: 20,
  performance: 15,
  "error-handling": 10,
  maintainability: 5,
  documentation: 2,
  testing: 5,
};

function categorize(ruleId: string): string {
  if (/sql|inject|xss|csrf|traversal|auth|secret|crypt|ssrf|deserial|pii/i.test(ruleId)) return "security";
  if (/error|exception|throw|catch|null|undefined/i.test(ruleId)) return "error-handling";
  if (/perf|cache|memory|leak|optim/i.test(ruleId)) return "performance";
  if (/reliab|race|concurr|deadlock|timeout/i.test(ruleId)) return "reliability";
  if (/test|assert|mock|coverage/i.test(ruleId)) return "testing";
  if (/doc|comment|jsdoc|readme/i.test(ruleId)) return "documentation";
  return "maintainability";
}

// ─── Priority calculation ──────────────────────────────────────────────────

function calculatePriority(finding: Finding): { score: number; reason: string } {
  const severity = finding.severity || "low";
  let score = SEVERITY_WEIGHTS[severity] || 15;
  const reasons: string[] = [];

  reasons.push(`severity:${severity} (+${SEVERITY_WEIGHTS[severity] || 15})`);

  // Category bonus
  const category = categorize(finding.ruleId || "");
  const catBonus = CATEGORY_WEIGHTS[category] || 0;
  score += catBonus;
  if (catBonus > 0) reasons.push(`category:${category} (+${catBonus})`);

  // Confidence bonus
  if (finding.confidence && finding.confidence > 0.8) {
    score += 10;
    reasons.push("high-confidence (+10)");
  }

  // Has patch bonus (actionable)
  if (finding.patch) {
    score += 5;
    reasons.push("has-patch (+5)");
  }

  return { score: Math.min(score, 200), reason: reasons.join(", ") };
}

function priorityLabel(score: number): string {
  if (score >= 100) return "P0-CRITICAL";
  if (score >= 75) return "P1-HIGH";
  if (score >= 40) return "P2-MEDIUM";
  return "P3-LOW";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPriority(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-priority — Smart finding prioritization

Usage:
  judges review-priority --input verdict.json
  judges review-priority --input verdict.json --top 10
  judges review-priority --input verdict.json --format json

Options:
  --input <file>       TribunalVerdict JSON file (required)
  --top <n>            Show only top N priority findings (default: all)
  --min-score <n>      Minimum priority score to show (default: 0)
  --format json        JSON output
  --help, -h           Show this help

Prioritizes findings based on severity, category (security > reliability
> performance > etc.), confidence level, and actionability (has patch).
Outputs a ranked list so developers fix the most impactful issues first.
`);
    return;
  }

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const topStr = argv.find((_a: string, i: number) => argv[i - 1] === "--top");
  const minScoreStr = argv.find((_a: string, i: number) => argv[i - 1] === "--min-score");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!inputPath) {
    console.error("Error: --input is required. Provide a verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(inputPath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Cannot read or parse ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  if (findings.length === 0) {
    console.log("No findings to prioritize.");
    return;
  }

  let prioritized: PrioritizedFinding[] = findings.map((f) => {
    const { score, reason } = calculatePriority(f);
    return {
      rank: 0,
      priority: priorityLabel(score),
      score,
      ruleId: f.ruleId || "unknown",
      severity: f.severity || "low",
      title: f.title,
      reason,
    };
  });

  // Sort by score descending
  prioritized.sort((a, b) => b.score - a.score);
  prioritized = prioritized.map((p, i) => ({ ...p, rank: i + 1 }));

  // Apply filters
  const minScore = minScoreStr ? parseInt(minScoreStr, 10) : 0;
  if (minScore > 0) {
    prioritized = prioritized.filter((p) => p.score >= minScore);
  }
  if (topStr) {
    prioritized = prioritized.slice(0, parseInt(topStr, 10));
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, shown: prioritized.length, findings: prioritized }, null, 2));
    return;
  }

  console.log(
    `\n  Prioritized Findings (${prioritized.length} of ${findings.length})\n  ─────────────────────────────`,
  );

  const priorityIcons: Record<string, string> = {
    "P0-CRITICAL": "🔴",
    "P1-HIGH": "🟠",
    "P2-MEDIUM": "🟡",
    "P3-LOW": "🔵",
  };

  for (const p of prioritized) {
    const icon = priorityIcons[p.priority] || "⬜";
    console.log(`\n    #${p.rank} ${icon} ${p.priority} (score: ${p.score})`);
    console.log(`       ${p.ruleId}: ${p.title}`);
    console.log(`       ${p.reason}`);
  }

  console.log();
}
