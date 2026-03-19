/**
 * Immutable Audit Trail
 *
 * Records every code review action as an append-only event log for
 * compliance-sensitive environments (SOX, HIPAA, PCI DSS, SOC 2).
 *
 * Each event captures:
 * - What was reviewed (file, commit, PR)
 * - What was found (findings and their severities)
 * - What was suppressed and why
 * - What was escalated to humans
 * - Who overrode findings and the justification
 * - Review decisions and confidence scores
 *
 * The log is append-only — events are never modified or deleted.
 * File: .judges-audit.jsonl (JSON Lines format for efficient append)
 */

import { appendFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Finding, Severity, ReviewDecision } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditEventType =
  | "evaluation-started"
  | "evaluation-completed"
  | "finding-detected"
  | "finding-suppressed"
  | "finding-overridden"
  | "finding-escalated"
  | "escalation-resolved"
  | "review-decision"
  | "triage-action"
  | "config-change"
  | "calibration-applied";

export interface AuditEvent {
  /** Monotonically increasing event ID */
  eventId: string;
  /** Event type */
  type: AuditEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Session identifier for grouping related events */
  sessionId: string;
  /** File being reviewed (if applicable) */
  filePath?: string;
  /** Git commit SHA (if available) */
  commitSha?: string;
  /** PR number (if available) */
  prNumber?: number;
  /** Actor (user, system, or judge ID) */
  actor: string;
  /** Event payload (varies by type) */
  payload: AuditPayload;
  /** Integrity hash of this event + previous event hash (chain) */
  integrityHash: string;
}

export type AuditPayload =
  | EvaluationStartedPayload
  | EvaluationCompletedPayload
  | FindingDetectedPayload
  | FindingSuppressedPayload
  | FindingOverriddenPayload
  | FindingEscalatedPayload
  | EscalationResolvedPayload
  | ReviewDecisionPayload
  | TriageActionPayload
  | ConfigChangePayload
  | CalibrationAppliedPayload;

export interface EvaluationStartedPayload {
  kind: "evaluation-started";
  language: string;
  judgeCount: number;
  preset?: string;
  configHash?: string;
}

export interface EvaluationCompletedPayload {
  kind: "evaluation-completed";
  findingCount: number;
  suppressedCount: number;
  escalatedCount: number;
  verdict: string;
  score: number;
  durationMs: number;
}

export interface FindingDetectedPayload {
  kind: "finding-detected";
  ruleId: string;
  severity: Severity;
  title: string;
  confidence: number;
  lineNumbers?: number[];
  provenance?: string;
}

export interface FindingSuppressedPayload {
  kind: "finding-suppressed";
  ruleId: string;
  severity: Severity;
  reason: string;
  suppressionType: "inline-comment" | "config-rule" | "false-positive-filter" | "calibration" | "confidence-threshold";
}

export interface FindingOverriddenPayload {
  kind: "finding-overridden";
  ruleId: string;
  severity: Severity;
  overriddenBy: string;
  justification: string;
  previousStatus: string;
  newStatus: string;
}

export interface FindingEscalatedPayload {
  kind: "finding-escalated";
  ruleId: string;
  severity: Severity;
  escalationReasons: string[];
  routingTarget: string;
}

export interface EscalationResolvedPayload {
  kind: "escalation-resolved";
  escalationId: string;
  resolvedBy: string;
  resolution: "confirmed" | "dismissed" | "modified";
  notes?: string;
}

export interface ReviewDecisionPayload {
  kind: "review-decision";
  action: string;
  criticalCount: number;
  highCount: number;
  totalFindings: number;
  mustFixTriggered: boolean;
  escalationsPending: number;
}

export interface TriageActionPayload {
  kind: "triage-action";
  findingFingerprint: string;
  ruleId: string;
  action: string;
  reason?: string;
  triagedBy: string;
}

export interface ConfigChangePayload {
  kind: "config-change";
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
}

export interface CalibrationAppliedPayload {
  kind: "calibration-applied";
  findingsAdjusted: number;
  avgConfidenceShift: number;
  modelId?: string;
}

// ─── Audit Trail I/O ─────────────────────────────────────────────────────────

const AUDIT_FILE = ".judges-audit.jsonl";
let lastHash = "";
let eventCounter = 0;

/**
 * Simple hash for integrity chaining. Uses FNV-1a for speed.
 * This is for tamper detection, not cryptographic security.
 */
