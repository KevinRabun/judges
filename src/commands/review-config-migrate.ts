/**
 * Review-config-migrate — Migrate configuration between versions.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MigrationRule {
  from: string;
  to: string;
  description: string;
  transform: (value: unknown) => unknown;
}

// ─── Migration Rules ────────────────────────────────────────────────────────

function getMigrationRules(): MigrationRule[] {
  return [
    {
      from: "severity",
      to: "minSeverity",
      description: "Renamed 'severity' to 'minSeverity'",
      transform: (v) => v,
    },
    {
      from: "judges",
      to: "disabledJudges",
      description: "Renamed 'judges' to 'disabledJudges' (inverted logic)",
      transform: (v) => v,
    },
    {
      from: "rules",
      to: "ruleOverrides",
      description: "Renamed 'rules' to 'ruleOverrides'",
      transform: (v) => v,
    },
    {
      from: "threshold",
      to: "minSeverity",
      description: "Replaced 'threshold' with 'minSeverity'",
      transform: (v) => {
        const num = typeof v === "number" ? v : 0;
        if (num >= 9) return "critical";
        if (num >= 7) return "high";
        if (num >= 5) return "medium";
        if (num >= 3) return "low";
        return "info";
      },
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewConfigMigrate(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const outputIdx = argv.indexOf("--output");
  const dryRunFlag = argv.includes("--dry-run");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-config-migrate — Migrate config between versions

Usage:
  judges review-config-migrate --file <config.json> [--output <path>]
                               [--dry-run] [--format table|json]

Options:
  --file <path>     Config file to migrate
  --output <path>   Write migrated config to file (default: overwrite)
  --dry-run         Show migrations without applying
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.error(`Error: failed to parse config: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const rules = getMigrationRules();
  const applied: Array<{ rule: string; from: string; to: string }> = [];

  for (const rule of rules) {
    if (config[rule.from] !== undefined && config[rule.to] === undefined) {
      if (!dryRunFlag) {
        config[rule.to] = rule.transform(config[rule.from]);
        delete config[rule.from];
      }
      applied.push({ rule: rule.description, from: rule.from, to: rule.to });
    }
  }

  if (!dryRunFlag && applied.length > 0) {
    const out = outputPath !== undefined ? outputPath : filePath;
    writeFileSync(out, JSON.stringify(config, null, 2));
  }

  if (format === "json") {
    console.log(JSON.stringify({ migrations: applied, config: dryRunFlag ? undefined : config }, null, 2));
    return;
  }

  console.log(`\nConfig Migration${dryRunFlag ? " (dry run)" : ""}`);
  console.log("═".repeat(55));

  if (applied.length === 0) {
    console.log("  No migrations needed. Config is up to date.");
  } else {
    for (const a of applied) {
      console.log(`  ${a.from} → ${a.to}: ${a.rule}`);
    }
    if (!dryRunFlag) {
      console.log(`\n  Config saved to: ${outputPath !== undefined ? outputPath : filePath}`);
    }
  }

  console.log("═".repeat(55));
}
