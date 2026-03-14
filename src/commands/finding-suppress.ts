/**
 * Finding-suppress — Suppress specific findings with inline or config suppression.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionEntry {
  ruleId: string;
  reason: string;
  author: string;
  timestamp: string;
  expiresAt?: string;
  scope: string;
}

interface SuppressionConfig {
  version: string;
  suppressions: SuppressionEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const SUPPRESS_FILE = join(".judges", "suppressions.json");

function loadSuppressions(): SuppressionConfig {
  if (!existsSync(SUPPRESS_FILE)) return { version: "1.0.0", suppressions: [] };
  try {
    return JSON.parse(readFileSync(SUPPRESS_FILE, "utf-8")) as SuppressionConfig;
  } catch {
    return { version: "1.0.0", suppressions: [] };
  }
}

function saveSuppressions(config: SuppressionConfig): void {
  mkdirSync(dirname(SUPPRESS_FILE), { recursive: true });
  writeFileSync(SUPPRESS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── Active check ───────────────────────────────────────────────────────────

function isActive(entry: SuppressionEntry): boolean {
  if (!entry.expiresAt) return true;
  return new Date(entry.expiresAt) > new Date();
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSuppress(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-suppress — Suppress specific findings

Usage:
  judges finding-suppress list                    List suppressions
  judges finding-suppress add --rule sql-injection --reason "False positive in test"
  judges finding-suppress remove --rule sql-injection
  judges finding-suppress check --rule sql-injection
  judges finding-suppress --format json

Subcommands:
  list                 List all active suppressions
  add                  Add a suppression
  remove               Remove a suppression
  check                Check if a rule is suppressed

Options:
  --rule <id>          Rule ID to suppress
  --reason <text>      Reason for suppression (required for add)
  --author <name>      Who suppressed (default: "unknown")
  --expires <date>     Expiration date (ISO 8601, optional)
  --scope <scope>      Scope: global, file, line (default: global)
  --format json        JSON output
  --help, -h           Show this help

Suppressions are stored in .judges/suppressions.json. Expired
suppressions are automatically ignored. Use inline comments
(// judges-suppress: <rule-id>) for line-level suppression.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["list", "add", "remove", "check"].includes(a)) || "list";
  const config = loadSuppressions();

  if (subcommand === "add") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason");
    const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author") || "unknown";
    const expires = argv.find((_a: string, i: number) => argv[i - 1] === "--expires");
    const scope = argv.find((_a: string, i: number) => argv[i - 1] === "--scope") || "global";

    if (!ruleId) {
      console.error("Error: --rule is required.");
      process.exitCode = 1;
      return;
    }
    if (!reason) {
      console.error("Error: --reason is required. Explain why the finding is suppressed.");
      process.exitCode = 1;
      return;
    }

    const existing = config.suppressions.find((s) => s.ruleId === ruleId);
    if (existing) {
      console.error(`Error: Rule '${ruleId}' is already suppressed.`);
      process.exitCode = 1;
      return;
    }

    const entry: SuppressionEntry = {
      ruleId,
      reason,
      author,
      timestamp: new Date().toISOString(),
      scope,
    };
    if (expires) entry.expiresAt = expires;

    config.suppressions.push(entry);
    saveSuppressions(config);
    console.log(`Suppressed '${ruleId}' — reason: ${reason}${expires ? ` (expires: ${expires})` : ""}`);
    return;
  }

  if (subcommand === "remove") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
    if (!ruleId) {
      console.error("Error: --rule is required.");
      process.exitCode = 1;
      return;
    }

    const idx = config.suppressions.findIndex((s) => s.ruleId === ruleId);
    if (idx < 0) {
      console.error(`Error: No suppression found for '${ruleId}'.`);
      process.exitCode = 1;
      return;
    }

    config.suppressions.splice(idx, 1);
    saveSuppressions(config);
    console.log(`Removed suppression for '${ruleId}'.`);
    return;
  }

  if (subcommand === "check") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
    if (!ruleId) {
      console.error("Error: --rule is required.");
      process.exitCode = 1;
      return;
    }

    const entry = config.suppressions.find((s) => s.ruleId === ruleId);
    if (!entry) {
      console.log(`Rule '${ruleId}' is NOT suppressed.`);
      return;
    }

    const active = isActive(entry);
    if (format === "json") {
      console.log(JSON.stringify({ ruleId, suppressed: active, entry }, null, 2));
      return;
    }

    console.log(`Rule '${ruleId}' is ${active ? "SUPPRESSED" : "EXPIRED"}`);
    console.log(`  Reason: ${entry.reason}`);
    console.log(`  Author: ${entry.author}`);
    console.log(`  Since: ${entry.timestamp}`);
    if (entry.expiresAt) console.log(`  Expires: ${entry.expiresAt}`);
    return;
  }

  // List
  const active = config.suppressions.filter(isActive);
  const expired = config.suppressions.filter((s) => !isActive(s));

  if (format === "json") {
    console.log(
      JSON.stringify({ active: active.length, expired: expired.length, suppressions: config.suppressions }, null, 2),
    );
    return;
  }

  console.log(`\n  Finding Suppressions\n  ─────────────────────────────`);
  console.log(`    Active: ${active.length} | Expired: ${expired.length}\n`);

  if (active.length === 0 && expired.length === 0) {
    console.log("    No suppressions configured.");
  }

  for (const s of active) {
    console.log(`    🔇 ${s.ruleId} — ${s.reason}`);
    console.log(`       Author: ${s.author} | Scope: ${s.scope}${s.expiresAt ? ` | Expires: ${s.expiresAt}` : ""}`);
  }

  for (const s of expired) {
    console.log(`    ⏰ ${s.ruleId} (expired) — ${s.reason}`);
  }

  console.log();
}
