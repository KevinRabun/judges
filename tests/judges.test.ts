// ─────────────────────────────────────────────────────────────────────────────
// Judges Panel — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Runs every judge against the intentionally flawed sample-vulnerable-api.ts
// and asserts that each judge produces the expected findings.
//
// Usage:
//   npm test                    (after adding the test script to package.json)
//   npx tsx --test tests/judges.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  evaluateWithJudge,
  evaluateWithTribunal,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "../src/evaluators/index.js";
import { JUDGES, getJudge } from "../src/judges/index.js";
import type {
  JudgeEvaluation,
  TribunalVerdict,
  Finding,
  Verdict,
} from "../src/types.js";

// ─── Load sample code once ───────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const samplePath = resolve(__dirname, "..", "examples", "sample-vulnerable-api.ts");
const sampleCode = readFileSync(samplePath, "utf-8");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Assert that at least one finding has a ruleId starting with the given prefix */
function hasRulePrefix(findings: Finding[], prefix: string): boolean {
  return findings.some((f) => f.ruleId.startsWith(prefix));
}

/** Assert that none of the findings reference zero-length or empty strings */
function findingsAreWellFormed(findings: Finding[]): void {
  for (const f of findings) {
    assert.ok(f.ruleId.length > 0, "ruleId must be non-empty");
    assert.ok(f.title.length > 0, "title must be non-empty");
    assert.ok(f.description.length > 0, "description must be non-empty");
    assert.ok(f.recommendation.length > 0, "recommendation must be non-empty");
    assert.ok(
      ["critical", "high", "medium", "low", "info"].includes(f.severity),
      `severity must be valid, got: ${f.severity}`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Test: Judge Registry
// ═════════════════════════════════════════════════════════════════════════════

describe("Judge Registry", () => {
  it("should have exactly 30 judges registered", () => {
    assert.equal(JUDGES.length, 30);
  });

  it("should allow lookup of every judge by ID", () => {
    for (const judge of JUDGES) {
      const found = getJudge(judge.id);
      assert.ok(found, `getJudge("${judge.id}") should return a judge`);
      assert.equal(found!.id, judge.id);
    }
  });

  it("should return undefined for an unknown judge ID", () => {
    assert.equal(getJudge("nonexistent-judge"), undefined);
  });

  it("every judge should have required fields", () => {
    for (const judge of JUDGES) {
      assert.ok(judge.id, "id must be set");
      assert.ok(judge.name, "name must be set");
      assert.ok(judge.domain, "domain must be set");
      assert.ok(judge.description, "description must be set");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Full Tribunal Evaluation
// ═════════════════════════════════════════════════════════════════════════════

describe("Full Tribunal Evaluation", () => {
  let verdict: TribunalVerdict;

  it("should run without throwing", () => {
    verdict = evaluateWithTribunal(sampleCode, "typescript");
    assert.ok(verdict);
  });

  it("should produce a FAIL verdict for the sample code", () => {
    assert.equal(verdict.overallVerdict, "fail");
  });

  it("should have a low score for heavily flawed code", () => {
    assert.ok(
      verdict.overallScore < 75,
      `Expected score < 75, got ${verdict.overallScore}`
    );
  });

  it("should detect critical findings", () => {
    assert.ok(
      verdict.criticalCount > 0,
      `Expected at least 1 critical finding, got ${verdict.criticalCount}`
    );
  });

  it("should detect high findings", () => {
    assert.ok(
      verdict.highCount > 0,
      `Expected at least 1 high finding, got ${verdict.highCount}`
    );
  });

  it("should produce evaluations from all 30 judges", () => {
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should include a timestamp", () => {
    assert.ok(verdict.timestamp);
    // Should be a valid ISO date
    assert.ok(!isNaN(Date.parse(verdict.timestamp)));
  });

  it("should produce a non-empty summary", () => {
    assert.ok(verdict.summary.length > 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Individual Judge Evaluations Against Sample Code
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Map of judge ID → expected ruleId prefix and minimum number of findings
 * the sample-vulnerable-api.ts should trigger.
 */
const JUDGE_EXPECTATIONS: Record<
  string,
  { prefix: string; minFindings: number; expectVerdict?: Verdict }
> = {
  "data-security":       { prefix: "DATA",   minFindings: 3, expectVerdict: "fail" },
  "cybersecurity":       { prefix: "CYBER",  minFindings: 3, expectVerdict: "fail" },
  "cost-effectiveness":  { prefix: "COST",   minFindings: 2 },
  "scalability":         { prefix: "SCALE",  minFindings: 1 },
  "cloud-readiness":     { prefix: "CLOUD",  minFindings: 1 },
  "software-practices":  { prefix: "SWDEV",  minFindings: 2 },
  "accessibility":       { prefix: "A11Y",   minFindings: 2 },
  "api-design":          { prefix: "API",    minFindings: 1 },
  "reliability":         { prefix: "REL",    minFindings: 2 },
  "observability":       { prefix: "OBS",    minFindings: 2 },
  "performance":         { prefix: "PERF",   minFindings: 2 },
  "compliance":          { prefix: "COMP",   minFindings: 2 },
  "testing":             { prefix: "TEST",   minFindings: 1 },
  "documentation":       { prefix: "DOC",    minFindings: 1 },
  "internationalization": { prefix: "I18N",  minFindings: 1 },
  "dependency-health":   { prefix: "DEPS",   minFindings: 1 },
  "concurrency":         { prefix: "CONC",   minFindings: 1 },
  "ethics-bias":         { prefix: "ETHICS", minFindings: 2 },
  "maintainability":     { prefix: "MAINT",  minFindings: 1 },
  "error-handling":      { prefix: "ERR",    minFindings: 1 },
  "authentication":      { prefix: "AUTH",   minFindings: 1 },
  "database":            { prefix: "DB",     minFindings: 1 },
  "caching":             { prefix: "CACHE",  minFindings: 1 },
  "configuration-management": { prefix: "CFG", minFindings: 1 },
  "backwards-compatibility":  { prefix: "COMPAT", minFindings: 1 },
  "portability":         { prefix: "PORTA",  minFindings: 1 },
  "ux":                  { prefix: "UX",     minFindings: 1 },
  "logging-privacy":     { prefix: "LOGPRIV", minFindings: 1 },
  "rate-limiting":       { prefix: "RATE",   minFindings: 1 },
  "ci-cd":               { prefix: "CICD",   minFindings: 1 },
};

describe("Individual Judge Evaluations", () => {
  for (const judge of JUDGES) {
    describe(judge.name, () => {
      let evaluation: JudgeEvaluation;
      const expectations = JUDGE_EXPECTATIONS[judge.id];

      it("should evaluate without throwing", () => {
        evaluation = evaluateWithJudge(judge, sampleCode, "typescript");
        assert.ok(evaluation);
      });

      it("should return the correct judgeId", () => {
        assert.equal(evaluation.judgeId, judge.id);
      });

      it("should return the correct judgeName", () => {
        assert.equal(evaluation.judgeName, judge.name);
      });

      it("should return a valid verdict", () => {
        assert.ok(
          ["pass", "fail", "warning"].includes(evaluation.verdict),
          `Invalid verdict: ${evaluation.verdict}`
        );
      });

      it("should return a score between 0 and 100", () => {
        assert.ok(evaluation.score >= 0, `Score below 0: ${evaluation.score}`);
        assert.ok(evaluation.score <= 100, `Score above 100: ${evaluation.score}`);
      });

      it("should produce well-formed findings", () => {
        findingsAreWellFormed(evaluation.findings);
      });

      if (expectations) {
        it(`should produce findings with ${expectations.prefix}- prefix`, () => {
          assert.ok(
            hasRulePrefix(evaluation.findings, expectations.prefix),
            `Expected at least one finding with prefix "${expectations.prefix}"`
          );
        });

        it(`should produce at least ${expectations.minFindings} finding(s)`, () => {
          assert.ok(
            evaluation.findings.length >= expectations.minFindings,
            `Expected >= ${expectations.minFindings} findings, got ${evaluation.findings.length}`
          );
        });

        if (expectations.expectVerdict) {
          it(`should return verdict "${expectations.expectVerdict}"`, () => {
            assert.equal(evaluation.verdict, expectations.expectVerdict);
          });
        }
      }

      it("should produce a non-empty summary", () => {
        assert.ok(evaluation.summary.length > 0);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Clean Code (minimal findings)
// ═════════════════════════════════════════════════════════════════════════════

describe("Clean Code Evaluation", () => {
  const cleanCode = `
/**
 * A well-structured Express API endpoint.
 * @param req - Express Request
 * @param res - Express Response
 */
import { Router } from "express";

const router = Router();

/**
 * Retrieves a list of items from the database.
 */
router.get("/items", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const items = await db.find({}).limit(limit);
    res.json({ data: items, count: items.length });
  } catch (error) {
    console.error("Failed to fetch items:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
`;

  it("should produce a higher score than the flawed sample", () => {
    const cleanVerdict = evaluateWithTribunal(cleanCode, "typescript");
    const flawedVerdict = evaluateWithTribunal(sampleCode, "typescript");
    assert.ok(
      cleanVerdict.overallScore > flawedVerdict.overallScore,
      `Clean (${cleanVerdict.overallScore}) should score higher than flawed (${flawedVerdict.overallScore})`
    );
  });

  it("should produce fewer total findings than the flawed sample", () => {
    const cleanVerdict = evaluateWithTribunal(cleanCode, "typescript");
    const flawedVerdict = evaluateWithTribunal(sampleCode, "typescript");
    const cleanTotal = cleanVerdict.evaluations.reduce(
      (s, e) => s + e.findings.length,
      0
    );
    const flawedTotal = flawedVerdict.evaluations.reduce(
      (s, e) => s + e.findings.length,
      0
    );
    assert.ok(
      cleanTotal < flawedTotal,
      `Clean (${cleanTotal} findings) should have fewer findings than flawed (${flawedTotal})`
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Markdown Formatters
// ═════════════════════════════════════════════════════════════════════════════

describe("Markdown Formatters", () => {
  it("formatVerdictAsMarkdown should produce valid markdown", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const md = formatVerdictAsMarkdown(verdict);
    assert.ok(md.length > 0, "Markdown output should be non-empty");
    assert.ok(md.includes("# Judges Panel"), "Should include tribunal header");
    assert.ok(md.includes("CRITICAL") || md.includes("HIGH"), "Should include severity badges");
  });

  it("formatEvaluationAsMarkdown should produce valid markdown", () => {
    const judge = JUDGES[0];
    const evaluation = evaluateWithJudge(judge, sampleCode, "typescript");
    const md = formatEvaluationAsMarkdown(evaluation);
    assert.ok(md.length > 0, "Markdown output should be non-empty");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Edge Cases
// ═════════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("should handle empty code gracefully", () => {
    const verdict = evaluateWithTribunal("", "typescript");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should handle unknown language gracefully", () => {
    const verdict = evaluateWithTribunal(sampleCode, "brainfuck");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should handle very short code gracefully", () => {
    const verdict = evaluateWithTribunal("const x = 1;", "javascript");
    assert.ok(verdict);
    assert.ok(verdict.overallScore >= 0);
  });

  it("should handle code with only comments", () => {
    const verdict = evaluateWithTribunal("// This is a comment\n// Another comment", "typescript");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });
});
