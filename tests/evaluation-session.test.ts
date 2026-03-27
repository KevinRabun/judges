// ─────────────────────────────────────────────────────────────────────────────
// EvaluationSession — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EvaluationSession, getGlobalSession, resetGlobalSession } from "../src/evaluation-session.js";
import type { TribunalVerdict } from "../src/types.js";

function makeVerdict(overrides: Partial<TribunalVerdict> = {}): TribunalVerdict {
  return {
    overallVerdict: "pass",
    overallScore: 85,
    summary: "test",
    criticalCount: 0,
    highCount: 0,
    evaluations: [],
    findings: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  } as TribunalVerdict;
}

describe("EvaluationSession", () => {
  let session: EvaluationSession;

  beforeEach(() => {
    session = new EvaluationSession();
  });

  // ── Constructor & getContext ───────────────────────────────────────────

  it("initializes with empty context", () => {
    const ctx = session.getContext();
    assert.deepEqual(ctx.frameworks, []);
    assert.equal(ctx.capabilities.size, 0);
    assert.equal(ctx.evaluationCount, 0);
  });

  it("evaluationCount starts at 0", () => {
    assert.equal(session.evaluationCount, 0);
  });

  // ── addFrameworks ─────────────────────────────────────────────────────

  it("adds frameworks", () => {
    session.addFrameworks(["express", "react"]);
    assert.deepEqual(session.getContext().frameworks, ["express", "react"]);
  });

  it("deduplicates frameworks", () => {
    session.addFrameworks(["express", "react"]);
    session.addFrameworks(["express", "next"]);
    assert.deepEqual(session.getContext().frameworks, ["express", "react", "next"]);
  });

  // ── addCapabilities / getCapabilities ─────────────────────────────────

  it("adds and retrieves capabilities", () => {
    session.addCapabilities(["rate-limiting", "auth"]);
    const caps = session.getCapabilities();
    assert.ok(caps.has("rate-limiting"));
    assert.ok(caps.has("auth"));
  });

  it("deduplicates capabilities", () => {
    session.addCapabilities(["auth"]);
    session.addCapabilities(["auth", "cors"]);
    assert.equal(session.getCapabilities().size, 2);
  });

  // ── recordEvaluation ──────────────────────────────────────────────────

  it("increments evaluation count", () => {
    session.recordEvaluation("file.ts", "const x = 1;", makeVerdict());
    assert.equal(session.evaluationCount, 1);
    session.recordEvaluation("file2.ts", "const y = 2;", makeVerdict());
    assert.equal(session.evaluationCount, 2);
  });

  it("tracks verdict history per file", () => {
    session.recordEvaluation("file.ts", "code", makeVerdict({ overallScore: 80 }));
    session.recordEvaluation("file.ts", "code2", makeVerdict({ overallScore: 90 }));
    const history = session.getVerdictHistory("file.ts");
    assert.equal(history.length, 2);
    assert.equal(history[0].score, 90); // most recent first
    assert.equal(history[1].score, 80);
  });

  it("caps verdict history at 10 entries", () => {
    for (let i = 0; i < 15; i++) {
      session.recordEvaluation("file.ts", `code${i}`, makeVerdict({ overallScore: i }));
    }
    const history = session.getVerdictHistory("file.ts");
    assert.equal(history.length, 10);
  });

  // ── isVerdictStable ───────────────────────────────────────────────────

  it("returns false with insufficient history", () => {
    session.recordEvaluation("file.ts", "code", makeVerdict({ overallScore: 80 }));
    assert.ok(!session.isVerdictStable("file.ts"));
  });

  it("returns true when verdict is stable", () => {
    const v = makeVerdict({ overallScore: 85 });
    for (let i = 0; i < 3; i++) {
      session.recordEvaluation("file.ts", `code${i}`, v);
    }
    assert.ok(session.isVerdictStable("file.ts"));
  });

  it("returns false when verdict is unstable", () => {
    session.recordEvaluation("file.ts", "c1", makeVerdict({ overallScore: 80 }));
    session.recordEvaluation("file.ts", "c2", makeVerdict({ overallScore: 85 }));
    session.recordEvaluation("file.ts", "c3", makeVerdict({ overallScore: 90 }));
    assert.ok(!session.isVerdictStable("file.ts"));
  });

  it("returns false for unknown file", () => {
    assert.ok(!session.isVerdictStable("unknown.ts"));
  });

  it("respects custom minRuns", () => {
    const v = makeVerdict({ overallScore: 85 });
    session.recordEvaluation("f.ts", "c1", v);
    session.recordEvaluation("f.ts", "c2", v);
    assert.ok(!session.isVerdictStable("f.ts", 3)); // need 3, have 2
    assert.ok(session.isVerdictStable("f.ts", 2)); // need 2, have 2
  });

  // ── hasEvaluated ──────────────────────────────────────────────────────

  it("detects previously evaluated content", () => {
    session.recordEvaluation("file.ts", "const x = 1;", makeVerdict());
    assert.ok(session.hasEvaluated("file.ts", "const x = 1;"));
  });

  it("returns false for new content", () => {
    session.recordEvaluation("file.ts", "const x = 1;", makeVerdict());
    assert.ok(!session.hasEvaluated("file.ts", "const x = 2;"));
  });

  // ── getVerdictHistory ─────────────────────────────────────────────────

  it("returns empty for unknown file", () => {
    assert.deepEqual(session.getVerdictHistory("nope.ts"), []);
  });

  it("returns history in reverse chronological order", () => {
    session.recordEvaluation(
      "f.ts",
      "c1",
      makeVerdict({ overallScore: 60, timestamp: "2026-01-01" } as Partial<TribunalVerdict>),
    );
    session.recordEvaluation(
      "f.ts",
      "c2",
      makeVerdict({ overallScore: 70, timestamp: "2026-01-02" } as Partial<TribunalVerdict>),
    );
    const h = session.getVerdictHistory("f.ts");
    assert.equal(h[0].score, 70);
    assert.equal(h[1].score, 60);
  });

  // ── reset ─────────────────────────────────────────────────────────────

  it("clears all state on reset", () => {
    session.addFrameworks(["express"]);
    session.addCapabilities(["auth"]);
    session.recordEvaluation("f.ts", "code", makeVerdict());
    session.recordFeedback("SEC-001", "fp");

    session.reset();

    assert.equal(session.evaluationCount, 0);
    assert.deepEqual(session.getContext().frameworks, []);
    assert.equal(session.getCapabilities().size, 0);
    assert.deepEqual(session.getVerdictHistory("f.ts"), []);
    assert.equal(session.getFeedbackTally().size, 0);
  });

  // ── recordFeedback / getConfidencePenalty / getFeedbackTally ──────────

  it("records feedback and tracks tallies", () => {
    session.recordFeedback("SEC-001", "tp");
    session.recordFeedback("SEC-001", "fp");
    session.recordFeedback("SEC-001", "fp");
    session.recordFeedback("SEC-001", "wontfix");

    const tally = session.getFeedbackTally().get("SEC-001");
    assert.ok(tally);
    assert.equal(tally.tp, 1);
    assert.equal(tally.fp, 2);
    assert.equal(tally.wontfix, 1);
  });

  it("returns penalty of 1.0 for no FP feedback", () => {
    assert.equal(session.getConfidencePenalty("UNKNOWN-001"), 1.0);
  });

  it("returns penalty of 1.0 when only TP feedback", () => {
    session.recordFeedback("SEC-001", "tp");
    assert.equal(session.getConfidencePenalty("SEC-001"), 1.0);
  });

  it("returns 0.5 penalty for 1 FP", () => {
    session.recordFeedback("SEC-001", "fp");
    assert.equal(session.getConfidencePenalty("SEC-001"), 0.5);
  });

  it("returns 1/3 penalty for 2 FPs", () => {
    session.recordFeedback("SEC-001", "fp");
    session.recordFeedback("SEC-001", "fp");
    assert.ok(Math.abs(session.getConfidencePenalty("SEC-001") - 1 / 3) < 0.001);
  });
});

// ── Global session singleton ────────────────────────────────────────────

describe("Global EvaluationSession", () => {
  beforeEach(() => {
    resetGlobalSession();
  });

  it("returns same instance on repeated calls", () => {
    const s1 = getGlobalSession();
    const s2 = getGlobalSession();
    assert.equal(s1, s2);
  });

  it("creates new instance after reset", () => {
    const s1 = getGlobalSession();
    s1.addFrameworks(["express"]);
    resetGlobalSession();
    const s2 = getGlobalSession();
    assert.notEqual(s1, s2);
    assert.deepEqual(s2.getContext().frameworks, []);
  });
});
