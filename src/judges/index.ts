/**
 * Judge registry bootstrap.
 *
 * Judges are dual-registered:
 *  1. Static side-effect imports below — each module calls
 *     `defaultRegistry.register()` at load time.  These are inlined by
 *     esbuild and work in both ESM and CJS bundles.
 *  2. Agent-native `.judge.md` files loaded at runtime from the `agents/`
 *     directory (when available).  This enriches / overrides metadata.
 *
 * The static imports guarantee that judges are always available, even in
 * bundled environments (VS Code extension) where `agents/` is absent.
 */

import type { JudgeDefinition } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";
import { loadAndRegisterAgents } from "../agent-loader.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Static side-effect imports (self-registering) ──────────────────────────
import "./accessibility.js";
import "./agent-instructions.js";
import "./ai-code-safety.js";
import "./api-contract.js";
import "./api-design.js";
import "./authentication.js";
import "./backwards-compatibility.js";
import "./caching.js";
import "./ci-cd.js";
import "./cloud-readiness.js";
import "./code-structure.js";
import "./compliance.js";
import "./concurrency.js";
import "./configuration-management.js";
import "./cost-effectiveness.js";
import "./cybersecurity.js";
import "./data-security.js";
import "./data-sovereignty.js";
import "./database.js";
import "./dependency-health.js";
import "./documentation.js";
import "./error-handling.js";
import "./ethics-bias.js";
import "./false-positive-review.js";
import "./framework-safety.js";
import "./hallucination-detection.js";
import "./iac-security.js";
import "./intent-alignment.js";
import "./internationalization.js";
import "./logging-privacy.js";
import "./logic-review.js";
import "./maintainability.js";
import "./model-fingerprint.js";
import "./multi-turn-coherence.js";
import "./observability.js";
import "./over-engineering.js";
import "./performance.js";
import "./portability.js";
import "./rate-limiting.js";
import "./reliability.js";
import "./scalability.js";
import "./security.js";
import "./software-practices.js";
import "./testing.js";
import "./ux.js";

// Support both ESM (import.meta.url) and CJS (esbuild bundle) environments.
const _importMetaUrl: string | undefined = typeof import.meta?.url === "string" ? import.meta.url : undefined;
const __filename = _importMetaUrl ? fileURLToPath(_importMetaUrl) : "";
const __dirname = __filename ? dirname(__filename) : "";
let agentsLoaded = false;

function loadDefaultAgents() {
  if (agentsLoaded) return;
  // Static side-effect imports above already registered all built-in judges.
  // In ESM mode, also load from agents/ directory for metadata enrichment.
  if (__dirname) {
    try {
      const agentsDir = resolve(__dirname, "..", "..", "agents");
      loadAndRegisterAgents(agentsDir, defaultRegistry);
    } catch {
      // agents/ directory may not exist — built-in judges are already loaded
    }
  }
  agentsLoaded = true;
}

// ─── Optional Agent Loader Integration ──────────────────────────────────────
/**
 * Load judges (agent-native). Loads agents from the default `agents/` folder
 * and returns the current registry snapshot.
 */
export async function loadJudges(): Promise<JudgeDefinition[]> {
  loadDefaultAgents();
  return defaultRegistry.getJudges();
}

/**
 * Load agent-based judges from a directory of `.judge.md` files (legacy
 * `.agent.md` supported). This enables hybrid operation where file-based
 * agents can augment or replace built-in judges. If a judge is already
 * registered, it is skipped.
 */
export function loadAgentJudges(dir?: string): number {
  const agentsDir = dir ?? (__dirname ? resolve(__dirname, "..", "..", "agents") : "");
  if (!agentsDir) return 0; // CJS bundle — no agents directory available
  agentsLoaded = false; // allow re-run to pick up new agents if dir changes
  const count = loadAndRegisterAgents(agentsDir, defaultRegistry);
  agentsLoaded = true;
  return count;
}

// ─── Re-exports backed by the registry ──────────────────────────────────────

/**
 * Snapshot of the currently registered judges. (Agent-native)
 */
export const JUDGES: JudgeDefinition[] = (() => {
  loadDefaultAgents();
  return defaultRegistry.getJudges();
})();

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
