/**
 * Custom rule sharing — export/import custom rule configurations
 * across teams and organizations.
 *
 * Stored locally in .judges-shared-rules/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SharedRuleOverride {
  ruleId: string;
  severity?: string;
  enabled?: boolean;
  threshold?: number;
  notes?: string;
}

interface SharedRulePackage {
  name: string;
  version: string;
  description: string;
  author: string;
  rules: SharedRuleOverride[];
  disabledRules?: string[];
  disabledJudges?: string[];
  preset?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

const SHARE_DIR = ".judges-shared-rules";

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(SHARE_DIR)) mkdirSync(SHARE_DIR, { recursive: true });
}

export function exportRules(
  name: string,
  description: string,
  author: string,
  configFile = ".judgesrc",
): SharedRulePackage {
  let config: Record<string, unknown> = {};
  if (existsSync(configFile)) {
    config = JSON.parse(readFileSync(configFile, "utf-8"));
  }

  const rules: SharedRuleOverride[] = [];
  if (config.ruleOverrides && typeof config.ruleOverrides === "object") {
    for (const [ruleId, override] of Object.entries(config.ruleOverrides as Record<string, Record<string, unknown>>)) {
      rules.push({
        ruleId,
        severity: override.severity as string | undefined,
        enabled: override.enabled as boolean | undefined,
        threshold: override.threshold as number | undefined,
      });
    }
  }

  const pkg: SharedRulePackage = {
    name,
    version: "1.0.0",
    description,
    author,
    rules,
    disabledRules: (config.disabledRules as string[]) || [],
    disabledJudges: (config.disabledJudges as string[]) || [],
    preset: config.preset as string | undefined,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ensureDir();
  writeFileSync(join(SHARE_DIR, `${name}.json`), JSON.stringify(pkg, null, 2));
  return pkg;
}

export function importRules(packageFile: string, configFile = ".judgesrc"): { applied: number; skipped: number } {
  const pkg: SharedRulePackage = JSON.parse(readFileSync(packageFile, "utf-8"));

  let config: Record<string, unknown> = {};
  if (existsSync(configFile)) {
    config = JSON.parse(readFileSync(configFile, "utf-8"));
  }

  let applied = 0;
  let skipped = 0;

  // Merge rule overrides
  if (!config.ruleOverrides) config.ruleOverrides = {};
  const overrides = config.ruleOverrides as Record<string, Record<string, unknown>>;

  for (const rule of pkg.rules) {
    if (overrides[rule.ruleId]) {
      skipped++;
      continue;
    }
    overrides[rule.ruleId] = {};
    if (rule.severity) overrides[rule.ruleId].severity = rule.severity;
    if (rule.enabled !== undefined) overrides[rule.ruleId].enabled = rule.enabled;
    if (rule.threshold !== undefined) overrides[rule.ruleId].threshold = rule.threshold;
    applied++;
  }

  // Merge disabled rules
  if (pkg.disabledRules && pkg.disabledRules.length > 0) {
    const existing = new Set((config.disabledRules as string[]) || []);
    for (const r of pkg.disabledRules) {
      if (!existing.has(r)) {
        existing.add(r);
        applied++;
      }
    }
    config.disabledRules = [...existing];
  }

  // Merge disabled judges
  if (pkg.disabledJudges && pkg.disabledJudges.length > 0) {
    const existing = new Set((config.disabledJudges as string[]) || []);
    for (const j of pkg.disabledJudges) {
      if (!existing.has(j)) {
        existing.add(j);
        applied++;
      }
    }
    config.disabledJudges = [...existing];
  }

  writeFileSync(configFile, JSON.stringify(config, null, 2));
  return { applied, skipped };
}

export function listPackages(): SharedRulePackage[] {
  ensureDir();
  const files = readdirSync(SHARE_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(readFileSync(join(SHARE_DIR, f), "utf-8")));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRuleShare(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges rule-share — Export and import custom rule configurations

Usage:
  judges rule-share --export "my-rules" --description "Team security rules" --author "Alice"
  judges rule-share --import .judges-shared-rules/my-rules.json
  judges rule-share --list
  judges rule-share --inspect .judges-shared-rules/my-rules.json

Options:
  --export <name>        Export current config as a shareable package
  --description <text>   Package description
  --author <name>        Package author
  --import <file>        Import a rule package into .judgesrc
  --list                 List available packages
  --inspect <file>       Show package contents
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Export
  const exportName = argv.find((_a: string, i: number) => argv[i - 1] === "--export");
  if (exportName) {
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || "";
    const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author") || "unknown";
    const pkg = exportRules(exportName, desc, author);
    if (format === "json") {
      console.log(JSON.stringify(pkg, null, 2));
    } else {
      console.log(`  ✅ Exported "${exportName}" → ${SHARE_DIR}/${exportName}.json`);
      console.log(`     ${pkg.rules.length} rule override(s), ${(pkg.disabledRules || []).length} disabled rule(s)`);
    }
    return;
  }

  // Import
  const importFile = argv.find((_a: string, i: number) => argv[i - 1] === "--import");
  if (importFile) {
    if (!existsSync(importFile)) {
      console.error(`  ❌ File not found: ${importFile}`);
      return;
    }
    const result = importRules(importFile);
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`  ✅ Imported: ${result.applied} applied, ${result.skipped} skipped (existing)`);
    }
    return;
  }

  // Inspect
  const inspectFile = argv.find((_a: string, i: number) => argv[i - 1] === "--inspect");
  if (inspectFile) {
    if (!existsSync(inspectFile)) {
      console.error(`  ❌ File not found: ${inspectFile}`);
      return;
    }
    const pkg: SharedRulePackage = JSON.parse(readFileSync(inspectFile, "utf-8"));
    if (format === "json") {
      console.log(JSON.stringify(pkg, null, 2));
    } else {
      console.log(`\n  Package: ${pkg.name} v${pkg.version}`);
      console.log(`  Author:  ${pkg.author}`);
      console.log(`  Description: ${pkg.description}`);
      console.log(`  ──────────────────────`);
      console.log(`  Rule overrides: ${pkg.rules.length}`);
      for (const r of pkg.rules) {
        console.log(`    ${r.ruleId.padEnd(20)} sev: ${r.severity || "—"} enabled: ${r.enabled ?? "—"}`);
      }
      console.log(`  Disabled rules:  ${(pkg.disabledRules || []).length}`);
      console.log(`  Disabled judges: ${(pkg.disabledJudges || []).length}`);
      console.log(`  Preset:          ${pkg.preset || "—"}\n`);
    }
    return;
  }

  // List
  const packages = listPackages();
  if (packages.length === 0) {
    console.log("\n  No shared rule packages. Use --export to create one.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(packages, null, 2));
  } else {
    console.log(`\n  Shared Rule Packages (${packages.length})\n  ────────────────────────`);
    for (const p of packages) {
      console.log(`    ${p.name.padEnd(20)} v${p.version.padEnd(8)} by ${p.author} (${p.rules.length} rules)`);
    }
    console.log("");
  }
}
