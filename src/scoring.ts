/**
 * Confidence Scoring, Must-Fix Gate & File-Type Gating
 *
 * Extracted from the evaluators monolith for clean separation of concerns.
 * Handles confidence estimation for findings, the must-fix safety gate,
 * and absence-based finding suppression for non-server files.
 */

import type { Finding, MustFixGateOptions, MustFixGateResult, EvidenceChain, EvidenceStep } from "./types.js";

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
  return estimateFindingConfidenceWithBasis(finding).confidence;
}

/** Score line-level precision (Tier 1) */
function scoreLinePrecision(lineCount: number, signals: string[]): number {
  if (lineCount === 0) {
    signals.push("no line numbers (-0.15)");
    return -0.15;
  }
  if (lineCount <= 3) {
    signals.push(`line-precise: ${lineCount} line(s) (+0.22)`);
    return 0.22;
  }
  if (lineCount <= 8) {
    signals.push(`line range: ${lineCount} lines (+0.14)`);
    return 0.14;
  }
  signals.push(`broad range: ${lineCount} lines (+0.06)`);
  return 0.06;
}

/** Score pattern-match specificity (Tier 2) */
function scorePatternSpecificity(
  description: string,
  reference: string | undefined,
  signals: string[],
): { delta: number; hasExactApiMatch: boolean } {
  let delta = 0;
  const hasExactApiMatch =
    /\b(?:eval|exec|innerHTML|dangerouslySetInnerHTML|createConnection|query)\b/i.test(description) ||
    /\b(?:document\.write|child_process|\.exec\(|\.execSync)\b/i.test(description);
  const combined = description + (reference ?? "");
  const hasCveReference = /CVE-\d{4}-\d+/i.test(combined);
  const hasCweReference = /CWE-\d+/i.test(combined);

  if (hasExactApiMatch) {
    delta += 0.12;
    signals.push("exact API match (+0.12)");
  }
  if (hasCveReference) {
    delta += 0.08;
    signals.push("CVE reference (+0.08)");
  }
  if (hasCweReference) {
    delta += 0.05;
    signals.push("CWE reference (+0.05)");
  }
  return { delta, hasExactApiMatch };
}

/** Score structured evidence presence (Tier 3) */
function scoreStructuredEvidence(
  finding: Finding,
  signals: string[],
): {
  delta: number;
  hasReference: boolean;
  hasSuggestedFix: boolean;
  hasRichDescription: boolean;
  hasRichRecommendation: boolean;
} {
  let delta = 0;
  const hasReference = Boolean(finding.reference);
  const hasSuggestedFix = Boolean(finding.suggestedFix);
  const hasRichDescription = finding.description.length >= 120;
  const hasRichRecommendation = finding.recommendation.length >= 90;

  if (hasReference) {
    delta += 0.06;
    signals.push("has reference (+0.06)");
  }
  if (hasSuggestedFix) {
    delta += 0.08;
    signals.push("has suggested fix (+0.08)");
  }
  if (hasRichDescription) {
    delta += 0.03;
    signals.push("rich description (+0.03)");
  }
  if (hasRichRecommendation) {
    delta += 0.03;
    signals.push("rich recommendation (+0.03)");
  }
  return { delta, hasReference, hasSuggestedFix, hasRichDescription, hasRichRecommendation };
}

/** Score absence-based findings (Tier 4) */
function scoreAbsencePattern(descLower: string, lineCount: number, signals: string[]): number {
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
    signals.push("absence-based pattern (-0.10)");
    return -0.1;
  }
  return 0;
}

/** Score provenance signals (Tier 5) */
function scoreProvenance(
  provenance: string | undefined,
  signals: string[],
): { delta: number; isAstConfirmed: boolean; isTaintFlow: boolean } {
  let delta = 0;
  const prov = (provenance ?? "").toLowerCase();
  const isAstConfirmed = prov.includes("ast-confirmed") || prov.includes("tree-sitter");
  const isTaintFlow = prov.includes("taint-flow") || prov.includes("cross-file-taint");
  const isRegexConfirmed = prov.includes("regex-pattern-match");

  if (isAstConfirmed) {
    delta += 0.15;
    signals.push("AST-confirmed (+0.15)");
  }
  if (isTaintFlow) {
    delta += 0.18;
    signals.push("taint-flow confirmed (+0.18)");
  }
  if (isRegexConfirmed && !isAstConfirmed) {
    delta += 0.08;
    signals.push("regex-pattern match (+0.08)");
  }
  return { delta, isAstConfirmed, isTaintFlow };
}

/** Score domain-severity alignment (Tier 6) */
function scoreDomainAlignment(ruleId: string, severity: string, signals: string[]): number {
  const securityPrefixes = ["CYBER-", "AUTH-", "DATA-", "AICS-", "IAC-"];
  if (securityPrefixes.some((p) => ruleId.startsWith(p)) && (severity === "critical" || severity === "high")) {
    signals.push("security domain alignment (+0.04)");
    return 0.04;
  }
  return 0;
}

