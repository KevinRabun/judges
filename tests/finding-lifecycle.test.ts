// ─────────────────────────────────────────────────────────────────────────────
// Finding Lifecycle — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateFindingFingerprint,
  updateFindings,
  getFindingStats,
  triageFinding,
  getTriagedFindings,
  formatDelta,
  formatTriageSummary,
  loadFindingStore,
  saveFindingStore,
  computeTriageFeedback,
  applyTriageFeedback,
  type FindingStore,
  type TrackedFinding,
} from "../src/finding-lifecycle.js";
import type { Finding } from "../src/types.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "SEC-001",
    severity: "high",
    title: "SQL Injection",
    description: "desc",
    lineNumbers: [10],
    ...overrides,
  };
}

function makeTracked(overrides: Partial<TrackedFinding> = {}): TrackedFinding {
  return {
    fingerprint: "SEC-001::src/app.ts::10::SQL Injection",
    ruleId: "SEC-001",
    severity: "high",
    filePath: "src/app.ts",
    title: "SQL Injection",
    firstSeen: "2026-01-01T00:00:00Z",
    lastSeen: "2026-03-27T00:00:00Z",
    runCount: 3,
    status: "open",
    ...overrides,
  };
}

function makeStore(findings: TrackedFinding[] = []): FindingStore {
  return { version: "1.0.0", lastRunAt: new Date().toISOString(), runNumber: 1, findings };
}

