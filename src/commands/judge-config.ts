/**
 * Judge-config — Per-judge sensitivity and configuration overrides.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface JudgeOverride {
  judgeId: string;
  enabled: boolean;
  sensitivityMultiplier: number;
  minSeverity: string;
  customThresholds: Record<string, number>;
  notes: string;
}

interface JudgeConfigFile {
  version: string;
  overrides: JudgeOverride[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CONFIG_FILE = join(".judges", "judge-config.json");

function loadJudgeConfig(): JudgeConfigFile {
  if (!existsSync(CONFIG_FILE)) return { version: "1.0.0", overrides: [] };
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as JudgeConfigFile;
  } catch {
    return { version: "1.0.0", overrides: [] };
  }
}

function saveJudgeConfig(config: JudgeConfigFile): void {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runJudgeConfig(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges judge-config — Per-judge configuration overrides

Usage:
  judges judge-config list                            List judge configs
  judges judge-config show --judge data-security      Show judge settings
  judges judge-config set --judge data-security --sensitivity 1.5
  judges judge-config reset --judge data-security     Reset to defaults
  judges judge-config --format json                   JSON output

Subcommands:
  list                 List all judges with override status
  show                 Show configuration for a specific judge
  set                  Set override values for a judge
  reset                Reset a judge to default settings

Options:
  --judge <id>         Judge ID (required for show/set/reset)
  --sensitivity <n>    Sensitivity multiplier (0.1-3.0, default: 1.0)
  --min-severity <s>   Minimum severity: critical, high, medium, low
  --enabled <bool>     Enable/disable judge (true/false)
  --notes <text>       Notes about override reason
  --format json        JSON output
  --help, -h           Show this help

Judge configs are stored locally in .judges/judge-config.json.
Higher sensitivity catches more issues but may produce more false positives.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const judgeId = argv.find((_a: string, i: number) => argv[i - 1] === "--judge");
  const subcommand = argv.find((a) => ["list", "show", "set", "reset"].includes(a)) || "list";
  const config = loadJudgeConfig();

  if (subcommand === "list") {
    const judges = defaultRegistry.getJudges();
    const overrideMap = new Map(config.overrides.map((o) => [o.judgeId, o]));

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            judges: judges.map((j) => ({
              id: j.id,
              hasOverride: overrideMap.has(j.id),
              override: overrideMap.get(j.id) || null,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\n  Judge Configuration (${judges.length} judges)\n  ─────────────────────────────`);

    for (const j of judges) {
      const override = overrideMap.get(j.id);
      if (override) {
        const icon = override.enabled ? "⚙️" : "⬜";
        console.log(
          `    ${icon} ${j.id} — sensitivity: ${override.sensitivityMultiplier}x, min: ${override.minSeverity}`,
        );
      } else {
        console.log(`    ✅ ${j.id} — defaults`);
      }
    }

    console.log();
    return;
  }

  if (!judgeId) {
    console.error("Error: --judge is required.");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "reset") {
    const idx = config.overrides.findIndex((o) => o.judgeId === judgeId);
    if (idx >= 0) {
      config.overrides.splice(idx, 1);
      saveJudgeConfig(config);
      console.log(`Reset '${judgeId}' to defaults.`);
    } else {
      console.log(`No override found for '${judgeId}'.`);
    }
    return;
  }

  if (subcommand === "set") {
    const sensitivityStr = argv.find((_a: string, i: number) => argv[i - 1] === "--sensitivity");
    const minSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity");
    const enabledStr = argv.find((_a: string, i: number) => argv[i - 1] === "--enabled");
    const notes = argv.find((_a: string, i: number) => argv[i - 1] === "--notes");

    let override = config.overrides.find((o) => o.judgeId === judgeId);
    if (!override) {
      override = {
        judgeId,
        enabled: true,
        sensitivityMultiplier: 1.0,
        minSeverity: "low",
        customThresholds: {},
        notes: "",
      };
      config.overrides.push(override);
    }

    if (sensitivityStr) override.sensitivityMultiplier = parseFloat(sensitivityStr);
    if (minSeverity) override.minSeverity = minSeverity;
    if (enabledStr) override.enabled = enabledStr === "true";
    if (notes) override.notes = notes;

    saveJudgeConfig(config);
    console.log(
      `Updated '${judgeId}': sensitivity=${override.sensitivityMultiplier}x, min=${override.minSeverity}, enabled=${override.enabled}`,
    );
    return;
  }

  // Show
  const override = config.overrides.find((o) => o.judgeId === judgeId);

  if (format === "json") {
    console.log(JSON.stringify({ judgeId, hasOverride: !!override, override: override || null }, null, 2));
    return;
  }

  console.log(`\n  Judge: ${judgeId}\n  ─────────────────────────────`);

  if (override) {
    console.log(`    Enabled: ${override.enabled}`);
    console.log(`    Sensitivity: ${override.sensitivityMultiplier}x`);
    console.log(`    Min severity: ${override.minSeverity}`);
    if (override.notes) console.log(`    Notes: ${override.notes}`);
  } else {
    console.log(`    Using defaults (no overrides set)`);
  }

  console.log();
}
