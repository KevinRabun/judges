// Diff + V2 Evaluation Tests
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateDiff } from "../src/evaluators/index.js";
import { evaluateCodeV2, getSupportedPolicyProfiles } from "../src/evaluators/v2.js";

describe("Diff evaluation", () => {
  it("evaluates changed lines", () => {
    const result = evaluateDiff("const safe = 1;\nconst x = eval(input);\nconst y = 2;", "javascript", [2]);
    assert.ok(typeof result.score === "number");
    assert.ok(typeof result.verdict === "string");
  });

  it("handles empty changed lines", () => {
    const result = evaluateDiff("eval(x);", "javascript", []);
    assert.ok(typeof result.score === "number");
  });

  it("works with Python", () => {
    const result = evaluateDiff("import os\nos.system('ls ' + x)", "python", [2]);
    assert.ok(typeof result.score === "number");
  });
});

describe("V2 evaluation", () => {
  it("evaluates with default policy", () => {
    const r = evaluateCodeV2({ code: "eval(x);", language: "javascript" });
    assert.ok(typeof r.calibratedScore === "number");
    assert.ok(typeof r.calibratedVerdict === "string");
    assert.ok(typeof r.confidence === "number");
  });

  it("evaluates with each policy profile", () => {
    for (const profile of ["startup", "regulated", "healthcare", "fintech", "public-sector"] as const) {
      const r = evaluateCodeV2({ code: "eval(x);", language: "javascript", policyProfile: profile });
      assert.ok(typeof r.calibratedScore === "number", `${profile} should return score`);
      assert.equal(r.policyProfile, profile);
    }
  });

  it("evaluates clean code", () => {
    const r = evaluateCodeV2({ code: "const x = 1;", language: "typescript" });
    assert.ok(r.calibratedScore >= 0);
  });

  it("handles empty code", () => {
    const r = evaluateCodeV2({ code: "", language: "javascript" });
    assert.ok(typeof r.calibratedScore === "number");
  });

  it("includes uncertainty report", () => {
    const r = evaluateCodeV2({ code: "eval(x);", language: "javascript" });
    assert.ok(r.uncertainty);
  });

  it("includes specialty feedback", () => {
    const r = evaluateCodeV2({ code: "eval(x);", language: "javascript" });
    assert.ok(Array.isArray(r.specialtyFeedback));
  });
});

describe("V2: getSupportedPolicyProfiles", () => {
  it("returns profiles", () => {
    const p = getSupportedPolicyProfiles();
    assert.ok(Array.isArray(p));
    assert.ok(p.includes("default"));
  });
});
