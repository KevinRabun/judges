/**
 * Judge barrel — side-effect imports trigger self-registration with the
 * unified JudgeRegistry. Each judge file imports its own evaluator and
 * calls `defaultRegistry.register()`, so this file just needs to import
 * each module for its side effects.
 *
 * To add a new built-in judge:
 *   1. Create `src/judges/my-judge.ts` (with self-registration)
 *   2. Create `src/evaluators/my-judge.ts` (analyzer)
 *   3. Add a side-effect import here: `import "./my-judge.js";`
 */

import type { JudgeDefinition } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Side-effect imports — each judge self-registers on import ───────────────
import "./data-security.js";
import "./cybersecurity.js";
import "./cost-effectiveness.js";
import "./scalability.js";
import "./cloud-readiness.js";
import "./software-practices.js";
import "./accessibility.js";
import "./api-design.js";
import "./reliability.js";
import "./observability.js";
import "./performance.js";
import "./compliance.js";
import "./data-sovereignty.js";
import "./testing.js";
import "./documentation.js";
import "./internationalization.js";
import "./dependency-health.js";
import "./concurrency.js";
import "./ethics-bias.js";
import "./maintainability.js";
import "./error-handling.js";
import "./authentication.js";
import "./database.js";
import "./caching.js";
import "./configuration-management.js";
import "./backwards-compatibility.js";
import "./portability.js";
import "./ux.js";
import "./logging-privacy.js";
import "./rate-limiting.js";
import "./ci-cd.js";
import "./code-structure.js";
import "./agent-instructions.js";
import "./ai-code-safety.js";
import "./framework-safety.js";
import "./iac-security.js";
import "./security.js";
import "./hallucination-detection.js";
import "./intent-alignment.js";
import "./api-contract.js";
import "./multi-turn-coherence.js";
import "./model-fingerprint.js";
import "./over-engineering.js";
import "./logic-review.js";
import "./false-positive-review.js";

// ─── Re-exports backed by the registry ──────────────────────────────────────

/**
 * The panel of judges that comprise the Judges Panel.
 *
 * Each judge is a specialized evaluator with deep expertise in a single domain.
 * They operate independently and produce structured findings with
 * severity-rated, actionable recommendations.
 *
 * Note: this snapshot is taken at module-load time, after all built-in judges
 * have self-registered via the side-effect imports above.
 */
export const JUDGES: JudgeDefinition[] = defaultRegistry.getJudges();

/**
 * Look up a judge by ID.
 */
export function getJudge(id: string): JudgeDefinition | undefined {
  return defaultRegistry.getJudge(id);
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
  return defaultRegistry.getJudgeSummaries();
}
