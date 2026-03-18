/**
 * LLM Benchmark — types, scoring, and formatting for the probabilistic
 * (LLM prompt) layer of the Judges Panel benchmark.
 *
 * This module does NOT make LLM API calls. It provides:
 * - Types for LLM benchmark snapshots
 * - Rule-ID parsing from LLM response text
 * - Prompt construction (mirrors MCP-served prompts exactly)
 * - Scoring logic (same methodology as L1 deterministic benchmark)
 *
 * LLM API calling is intentionally kept out of the npm package. Wire this
 * to your preferred provider in a thin runner script (or use the CLI
 * command `judges llm-benchmark`). The former helper script
 * `scripts/run-llm-benchmark.ts` has been removed.
 */

import type { JudgeDefinition } from "../types.js";
import type { BenchmarkCase, CategoryResult, JudgeBenchmarkResult, DifficultyResult } from "./benchmark.js";
import { JUDGES } from "../judges/index.js";
import { getCondensedCriteria, SHARED_ADVERSARIAL_MANDATE, PRECISION_MANDATE } from "../tools/prompts.js";
import { extractAndValidateLlmFindings, mergeFindings } from "../probabilistic/llm-response-validator.js";
import type { PromptAmendment } from "./llm-benchmark-optimizer.js";
import { formatAmendmentSection } from "./llm-benchmark-optimizer.js";

// ─── Tribunal Judge Filtering ───────────────────────────────────────────────
// Meta-judges that assess analysis quality rather than code quality produce
// near-100% false positives in single-pass tribunal mode and are excluded.
const TRIBUNAL_EXCLUDED_PREFIXES = new Set(["INTENT", "COH", "MFPR", "FPR", "OVER"]);
export const TRIBUNAL_JUDGES = JUDGES.filter((j) => !TRIBUNAL_EXCLUDED_PREFIXES.has(j.rulePrefix));

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LlmBenchmarkSnapshot {
  /** Timestamp of this LLM benchmark run */
  timestamp: string;
  /** Version of judges used */
  version: string;
  /** LLM model used (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  model: string;
  /** API provider (e.g. "openai", "anthropic") */
  provider: string;
  /** Prompt mode used: full-tribunal or per-judge */
  promptMode: "tribunal" | "per-judge";
  /** Total test cases run */
  totalCases: number;
  /** Cases where at least one expected rule was detected */
  detected: number;
  /** Cases where no expected rule was detected */
  missed: number;
  /** Total expected findings across all cases */
  totalExpected: number;
  /** True positives (prefix-based matching) */
  truePositives: number;
  /** False negatives (prefix-based matching) */
  falseNegatives: number;
  /** False positives */
  falsePositives: number;
  /** Precision: TP / (TP + FP) */
  precision: number;
  /** Recall: TP / (TP + FN) */
  recall: number;
  /** F1 Score */
  f1Score: number;
  /** Detection rate: cases detected / total cases */
  detectionRate: number;
  /** Per-category breakdown */
  perCategory: Record<string, CategoryResult>;
  /** Per-judge breakdown */
  perJudge: Record<string, JudgeBenchmarkResult>;
  /** Per-difficulty breakdown */
  perDifficulty: Record<string, DifficultyResult>;
  /** Individual case results */
  cases: LlmCaseResult[];
  /** Total tokens used (if available from API) */
  totalTokensUsed?: number;
  /** Total run duration in seconds */
  durationSeconds: number;
}

export interface LlmCaseResult {
  caseId: string;
  category: string;
  difficulty: string;
  passed: boolean;
  expectedRuleIds: string[];
  detectedRuleIds: string[];
  missedRuleIds: string[];
  falsePositiveRuleIds: string[];
  /** Raw LLM response text */
  rawResponse: string;
  /** Tokens used for this case */
  tokensUsed?: number;
}

// ─── Rule ID Parsing ────────────────────────────────────────────────────────

/**
 * Extract unique rule IDs from LLM response text.
 * Matches patterns like CYBER-001, SEC-003, AUTH-001, etc.
 */
export function getValidRulePrefixes(): Set<string> {
  return new Set(JUDGES.map((j) => j.rulePrefix));
}

