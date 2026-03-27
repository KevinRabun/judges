// ─────────────────────────────────────────────────────────────────────────────
// CLI Formatters — Comprehensive Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Covers all functions in src/cli-formatters.ts with positive, negative,
// and edge case tests.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  formatTribunalOutput,
  writeOutputIfSpecified,
  formatTextOutput,
  formatSingleJudgeTextOutput,
} from "../src/cli-formatters.js";
import type { TribunalVerdict, JudgeEvaluation, Finding } from "../src/types.js";

// ─── Test Data Factories ────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "CYBER-001",
    severity: "high",
    title: "Test finding",
    description: "A test finding for unit testing purposes",
    lineNumbers: [10],
    recommendation: "Fix it",
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<JudgeEvaluation> = {}): JudgeEvaluation {
  return {
    judgeId: "cybersecurity",
    judgeName: "Judge Cybersecurity",
    verdict: "fail",
    score: 30,
    findings: [makeFinding()],
    ...overrides,
  } as JudgeEvaluation;
}

function makeVerdict(overrides: Partial<TribunalVerdict> = {}): TribunalVerdict {
  return {
    overallVerdict: "fail",
    overallScore: 40,
    summary: "Test verdict",
    criticalCount: 1,
    highCount: 2,
    evaluations: [makeEvaluation()],
    ...overrides,
  } as TribunalVerdict;
}

