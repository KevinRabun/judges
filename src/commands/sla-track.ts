/**
 * SLA tracking — define response-time SLAs per severity and track
 * violation rates across runs.
 *
 * Data is stored locally in .judges-sla.json — no remote storage.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlaPolicy {
  severity: string;
  /** Max hours to first response/triage */
  responseHours: number;
  /** Max hours to remediation */
  resolutionHours: number;
}

export interface SlaEntry {
  findingId: string;
  ruleId: string;
  severity: string;
  title: string;
  firstSeenIso: string;
  triagedIso?: string;
  resolvedIso?: string;
  status: "open" | "triaged" | "resolved";
}

interface SlaDb {
  policies: SlaPolicy[];
  entries: SlaEntry[];
}

// ─── Default SLA Policies ───────────────────────────────────────────────────

const DEFAULT_POLICIES: SlaPolicy[] = [
  { severity: "critical", responseHours: 4, resolutionHours: 24 },
  { severity: "high", responseHours: 24, resolutionHours: 72 },
  { severity: "medium", responseHours: 72, resolutionHours: 168 },
  { severity: "low", responseHours: 168, resolutionHours: 720 },
  { severity: "info", responseHours: 720, resolutionHours: 2160 },
];

const SLA_FILE = ".judges-sla.json";

// ─── Core Functions ─────────────────────────────────────────────────────────