export function parseLlmRuleIds(response: string): string[] {
  const validPrefixes = getValidRulePrefixes();
  const pattern = /\b([A-Z]{2,})-(\d{3})\b/g;
  const found = new Set<string>();
  let match;
  while ((match = pattern.exec(response)) !== null) {
    if (validPrefixes.has(match[1])) {
      found.add(match[0]);
    }
  }
  return [...found];
}

/**
 * Preferred entrypoint: extract findings from raw LLM text with validation. Falls back to regex rule-id scan.
 */
export function extractValidatedLlmFindings(response: string, prefixes?: Set<string>) {
  const validPrefixes = prefixes ?? getValidRulePrefixes();
  const primary = extractAndValidateLlmFindings(response, validPrefixes);
  // Fallback regex scan (for unstructured responses)
  const fallbackRuleIds = parseLlmRuleIds(response);
  return mergeFindings(primary, fallbackRuleIds);
}

// ─── Prompt Construction ────────────────────────────────────────────────────
// These construct the exact same prompts served via MCP, ensuring the
// benchmark tests the same prompts real users experience.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct a per-judge prompt — identical to the MCP-served `judge-{id}` prompt.
 * Uses condensed criteria (adversarial mandate stripped) plus shared mandates,
 * mirroring the tribunal architecture for consistency and better precision.
 */
export function constructPerJudgePrompt(
  judge: JudgeDefinition,
  code: string,
  language: string,
  contextSnippets: string[] = [],
  amendments?: PromptAmendment[],
): string {
  const persona = judge.systemPrompt.substring(0, judge.systemPrompt.indexOf("\n\n"));
  const criteria = getCondensedCriteria(judge.systemPrompt);
  const contextSection = contextSnippets.length
    ? `## Repository Context\n\n${contextSnippets.map((s) => `- ${s.replace(/\n/g, " ")}`).join("\n")}\n\n`
    : "";
  // Filter amendments to only those relevant to this judge
  const relevantAmendments = (amendments ?? []).filter((a) => a.judgePrefix === judge.rulePrefix);
  const amendmentSection = formatAmendmentSection(relevantAmendments);
  return (
    `${persona}\n\n` +
    `${SHARED_ADVERSARIAL_MANDATE}\n\n` +
    `${PRECISION_MANDATE}\n\n` +
    (amendmentSection ? `${amendmentSection}\n` : "") +
    contextSection +
    `${criteria}\n\n` +
    `Please evaluate the following ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` +
    `\n\nProvide your evaluation as structured findings with rule IDs (prefix: ${judge.rulePrefix}-), severity levels (critical/high/medium/low/info), descriptions, and actionable recommendations. If no issues meet the confidence threshold, report zero findings explicitly. End with an overall score (0-100) and verdict (pass/warning/fail).`
  );
}

/**
 * Construct the full-tribunal prompt — identical to the MCP-served `full-tribunal` prompt.
 */
