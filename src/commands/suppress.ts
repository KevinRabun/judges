/**
 * Batch false-positive suppression — suppress findings by glob, rule
 * prefix, severity, or pattern with a full audit trail.
 *
 * Suppressions stored locally in .judges-suppressions.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SuppressionRule {
  id: string;
  /** Glob pattern for file paths (e.g., **\/*.test.ts) */
  fileGlob?: string;
  /** Rule ID prefix to suppress (e.g., AUTH) */
  rulePrefix?: string;
  /** Exact rule IDs to suppress */
  ruleIds?: string[];
  /** Minimum severity to suppress (suppress this level and below) */
  maxSeverity?: string;
  /** Reason for suppression */
  reason: string;
  /** Who created this suppression */
  author: string;
  /** When this suppression was created */
  createdIso: string;
  /** Optional expiry date */
  expiresIso?: string;
  /** Whether this suppression is active */
  active: boolean;
}

interface SuppressionDb {
  version: number;
  rules: SuppressionRule[];
}

const SUPPRESSION_FILE = ".judges-suppressions.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = SUPPRESSION_FILE): SuppressionDb {
  if (!existsSync(file)) return { version: 1, rules: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: SuppressionDb, file = SUPPRESSION_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function generateId(): string {
  return `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function matchesGlob(filePath: string, glob: string): boolean {
  const regex = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLESTAR§/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(filePath);
}

export function addSuppression(opts: {
  fileGlob?: string;
  rulePrefix?: string;
  ruleIds?: string[];
  maxSeverity?: string;
  reason: string;
  author?: string;
  expiresIn?: number; // days
}): SuppressionRule {
  const db = loadDb();
  const rule: SuppressionRule = {
    id: generateId(),
    fileGlob: opts.fileGlob,
    rulePrefix: opts.rulePrefix,
    ruleIds: opts.ruleIds,
    maxSeverity: opts.maxSeverity,
    reason: opts.reason,
    author: opts.author || process.env.USER || process.env.USERNAME || "unknown",
    createdIso: new Date().toISOString(),
    active: true,
  };
  if (opts.expiresIn) {
    const exp = new Date();
    exp.setDate(exp.getDate() + opts.expiresIn);
    rule.expiresIso = exp.toISOString();
  }
  db.rules.push(rule);
  saveDb(db);
  return rule;
}

export function removeSuppression(id: string): boolean {
  const db = loadDb();
  const idx = db.rules.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  db.rules[idx].active = false;
  saveDb(db);
  return true;
}

export function isFindiingSuppressed(ruleId: string, severity: string, filePath?: string): boolean {
  const db = loadDb();
  const now = Date.now();
  const severityOrder = ["critical", "high", "medium", "low", "info"];

  for (const rule of db.rules) {
    if (!rule.active) continue;
    if (rule.expiresIso && new Date(rule.expiresIso).getTime() < now) continue;

    // Check file glob
    if (rule.fileGlob && filePath && !matchesGlob(filePath, rule.fileGlob)) continue;
    if (rule.fileGlob && !filePath) continue;

    // Check rule prefix
    if (rule.rulePrefix && !ruleId.startsWith(rule.rulePrefix)) continue;

    // Check exact rule IDs
    if (rule.ruleIds && rule.ruleIds.length > 0 && !rule.ruleIds.includes(ruleId)) continue;

    // Check severity
    if (rule.maxSeverity) {
      const maxIdx = severityOrder.indexOf(rule.maxSeverity);
      const sevIdx = severityOrder.indexOf(severity);
      if (maxIdx >= 0 && sevIdx >= 0 && sevIdx < maxIdx) continue;
    }

    // If no criteria were specified besides reason/author, it matches nothing
    if (!rule.fileGlob && !rule.rulePrefix && (!rule.ruleIds || rule.ruleIds.length === 0) && !rule.maxSeverity)
      continue;

    return true;
  }
  return false;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSuppress(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges suppress — Batch false-positive suppression with audit trail

Usage:
  judges suppress --glob "**/*.test.ts" --rule-prefix AUTH --reason "Test files"
  judges suppress --rule SEC-001,SEC-002 --reason "Not applicable to internal APIs"
  judges suppress --max-severity low --reason "Low severity not actionable"
  judges suppress --list                 Show all suppression rules
  judges suppress --remove <id>          Deactivate a suppression rule
  judges suppress --stats                Show suppression statistics

Options:
  --glob <pattern>       File glob pattern
  --rule-prefix <pfx>    Rule ID prefix (e.g., AUTH, SEC, PERF)
  --rule <ids>           Comma-separated rule IDs
  --max-severity <sev>   Suppress this severity and below
  --reason <text>        Reason for suppression (required for new rules)
  --author <name>        Who created this suppression
  --expires-in <days>    Auto-expire after N days
  --list                 List suppression rules
  --remove <id>          Deactivate a suppression rule
  --stats                Show suppression statistics
  --help, -h             Show this help
`);
    return;
  }

  if (argv.includes("--list")) {
    const db = loadDb();
    const active = db.rules.filter((r) => r.active);
    const inactive = db.rules.filter((r) => !r.active);
    console.log(`\n  Suppression Rules (${active.length} active, ${inactive.length} inactive)\n  ─────────────────`);
    for (const r of active) {
      const parts: string[] = [];
      if (r.fileGlob) parts.push(`glob: ${r.fileGlob}`);
      if (r.rulePrefix) parts.push(`prefix: ${r.rulePrefix}`);
      if (r.ruleIds?.length) parts.push(`rules: ${r.ruleIds.join(",")}`);
      if (r.maxSeverity) parts.push(`max-sev: ${r.maxSeverity}`);
      const exp = r.expiresIso ? ` (expires ${r.expiresIso.split("T")[0]})` : "";
      console.log(`    ${r.id}  ${parts.join(" | ")}${exp}`);
      console.log(`      Reason: ${r.reason} — by ${r.author} on ${r.createdIso.split("T")[0]}`);
    }
    console.log("");
    return;
  }

  const removeId = argv.find((_a: string, i: number) => argv[i - 1] === "--remove");
  if (removeId) {
    if (removeSuppression(removeId)) {
      console.log(`  Deactivated: ${removeId}`);
    } else {
      console.error(`  Error: not found: ${removeId}`);
    }
    return;
  }

  if (argv.includes("--stats")) {
    const db = loadDb();
    const active = db.rules.filter((r) => r.active);
    const byPrefix: Record<string, number> = {};
    for (const r of active) {
      const key = r.rulePrefix || r.ruleIds?.[0]?.split("-")[0] || "other";
      byPrefix[key] = (byPrefix[key] || 0) + 1;
    }
    console.log(`\n  Total rules: ${db.rules.length} (${active.length} active)`);
    for (const [k, v] of Object.entries(byPrefix)) {
      console.log(`    ${k.padEnd(12)} ${v}`);
    }
    console.log("");
    return;
  }

  // Add new suppression
  const glob = argv.find((_a: string, i: number) => argv[i - 1] === "--glob");
  const rulePrefix = argv.find((_a: string, i: number) => argv[i - 1] === "--rule-prefix");
  const ruleStr = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const maxSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--max-severity");
  const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason");
  const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
  const expiresStr = argv.find((_a: string, i: number) => argv[i - 1] === "--expires-in");

  if (!reason) {
    console.error("Error: --reason is required");
    process.exit(1);
  }

  if (!glob && !rulePrefix && !ruleStr && !maxSeverity) {
    console.error("Error: At least one of --glob, --rule-prefix, --rule, or --max-severity required");
    process.exit(1);
  }

  const rule = addSuppression({
    fileGlob: glob,
    rulePrefix,
    ruleIds: ruleStr ? ruleStr.split(",").map((s) => s.trim()) : undefined,
    maxSeverity,
    reason,
    author,
    expiresIn: expiresStr ? parseInt(expiresStr, 10) : undefined,
  });

  console.log(`  ✅ Suppression created: ${rule.id}`);
  const parts: string[] = [];
  if (rule.fileGlob) parts.push(`glob: ${rule.fileGlob}`);
  if (rule.rulePrefix) parts.push(`prefix: ${rule.rulePrefix}`);
  if (rule.ruleIds?.length) parts.push(`rules: ${rule.ruleIds.join(",")}`);
  if (rule.maxSeverity) parts.push(`max-sev: ${rule.maxSeverity}`);
  console.log(`     ${parts.join(" | ")}`);
  console.log(`     Reason: ${rule.reason}`);
}
