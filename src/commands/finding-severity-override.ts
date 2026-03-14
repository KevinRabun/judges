/**
 * Finding-severity-override — Override finding severity per project.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeverityOverride {
  ruleId: string;
  originalSeverity: string;
  overrideSeverity: string;
  reason: string;
  addedAt: string;
}

interface OverrideStore {
  version: string;
  overrides: SeverityOverride[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const OVERRIDE_FILE = join(".judges", "severity-overrides.json");

function loadStore(): OverrideStore {
  if (!existsSync(OVERRIDE_FILE)) return { version: "1.0.0", overrides: [] };
  try {
    return JSON.parse(readFileSync(OVERRIDE_FILE, "utf-8")) as OverrideStore;
  } catch {
    return { version: "1.0.0", overrides: [] };
  }
}

function saveStore(store: OverrideStore): void {
  mkdirSync(dirname(OVERRIDE_FILE), { recursive: true });
  writeFileSync(OVERRIDE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSeverityOverride(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-severity-override — Override finding severity per project

Usage:
  judges finding-severity-override set --rule sql-injection --severity low --reason "Internal tool only"
  judges finding-severity-override list
  judges finding-severity-override remove --rule sql-injection
  judges finding-severity-override clear

Subcommands:
  set                   Set a severity override
  list                  List all overrides
  remove                Remove an override
  clear                 Clear all overrides

Options:
  --rule <ruleId>       Rule ID to override
  --severity <level>    New severity (critical|high|medium|low|info)
  --reason <text>       Reason for the override
  --format json         JSON output
  --help, -h            Show this help

Override data stored in .judges/severity-overrides.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["set", "list", "remove", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "set") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "";
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";

    if (!ruleId || !severity) {
      console.error("Error: --rule and --severity are required.");
      process.exitCode = 1;
      return;
    }

    if (!VALID_SEVERITIES.includes(severity)) {
      console.error(`Error: Invalid severity. Use: ${VALID_SEVERITIES.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    // Replace existing or add
    const existing = store.overrides.findIndex((o) => o.ruleId === ruleId);
    const entry: SeverityOverride = {
      ruleId,
      originalSeverity: "",
      overrideSeverity: severity,
      reason,
      addedAt: new Date().toISOString(),
    };

    if (existing >= 0) {
      entry.originalSeverity = store.overrides[existing].originalSeverity;
      store.overrides[existing] = entry;
      console.log(`Updated severity override for "${ruleId}" to ${severity}.`);
    } else {
      store.overrides.push(entry);
      console.log(`Set severity override for "${ruleId}" to ${severity}.`);
    }
    saveStore(store);
    return;
  }

  if (subcommand === "remove") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule") || "";
    if (!ruleId) {
      console.error("Error: --rule is required.");
      process.exitCode = 1;
      return;
    }
    const before = store.overrides.length;
    store.overrides = store.overrides.filter((o) => o.ruleId !== ruleId);
    if (store.overrides.length === before) {
      console.error(`Error: No override found for "${ruleId}".`);
      process.exitCode = 1;
      return;
    }
    saveStore(store);
    console.log(`Removed severity override for "${ruleId}".`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", overrides: [] });
    console.log("Severity overrides cleared.");
    return;
  }

  // list
  if (store.overrides.length === 0) {
    console.log("No severity overrides. Use 'judges finding-severity-override set' to add one.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.overrides, null, 2));
    return;
  }

  console.log("\nSeverity Overrides:");
  console.log("─".repeat(70));
  for (const o of store.overrides) {
    console.log(`  ${o.ruleId.padEnd(30)} → ${o.overrideSeverity.padEnd(10)} ${o.addedAt.slice(0, 10)}`);
    if (o.reason) console.log(`    Reason: ${o.reason}`);
  }
  console.log("─".repeat(70));
  console.log(`  Total: ${store.overrides.length} override(s)`);
}