export function constructTribunalPrompt(
  code: string,
  language: string,
  contextSnippets: string[] = [],
  amendments?: PromptAmendment[],
): string {
  const judgeInstructions = TRIBUNAL_JUDGES.map(
    (j) =>
      `### ${j.name} — ${j.domain}\n**Rule prefix:** \`${j.rulePrefix}-\`\n\n${getCondensedCriteria(j.systemPrompt)}`,
  ).join("\n\n---\n\n");

  const contextSection = contextSnippets.length
    ? `## Repository Context\n\n${contextSnippets.map((s) => `- ${s.replace(/\n/g, " ")}`).join("\n")}\n\n`
    : "";

  const amendmentSection = formatAmendmentSection(amendments ?? []);

  return (
    `You are the Judges Panel — a panel of ${TRIBUNAL_JUDGES.length} expert judges who independently evaluate code for quality, security, and operational readiness.\n\n` +
    `## Universal Evaluation Directives\n\n` +
    `${SHARED_ADVERSARIAL_MANDATE}\n\n` +
    `${PRECISION_MANDATE}\n\n` +
    `DOMAIN SCOPE DIRECTIVE (applies to ALL judges):\n` +
    `- Each judge MUST only report findings within their stated domain expertise.\n` +
    `- A CI/CD judge should NOT report authentication findings. An ethics judge should NOT report performance findings.\n` +
    `- If code falls entirely outside your domain (e.g., a YAML CI workflow being evaluated by the Database judge), report ZERO findings for that judge.\n` +
    `- Cross-domain observations should ONLY be reported by the judge whose domain they fall under.\n\n` +
    (amendmentSection ? `${amendmentSection}\n` : "") +
    contextSection +
    `## Evaluation Instructions\n\n` +
    `Evaluate the following ${language} code from the perspective of ALL ${TRIBUNAL_JUDGES.length} judges below. For each judge, provide:\n` +
    `1. Judge name and domain\n` +
    `2. Verdict (PASS / WARNING / FAIL)\n` +
    `3. Score (0-100)\n` +
    `4. Specific findings with rule IDs (using each judge's rule prefix), severity, and recommendations\n\n` +
    `For judges where no issues meet the confidence threshold, report a PASS verdict with zero findings.\n\n` +
    `Then provide an OVERALL TRIBUNAL VERDICT that synthesizes all judges' input.\n\n` +
    `## The Judges\n\n${judgeInstructions}\n\n` +
    `## Code to Evaluate\n\n\`\`\`${language}\n${code}\n\`\`\``
  );
}

// ─── Stratified Sampling ────────────────────────────────────────────────────

/**
 * Select a stratified sample of benchmark cases, ensuring representation
 * across categories, difficulties, and both clean/dirty cases.
 */
