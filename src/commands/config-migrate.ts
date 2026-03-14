/**
 * `judges config-migrate` — Configuration migration assistant.
 *
 * Helps users upgrade their .judgesrc configs between Judges versions.
 * Detects deprecated fields, renamed keys, and structural changes,
 * then applies automatic or guided migrations.
 *
 * Usage:
 *   judges config-migrate                     # Analyze current .judgesrc
 *   judges config-migrate --apply             # Apply migrations in place
 *   judges config-migrate --dry-run           # Show changes without writing
 *   judges config-migrate --config path       # Specify config path
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MigrationRule {
  /** Unique migration ID */
  id: string;
  /** Version that introduced the change */
  since: string;
  /** Description of what changed */
  description: string;
  /** Severity: "error" = will break, "warning" = deprecated, "info" = suggestion */
  level: "error" | "warning" | "info";
  /** Detect function — returns true if this migration applies */
  detect: (config: Record<string, unknown>) => boolean;
  /** Apply function — returns mutated config */
  apply: (config: Record<string, unknown>) => Record<string, unknown>;
}

export interface MigrationResult {
  /** Path to config file */
  configPath: string;
  /** Migrations that matched */
  applied: Array<{ id: string; description: string; level: string }>;
  /** Whether any changes were made */
  hasChanges: boolean;
  /** Migrated config (if changes exist) */
  migratedConfig?: Record<string, unknown>;
}

// ─── Migration Rules ────────────────────────────────────────────────────────

