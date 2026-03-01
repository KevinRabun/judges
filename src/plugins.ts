/**
 * Plugin API — Extension system for custom evaluators
 *
 * Allows third-party extensions to add custom judges, rules, and evaluators
 * that integrate seamlessly with the tribunal evaluation pipeline.
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

import type { Finding, JudgeDefinition, Severity } from "./types.js";

// ─── Plugin Types ────────────────────────────────────────────────────────────

/** A custom evaluation rule that can be added via plugins */
export interface CustomRule {
  /** Unique rule ID (e.g., "MYORG-001") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Severity level */
  severity: Severity;
  /** Which judge category this rule belongs to */
  judgeId: string;
  /** Description of what the rule checks */
  description: string;
  /** Languages this rule applies to (empty = all) */
  languages?: string[];
  /** Regex pattern to match (simple pattern-based rule) */
  pattern?: RegExp;
  /** Custom analyze function for complex logic */
  analyze?: (code: string, language: string) => Finding[];
  /** Suggested fix text */
  suggestedFix?: string;
  /** Tags for filtering */
  tags?: string[];
}

/** Plugin definition */
export interface JudgesPlugin {
  /** Unique plugin name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Optional description */
  description?: string;
  /** Custom rules to register */
  rules?: CustomRule[];
  /** Custom judge definitions to add to the tribunal */
  judges?: JudgeDefinition[];
  /** Hook: called before evaluation */
  beforeEvaluate?: (code: string, language: string) => void;
  /** Hook: called after evaluation with findings for post-processing */
  afterEvaluate?: (findings: Finding[]) => Finding[];
  /** Hook: called to transform findings (e.g., add org-specific metadata) */
  transformFindings?: (findings: Finding[]) => Finding[];
}

/** Plugin registration result */
export interface PluginRegistration {
  name: string;
  version: string;
  rulesRegistered: number;
  judgesRegistered: number;
}

// ─── Plugin Registry ─────────────────────────────────────────────────────────

const registeredPlugins: Map<string, JudgesPlugin> = new Map();
const customRules: Map<string, CustomRule> = new Map();
const pluginJudges: Map<string, JudgeDefinition> = new Map();

/**
 * Register a plugin with the judges system.
 */
export function registerPlugin(plugin: JudgesPlugin): PluginRegistration {
  if (!plugin.name) throw new Error("Plugin name is required");
  if (!plugin.version) throw new Error("Plugin version is required");

  if (registeredPlugins.has(plugin.name)) {
    // Unregister existing version first
    unregisterPlugin(plugin.name);
  }

  registeredPlugins.set(plugin.name, plugin);

  let rulesRegistered = 0;
  let judgesRegistered = 0;

  // Register custom rules
  if (plugin.rules) {
    for (const rule of plugin.rules) {
      if (!rule.id) throw new Error(`Rule in plugin "${plugin.name}" is missing an id`);
      customRules.set(rule.id, rule);
      rulesRegistered++;
    }
  }

  // Register custom judges
  if (plugin.judges) {
    for (const judge of plugin.judges) {
      pluginJudges.set(judge.id, judge);
      judgesRegistered++;
    }
  }

  return { name: plugin.name, version: plugin.version, rulesRegistered, judgesRegistered };
}

/**
 * Unregister a plugin and remove its rules/judges.
 */
export function unregisterPlugin(name: string): boolean {
  const plugin = registeredPlugins.get(name);
  if (!plugin) return false;

  if (plugin.rules) {
    for (const rule of plugin.rules) {
      customRules.delete(rule.id);
    }
  }
  if (plugin.judges) {
    for (const judge of plugin.judges) {
      pluginJudges.delete(judge.id);
    }
  }

  registeredPlugins.delete(name);
  return true;
}

/**
 * Get all registered plugins.
 */
export function getRegisteredPlugins(): PluginRegistration[] {
  return [...registeredPlugins.entries()].map(([, plugin]) => ({
    name: plugin.name,
    version: plugin.version,
    rulesRegistered: plugin.rules?.length ?? 0,
    judgesRegistered: plugin.judges?.length ?? 0,
  }));
}

/**
 * Get all custom rules from all registered plugins.
 */
export function getCustomRules(): CustomRule[] {
  return [...customRules.values()];
}

/**
 * Get all custom judges from all registered plugins.
 */
export function getPluginJudges(): JudgeDefinition[] {
  return [...pluginJudges.values()];
}

/**
 * Evaluate custom rules against code and return findings.
 */
export function evaluateCustomRules(code: string, language: string): Finding[] {
  const findings: Finding[] = [];

  for (const rule of customRules.values()) {
    // Skip if rule doesn't apply to this language
    if (rule.languages && rule.languages.length > 0 && !rule.languages.includes(language)) {
      continue;
    }

    // Custom analyze function
    if (rule.analyze) {
      try {
        findings.push(...rule.analyze(code, language));
      } catch {
        // Silently skip failed custom rules
      }
      continue;
    }

    // Pattern-based rule
    if (rule.pattern) {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(code)) !== null) {
        const beforeMatch = code.slice(0, match.index);
        const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;

        findings.push({
          ruleId: rule.id,
          title: rule.title,
          severity: rule.severity,
          description: `${rule.description} (matched: ${match[0].slice(0, 100)})`,
          lineNumbers: [lineNum],
          recommendation: rule.suggestedFix || "",
          suggestedFix: rule.suggestedFix,
        });
      }
    }
  }

  return findings;
}

/**
 * Run all plugin beforeEvaluate hooks.
 */
export function runBeforeHooks(code: string, language: string): void {
  for (const plugin of registeredPlugins.values()) {
    if (plugin.beforeEvaluate) {
      try {
        plugin.beforeEvaluate(code, language);
      } catch {
        // Don't let plugin errors crash the evaluation
      }
    }
  }
}

/**
 * Run all plugin afterEvaluate hooks.
 */
export function runAfterHooks(findings: Finding[]): Finding[] {
  let result = findings;
  for (const plugin of registeredPlugins.values()) {
    if (plugin.afterEvaluate) {
      try {
        result = plugin.afterEvaluate(result);
      } catch {
        // Don't let plugin errors crash the evaluation
      }
    }
    if (plugin.transformFindings) {
      try {
        result = plugin.transformFindings(result);
      } catch {
        // Don't let plugin errors crash the evaluation
      }
    }
  }
  return result;
}

/**
 * Clear all registered plugins (useful for testing).
 */
export function clearPlugins(): void {
  registeredPlugins.clear();
  customRules.clear();
  pluginJudges.clear();
}
