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
import type { Finding, Severity, JudgesConfig } from "../src/types.js";

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