function loadDb(file: string): SlaDb {
  if (!existsSync(file)) return { policies: DEFAULT_POLICIES, entries: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(file: string, db: SlaDb): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function findingId(f: Finding): string {
  return `${f.ruleId}:${f.title}`;
}

export function trackFindings(findings: Finding[], dbPath = SLA_FILE): SlaDb {
  const db = loadDb(dbPath);
  const now = new Date().toISOString();
  const seen = new Set(db.entries.map((e) => e.findingId));

  for (const f of findings) {
    const id = findingId(f);
    if (!seen.has(id)) {
      db.entries.push({
        findingId: id,
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        firstSeenIso: now,
        status: "open",
      });
      seen.add(id);
    }
  }

  saveDb(dbPath, db);
  return db;
}

export function triageEntry(id: string, dbPath = SLA_FILE): void {
  const db = loadDb(dbPath);
  const entry = db.entries.find((e) => e.findingId === id);
  if (!entry) throw new Error(`Entry not found: ${id}`);
  entry.triagedIso = new Date().toISOString();
  entry.status = "triaged";
  saveDb(dbPath, db);
}

export function resolveEntry(id: string, dbPath = SLA_FILE): void {
  const db = loadDb(dbPath);
  const entry = db.entries.find((e) => e.findingId === id);
  if (!entry) throw new Error(`Entry not found: ${id}`);
  entry.resolvedIso = new Date().toISOString();
  entry.status = "resolved";
  saveDb(dbPath, db);
}

export interface SlaViolation {
  findingId: string;
  ruleId: string;
  severity: string;
  type: "response" | "resolution";
  elapsedHours: number;
  allowedHours: number;
}

export function checkViolations(dbPath = SLA_FILE): SlaViolation[] {
  const db = loadDb(dbPath);
  const now = Date.now();
  const violations: SlaViolation[] = [];

  for (const entry of db.entries) {
    const policy = db.policies.find((p) => p.severity === entry.severity);
    if (!policy) continue;

    const firstSeen = new Date(entry.firstSeenIso).getTime();
    const elapsedMs = now - firstSeen;
    const elapsedHours = Math.round((elapsedMs / 3_600_000) * 10) / 10;

    if (entry.status === "open" && elapsedHours > policy.responseHours) {
      violations.push({
        findingId: entry.findingId,
        ruleId: entry.ruleId,
        severity: entry.severity,
        type: "response",
        elapsedHours,
        allowedHours: policy.responseHours,
      });
    }

    if (entry.status !== "resolved" && elapsedHours > policy.resolutionHours) {
      violations.push({
        findingId: entry.findingId,
        ruleId: entry.ruleId,
        severity: entry.severity,
        type: "resolution",
        elapsedHours,
        allowedHours: policy.resolutionHours,
      });
    }
  }

  return violations;
}

export function getSlaStats(dbPath = SLA_FILE): {
  total: number;
  open: number;
  triaged: number;
  resolved: number;
  violations: number;
  bySeverity: Record<string, { total: number; open: number; violations: number }>;
  avgResponseHours: number;
  avgResolutionHours: number;
} {
  const db = loadDb(dbPath);
  const violations = checkViolations(dbPath);

  const stats = {
    total: db.entries.length,
    open: db.entries.filter((e) => e.status === "open").length,
    triaged: db.entries.filter((e) => e.status === "triaged").length,
    resolved: db.entries.filter((e) => e.status === "resolved").length,
    violations: violations.length,
    bySeverity: {} as Record<string, { total: number; open: number; violations: number }>,
    avgResponseHours: 0,
    avgResolutionHours: 0,
  };

  for (const entry of db.entries) {
    if (!stats.bySeverity[entry.severity]) {
      stats.bySeverity[entry.severity] = { total: 0, open: 0, violations: 0 };
    }
    stats.bySeverity[entry.severity].total++;
    if (entry.status === "open") stats.bySeverity[entry.severity].open++;
  }

  for (const v of violations) {
    if (stats.bySeverity[v.severity]) {
      stats.bySeverity[v.severity].violations++;
    }
  }

  const triaged = db.entries.filter((e) => e.triagedIso);
  if (triaged.length > 0) {
    const totalResponseMs = triaged.reduce((sum, e) => {
      return sum + (new Date(e.triagedIso!).getTime() - new Date(e.firstSeenIso).getTime());
    }, 0);
    stats.avgResponseHours = Math.round((totalResponseMs / triaged.length / 3_600_000) * 10) / 10;
  }

  const resolved = db.entries.filter((e) => e.resolvedIso);
  if (resolved.length > 0) {
    const totalResMs = resolved.reduce((sum, e) => {
      return sum + (new Date(e.resolvedIso!).getTime() - new Date(e.firstSeenIso).getTime());
    }, 0);
    stats.avgResolutionHours = Math.round((totalResMs / resolved.length / 3_600_000) * 10) / 10;
  }

  return stats;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runSlaTrack(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges sla-track — SLA tracking for security findings

Usage:
  judges sla-track --input results.json             Track findings from a results file
  judges sla-track --check                           Check for SLA violations
  judges sla-track --triage <finding-id>             Mark finding as triaged
  judges sla-track --resolve <finding-id>            Mark finding as resolved
  judges sla-track --stats                           Show SLA statistics
  judges sla-track --set-policy <severity> <resp-h> <res-h>

Options:
  --input <path>        Results JSON to track
  --check               Check for SLA violations
  --triage <id>         Mark a finding as triaged
  --resolve <id>        Resolve a finding
  --stats               Show statistics
  --set-policy          Set SLA for a severity level
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Track findings from input file
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (inputPath) {
    if (!existsSync(inputPath)) {
      console.error(`Error: file not found: ${inputPath}`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(inputPath, "utf-8"));
    const findings: Finding[] = data.evaluations
      ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
      : data.findings || data;

    const db = trackFindings(findings);
    if (format === "json") {
      console.log(JSON.stringify(db, null, 2));
    } else {
      console.log(`\n  Tracked ${findings.length} findings (${db.entries.length} total in DB)\n`);
    }
    return;
  }

  // Triage
  const triageTarget = argv.find((_a: string, i: number) => argv[i - 1] === "--triage");
  if (triageTarget) {
    triageEntry(triageTarget);
    console.log(`  Triaged: ${triageTarget}`);
    return;
  }

  // Resolve
  const resolveTarget = argv.find((_a: string, i: number) => argv[i - 1] === "--resolve");
  if (resolveTarget) {
    resolveEntry(resolveTarget);
    console.log(`  Resolved: ${resolveTarget}`);
    return;
  }

  // Set policy
  if (argv.includes("--set-policy")) {
    const idx = argv.indexOf("--set-policy");
    const severity = argv[idx + 1];
    const respH = parseFloat(argv[idx + 2]);
    const resH = parseFloat(argv[idx + 3]);
    if (!severity || isNaN(respH) || isNaN(resH)) {
      console.error("Error: --set-policy <severity> <response-hours> <resolution-hours>");
      process.exit(1);
    }
    const db = loadDb(SLA_FILE);
    const existing = db.policies.find((p) => p.severity === severity);
    if (existing) {
      existing.responseHours = respH;
      existing.resolutionHours = resH;
    } else {
      db.policies.push({ severity, responseHours: respH, resolutionHours: resH });
    }
    saveDb(SLA_FILE, db);
    console.log(`  SLA policy set: ${severity} → response ${respH}h, resolution ${resH}h`);
    return;
  }

  // Check violations
  if (argv.includes("--check")) {
    const violations = checkViolations();
    if (format === "json") {
      console.log(JSON.stringify(violations, null, 2));
    } else if (violations.length === 0) {
      console.log("\n  ✅ No SLA violations\n");
    } else {
      console.log(`\n  ⚠️  ${violations.length} SLA violation(s)\n`);
      for (const v of violations) {
        console.log(
          `    ${v.severity.padEnd(8)} ${v.type.padEnd(10)} ${v.ruleId} — ${v.elapsedHours}h / ${v.allowedHours}h allowed`,
        );
      }
      console.log("");
    }
    return;
  }

  // Stats (default if --stats or no other flag)
  const s = getSlaStats();
  if (format === "json") {
    console.log(JSON.stringify(s, null, 2));
  } else {
    console.log(`
  SLA Statistics
  ──────────────────
  Total tracked:       ${s.total}
  Open:                ${s.open}
  Triaged:             ${s.triaged}
  Resolved:            ${s.resolved}
  Violations:          ${s.violations}
  Avg response time:   ${s.avgResponseHours}h
  Avg resolution time: ${s.avgResolutionHours}h
`);
    for (const [sev, data] of Object.entries(s.bySeverity)) {
      console.log(`    ${sev.padEnd(10)} ${data.total} total, ${data.open} open, ${data.violations} violations`);
    }
    console.log("");
  }
}
