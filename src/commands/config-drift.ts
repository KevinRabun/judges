/**
 * Config drift detector — compare team configurations against an
 * organizational baseline to detect policy divergence.
 *
 * Uses local .judgesrc files.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DriftItem {
  type: "disabled-rule" | "disabled-judge" | "severity-override" | "missing-preset" | "extra-rule";
  key: string;
  baselineValue?: string;
  actualValue?: string;
  impact: "high" | "medium" | "low";
}

interface ConfigDriftReport {
  configFile: string;
  baselineFile: string;
  driftScore: number; // 0 = aligned, 100 = fully drifted
  items: DriftItem[];
  summary: string;
}

// ─── Core ───────────────────────────────────────────────────────────────────

function loadConfig(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

export function detectDrift(baselineFile: string, configFile: string): ConfigDriftReport {
  const baseline = loadConfig(baselineFile);
  const config = loadConfig(configFile);

  const items: DriftItem[] = [];

  // Check disabled rules
  const baselineDisabledRules = new Set((baseline.disabledRules as string[]) || []);
  const configDisabledRules = new Set((config.disabledRules as string[]) || []);

  for (const rule of configDisabledRules) {
    if (!baselineDisabledRules.has(rule)) {
      items.push({
        type: "disabled-rule",
        key: rule,
        baselineValue: "enabled",
        actualValue: "disabled",
        impact: rule.startsWith("SEC") || rule.startsWith("AUTH") || rule.startsWith("CRYPTO") ? "high" : "medium",
      });
    }
  }

  // Check disabled judges
  const baselineDisabledJudges = new Set((baseline.disabledJudges as string[]) || []);
  const configDisabledJudges = new Set((config.disabledJudges as string[]) || []);

  for (const judge of configDisabledJudges) {
    if (!baselineDisabledJudges.has(judge)) {
      items.push({
        type: "disabled-judge",
        key: judge,
        baselineValue: "enabled",
        actualValue: "disabled",
        impact: ["cybersecurity", "authentication", "injection"].includes(judge) ? "high" : "medium",
      });
    }
  }

  // Check severity overrides
  const baselineOverrides = (baseline.ruleOverrides || {}) as Record<string, Record<string, unknown>>;
  const configOverrides = (config.ruleOverrides || {}) as Record<string, Record<string, unknown>>;

  for (const [ruleId, override] of Object.entries(configOverrides)) {
    const baseOverride = baselineOverrides[ruleId];
    if (override.severity && (!baseOverride || override.severity !== baseOverride.severity)) {
      const severityOrder = ["critical", "high", "medium", "low"];
      const configIdx = severityOrder.indexOf(override.severity as string);
      const baseIdx = baseOverride ? severityOrder.indexOf(baseOverride.severity as string) : -1;
      const weakened = configIdx > baseIdx;

      items.push({
        type: "severity-override",
        key: ruleId,
        baselineValue: (baseOverride?.severity as string) || "default",
        actualValue: override.severity as string,
        impact: weakened ? "high" : "low",
      });
    }
  }

  // Check preset alignment
  if (baseline.preset && config.preset !== baseline.preset) {
    items.push({
      type: "missing-preset",
      key: "preset",
      baselineValue: baseline.preset as string,
      actualValue: (config.preset as string) || "none",
      impact: "medium",
    });
  }

  // Drift score
  const highCount = items.filter((i) => i.impact === "high").length;
  const medCount = items.filter((i) => i.impact === "medium").length;
  const lowCount = items.filter((i) => i.impact === "low").length;
  const driftScore = Math.min(100, highCount * 20 + medCount * 10 + lowCount * 5);

  return {
    configFile,
    baselineFile,
    driftScore,
    items,
    summary:
      items.length === 0
        ? "Configuration is aligned with baseline."
        : `${items.length} deviation(s) detected. Drift score: ${driftScore}/100.`,
  };
}

export function scanDirectory(baselineFile: string, dir: string): ConfigDriftReport[] {
  const reports: ConfigDriftReport[] = [];

  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
          walk(full);
        } else if (entry === ".judgesrc" || entry === ".judgesrc.json") {
          reports.push(detectDrift(baselineFile, full));
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }

  walk(dir);
  return reports;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runConfigDrift(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges config-drift — Detect configuration divergence from baseline

Usage:
  judges config-drift --baseline org-baseline.judgesrc --config team/.judgesrc
  judges config-drift --baseline org-baseline.judgesrc --scan ./teams/
  judges config-drift --baseline org-baseline.judgesrc --self

Options:
  --baseline <file>    Organization baseline config file
  --config <file>      Team config to compare
  --scan <dir>         Scan directory for .judgesrc files and compare all
  --self               Compare local .judgesrc against baseline
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const baselineFile = argv.find((_a: string, i: number) => argv[i - 1] === "--baseline");

  if (!baselineFile) {
    console.error("  ❌ Provide --baseline <file>. Use --help for usage.");
    return;
  }

  if (!existsSync(baselineFile)) {
    console.error(`  ❌ Baseline not found: ${baselineFile}`);
    return;
  }

  // Scan directory
  const scanDir = argv.find((_a: string, i: number) => argv[i - 1] === "--scan");
  if (scanDir) {
    const reports = scanDirectory(baselineFile, scanDir);
    if (format === "json") {
      console.log(JSON.stringify(reports, null, 2));
    } else if (reports.length === 0) {
      console.log("\n  No .judgesrc files found in scan directory.\n");
    } else {
      console.log(`\n  Config Drift Scan (${reports.length} config(s))\n  ──────────────────────────────`);
      for (const r of reports) {
        const icon = r.driftScore === 0 ? "✅" : r.driftScore > 50 ? "🚨" : "⚠️";
        console.log(
          `    ${icon} ${basename(r.configFile).padEnd(20)} drift: ${r.driftScore}/100 (${r.items.length} item(s))`,
        );
      }
      console.log("");
    }
    return;
  }

  // Compare self
  if (argv.includes("--self")) {
    const localConfig = existsSync(".judgesrc") ? ".judgesrc" : ".judgesrc.json";
    if (!existsSync(localConfig)) {
      console.error("  ❌ No local .judgesrc found");
      return;
    }
    const report = detectDrift(baselineFile, localConfig);
    printReport(report, format);
    return;
  }

  // Compare specific config
  const configFile = argv.find((_a: string, i: number) => argv[i - 1] === "--config");
  if (configFile) {
    if (!existsSync(configFile)) {
      console.error(`  ❌ Config not found: ${configFile}`);
      return;
    }
    const report = detectDrift(baselineFile, configFile);
    printReport(report, format);
    return;
  }

  console.error("  ❌ Provide --config, --scan, or --self. Use --help for usage.");
}

function printReport(report: ConfigDriftReport, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const icon = report.driftScore === 0 ? "✅" : report.driftScore > 50 ? "🚨" : "⚠️";
  console.log(`\n  ${icon} Config Drift Report`);
  console.log(`  Baseline: ${report.baselineFile}`);
  console.log(`  Config:   ${report.configFile}`);
  console.log(`  Drift Score: ${report.driftScore}/100`);
  console.log(`  ─────────────────────────`);

  if (report.items.length === 0) {
    console.log("  Configuration is aligned with baseline.\n");
    return;
  }

  for (const item of report.items) {
    const impactIcon = item.impact === "high" ? "🔴" : item.impact === "medium" ? "🟡" : "🟢";
    console.log(`    ${impactIcon} [${item.type}] ${item.key}: ${item.baselineValue} → ${item.actualValue}`);
  }
  console.log("");
}