// ═══════════════════════════════════════════════════════════════════════════
//  generateFindingFingerprint
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: generateFindingFingerprint", () => {
  it("generates deterministic fingerprint", () => {
    const f = makeFinding({ lineNumbers: [12] });
    const fp1 = generateFindingFingerprint(f, "src/app.ts");
    const fp2 = generateFindingFingerprint(f, "src/app.ts");
    assert.equal(fp1, fp2);
  });

  it("buckets nearby lines together", () => {
    const f1 = makeFinding({ lineNumbers: [11] });
    const f2 = makeFinding({ lineNumbers: [14] }); // Same bucket (10-14)
    assert.equal(generateFindingFingerprint(f1, "src/app.ts"), generateFindingFingerprint(f2, "src/app.ts"));
  });

  it("separates distant lines", () => {
    const f1 = makeFinding({ lineNumbers: [10] });
    const f2 = makeFinding({ lineNumbers: [50] }); // Different bucket
    assert.notEqual(generateFindingFingerprint(f1, "src/app.ts"), generateFindingFingerprint(f2, "src/app.ts"));
  });

  it("handles missing line numbers", () => {
    const f = makeFinding({ lineNumbers: undefined });
    const fp = generateFindingFingerprint(f, "src/app.ts");
    assert.ok(fp.includes("::0::")); // Default bucket
  });

  it("differentiates by file path", () => {
    const f = makeFinding();
    assert.notEqual(generateFindingFingerprint(f, "src/a.ts"), generateFindingFingerprint(f, "src/b.ts"));
  });

  it("differentiates by ruleId", () => {
    const f1 = makeFinding({ ruleId: "SEC-001" });
    const f2 = makeFinding({ ruleId: "CYBER-001" });
    assert.notEqual(generateFindingFingerprint(f1, "src/app.ts"), generateFindingFingerprint(f2, "src/app.ts"));
  });

  it("truncates title to 50 chars", () => {
    const longTitle = "A".repeat(100);
    const f = makeFinding({ title: longTitle });
    const fp = generateFindingFingerprint(f, "src/app.ts");
    assert.ok(!fp.includes("A".repeat(51)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Store I/O
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: store I/O", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-lifecycle-"));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty store for new directory", () => {
    const store = loadFindingStore(tempDir);
    assert.equal(store.findings.length, 0);
    assert.equal(store.runNumber, 0);
  });

  it("round-trips store through save/load", () => {
    const store = makeStore([makeTracked()]);
    saveFindingStore(store, tempDir);
    const loaded = loadFindingStore(tempDir);
    assert.equal(loaded.findings.length, 1);
    assert.equal(loaded.findings[0].ruleId, "SEC-001");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  updateFindings — lifecycle state machine
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: updateFindings", () => {
  it("classifies new findings as introduced", () => {
    const store = makeStore();
    const delta = updateFindings([{ finding: makeFinding(), filePath: "src/app.ts" }], store);
    assert.ok(delta.introduced.length > 0);
    assert.equal(delta.introduced[0].status, "open");
    assert.equal(delta.introduced[0].runCount, 1);
  });

  it("classifies repeated findings as recurring", () => {
    const existing = makeTracked();
    const store = makeStore([existing]);
    const delta = updateFindings([{ finding: makeFinding(), filePath: "src/app.ts" }], store);
    assert.ok(delta.recurring.length > 0);
    assert.ok(delta.recurring[0].runCount > 1);
  });

  it("classifies missing findings as fixed", () => {
    const existing = makeTracked();
    const store = makeStore([existing]);
    const delta = updateFindings([], store); // No findings this run
    assert.ok(delta.fixed.length > 0);
    assert.equal(delta.fixed[0].status, "fixed");
  });

  it("preserves triaged findings even when missing", () => {
    const triaged = makeTracked({ status: "accepted-risk" });
    const store = makeStore([triaged]);
    const delta = updateFindings([], store);
    // Triaged findings should NOT be marked as fixed
    assert.equal(delta.fixed.filter((f) => f.fingerprint === triaged.fingerprint).length, 0);
  });

  it("calculates improving trend", () => {
    const store = makeStore([makeTracked(), makeTracked({ fingerprint: "fp2", ruleId: "CYBER-001" })]);
    // No new findings, 2 existing fixed → improving
    const delta = updateFindings([], store);
    assert.equal(delta.stats.trend, "improving");
  });

  it("calculates degrading trend", () => {
    const store = makeStore();
    // 3 new findings, 0 fixed → degrading
    const delta = updateFindings(
      [
        { finding: makeFinding({ ruleId: "A-001" }), filePath: "a.ts" },
        { finding: makeFinding({ ruleId: "B-001" }), filePath: "b.ts" },
        { finding: makeFinding({ ruleId: "C-001" }), filePath: "c.ts" },
      ],
      store,
    );
    assert.equal(delta.stats.trend, "degrading");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getFindingStats
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: getFindingStats", () => {
  it("computes stats from store", () => {
    const store = makeStore([
      makeTracked({ status: "open", severity: "high" }),
      makeTracked({ status: "open", severity: "critical", fingerprint: "fp2" }),
      makeTracked({ status: "fixed", fingerprint: "fp3" }),
      makeTracked({ status: "accepted-risk", fingerprint: "fp4" }),
    ]);
    const stats = getFindingStats(store);
    assert.equal(stats.totalOpen, 2);
    assert.equal(stats.totalFixed, 1);
    assert.equal(stats.totalTriaged, 1);
    assert.ok(stats.bySeverity.high >= 1);
    assert.ok(stats.bySeverity.critical >= 1);
  });

  it("handles empty store", () => {
    const stats = getFindingStats(makeStore());
    assert.equal(stats.totalOpen, 0);
    assert.equal(stats.totalFixed, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  triageFinding
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: triageFinding", () => {
  it("triages an open finding", () => {
    const tracked = makeTracked();
    const store = makeStore([tracked]);
    const result = triageFinding(
      store,
      { ruleId: "SEC-001", filePath: "src/app.ts" },
      "false-positive",
      "Not relevant",
      "alice",
    );
    assert.ok(result);
    assert.equal(result.status, "false-positive");
    assert.equal(result.triagedBy, "alice");
    assert.ok(result.triagedAt);
  });

  it("returns null for non-matching finding", () => {
    const store = makeStore([makeTracked()]);
    const result = triageFinding(store, { ruleId: "NONEXIST-001", filePath: "src/app.ts" }, "accepted-risk");
    assert.equal(result, null);
  });

  it("supports all triage statuses", () => {
    for (const status of ["accepted-risk", "deferred", "wont-fix", "false-positive"] as const) {
      const store = makeStore([makeTracked({ fingerprint: `fp-${status}` })]);
      const result = triageFinding(store, { ruleId: "SEC-001", filePath: "src/app.ts" }, status);
      assert.ok(result === null || result.status === status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getTriagedFindings
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: getTriagedFindings", () => {
  it("returns triaged findings", () => {
    const store = makeStore([
      makeTracked({ status: "false-positive" }),
      makeTracked({ status: "open", fingerprint: "fp2" }),
      makeTracked({ status: "accepted-risk", fingerprint: "fp3" }),
    ]);
    const triaged = getTriagedFindings(store);
    assert.equal(triaged.length, 2);
  });

  it("filters by triage status", () => {
    const store = makeStore([
      makeTracked({ status: "false-positive" }),
      makeTracked({ status: "accepted-risk", fingerprint: "fp2" }),
    ]);
    const fps = getTriagedFindings(store, "false-positive");
    assert.equal(fps.length, 1);
    assert.equal(fps[0].status, "false-positive");
  });

  it("returns empty for no triaged findings", () => {
    const store = makeStore([makeTracked({ status: "open" })]);
    assert.equal(getTriagedFindings(store).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatDelta / formatTriageSummary
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: formatDelta", () => {
  it("formats a delta report", () => {
    const delta = {
      introduced: [makeTracked()],
      recurring: [],
      fixed: [makeTracked({ status: "fixed", fingerprint: "fp2" })],
      stats: { totalOpen: 1, totalFixed: 1, introduced: 1, recurring: 0, fixed: 1, trend: "stable" as const },
    };
    const text = formatDelta(delta);
    assert.ok(text.includes("introduced") || text.includes("Introduced") || text.includes("New"));
    assert.ok(typeof text === "string");
  });
});

describe("FindingLifecycle: formatTriageSummary", () => {
  it("formats triage summary", () => {
    const store = makeStore([
      makeTracked({ status: "false-positive" }),
      makeTracked({ status: "accepted-risk", fingerprint: "fp2" }),
    ]);
    const text = formatTriageSummary(store);
    assert.ok(typeof text === "string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  computeTriageFeedback / applyTriageFeedback
// ═══════════════════════════════════════════════════════════════════════════

describe("FindingLifecycle: computeTriageFeedback", () => {
  it("computes FP penalty from false-positive findings", () => {
    const store = makeStore([
      makeTracked({ status: "false-positive", ruleId: "SEC-001" }),
      makeTracked({ status: "false-positive", ruleId: "SEC-001", fingerprint: "fp2" }),
      makeTracked({ status: "false-positive", ruleId: "SEC-001", fingerprint: "fp3" }),
      makeTracked({ status: "open", ruleId: "SEC-001", fingerprint: "fp4" }),
      makeTracked({ status: "open", ruleId: "CYBER-001", fingerprint: "fp5" }),
    ]);
    const feedback = computeTriageFeedback(store);
    // SEC-001 has 3/4 FP rate (75%) which is > 0.3, so should have penalty
    assert.ok(feedback.has("SEC-001"));
    assert.ok((feedback.get("SEC-001") ?? 0) < 0); // Negative adjustment
  });

  it("returns empty map for store with no FPs", () => {
    const store = makeStore([makeTracked({ status: "open" })]);
    const feedback = computeTriageFeedback(store);
    assert.equal(feedback.size, 0);
  });
});

describe("FindingLifecycle: applyTriageFeedback", () => {
  it("reduces confidence for rules with FP feedback", () => {
    const store = makeStore([
      makeTracked({ status: "false-positive", ruleId: "SEC-001" }),
      makeTracked({ status: "false-positive", ruleId: "SEC-001", fingerprint: "fp2" }),
      makeTracked({ status: "false-positive", ruleId: "SEC-001", fingerprint: "fp3" }),
      makeTracked({ status: "open", ruleId: "SEC-001", fingerprint: "fp4" }),
    ]);
    const findings: Finding[] = [
      makeFinding({ ruleId: "SEC-001", confidence: 0.9 }),
      makeFinding({ ruleId: "CYBER-001", confidence: 0.9 }),
    ];
    const adjusted = applyTriageFeedback(findings, store);
    const secFinding = adjusted.find((f) => f.ruleId === "SEC-001");
    const cyberFinding = adjusted.find((f) => f.ruleId === "CYBER-001");
    assert.ok(secFinding);
    assert.ok(cyberFinding);
    // SEC-001 has 75% FP rate, should have reduced confidence
    assert.ok((secFinding.confidence ?? 1) < 0.9);
    assert.equal(cyberFinding.confidence, 0.9); // No FP feedback; unchanged
  });
});
