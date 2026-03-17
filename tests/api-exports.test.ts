import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractValidatedLlmFindings } from "../src/api.js";

describe("API exports", () => {
  it("exposes extractValidatedLlmFindings", () => {
    const result = extractValidatedLlmFindings("CYBER-001");
    assert.ok(Array.isArray(result.ruleIds));
    assert.ok(result.ruleIds.includes("CYBER-001"));
  });
});
