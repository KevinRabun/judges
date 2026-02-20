// ─── Evaluators Module ───────────────────────────────────────────────────────
// Re-exports the evaluation engine: analyser routing, scoring, formatting.
// ──────────────────────────────────────────────────────────────────────────────

import {
  JudgeDefinition,
  JudgeEvaluation,
  TribunalVerdict,
  Finding,
  Verdict,
} from "../types.js";
import { JUDGES } from "../judges/index.js";

// ─── Shared Utilities ────────────────────────────────────────────────────────
import {
  calculateScore,
  deriveVerdict,
  buildSummary,
  buildTribunalSummary,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./shared.js";

// ─── Individual Analyzers ────────────────────────────────────────────────────
import { analyzeDataSecurity } from "./data-security.js";
import { analyzeCybersecurity } from "./cybersecurity.js";
import { analyzeCostEffectiveness } from "./cost-effectiveness.js";
import { analyzeScalability } from "./scalability.js";
import { analyzeCloudReadiness } from "./cloud-readiness.js";
import { analyzeSoftwarePractices } from "./software-practices.js";
import { analyzeAccessibility } from "./accessibility.js";
import { analyzeApiDesign } from "./api-design.js";
import { analyzeReliability } from "./reliability.js";
import { analyzeObservability } from "./observability.js";
import { analyzePerformance } from "./performance.js";
import { analyzeCompliance } from "./compliance.js";
import { analyzeTesting } from "./testing.js";
import { analyzeDocumentation } from "./documentation.js";
import { analyzeInternationalization } from "./internationalization.js";
import { analyzeDependencyHealth } from "./dependency-health.js";
import { analyzeConcurrency } from "./concurrency.js";
import { analyzeEthicsBias } from "./ethics-bias.js";
import { analyzeMaintainability } from "./maintainability.js";
import { analyzeErrorHandling } from "./error-handling.js";
import { analyzeAuthentication } from "./authentication.js";
import { analyzeDatabase } from "./database.js";
import { analyzeCaching } from "./caching.js";
import { analyzeConfigurationManagement } from "./configuration-management.js";
import { analyzeBackwardsCompatibility } from "./backwards-compatibility.js";
import { analyzePortability } from "./portability.js";
import { analyzeUx } from "./ux.js";
import { analyzeLoggingPrivacy } from "./logging-privacy.js";
import { analyzeRateLimiting } from "./rate-limiting.js";
import { analyzeCiCd } from "./ci-cd.js";

// ─── Evaluation Engine ──────────────────────────────────────────────────────

/**
 * Run a single judge against the provided code.
 */
export function evaluateWithJudge(
  judge: JudgeDefinition,
  code: string,
  language: string,
  context?: string
): JudgeEvaluation {
  const findings: Finding[] = [];

  switch (judge.id) {
    case "data-security":
      findings.push(...analyzeDataSecurity(code, language));
      break;
    case "cybersecurity":
      findings.push(...analyzeCybersecurity(code, language));
      break;
    case "cost-effectiveness":
      findings.push(...analyzeCostEffectiveness(code, language));
      break;
    case "scalability":
      findings.push(...analyzeScalability(code, language));
      break;
    case "cloud-readiness":
      findings.push(...analyzeCloudReadiness(code, language));
      break;
    case "software-practices":
      findings.push(...analyzeSoftwarePractices(code, language));
      break;
    case "accessibility":
      findings.push(...analyzeAccessibility(code, language));
      break;
    case "api-design":
      findings.push(...analyzeApiDesign(code, language));
      break;
    case "reliability":
      findings.push(...analyzeReliability(code, language));
      break;
    case "observability":
      findings.push(...analyzeObservability(code, language));
      break;
    case "performance":
      findings.push(...analyzePerformance(code, language));
      break;
    case "compliance":
      findings.push(...analyzeCompliance(code, language));
      break;
    case "testing":
      findings.push(...analyzeTesting(code, language));
      break;
    case "documentation":
      findings.push(...analyzeDocumentation(code, language));
      break;
    case "internationalization":
      findings.push(...analyzeInternationalization(code, language));
      break;
    case "dependency-health":
      findings.push(...analyzeDependencyHealth(code, language));
      break;
    case "concurrency":
      findings.push(...analyzeConcurrency(code, language));
      break;
    case "ethics-bias":
      findings.push(...analyzeEthicsBias(code, language));
      break;
    case "maintainability":
      findings.push(...analyzeMaintainability(code, language));
      break;
    case "error-handling":
      findings.push(...analyzeErrorHandling(code, language));
      break;
    case "authentication":
      findings.push(...analyzeAuthentication(code, language));
      break;
    case "database":
      findings.push(...analyzeDatabase(code, language));
      break;
    case "caching":
      findings.push(...analyzeCaching(code, language));
      break;
    case "configuration-management":
      findings.push(...analyzeConfigurationManagement(code, language));
      break;
    case "backwards-compatibility":
      findings.push(...analyzeBackwardsCompatibility(code, language));
      break;
    case "portability":
      findings.push(...analyzePortability(code, language));
      break;
    case "ux":
      findings.push(...analyzeUx(code, language));
      break;
    case "logging-privacy":
      findings.push(...analyzeLoggingPrivacy(code, language));
      break;
    case "rate-limiting":
      findings.push(...analyzeRateLimiting(code, language));
      break;
    case "ci-cd":
      findings.push(...analyzeCiCd(code, language));
      break;
  }

  const score = calculateScore(findings);
  const verdict = deriveVerdict(findings, score);
  const summary = buildSummary(judge, findings, score, verdict);

  return {
    judgeId: judge.id,
    judgeName: judge.name,
    verdict,
    score,
    summary,
    findings,
  };
}

/**
 * Run the full tribunal — all judges evaluate the code.
 */
export function evaluateWithTribunal(
  code: string,
  language: string,
  context?: string
): TribunalVerdict {
  const evaluations = JUDGES.map((judge) =>
    evaluateWithJudge(judge, code, language, context)
  );

  const overallScore = Math.round(
    evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length
  );

  const overallVerdict: Verdict = evaluations.some((e) => e.verdict === "fail")
    ? "fail"
    : evaluations.some((e) => e.verdict === "warning")
    ? "warning"
    : "pass";

  const allFindings = evaluations.flatMap((e) => e.findings);
  const criticalCount = allFindings.filter(
    (f) => f.severity === "critical"
  ).length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;

  const summary = buildTribunalSummary(
    evaluations,
    overallVerdict,
    overallScore,
    criticalCount,
    highCount
  );

  return {
    overallVerdict,
    overallScore,
    summary,
    evaluations,
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
  };
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { formatVerdictAsMarkdown, formatEvaluationAsMarkdown };
