import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichWithSecurityIds, getSecurityMapping } from "../src/security-ids.js";
import type { Finding } from "../src/types.js";

describe("security-ids", () => {
  it("getSecurityMapping returns prefix and rule overrides", () => {
    const m1 = getSecurityMapping("SEC-001");
    assert.ok(m1?.cweIds?.includes("CWE-89"));
    const m2 = getSecurityMapping("AUTH-999");
    assert.ok(m2?.cweIds?.includes("CWE-287")); // prefix-level fallback
    const m3 = getSecurityMapping("UNKNOWN-1");
    assert.equal(m3, undefined);
  });

  it("enrichWithSecurityIds augments findings", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "t", description: "d", recommendation: "r" },
      { ruleId: "TEST-001", severity: "low", title: "t", description: "d", recommendation: "r" },
    ];
    const enriched = enrichWithSecurityIds(findings);
    const sec = enriched.find((f) => f.ruleId === "SEC-001");
    assert.ok(sec?.cweIds?.includes("CWE-89"));
    assert.ok(sec?.owaspIds?.length);
    const test = enriched.find((f) => f.ruleId === "TEST-001");
    // TEST prefix is present; ensure learnMoreUrl attached
    assert.ok(test?.learnMoreUrl);
  });
});
