/**
 * Confidence Scoring, Must-Fix Gate & File-Type Gating
 *
 * Extracted from the evaluators monolith for clean separation of concerns.
 * Handles confidence estimation for findings, the must-fix safety gate,
 * and absence-based finding suppression for non-server files.
 */

import type { Finding, MustFixGateOptions, MustFixGateResult } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal evaluation options needed by scoring functions */
export interface ScoringOptions {
  minConfidence?: number;
}

// ─── Must-Fix Gate ───────────────────────────────────────────────────────────

const DEFAULT_MUST_FIX_PREFIXES = [
  "AUTH-",
  "CYBER-",
  "DATA-",
  "ERR-",
  "REL-",
  "RATE-",
  "DB-",
  "COMP-",
  "LOGPRIV-",
  "AICS-",
];

export function evaluateMustFixGate(findings: Finding[], options?: MustFixGateOptions): MustFixGateResult | undefined {
  if (!options?.enabled) {
    return undefined;
  }

  const minConfidence = clampConfidence(options.minConfidence ?? 0.85);
  const prefixes = options.dangerousRulePrefixes?.length ? options.dangerousRulePrefixes : DEFAULT_MUST_FIX_PREFIXES;

  const dangerSignal =
    /(injection|command\s*execution|sql|xss|ssrf|deseriali[sz]ation|auth(?:entication|orization)?\s*bypass|hardcoded\s+(?:secret|credential|password|token)|unsafe\s+eval|\beval\(|\bexec\()/i;

  const matched = findings.filter((finding) => {
    const severityMatch = finding.severity === "critical" || finding.severity === "high";
    if (!severityMatch) return false;

    const confidence = finding.confidence ?? 0;
    if (confidence < minConfidence) return false;

    const prefixMatch = prefixes.some((prefix: string) => finding.ruleId.startsWith(prefix));
    const contentMatch = dangerSignal.test(`${finding.title} ${finding.description} ${finding.recommendation}`);
    return prefixMatch || contentMatch;
  });

  const matchedRuleIds = [...new Set(matched.map((finding) => finding.ruleId))];
  const triggered = matched.length > 0;

  return {
    enabled: true,
    triggered,
    minConfidence,
    matchedCount: matched.length,
    matchedRuleIds,
    summary: triggered
      ? `Must-fix gate triggered by ${matched.length} high-confidence dangerous finding(s).`
      : "Must-fix gate passed with no high-confidence dangerous findings.",
  };
}

// ─── Confidence Estimation ───────────────────────────────────────────────────

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function estimateFindingConfidence(finding: Finding): number {
  const existing = typeof finding.confidence === "number" ? finding.confidence : undefined;
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return clampConfidence(existing);
  }

  let score = 0.4;

  // ── Evidence tier 1: Line-level precision ──────────────────────────────
  const lineCount = finding.lineNumbers?.length ?? 0;
  if (lineCount === 0) {
    score -= 0.15;
  } else if (lineCount <= 3) {
    score += 0.22;
  } else if (lineCount <= 8) {
    score += 0.14;
  } else {
    score += 0.06;
  }

  // ── Evidence tier 2: Pattern-match specificity ─────────────────────────
  const descLower = finding.description.toLowerCase();
  const hasExactApiMatch =
    /\b(?:eval|exec|innerHTML|dangerouslySetInnerHTML|createConnection|query)\b/i.test(finding.description) ||
    /\b(?:document\.write|child_process|\.exec\(|\.execSync)\b/i.test(finding.description);
  const hasCveReference = /CVE-\d{4}-\d+/i.test(finding.description + (finding.reference ?? ""));
  const hasCweReference = /CWE-\d+/i.test(finding.description + (finding.reference ?? ""));

  if (hasExactApiMatch) score += 0.12;
  if (hasCveReference) score += 0.08;
  if (hasCweReference) score += 0.05;

  // ── Evidence tier 3: Structured evidence ───────────────────────────────
  const hasReference = Boolean(finding.reference);
  const hasSuggestedFix = Boolean(finding.suggestedFix);
  const hasRichDescription = finding.description.length >= 120;
  const hasRichRecommendation = finding.recommendation.length >= 90;

  if (hasReference) score += 0.06;
  if (hasSuggestedFix) score += 0.08;
  if (hasRichDescription) score += 0.03;
  if (hasRichRecommendation) score += 0.03;

  // ── Evidence tier 4: Absence-based findings are inherently lower confidence
  const absenceKeywords = [
    "no .* found",
    "missing",
    "absent",
    "not detected",
    "should (?:have|include|implement)",
    "consider (?:adding|implementing)",
  ];
  const isAbsenceLike = absenceKeywords.some((kw) => new RegExp(kw, "i").test(descLower));
  if (isAbsenceLike && lineCount === 0) {
    score -= 0.1;
  }

  // ── Noisy evaluator cap: prevent low-evidence findings from inflating ──
  const richEvidenceCount = [
    hasReference,
    hasSuggestedFix,
    hasRichDescription,
    hasRichRecommendation,
    hasExactApiMatch,
    lineCount > 0,
  ].filter(Boolean).length;

  const noisyPrefixes = ["API-", "COMP-", "CONC-", "CYBER-", "DB-", "DEPS-", "ETHICS-", "LOGPRIV-", "OBS-", "PERF-"];

  if (noisyPrefixes.some((prefix) => finding.ruleId.startsWith(prefix)) && richEvidenceCount < 4) {
    score = Math.min(score, 0.89);
  }

  return Number(clampConfidence(score).toFixed(2));
}

export function applyConfidenceThreshold(findings: Finding[], options?: ScoringOptions): Finding[] {
  const minConfidence = clampConfidence(options?.minConfidence ?? 0);

  const normalized = findings.map((finding) => ({
    ...finding,
    confidence: estimateFindingConfidence(finding),
  }));

  if (minConfidence <= 0) {
    return normalized;
  }

  return normalized.filter((finding) => (finding.confidence ?? 0) >= minConfidence);
}

// ─── Absence-Based Finding Gating ────────────────────────────────────────────

/**
 * Rule ID prefixes whose absence-based findings should be suppressed on
 * non-server files. These are evaluators that primarily check for missing
 * infrastructure (rate limiting, health checks, auth middleware, etc.)
 * which would be meaningless on utility/type/test files.
 */
const ABSENCE_GATED_PREFIXES = [
  "RATE-",
  "AUTH-",
  "OBS-",
  "CLOUD-",
  "CICD-",
  "CACHE-",
  "COMPAT-",
  "API-",
  "CFG-",
  "SCALE-",
  "REL-",
  "ERR-",
];

export function isAbsenceBasedFinding(finding: Finding): boolean {
  // Explicit flag from the evaluator takes precedence
  if (finding.isAbsenceBased === true) {
    return true;
  }

  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    return false;
  }
  if (!ABSENCE_GATED_PREFIXES.some((p) => finding.ruleId.startsWith(p))) {
    return false;
  }
  const hasAbsenceTitle =
    /^No\s|(?:not|without|missing|no)\s.*(?:detected|configured|set|defined|endpoint|middleware|protection|handler|strategy|limiting)|(?:without|lacks?|missing)\s/i.test(
      finding.title,
    );
  if (!hasAbsenceTitle) return false;

  const projectLevelKeywords = /\b(?:ci[\s/]cd|pipeline|deployment|infrastructure|monitoring|alerting|backup)\b/i;
  if (projectLevelKeywords.test(finding.title)) {
    return false;
  }

  return true;
}
