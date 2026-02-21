import { JUDGES, getJudge } from "../judges/index.js";
import {
  EvidenceBundleV2,
  EvaluationContextV2,
  Finding,
  PolicyProfile,
  Severity,
  SpecializedFindingV2,
  SpecialtyFeedbackV2,
  TribunalVerdict,
  TribunalVerdictV2,
  UncertaintyReportV2,
  Verdict,
} from "../types.js";
import { evaluateProject, evaluateWithTribunal } from "./index.js";
import { calculateScore, deriveVerdict } from "./shared.js";

type PolicyEscalationRule = {
  prefixes: string[];
  minimumSeverity?: Severity;
};

const POLICY_ESCALATIONS: Record<PolicyProfile, PolicyEscalationRule[]> = {
  default: [],
  startup: [
    { prefixes: ["PERF", "REL"], minimumSeverity: "medium" },
  ],
  regulated: [
    { prefixes: ["COMP", "DATA", "CYBER", "SOV", "LOGPRIV"], minimumSeverity: "high" },
  ],
  healthcare: [
    { prefixes: ["COMP", "DATA", "LOGPRIV", "AUTH"], minimumSeverity: "high" },
  ],
  fintech: [
    { prefixes: ["AUTH", "CYBER", "COMP", "DB", "RATE"], minimumSeverity: "high" },
  ],
  "public-sector": [
    { prefixes: ["SOV", "COMP", "CYBER", "CFG"], minimumSeverity: "high" },
  ],
};

const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function elevateSeverity(severity: Severity, minimumSeverity: Severity): Severity {
  return severityRank[severity] >= severityRank[minimumSeverity]
    ? severity
    : minimumSeverity;
}

function mapSpecialty(ruleId: string): string {
  const prefix = ruleId.split("-")[0];
  const map: Record<string, string> = {
    DATA: "Data Security",
    CYBER: "Cybersecurity",
    COST: "Cost Effectiveness",
    SCALE: "Scalability",
    CLOUD: "Cloud Readiness",
    SWDEV: "Software Practices",
    A11Y: "Accessibility",
    API: "API Design",
    REL: "Reliability",
    OBS: "Observability",
    PERF: "Performance",
    COMP: "Compliance",
    SOV: "Data Sovereignty",
    TEST: "Testing",
    DOC: "Documentation",
    I18N: "Internationalization",
    DEPS: "Dependency Health",
    CONC: "Concurrency",
    ETHICS: "Ethics & Bias",
    MAINT: "Maintainability",
    ERR: "Error Handling",
    AUTH: "Authentication",
    DB: "Database",
    CACHE: "Caching",
    CFG: "Configuration Management",
    COMPAT: "Backwards Compatibility",
    PORTA: "Portability",
    UX: "UX",
    LOGPRIV: "Logging Privacy",
    RATE: "Rate Limiting",
    CICD: "CI/CD",
    STRUCT: "Code Structure",
    AGENT: "Agent Instructions",
    ARCH: "Architecture",
    SUPPLY: "Dependency Supply Chain",
  };

  return map[prefix] ?? "General";
}

function mapJudgeIdFromRule(ruleId: string): string | undefined {
  const prefix = ruleId.split("-")[0];
  const map: Record<string, string> = {
    DATA: "data-security",
    CYBER: "cybersecurity",
    COST: "cost-effectiveness",
    SCALE: "scalability",
    CLOUD: "cloud-readiness",
    SWDEV: "software-practices",
    A11Y: "accessibility",
    API: "api-design",
    REL: "reliability",
    OBS: "observability",
    PERF: "performance",
    COMP: "compliance",
    SOV: "data-sovereignty",
    TEST: "testing",
    DOC: "documentation",
    I18N: "internationalization",
    DEPS: "dependency-health",
    CONC: "concurrency",
    ETHICS: "ethics-bias",
    MAINT: "maintainability",
    ERR: "error-handling",
    AUTH: "authentication",
    DB: "database",
    CACHE: "caching",
    CFG: "configuration-management",
    COMPAT: "backwards-compatibility",
    PORTA: "portability",
    UX: "ux",
    LOGPRIV: "logging-privacy",
    RATE: "rate-limiting",
    CICD: "ci-cd",
    STRUCT: "code-structure",
    AGENT: "agent-instructions",
    ARCH: "software-practices",
    SUPPLY: "dependency-health",
  };

  return map[prefix];
}

