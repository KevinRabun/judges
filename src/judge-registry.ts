/**
 * Unified Judge Registry — single registration path for built-in and plugin judges.
 *
 * Every judge (built-in or custom) goes through the same `register()` method,
 * ensuring consistent validation and a single source of truth. Built-in judges
 * self-register via side-effect imports; plugins register via `registerPlugin()`.
 *
 * ```ts
 * import { defaultRegistry } from "./judge-registry.js";
 * defaultRegistry.register(myJudge);
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

// ─── Judge Registry ──────────────────────────────────────────────────────────

/**
 * Central registry for all judges and plugins. Both built-in judges and
 * user-supplied plugins register through the same API, ensuring consistent
 * behaviour and a single source of truth.
 */
export class JudgeRegistry {
  private judges = new Map<string, JudgeDefinition>();
  private plugins = new Map<string, JudgesPlugin>();
  private customRules = new Map<string, CustomRule>();

  /**
   * Insertion-order tracking. Map preserves insertion order, but we need
   * to ensure falsePositiveReviewJudge is always last regardless of
   * registration order. We handle this in getJudges().
   */
  private static readonly TAIL_JUDGE_ID = "false-positive-review";

  // ── Judge Registration ───────────────────────────────────────────────

  /**
   * Register a single judge. Used by both built-in judges (via self-
   * registration in their module) and plugin judges (via registerPlugin).
   *
   * If a judge with the same ID already exists, it is replaced.
   */
  register(judge: JudgeDefinition): void {
    this.judges.set(judge.id, judge);
  }

  /**
   * Unregister a judge by ID. Returns true if the judge existed.
   */
  unregister(id: string): boolean {
    return this.judges.delete(id);
  }

  /**
   * Look up a judge by ID.
   */
  getJudge(id: string): JudgeDefinition | undefined {
    return this.judges.get(id);
  }

  /**
   * Get all registered judges as an array. The false-positive-review
   * judge is always placed last. Plugin judges appear after built-in
   * judges but before the tail judge.
   */
  getJudges(): JudgeDefinition[] {
    const all = [...this.judges.values()];
    const tailIdx = all.findIndex((j) => j.id === JudgeRegistry.TAIL_JUDGE_ID);
    if (tailIdx >= 0) {
      const [tail] = all.splice(tailIdx, 1);
      all.push(tail);
    }
    return all;
  }

  /**
   * Get a short summary of all judges for display.
   */
  getJudgeSummaries(): Array<{
    id: string;
    name: string;
    domain: string;
    description: string;
  }> {
    return this.getJudges().map(({ id, name, domain, description }) => ({
      id,
      name,
      domain,
      description,
    }));
  }

  // ── Plugin Registration ──────────────────────────────────────────────

  /**
   * Register a plugin with the judges system. Plugins can provide
   * custom judges, custom rules, and lifecycle hooks.
   */
  registerPlugin(plugin: JudgesPlugin): PluginRegistration {
    if (!plugin.name) throw new Error("Plugin name is required");
    if (!plugin.version) throw new Error("Plugin version is required");

    if (this.plugins.has(plugin.name)) {
      this.unregisterPlugin(plugin.name);
    }

    this.plugins.set(plugin.name, plugin);

    let rulesRegistered = 0;
    let judgesRegistered = 0;

    if (plugin.rules) {
      for (const rule of plugin.rules) {
        if (!rule.id) throw new Error(`Rule in plugin "${plugin.name}" is missing an id`);
        this.customRules.set(rule.id, rule);
        rulesRegistered++;
      }
    }

    if (plugin.judges) {
      for (const judge of plugin.judges) {
        this.register(judge);
        judgesRegistered++;
      }
    }

    return { name: plugin.name, version: plugin.version, rulesRegistered, judgesRegistered };
  }