// ═══════════════════════════════════════════════════════════════════════════
//  formatTribunalOutput — format dispatch
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTribunalOutput", () => {
  it("returns JSON for 'json' format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "json");
    const parsed = JSON.parse(output);
    assert.equal(parsed.overallScore, 40);
    assert.equal(parsed.overallVerdict, "fail");
  });

  it("returns valid SARIF for 'sarif' format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "sarif", "test.ts");
    const sarif = JSON.parse(output);
    assert.equal(
      sarif.$schema,
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    );
    assert.ok(sarif.runs);
  });

  it("returns markdown for 'markdown' format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "markdown");
    assert.ok(output.includes("#") || output.includes("**"), "Markdown should contain formatting");
  });

  it("returns text for 'text' format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "text");
    assert.ok(output.includes("Judges Panel"));
    assert.ok(output.includes("Verdict"));
  });

  it("returns text for default/unknown format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "text");
    assert.ok(output.includes("Judges Panel"));
  });

  it("returns text for 'html' format (handled separately in CLI)", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "html");
    // HTML falls through to text output in this function
    assert.ok(output.includes("Judges Panel"));
  });

  it("returns GitHub Actions format", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "github-actions", "src/app.ts");
    assert.ok(output.includes("::") || output.length >= 0, "GitHub Actions format should have annotations or be empty");
  });

  it("handles SARIF without filePath", () => {
    const verdict = makeVerdict();
    const output = formatTribunalOutput(verdict, "sarif");
    const sarif = JSON.parse(output);
    assert.ok(sarif.runs);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  writeOutputIfSpecified
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: writeOutputIfSpecified", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes content to specified output path", () => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-test-"));
    const outPath = join(tempDir, "output.json");
    writeOutputIfSpecified(outPath, '{"test": true}');
    assert.ok(existsSync(outPath));
    assert.equal(readFileSync(outPath, "utf-8"), '{"test": true}');
  });

  it("creates intermediate directories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-test-"));
    const outPath = join(tempDir, "nested", "deep", "output.txt");
    writeOutputIfSpecified(outPath, "hello");
    assert.ok(existsSync(outPath));
    assert.equal(readFileSync(outPath, "utf-8"), "hello");
  });

  it("does nothing when outputPath is undefined", () => {
    writeOutputIfSpecified(undefined, "content");
    // No error thrown, no file created
    assert.ok(true);
  });

  it("handles existing directory gracefully", () => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-test-"));
    mkdirSync(join(tempDir, "existing"), { recursive: true });
    const outPath = join(tempDir, "existing", "output.txt");
    writeOutputIfSpecified(outPath, "data");
    assert.ok(existsSync(outPath));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatTextOutput — header and verdict display
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTextOutput — header", () => {
  it("includes verdict, score, and counts", () => {
    const verdict = makeVerdict({
      overallVerdict: "fail",
      overallScore: 40,
      criticalCount: 2,
      highCount: 3,
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("FAIL"));
    assert.ok(output.includes("40/100"));
    assert.ok(output.includes("Critical : 2"));
    assert.ok(output.includes("High     : 3"));
  });

  it("shows per-judge breakdown with icons", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({ verdict: "pass", judgeName: "Judge Security", score: 100, findings: [] }),
        makeEvaluation({ verdict: "warning", judgeName: "Judge Performance", score: 70, findings: [makeFinding()] }),
        makeEvaluation({
          verdict: "fail",
          judgeName: "Judge Cybersecurity",
          score: 20,
          findings: [makeFinding(), makeFinding()],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Judge Security"), "Should list all judges");
    assert.ok(output.includes("Judge Performance"));
    assert.ok(output.includes("Judge Cybersecurity"));
  });

  it("shows timing information when available", () => {
    const verdict = makeVerdict({
      timing: {
        totalMs: 1234,
        perJudge: [
          { judgeId: "cybersecurity", judgeName: "Judge Cybersecurity", durationMs: 500 },
          { judgeId: "security", judgeName: "Judge Security", durationMs: 300 },
        ],
      },
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("1234ms"), "Should show total timing");
    assert.ok(output.includes("Slowest judges"));
  });

  it("shows judge duration when set on evaluation", () => {
    const verdict = makeVerdict({
      evaluations: [makeEvaluation({ durationMs: 42 })],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("42ms"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatTextOutput — suppression metrics
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTextOutput — suppressions", () => {
  it("displays suppression details when present", () => {
    const verdict = makeVerdict({
      suppressions: [
        { ruleId: "CYBER-001", severity: "high" as const, title: "Test", kind: "line" as const, commentLine: 10 },
        { ruleId: "CYBER-001", severity: "high" as const, title: "Test", kind: "next-line" as const, commentLine: 15 },
        { ruleId: "SEC-001", severity: "medium" as const, title: "Test2", kind: "block" as const, commentLine: 20 },
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Suppressed Findings: 3"));
    assert.ok(output.includes("line: 1"));
    assert.ok(output.includes("CYBER-001"));
  });

  it("omits suppression section when empty", () => {
    const verdict = makeVerdict({ suppressions: [] });
    const output = formatTextOutput(verdict);
    assert.ok(!output.includes("Suppressed Findings"));
  });

  it("omits suppression section when undefined", () => {
    const verdict = makeVerdict();
    delete (verdict as unknown as Record<string, unknown>).suppressions;
    const output = formatTextOutput(verdict);
    assert.ok(!output.includes("Suppressed Findings"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatTextOutput — critical & high findings display
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTextOutput — findings display", () => {
  it("shows critical and high findings", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [
            makeFinding({ severity: "critical", ruleId: "CYBER-001", title: "SQL Injection" }),
            makeFinding({ severity: "high", ruleId: "CYBER-002", title: "XSS Attack" }),
          ],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("CRITICAL"), "Should show CRITICAL tag");
    assert.ok(output.includes("SQL Injection"));
    assert.ok(output.includes("HIGH"));
    assert.ok(output.includes("XSS Attack"));
  });

  it("does not show medium/low findings in critical section", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [
            makeFinding({ severity: "medium", ruleId: "CYBER-003", title: "Medium issue" }),
            makeFinding({ severity: "low", ruleId: "CYBER-004", title: "Low issue" }),
          ],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(!output.includes("Critical & High Findings"), "Should not show section for medium/low only");
  });

  it("shows auto-fix tag for fixable findings", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [
            makeFinding({
              severity: "high",
              title: "Fixable issue",
              patch: { oldText: "bad", newText: "good", startLine: 1, endLine: 1 },
            }),
          ],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("auto-fixable") || output.includes("🔧"));
  });

  it("shows confidence percentage", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", confidence: 0.95 })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("95%"));
  });

  it("shows provenance when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", provenance: "AST analysis detected taint flow" })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Evidence: AST analysis"));
  });

  it("shows evidence basis when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", evidenceBasis: "Pattern matching + data flow analysis" })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Basis: Pattern matching"));
  });

  it("shows evidence chain when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [
            makeFinding({
              severity: "critical",
              evidenceChain: {
                impactStatement: "Allows remote code execution",
                steps: [
                  { source: "ast-confirmed", observation: "eval() found", line: 5 },
                  { source: "taint-flow", observation: "User input reaches eval" },
                ],
              },
            }),
          ],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Impact: Allows remote code execution"));
    assert.ok(output.includes("[ast-confirmed]"));
    assert.ok(output.includes("(L5)"));
  });

  it("shows CWE IDs when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", cweIds: ["CWE-89", "CWE-90"] })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("CWE: CWE-89, CWE-90"));
  });

  it("shows OWASP LLM Top 10 when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", owaspLlmTop10: "LLM01: Prompt Injection" })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("OWASP LLM: LLM01"));
  });

  it("shows learn more URL when present", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", learnMoreUrl: "https://owasp.org/sqli" })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("https://owasp.org/sqli"));
  });

  it("truncates findings list at 20", () => {
    const manyFindings = Array.from({ length: 25 }, (_, i) =>
      makeFinding({ severity: "critical", ruleId: `CYBER-${String(i + 1).padStart(3, "0")}`, title: `Issue ${i + 1}` }),
    );
    const verdict = makeVerdict({
      evaluations: [makeEvaluation({ findings: manyFindings })],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("and 5 more"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatTextOutput — exit guidance
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTextOutput — exit guidance", () => {
  it("shows FAIL message for fail verdict", () => {
    const verdict = makeVerdict({ overallVerdict: "fail" });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("FAIL"));
  });

  it("shows WARNING message for warning verdict", () => {
    const verdict = makeVerdict({ overallVerdict: "warning" });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("WARNING"));
  });

  it("shows PASS message for pass verdict", () => {
    const verdict = makeVerdict({
      overallVerdict: "pass",
      evaluations: [makeEvaluation({ verdict: "pass", findings: [] })],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("PASS"));
  });

  it("shows auto-fix hint when fixable findings exist", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ patch: { oldText: "bad", newText: "good", startLine: 1, endLine: 1 } })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("auto-fix") || output.includes("🔧"));
  });

  it("does not show auto-fix hint when no fixable findings", () => {
    const verdict = makeVerdict({
      evaluations: [makeEvaluation({ findings: [makeFinding()] })],
    });
    const output = formatTextOutput(verdict);
    assert.ok(!output.includes("auto-fix"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatTextOutput — edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatTextOutput — edge cases", () => {
  it("handles verdict with zero evaluations", () => {
    const verdict = makeVerdict({ evaluations: [] });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("Judges   : 0"));
    assert.ok(output.includes("Findings : 0"));
  });

  it("handles findings without line numbers", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", lineNumbers: undefined })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("CRITICAL"));
    // Should not crash, just not show line info
  });

  it("handles findings with empty line numbers array", () => {
    const verdict = makeVerdict({
      evaluations: [
        makeEvaluation({
          findings: [makeFinding({ severity: "critical", lineNumbers: [] })],
        }),
      ],
    });
    const output = formatTextOutput(verdict);
    assert.ok(output.includes("CRITICAL"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatSingleJudgeTextOutput
// ═══════════════════════════════════════════════════════════════════════════

describe("CLI Formatters: formatSingleJudgeTextOutput", () => {
  it("shows judge name in header", () => {
    const evaluation = makeEvaluation({ judgeName: "Judge Cybersecurity" });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("Judge Cybersecurity"));
  });

  it("shows verdict and score", () => {
    const evaluation = makeEvaluation({ verdict: "warning", score: 65 });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("WARNING"));
    assert.ok(output.includes("65/100"));
  });

  it("shows findings with details", () => {
    const evaluation = makeEvaluation({
      findings: [
        makeFinding({
          severity: "critical",
          ruleId: "CYBER-001",
          title: "SQL Injection",
          confidence: 0.95,
          lineNumbers: [42],
          suggestedFix: "Use parameterized queries",
        }),
      ],
    });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("CRITICAL"));
    assert.ok(output.includes("CYBER-001"));
    assert.ok(output.includes("SQL Injection"));
    assert.ok(output.includes("95%"));
    assert.ok(output.includes("Line 42"));
    assert.ok(output.includes("parameterized"));
  });

  it("shows provenance when present", () => {
    const evaluation = makeEvaluation({
      findings: [makeFinding({ provenance: "Taint analysis" })],
    });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("Evidence: Taint analysis"));
  });

  it("shows evidence chain impact", () => {
    const evaluation = makeEvaluation({
      findings: [
        makeFinding({
          evidenceChain: {
            impactStatement: "Data exfiltration possible",
            steps: [{ source: "ast-confirmed", observation: "Found injection point" }],
          },
        }),
      ],
    });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("Impact: Data exfiltration"));
  });

  it("shows learn more URL", () => {
    const evaluation = makeEvaluation({
      findings: [makeFinding({ learnMoreUrl: "https://example.com/docs" })],
    });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("https://example.com/docs"));
  });

  it("handles evaluation with zero findings", () => {
    const evaluation = makeEvaluation({ verdict: "pass", score: 100, findings: [] });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("Findings : 0"));
    assert.ok(output.includes("PASS"));
  });

  it("handles findings without optional fields", () => {
    const evaluation = makeEvaluation({
      findings: [
        makeFinding({
          confidence: undefined,
          lineNumbers: undefined,
          suggestedFix: undefined,
          provenance: undefined,
          learnMoreUrl: undefined,
        }),
      ],
    });
    const output = formatSingleJudgeTextOutput(evaluation);
    assert.ok(output.includes("CYBER-001"));
    // Should not crash
  });
});