function applyPolicyProfile(findings: Finding[], profile: PolicyProfile): Finding[] {
  const rules = POLICY_ESCALATIONS[profile] ?? [];
  if (rules.length === 0) return findings;

  return findings.map((finding) => {
    const prefix = finding.ruleId.split("-")[0];
    const match = rules.find((rule) => rule.prefixes.includes(prefix));
    if (!match || !match.minimumSeverity) return finding;

    return {
      ...finding,
      severity: elevateSeverity(finding.severity, match.minimumSeverity),
    };
  });
}

function confidenceForFinding(
  finding: Finding,
  context?: EvaluationContextV2,
  evidence?: EvidenceBundleV2
): { confidence: number; evidenceBasis: string[] } {
  let confidence = 0.4;
  const evidenceBasis: string[] = [];

  if (finding.lineNumbers && finding.lineNumbers.length > 0) {
    confidence += 0.2;
    evidenceBasis.push("line-level signal");
  }

  if (finding.reference) {
    confidence += 0.1;
    evidenceBasis.push("standards reference");
  }

  if (finding.suggestedFix) {
    confidence += 0.05;
    evidenceBasis.push("suggested fix");
  }

  if (context?.architectureNotes || context?.constraints?.length || context?.standards?.length) {
    confidence += 0.1;
    evidenceBasis.push("context provided");
  }

  if (
    evidence?.testSummary ||
    evidence?.coveragePercent !== undefined ||
    evidence?.p95LatencyMs !== undefined ||
    evidence?.dependencyVulnerabilityCount !== undefined
  ) {
    confidence += 0.1;
    evidenceBasis.push("runtime evidence");
  }

  if (finding.severity === "critical" || finding.severity === "high") {
    confidence += 0.03;
    evidenceBasis.push("high-severity pattern");
  }

  return {
    confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))),
    evidenceBasis,
  };
}

function buildUncertainty(
  context?: EvaluationContextV2,
  evidence?: EvidenceBundleV2
): UncertaintyReportV2 {
  const assumptions: string[] = [];
  const missingEvidence: string[] = [];
  const escalationRecommendations: string[] = [];

  if (!context?.architectureNotes) {
    assumptions.push("Architecture intent inferred from code patterns.");
    missingEvidence.push("Architecture notes / ADR excerpts");
  }

  if (!context?.constraints?.length) {
    assumptions.push("Business and compliance constraints were inferred.");
    missingEvidence.push("Explicit SLO/regulatory constraint list");
  }

  if (evidence?.coveragePercent === undefined) {
    missingEvidence.push("Test coverage percentage");
  }

  if (!evidence?.testSummary) {
    missingEvidence.push("Test execution summary");
  }

  if (evidence?.dependencyVulnerabilityCount === undefined) {
    missingEvidence.push("Dependency vulnerability scan results");
  }

  if (missingEvidence.length > 0) {
    escalationRecommendations.push(
      "Provide missing artifacts and re-run V2 evaluation to improve confidence calibration."
    );
  }

  if (!context?.dataBoundaryModel) {
    escalationRecommendations.push(
      "Add data-boundary model notes for stronger sovereignty/privacy judgments."
    );
  }

  return {
    assumptions,
    missingEvidence,
    escalationRecommendations,
  };
}

function summarizeV2(
  calibratedVerdict: Verdict,
  calibratedScore: number,
  findings: SpecializedFindingV2[],
  confidence: number,
  policyProfile: PolicyProfile
): string {
  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const high = findings.filter((finding) => finding.severity === "high").length;

  return `V2 ${policyProfile} profile review: ${calibratedVerdict.toUpperCase()} (${calibratedScore}/100), confidence ${Math.round(confidence * 100)}%, findings ${findings.length} (critical ${critical}, high ${high}).`;
}

