/**
 * Human Escalation Protocol
 *
 * Routes low-confidence findings to human reviewers instead of auto-actioning.
 * Provides a structured escalation workflow with reasons, routing suggestions,
 * and a persistent escalation queue.
 *
 * Data stored in .judges-escalations.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Finding, Severity, TribunalVerdict, ReviewDecision } from "./types.js";
import { getDataAdapter, type DataAdapter } from "./data-adapter.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EscalationReason =
  | "low-confidence"
  | "conflicting-judges"
  | "novel-pattern"
  | "cross-file-uncertainty"
  | "ai-generated-code"
  | "compliance-sensitive"
  | "security-critical-low-evidence";

export type EscalationStatus = "pending" | "acknowledged" | "resolved" | "dismissed";

export type EscalationRouting = "security-team" | "senior-developer" | "tech-lead" | "compliance-officer" | "any-human";

export interface EscalatedFinding {
  /** Unique escalation ID */
  escalationId: string;
  /** The finding that triggered escalation */
  finding: Finding;
  /** File where the finding was detected */
  filePath: string;
  /** Why this finding was escalated */
  reasons: EscalationReason[];
  /** Suggested routing — which team/role should review */
  routing: EscalationRouting;
  /** Human-readable explanation of why escalation is needed */
  explanation: string;
  /** Current status */
  status: EscalationStatus;
  /** When the escalation was created */
  createdAt: string;
  /** When the escalation was resolved/dismissed */
  resolvedAt?: string;
  /** Who resolved it */
  resolvedBy?: string;
  /** Resolution notes */
  resolutionNotes?: string;
}

export interface EscalationStore {
  version: string;
  escalations: EscalatedFinding[];
  lastUpdated: string;
}

export interface EscalationSummary {
  /** Total escalations in queue */
  total: number;
  /** Count by status */
  pending: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  /** Count by routing target */
  byRouting: Record<string, number>;
  /** Count by reason */
  byReason: Record<string, number>;
  /** Oldest pending escalation age in hours */
  oldestPendingHours: number;
}

