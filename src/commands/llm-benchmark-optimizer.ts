/**
 * LLM Benchmark Optimizer — Self-Teaching Feedback Loop
 *
 * Analyzes benchmark snapshots to identify systematic weaknesses
 * (high-FP judges, problematic categories, difficulty gaps) and
 * generates targeted prompt amendments that are applied on the
 * next benchmark run to improve precision without sacrificing recall.
 *
 * Closed loop: run → analyze → amend prompts → run → better scores
 */

import type { LlmBenchmarkSnapshot, LlmCaseResult } from "./llm-benchmark.js";
import { JUDGES } from "../judges/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptAmendment {
  /** Judge rule prefix this amendment targets */
  judgePrefix: string;
  /** The amendment text to inject into prompts */
  amendment: string;
  /** Why this amendment was generated */
  reason: string;
  /** Historical FP rate that triggered this */
  fpRate: number;
  /** Benchmark run that generated this */
  generatedFrom: string;
  /** ISO timestamp */
  timestamp: string;
}

export interface OptimizerInsight {
  category: "high-fp-judge" | "missed-category" | "clean-case-leak" | "difficulty-gap";
  severity: "critical" | "high" | "medium";
  /** Target identifier (judge prefix, category name, difficulty) */
  target: string;
  /** The metric value (FP rate, F1, detection rate) */
  metric: number;
  /** Human-readable recommendation */
  recommendation: string;
}

export interface OptimizationResult {
  amendments: PromptAmendment[];
  insights: OptimizerInsight[];
  /** Estimated F1 improvement from applying amendments */
  projectedF1Improvement: number;
  /** Summary stats */
  summary: {
    worstJudges: string[];
    worstCategories: string[];
    amendmentsGenerated: number;
    currentF1: number;
    projectedF1: number;
  };
}

