/**
 * Review-custom-judge — Register and manage custom user-defined judges.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomJudge {
  id: string;
  name: string;
  description: string;
  rulePrefix: string;
  severity: string;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function registryFile(): string {
  return join(process.cwd(), ".judges", "custom-judges.json");
}

function loadRegistry(): CustomJudge[] {
  const f = registryFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveRegistry(judges: CustomJudge[]): void {
  const f = registryFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(judges, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCustomJudge(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-custom-judge — Manage custom user-defined judges

Usage:
  judges review-custom-judge list
  judges review-custom-judge add     --id <id> --name <name> [options]
  judges review-custom-judge remove  --id <id>
  judges review-custom-judge enable  --id <id>
  judges review-custom-judge disable --id <id>
  judges review-custom-judge show    --id <id>
  judges review-custom-judge clear

Options:
  --id <id>              Judge identifier (required for add/remove/enable/disable/show)
  --name <name>          Human-readable name
  --description <desc>   Description of what the judge checks
  --rule-prefix <pfx>    Rule ID prefix (e.g., CUSTOM-)
  --severity <sev>       Default severity: critical, high, medium, low
  --keywords <list>      Comma-separated keywords to match
  --help, -h             Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const judges = loadRegistry();

  if (sub === "list") {
    if (judges.length === 0) {
      console.log("No custom judges registered.");
      return;
    }
    console.log(`\nCustom Judges (${judges.length}):`);
    console.log("═".repeat(65));
    for (const j of judges) {
      const status = j.enabled ? "enabled" : "disabled";
      console.log(`  ${j.id.padEnd(20)} ${j.name.padEnd(25)} [${status}]`);
    }
    console.log("═".repeat(65));
  } else if (sub === "add") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!id || !name) {
      console.error("Error: --id and --name required");
      process.exitCode = 1;
      return;
    }
    if (judges.some((j) => j.id === id)) {
      console.error(`Error: judge "${id}" already exists`);
      process.exitCode = 1;
      return;
    }

    const desc = args.find((_a: string, i: number) => args[i - 1] === "--description") || "";
    const prefix = args.find((_a: string, i: number) => args[i - 1] === "--rule-prefix") || "CUSTOM-";
    const severity = args.find((_a: string, i: number) => args[i - 1] === "--severity") || "medium";
    const kwStr = args.find((_a: string, i: number) => args[i - 1] === "--keywords") || "";
    const keywords = kwStr ? kwStr.split(",").map((k) => k.trim()) : [];

    judges.push({
      id,
      name,
      description: desc,
      rulePrefix: prefix,
      severity,
      keywords,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    saveRegistry(judges);
    console.log(`Added custom judge: ${id} (${name})`);
  } else if (sub === "remove") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const filtered = judges.filter((j) => j.id !== id);
    if (filtered.length === judges.length) {
      console.error(`Judge "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    saveRegistry(filtered);
    console.log(`Removed custom judge: ${id}`);
  } else if (sub === "enable") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const j = judges.find((j) => j.id === id);
    if (!j) {
      console.error(`Judge "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    j.enabled = true;
    saveRegistry(judges);
    console.log(`Enabled: ${id}`);
  } else if (sub === "disable") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const j = judges.find((j) => j.id === id);
    if (!j) {
      console.error(`Judge "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    j.enabled = false;
    saveRegistry(judges);
    console.log(`Disabled: ${id}`);
  } else if (sub === "show") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const j = judges.find((j) => j.id === id);
    if (!j) {
      console.error(`Judge "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nCustom Judge: ${j.id}`);
    console.log("─".repeat(40));
    console.log(`  Name:        ${j.name}`);
    console.log(`  Description: ${j.description || "(none)"}`);
    console.log(`  Prefix:      ${j.rulePrefix}`);
    console.log(`  Severity:    ${j.severity}`);
    console.log(`  Keywords:    ${j.keywords.length > 0 ? j.keywords.join(", ") : "(none)"}`);
    console.log(`  Enabled:     ${j.enabled}`);
    console.log(`  Created:     ${j.createdAt}`);
  } else if (sub === "clear") {
    saveRegistry([]);
    console.log("All custom judges cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
