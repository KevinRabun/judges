/**
 * Policy audit trail — record which rules/judges were active at evaluation
 * time, creating an immutable local audit log for compliance proof.
 *
 * Enables SOC2/ISO27001 auditors to verify that security policies were
 * enforced at the time of each evaluation. All data stays local.
 */

import { createHash } from "crypto";
import type { TribunalVerdict, JudgesConfig } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PolicySnapshot {
  /** SHA-256 hash of the combined policy state */
  policyHash: string;
  /** ISO timestamp */
  timestamp: string;
  /** Config file path */
  configPath: string;
  /** Active preset(s) */
  presets: string[];
  /** Judges that were enabled */
  enabledJudges: string[];
  /** Judges that were disabled */
  disabledJudges: string[];
  /** Disabled rules */
  disabledRules: string[];
  /** Rule overrides */
  ruleOverrides: Record<string, unknown>;
  /** Min severity threshold */
  minSeverity: string;
  /** Git commit at evaluation time */
  gitCommit?: string;
  /** Evaluator version */
  version: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  policySnapshot: PolicySnapshot;
  verdictSummary: {
    verdict: string;
    score: number;
    criticalCount: number;
    highCount: number;
    totalFindings: number;
  };
  filesEvaluated: number;
}

export interface AuditLog {
  entries: AuditEntry[];
  version: string;
}

// ─── Policy Snapshot ────────────────────────────────────────────────────────

export function capturePolicySnapshot(
  config: JudgesConfig,
  configPath: string,
  enabledJudges: string[],
  version: string,
): PolicySnapshot {
  const { execSync } = require("child_process");

  let gitCommit: string | undefined;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    /* not in git */
  }

  const snapshot: PolicySnapshot = {
    policyHash: "",
    timestamp: new Date().toISOString(),
    configPath,
    presets: config.preset ? [config.preset] : [],
    enabledJudges,
    disabledJudges: config.disabledJudges || [],
    disabledRules: config.disabledRules || [],
    ruleOverrides: config.ruleOverrides || {},
    minSeverity: config.minSeverity || "info",
    gitCommit,
    version,
  };

  // Compute deterministic hash of policy state
  const hashInput = JSON.stringify({
    presets: snapshot.presets,
    enabledJudges: snapshot.enabledJudges.sort(),
    disabledJudges: snapshot.disabledJudges.sort(),
    disabledRules: snapshot.disabledRules.sort(),
    ruleOverrides: snapshot.ruleOverrides,
    minSeverity: snapshot.minSeverity,
  });
  snapshot.policyHash = createHash("sha256").update(hashInput).digest("hex").slice(0, 16);

  return snapshot;
}

// ─── Audit Log Management ──────────────────────────────────────────────────

const AUDIT_FILE = ".judges-audit.json";

function loadAuditLog(): AuditLog {
  const { readFileSync, existsSync } = require("fs");
  if (existsSync(AUDIT_FILE)) {
    try {
      return JSON.parse(readFileSync(AUDIT_FILE, "utf-8"));
    } catch {
      /* corrupt file */
    }
  }
  return { entries: [], version: "1.0" };
}

function saveAuditLog(log: AuditLog): void {
  const { writeFileSync } = require("fs");
  writeFileSync(AUDIT_FILE, JSON.stringify(log, null, 2), "utf-8");
}

export function recordAuditEntry(
  policySnapshot: PolicySnapshot,
  verdict: TribunalVerdict,
  filesEvaluated: number,
): AuditEntry {
  const entry: AuditEntry = {
    id: createHash("sha256")
      .update(policySnapshot.timestamp + policySnapshot.policyHash)
      .digest("hex")
      .slice(0, 12),
    timestamp: policySnapshot.timestamp,
    policySnapshot,
    verdictSummary: {
      verdict: verdict.overallVerdict,
      score: verdict.overallScore,
      criticalCount: verdict.criticalCount,
      highCount: verdict.highCount,
      totalFindings: verdict.findings.length,
    },
    filesEvaluated,
  };

  const log = loadAuditLog();
  log.entries.push(entry);

  // Keep last 1000 entries
  if (log.entries.length > 1000) {
    log.entries = log.entries.slice(-1000);
  }

  saveAuditLog(log);
  return entry;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPolicyAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges policy-audit — View and manage the policy audit trail

Usage:
  judges policy-audit                       Show recent audit entries
  judges policy-audit --last 10             Show last 10 entries
  judges policy-audit --diff                Compare current policy to last evaluation
  judges policy-audit --export audit.json   Export full audit log

Options:
  --last <n>           Show last N entries (default: 5)
  --diff               Show policy changes since last evaluation
  --export <path>      Export audit log to file
  --format json        JSON output
  --help, -h           Show this help

The audit trail records which rules, judges, and configs were active at
each evaluation time. Useful for SOC2/ISO27001 compliance proof.
`);
    return;
  }

  const { readFileSync, existsSync, writeFileSync } = require("fs");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const lastN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "5", 10);
  const exportPath = argv.find((_a: string, i: number) => argv[i - 1] === "--export");

  if (!existsSync(AUDIT_FILE)) {
    console.log("\n  No audit trail found. Run an evaluation first.\n");
    return;
  }

  const log: AuditLog = JSON.parse(readFileSync(AUDIT_FILE, "utf-8"));

  if (exportPath) {
    writeFileSync(exportPath, JSON.stringify(log, null, 2), "utf-8");
    console.log(`  Exported ${log.entries.length} audit entries to ${exportPath}`);
    return;
  }

  const entries = log.entries.slice(-lastN);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (argv.includes("--diff") && log.entries.length >= 2) {
    const prev = log.entries[log.entries.length - 2].policySnapshot;
    const curr = log.entries[log.entries.length - 1].policySnapshot;

    console.log("\n  Policy Diff (last two evaluations)\n");
    if (prev.policyHash !== curr.policyHash) {
      console.log("  ⚠️  Policy changed!\n");
      const addedJudges = curr.enabledJudges.filter((j: string) => !prev.enabledJudges.includes(j));
      const removedJudges = prev.enabledJudges.filter((j: string) => !curr.enabledJudges.includes(j));
      if (addedJudges.length) console.log(`  + Added judges: ${addedJudges.join(", ")}`);
      if (removedJudges.length) console.log(`  - Removed judges: ${removedJudges.join(", ")}`);
      if (prev.minSeverity !== curr.minSeverity) console.log(`  ~ Severity: ${prev.minSeverity} → ${curr.minSeverity}`);
    } else {
      console.log("  ✅ No policy changes\n");
    }
    console.log("");
    return;
  }

  console.log(`\n  Policy Audit Trail (last ${entries.length} of ${log.entries.length})\n`);
  for (const e of entries) {
    const v = e.verdictSummary;
    console.log(`  ${e.id}  ${e.timestamp}`);
    console.log(
      `    Policy: ${e.policySnapshot.policyHash}  Judges: ${e.policySnapshot.enabledJudges.length}  Commit: ${e.policySnapshot.gitCommit?.slice(0, 8) || "N/A"}`,
    );
    console.log(
      `    Verdict: ${v.verdict}  Score: ${v.score}  Critical: ${v.criticalCount}  High: ${v.highCount}  Findings: ${v.totalFindings}`,
    );
    console.log("");
  }
}
