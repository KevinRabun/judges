// ─── Community Pattern Import/Export ──────────────────────────────────────────
// Provides CLI commands to import and export community-contributed rule patterns
// from/to local JSON files.  These are merged into the .judgesrc customRules
// configuration, enabling crowdsourced quality improvements without any network
// calls or telemetry.
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CustomRule } from "../types.js";
import { parseConfig } from "../config.js";

interface CommunityPack {
  name: string;
  version: string;
  description?: string;
  rules: CustomRule[];
}

function loadJudgesrc(): Record<string, unknown> {
  const paths = [".judgesrc", ".judgesrc.json"];
  for (const p of paths) {
    const full = resolve(process.cwd(), p);
    if (existsSync(full)) {
      return JSON.parse(readFileSync(full, "utf-8")) as Record<string, unknown>;
    }
  }
  return {};
}

function saveJudgesrc(obj: Record<string, unknown>): void {
  const target = resolve(process.cwd(), ".judgesrc");
  writeFileSync(target, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

export async function runCommunityPatterns(argv: string[]): Promise<void> {
  const sub = argv[3];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
Usage:
  judges community-patterns import <file.json>   Import rules from a community pack
  judges community-patterns export <file.json>   Export current custom rules to a pack
  judges community-patterns list                 List currently loaded custom rules

Import merges rules into your .judgesrc customRules (de-duplicated by rule id).
Export writes your customRules to a portable JSON pack file.
`);
    return;
  }

  if (sub === "import") {
    const filePath = argv[4];
    if (!filePath) {
      console.error("Error: specify a JSON file to import.");
      process.exit(1);
    }
    const full = resolve(process.cwd(), filePath);
    if (!existsSync(full)) {
      console.error(`File not found: ${full}`);
      process.exit(1);
    }

    let pack: CommunityPack;
    try {
      pack = JSON.parse(readFileSync(full, "utf-8")) as CommunityPack;
    } catch {
      console.error("Error: invalid JSON file.");
      process.exit(1);
      return; // unreachable, for TS
    }

    if (!Array.isArray(pack.rules) || pack.rules.length === 0) {
      console.error("Error: pack contains no rules.");
      process.exit(1);
    }

    // Validate each rule structurally
    for (const r of pack.rules) {
      if (!r.id || !r.pattern || !r.title || !r.severity) {
        console.error(
          `Error: rule "${r.id ?? "(unnamed)"}" is missing required fields (id, pattern, title, severity).`,
        );
        process.exit(1);
      }
    }

    const rc = loadJudgesrc();
    const existing: CustomRule[] = Array.isArray(rc.customRules) ? (rc.customRules as CustomRule[]) : [];
    const existingIds = new Set(existing.map((r) => r.id));

    let added = 0;
    for (const r of pack.rules) {
      if (!existingIds.has(r.id)) {
        existing.push(r);
        existingIds.add(r.id);
        added++;
      }
    }

    rc.customRules = existing;
    saveJudgesrc(rc);

    // Validate merged config
    try {
      parseConfig(JSON.stringify(rc));
    } catch (e) {
      console.error(`Warning: merged config has validation issues: ${(e as Error).message}`);
    }

    console.log(
      `Imported ${added} new rule(s) from "${pack.name ?? filePath}" (${pack.rules.length - added} duplicate(s) skipped).`,
    );
    return;
  }

  if (sub === "export") {
    const filePath = argv[4];
    if (!filePath) {
      console.error("Error: specify an output JSON file path.");
      process.exit(1);
    }

    const rc = loadJudgesrc();
    const rules: CustomRule[] = Array.isArray(rc.customRules) ? (rc.customRules as CustomRule[]) : [];

    if (rules.length === 0) {
      console.error("No custom rules found in .judgesrc to export.");
      process.exit(1);
    }

    const pack: CommunityPack = {
      name: "custom-rules",
      version: "1.0.0",
      description: "Exported from .judgesrc",
      rules,
    };

    writeFileSync(resolve(process.cwd(), filePath), JSON.stringify(pack, null, 2) + "\n", "utf-8");
    console.log(`Exported ${rules.length} rule(s) to ${filePath}.`);
    return;
  }

  if (sub === "list") {
    const rc = loadJudgesrc();
    const rules: CustomRule[] = Array.isArray(rc.customRules) ? (rc.customRules as CustomRule[]) : [];

    if (rules.length === 0) {
      console.log("No custom rules configured in .judgesrc.");
      return;
    }

    console.log(`Custom rules (${rules.length}):\n`);
    for (const r of rules) {
      console.log(`  ${r.id}  [${r.severity}]  ${r.title}`);
      if (r.description) console.log(`    ${r.description}`);
    }
    return;
  }

  console.error(`Unknown sub-command: ${sub}. Use --help for usage.`);
  process.exit(1);
}
