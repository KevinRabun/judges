/**
 * Judge registry bootstrap (agent-native).
 *
 * Judges are now sourced from `.judge.md` files in the `agents/` folder (legacy
 * `.agent.md` still supported). Each agent frontmatter references an evaluator
 * script (in `src/evaluators/`), and the agent loader registers them with the
 * unified `JudgeRegistry`.
 *
 * Legacy side-effect imports have been removed. If you need to add a judge, add
 * an agent file and (optionally) an evaluator script, then run:
 *   - `npm run generate:agents` (to sync)
 *   - `npm run validate:agents`
 */

import type { JudgeDefinition } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";
import { loadAndRegisterAgents } from "../agent-loader.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Support both ESM (import.meta.url) and CJS (esbuild bundle) environments.
const _importMetaUrl: string | undefined = typeof import.meta?.url === "string" ? import.meta.url : undefined;
const __filename = _importMetaUrl ? fileURLToPath(_importMetaUrl) : "";
const __dirname = __filename ? dirname(__filename) : process.cwd();
let agentsLoaded = false;

function loadDefaultAgents() {
  if (agentsLoaded) return;
  const agentsDir = resolve(__dirname, "..", "..", "agents");
  loadAndRegisterAgents(agentsDir, defaultRegistry);
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
export function loadAgentJudges(dir: string = resolve(__dirname, "..", "..", "agents")): number {
  agentsLoaded = false; // allow re-run to pick up new agents if dir changes
  const count = loadAndRegisterAgents(dir, defaultRegistry);
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