const MIGRATIONS: MigrationRule[] = [
  {
    id: "M001-severity-rename",
    since: "3.0.0",
    description: 'Rename "warning" severity to "medium" (severity levels: critical, high, medium, low, info)',
    level: "error",
    detect: (config) => {
      const overrides = config.ruleOverrides as Record<string, Record<string, unknown>> | undefined;
      if (!overrides) return false;
      return Object.values(overrides).some((o) => o.severity === "warning");
    },
    apply: (config) => {
      const overrides = config.ruleOverrides as Record<string, Record<string, unknown>>;
      for (const [key, val] of Object.entries(overrides)) {
        if (val.severity === "warning") {
          overrides[key] = { ...val, severity: "medium" };
        }
      }
      return { ...config, ruleOverrides: overrides };
    },
  },
  {
    id: "M002-min-severity-string",
    since: "3.0.0",
    description: "Numeric minSeverity (1-5) should be replaced with string value (critical/high/medium/low/info)",
    level: "error",
    detect: (config) => typeof config.minSeverity === "number",
    apply: (config) => {
      const mapping: Record<number, string> = { 5: "critical", 4: "high", 3: "medium", 2: "low", 1: "info" };
      const newSev = mapping[config.minSeverity as number] || "medium";
      return { ...config, minSeverity: newSev };
    },
  },
  {
    id: "M003-disabled-rules-object",
    since: "3.10.0",
    description: "disabledRules should be an array of strings, not an object",
    level: "error",
    detect: (config) => config.disabledRules !== undefined && !Array.isArray(config.disabledRules),
    apply: (config) => {
      const obj = config.disabledRules as Record<string, unknown>;
      return { ...config, disabledRules: Object.keys(obj) };
    },
  },
  {
    id: "M004-ignorePatterns-to-exclude",
    since: "3.15.0",
    description: 'Renamed "ignorePatterns" to "exclude" for consistency',
    level: "warning",
    detect: (config) => "ignorePatterns" in config,
    apply: (config) => {
      const { ignorePatterns, ...rest } = config;
      const existing = (rest.exclude as string[]) || [];
      const patterns = Array.isArray(ignorePatterns) ? ignorePatterns : [ignorePatterns];
      return { ...rest, exclude: [...existing, ...(patterns as string[])] };
    },
  },
  {
    id: "M005-level-to-preset",
    since: "3.20.0",
    description: 'Renamed "level" to "preset" for config profiles',
    level: "warning",
    detect: (config) => "level" in config && !("preset" in config),
    apply: (config) => {
      const { level, ...rest } = config;
      return { ...rest, preset: level as string };
    },
  },
  {
    id: "M006-whitelist-to-include",
    since: "3.15.0",
    description: 'Renamed "whitelist" to "include" for inclusive terminology',
    level: "warning",
    detect: (config) => "whitelist" in config,
    apply: (config) => {
      const { whitelist, ...rest } = config;
      const existing = (rest.include as string[]) || [];
      const patterns = Array.isArray(whitelist) ? whitelist : [whitelist];
      return { ...rest, include: [...existing, ...(patterns as string[])] };
    },
  },
  {
    id: "M007-output-to-format",
    since: "3.20.0",
    description: 'Renamed "output" to "format" for output format specification',
    level: "warning",
    detect: (config) => "output" in config && !("format" in config),
    apply: (config) => {
      const { output, ...rest } = config;
      return { ...rest, format: output as string };
    },
  },
  {
    id: "M008-judges-to-disabledJudges",
    since: "3.25.0",
    description: '"skipJudges" array should be "disabledJudges"',
    level: "warning",
    detect: (config) => "skipJudges" in config,
    apply: (config) => {
      const { skipJudges, ...rest } = config;
      const existing = (rest.disabledJudges as string[]) || [];
      const skip = Array.isArray(skipJudges) ? skipJudges : [skipJudges];
      return { ...rest, disabledJudges: [...existing, ...(skip as string[])] };
    },
  },
  {
    id: "M009-data-adapter-string",
    since: "3.35.0",
    description: "dataAdapter should be an object { type, url?, headers? }, not a string",
    level: "warning",
    detect: (config) => typeof config.dataAdapter === "string",
    apply: (config) => {
      const da = config.dataAdapter as string;
      if (da.startsWith("http")) {
        return { ...config, dataAdapter: { type: "http", url: da } };
      }
      return { ...config, dataAdapter: { type: "filesystem" } };
    },
  },
  {
    id: "M010-custom-rules-flat",
    since: "3.30.0",
    description: 'customRules entries require "id" field (previously auto-generated from index)',
    level: "info",
    detect: (config) => {
      const rules = config.customRules as Array<Record<string, unknown>> | undefined;
      if (!rules || !Array.isArray(rules)) return false;
      return rules.some((r) => !r.id);
    },
    apply: (config) => {
      const rules = config.customRules as Array<Record<string, unknown>>;
      const patched = rules.map((r, i) => (r.id ? r : { ...r, id: `CUSTOM-${String(i + 1).padStart(3, "0")}` }));
      return { ...config, customRules: patched };
    },
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

export function analyzeConfig(config: Record<string, unknown>): MigrationResult {
  const applied: MigrationResult["applied"] = [];
  let migratedConfig = { ...config };
  let hasChanges = false;

  for (const rule of MIGRATIONS) {
    if (rule.detect(config)) {
      applied.push({ id: rule.id, description: rule.description, level: rule.level });
      migratedConfig = rule.apply(migratedConfig);
      hasChanges = true;
    }
  }

  return { configPath: "", applied, hasChanges, migratedConfig: hasChanges ? migratedConfig : undefined };
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runConfigMigrate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges config-migrate — Configuration migration assistant

Usage:
  judges config-migrate                     Analyze .judgesrc for issues
  judges config-migrate --apply             Apply migrations in place
  judges config-migrate --dry-run           Show changes without writing
  judges config-migrate --config <path>     Specify config file path

Detects and fixes:
  • Renamed fields (ignorePatterns→exclude, output→format, etc.)
  • Deprecated value types (numeric severity → string)
  • Structural changes (object → array for disabledRules)
  • Missing required fields (customRules.id)
  • Terminology updates (whitelist→include, skipJudges→disabledJudges)

Options:
  --apply                Apply migrations and write updated config
  --dry-run              Show what would change (default behavior)
  --config <path>        Path to .judgesrc file (default: ./.judgesrc)
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const configPath = resolve(argv.find((_a, i) => argv[i - 1] === "--config") || ".judgesrc");
  const shouldApply = argv.includes("--apply");
  const format = argv.find((_a, i) => argv[i - 1] === "--format") || "text";

  if (!existsSync(configPath)) {
    console.log(`\n  No config file found at ${configPath}\n`);
    console.log("  Run 'judges init' to create a .judgesrc, or specify --config <path>\n");
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    console.error(`\n  Error parsing ${configPath}: ${err instanceof Error ? err.message : String(err)}\n`);
    return;
  }

  const result = analyzeConfig(config);
  result.configPath = configPath;

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Config Migration Analysis: ${configPath}\n`);

  if (result.applied.length === 0) {
    console.log("  ✅ No migrations needed — config is up to date.\n");
    return;
  }

  const icons = { error: "❌", warning: "⚠️", info: "ℹ️" };

  for (const m of result.applied) {
    const icon = icons[m.level as keyof typeof icons] || "•";
    console.log(`  ${icon} [${m.id}] ${m.description}`);
  }

  const errors = result.applied.filter((m) => m.level === "error").length;
  const warnings = result.applied.filter((m) => m.level === "warning").length;
  const infos = result.applied.filter((m) => m.level === "info").length;

  console.log(`\n  Summary: ${errors} error(s), ${warnings} warning(s), ${infos} info(s)\n`);

  if (shouldApply && result.migratedConfig) {
    writeFileSync(configPath, JSON.stringify(result.migratedConfig, null, 2) + "\n", "utf-8");
    console.log(`  ✅ Migrated config written to ${configPath}\n`);
  } else if (result.hasChanges) {
    console.log("  Run with --apply to write the migrated config.\n");
  }
}
