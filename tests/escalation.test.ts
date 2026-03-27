// ─────────────────────────────────────────────────────────────────────────────
// Escalation Module — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEscalations,
  resolveEscalation,
  computeEscalationSummary,
  shouldBlockOnEscalations,
  enhanceReviewWithEscalations,
  type EscalationStore,
  type EscalatedFinding,
} from "../src/escalation.js";
import type { Finding, TribunalVerdict, ReviewDecision } from "../src/types.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return { ruleId: "SEC-001", severity: "high", title: "Test", description: "desc", ...overrides };
}

function makeVerdict(
  findings: Finding[],
  evalVerdicts: Array<"pass" | "warning" | "fail"> = ["fail"],
): TribunalVerdict {
  return {
    overallVerdict: "fail",
    overallScore: 40,
    summary: "test",
    criticalCount: 0,
    highCount: findings.length,
    evaluations: evalVerdicts.map((v, i) => ({
      judgeId: `judge-${i}`,
      judgeName: `Judge ${i}`,
      verdict: v,
      score: v === "pass" ? 100 : 30,
      findings: [],
    })),
    findings,
  } as TribunalVerdict;
}

function makeStore(escalations: EscalatedFinding[] = []): EscalationStore {
  return { version: "1.0.0", escalations, lastUpdated: new Date().toISOString() };
}