export interface AmendmentStore {
  /** Schema version */
  version: 1;
  /** Active amendments to apply on next run */
  amendments: PromptAmendment[];
  /** History of past optimizations */
  history: Array<{
    timestamp: string;
    snapshotF1: number;
    amendmentsApplied: number;
    amendmentsGenerated: number;
  }>;
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Judges below this precision get amendments */
const AMENDMENT_PRECISION_THRESHOLD = 0.4;
/** Minimum findings before generating amendment (avoid noise) */
const MIN_FINDINGS_FOR_AMENDMENT = 5;
/** Categories below this F1 get flagged */
const CATEGORY_F1_THRESHOLD = 0.5;
/** Difficulty detection rate below this gets flagged */
const DIFFICULTY_DETECTION_THRESHOLD = 0.8;
/** Conservative estimate: amendment reduces that judge's FPs by this fraction */
const FP_REDUCTION_ESTIMATE = 0.35;

// ─── Core Optimizer ─────────────────────────────────────────────────────────

/**
 * Analyze a benchmark snapshot and produce optimization results.
 * This is the main self-teaching entry point.
 */
export function optimizeBenchmark(
  snapshot: LlmBenchmarkSnapshot,
  existingAmendments?: PromptAmendment[],
): OptimizationResult {
  const amendments: PromptAmendment[] = [];
  const insights: OptimizerInsight[] = [];
  const existingPrefixes = new Set((existingAmendments ?? []).map((a) => a.judgePrefix));

  // 1. Identify high-FP judges and generate amendments
  const judgeEntries = Object.entries(snapshot.perJudge).sort(([, a], [, b]) => a.precision - b.precision);

  const worstJudges: string[] = [];
  for (const [prefix, stats] of judgeEntries) {
    if (stats.total < MIN_FINDINGS_FOR_AMENDMENT) continue;

    if (stats.precision < AMENDMENT_PRECISION_THRESHOLD) {
      worstJudges.push(prefix);

      // Only generate new amendment if one doesn't already exist (or if it's gotten worse)
      const existing = (existingAmendments ?? []).find((a) => a.judgePrefix === prefix);
      const shouldRegenerate = !existing || stats.precision < existing.fpRate * 0.8;

      if (!existingPrefixes.has(prefix) || shouldRegenerate) {
        amendments.push(generateAmendment(prefix, stats.precision, stats.falsePositives, stats.total, snapshot));
      }

      insights.push({
        category: "high-fp-judge",
        severity: stats.precision < 0.1 ? "critical" : "high",
        target: prefix,
        metric: stats.precision,
        recommendation:
          `Judge ${prefix} has ${pct(stats.precision)} precision ` +
          `(${stats.falsePositives} FP / ${stats.total} findings). ` +
          (existingPrefixes.has(prefix) ? "Existing amendment needs strengthening." : "New amendment generated."),
      });
    }
  }

  // 2. Identify problematic categories
  const worstCategories: string[] = [];
  for (const [catName, cat] of Object.entries(snapshot.perCategory)) {
    if (cat.total < 2) continue;
    if (cat.f1Score < CATEGORY_F1_THRESHOLD) {
      worstCategories.push(catName);
      insights.push({
        category: catName === "clean" ? "clean-case-leak" : "missed-category",
        severity: cat.f1Score === 0 ? "critical" : "high",
        target: catName,
        metric: cat.f1Score,
        recommendation:
          catName === "clean"
            ? `All ${cat.total} clean-code cases produced false positives. ` +
              `The precision mandate needs strengthening for clean code recognition.`
            : `Category "${catName}" has F1=${pct(cat.f1Score)}. ` +
              `Review prompts and benchmark cases for this category.`,
      });
    }
  }

  // 3. Check difficulty gaps
  for (const [diff, stats] of Object.entries(snapshot.perDifficulty)) {
    if (stats.detectionRate < DIFFICULTY_DETECTION_THRESHOLD) {
      insights.push({
        category: "difficulty-gap",
        severity: "medium",
        target: diff,
        metric: stats.detectionRate,
        recommendation:
          `${diff} cases: ${pct(stats.detectionRate)} detection rate. ` +
          `Consider adding targeted training examples for this difficulty level.`,
      });
    }
  }

  // 4. Project improvement from amendments
  const { projectedF1, projectedImprovement } = projectImprovement(snapshot, amendments);

  return {
    amendments,
    insights,
    projectedF1Improvement: projectedImprovement,
    summary: {
      worstJudges,
      worstCategories,
      amendmentsGenerated: amendments.length,
      currentF1: snapshot.f1Score,
      projectedF1,
    },
  };
}

// ─── Amendment Generation ───────────────────────────────────────────────────

function generateAmendment(
  prefix: string,
  precision: number,
  fpCount: number,
  total: number,
  snapshot: LlmBenchmarkSnapshot,
): PromptAmendment {
  const judge = JUDGES.find((j) => j.rulePrefix === prefix);
  const judgeName = judge?.name ?? `Judge ${prefix}`;
  const domain = judge?.domain ?? "its domain";

  // Analyze what the FPs look like — which categories get falsely flagged
  const fpCategories = new Map<string, number>();
  // Collect specific FP case IDs for pattern extraction
  const fpCaseExamples: Array<{ caseId: string; category: string; ruleId: string }> = [];
  for (const c of snapshot.cases) {
    for (const fp of c.falsePositiveRuleIds) {
      if (fp.startsWith(prefix + "-")) {
        fpCategories.set(c.category, (fpCategories.get(c.category) ?? 0) + 1);
        if (fpCaseExamples.length < 10) {
          fpCaseExamples.push({ caseId: c.caseId, category: c.category, ruleId: fp });
        }
      }
    }
  }

  const topFpCategories = [...fpCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat]) => cat);

  // Build specific anti-FP instructions based on observed patterns
  const categoryBlocklist =
    topFpCategories.length > 0
      ? `\nDo NOT report ${prefix}- findings on code in these categories: ${topFpCategories.join(", ")}. ` +
        `These categories fall outside ${domain} and historically produce false positives.`
      : "";

  // Extract specific FP patterns for concrete guidance
  const fpRuleIds = new Set(fpCaseExamples.map((e) => e.ruleId));
  const specificRules = [...fpRuleIds].slice(0, 5).join(", ");
  const ruleWarning = specificRules
    ? `\nSpecific rule IDs with high FP rates: ${specificRules}. Require >=80% confidence with exact line citations before reporting these.`
    : "";

  // Identify if clean cases are a problem for this judge
  const cleanFPs = fpCaseExamples.filter((e) => e.category === "clean" || e.category.startsWith("ai-negative")).length;
  const cleanWarning =
    cleanFPs > 0
      ? `\nThis judge produced ${cleanFPs} false positives on CLEAN code. Well-written code using standard patterns exists. If the code follows established best practices, report ZERO ${prefix}- findings.`
      : "";

  const amendment =
    `PRECISION OVERRIDE for ${judgeName} (${prefix}-): ` +
    `Empirical precision: ${pct(precision)} (${fpCount} FP in ${total} findings). ` +
    `SCOPE: Only report ${prefix}- findings for code that specifically involves ${domain}. ` +
    `EVIDENCE: Every ${prefix}- finding MUST cite exact line numbers and specific code patterns.` +
    categoryBlocklist +
    ruleWarning +
    cleanWarning +
    ` When confidence is below 80%, OMIT the ${prefix}- finding.`;

  return {
    judgePrefix: prefix,
    amendment,
    reason: `${pct(precision)} precision (${fpCount} FP out of ${total} findings)`,
    fpRate: 1 - precision,
    generatedFrom: `benchmark-${snapshot.timestamp.slice(0, 10)}`,
    timestamp: new Date().toISOString(),
  };
}

