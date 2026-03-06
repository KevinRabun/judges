import type { JudgeDefinition } from "../types.js";

import { dataSecurityJudge } from "./data-security.js";
import { cybersecurityJudge } from "./cybersecurity.js";
import { costEffectivenessJudge } from "./cost-effectiveness.js";
import { scalabilityJudge } from "./scalability.js";
import { cloudReadinessJudge } from "./cloud-readiness.js";
import { softwarePracticesJudge } from "./software-practices.js";
import { accessibilityJudge } from "./accessibility.js";
import { apiDesignJudge } from "./api-design.js";
import { reliabilityJudge } from "./reliability.js";
import { observabilityJudge } from "./observability.js";
import { performanceJudge } from "./performance.js";
import { complianceJudge } from "./compliance.js";
import { dataSovereigntyJudge } from "./data-sovereignty.js";
import { testingJudge } from "./testing.js";
import { documentationJudge } from "./documentation.js";
import { internationalizationJudge } from "./internationalization.js";
import { dependencyHealthJudge } from "./dependency-health.js";
import { concurrencyJudge } from "./concurrency.js";
import { ethicsBiasJudge } from "./ethics-bias.js";
import { maintainabilityJudge } from "./maintainability.js";
import { errorHandlingJudge } from "./error-handling.js";
import { authenticationJudge } from "./authentication.js";
import { databaseJudge } from "./database.js";
import { cachingJudge } from "./caching.js";
import { configurationManagementJudge } from "./configuration-management.js";
import { backwardsCompatibilityJudge } from "./backwards-compatibility.js";
import { portabilityJudge } from "./portability.js";
import { uxJudge } from "./ux.js";
import { loggingPrivacyJudge } from "./logging-privacy.js";
import { rateLimitingJudge } from "./rate-limiting.js";
import { ciCdJudge } from "./ci-cd.js";
import { codeStructureJudge } from "./code-structure.js";
import { agentInstructionsJudge } from "./agent-instructions.js";
import { aiCodeSafetyJudge } from "./ai-code-safety.js";
import { frameworkSafetyJudge } from "./framework-safety.js";
import { iacSecurityJudge } from "./iac-security.js";
import { securityJudge } from "./security.js";
import { falsePositiveReviewJudge } from "./false-positive-review.js";

// ─── Analyzer Imports ────────────────────────────────────────────────────────
import { analyzeDataSecurity } from "../evaluators/data-security.js";
import { analyzeCybersecurity } from "../evaluators/cybersecurity.js";
import { analyzeCostEffectiveness } from "../evaluators/cost-effectiveness.js";
import { analyzeScalability } from "../evaluators/scalability.js";
import { analyzeCloudReadiness } from "../evaluators/cloud-readiness.js";
import { analyzeSoftwarePractices } from "../evaluators/software-practices.js";
import { analyzeAccessibility } from "../evaluators/accessibility.js";
import { analyzeApiDesign } from "../evaluators/api-design.js";
import { analyzeReliability } from "../evaluators/reliability.js";
import { analyzeObservability } from "../evaluators/observability.js";
import { analyzePerformance } from "../evaluators/performance.js";
import { analyzeCompliance } from "../evaluators/compliance.js";
import { analyzeDataSovereignty } from "../evaluators/data-sovereignty.js";
import { analyzeTesting } from "../evaluators/testing.js";
import { analyzeDocumentation } from "../evaluators/documentation.js";
import { analyzeInternationalization } from "../evaluators/internationalization.js";
import { analyzeDependencyHealth } from "../evaluators/dependency-health.js";
import { analyzeConcurrency } from "../evaluators/concurrency.js";
import { analyzeEthicsBias } from "../evaluators/ethics-bias.js";
import { analyzeMaintainability } from "../evaluators/maintainability.js";
import { analyzeErrorHandling } from "../evaluators/error-handling.js";
import { analyzeAuthentication } from "../evaluators/authentication.js";
import { analyzeDatabase } from "../evaluators/database.js";
import { analyzeCaching } from "../evaluators/caching.js";
import { analyzeConfigurationManagement } from "../evaluators/configuration-management.js";
import { analyzeBackwardsCompatibility } from "../evaluators/backwards-compatibility.js";
import { analyzePortability } from "../evaluators/portability.js";
import { analyzeUx } from "../evaluators/ux.js";
import { analyzeLoggingPrivacy } from "../evaluators/logging-privacy.js";
import { analyzeRateLimiting } from "../evaluators/rate-limiting.js";
import { analyzeCiCd } from "../evaluators/ci-cd.js";
import { analyzeCodeStructure } from "../evaluators/code-structure.js";
import { analyzeAgentInstructions } from "../evaluators/agent-instructions.js";
import { analyzeAiCodeSafety } from "../evaluators/ai-code-safety.js";
import { analyzeFrameworkSafety } from "../evaluators/framework-safety.js";
import { analyzeIacSecurity } from "../evaluators/iac-security.js";
import { analyzeSecurity } from "../evaluators/security.js";