export function selectStratifiedSample(cases: BenchmarkCase[], targetSize: number): BenchmarkCase[] {
  if (targetSize >= cases.length) return [...cases];

  // Group by category
  const byCategory: Record<string, BenchmarkCase[]> = {};
  for (const c of cases) {
    if (!byCategory[c.category]) byCategory[c.category] = [];
    byCategory[c.category].push(c);
  }

  const categories = Object.keys(byCategory);
  const perCategory = Math.max(2, Math.floor(targetSize / categories.length));
  const selected: BenchmarkCase[] = [];
  const usedIds = new Set<string>();

  for (const cat of categories) {
    const pool = byCategory[cat];
    // Ensure difficulty coverage within each category
    const byDiff: Record<string, BenchmarkCase[]> = {};
    for (const c of pool) {
      if (!byDiff[c.difficulty]) byDiff[c.difficulty] = [];
      byDiff[c.difficulty].push(c);
    }

    let taken = 0;
    for (const diff of ["easy", "medium", "hard"]) {
      if (taken >= perCategory) break;
      const diffPool = byDiff[diff] || [];
      const remaining = perCategory - taken;
      const diffCount = diff === "easy" ? 3 : diff === "medium" ? 2 : 1;
      const toTake = Math.max(1, Math.ceil(remaining / diffCount));
      for (let i = 0; i < Math.min(toTake, diffPool.length) && taken < perCategory; i++) {
        if (!usedIds.has(diffPool[i].id)) {
          selected.push(diffPool[i]);
          usedIds.add(diffPool[i].id);
          taken++;
        }
      }
    }
  }

  // Fill remaining slots if under target
  if (selected.length < targetSize) {
    for (const c of cases) {
      if (selected.length >= targetSize) break;
      if (!usedIds.has(c.id)) {
        selected.push(c);
        usedIds.add(c.id);
      }
    }
  }

  return selected;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * Score a single LLM benchmark case using prefix-based matching.
 * Returns a fully populated LlmCaseResult.
 */
export function scoreLlmCase(
  tc: BenchmarkCase,
  detectedRuleIds: string[],
  rawResponse: string,
  tokensUsed?: number,
): LlmCaseResult {
  const detectedPrefixes = new Set(detectedRuleIds.map((r) => r.split("-")[0]));

  const matchedExpected = tc.expectedRuleIds.filter((expected) => {
    const prefix = expected.split("-")[0];
    return detectedPrefixes.has(prefix);
  });

  const missedExpected = tc.expectedRuleIds.filter((expected) => {
    const prefix = expected.split("-")[0];
    return !detectedPrefixes.has(prefix);
  });

  // For clean cases (no expected findings), ALL detections are false positives.
  // For dirty cases with unexpectedRuleIds, FPs are detections matching those prefixes.
  // For dirty cases WITHOUT unexpectedRuleIds, FPs are detections whose prefix
  // doesn't match any expected prefix (prevents silent over-reporting).
  const isCleanCase = tc.expectedRuleIds.length === 0;
  const expectedPrefixes = new Set(tc.expectedRuleIds.map((r) => r.split("-")[0]));
  const falsePositiveIds = isCleanCase
    ? detectedRuleIds
    : tc.unexpectedRuleIds
      ? detectedRuleIds.filter((found) => {
          const prefix = found.split("-")[0];
          return tc.unexpectedRuleIds!.some((u) => u.split("-")[0] === prefix);
        })
      : detectedRuleIds.filter((found) => {
          const prefix = found.split("-")[0];
          return !expectedPrefixes.has(prefix);
        });

  const casePassed = isCleanCase ? falsePositiveIds.length === 0 : matchedExpected.length > 0;

  return {
    caseId: tc.id,
    category: tc.category,
    difficulty: tc.difficulty,
    passed: casePassed,
    expectedRuleIds: tc.expectedRuleIds,
    detectedRuleIds,
    missedRuleIds: missedExpected,
    falsePositiveRuleIds: falsePositiveIds,
    rawResponse,
    tokensUsed,
  };
}

/**
 * Compute aggregate metrics for an LLM benchmark snapshot from raw case results.
 * Uses the same prefix-based matching methodology as the L1 benchmark.
 */
export function computeLlmMetrics(
  rawCases: LlmCaseResult[],
  version: string,
  model: string,
  provider: string,
  promptMode: "tribunal" | "per-judge",
  durationSeconds: number,
  totalTokensUsed?: number,
): LlmBenchmarkSnapshot {
  const perCategory: Record<string, CategoryResult> = {};
  const perJudge: Record<string, JudgeBenchmarkResult> = {};
  const perDifficulty: Record<string, DifficultyResult> = {};

  let totalTP = 0;
  let totalFN = 0;
  let totalFP = 0;
  let totalDetected = 0;

  for (const c of rawCases) {
    const caseTP = c.expectedRuleIds.length - c.missedRuleIds.length;
    const caseFN = c.missedRuleIds.length;
    const caseFP = c.falsePositiveRuleIds.length;

    if (c.passed) totalDetected++;
    totalTP += caseTP;
    totalFN += caseFN;
    totalFP += caseFP;

    // Per-difficulty
    if (!perDifficulty[c.difficulty]) {
      perDifficulty[c.difficulty] = { difficulty: c.difficulty, total: 0, detected: 0, detectionRate: 0 };
    }
    perDifficulty[c.difficulty].total++;
    if (c.passed) perDifficulty[c.difficulty].detected++;

    // Per-category
    if (!perCategory[c.category]) {
      perCategory[c.category] = {
        category: c.category,
        total: 0,
        detected: 0,
        truePositives: 0,
        falseNegatives: 0,
        falsePositives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
      };
    }
    const cat = perCategory[c.category];
    cat.total++;
    if (c.passed) cat.detected++;
    cat.truePositives += caseTP;
    cat.falseNegatives += caseFN;
    cat.falsePositives += caseFP;

    // Per-judge
    const expectedPrefixes = new Set(c.expectedRuleIds.map((r) => r.split("-")[0]));
    const isCleanCase = c.expectedRuleIds.length === 0;
    for (const ruleId of c.detectedRuleIds) {
      const prefix = ruleId.split("-")[0];
      if (!perJudge[prefix]) {
        perJudge[prefix] = {
          judgeId: prefix,
          total: 0,
          truePositives: 0,
          falseNegatives: 0,
          falsePositives: 0,
          precision: 0,
          recall: 0,
          f1Score: 0,
        };
      }
      const jb = perJudge[prefix];
      jb.total++;
      if (expectedPrefixes.has(prefix)) {
        jb.truePositives++;
      } else if (isCleanCase) {
        jb.falsePositives++;
      }
    }
  }

  // Compute aggregate metrics
  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Compute per-difficulty rates
  for (const d of Object.values(perDifficulty)) {
    d.detectionRate = d.total > 0 ? d.detected / d.total : 0;
  }

  // Compute per-category metrics
  for (const cat of Object.values(perCategory)) {
    cat.precision =
      cat.truePositives + cat.falsePositives > 0 ? cat.truePositives / (cat.truePositives + cat.falsePositives) : 1;
    cat.recall =
      cat.truePositives + cat.falseNegatives > 0 ? cat.truePositives / (cat.truePositives + cat.falseNegatives) : 1;
    cat.f1Score = cat.precision + cat.recall > 0 ? (2 * cat.precision * cat.recall) / (cat.precision + cat.recall) : 0;
  }

  // Compute per-judge metrics
  for (const jb of Object.values(perJudge)) {
    jb.precision =
      jb.truePositives + jb.falsePositives > 0 ? jb.truePositives / (jb.truePositives + jb.falsePositives) : 1;
    jb.recall =
      jb.truePositives + jb.falseNegatives > 0 ? jb.truePositives / (jb.truePositives + jb.falseNegatives) : 1;
    jb.f1Score = jb.precision + jb.recall > 0 ? (2 * jb.precision * jb.recall) / (jb.precision + jb.recall) : 0;
  }

  return {
    timestamp: new Date().toISOString(),
    version,
    model,
    provider,
    promptMode,
    totalCases: rawCases.length,
    detected: totalDetected,
    missed: rawCases.length - totalDetected,
    totalExpected: rawCases.reduce((s, c) => s + c.expectedRuleIds.length, 0),
    truePositives: totalTP,
    falseNegatives: totalFN,
    falsePositives: totalFP,
    precision,
    recall,
    f1Score,
    detectionRate: rawCases.length > 0 ? totalDetected / rawCases.length : 0,
    perCategory,
    perJudge,
    perDifficulty,
    cases: rawCases,
    durationSeconds,
    ...(totalTokensUsed ? { totalTokensUsed } : {}),
  };
}

// ─── Markdown Formatting ────────────────────────────────────────────────────

/**
 * Format an LLM benchmark snapshot as a markdown section for the benchmark report.
 */
export function formatLlmSnapshotMarkdown(snapshot: LlmBenchmarkSnapshot): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const l2Grade =
    snapshot.f1Score >= 0.9
      ? "A"
      : snapshot.f1Score >= 0.8
        ? "B"
        : snapshot.f1Score >= 0.7
          ? "C"
          : snapshot.f1Score >= 0.6
            ? "D"
            : "F";
  const l2GradeEmoji = l2Grade === "A" ? "🟢" : l2Grade === "B" ? "🟡" : l2Grade === "C" ? "🟠" : "🔴";

  lines.push("## Layer 2 — LLM Deep Review");
  lines.push("");
  lines.push(
    `> Model: **${snapshot.model}** · Provider: ${snapshot.provider} · ${snapshot.totalCases} test cases · ${new Date(snapshot.timestamp).toLocaleDateString()}`,
  );
  lines.push("");

  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Overall Grade | ${l2GradeEmoji} **${l2Grade}** |`);
  lines.push(`| Test Cases | ${snapshot.totalCases} |`);
  lines.push(`| Detection Rate | ${pct(snapshot.detectionRate)} (${snapshot.detected}/${snapshot.totalCases}) |`);
  lines.push(`| Precision | ${pct(snapshot.precision)} |`);
  lines.push(`| Recall | ${pct(snapshot.recall)} |`);
  lines.push(`| F1 Score | ${pct(snapshot.f1Score)} |`);
  lines.push(`| True Positives | ${snapshot.truePositives} |`);
  lines.push(`| False Negatives | ${snapshot.falseNegatives} |`);
  lines.push(`| False Positives | ${snapshot.falsePositives} |`);
  if (snapshot.totalTokensUsed) {
    lines.push(`| Total Tokens | ${snapshot.totalTokensUsed.toLocaleString()} |`);
  }
  lines.push(`| Run Duration | ${snapshot.durationSeconds}s |`);
  lines.push("");

  // Per-difficulty
  if (Object.keys(snapshot.perDifficulty).length > 0) {
    lines.push("### L2 Detection by Difficulty");
    lines.push("");
    lines.push("| Difficulty | Detected | Total | Rate |");
    lines.push("|------------|----------|-------|------|");
    for (const diff of ["easy", "medium", "hard"]) {
      const d = snapshot.perDifficulty[diff];
      if (d) {
        lines.push(`| ${diff} | ${d.detected} | ${d.total} | ${pct(d.detectionRate)} |`);
      }
    }
    lines.push("");
  }

  // Per-category
  if (Object.keys(snapshot.perCategory).length > 0) {
    lines.push("### L2 Results by Category");
    lines.push("");
    lines.push("| Category | Detected | Total | Precision | Recall | F1 |");
    lines.push("|----------|----------|-------|-----------|--------|-----|");
    for (const [cat, stats] of Object.entries(snapshot.perCategory).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        `| ${cat} | ${stats.detected} | ${stats.total} | ${pct(stats.precision)} | ${pct(stats.recall)} | ${pct(stats.f1Score)} |`,
      );
    }
    lines.push("");
  }

  // Per-judge
  if (Object.keys(snapshot.perJudge).length > 0) {
    lines.push("### L2 Results by Judge");
    lines.push("");
    lines.push("| Judge | Findings | TP | FP | Precision |");
    lines.push("|-------|----------|-----|-----|-----------|");
    for (const [judgeId, stats] of Object.entries(snapshot.perJudge).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        `| ${judgeId} | ${stats.total} | ${stats.truePositives} | ${stats.falsePositives} | ${pct(stats.precision)} |`,
      );
    }
    lines.push("");
  }

  // Failed cases
  const failed = snapshot.cases.filter((c) => !c.passed);
  if (failed.length > 0 && failed.length <= 50) {
    lines.push("### L2 Failed Cases");
    lines.push("");
    lines.push("| Case | Difficulty | Category | Missed Rules | False Positives |");
    lines.push("|------|------------|----------|--------------|-----------------|");
    for (const c of failed) {
      const missed = c.missedRuleIds.length > 0 ? c.missedRuleIds.join(", ") : "—";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "—";
      lines.push(`| ${c.caseId} | ${c.difficulty} | ${c.category} | ${missed} | ${fps} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a layer comparison table showing L1 vs L2 side by side.
 */
export function formatLayerComparisonMarkdown(
  l1: {
    detectionRate: number;
    precision: number;
    recall: number;
    f1Score: number;
    falsePositives: number;
    totalCases: number;
  },
  l2: LlmBenchmarkSnapshot,
): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  lines.push("## Layer Comparison");
  lines.push("");
  lines.push(`| Metric | L1 (Deterministic) | L2 (${l2.model}) |`);
  lines.push(`|--------|-------------------|${"-".repeat(Math.max(l2.model.length + 4, 5))}|`);
  lines.push(`| Test Cases | ${l1.totalCases} | ${l2.totalCases} |`);
  lines.push(`| Detection Rate | ${pct(l1.detectionRate)} | ${pct(l2.detectionRate)} |`);
  lines.push(`| Precision | ${pct(l1.precision)} | ${pct(l2.precision)} |`);
  lines.push(`| Recall | ${pct(l1.recall)} | ${pct(l2.recall)} |`);
  lines.push(`| F1 Score | ${pct(l1.f1Score)} | ${pct(l2.f1Score)} |`);
  lines.push(`| False Positives | ${l1.falsePositives} | ${l2.falsePositives} |`);
  lines.push("");
  lines.push("The two layers are **complementary**:");
  lines.push("- **L1** provides fast, reliable baseline detection with high precision and zero cost");
  lines.push("- **L2** catches sophisticated issues that patterns miss, at the cost of API calls and latency");
  lines.push("- Together, they deliver defense-in-depth code analysis");
  lines.push("");

  return lines.join("\n");
}