function fnv1aHash(data: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function generateEventId(): string {
  eventCounter++;
  const ts = Date.now().toString(36);
  const seq = eventCounter.toString(36).padStart(4, "0");
  return `evt_${ts}_${seq}`;
}

function buildEvent(
  type: AuditEventType,
  sessionId: string,
  actor: string,
  payload: AuditPayload,
  context?: { filePath?: string; commitSha?: string; prNumber?: number },
): AuditEvent {
  const event: Omit<AuditEvent, "integrityHash"> = {
    eventId: generateEventId(),
    type,
    timestamp: new Date().toISOString(),
    sessionId,
    actor,
    payload,
    ...context,
  };

  // Chain hash: hash of (previous hash + this event's content)
  const content = JSON.stringify(event);
  const integrityHash = fnv1aHash(lastHash + content);
  lastHash = integrityHash;

  return { ...event, integrityHash };
}

/**
 * Append a single audit event to the log file.
 * Uses JSONL (one JSON object per line) for efficient append.
 */
export function appendAuditEvent(event: AuditEvent, baseDir?: string): void {
  const dir = baseDir || process.cwd();
  const filePath = resolve(dir, AUDIT_FILE);
  const line = JSON.stringify(event) + "\n";
  appendFileSync(filePath, line, "utf-8");
}

/**
 * Read all audit events from the log file.
 * Returns events in chronological order.
 */
export function readAuditTrail(baseDir?: string): AuditEvent[] {
  const dir = baseDir || process.cwd();
  const filePath = resolve(dir, AUDIT_FILE);

  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const events: AuditEvent[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as AuditEvent);
    } catch {
      // Skip malformed lines — don't crash on corrupted entries
    }
  }

  return events;
}

/**
 * Verify the integrity chain of the audit trail.
 * Returns true if no tampering detected, false if chain is broken.
 */
export function verifyAuditIntegrity(events: AuditEvent[]): {
  valid: boolean;
  brokenAt?: number;
  details?: string;
} {
  let prevHash = "";

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { integrityHash, ...rest } = event;
    const content = JSON.stringify(rest);
    const expectedHash = fnv1aHash(prevHash + content);

    if (expectedHash !== integrityHash) {
      return {
        valid: false,
        brokenAt: i,
        details: `Event ${event.eventId} at index ${i}: expected hash ${expectedHash}, got ${integrityHash}`,
      };
    }

    prevHash = integrityHash;
  }

  return { valid: true };
}

// ─── Convenience Recording Functions ─────────────────────────────────────────

/**
 * Record the start of an evaluation session.
 */