export interface EscalationPolicy {
  /** Confidence threshold below which findings are escalated (default: from config) */
  confidenceThreshold?: number;
  /** Severity levels that always escalate when confidence is below threshold */
  alwaysEscalateSeverities?: Severity[];
  /** Rule prefixes that always escalate regardless of confidence */
  alwaysEscalatePrefixes?: string[];
  /** Maximum pending escalations before blocking (0 = no limit) */
  maxPendingBeforeBlock?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ESCALATION_FILE = ".judges-escalations.json";
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

/** Rule prefixes that route to security team */
const SECURITY_PREFIXES = new Set(["SEC-", "CYBER-", "AUTH-", "DATA-", "AICS-", "LOGPRIV-"]);

/** Rule prefixes that route to compliance officer */
const COMPLIANCE_PREFIXES = new Set(["COMP-", "DSOV-", "ETH-"]);

// ─── Escalation Store I/O ────────────────────────────────────────────────────

export function loadEscalationStore(dir: string = "."): EscalationStore {
  const filePath = resolve(dir, ESCALATION_FILE);
  if (!existsSync(filePath)) {
    return { version: "1.0.0", escalations: [], lastUpdated: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return { version: "1.0.0", escalations: [], lastUpdated: new Date().toISOString() };
  }
}

export function saveEscalationStore(store: EscalationStore, dir: string = "."): void {
  store.lastUpdated = new Date().toISOString();
  const filePath = resolve(dir, ESCALATION_FILE);
  writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

export async function loadEscalationsViaAdapter(projectDir: string, adapter?: DataAdapter): Promise<EscalationStore> {
  const da = adapter ?? getDataAdapter();
  return (
    (await da.loadJson<EscalationStore>("escalations", projectDir)) ?? {
      version: "1.0.0",
      escalations: [],
      lastUpdated: new Date().toISOString(),
    }
  );
}

export async function saveEscalationsViaAdapter(
  store: EscalationStore,
  projectDir: string,
  adapter?: DataAdapter,
): Promise<void> {
  const da = adapter ?? getDataAdapter();
  return da.saveJson("escalations", store, projectDir);
}

// ─── Escalation Logic ────────────────────────────────────────────────────────

/**
 * Determine why a finding should be escalated.
 */
function classifyEscalationReasons(finding: Finding, verdict?: TribunalVerdict): EscalationReason[] {
  const reasons: EscalationReason[] = [];
  const conf = finding.confidence ?? 0.5;

  if (conf < DEFAULT_CONFIDENCE_THRESHOLD) {
    reasons.push("low-confidence");
  }

  // Check for conflicting judge signals
  if (verdict) {
    const judgeVerdicts = verdict.evaluations.map((e) => e.verdict);
    const hasPass = judgeVerdicts.includes("pass");
    const hasFail = judgeVerdicts.includes("fail");
    if (hasPass && hasFail) {
      reasons.push("conflicting-judges");
    }
  }

  // AI-generated code detection
  if (finding.ruleId.startsWith("MFPR")) {
    reasons.push("ai-generated-code");
  }

  // Novel pattern — absence-based with no prior feedback data
  if (finding.isAbsenceBased && finding.provenance === "absence-of-pattern") {
    reasons.push("cross-file-uncertainty");
  }

  // Compliance-sensitive rules
  if (finding.ruleId.startsWith("COMP-") || finding.ruleId.startsWith("DSOV-") || finding.ruleId.startsWith("ETH-")) {
    reasons.push("compliance-sensitive");
  }

  // High-severity with low evidence
  if ((finding.severity === "critical" || finding.severity === "high") && conf < 0.7) {
    reasons.push("security-critical-low-evidence");
  }

  return reasons.length > 0 ? reasons : ["low-confidence"];
}

/**
 * Determine which team/role should review this escalation.
 */
function determineRouting(finding: Finding): EscalationRouting {
  const ruleId = finding.ruleId;

  for (const prefix of SECURITY_PREFIXES) {
    if (ruleId.startsWith(prefix)) return "security-team";
  }

  for (const prefix of COMPLIANCE_PREFIXES) {
    if (ruleId.startsWith(prefix)) return "compliance-officer";
  }

  if (finding.severity === "critical") return "senior-developer";
  if (finding.severity === "high") return "tech-lead";

  return "any-human";
}

/**
 * Generate a human-readable explanation for why this finding was escalated.
 */
function buildEscalationExplanation(finding: Finding, reasons: EscalationReason[]): string {
  const parts: string[] = [];

  if (reasons.includes("low-confidence")) {
    const conf = finding.confidence ?? 0;
    parts.push(`Confidence is ${Math.round(conf * 100)}%, below the escalation threshold`);
  }
  if (reasons.includes("conflicting-judges")) {
    parts.push("Judges disagree on the verdict for this file");
  }
  if (reasons.includes("ai-generated-code")) {
    parts.push("AI-generated code detected — requires human verification of correctness");
  }
  if (reasons.includes("cross-file-uncertainty")) {
    parts.push("Finding depends on cross-file context that could not be verified");
  }
  if (reasons.includes("compliance-sensitive")) {
    parts.push("Compliance-sensitive finding requires human sign-off");
  }
  if (reasons.includes("security-critical-low-evidence")) {
    parts.push(
      `High-severity security finding (${finding.severity}) with insufficient evidence — needs expert analysis`,
    );
  }
  if (reasons.includes("novel-pattern")) {
    parts.push("Pattern not seen before — no historical data to calibrate confidence");
  }

  return `[${finding.ruleId}] ${finding.title}: ${parts.join("; ")}.`;
}

let escalationCounter = 0;

/**
 * Generate a unique escalation ID.
 */
function generateEscalationId(): string {
  escalationCounter++;
  const ts = Date.now().toString(36);
  const seq = escalationCounter.toString(36).padStart(4, "0");
  return `ESC-${ts}-${seq}`;
}

/**
 * Evaluate which findings in a tribunal verdict need human escalation.
 * Mutates findings to set `needsHumanReview` and returns the escalation records.
 */
export function evaluateEscalations(
  verdict: TribunalVerdict,
  filePath: string,
  policy?: EscalationPolicy,
): EscalatedFinding[] {
  const threshold = policy?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const alwaysSeverities = new Set(policy?.alwaysEscalateSeverities ?? []);
  const alwaysPrefixes = policy?.alwaysEscalatePrefixes ?? [];
  const escalations: EscalatedFinding[] = [];
  const now = new Date().toISOString();

  for (const finding of verdict.findings) {
    const conf = finding.confidence ?? 0.5;
    let shouldEscalate = false;

    // Confidence below threshold
    if (conf < threshold) shouldEscalate = true;

    // Always-escalate severities
    if (alwaysSeverities.has(finding.severity)) shouldEscalate = true;

    // Always-escalate rule prefixes
    if (alwaysPrefixes.some((p) => finding.ruleId.startsWith(p))) shouldEscalate = true;

    if (shouldEscalate) {
      finding.needsHumanReview = true;
      const reasons = classifyEscalationReasons(finding, verdict);
      const routing = determineRouting(finding);
      const explanation = buildEscalationExplanation(finding, reasons);

      escalations.push({
        escalationId: generateEscalationId(),
        finding,
        filePath,
        reasons,
        routing,
        explanation,
        status: "pending",
        createdAt: now,
      });
    }
  }

  return escalations;
}

/**
 * Resolve an escalation — mark it as resolved or dismissed.
 */
export function resolveEscalation(
  store: EscalationStore,
  escalationId: string,
  resolution: { status: "resolved" | "dismissed"; resolvedBy?: string; notes?: string },
): boolean {
  const esc = store.escalations.find((e) => e.escalationId === escalationId);
  if (!esc || esc.status === "resolved" || esc.status === "dismissed") return false;

  esc.status = resolution.status;
  esc.resolvedAt = new Date().toISOString();
  esc.resolvedBy = resolution.resolvedBy;
  esc.resolutionNotes = resolution.notes;
  return true;
}

/**
 * Compute summary statistics for the escalation queue.
 */
export function computeEscalationSummary(store: EscalationStore): EscalationSummary {
  const byRouting: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  let pending = 0;
  let acknowledged = 0;
  let resolved = 0;
  let dismissed = 0;
  let oldestPendingMs = 0;
  const now = Date.now();

  for (const esc of store.escalations) {
    switch (esc.status) {
      case "pending":
        pending++;
        break;
      case "acknowledged":
        acknowledged++;
        break;
      case "resolved":
        resolved++;
        break;
      case "dismissed":
        dismissed++;
        break;
    }

    if (esc.status === "pending") {
      const age = now - new Date(esc.createdAt).getTime();
      if (age > oldestPendingMs) oldestPendingMs = age;
    }

    byRouting[esc.routing] = (byRouting[esc.routing] ?? 0) + 1;
    for (const reason of esc.reasons) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  return {
    total: store.escalations.length,
    pending,
    acknowledged,
    resolved,
    dismissed,
    byRouting,
    byReason,
    oldestPendingHours: Math.round((oldestPendingMs / (1000 * 60 * 60)) * 10) / 10,
  };
}

/**
 * Check whether the escalation queue should block a merge.
 * Blocks when pending escalations exceed the policy limit.
 */
export function shouldBlockOnEscalations(store: EscalationStore, policy?: EscalationPolicy): boolean {
  const maxPending = policy?.maxPendingBeforeBlock ?? 0;
  if (maxPending <= 0) return false;

  const pending = store.escalations.filter((e) => e.status === "pending").length;
  return pending >= maxPending;
}

/**
 * Enhance a ReviewDecision with escalation information.
 * When escalations exist, the review action may be upgraded to "request-changes"
 * to ensure a human signs off.
 */
export function enhanceReviewWithEscalations(
  decision: ReviewDecision,
  escalations: EscalatedFinding[],
): ReviewDecision {
  if (escalations.length === 0) return decision;

  const pendingCount = escalations.filter((e) => e.status === "pending").length;

  // If there are pending escalations, upgrade to at least "comment"
  let action = decision.action;
  if (pendingCount > 0 && action === "approve") {
    action = "comment";
  }

  // Critical escalations force request-changes
  const hasCriticalEscalation = escalations.some(
    (e) =>
      e.status === "pending" &&
      (e.reasons.includes("security-critical-low-evidence") || e.reasons.includes("compliance-sensitive")),
  );
  if (hasCriticalEscalation) {
    action = "request-changes";
  }

  const escalationSummary =
    `\n\n**Escalation Notice**: ${pendingCount} finding(s) flagged for human review. ` +
    `Routing: ${[...new Set(escalations.map((e) => e.routing))].join(", ")}.`;

  return {
    ...decision,
    action,
    summary: decision.summary + escalationSummary,
    blockingIssues: [
      ...decision.blockingIssues,
      ...escalations
        .filter((e) => e.status === "pending")
        .slice(0, 3)
        .map((e) => `[ESCALATED] ${e.explanation}`),
    ],
  };
}
