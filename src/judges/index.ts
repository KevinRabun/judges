import { JudgeDefinition } from "../types.js";

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
import { testingJudge } from "./testing.js";
import { documentationJudge } from "./documentation.js";
import { internationalizationJudge } from "./internationalization.js";
import { dependencyHealthJudge } from "./dependency-health.js";
import { concurrencyJudge } from "./concurrency.js";
import { ethicsBiasJudge } from "./ethics-bias.js";

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
  testingJudge,
  documentationJudge,
  internationalizationJudge,
  dependencyHealthJudge,
  concurrencyJudge,
  ethicsBiasJudge,
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