export function recordEvaluationStart(
  sessionId: string,
  language: string,
  judgeCount: number,
  options?: { preset?: string; filePath?: string; commitSha?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "evaluation-started",
    sessionId,
    "system",
    {
      kind: "evaluation-started",
      language,
      judgeCount,
      preset: options?.preset,
    },
    { filePath: options?.filePath, commitSha: options?.commitSha },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record the completion of an evaluation.
 */
export function recordEvaluationComplete(
  sessionId: string,
  stats: {
    findingCount: number;
    suppressedCount: number;
    escalatedCount: number;
    verdict: string;
    score: number;
    durationMs: number;
  },
  options?: { filePath?: string; commitSha?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "evaluation-completed",
    sessionId,
    "system",
    { kind: "evaluation-completed", ...stats },
    { filePath: options?.filePath, commitSha: options?.commitSha },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record individual findings detected during evaluation.
 */
export function recordFindings(
  sessionId: string,
  findings: Finding[],
  options?: { filePath?: string; baseDir?: string },
): void {
  for (const f of findings) {
    const event = buildEvent(
      "finding-detected",
      sessionId,
      f.ruleId.split("-")[0] || "evaluator",
      {
        kind: "finding-detected",
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        confidence: f.confidence ?? 0.5,
        lineNumbers: f.lineNumbers,
        provenance: f.provenance,
      },
      { filePath: options?.filePath },
    );
    appendAuditEvent(event, options?.baseDir);
  }
}

/**
 * Record a finding suppression (inline comment, config, FP filter, etc.).
 */
export function recordSuppression(
  sessionId: string,
  ruleId: string,
  severity: Severity,
  reason: string,
  suppressionType: FindingSuppressedPayload["suppressionType"],
  options?: { filePath?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "finding-suppressed",
    sessionId,
    "system",
    { kind: "finding-suppressed", ruleId, severity, reason, suppressionType },
    { filePath: options?.filePath },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record a human override of a finding.
 */
export function recordOverride(
  sessionId: string,
  ruleId: string,
  severity: Severity,
  overriddenBy: string,
  justification: string,
  previousStatus: string,
  newStatus: string,
  options?: { filePath?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "finding-overridden",
    sessionId,
    overriddenBy,
    { kind: "finding-overridden", ruleId, severity, overriddenBy, justification, previousStatus, newStatus },
    { filePath: options?.filePath },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record a finding escalation to human review.
 */
export function recordEscalation(
  sessionId: string,
  ruleId: string,
  severity: Severity,
  escalationReasons: string[],
  routingTarget: string,
  options?: { filePath?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "finding-escalated",
    sessionId,
    "escalation-engine",
    { kind: "finding-escalated", ruleId, severity, escalationReasons, routingTarget },
    { filePath: options?.filePath },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record the review decision for a file/PR.
 */
export function recordReviewDecision(
  sessionId: string,
  decision: ReviewDecision,
  options?: { filePath?: string; commitSha?: string; prNumber?: number; baseDir?: string },
): void {
  const event = buildEvent(
    "review-decision",
    sessionId,
    "tribunal",
    {
      kind: "review-decision",
      action: decision.action,
      criticalCount: decision.severityCounts.critical,
      highCount: decision.severityCounts.high,
      totalFindings: decision.totalFindings,
      mustFixTriggered: decision.blockingIssues.length > 0,
      escalationsPending: 0,
    },
    { filePath: options?.filePath, commitSha: options?.commitSha, prNumber: options?.prNumber },
  );
  appendAuditEvent(event, options?.baseDir);
}

/**
 * Record a triage action on a tracked finding.
 */
export function recordTriageAction(
  sessionId: string,
  findingFingerprint: string,
  ruleId: string,
  action: string,
  triagedBy: string,
  options?: { reason?: string; filePath?: string; baseDir?: string },
): void {
  const event = buildEvent(
    "triage-action",
    sessionId,
    triagedBy,
    { kind: "triage-action", findingFingerprint, ruleId, action, triagedBy, reason: options?.reason },
    { filePath: options?.filePath },
  );
  appendAuditEvent(event, options?.baseDir);
}

// ─── Query & Reporting ───────────────────────────────────────────────────────

export interface AuditSummary {
  totalEvents: number;
  evaluations: number;
  findingsDetected: number;
  findingsSuppressed: number;
  findingsEscalated: number;
  findingsOverridden: number;
  reviewDecisions: number;
  triageActions: number;
  integrityValid: boolean;
  timeRange: { from: string; to: string } | null;
}

/**
 * Compute a summary of the audit trail for compliance reporting.
 */
export function computeAuditSummary(events: AuditEvent[]): AuditSummary {
  const integrity = verifyAuditIntegrity(events);

  const summary: AuditSummary = {
    totalEvents: events.length,
    evaluations: 0,
    findingsDetected: 0,
    findingsSuppressed: 0,
    findingsEscalated: 0,
    findingsOverridden: 0,
    reviewDecisions: 0,
    triageActions: 0,
    integrityValid: integrity.valid,
    timeRange: events.length > 0 ? { from: events[0].timestamp, to: events[events.length - 1].timestamp } : null,
  };

  for (const event of events) {
    switch (event.type) {
      case "evaluation-completed":
        summary.evaluations++;
        break;
      case "finding-detected":
        summary.findingsDetected++;
        break;
      case "finding-suppressed":
        summary.findingsSuppressed++;
        break;
      case "finding-escalated":
        summary.findingsEscalated++;
        break;
      case "finding-overridden":
        summary.findingsOverridden++;
        break;
      case "review-decision":
        summary.reviewDecisions++;
        break;
      case "triage-action":
        summary.triageActions++;
        break;
    }
  }

  return summary;
}

/**
 * Filter audit events by session, time range, type, or file.
 */
export function queryAuditTrail(
  events: AuditEvent[],
  filters: {
    sessionId?: string;
    types?: AuditEventType[];
    filePath?: string;
    from?: string;
    to?: string;
    actor?: string;
  },
): AuditEvent[] {
  return events.filter((e) => {
    if (filters.sessionId && e.sessionId !== filters.sessionId) return false;
    if (filters.types && !filters.types.includes(e.type)) return false;
    if (filters.filePath && e.filePath !== filters.filePath) return false;
    if (filters.from && e.timestamp < filters.from) return false;
    if (filters.to && e.timestamp > filters.to) return false;
    if (filters.actor && e.actor !== filters.actor) return false;
    return true;
  });
}
