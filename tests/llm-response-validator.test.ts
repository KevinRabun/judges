import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractValidatedLlmFindings, getValidRulePrefixes } from "../src/commands/llm-benchmark.js";
import { validateStructuredFindings } from "../src/probabilistic/llm-response-validator.js";

// Build a tiny prefix set for tests to avoid depending on the full registry
// Use getValidRulePrefixes() to ensure we stay in sync with registry while allowing tests
const prefixes = new Set(getValidRulePrefixes());

const sampleStructured = [
  { ruleId: "CYBER-001", severity: "critical", title: "Test", description: "d", recommendation: "r" },
  { rule_id: "DATA-002", severity: "medium" },
];

describe("LLM response validator", () => {
  it("validates structured findings with proper ruleId and severity", () => {
    const result = validateStructuredFindings(sampleStructured, prefixes);
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.ruleIds, ["CYBER-001", "DATA-002"]);
    assert.equal(result.findings[0].severity, "critical");
  });

  it("rejects invalid ruleIds and severities", () => {
    const badStructured = [{ ruleId: "BAD-9999", severity: "urgent" }];
    const result = validateStructuredFindings(badStructured, prefixes);
    assert.ok(
      result.errors.some((e) => e.includes("invalid ruleId")) ||
        result.errors.some((e) => e.includes("invalid severity")),
    );
    assert.equal(result.ruleIds.length, 0);
  });

  it("extracts from fenced JSON block", () => {
    const response = `
\`\`\`
[
  {"ruleId": "CYBER-003", "severity": "high"},
  {"rule_id": "DATA-004", "severity": "info"}
]
\`\`\``;
    const result = extractValidatedLlmFindings(response);
    assert.deepEqual(result.ruleIds, ["CYBER-003", "DATA-004"]);
    assert.equal(result.errors.length, 0);
  });

  it("falls back to regex extraction when no JSON present", () => {
    const response = "Found issues: CYBER-001, DATA-002";
    const result = extractValidatedLlmFindings(response);
    assert.deepEqual(result.ruleIds.sort(), ["CYBER-001", "DATA-002"].sort());
  });

  it("ignores invalid prefixes in fallback", () => {
    const response = "Found issues: BAD-001, CYBER-002";
    const result = extractValidatedLlmFindings(response);
    assert.deepEqual(result.ruleIds, ["CYBER-002"]);
  });
});
