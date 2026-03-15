/**
 * Review-merge-config — Merge multiple Judges configuration files.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { JudgesConfig, Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MergeResult {
  merged: JudgesConfig;
  sources: string[];
  conflicts: Array<{ key: string; values: string[] }>;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function mergeConfigs(configs: Array<{ path: string; config: JudgesConfig }>): MergeResult {
  const merged: JudgesConfig = {};
  const conflicts: MergeResult["conflicts"] = [];
  const sources: string[] = configs.map((c) => c.path);

  // merge presets — last wins, track conflicts
  const presets = configs.filter((c) => c.config.preset).map((c) => c.config.preset as string);
  if (presets.length > 1 && new Set(presets).size > 1) {
    conflicts.push({ key: "preset", values: presets });
  }
  if (presets.length > 0) {
    merged.preset = presets[presets.length - 1];
  }

  // merge disabled judges — union
  const allDisabled = new Set<string>();
  for (const c of configs) {
    if (c.config.disabledJudges) {
      for (const j of c.config.disabledJudges) {
        allDisabled.add(j);
      }
    }
  }
  if (allDisabled.size > 0) {
    merged.disabledJudges = [...allDisabled];
  }

  // merge disabled rules — union
  const allDisabledRules = new Set<string>();
  for (const c of configs) {
    if (c.config.disabledRules) {
      for (const r of c.config.disabledRules) {
        allDisabledRules.add(r);
      }
    }
  }
  if (allDisabledRules.size > 0) {
    merged.disabledRules = [...allDisabledRules];
  }

  // merge minSeverity — most restrictive (highest)
  const severityOrder = ["low", "medium", "high", "critical"];
  const severities = configs.filter((c) => c.config.minSeverity).map((c) => c.config.minSeverity as string);
  if (severities.length > 0) {
    const maxSev = severities.reduce((a, b) => (severityOrder.indexOf(a) > severityOrder.indexOf(b) ? a : b));
    merged.minSeverity = maxSev as Severity;
  }

  return { merged, sources, conflicts };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMergeConfig(argv: string[]): void {
  const filesIdx = argv.indexOf("--files");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-merge-config — Merge configuration files

Usage:
  judges review-merge-config --files <a.json,b.json,...> [--output <out.json>]
                             [--format table|json]

Options:
  --files <paths>    Comma-separated config file paths (required)
  --output <path>    Write merged config to file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const filesArg = filesIdx >= 0 ? argv[filesIdx + 1] : undefined;
  if (!filesArg) {
    console.error("Error: --files required");
    process.exitCode = 1;
    return;
  }

  const filePaths = filesArg.split(",").map((f) => f.trim());
  const configs: Array<{ path: string; config: JudgesConfig }> = [];

  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`Error: not found: ${fp}`);
      process.exitCode = 1;
      return;
    }
    try {
      configs.push({ path: fp, config: JSON.parse(readFileSync(fp, "utf-8")) });
    } catch {
      console.error(`Error: invalid JSON: ${fp}`);
      process.exitCode = 1;
      return;
    }
  }

  const result = mergeConfigs(configs);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result.merged, null, 2));
    console.log(`Merged config written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nMerged Configuration (${result.sources.length} sources)`);
  console.log("═".repeat(60));
  console.log(`  Sources: ${result.sources.join(", ")}`);
  console.log(`  Merged config:`);
  console.log(`    ${JSON.stringify(result.merged, null, 2).replace(/\n/g, "\n    ")}`);
  if (result.conflicts.length > 0) {
    console.log(`\n  Conflicts (${result.conflicts.length}):`);
    for (const c of result.conflicts) {
      console.log(`    ${c.key}: ${c.values.join(" vs ")}`);
    }
  }
  console.log("═".repeat(60));
}
