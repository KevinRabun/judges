// ─────────────────────────────────────────────────────────────────────────────
// Judges Panel — Subsystem Unit Tests
// ─────────────────────────────────────────────────────────────────────────────
// Targeted tests for internal subsystems: scoring, confidence estimation,
// deduplication, configuration, inline suppression, patches, and file
// classification. These complement the integration tests in judges.test.ts.
//
// Usage:
//   npx tsx --test tests/subsystems.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMustFixGate,
  clampConfidence,
  estimateFindingConfidence,
  applyConfidenceThreshold,
  isAbsenceBasedFinding,
} from "../src/scoring.js";
import { crossEvaluatorDedup, severityRank } from "../src/dedup.js";
import { parseConfig, defaultConfig } from "../src/config.js";
import { enrichWithPatches } from "../src/patches/index.js";
import { applyInlineSuppressions } from "../src/evaluators/index.js";
import {
  calculateScore,
  deriveVerdict,
  detectPositiveSignals,
  classifyFile,
  shouldRunAbsenceRules,
  applyConfig,
  detectFrameworks,
  applyFrameworkAwareness,
} from "../src/evaluators/shared.js";
import type { Finding, Severity } from "../src/types.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "TEST-001",
    severity: "medium" as Severity,
    title: "Test finding",
    description: "A test finding for unit testing",
    recommendation: "Fix it",
    confidence: 0.7,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Scoring — calculateScore
// ═══════════════════════════════════════════════════════════════════════════