function aggregateSpecialtyFeedback(findings: SpecializedFindingV2[]): SpecialtyFeedbackV2[] {
  const groupedByJudge = new Map<string, SpecializedFindingV2[]>();
  const groupedBySpecialty = new Map<string, SpecializedFindingV2[]>();

  for (const finding of findings) {
    const judgeId = mapJudgeIdFromRule(finding.ruleId);
    if (judgeId) {
      const judgeBucket = groupedByJudge.get(judgeId) ?? [];
      judgeBucket.push(finding);
      groupedByJudge.set(judgeId, judgeBucket);
      continue;
    }

    const specialtyBucket = groupedBySpecialty.get(finding.specialtyArea) ?? [];
    specialtyBucket.push(finding);
    groupedBySpecialty.set(finding.specialtyArea, specialtyBucket);
  }

  const feedback: SpecialtyFeedbackV2[] = [];

  for (const judge of JUDGES) {
    const judgeFindings = groupedByJudge.get(judge.id) ?? [];

    if (judgeFindings.length === 0) continue;

    const avgConfidence =
      judgeFindings.reduce((sum, finding) => sum + finding.confidence, 0) /
      judgeFindings.length;

    feedback.push({
      judgeId: judge.id,
      judgeName: judge.name,
      domain: judge.domain,
      findings: judgeFindings,
      confidence: Number(avgConfidence.toFixed(2)),
    });
  }

  for (const [specialty, specialtyFindings] of groupedBySpecialty.entries()) {
    const avgConfidence =
      specialtyFindings.reduce((sum, finding) => sum + finding.confidence, 0) /
      specialtyFindings.length;
    feedback.push({
      judgeId: "specialty",
      judgeName: `Specialty ${specialty}`,
      domain: specialty,
      findings: specialtyFindings,
      confidence: Number(avgConfidence.toFixed(2)),
    });
  }

  return feedback.sort((a, b) => b.findings.length - a.findings.length);
}

function confidenceForNoFindings(
  context?: EvaluationContextV2,
  evidence?: EvidenceBundleV2,
  uncertainty?: UncertaintyReportV2
): number {
  let confidence = 0.55;

  if (context?.architectureNotes || context?.constraints?.length || context?.standards?.length) {
    confidence += 0.1;
  }

  if (
    evidence?.testSummary ||
    evidence?.coveragePercent !== undefined ||
    evidence?.p95LatencyMs !== undefined ||
    evidence?.dependencyVulnerabilityCount !== undefined
  ) {
    confidence += 0.1;
  }

  const missingCount = uncertainty?.missingEvidence.length ?? 0;
  if (missingCount >= 3) {
    confidence -= 0.1;
  } else if (missingCount === 0) {
    confidence += 0.1;
  }

  return Math.max(0.35, Math.min(0.9, Number(confidence.toFixed(2))));
}

function enrichFindings(
  findings: Finding[],
  context?: EvaluationContextV2,
  evidence?: EvidenceBundleV2
): SpecializedFindingV2[] {
  return findings.map((finding) => {
    const confidenceResult = confidenceForFinding(finding, context, evidence);
    return {
      ...finding,
      specialtyArea: mapSpecialty(finding.ruleId),
      confidence: confidenceResult.confidence,
      evidenceBasis: confidenceResult.evidenceBasis,
    };
  });
}

function calibrateScoreAndVerdict(findings: SpecializedFindingV2[]): {
  score: number;
  verdict: Verdict;
} {
  const baseFindings: Finding[] = findings.map(({ specialtyArea, confidence, evidenceBasis, ...finding }) => finding);
  const score = calculateScore(baseFindings);
  const verdict = deriveVerdict(baseFindings, score);
  return { score, verdict };
}