/** Apply noise cap for noisy evaluator domains */
function applyNoiseCap(score: number, ruleId: string, richEvidenceCount: number, signals: string[]): number {
  if (richEvidenceCount >= 4) return score;

  const tiers: [string[], number, string][] = [
    [["COMP-", "ETHICS-", "SOV-", "COST-", "DOC-"], 0.82, "advisory domain cap (→0.82)"],
    [["API-", "CONC-", "DB-", "DEPS-", "LOGPRIV-", "OBS-", "PERF-"], 0.88, "moderate noise cap (→0.88)"],
    [["CACHE-", "CFG-", "COMPAT-", "MAINT-", "SWDEV-", "TEST-"], 0.92, "occasional noise cap (→0.92)"],
  ];

  for (const [prefixes, cap, label] of tiers) {
    if (prefixes.some((p) => ruleId.startsWith(p))) {
      const capped = Math.min(score, cap);
      if (capped < score) {
        signals.push(label);
        return capped;
      }
      return score;
    }
  }
  return score;
}

/**
 * Estimate confidence for a finding and return both the numeric score and
 * a human-readable explanation of the evidence signals that contributed.
 */
export function estimateFindingConfidenceWithBasis(finding: Finding): {
  confidence: number;
  evidenceBasis: string;
} {
  const existing = typeof finding.confidence === "number" ? finding.confidence : undefined;
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return { confidence: clampConfidence(existing), evidenceBasis: "pre-set by evaluator" };
  }

  let score = 0.4;
  const signals: string[] = [];
  const lineCount = finding.lineNumbers?.length ?? 0;

  score += scoreLinePrecision(lineCount, signals);

  const { delta: patternDelta, hasExactApiMatch } = scorePatternSpecificity(
    finding.description,
    finding.reference,
    signals,
  );
  score += patternDelta;

  const {
    delta: evidenceDelta,
    hasReference,
    hasSuggestedFix,
    hasRichDescription,
    hasRichRecommendation,
  } = scoreStructuredEvidence(finding, signals);
  score += evidenceDelta;

  score += scoreAbsencePattern(finding.description.toLowerCase(), lineCount, signals);

  const { delta: provDelta, isAstConfirmed, isTaintFlow } = scoreProvenance(finding.provenance, signals);
  score += provDelta;

  score += scoreDomainAlignment(finding.ruleId, finding.severity, signals);

  const richEvidenceCount = [
    hasReference,
    hasSuggestedFix,
    hasRichDescription,
    hasRichRecommendation,
    hasExactApiMatch,
    lineCount > 0,
    isAstConfirmed,
    isTaintFlow,
  ].filter(Boolean).length;

  score = applyNoiseCap(score, finding.ruleId, richEvidenceCount, signals);

  const finalConfidence = Number(clampConfidence(score).toFixed(2));
  return {
    confidence: finalConfidence,
    evidenceBasis: signals.length > 0 ? signals.join(", ") : "base heuristic (0.40)",
  };
}

export function applyConfidenceThreshold(findings: Finding[], options?: ScoringOptions): Finding[] {
  const minConfidence = clampConfidence(options?.minConfidence ?? 0);

  const normalized = findings.map((finding) => {
    const { confidence, evidenceBasis } = estimateFindingConfidenceWithBasis(finding);
    return { ...finding, confidence, evidenceBasis };
  });

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
  "SOV-", // sovereignty — "no sovereignty evidence" is project-level, not per-file
  "DOC-", // documentation — "no docs" is project-level
  "MAINT-", // maintainability — "no linting" is project-level
  "SWDEV-", // software dev practices — "no build script" is project-level
  "COST-", // cost — "no cost controls" is project-level
  "COMP-", // compliance — absence of compliance is project-level
  "TEST-", // testing — "no tests" is project-level
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

  // Project-level findings (CI/CD, pipeline, monitoring, etc.) ARE absence-based.
  // They should be gated on non-server files just like other absence findings.
  // Previously excluded, but cross-project analysis showed this caused massive
  // noise: e.g. "No test infrastructure detected" firing 618 times per-file.

  return true;
}

/**
 * Build a structured evidence chain for a finding based on its metadata.
 * This transforms the flat `evidenceBasis` and `provenance` strings into
 * a step-by-step chain explaining why the finding matters in context.
 */