describe("Scoring — calculateScore", () => {
  it("should return 100 for zero findings", () => {
    assert.equal(calculateScore([]), 100);
  });

  it("should deduct based on severity * confidence", () => {
    const score = calculateScore([makeFinding({ severity: "high", confidence: 1.0 })]);
    // high penalty = 18, confidence = 1.0 => score = 100 - 18 = 82
    assert.equal(score, 82);
  });

  it("should weight deductions by confidence", () => {
    const full = calculateScore([makeFinding({ severity: "high", confidence: 1.0 })]);
    const half = calculateScore([makeFinding({ severity: "high", confidence: 0.5 })]);
    assert.ok(half > full, `Half confidence (${half}) should deduct less than full (${full})`);
  });

  it("should use 0.5 default confidence when not specified", () => {
    const score = calculateScore([makeFinding({ severity: "high", confidence: undefined })]);
    // high penalty = 18, default confidence = 0.5 => deduction = 9 => score = 91
    assert.equal(score, 91);
  });

  it("should clamp score to [0, 100]", () => {
    const manyFindings = Array.from({ length: 20 }, () => makeFinding({ severity: "critical", confidence: 1.0 }));
    assert.equal(calculateScore(manyFindings), 0);
  });

  it("should add positive signals bonus from code", () => {
    const withBonus = calculateScore([], "import helmet from 'helmet'; import { z } from 'zod';");
    assert.ok(withBonus > 100 - 1, "Expected positive signal bonus");
  });

  it("should cap positive signal bonus at 15", () => {
    const maxBonus = calculateScore(
      [],
      `
      import helmet from 'helmet';
      import { z } from 'zod';
      import rateLimit from 'express-rate-limit';
      import cors from 'cors';
      cors({ origin: true, credentials: true });
      import pino from 'pino';
      import passport from 'passport';
      const stmt = db.prepare($1);
      describe("test", () => { expect(true); });
    `,
    );
    assert.ok(maxBonus <= 100, "Score should not exceed 100");
  });

  it("should handle critical findings with varying confidence", () => {
    const critLow = calculateScore([makeFinding({ severity: "critical", confidence: 0.3 })]);
    const critHigh = calculateScore([makeFinding({ severity: "critical", confidence: 0.9 })]);
    assert.ok(
      critLow > critHigh,
      `Low confidence critical (${critLow}) should score higher than high confidence (${critHigh})`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Scoring — deriveVerdict
// ═══════════════════════════════════════════════════════════════════════════

describe("Scoring — deriveVerdict", () => {
  it("should pass with no findings and high score", () => {
    assert.equal(deriveVerdict([], 95), "pass");
  });

  it("should fail on critical finding with confidence >= 0.6", () => {
    assert.equal(deriveVerdict([makeFinding({ severity: "critical", confidence: 0.8 })], 85), "fail");
  });

  it("should NOT fail on critical finding with confidence < 0.6", () => {
    const verdict = deriveVerdict([makeFinding({ severity: "critical", confidence: 0.4 })], 85);
    assert.notEqual(verdict, "fail");
  });

  it("should fail on low score < 60", () => {
    assert.equal(deriveVerdict([], 55), "fail");
  });

  it("should warn on high finding with confidence >= 0.4", () => {
    assert.equal(deriveVerdict([makeFinding({ severity: "high", confidence: 0.5 })], 85), "warning");
  });

  it("should warn on score < 80 even with no significant findings", () => {
    assert.equal(deriveVerdict([], 75), "warning");
  });

  it("should pass with score >= 80 and only low-confidence findings", () => {
    assert.equal(deriveVerdict([makeFinding({ severity: "high", confidence: 0.3 })], 85), "pass");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Scoring — detectPositiveSignals
// ═══════════════════════════════════════════════════════════════════════════

describe("Scoring — detectPositiveSignals", () => {
  it("should return 0 for empty code", () => {
    assert.equal(detectPositiveSignals(""), 0);
  });

  it("should detect helmet", () => {
    assert.ok(detectPositiveSignals("import helmet from 'helmet';") > 0);
  });

  it("should detect zod validation", () => {
    assert.ok(detectPositiveSignals("import { z } from 'zod';") > 0);
  });

  it("should detect parameterized queries", () => {
    assert.ok(detectPositiveSignals("db.query('SELECT * FROM users WHERE id = $1', [id])") > 0);
  });

  it("should detect structured logging (pino)", () => {
    assert.ok(detectPositiveSignals("const logger = pino();") > 0);
  });

  it("should detect rate limiting", () => {
    assert.ok(detectPositiveSignals("import rateLimit from 'express-rate-limit';") > 0);
  });

  it("should cap bonus at 15", () => {
    const maxCode = `
      helmet cors({ origin: true, credentials: true }) zod rateLimit
      passport pino $1 describe("") { expect(); }
      catch (e) { logger.error(e); throw e; }
      strictNullChecks: true
    `;
    assert.ok(detectPositiveSignals(maxCode) <= 15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Confidence — clampConfidence
// ═══════════════════════════════════════════════════════════════════════════

describe("Confidence — clampConfidence", () => {
  it("should clamp negative values to 0", () => {
    assert.equal(clampConfidence(-1), 0);
  });

  it("should clamp values > 1 to 1", () => {
    assert.equal(clampConfidence(1.5), 1);
  });

  it("should pass through valid values", () => {
    assert.equal(clampConfidence(0.7), 0.7);
  });

  it("should return 0 for NaN", () => {
    assert.equal(clampConfidence(NaN), 0);
  });

  it("should return 0 for Infinity", () => {
    assert.equal(clampConfidence(Infinity), 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Confidence — estimateFindingConfidence
// ═══════════════════════════════════════════════════════════════════════════

describe("Confidence — estimateFindingConfidence", () => {
  it("should return existing confidence when present", () => {
    const conf = estimateFindingConfidence(makeFinding({ confidence: 0.85 }));
    assert.equal(conf, 0.85);
  });

  it("should estimate higher confidence for findings with line numbers", () => {
    const withLines = estimateFindingConfidence(
      makeFinding({ confidence: undefined, lineNumbers: [10], description: "Found something specific" }),
    );
    const withoutLines = estimateFindingConfidence(
      makeFinding({ confidence: undefined, lineNumbers: undefined, description: "Found something specific" }),
    );
    assert.ok(withLines > withoutLines, `With lines (${withLines}) should > without (${withoutLines})`);
  });

  it("should boost confidence for CVE references", () => {
    const withCve = estimateFindingConfidence(
      makeFinding({ confidence: undefined, description: "Matches CVE-2023-12345", lineNumbers: [1] }),
    );
    const without = estimateFindingConfidence(
      makeFinding({ confidence: undefined, description: "Generic issue", lineNumbers: [1] }),
    );
    assert.ok(withCve > without, `CVE reference (${withCve}) should boost confidence vs (${without})`);
  });

  it("should reduce confidence for absence-like descriptions", () => {
    const absence = estimateFindingConfidence(
      makeFinding({
        confidence: undefined,
        description: "No rate limiting found in the codebase",
        lineNumbers: undefined,
      }),
    );
    assert.ok(absence < 0.5, `Absence finding should have low confidence: ${absence}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Confidence — isAbsenceBasedFinding
// ═══════════════════════════════════════════════════════════════════════════

describe("Confidence — isAbsenceBasedFinding", () => {
  it("should return true when isAbsenceBased flag is set", () => {
    assert.ok(isAbsenceBasedFinding(makeFinding({ isAbsenceBased: true, ruleId: "FOOBAR-001" })));
  });

  it("should return false when finding has line numbers", () => {
    assert.ok(
      !isAbsenceBasedFinding(makeFinding({ ruleId: "AUTH-001", title: "No authentication", lineNumbers: [5] })),
    );
  });

  it("should detect AUTH- prefix absence patterns", () => {
    assert.ok(isAbsenceBasedFinding(makeFinding({ ruleId: "AUTH-010", title: "No authentication detected" })));
  });

  it("should detect RATE- prefix absence patterns", () => {
    assert.ok(isAbsenceBasedFinding(makeFinding({ ruleId: "RATE-001", title: "No rate limiting detected" })));
  });

  it("should NOT flag non-absence prefixes", () => {
    assert.ok(!isAbsenceBasedFinding(makeFinding({ ruleId: "PERF-001", title: "No cache detected" })));
  });

  it("should NOT flag project-level keywords like CI/CD", () => {
    assert.ok(!isAbsenceBasedFinding(makeFinding({ ruleId: "CICD-001", title: "No CI/CD pipeline detected" })));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Confidence — applyConfidenceThreshold
// ═══════════════════════════════════════════════════════════════════════════

describe("Confidence — applyConfidenceThreshold", () => {
  it("should keep all findings with minConfidence = 0", () => {
    const findings = [makeFinding({ confidence: 0.1 }), makeFinding({ confidence: 0.9 })];
    const result = applyConfidenceThreshold(findings, { minConfidence: 0 });
    assert.equal(result.length, 2);
  });

  it("should filter findings below threshold", () => {
    const findings = [makeFinding({ confidence: 0.3 }), makeFinding({ confidence: 0.8 })];
    const result = applyConfidenceThreshold(findings, { minConfidence: 0.5 });
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, 0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Must-Fix Gate — evaluateMustFixGate
// ═══════════════════════════════════════════════════════════════════════════

describe("Must-Fix Gate — evaluateMustFixGate", () => {
  it("should return undefined when not enabled", () => {
    assert.equal(evaluateMustFixGate([makeFinding()], { enabled: false }), undefined);
  });

  it("should pass when no dangerous findings exist", () => {
    const result = evaluateMustFixGate([makeFinding({ severity: "low", ruleId: "STYLE-001", confidence: 0.9 })], {
      enabled: true,
    });
    assert.ok(result);
    assert.equal(result.triggered, false);
  });

  it("should trigger on high-confidence critical AUTH finding", () => {
    const result = evaluateMustFixGate(
      [makeFinding({ severity: "critical", ruleId: "AUTH-001", confidence: 0.95, title: "Authentication bypass" })],
      { enabled: true },
    );
    assert.ok(result);
    assert.equal(result.triggered, true);
  });

  it("should NOT trigger on low-confidence dangerous finding", () => {
    const result = evaluateMustFixGate(
      [makeFinding({ severity: "critical", ruleId: "AUTH-001", confidence: 0.5, title: "Authentication bypass" })],
      { enabled: true },
    );
    assert.ok(result);
    assert.equal(result.triggered, false);
  });

  it("should trigger on content match (SQL injection)", () => {
    const result = evaluateMustFixGate(
      [
        makeFinding({
          severity: "critical",
          ruleId: "CUSTOM-001",
          confidence: 0.95,
          title: "SQL injection vulnerability",
          description: "SQL injection through unsanitized input",
        }),
      ],
      { enabled: true },
    );
    assert.ok(result);
    assert.equal(result.triggered, true);
  });

  it("should use custom prefixes when provided", () => {
    const result = evaluateMustFixGate([makeFinding({ severity: "critical", ruleId: "CUSTOM-001", confidence: 0.9 })], {
      enabled: true,
      dangerousRulePrefixes: ["CUSTOM-"],
    });
    assert.ok(result);
    assert.equal(result.triggered, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Deduplication — crossEvaluatorDedup
// ═══════════════════════════════════════════════════════════════════════════

describe("Deduplication — crossEvaluatorDedup", () => {
  it("should return findings as-is when no duplicates", () => {
    const findings = [
      makeFinding({ ruleId: "A-001", title: "Issue A", lineNumbers: [1] }),
      makeFinding({ ruleId: "B-001", title: "Issue B", lineNumbers: [2] }),
    ];
    const result = crossEvaluatorDedup(findings);
    assert.equal(result.length, 2);
  });

  it("should merge findings with same topic and line", () => {
    const findings = [
      makeFinding({
        ruleId: "CYBER-001",
        severity: "high",
        title: "SQL injection detected",
        lineNumbers: [10],
        confidence: 0.9,
      }),
      makeFinding({
        ruleId: "DB-001",
        severity: "medium",
        title: "SQL injection vulnerability",
        lineNumbers: [10],
        confidence: 0.8,
      }),
    ];
    const result = crossEvaluatorDedup(findings);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "high"); // keeps highest severity
  });

  it("should keep higher-severity finding", () => {
    const findings = [
      makeFinding({ ruleId: "A-001", severity: "medium", title: "XSS vulnerability", lineNumbers: [5] }),
      makeFinding({ ruleId: "B-001", severity: "critical", title: "Cross-site scripting", lineNumbers: [5] }),
    ];
    const result = crossEvaluatorDedup(findings);
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "critical");
  });

  it("should annotate with cross-references", () => {
    const findings = [
      makeFinding({ ruleId: "CYBER-001", severity: "high", title: "SQL injection", lineNumbers: [10] }),
      makeFinding({ ruleId: "DB-001", severity: "medium", title: "SQL injection risk", lineNumbers: [10] }),
    ];
    const result = crossEvaluatorDedup(findings);
    assert.ok(result[0].description.includes("Also identified by: DB-001"));
  });

  it("should merge line numbers from all findings in cluster", () => {
    const findings = [
      makeFinding({ ruleId: "A-001", severity: "high", title: "Command injection here", lineNumbers: [5, 10] }),
      makeFinding({ ruleId: "B-001", severity: "medium", title: "Command injection risk", lineNumbers: [10, 15] }),
    ];
    const result = crossEvaluatorDedup(findings);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].lineNumbers, [5, 10, 15]);
  });

  it("should handle empty input", () => {
    assert.deepEqual(crossEvaluatorDedup([]), []);
  });

  it("should handle single finding", () => {
    const findings = [makeFinding()];
    const result = crossEvaluatorDedup(findings);
    assert.equal(result.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Deduplication — severityRank
// ═══════════════════════════════════════════════════════════════════════════

describe("Deduplication — severityRank", () => {
  it("should rank critical highest", () => {
    assert.ok(severityRank("critical") > severityRank("high"));
  });

  it("should rank info lowest", () => {
    assert.ok(severityRank("info") < severityRank("low"));
  });

  it("should rank correctly: critical > high > medium > low > info", () => {
    assert.ok(
      severityRank("critical") > severityRank("high") &&
        severityRank("high") > severityRank("medium") &&
        severityRank("medium") > severityRank("low") &&
        severityRank("low") > severityRank("info"),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Configuration — parseConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("Configuration — parseConfig", () => {
  it("should parse empty config", () => {
    const config = parseConfig("{}");
    assert.deepEqual(config, {});
  });

  it("should parse disabledRules", () => {
    const config = parseConfig('{"disabledRules": ["CYBER-001", "AUTH-002"]}');
    assert.deepEqual(config.disabledRules, ["CYBER-001", "AUTH-002"]);
  });

  it("should parse disabledJudges", () => {
    const config = parseConfig('{"disabledJudges": ["cybersecurity"]}');
    assert.deepEqual(config.disabledJudges, ["cybersecurity"]);
  });

  it("should parse minSeverity", () => {
    const config = parseConfig('{"minSeverity": "high"}');
    assert.equal(config.minSeverity, "high");
  });

  it("should parse ruleOverrides", () => {
    const config = parseConfig('{"ruleOverrides": {"CYBER-001": {"disabled": true}}}');
    assert.ok(config.ruleOverrides);
    assert.equal(config.ruleOverrides["CYBER-001"].disabled, true);
  });

  it("should throw on invalid JSON", () => {
    assert.throws(() => parseConfig("not json"), /not valid JSON/);
  });

  it("should throw on non-object root", () => {
    assert.throws(() => parseConfig("[]"), /root must be a JSON object/);
    assert.throws(() => parseConfig('"string"'), /root must be a JSON object/);
  });

  it("should throw on invalid disabledRules type", () => {
    assert.throws(() => parseConfig('{"disabledRules": "not-array"}'), /must be an array/);
  });

  it("should throw on invalid minSeverity", () => {
    assert.throws(() => parseConfig('{"minSeverity": "extreme"}'), /must be one of/);
  });

  it("should throw on invalid ruleOverrides type", () => {
    assert.throws(() => parseConfig('{"ruleOverrides": "bad"}'), /must be an object/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Configuration — defaultConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("Configuration — defaultConfig", () => {
  it("should return an empty object", () => {
    assert.deepEqual(defaultConfig(), {});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. Configuration — applyConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("Configuration — applyConfig", () => {
  it("should return all findings with no config", () => {
    const findings = [makeFinding(), makeFinding()];
    assert.equal(applyConfig(findings).length, 2);
  });

  it("should suppress disabled rules", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001" }), makeFinding({ ruleId: "AUTH-001" })];
    const result = applyConfig(findings, { disabledRules: ["CYBER-001"] });
    assert.equal(result.length, 1);
    assert.equal(result[0].ruleId, "AUTH-001");
  });

  it("should support wildcard disabled rules", () => {
    const findings = [
      makeFinding({ ruleId: "CYBER-001" }),
      makeFinding({ ruleId: "CYBER-002" }),
      makeFinding({ ruleId: "AUTH-001" }),
    ];
    const result = applyConfig(findings, { disabledRules: ["CYBER-*"] });
    assert.equal(result.length, 1);
    assert.equal(result[0].ruleId, "AUTH-001");
  });

  it("should filter by minSeverity", () => {
    const findings = [
      makeFinding({ severity: "info" }),
      makeFinding({ severity: "low" }),
      makeFinding({ severity: "high" }),
    ];
    const result = applyConfig(findings, { minSeverity: "medium" });
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "high");
  });

  it("should apply severity overrides", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", severity: "critical" })];
    const result = applyConfig(findings, {
      ruleOverrides: { "CYBER-001": { severity: "low" } },
    });
    assert.equal(result[0].severity, "low");
  });

  it("should disable rules via ruleOverrides", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001" })];
    const result = applyConfig(findings, {
      ruleOverrides: { "CYBER-001": { disabled: true } },
    });
    assert.equal(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. File Classification — classifyFile
// ═══════════════════════════════════════════════════════════════════════════

describe("File Classification — classifyFile", () => {
  it("should classify .test.ts files as test", () => {
    assert.equal(classifyFile("const x = 1;", "typescript", "src/utils/date.test.ts"), "test");
  });

  it("should classify .spec.ts files as test", () => {
    assert.equal(classifyFile("const x = 1;", "typescript", "src/utils/date.spec.ts"), "test");
  });

  it("should classify __tests__/ directory as test", () => {
    assert.equal(classifyFile("const x = 1;", "typescript", "src/__tests__/date.ts"), "test");
  });

  it("should classify tsconfig.json as config", () => {
    assert.equal(classifyFile("{}", "json", "tsconfig.json"), "config");
  });

  it("should classify .d.ts as types", () => {
    assert.equal(classifyFile("declare module 'x';", "typescript", "index.d.ts"), "types");
  });

  it("should classify content with many test framework lines as test", () => {
    const code = `
describe("suite", () => {
  it("test1", () => { expect(1).toBe(1); });
  it("test2", () => { expect(2).toBe(2); });
  it("test3", () => { expect(3).toBe(3); });
});`;
    assert.equal(classifyFile(code, "typescript"), "test");
  });

  it("should classify pure type definitions by content", () => {
    // Needs > 85% non-runtime lines to classify as "types"
    const code = `
export interface User { id: string; name: string; }
export type Role = "admin" | "user";
export enum Status { Active, Inactive }
export type ID = string;
export interface Config { debug: boolean; }
export declare const VERSION: string;
`;
    assert.equal(classifyFile(code, "typescript"), "types");
  });

  it("should classify Express server code as server", () => {
    const code = `
import express from "express";
const app = express();
app.get("/api", (req, res) => res.json({}));
app.listen(3000);
`;
    assert.equal(classifyFile(code, "typescript"), "server");
  });

  it("should classify small utility with no I/O as utility", () => {
    const code = `
export function add(a: number, b: number): number {
  return a + b;
}
export function multiply(a: number, b: number): number {
  return a * b;
}
`;
    assert.equal(classifyFile(code, "typescript"), "utility");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. File Classification — shouldRunAbsenceRules
// ═══════════════════════════════════════════════════════════════════════════

describe("File Classification — shouldRunAbsenceRules", () => {
  it("should return true for server files", () => {
    assert.equal(shouldRunAbsenceRules("server"), true);
  });

  it("should return true for unknown files", () => {
    assert.equal(shouldRunAbsenceRules("unknown"), true);
  });

  it("should return false for test files", () => {
    assert.equal(shouldRunAbsenceRules("test"), false);
  });

  it("should return false for config files", () => {
    assert.equal(shouldRunAbsenceRules("config"), false);
  });

  it("should return false for types files", () => {
    assert.equal(shouldRunAbsenceRules("types"), false);
  });

  it("should return false for utility files", () => {
    assert.equal(shouldRunAbsenceRules("utility"), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Inline Suppressions — applyInlineSuppressions
// ═══════════════════════════════════════════════════════════════════════════

describe("Inline Suppressions — applyInlineSuppressions", () => {
  it("should keep all findings when no suppressions present", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", lineNumbers: [3] })];
    const code = "const x = eval(input);\nconst y = 2;\nconst z = 3;";
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 1);
  });

  it("should suppress finding with line-level judges-ignore comment", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", lineNumbers: [1] })];
    const code = "const x = eval(input); // judges-ignore CYBER-001";
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });

  it("should suppress all findings with judges-ignore *", () => {
    const findings = [
      makeFinding({ ruleId: "CYBER-001", lineNumbers: [1] }),
      makeFinding({ ruleId: "AUTH-001", lineNumbers: [1] }),
    ];
    const code = "const x = eval(input); // judges-ignore *";
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });

  it("should suppress with prefix wildcard", () => {
    const findings = [
      makeFinding({ ruleId: "CYBER-001", lineNumbers: [1] }),
      makeFinding({ ruleId: "CYBER-002", lineNumbers: [1] }),
      makeFinding({ ruleId: "AUTH-001", lineNumbers: [1] }),
    ];
    const code = "const x = eval(input); // judges-ignore CYBER-*";
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 1);
    assert.equal(result[0].ruleId, "AUTH-001");
  });

  it("should support file-level suppression (judges-file-ignore)", () => {
    const findings = [makeFinding({ ruleId: "CYBER-001", lineNumbers: [5] })];
    const code = "// judges-file-ignore CYBER-001\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst x = eval(input);";
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Auto-Fix Patches — enrichWithPatches
// ═══════════════════════════════════════════════════════════════════════════

describe("Auto-Fix Patches — enrichWithPatches", () => {
  it("should not crash on empty findings", () => {
    const result = enrichWithPatches([], "const x = 1;");
    assert.deepEqual(result, []);
  });

  it("should attach patch for new Buffer() → Buffer.from()", () => {
    const code = 'const buf = new Buffer("hello");';
    const findings = [makeFinding({ ruleId: "DEPS-001", title: "Deprecated API: new Buffer()", lineNumbers: [1] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected a patch to be attached");
    assert.ok(result[0].patch!.newText.includes("Buffer.from"), "Patch should suggest Buffer.from()");
  });

  it("should attach patch for http:// → https://", () => {
    const code = 'const url = "http://api.example.com/data";';
    const findings = [makeFinding({ ruleId: "CYBER-001", title: "Unencrypted HTTP connection", lineNumbers: [1] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch for HTTPS upgrade");
    assert.ok(result[0].patch!.newText.includes("https://"));
  });

  it("should attach patch for Math.random() → crypto.randomUUID()", () => {
    const code = "const id = Math.random().toString(36);";
    const findings = [
      makeFinding({ ruleId: "CYBER-001", title: "Insecure random number generator", lineNumbers: [1] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch for secure random");
    assert.ok(result[0].patch!.newText.includes("crypto.randomUUID"));
  });

  it("should not attach patch for unrecognized findings", () => {
    const code = "const x = 1;";
    const findings = [makeFinding({ ruleId: "UNKNOWN-001", title: "Something unknown", lineNumbers: [1] })];
    const result = enrichWithPatches(findings, code);
    assert.equal(result[0].patch, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. Multi-line Patches — enrichWithPatches
// ═══════════════════════════════════════════════════════════════════════════

describe("Multi-line Patches — enrichWithPatches", () => {
  it("should patch multi-line empty catch block", () => {
    const code = ["try {", "  doSomething();", "} catch (e) {", "  // nothing here", "}"].join("\n");
    const findings = [makeFinding({ ruleId: "ERR-003", title: "Empty catch block swallows errors", lineNumbers: [3] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected multi-line patch for empty catch");
    assert.ok(result[0].patch!.newText.includes("throw"), "Should re-throw");
    assert.ok(result[0].patch!.newText.includes("catch (e)"), "Should preserve error parameter");
    assert.ok(result[0].patch!.newText.includes("\n"), "Patch should be multi-line");
  });

  it("should patch multi-line empty catch with no parameter", () => {
    const code = ["try { x(); }", "catch () {", "}"].join("\n");
    const findings = [makeFinding({ ruleId: "ERR-003", title: "Empty catch block discards error", lineNumbers: [2] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch");
    assert.ok(result[0].patch!.newText.includes("catch (error)"), "Should provide default error param");
  });

  it("should NOT patch non-empty catch block", () => {
    const code = ["try { x(); }", "catch (e) {", "  console.error(e);", "}"].join("\n");
    const findings = [makeFinding({ ruleId: "ERR-003", title: "Empty catch block swallows errors", lineNumbers: [2] })];
    const result = enrichWithPatches(findings, code);
    assert.equal(result[0].patch, undefined, "Should not patch non-empty catch");
  });

  it("should wrap bare JSON.parse in try/catch", () => {
    const code = "const data = JSON.parse(input);";
    const findings = [
      makeFinding({ ruleId: "DATA-001", title: "Unsafe JSON.parse without error handling", lineNumbers: [1] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected multi-line patch");
    assert.ok(result[0].patch!.newText.includes("try"), "Should include try");
    assert.ok(result[0].patch!.newText.includes("catch"), "Should include catch");
    assert.ok(result[0].patch!.newText.includes("let data"), "Should use let for outer var");
  });

  it("should add error handler to app.listen()", () => {
    const code = "app.listen(3000);";
    const findings = [
      makeFinding({ ruleId: "ERR-010", title: "Server listen without error callback", lineNumbers: [1] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected multi-line patch");
    assert.ok(result[0].patch!.newText.includes('on("error"'), "Should add error handler");
    assert.ok(result[0].patch!.newText.includes("3000"), "Should preserve port");
  });

  it("should wrap bare await in try/catch", () => {
    const code = ["async function fetchData() {", "  const result = await fetch(url);", "  return result;", "}"].join(
      "\n",
    );
    const findings = [
      makeFinding({ ruleId: "ERR-015", title: "Await without catch — unhandled rejection", lineNumbers: [2] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected multi-line patch");
    assert.ok(result[0].patch!.newText.includes("try {"), "Should wrap in try");
    assert.ok(result[0].patch!.newText.includes("catch (error)"), "Should catch error");
  });

  it("should NOT wrap await that is already in try/catch", () => {
    const code = [
      "async function fetchData() {",
      "  try {",
      "    const result = await fetch(url);",
      "    return result;",
      "  } catch (e) { throw e; }",
      "}",
    ].join("\n");
    const findings = [
      makeFinding({ ruleId: "ERR-015", title: "Await without catch — unhandled rejection", lineNumbers: [3] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.equal(result[0].patch, undefined, "Should not double-wrap in try/catch");
  });

  it("should pin Dockerfile FROM :latest tag", () => {
    const code = "FROM node:latest";
    const findings = [makeFinding({ ruleId: "CICD-005", title: "Docker latest tag is unpinned", lineNumbers: [1] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch");
    assert.ok(result[0].patch!.newText.includes("lts-slim"), "Should pin version");
    assert.ok(result[0].patch!.newText.includes("TODO"), "Should add TODO comment");
  });

  it("should pin Dockerfile FROM :latest with AS alias", () => {
    const code = "FROM python:latest AS builder";
    const findings = [
      makeFinding({ ruleId: "CICD-005", title: "Unpinned base image with latest tag", lineNumbers: [1] }),
    ];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch");
    // Single-line rule matches first — replaces only the :latest portion
    assert.ok(result[0].patch!.newText.includes("lts-slim"), "Should pin version");
  });

  it("should prefer single-line patch over multi-line when both match", () => {
    const code = 'const buf = new Buffer("hello");';
    const findings = [makeFinding({ ruleId: "DEPS-001", title: "Deprecated API: new Buffer()", lineNumbers: [1] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch");
    assert.ok(result[0].patch!.newText.includes("Buffer.from"), "Single-line rule should win");
    assert.equal(result[0].patch!.startLine, result[0].patch!.endLine, "Should be single-line patch");
  });

  it("multi-line patch startLine/endLine should be correct for spanning patch", () => {
    const code = ["try {", "  doSomething();", "} catch (err) {", "", "}"].join("\n");
    const findings = [makeFinding({ ruleId: "ERR-003", title: "Empty catch block swallows errors", lineNumbers: [3] })];
    const result = enrichWithPatches(findings, code);
    assert.ok(result[0].patch, "Expected patch");
    assert.equal(result[0].patch!.startLine, 3, "Should start at catch line");
    assert.equal(result[0].patch!.endLine, 5, "Should end at closing brace");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. Framework Detection — detectFrameworks
// ═══════════════════════════════════════════════════════════════════════════

describe("Framework Detection — detectFrameworks", () => {
  it("should detect Express from require()", () => {
    const code = `const express = require('express');\nconst app = express();`;
    assert.ok(detectFrameworks(code).includes("express"));
  });

  it("should detect Express from import", () => {
    const code = `import express from 'express';\nconst app = express();`;
    assert.ok(detectFrameworks(code).includes("express"));
  });

  it("should detect Next.js from imports", () => {
    const code = `import { NextRequest } from 'next/server';\nexport function GET(req: NextRequest) {}`;
    assert.ok(detectFrameworks(code).includes("next"));
  });

  it("should detect Hono", () => {
    const code = `import { Hono } from 'hono';\nconst app = new Hono();`;
    assert.ok(detectFrameworks(code).includes("hono"));
  });

  it("should detect FastAPI", () => {
    const code = `from fastapi import FastAPI\napp = FastAPI()`;
    assert.ok(detectFrameworks(code).includes("fastapi"));
  });

  it("should detect Django", () => {
    const code = `from django.http import HttpResponse\ndef index(request): return HttpResponse("OK")`;
    assert.ok(detectFrameworks(code).includes("django"));
  });

  it("should detect Flask", () => {
    const code = `from flask import Flask\napp = Flask(__name__)`;
    assert.ok(detectFrameworks(code).includes("flask"));
  });

  it("should detect Spring Boot", () => {
    const code = `@SpringBootApplication\npublic class App { public static void main(String[] args) {} }`;
    assert.ok(detectFrameworks(code).includes("spring"));
  });

  it("should detect ASP.NET", () => {
    const code = `[ApiController]\npublic class UsersController : ControllerBase {}`;
    assert.ok(detectFrameworks(code).includes("aspnet"));
  });

  it("should detect Gin (Go)", () => {
    const code = `import "github.com/gin-gonic/gin"\nfunc main() { r := gin.Default() }`;
    assert.ok(detectFrameworks(code).includes("gin"));
  });

  it("should detect Actix (Rust)", () => {
    const code = `use actix_web::{web, App, HttpServer};\nfn main() { HttpServer::new(|| App::new()) }`;
    assert.ok(detectFrameworks(code).includes("actix"));
  });

  it("should detect helmet middleware", () => {
    const code = `import helmet from 'helmet';\napp.use(helmet());`;
    assert.ok(detectFrameworks(code).includes("helmet"));
  });

  it("should detect multiple frameworks", () => {
    const code = `import express from 'express';\nimport helmet from 'helmet';\napp.use(cors());`;
    const fw = detectFrameworks(code);
    assert.ok(fw.includes("express"));
    assert.ok(fw.includes("helmet"));
    assert.ok(fw.includes("cors-middleware"));
  });

  it("should return empty for plain code", () => {
    const code = `function add(a, b) { return a + b; }`;
    assert.deepEqual(detectFrameworks(code), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Framework-Aware Confidence — applyFrameworkAwareness
// ═══════════════════════════════════════════════════════════════════════════

describe("Framework-Aware Confidence — applyFrameworkAwareness", () => {
  it("should reduce confidence for security header findings with helmet", () => {
    const code = `import helmet from 'helmet';\napp.use(helmet());`;
    const findings = [makeFinding({ title: "Missing security headers (CSP, HSTS)", confidence: 0.8 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(result[0].confidence! < 0.8, "Confidence should be reduced");
    assert.ok(result[0].provenance?.includes("helmet"), "Should note mitigation");
  });

  it("should reduce confidence for rate limit findings with express-rate-limit", () => {
    const code = `const rateLimit = require('express-rate-limit');\napp.use(rateLimit({ windowMs: 60000 }));`;
    const findings = [makeFinding({ title: "No rate limiting detected", confidence: 0.6 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(result[0].confidence! < 0.6, "Confidence should be reduced");
  });

  it("should reduce confidence for CSRF findings with Django", () => {
    const code = `from django.middleware.csrf import CsrfViewMiddleware\nINSTALLED_APPS = ['django.contrib.auth']`;
    const findings = [makeFinding({ title: "No CSRF protection detected", confidence: 0.7 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(result[0].confidence! < 0.7, "Django handles CSRF");
  });

  it("should reduce confidence for input validation with FastAPI", () => {
    const code = `from fastapi import FastAPI\napp = FastAPI()`;
    const findings = [makeFinding({ title: "Unsanitized input without type checking", confidence: 0.7 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(result[0].confidence! < 0.7, "FastAPI validates via Pydantic");
  });

  it("should NOT reduce confidence for unrelated findings", () => {
    const code = `import helmet from 'helmet';\napp.use(helmet());`;
    const findings = [makeFinding({ title: "SQL injection vulnerability", confidence: 0.9 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.equal(result[0].confidence, 0.9, "SQL injection is not mitigated by helmet");
  });

  it("should not modify findings when no framework is detected", () => {
    const code = `function add(a, b) { return a + b; }`;
    const findings = [makeFinding({ title: "Missing security headers", confidence: 0.8 })];
    const result = applyFrameworkAwareness(findings, code);
    assert.equal(result[0].confidence, 0.8, "No change expected");
  });

  it("should stack provenance when existing provenance present", () => {
    const code = `import helmet from 'helmet';\napp.use(helmet());`;
    const findings = [
      makeFinding({
        title: "Missing content security policy header",
        confidence: 0.8,
        provenance: "absence-of-pattern",
      }),
    ];
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(result[0].provenance?.includes("absence-of-pattern"), "Should keep original");
    assert.ok(result[0].provenance?.includes("helmet-mitigated"), "Should add framework");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. LRUCache
// ─────────────────────────────────────────────────────────────────────────────
import { LRUCache, contentHash } from "../src/cache.js";

describe("LRUCache", () => {
  it("should store and retrieve values", () => {
    const cache = new LRUCache<number>();
    cache.set("a", 1);
    assert.equal(cache.get("a"), 1);
  });

  it("should return undefined for missing keys", () => {
    const cache = new LRUCache<number>();
    assert.equal(cache.get("missing"), undefined);
  });

  it("should report correct size", () => {
    const cache = new LRUCache<number>();
    assert.equal(cache.size, 0);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.size, 2);
  });

  it("should evict oldest entry when maxSize exceeded", () => {
    const cache = new LRUCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"
    assert.equal(cache.get("a"), undefined, "Oldest key should be evicted");
    assert.equal(cache.get("d"), 4);
    assert.equal(cache.size, 3);
  });

  it("should promote accessed entries (LRU behavior)", () => {
    const cache = new LRUCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // promote "a", so "b" is now oldest
    cache.set("d", 4); // should evict "b" (not "a")
    assert.equal(cache.get("a"), 1, "Promoted key should survive");
    assert.equal(cache.get("b"), undefined, "Least-recently-used key should be evicted");
  });

  it("should update existing keys in place", () => {
    const cache = new LRUCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10); // update "a"
    assert.equal(cache.get("a"), 10);
    assert.equal(cache.size, 2, "Size should not increase for updates");
  });

  it("should clear all entries", () => {
    const cache = new LRUCache<number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    assert.equal(cache.size, 0);
    assert.equal(cache.get("a"), undefined);
  });

  it("has() should not affect LRU order", () => {
    const cache = new LRUCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.has("a"), true); // should NOT promote "a"
    cache.set("c", 3); // should evict "a" (oldest, has() didn't promote)
    assert.equal(cache.get("a"), undefined, "has() should not promote");
    assert.equal(cache.get("b"), 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. contentHash
// ─────────────────────────────────────────────────────────────────────────────

describe("contentHash", () => {
  it("should produce a 16-char hex string", () => {
    const hash = contentHash("console.log('hi')", "typescript");
    assert.equal(hash.length, 16);
    assert.match(hash, /^[0-9a-f]{16}$/);
  });

  it("should produce identical hashes for identical inputs", () => {
    const h1 = contentHash("const x = 1;", "javascript");
    const h2 = contentHash("const x = 1;", "javascript");
    assert.equal(h1, h2);
  });

  it("should produce different hashes for different code", () => {
    const h1 = contentHash("const x = 1;", "javascript");
    const h2 = contentHash("const x = 2;", "javascript");
    assert.notEqual(h1, h2);
  });

  it("should produce different hashes for different languages", () => {
    const h1 = contentHash("x = 1", "python");
    const h2 = contentHash("x = 1", "javascript");
    assert.notEqual(h1, h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. clearEvaluationCaches (smoke test)
// ─────────────────────────────────────────────────────────────────────────────
import { clearEvaluationCaches } from "../src/evaluators/index.js";

describe("clearEvaluationCaches", () => {
  it("should not throw when called", () => {
    assert.doesNotThrow(() => clearEvaluationCaches());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. SARIF Schema Validation
// ─────────────────────────────────────────────────────────────────────────────
import { findingsToSarif, evaluationToSarif, verdictToSarif, validateSarifLog } from "../src/formatters/sarif.js";
import { evaluateWithJudge, evaluateWithTribunal } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";

describe("validateSarifLog", () => {
  it("should validate output from findingsToSarif with multiple findings", () => {
    const findings: Finding[] = [
      {
        ruleId: "SEC-001",
        severity: "critical",
        title: "SQL Injection",
        description: "Unsanitized query",
        lineNumbers: [10],
        recommendation: "Use parameterized queries",
      },
      {
        ruleId: "PERF-002",
        severity: "medium",
        title: "Slow loop",
        description: "O(n^2)",
        lineNumbers: [25],
        recommendation: "Use a Map",
      },
      {
        ruleId: "INFO-003",
        severity: "info",
        title: "Debug log",
        description: "Console.log",
        recommendation: "Remove",
      },
    ];
    const sarif = findingsToSarif(findings, "src/app.ts");
    const errors = validateSarifLog(sarif);
    assert.deepEqual(errors, [], `Validation errors: ${JSON.stringify(errors)}`);
  });

  it("should validate output from findingsToSarif with empty findings", () => {
    const sarif = findingsToSarif([]);
    const errors = validateSarifLog(sarif);
    assert.deepEqual(errors, []);
  });

  it("should validate output from evaluationToSarif", () => {
    const judge = getJudge("cybersecurity")!;
    const evaluation = evaluateWithJudge(judge, "const x = eval(input);", "typescript");
    const sarif = evaluationToSarif(evaluation, "test.ts");
    const errors = validateSarifLog(sarif);
    assert.deepEqual(errors, [], `Validation errors: ${JSON.stringify(errors)}`);
  });

  it("should validate output from verdictToSarif", () => {
    const verdict = evaluateWithTribunal("var password = '123456';", "javascript");
    const sarif = verdictToSarif(verdict, "test.js");
    const errors = validateSarifLog(sarif);
    assert.deepEqual(errors, [], `Validation errors: ${JSON.stringify(errors)}`);
  });

  it("should validate SARIF after JSON round-trip", () => {
    const findings: Finding[] = [
      {
        ruleId: "X-001",
        severity: "high",
        title: "Test",
        description: "Desc",
        lineNumbers: [5],
        recommendation: "Fix it",
      },
    ];
    const sarif = findingsToSarif(findings, "file.py", "3.0.3");
    const roundTripped = JSON.parse(JSON.stringify(sarif));
    const errors = validateSarifLog(roundTripped);
    assert.deepEqual(errors, []);
  });

  // ── Negative validation tests ──────────────────────────────────────────────

  it("should reject non-object root", () => {
    const errors = validateSarifLog("not an object");
    assert.ok(errors.length > 0);
    assert.ok(errors[0].path === "$");
  });

  it("should reject wrong version", () => {
    const errors = validateSarifLog({
      $schema: "https://example.com/sarif.json",
      version: "1.0.0",
      runs: [{ tool: { driver: { name: "test", rules: [] } }, results: [] }],
    });
    assert.ok(errors.some((e) => e.path === "$.version"));
  });

  it("should reject missing $schema", () => {
    const errors = validateSarifLog({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "t", rules: [] } }, results: [] }],
    });
    assert.ok(errors.some((e) => e.path === "$.$schema"));
  });

  it("should reject missing runs", () => {
    const errors = validateSarifLog({ $schema: "x", version: "2.1.0" });
    assert.ok(errors.some((e) => e.path === "$.runs"));
  });

  it("should reject empty runs array", () => {
    const errors = validateSarifLog({ $schema: "x", version: "2.1.0", runs: [] });
    assert.ok(errors.some((e) => e.path === "$.runs" && e.message.includes("at least one")));
  });

  it("should reject missing tool.driver", () => {
    const errors = validateSarifLog({
      $schema: "x",
      version: "2.1.0",
      runs: [{ results: [] }],
    });
    assert.ok(errors.some((e) => e.path.includes("tool")));
  });

  it("should reject invalid result level", () => {
    const errors = validateSarifLog({
      $schema: "x",
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "test", rules: [] } },
          results: [{ ruleId: "X", level: "fatal", message: { text: "msg" } }],
        },
      ],
    });
    assert.ok(errors.some((e) => e.path.includes("level") && e.message.includes("fatal")));
  });

  it("should reject result with missing message.text", () => {
    const errors = validateSarifLog({
      $schema: "x",
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "test", rules: [] } },
          results: [{ ruleId: "X", level: "error", message: {} }],
        },
      ],
    });
    assert.ok(errors.some((e) => e.path.includes("message.text")));
  });

  it("should reject negative startLine in region", () => {
    const errors = validateSarifLog({
      $schema: "x",
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "test", rules: [] } },
          results: [
            {
              ruleId: "X",
              level: "error",
              message: { text: "msg" },
              locations: [{ physicalLocation: { artifactLocation: { uri: "f.ts" }, region: { startLine: -1 } } }],
            },
          ],
        },
      ],
    });
    assert.ok(errors.some((e) => e.path.includes("startLine")));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 25. Enhanced Python Structural Parser
// ─────────────────────────────────────────────────────────────────────────────
import { analyzeStructure } from "../src/ast/index.js";

describe("Enhanced Python Parser", () => {
  it("should extract standalone functions", () => {
    const code = `
def hello(name):
    print(f"Hello, {name}")

def add(a, b):
    return a + b
`;
    const result = analyzeStructure(code, "python");
    assert.equal(result.functions.length, 2);
    assert.equal(result.functions[0].name, "hello");
    assert.equal(result.functions[0].parameterCount, 1);
    assert.equal(result.functions[1].name, "add");
    assert.equal(result.functions[1].parameterCount, 2);
  });

  it("should extract class methods with ClassName.method format", () => {
    const code = `
class UserService:
    def __init__(self, db):
        self.db = db

    def get_user(self, user_id):
        return self.db.get(user_id)

    def delete_user(self, user_id):
        self.db.delete(user_id)
`;
    const result = analyzeStructure(code, "python");
    assert.ok(result.functions.length >= 3, `Expected >=3 methods, got ${result.functions.length}`);
    const getUser = result.functions.find((f) => f.name === "UserService.get_user");
    assert.ok(getUser, "Should find UserService.get_user method");
    assert.equal(getUser!.className, "UserService");
    assert.equal(getUser!.parameterCount, 1, "self should be excluded from param count");
  });

  it("should detect class names", () => {
    const code = `
class Foo:
    pass

class BarService(BaseService):
    pass
`;
    const result = analyzeStructure(code, "python");
    assert.ok(result.classes?.includes("Foo"));
    assert.ok(result.classes?.includes("BarService"));
  });

  it("should detect decorators on functions", () => {
    const code = `
@app.route("/api/users")
@login_required
def get_users():
    return users
`;
    const result = analyzeStructure(code, "python");
    const fn = result.functions.find((f) => f.name === "get_users");
    assert.ok(fn, "Should find get_users");
    assert.ok(fn!.decorators, "Should have decorators");
    assert.ok(
      fn!.decorators!.some((d) => d.includes("app.route")),
      "Should have @app.route",
    );
    assert.ok(fn!.decorators!.includes("login_required"), "Should have @login_required");
  });

  it("should detect async functions", () => {
    const code = `
async def fetch_data(url):
    response = await httpx.get(url)
    return response.json()

def sync_func():
    return 42
`;
    const result = analyzeStructure(code, "python");
    const asyncFn = result.functions.find((f) => f.name === "fetch_data");
    assert.ok(asyncFn, "Should find async function");
    assert.equal(asyncFn!.isAsync, true);
    const syncFn = result.functions.find((f) => f.name === "sync_func");
    assert.ok(syncFn, "Should find sync function");
    assert.ok(!syncFn!.isAsync, "Sync function should not be async");
  });

  it("should filter self and cls from parameter count", () => {
    const code = `
class MyClass:
    def instance_method(self, x, y):
        pass

    @classmethod
    def class_method(cls, z):
        pass

    @staticmethod
    def static_method(a, b, c):
        pass
`;
    const result = analyzeStructure(code, "python");
    const instance = result.functions.find((f) => f.name.includes("instance_method"));
    assert.equal(instance!.parameterCount, 2, "self should be excluded");
    const clsMethod = result.functions.find((f) => f.name.includes("class_method"));
    assert.equal(clsMethod!.parameterCount, 1, "cls should be excluded");
    const staticMethod = result.functions.find((f) => f.name.includes("static_method"));
    assert.equal(staticMethod!.parameterCount, 3, "static method keeps all params");
  });

  it("should handle multi-line Python imports", () => {
    const code = `
from flask import (
    Flask,
    request,
    jsonify
)
import os
from datetime import datetime
`;
    const result = analyzeStructure(code, "python");
    assert.ok(result.imports.includes("flask"), "Should detect flask");
    assert.ok(result.imports.includes("os"), "Should detect os");
    assert.ok(result.imports.includes("datetime"), "Should detect datetime");
  });

  it("should compute cyclomatic complexity for comprehensions", () => {
    const code = `
def complex_func(items):
    filtered = [x for x in items if x > 0]
    if len(filtered) > 10:
        for item in filtered:
            if item % 2 == 0:
                yield item
            elif item % 3 == 0:
                yield item * 2
    return filtered
`;
    const result = analyzeStructure(code, "python");
    const fn = result.functions.find((f) => f.name === "complex_func");
    assert.ok(fn, "Should find complex_func");
    assert.ok(fn!.cyclomaticComplexity >= 4, `Expected complexity >= 4, got ${fn!.cyclomaticComplexity}`);
  });

  it("should detect weak Python types (Any, cast)", () => {
    const code = `
from typing import Any, cast

def process(data: Any) -> Any:
    result = cast(int, data)
    return result
`;
    const result = analyzeStructure(code, "python");
    assert.ok(result.typeAnyLines.length >= 1, "Should detect Any/cast usage");
  });

  it("should extract classes for brace languages too", () => {
    const javaCode = `
public class UserController {
    public void getUser(int id) {
        return;
    }
}
`;
    const result = analyzeStructure(javaCode, "java");
    assert.ok(result.classes?.includes("UserController"));
  });

  it("should handle decorators with arguments", () => {
    const code = `
@pytest.mark.parametrize("x", [1, 2, 3])
def test_something(x):
    assert x > 0

@app.route("/users", methods=["GET"])
def list_users():
    return []
`;
    const result = analyzeStructure(code, "python");
    const testFn = result.functions.find((f) => f.name === "test_something");
    assert.ok(testFn?.decorators?.some((d) => d.includes("pytest.mark.parametrize")));
    const listFn = result.functions.find((f) => f.name === "list_users");
    assert.ok(listFn?.decorators?.some((d) => d.includes("app.route")));
  });

  it("should detect Go struct names as classes", () => {
    const goCode = `
package main

type UserService struct {
    db Database
}

func (s *UserService) GetUser(id int) User {
    return s.db.Get(id)
}
`;
    const result = analyzeStructure(goCode, "go");
    assert.ok(result.classes?.includes("UserService"));
  });

  it("should handle nested Python classes and methods", () => {
    const code = `
class Outer:
    class Inner:
        def inner_method(self):
            pass

    def outer_method(self):
        pass
`;
    const result = analyzeStructure(code, "python");
    assert.ok(result.classes?.includes("Outer"));
    assert.ok(result.classes?.includes("Inner"));
    assert.ok(result.functions.length >= 2, "Should extract methods from nested classes");
  });
});

// ─── False-Positive Heuristic Filter ────────────────────────────────────────

import { filterFalsePositiveHeuristics } from "../src/evaluators/false-positive-review.js";

describe("False-Positive Heuristic Filter", () => {
  const baseFinding: Finding = {
    ruleId: "CYBER-001",
    severity: "high" as Severity,
    title: "SQL Injection",
    description: "Potential SQL injection vulnerability",
    recommendation: "Use parameterized queries",
    lineNumbers: [3],
  };

  describe("IaC template gating", () => {
    it("should remove app-only rules from IaC templates", () => {
      const iacCode = `resource "aws_s3_bucket" "main" {\n  bucket = "my-bucket"\n  acl    = "private"\n}`;
      const findings: Finding[] = [
        { ...baseFinding, ruleId: "CYBER-001", lineNumbers: [2] },
        { ...baseFinding, ruleId: "AUTH-002", lineNumbers: [2] },
      ];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, iacCode, "terraform");
      assert.strictEqual(removed.length, 2, "Both app-only rules should be removed from IaC");
      assert.strictEqual(filtered.length, 0);
    });

    it("should keep IaC-relevant rules on IaC templates", () => {
      const iacCode = `resource "aws_s3_bucket" "main" {\n  bucket = "my-bucket"\n  acl    = "private"\n}`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "IAC-001", lineNumbers: [2] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, iacCode, "terraform");
      assert.strictEqual(filtered.length, 1, "IAC rule should be kept on IaC file");
      assert.strictEqual(removed.length, 0);
    });
  });

  describe("Test file gating", () => {
    it("should remove prod-only rules from test files", () => {
      // classifyFile returns "test" for files with test patterns
      const testCode = `import { describe, it, beforeEach } from "node:test";\ndescribe("test suite", () => {\n  beforeEach(() => {});\n  it("works", () => { expect(true); });\n  it("does more", () => { assert.ok(1); });\n});`;
      const findings: Finding[] = [
        { ...baseFinding, ruleId: "RATE-001", lineNumbers: [2] },
        { ...baseFinding, ruleId: "SCALE-001", lineNumbers: [2] },
        { ...baseFinding, ruleId: "OBS-001", lineNumbers: [2] },
      ];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, testCode, "typescript");
      assert.strictEqual(removed.length, 3, "All prod-only rules should be removed from test files");
      assert.strictEqual(filtered.length, 0);
    });

    it("should keep security rules on test files", () => {
      const testCode = `import { describe, it, beforeEach } from "node:test";\ndescribe("test suite", () => {\n  beforeEach(() => {});\n  it("works", () => { expect(true); });\n  it("does more", () => { assert.ok(1); });\n});`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-001", lineNumbers: [2] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, testCode, "typescript");
      assert.strictEqual(filtered.length, 1, "Security rules should be kept on test files");
      assert.strictEqual(removed.length, 0);
    });
  });

  describe("Comment-only lines", () => {
    it("should remove findings where all target lines are comments", () => {
      const code = `const x = 1;\n// SELECT * FROM users WHERE id = $input\nconst y = 2;`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-010", lineNumbers: [2] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(removed.length, 1, "Finding on comment line should be removed");
      assert.ok(removed[0].description.includes("FP Heuristic"), "Should annotate with FP reason");
    });

    it("should keep findings with mixed comment and code lines", () => {
      const code = `const x = 1;\n// comment\neval(userInput);`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-010", lineNumbers: [2, 3] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(filtered.length, 1, "Finding with some code lines should be kept");
      assert.strictEqual(removed.length, 0);
    });
  });

  describe("String literal lines", () => {
    it("should remove findings where all target lines are string literals", () => {
      const code = `const messages = [\n  "DROP TABLE users;",\n  "SELECT * FROM passwords",\n];`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-010", lineNumbers: [2, 3] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(removed.length, 1, "Finding on string literal lines should be removed");
    });
  });

  describe("Import/type-only lines", () => {
    it("should remove findings on import statements", () => {
      const code = `import crypto from "crypto";\nimport { exec } from "child_process";\nconst x = 1;`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-020", lineNumbers: [1, 2] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "typescript");
      assert.strictEqual(removed.length, 1, "Finding on import lines should be removed");
    });

    it("should remove findings on type declarations", () => {
      const code = `type Password = string;\ninterface SecretStore {\n  get(key: string): string;\n}`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "DSEC-001", lineNumbers: [1] }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "typescript");
      assert.strictEqual(removed.length, 1, "Finding on type declaration should be removed");
    });
  });

  describe("Keyword-in-identifier collision", () => {
    it("should remove findings when keyword is part of an identifier", () => {
      const code = `const config = {\n  maxAge: 3600,\n  cacheAge: 86400,\n};`;
      const findings: Finding[] = [
        {
          ...baseFinding,
          ruleId: "DSEC-005",
          title: "Age-related data exposure",
          description: "Detected age data handling",
          lineNumbers: [2],
        },
      ];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(removed.length, 1, "Keyword 'age' in 'maxAge' identifier should be FP");
    });
  });

  describe("Absence-based low confidence", () => {
    it("should remove absence-based findings with very low confidence", () => {
      const code = `function add(a, b) {\n  return a + b;\n}`;
      const findings: Finding[] = [
        {
          ...baseFinding,
          ruleId: "OBS-001",
          isAbsenceBased: true,
          confidence: 0.2,
          lineNumbers: [],
        },
      ];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(removed.length, 1, "Very low confidence absence-based finding should be removed");
    });

    it("should keep absence-based findings with moderate confidence", () => {
      const code = `function add(a, b) {\n  return a + b;\n}`;
      const findings: Finding[] = [
        {
          ...baseFinding,
          ruleId: "OBS-001",
          isAbsenceBased: true,
          confidence: 0.6,
          lineNumbers: [],
        },
      ];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(filtered.length, 1, "Moderate confidence absence-based finding should be kept");
    });
  });

  describe("Empty findings", () => {
    it("should return empty arrays for empty input", () => {
      const { filtered, removed } = filterFalsePositiveHeuristics([], "const x = 1;", "javascript");
      assert.strictEqual(filtered.length, 0);
      assert.strictEqual(removed.length, 0);
    });
  });

  describe("Findings without line numbers", () => {
    it("should keep findings without line numbers (no context to check)", () => {
      const code = `const x = 1;\neval(input);`;
      const findings: Finding[] = [{ ...baseFinding, ruleId: "CYBER-001", lineNumbers: undefined }];
      const { filtered, removed } = filterFalsePositiveHeuristics(findings, code, "javascript");
      assert.strictEqual(filtered.length, 1, "Finding without line numbers should be kept");
      assert.strictEqual(removed.length, 0);
    });
  });
});
