/**
 * Plugin API — Extension system for custom evaluators
 *
 * Allows third-party extensions to add custom judges, rules, and evaluators
 * that integrate seamlessly with the tribunal evaluation pipeline.
 *
 * This module is now a thin façade over the unified JudgeRegistry.
 * All state lives in `defaultRegistry`; these functions delegate to it
 * for full backwards compatibility.
 *
 * ```ts
 * import { registerPlugin } from "@kevinrabun/judges/api";
 * registerPlugin({
 *   name: "my-org-rules",
 *   version: "1.0.0",
 *   judges: [myCustomJudge],
 *   rules: [myCustomRule],
 * });
 * ```
 */

import type { Finding, JudgeDefinition } from "./types.js";
import { defaultRegistry, type CustomRule, type JudgesPlugin, type PluginRegistration } from "./judge-registry.js";

// Re-export types so existing consumers keep working
export type { CustomRule, JudgesPlugin, PluginRegistration };

/**
 * Register a plugin with the judges system.
 */
export function registerPlugin(plugin: JudgesPlugin): PluginRegistration {
  return defaultRegistry.registerPlugin(plugin);
}

/**
 * Unregister a plugin and remove its rules/judges.
 */
export function unregisterPlugin(name: string): boolean {
  return defaultRegistry.unregisterPlugin(name);
}

/**
 * Get all registered plugins.
 */
export function getRegisteredPlugins(): PluginRegistration[] {
  return defaultRegistry.getRegisteredPlugins();
}

/**
 * Get all custom rules from all registered plugins.
 */
export function getCustomRules(): CustomRule[] {
  return defaultRegistry.getCustomRules();
}

/**
 * Get all custom judges from all registered plugins.
 */
export function getPluginJudges(): JudgeDefinition[] {
  return defaultRegistry.getPluginJudges();
}

/**
 * Evaluate custom rules against code and return findings.
 */
export function evaluateCustomRules(code: string, language: string): Finding[] {
  return defaultRegistry.evaluateCustomRules(code, language);
}

/**
 * Run all plugin beforeEvaluate hooks.
 */
export function runBeforeHooks(code: string, language: string): void {
  defaultRegistry.runBeforeHooks(code, language);
}

/**
 * Run all plugin afterEvaluate and transformFindings hooks.
 */
export function runAfterHooks(findings: Finding[]): Finding[] {
  const afterResult = defaultRegistry.runAfterHooks(findings);
  return defaultRegistry.runTransformHooks(afterResult);
}

/**
 * Clear all registered plugins (useful for testing).
 */
export function clearPlugins(): void {
  defaultRegistry.clearPlugins();
}
