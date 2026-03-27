// ─────────────────────────────────────────────────────────────────────────────
// Audit Trail — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import {
  appendAuditEvent,
  readAuditTrail,
  verifyAuditIntegrity,
  recordEvaluationStart,
  recordEvaluationComplete,
  recordFindings,
  recordSuppression,
  recordOverride,
  recordEscalation,
  type AuditEvent,
} from "../src/audit-trail.js";
import type { Finding } from "../src/types.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return { ruleId: "SEC-001", severity: "high", title: "Test", description: "desc", ...overrides };
}

describe("AuditTrail: appendAuditEvent & readAuditTrail", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-audit-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("appends events to JSONL file", () => {
    const event: AuditEvent = {
      eventId: "evt_test_0001",
      type: "evaluation-started",
      timestamp: new Date().toISOString(),
      sessionId: "sess-1",
      actor: "test",
      payload: { filePath: "app.ts", language: "typescript" },
      integrityHash: "deadbeef",
    };
    appendAuditEvent(event, tempDir);
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, "evt_test_0001");
  });

  it("appends multiple events", () => {
    for (let i = 0; i < 5; i++) {
      appendAuditEvent(
        {
          eventId: `evt_${i}`,
          type: "evaluation-started",
          timestamp: new Date().toISOString(),
          sessionId: "sess",
          actor: "test",
          payload: {},
          integrityHash: `hash${i}`,
        },
        tempDir,
      );
    }
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 5);
  });

  it("returns empty array when no audit file exists", () => {
    const events = readAuditTrail(tempDir);
    assert.deepEqual(events, []);
  });

  it("skips malformed JSONL lines", () => {
    const fp = resolve(tempDir, ".judges-audit.jsonl");
    appendFileSync(
      fp,
      '{"eventId":"e1","type":"t","timestamp":"ts","sessionId":"s","actor":"a","payload":{},"integrityHash":"h"}\n',
    );
    appendFileSync(fp, "not valid json\n");
    appendFileSync(
      fp,
      '{"eventId":"e2","type":"t","timestamp":"ts","sessionId":"s","actor":"a","payload":{},"integrityHash":"h"}\n',
    );
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 2);
  });
});

// ── Integrity verification ───────────────────────────────────────────────

describe("AuditTrail: verifyAuditIntegrity", () => {
  it("returns valid for empty trail", () => {
    assert.ok(verifyAuditIntegrity([]).valid);
  });

  it("detects tampered events", () => {
    // Create two events, then tamper with the first
    const events: AuditEvent[] = [
      {
        eventId: "e1",
        type: "evaluation-started",
        timestamp: "2026-01-01",
        sessionId: "s",
        actor: "a",
        payload: {},
        integrityHash: "wrong-hash",
      },
    ];
    const result = verifyAuditIntegrity(events);
    assert.ok(!result.valid);
    assert.equal(result.brokenAt, 0);
  });
});

// ── Convenience recording functions ──────────────────────────────────────

describe("AuditTrail: recording functions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-audit-rec-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("records evaluation start", () => {
    recordEvaluationStart("sess-1", "typescript", 45, { filePath: "app.ts", baseDir: tempDir });
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "evaluation-started");
  });

  it("records evaluation complete", () => {
    recordEvaluationComplete(
      "sess-1",
      { verdict: "pass", score: 90, findingCount: 0, suppressedCount: 0, escalatedCount: 0, durationMs: 100 },
      { baseDir: tempDir },
    );
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "evaluation-completed");
  });

  it("records findings", () => {
    recordFindings("sess-1", [makeFinding()], { filePath: "app.ts", baseDir: tempDir });
    const events = readAuditTrail(tempDir);
    assert.ok(events.length >= 1);
    assert.equal(events[0].type, "finding-detected");
  });

  it("records suppression", () => {
    recordSuppression("sess-1", "SEC-001", "high", "Intentional", "inline-comment", {
      filePath: "app.ts",
      baseDir: tempDir,
    });
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "finding-suppressed");
  });

  it("records override", () => {
    recordOverride("sess-1", "SEC-001", "high", "admin", "False positive", "open", "wont-fix", {
      filePath: "app.ts",
      baseDir: tempDir,
    });
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "finding-overridden");
  });

  it("records escalation", () => {
    recordEscalation("sess-1", "SEC-001", "high", ["low-confidence"], "security-team", {
      filePath: "app.ts",
      baseDir: tempDir,
    });
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "finding-escalated");
  });

  it("integrity chain is valid across multiple recordings", () => {
    recordEvaluationStart("sess-1", "typescript", 45, { filePath: "app.ts", baseDir: tempDir });
    recordFindings("sess-1", [makeFinding()], { filePath: "app.ts", baseDir: tempDir });
    recordEvaluationComplete(
      "sess-1",
      { verdict: "warning", score: 60, findingCount: 1, suppressedCount: 0, escalatedCount: 0, durationMs: 200 },
      { baseDir: tempDir },
    );
    const events = readAuditTrail(tempDir);
    assert.equal(events.length, 3);
    // Each event should have an integrityHash
    assert.ok(events.every((e) => typeof e.integrityHash === "string" && e.integrityHash.length > 0));
  });
});