export function evaluateCodeV2(params: {
  code: string;
  language: string;
  context?: string;
  includeAstFindings?: boolean;
  minConfidence?: number;
  policyProfile?: PolicyProfile;
  evaluationContext?: EvaluationContextV2;
  evidence?: EvidenceBundleV2;
}): TribunalVerdictV2 {
  const baseVerdict = evaluateWithTribunal(
    params.code,
    params.language,
    params.context,
    {
      includeAstFindings: params.includeAstFindings,
      minConfidence: params.minConfidence,
    }
  );

  const profile = params.policyProfile ?? "default";
  const baseFindings = baseVerdict.evaluations.flatMap((evaluation) => evaluation.findings);
  const policyFindings = applyPolicyProfile(baseFindings, profile);
  const findings = enrichFindings(policyFindings, params.evaluationContext, params.evidence);
  const specialtyFeedback = aggregateSpecialtyFeedback(findings);
  const calibrated = calibrateScoreAndVerdict(findings);
  const uncertainty = buildUncertainty(params.evaluationContext, params.evidence);

  const confidence =
    findings.length === 0
      ? confidenceForNoFindings(params.evaluationContext, params.evidence, uncertainty)
      : Number(
          (
            findings.reduce((sum, finding) => sum + finding.confidence, 0) /
            findings.length
          ).toFixed(2)
        );

  return {
    policyProfile: profile,
    baseVerdict,
    calibratedVerdict: calibrated.verdict,
    calibratedScore: calibrated.score,
    findings,
    specialtyFeedback,
    confidence,
    uncertainty,
    summary: summarizeV2(
      calibrated.verdict,
      calibrated.score,
      findings,
      confidence,
      profile
    ),
    timestamp: new Date().toISOString(),
  };
}

export function evaluateProjectV2(params: {
  files: Array<{ path: string; content: string; language: string }>;
  context?: string;
  includeAstFindings?: boolean;
  minConfidence?: number;
  policyProfile?: PolicyProfile;
  evaluationContext?: EvaluationContextV2;
  evidence?: EvidenceBundleV2;
}): TribunalVerdictV2 {
  const projectVerdict = evaluateProject(params.files, params.context, {
    includeAstFindings: params.includeAstFindings,
    minConfidence: params.minConfidence,
  });
  const profile = params.policyProfile ?? "default";

  const projectFindings = [
    ...projectVerdict.fileResults.flatMap((result) => result.findings),
    ...projectVerdict.architecturalFindings,
  ];

  const policyFindings = applyPolicyProfile(projectFindings, profile);
  const findings = enrichFindings(policyFindings, params.evaluationContext, params.evidence);
  const specialtyFeedback = aggregateSpecialtyFeedback(findings);
  const calibrated = calibrateScoreAndVerdict(findings);
  const uncertainty = buildUncertainty(params.evaluationContext, params.evidence);

  const confidence =
    findings.length === 0
      ? confidenceForNoFindings(params.evaluationContext, params.evidence, uncertainty)
      : Number(
          (
            findings.reduce((sum, finding) => sum + finding.confidence, 0) /
            findings.length
          ).toFixed(2)
        );

  const baseTribunal: TribunalVerdict = {
    overallVerdict: projectVerdict.overallVerdict,
    overallScore: projectVerdict.overallScore,
    summary: projectVerdict.summary,
    evaluations: [],
    criticalCount: projectVerdict.criticalCount,
    highCount: projectVerdict.highCount,
    timestamp: projectVerdict.timestamp,
  };

  return {
    policyProfile: profile,
    baseVerdict: baseTribunal,
    calibratedVerdict: calibrated.verdict,
    calibratedScore: calibrated.score,
    findings,
    specialtyFeedback,
    confidence,
    uncertainty,
    summary: summarizeV2(
      calibrated.verdict,
      calibrated.score,
      findings,
      confidence,
      profile
    ),
    timestamp: projectVerdict.timestamp,
  };
}

export function getSupportedPolicyProfiles(): PolicyProfile[] {
  return [
    "default",
    "startup",
    "regulated",
    "healthcare",
    "fintech",
    "public-sector",
  ];
}

export function getJudgeByIdForV2(judgeId: string) {
  return getJudge(judgeId);
}