// ─── Wire each judge to its analyzer ─────────────────────────────────────────

dataSecurityJudge.analyze = analyzeDataSecurity;
cybersecurityJudge.analyze = analyzeCybersecurity;
costEffectivenessJudge.analyze = analyzeCostEffectiveness;
scalabilityJudge.analyze = analyzeScalability;
cloudReadinessJudge.analyze = analyzeCloudReadiness;
softwarePracticesJudge.analyze = analyzeSoftwarePractices;
accessibilityJudge.analyze = analyzeAccessibility;
apiDesignJudge.analyze = analyzeApiDesign;
reliabilityJudge.analyze = analyzeReliability;
observabilityJudge.analyze = analyzeObservability;
performanceJudge.analyze = analyzePerformance;
complianceJudge.analyze = analyzeCompliance;
dataSovereigntyJudge.analyze = analyzeDataSovereignty;
testingJudge.analyze = analyzeTesting;
documentationJudge.analyze = analyzeDocumentation;
internationalizationJudge.analyze = analyzeInternationalization;
dependencyHealthJudge.analyze = analyzeDependencyHealth;
concurrencyJudge.analyze = analyzeConcurrency;
ethicsBiasJudge.analyze = analyzeEthicsBias;
maintainabilityJudge.analyze = analyzeMaintainability;
errorHandlingJudge.analyze = analyzeErrorHandling;
authenticationJudge.analyze = analyzeAuthentication;
databaseJudge.analyze = analyzeDatabase;
cachingJudge.analyze = analyzeCaching;
configurationManagementJudge.analyze = analyzeConfigurationManagement;
backwardsCompatibilityJudge.analyze = analyzeBackwardsCompatibility;
portabilityJudge.analyze = analyzePortability;
uxJudge.analyze = analyzeUx;
loggingPrivacyJudge.analyze = analyzeLoggingPrivacy;
rateLimitingJudge.analyze = analyzeRateLimiting;
ciCdJudge.analyze = analyzeCiCd;
codeStructureJudge.analyze = analyzeCodeStructure;
agentInstructionsJudge.analyze = analyzeAgentInstructions;
aiCodeSafetyJudge.analyze = analyzeAiCodeSafety;
frameworkSafetyJudge.analyze = analyzeFrameworkSafety;
iacSecurityJudge.analyze = analyzeIacSecurity;
securityJudge.analyze = analyzeSecurity;

/**
 * The panel of judges that comprise the Judges Panel.
 *
 * Each judge is a specialized evaluator with deep expertise in a single domain.
 * They operate independently and produce structured findings with
 * severity-rated, actionable recommendations.
 */
export const JUDGES: JudgeDefinition[] = [
  dataSecurityJudge,
  cybersecurityJudge,
  costEffectivenessJudge,
  scalabilityJudge,
  cloudReadinessJudge,
  softwarePracticesJudge,
  accessibilityJudge,
  apiDesignJudge,
  reliabilityJudge,
  observabilityJudge,
  performanceJudge,
  complianceJudge,
  dataSovereigntyJudge,
  testingJudge,
  documentationJudge,
  internationalizationJudge,
  dependencyHealthJudge,
  concurrencyJudge,
  ethicsBiasJudge,
  maintainabilityJudge,
  errorHandlingJudge,
  authenticationJudge,
  databaseJudge,
  cachingJudge,
  configurationManagementJudge,
  backwardsCompatibilityJudge,
  portabilityJudge,
  uxJudge,
  loggingPrivacyJudge,
  rateLimitingJudge,
  ciCdJudge,
  codeStructureJudge,
  agentInstructionsJudge,
  aiCodeSafetyJudge,
  frameworkSafetyJudge,
  iacSecurityJudge,
  securityJudge,
  falsePositiveReviewJudge,
];

/**
 * Look up a judge by ID.
 */
export function getJudge(id: string): JudgeDefinition | undefined {
  return JUDGES.find((j) => j.id === id);
}

/**
 * Get a short summary of all judges for display.
 */
export function getJudgeSummaries(): Array<{
  id: string;
  name: string;
  domain: string;
  description: string;
}> {
  return JUDGES.map(({ id, name, domain, description }) => ({
    id,
    name,
    domain,
    description,
  }));
}