export function buildEvidenceChain(finding: Finding): EvidenceChain {
  const steps: EvidenceStep[] = [];
  const prov = (finding.provenance ?? "").toLowerCase();

  // Step 1: Detection trigger
  if (prov.includes("taint-flow") || prov.includes("cross-file-taint")) {
    steps.push({
      observation: `Taint-flow analysis detected untrusted data reaching a dangerous sink`,
      source: "taint-flow",
      line: finding.lineNumbers?.[0],
    });
  } else if (prov.includes("ast-confirmed") || prov.includes("tree-sitter")) {
    steps.push({
      observation: `AST analysis confirmed structural pattern: ${finding.title}`,
      source: "ast-confirmed",
      line: finding.lineNumbers?.[0],
    });
  } else if (prov.includes("absence")) {
    steps.push({
      observation: `No evidence of expected security control: ${finding.title}`,
      source: "absence-of-pattern",
    });
  } else {
    steps.push({
      observation: `Pattern match detected: ${finding.title}`,
      source: "pattern-match",
      line: finding.lineNumbers?.[0],
    });
  }

  // Step 2: Location precision
  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    const lines =
      finding.lineNumbers.length === 1
        ? `line ${finding.lineNumbers[0]}`
        : `lines ${finding.lineNumbers[0]}-${finding.lineNumbers[finding.lineNumbers.length - 1]}`;
    steps.push({
      observation: `Issue pinpointed at ${lines}`,
      source: prov.includes("ast") ? "ast-confirmed" : "pattern-match",
      line: finding.lineNumbers[0],
    });
  }

  // Step 3: Cross-file context (if applicable)
  if (prov.includes("cross-file")) {
    steps.push({
      observation: `Data flow crosses module boundaries — impact extends beyond this file`,
      source: "cross-file",
    });
  }

  // Build impact statement from severity + domain
  const severity = finding.severity;
  const domain = finding.ruleId.split("-")[0];
  const domainNames: Record<string, string> = {
    CYBER: "security",
    AUTH: "authentication",
    DATA: "data protection",
    SEC: "security",
    IAC: "infrastructure security",
    AICS: "AI safety",
    PERF: "performance",
    API: "API design",
    COMP: "compliance",
  };
  const domainName = domainNames[domain] || "code quality";
  const impactStatement = `${severity === "critical" || severity === "high" ? "High" : "Moderate"}-impact ${domainName} concern: ${finding.description.slice(0, 120)}`;

  return { steps, impactStatement };
}

// ─── OWASP LLM Top 10 (2025) Mapping ────────────────────────────────────────
//
// Maps rule-ID prefixes and finding patterns to OWASP Top 10 for LLM
// Applications categories. This helps teams track AI-specific risks
// when using LLM-generated code.
//
// Reference: https://owasp.org/www-project-top-10-for-large-language-model-applications/
// ──────────────────────────────────────────────────────────────────────────────

interface OwaspLlmMapping {
  id: string;
  title: string;
  /** Rule prefixes that map to this category */
  prefixes: string[];
  /** Keywords in finding titles/descriptions that suggest this category */
  keywords: RegExp;
}

const OWASP_LLM_TOP_10: OwaspLlmMapping[] = [
  {
    id: "LLM01",
    title: "Prompt Injection",
    prefixes: ["AICS", "INTENT"],
    keywords: /prompt\s*inject|system\s*prompt|instruction\s*override|jailbreak|input\s*manipulat/i,
  },
  {
    id: "LLM02",
    title: "Insecure Output Handling",
    prefixes: [],
    keywords: /unsanitized\s*output|output\s*inject|xss.*llm|unescaped.*response|raw.*ai.*output/i,
  },
  {
    id: "LLM03",
    title: "Training Data Poisoning",
    prefixes: [],
    keywords: /training\s*data|data\s*poison|model\s*integrity|backdoor.*model/i,
  },
  {
    id: "LLM04",
    title: "Model Denial of Service",
    prefixes: ["RATE"],
    keywords: /model\s*dos|token\s*limit|resource\s*exhaust.*llm|api\s*rate.*ai|unbounded.*prompt/i,
  },
  {
    id: "LLM05",
    title: "Supply Chain Vulnerabilities",
    prefixes: ["DEPS"],
    keywords: /supply\s*chain|typosquat|dependency.*vuln|malicious.*package|compromised.*model/i,
  },
  {
    id: "LLM06",
    title: "Sensitive Information Disclosure",
    prefixes: ["DATA", "LOG"],
    keywords: /pii\s*leak|sensitive.*expos|credential.*log|secret.*output|data\s*exfiltrat/i,
  },
  {
    id: "LLM07",
    title: "Insecure Plugin Design",
    prefixes: [],
    keywords: /plugin.*insecur|tool.*inject|function\s*call.*unvalidat|agent.*permiss/i,
  },
  {
    id: "LLM08",
    title: "Excessive Agency",
    prefixes: ["AGENT"],
    keywords: /excessive.*agenc|autonomous.*action|unrestricted.*tool|agent.*privilege|over-permissive/i,
  },
  {
    id: "LLM09",
    title: "Overreliance",
    prefixes: ["HALLU", "MFING"],
    keywords: /hallucin|overrelian|fabricat|confabulat|phantom.*api|invented.*function/i,
  },
  {
    id: "LLM10",
    title: "Model Theft",
    prefixes: [],
    keywords: /model\s*theft|model\s*extract|weight.*exfiltrat|api\s*key.*model/i,
  },
];

/**
 * Map a finding to its OWASP LLM Top 10 category, if applicable.
 * Returns the formatted string (e.g. "LLM01: Prompt Injection") or undefined.
 */
export function mapToOwaspLlmTop10(finding: Finding): string | undefined {
  const prefix = finding.ruleId.split("-")[0];
  const text = `${finding.title} ${finding.description}`;

  for (const entry of OWASP_LLM_TOP_10) {
    if (entry.prefixes.includes(prefix) || entry.keywords.test(text)) {
      return `${entry.id}: ${entry.title}`;
    }
  }
  return undefined;
}
