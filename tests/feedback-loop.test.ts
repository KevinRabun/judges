// ─────────────────────────────────────────────────────────────────────────────
// Feedback Loop — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatFeedbackLoopReport, type FeedbackLoopResult } from "../src/feedback-loop.js";

function makeResult(overrides: Partial<FeedbackLoopResult> = {}): FeedbackLoopResult {
  return {
    outcomesProcessed: 50,
    feedbackEntriesCreated: 10,
    adjustments: [],
    stats: {
      totalOutcomes: 50,
      accepted: 35,
      rejected: 10,
      reverted: 5,
      rulesWithPositiveSignal: 3,
      rulesWithNegativeSignal: 2,
      netCalibrationImpact: "positive",
    },
    calibrationProfile: {
      isActive: true,
      feedbackCount: 100,
      ruleAdjustments: {},
    } as FeedbackLoopResult["calibrationProfile"],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  formatFeedbackLoopReport
// ═══════════════════════════════════════════════════════════════════════════

describe("FeedbackLoop: formatFeedbackLoopReport", () => {
  it("generates a markdown report with stats", () => {
    const result = makeResult();
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("# Fix-Outcome Feedback Loop Report"));
    assert.ok(report.includes("50")); // outcomes
    assert.ok(report.includes("10")); // new entries
    assert.ok(report.includes("positive")); // net impact
    assert.ok(report.includes("35")); // accepted
    assert.ok(report.includes("5")); // reverted
  });

  it("includes adjustment table when adjustments exist", () => {
    const result = makeResult({
      adjustments: [
        {
          ruleId: "SEC-001",
          currentConfidence: 0.7,
          recommendedConfidence: 0.85,
          direction: "boost",
          reason: "90% acceptance",
          sampleCount: 10,
        },
        {
          ruleId: "CYBER-001",
          currentConfidence: 0.7,
          recommendedConfidence: 0.45,
          direction: "reduce",
          reason: "20% acceptance",
          sampleCount: 5,
        },
      ],
    });
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("Confidence Adjustments"));
    assert.ok(report.includes("SEC-001"));
    assert.ok(report.includes("boost"));
    assert.ok(report.includes("CYBER-001"));
    assert.ok(report.includes("reduce"));
  });

  it("omits adjustment section when no adjustments", () => {
    const result = makeResult({ adjustments: [] });
    const report = formatFeedbackLoopReport(result);
    assert.ok(!report.includes("Confidence Adjustments"));
  });

  it("includes calibration status when active", () => {
    const result = makeResult();
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("Calibration"));
    assert.ok(report.includes("active"));
  });

  it("handles zero outcomes", () => {
    const result = makeResult({
      outcomesProcessed: 0,
      feedbackEntriesCreated: 0,
      stats: {
        ...makeResult().stats,
        totalOutcomes: 0,
        accepted: 0,
        rejected: 0,
        reverted: 0,
        netCalibrationImpact: "neutral",
      },
    });
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("0"));
    assert.ok(report.includes("neutral"));
  });

  it("formats percentages in adjustment table", () => {
    const result = makeResult({
      adjustments: [
        {
          ruleId: "X-001",
          currentConfidence: 0.7,
          recommendedConfidence: 0.85,
          direction: "boost",
          reason: "High acceptance",
          sampleCount: 8,
        },
      ],
    });
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("70%") || report.includes("85%"));
  });

  it("includes negative impact result", () => {
    const result = makeResult({
      stats: {
        ...makeResult().stats,
        netCalibrationImpact: "negative",
        rulesWithPositiveSignal: 1,
        rulesWithNegativeSignal: 5,
      },
    });
    const report = formatFeedbackLoopReport(result);
    assert.ok(report.includes("negative"));
  });
});