function makeEscalation(overrides: Partial<EscalatedFinding> = {}): EscalatedFinding {
  return {
    escalationId: "ESC-test-0001",
    finding: makeFinding(),
    filePath: "src/app.ts",
    reasons: ["low-confidence"],
    routing: "security-team",
    explanation: "Test escalation",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  evaluateEscalations — classification & routing
// ═══════════════════════════════════════════════════════════════════════════

describe("Escalation: evaluateEscalations", () => {
  it("escalates findings below confidence threshold", () => {
    const f = makeFinding({ confidence: 0.3 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.length > 0);
    assert.ok(result[0].reasons.includes("low-confidence"));
    assert.ok(f.needsHumanReview);
  });

  it("does not escalate high-confidence findings", () => {
    const f = makeFinding({ confidence: 0.95 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.equal(result.length, 0);
  });

  it("detects conflicting judges", () => {
    const f = makeFinding({ confidence: 0.3 });
    const v = makeVerdict([f], ["pass", "fail"]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("conflicting-judges")));
  });

  it("detects AI-generated code via MFPR prefix", () => {
    const f = makeFinding({ ruleId: "MFPR-001", confidence: 0.3 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("ai-generated-code")));
  });

  it("detects compliance-sensitive findings", () => {
    const f = makeFinding({ ruleId: "COMP-001", confidence: 0.3 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("compliance-sensitive")));
  });

  it("detects DSOV compliance-sensitive findings", () => {
    const f = makeFinding({ ruleId: "DSOV-001", confidence: 0.3 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("compliance-sensitive")));
  });

  it("detects ETH compliance-sensitive findings", () => {
    const f = makeFinding({ ruleId: "ETH-001", confidence: 0.3 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("compliance-sensitive")));
  });

  it("detects cross-file uncertainty for absence-based findings", () => {
    const f = makeFinding({ confidence: 0.3, isAbsenceBased: true, provenance: "absence-of-pattern" });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("cross-file-uncertainty")));
  });

  it("detects security-critical-low-evidence", () => {
    const f = makeFinding({ severity: "critical", confidence: 0.4 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "src/app.ts");
    assert.ok(result.some((e) => e.reasons.includes("security-critical-low-evidence")));
  });

  // ── Routing ─────────────────────────────────────────────────────────────

  it("routes SEC findings to security-team", () => {
    const f = makeFinding({ ruleId: "SEC-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "security-team");
  });

  it("routes CYBER findings to security-team", () => {
    const f = makeFinding({ ruleId: "CYBER-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "security-team");
  });

  it("routes AUTH findings to security-team", () => {
    const f = makeFinding({ ruleId: "AUTH-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "security-team");
  });

  it("routes DATA findings to security-team", () => {
    const f = makeFinding({ ruleId: "DATA-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "security-team");
  });

  it("routes COMP findings to compliance-officer", () => {
    const f = makeFinding({ ruleId: "COMP-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "compliance-officer");
  });

  it("routes DSOV findings to compliance-officer", () => {
    const f = makeFinding({ ruleId: "DSOV-001", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "compliance-officer");
  });

  it("routes critical severity to senior-developer", () => {
    const f = makeFinding({ ruleId: "PERF-001", severity: "critical", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "senior-developer");
  });

  it("routes high severity to tech-lead", () => {
    const f = makeFinding({ ruleId: "PERF-001", severity: "high", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "tech-lead");
  });

  it("routes medium severity to any-human", () => {
    const f = makeFinding({ ruleId: "PERF-001", severity: "medium", confidence: 0.3 });
    const result = evaluateEscalations(makeVerdict([f]), "src/app.ts");
    assert.equal(result[0].routing, "any-human");
  });

  // ── Policy overrides ──────────────────────────────────────────────────

  it("respects custom confidence threshold", () => {
    const f = makeFinding({ confidence: 0.6 });
    const v = makeVerdict([f]);
    // Default threshold is 0.5, so 0.6 would not escalate
    assert.equal(evaluateEscalations(v, "f.ts").length, 0);
    // Custom threshold 0.7 triggers escalation
    assert.ok(evaluateEscalations(v, "f.ts", { confidenceThreshold: 0.7 }).length > 0);
  });

  it("always-escalate by severity", () => {
    const f = makeFinding({ severity: "critical", confidence: 0.95 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "f.ts", { alwaysEscalateSeverities: ["critical"] });
    assert.ok(result.length > 0);
  });

  it("always-escalate by rule prefix", () => {
    const f = makeFinding({ ruleId: "CUSTOM-001", confidence: 0.95 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "f.ts", { alwaysEscalatePrefixes: ["CUSTOM-"] });
    assert.ok(result.length > 0);
  });

  it("generates unique escalation IDs", () => {
    const findings = [makeFinding({ confidence: 0.3 }), makeFinding({ ruleId: "CYBER-001", confidence: 0.2 })];
    const v = makeVerdict(findings);
    const result = evaluateEscalations(v, "f.ts");
    assert.ok(result.length >= 2);
    assert.notEqual(result[0].escalationId, result[1].escalationId);
    assert.ok(result[0].escalationId.startsWith("ESC-"));
  });

  it("builds human-readable explanations", () => {
    const f = makeFinding({ confidence: 0.2 });
    const v = makeVerdict([f]);
    const result = evaluateEscalations(v, "f.ts");
    assert.ok(result[0].explanation.includes("SEC-001"));
    assert.ok(result[0].explanation.includes("below"));
  });

  it("returns empty for verdict with no findings", () => {
    const v = makeVerdict([]);
    assert.deepEqual(evaluateEscalations(v, "f.ts"), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  resolveEscalation
// ═══════════════════════════════════════════════════════════════════════════

describe("Escalation: resolveEscalation", () => {
  it("resolves a pending escalation", () => {
    const esc = makeEscalation();
    const store = makeStore([esc]);
    const ok = resolveEscalation(store, esc.escalationId, {
      status: "resolved",
      resolvedBy: "alice",
      notes: "checked manually",
    });
    assert.ok(ok);
    assert.equal(esc.status, "resolved");
    assert.equal(esc.resolvedBy, "alice");
    assert.ok(esc.resolvedAt);
  });

  it("dismisses a pending escalation", () => {
    const esc = makeEscalation();
    const store = makeStore([esc]);
    const ok = resolveEscalation(store, esc.escalationId, { status: "dismissed" });
    assert.ok(ok);
    assert.equal(esc.status, "dismissed");
  });

  it("returns false for unknown ID", () => {
    const store = makeStore([makeEscalation()]);
    assert.ok(!resolveEscalation(store, "NONEXISTENT", { status: "resolved" }));
  });

  it("returns false for already resolved escalation", () => {
    const esc = makeEscalation({ status: "resolved" });
    const store = makeStore([esc]);
    assert.ok(!resolveEscalation(store, esc.escalationId, { status: "dismissed" }));
  });

  it("returns false for already dismissed escalation", () => {
    const esc = makeEscalation({ status: "dismissed" });
    const store = makeStore([esc]);
    assert.ok(!resolveEscalation(store, esc.escalationId, { status: "resolved" }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  computeEscalationSummary
// ═══════════════════════════════════════════════════════════════════════════

describe("Escalation: computeEscalationSummary", () => {
  it("counts by status", () => {
    const store = makeStore([
      makeEscalation({ status: "pending" }),
      makeEscalation({ status: "pending", escalationId: "ESC-2" }),
      makeEscalation({ status: "resolved", escalationId: "ESC-3" }),
      makeEscalation({ status: "dismissed", escalationId: "ESC-4" }),
      makeEscalation({ status: "acknowledged", escalationId: "ESC-5" }),
    ]);
    const summary = computeEscalationSummary(store);
    assert.equal(summary.total, 5);
    assert.equal(summary.pending, 2);
    assert.equal(summary.resolved, 1);
    assert.equal(summary.dismissed, 1);
    assert.equal(summary.acknowledged, 1);
  });

  it("counts by routing", () => {
    const store = makeStore([
      makeEscalation({ routing: "security-team" }),
      makeEscalation({ routing: "security-team", escalationId: "ESC-2" }),
      makeEscalation({ routing: "compliance-officer", escalationId: "ESC-3" }),
    ]);
    const summary = computeEscalationSummary(store);
    assert.equal(summary.byRouting["security-team"], 2);
    assert.equal(summary.byRouting["compliance-officer"], 1);
  });

  it("counts by reason", () => {
    const store = makeStore([
      makeEscalation({ reasons: ["low-confidence", "conflicting-judges"] }),
      makeEscalation({ reasons: ["low-confidence"], escalationId: "ESC-2" }),
    ]);
    const summary = computeEscalationSummary(store);
    assert.equal(summary.byReason["low-confidence"], 2);
    assert.equal(summary.byReason["conflicting-judges"], 1);
  });

  it("calculates oldest pending age", () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
    const store = makeStore([makeEscalation({ createdAt: oldDate })]);
    const summary = computeEscalationSummary(store);
    assert.ok(summary.oldestPendingHours >= 47); // At least 47 hours
  });

  it("returns zeros for empty store", () => {
    const summary = computeEscalationSummary(makeStore());
    assert.equal(summary.total, 0);
    assert.equal(summary.pending, 0);
    assert.equal(summary.oldestPendingHours, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  shouldBlockOnEscalations
// ═══════════════════════════════════════════════════════════════════════════

describe("Escalation: shouldBlockOnEscalations", () => {
  it("does not block when no limit set", () => {
    const store = makeStore([makeEscalation(), makeEscalation({ escalationId: "ESC-2" })]);
    assert.ok(!shouldBlockOnEscalations(store));
  });

  it("does not block when maxPendingBeforeBlock is 0", () => {
    const store = makeStore([makeEscalation()]);
    assert.ok(!shouldBlockOnEscalations(store, { maxPendingBeforeBlock: 0 }));
  });

  it("blocks when pending count exceeds limit", () => {
    const store = makeStore([
      makeEscalation(),
      makeEscalation({ escalationId: "ESC-2" }),
      makeEscalation({ escalationId: "ESC-3" }),
    ]);
    assert.ok(shouldBlockOnEscalations(store, { maxPendingBeforeBlock: 2 }));
  });

  it("does not block when under limit", () => {
    const store = makeStore([makeEscalation()]);
    assert.ok(!shouldBlockOnEscalations(store, { maxPendingBeforeBlock: 5 }));
  });

  it("ignores resolved escalations", () => {
    const store = makeStore([
      makeEscalation({ status: "resolved" }),
      makeEscalation({ status: "dismissed", escalationId: "ESC-2" }),
    ]);
    assert.ok(!shouldBlockOnEscalations(store, { maxPendingBeforeBlock: 1 }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  enhanceReviewWithEscalations
// ═══════════════════════════════════════════════════════════════════════════

describe("Escalation: enhanceReviewWithEscalations", () => {
  const baseDecision: ReviewDecision = {
    action: "approve",
    summary: "Looks good",
    blockingIssues: [],
    suggestedActions: [],
  } as ReviewDecision;

  it("returns decision unchanged when no escalations", () => {
    const result = enhanceReviewWithEscalations(baseDecision, []);
    assert.equal(result.action, "approve");
  });

  it("upgrades approve to comment when pending escalations exist", () => {
    const escalations = [makeEscalation()];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.equal(result.action, "comment");
    assert.ok(result.summary.includes("Escalation Notice"));
  });

  it("upgrades to request-changes for compliance-sensitive escalations", () => {
    const escalations = [makeEscalation({ reasons: ["compliance-sensitive"] })];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.equal(result.action, "request-changes");
  });

  it("upgrades to request-changes for security-critical-low-evidence", () => {
    const escalations = [makeEscalation({ reasons: ["security-critical-low-evidence"] })];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.equal(result.action, "request-changes");
  });

  it("adds blocking issues from escalations", () => {
    const escalations = [makeEscalation()];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.ok(result.blockingIssues.some((b) => b.includes("ESCALATED")));
  });

  it("does not include resolved escalations in blocking issues", () => {
    const escalations = [makeEscalation({ status: "resolved" })];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.equal(result.action, "approve"); // No pending = no upgrade
  });

  it("includes routing info in summary", () => {
    const escalations = [makeEscalation({ routing: "security-team" })];
    const result = enhanceReviewWithEscalations(baseDecision, escalations);
    assert.ok(result.summary.includes("security-team"));
  });
});