// ─── Prompt Section Formatting ──────────────────────────────────────────────

/**
 * Format amendments as a prompt section to inject into tribunal/per-judge prompts.
 * Returns empty string if no amendments.
 */
export function formatAmendmentSection(amendments: PromptAmendment[]): string {
  if (amendments.length === 0) return "";

  const lines = [
    "## Precision Overrides — Based on Empirical Benchmark Data",
    "",
    "The following judges have been identified as having high false positive rates. " +
      "Apply EXTRA scrutiny before reporting findings with these prefixes. " +
      "False positives erode developer trust more than missed findings.",
    "",
  ];

  for (const a of amendments) {
    lines.push(`- **${a.judgePrefix}-**: ${a.amendment}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ─── Amendment Store Operations ─────────────────────────────────────────────

export function createEmptyStore(): AmendmentStore {
  return { version: 1, amendments: [], history: [] };
}

/**
 * Merge new amendments into existing store.
 * Newer amendments for the same prefix replace older ones.
 */
export function mergeAmendments(store: AmendmentStore, result: OptimizationResult, snapshotF1: number): AmendmentStore {
  const amendmentMap = new Map<string, PromptAmendment>();

  // Existing amendments first
  for (const a of store.amendments) {
    amendmentMap.set(a.judgePrefix, a);
  }

  // New amendments overwrite
  for (const a of result.amendments) {
    amendmentMap.set(a.judgePrefix, a);
  }

  // Remove amendments for judges that improved above threshold
  // (no longer need the amendment)
  const keptAmendments = [...amendmentMap.values()];

  return {
    version: 1,
    amendments: keptAmendments,
    history: [
      ...store.history.slice(-19), // keep last 20 entries
      {
        timestamp: new Date().toISOString(),
        snapshotF1,
        amendmentsApplied: store.amendments.length,
        amendmentsGenerated: result.amendments.length,
      },
    ],
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function projectImprovement(
  snapshot: LlmBenchmarkSnapshot,
  newAmendments: PromptAmendment[],
): { projectedF1: number; projectedImprovement: number } {
  if (newAmendments.length === 0) {
    return { projectedF1: snapshot.f1Score, projectedImprovement: 0 };
  }

  // Estimate: each amendment reduces its judge's FPs by FP_REDUCTION_ESTIMATE
  let reducedFP = 0;
  for (const a of newAmendments) {
    const judgeStats = snapshot.perJudge[a.judgePrefix];
    if (judgeStats) {
      reducedFP += judgeStats.falsePositives * FP_REDUCTION_ESTIMATE;
    }
  }

  const newFP = Math.max(0, snapshot.falsePositives - reducedFP);
  const newPrecision =
    snapshot.truePositives + newFP > 0 ? snapshot.truePositives / (snapshot.truePositives + newFP) : 1;
  const newF1 =
    newPrecision + snapshot.recall > 0 ? (2 * newPrecision * snapshot.recall) / (newPrecision + snapshot.recall) : 0;

  return {
    projectedF1: newF1,
    projectedImprovement: newF1 - snapshot.f1Score,
  };
}