  /**
   * Unregister a plugin and remove its rules and judges.
   */
  unregisterPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    if (plugin.rules) {
      for (const rule of plugin.rules) {
        this.customRules.delete(rule.id);
      }
    }
    if (plugin.judges) {
      for (const judge of plugin.judges) {
        this.judges.delete(judge.id);
      }
    }

    this.plugins.delete(name);
    return true;
  }

  /**
   * Get all registered plugins.
   */
  getRegisteredPlugins(): PluginRegistration[] {
    return [...this.plugins.entries()].map(([, plugin]) => ({
      name: plugin.name,
      version: plugin.version,
      rulesRegistered: plugin.rules?.length ?? 0,
      judgesRegistered: plugin.judges?.length ?? 0,
    }));
  }

  // ── Custom Rules ─────────────────────────────────────────────────────

  /**
   * Get all custom rules from all registered plugins.
   */
  getCustomRules(): CustomRule[] {
    return [...this.customRules.values()];
  }

  /**
   * Get all judges registered via plugins (not built-in).
   * Identified by checking if the judge was brought in by a plugin.
   */
  getPluginJudges(): JudgeDefinition[] {
    const pluginJudgeIds = new Set<string>();
    for (const plugin of this.plugins.values()) {
      if (plugin.judges) {
        for (const j of plugin.judges) {
          pluginJudgeIds.add(j.id);
        }
      }
    }
    return [...this.judges.values()].filter((j) => pluginJudgeIds.has(j.id));
  }

  /**
   * Evaluate custom rules against code and return findings.
   */
  evaluateCustomRules(code: string, language: string): Finding[] {
    const findings: Finding[] = [];

    for (const rule of this.customRules.values()) {
      if (rule.languages && rule.languages.length > 0 && !rule.languages.includes(language)) {
        continue;
      }

      if (rule.analyze) {
        try {
          findings.push(...rule.analyze(code, language));
        } catch {
          // Silently skip failed custom rules
        }
        continue;
      }

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
            recommendation: rule.suggestedFix || "Review this pattern.",
          });

          if (!rule.pattern.flags.includes("g")) break;
        }
      }
    }

    return findings;
  }

  // ── Lifecycle Hooks ──────────────────────────────────────────────────

  /**
   * Run all beforeEvaluate hooks from registered plugins.
   */
  runBeforeHooks(code: string, language: string): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeEvaluate) {
        try {
          plugin.beforeEvaluate(code, language);
        } catch {
          // Swallow hook errors for resilience
        }
      }
    }
  }

  /**
   * Run all afterEvaluate hooks from registered plugins.
   */
  runAfterHooks(findings: Finding[]): Finding[] {
    let result = findings;
    for (const plugin of this.plugins.values()) {
      if (plugin.afterEvaluate) {
        try {
          result = plugin.afterEvaluate(result);
        } catch {
          // Swallow hook errors for resilience
        }
      }
    }
    return result;
  }

  /**
   * Run all transformFindings hooks from registered plugins.
   */
  runTransformHooks(findings: Finding[]): Finding[] {
    let result = findings;
    for (const plugin of this.plugins.values()) {
      if (plugin.transformFindings) {
        try {
          result = plugin.transformFindings(result);
        } catch {
          // Swallow hook errors for resilience
        }
      }
    }
    return result;
  }

  // ── Utilities ────────────────────────────────────────────────────────

  /**
   * Remove all plugins and their associated rules/judges. Built-in judges
   * (registered directly, not through a plugin) are preserved.
   */
  clearPlugins(): void {
    for (const name of [...this.plugins.keys()]) {
      this.unregisterPlugin(name);
    }
  }

  /**
   * Remove all judges, plugins, and custom rules. Primarily for testing.
   */
  clear(): void {
    this.judges.clear();
    this.plugins.clear();
    this.customRules.clear();
  }
}

// ─── Default Registry Singleton ──────────────────────────────────────────────
// All built-in judges self-register here via side-effect imports.
// Plugins also register here at runtime.

export const defaultRegistry = new JudgeRegistry();
