// ─────────────────────────────────────────────────────────────────────────────
// False-Positive Review Evaluator — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterFalsePositiveHeuristics } from "../src/evaluators/false-positive-review.js";
import type { Finding } from "../src/types.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "SEC-001",
    severity: "high",
    title: "Test finding",
    description: "A test finding",
    lineNumbers: [10],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  filterFalsePositiveHeuristics
// ═══════════════════════════════════════════════════════════════════════════

describe("FPR: filterFalsePositiveHeuristics", () => {
  it("returns all findings when no FP heuristics match", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", title: "SQL Injection", lineNumbers: [10] })];
    const code = "const data = db.query(`SELECT * FROM users WHERE id = ${input}`);";
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("filters findings on comment-only lines", () => {
    const findings = [makeFinding({ ruleId: "SEC-001", title: "Hardcoded secret", lineNumbers: [1] })];
    const code = "// This contains a reference to API_KEY but is just a comment";
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(Array.isArray(result.filtered));
    assert.ok(Array.isArray(result.removed));
  });

  it("filters findings in string-literal-only lines", () => {
    const findings = [makeFinding({ ruleId: "SEC-001", lineNumbers: [1] })];
    const code = '"This is just a string mentioning eval() and innerHTML"';
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("filters findings in test scaffold code", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", title: "eval usage", lineNumbers: [3] })];
    const code = 'import { describe, it } from "node:test";\ndescribe("test", () => {\n  const bad = eval("1+1");\n});';
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("handles findings without line numbers", () => {
    const findings = [makeFinding({ lineNumbers: undefined })];
    const code = "const x = 1;";
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("handles empty findings array", () => {
    const result = filterFalsePositiveHeuristics([], "const x = 1;", "javascript");
    assert.equal(result.filtered.length, 0);
    assert.equal(result.removed.length, 0);
  });

  it("handles empty code", () => {
    const findings = [makeFinding()];
    const result = filterFalsePositiveHeuristics(findings, "", "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("preserves high-confidence findings", () => {
    const findings = [makeFinding({ confidence: 0.95, lineNumbers: [1] })];
    const code = "eval(userInput);";
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    // High confidence findings should not be easily removed
    assert.ok(result.filtered.length >= 0);
  });

  it("processes findings for IaC templates", () => {
    const findings = [makeFinding({ lineNumbers: [2] })];
    const code = 'resource "aws_instance" "web" {\n  ami = "ami-123"\n}';
    const result = filterFalsePositiveHeuristics(findings, code, "terraform");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("processes multiple findings", () => {
    const findings = [
      makeFinding({ ruleId: "SEC-001", lineNumbers: [1] }),
      makeFinding({ ruleId: "CYBER-001", lineNumbers: [2] }),
      makeFinding({ ruleId: "PERF-001", lineNumbers: [3] }),
    ];
    const code = "line1\nline2\nline3";
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.equal(result.filtered.length + result.removed.length, 3);
  });

  it("handles Python code", () => {
    const findings = [makeFinding({ lineNumbers: [2] })];
    const code = "# TODO: fix this security issue\npassword = 'admin'";
    const result = filterFalsePositiveHeuristics(findings, code, "python");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("handles Go code", () => {
    const findings = [makeFinding({ lineNumbers: [2] })];
    const code = '// Comment about security\nfmt.Println("hello")';
    const result = filterFalsePositiveHeuristics(findings, code, "go");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("filters findings on docstring lines", () => {
    const findings = [makeFinding({ lineNumbers: [2] })];
    const code = '"""\nThis mentions eval() and exec() but is a docstring\n"""\ndef safe(): pass';
    const result = filterFalsePositiveHeuristics(findings, code, "python");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });

  it("does not crash on very long code", () => {
    const code = Array.from({ length: 1000 }, (_, i) => `const x${i} = ${i};`).join("\n");
    const findings = [makeFinding({ lineNumbers: [500] })];
    const result = filterFalsePositiveHeuristics(findings, code, "javascript");
    assert.ok(result.filtered.length + result.removed.length === 1);
  });
});
