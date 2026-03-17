import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verdictToPdfHtml } from "../src/formatters/pdf.js";
import type { TribunalVerdict } from "../src/types.js";

// Type helper to avoid verbose casts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type F = TribunalVerdict["evaluations"][number]["findings"][number] & Record<string, any>;

describe("formatters/pdf", () => {
  const verdict: TribunalVerdict = {
    overallVerdict: "fail",
    overallScore: 42,
    timestamp: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    evaluations: [
      {
        judgeId: "cybersecurity",
        judgeName: "Judge Cybersecurity",
        verdict: "fail",
        score: 10,
        findings: [
          {
            ruleId: "CYBER-001",
            severity: "critical",
            title: "SQL injection",
            description: "Unsanitized input used in query",
            recommendation: "Use parameterized queries",
            lineNumbers: [13],
          } as F,
          {
            ruleId: "CYBER-002",
            severity: "high",
            title: "Improper auth",
            description: "Missing auth guard",
            recommendation: "Add auth middleware",
            lineNumbers: [5],
          } as F,
        ],
      },
      {
        judgeId: "testing",
        judgeName: "Judge Testing",
        verdict: "warning",
        score: 70,
        findings: [
          {
            ruleId: "TEST-001",
            severity: "low",
            title: "Missing edge case tests <script>",
            description: "Ensure boundaries",
            recommendation: "Add boundary tests for min/max",
            lineNumbers: [99],
          } as F,
        ],
      },
      {
        judgeId: "observability",
        judgeName: "Judge Observability",
        verdict: "pass",
        score: 95,
        findings: [],
      },
    ],
  };

  it("renders printable HTML with summary counts and escaped content", () => {
    const html = verdictToPdfHtml(verdict, "src/app.ts");

    assert.match(html, /Judges Panel Report/);
    // Summary stats
    assert.match(html, /Score \/ 100/);
    assert.match(html, /Total Findings/);
    assert.match(html, /Judges/);
    // Severity counts should reflect critical/high/medium/low/info breakdown
    assert.match(html, /critical/i);
    assert.match(html, /high/i);
    assert.match(html, /low/i);

    // Judge sections
    assert.match(html, /Judge Cybersecurity/);
    assert.match(html, /Judge Testing/);

    // Escaping check for potentially dangerous content
    assert.doesNotMatch(html, /<script>/); // should be escaped
    assert.match(html, /&lt;script&gt;/);

    // Ensure rule IDs and confidence column render
    assert.match(html, /CYBER-001/);
    assert.match(html, /TEST-001/);

    // Confidence field should not break when undefined
    assert.match(html, /Confidence/);
  });

  it("renders a no-findings message", () => {
    const noFindingsVerdict: TribunalVerdict = {
      ...verdict,
      overallVerdict: "pass",
      overallScore: 100,
      evaluations: verdict.evaluations.map((e) => ({ ...e, findings: [] })),
    };

    const html = verdictToPdfHtml(noFindingsVerdict, undefined);
    // Should print friendly zero findings message and default file label
    assert.match(html, /No findings — all judges passed/);
    assert.match(html, /stdin/);
  });
});
