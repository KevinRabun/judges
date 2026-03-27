// ─────────────────────────────────────────────────────────────────────────────
// SAST Integration — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerSastProvider,
  getSastProvider,
  listSastProviders,
  ingestSarifContent,
  mergeSastFindings,
  type SastProvider,
} from "../src/sast-integration.js";
import type { Finding, TribunalVerdict } from "../src/types.js";

const MINIMAL_SARIF = JSON.stringify({
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          name: "TestTool",
          version: "1.0",
          rules: [
            { id: "test-001", shortDescription: { text: "Test Rule" }, defaultConfiguration: { level: "warning" } },
          ],
        },
      },
      results: [
        {
          ruleId: "test-001",
          message: { text: "Found an issue" },
          level: "warning",
          locations: [{ physicalLocation: { artifactLocation: { uri: "src/app.ts" }, region: { startLine: 10 } } }],
        },
      ],
    },
  ],
});

const MULTI_RESULT_SARIF = JSON.stringify({
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          name: "CodeQL",
          version: "2.15",
          rules: [
            { id: "js/xss", shortDescription: { text: "XSS" }, defaultConfiguration: { level: "error" } },
            { id: "js/sql-injection", name: "SQL Injection" },
          ],
        },
      },
      results: [
        {
          ruleId: "js/xss",
          message: { text: "XSS vulnerability" },
          level: "error",
          locations: [
            { physicalLocation: { artifactLocation: { uri: "src/app.ts" }, region: { startLine: 5, endLine: 7 } } },
          ],
        },
        {
          ruleId: "js/sql-injection",
          message: { text: "SQL injection" },
          locations: [{ physicalLocation: { region: { startLine: 20 } } }],
        },
        {
          ruleId: "js/xss",
          message: { text: "Another XSS" },
          level: "error",
          locations: [{ physicalLocation: { artifactLocation: { uri: "src/api.ts" }, region: { startLine: 30 } } }],
          fixes: [{ description: { text: "Use escapeHtml()" } }],
        },
      ],
    },
  ],
});

// ── Provider registration ────────────────────────────────────────────────

describe("SAST: provider registration", () => {
  it("registers and retrieves a custom provider", () => {
    const provider: SastProvider = {
      name: "custom-sast",
      parseSarif: (c) => JSON.parse(c),
      mapRuleId: (id) => `CUSTOM-${id}`,
      mapSeverity: () => "medium",
    };
    registerSastProvider(provider);
    assert.equal(getSastProvider("custom-sast")?.name, "custom-sast");
  });

  it("lists all registered providers", () => {
    const all = listSastProviders();
    assert.ok(all.includes("sarif"), "Should have generic sarif");
    assert.ok(all.includes("codeql"), "Should have codeql");
    assert.ok(all.includes("semgrep"), "Should have semgrep");
  });

  it("returns undefined for unknown provider", () => {
    assert.equal(getSastProvider("nonexistent"), undefined);
  });
});

// ── Default provider mapping ─────────────────────────────────────────────

describe("SAST: default provider mapping", () => {
  it("generic sarif maps rule IDs with SAST- prefix", () => {
    const p = getSastProvider("sarif")!;
    assert.equal(p.mapRuleId("test-001"), "SAST-test-001");
  });

  it("generic sarif maps severity levels", () => {
    const p = getSastProvider("sarif")!;
    assert.equal(p.mapSeverity("error"), "high");
    assert.equal(p.mapSeverity("warning"), "medium");
    assert.equal(p.mapSeverity("note"), "low");
    assert.equal(p.mapSeverity("unknown"), "medium");
  });

  it("codeql maps rule IDs with SAST-CODEQL- prefix", () => {
    const p = getSastProvider("codeql")!;
    assert.equal(p.mapRuleId("js/xss"), "SAST-CODEQL-JS-XSS");
  });

  it("codeql maps error to critical", () => {
    const p = getSastProvider("codeql")!;
    assert.equal(p.mapSeverity("error"), "critical");
    assert.equal(p.mapSeverity("warning"), "high");
    assert.equal(p.mapSeverity("note"), "medium");
  });

  it("semgrep maps rule IDs using last two segments", () => {
    const p = getSastProvider("semgrep")!;
    assert.equal(p.mapRuleId("python.lang.security.audit.exec-detected"), "SAST-SEMGREP-AUDIT-EXEC-DETECTED");
  });

  it("semgrep maps severity levels", () => {
    const p = getSastProvider("semgrep")!;
    assert.equal(p.mapSeverity("error"), "high");
    assert.equal(p.mapSeverity("warning"), "medium");
    assert.equal(p.mapSeverity("note"), "low");
  });
});

// ── SARIF ingestion ──────────────────────────────────────────────────────

describe("SAST: ingestSarifContent", () => {
  it("parses minimal SARIF and returns findings", () => {
    const result = ingestSarifContent(MINIMAL_SARIF);
    assert.equal(result.toolName, "TestTool");
    assert.equal(result.toolVersion, "1.0");
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].ruleId.startsWith("SAST-"));
    assert.equal(result.findings[0].severity, "medium");
    assert.deepEqual(result.findings[0].lineNumbers, [10]);
  });

  it("parses multi-result SARIF with CodeQL provider", () => {
    const result = ingestSarifContent(MULTI_RESULT_SARIF, "codeql");
    assert.equal(result.toolName, "CodeQL");
    assert.equal(result.findings.length, 3);
    assert.ok(result.findings[0].ruleId.startsWith("SAST-CODEQL-"));
    assert.equal(result.findings[0].severity, "critical"); // error → critical for CodeQL
  });

  it("extracts fix suggestions from SARIF", () => {
    const result = ingestSarifContent(MULTI_RESULT_SARIF, "codeql");
    const withFix = result.findings.find((f) => f.recommendation?.includes("escapeHtml"));
    assert.ok(withFix);
  });

  it("handles invalid SARIF gracefully", () => {
    const result = ingestSarifContent("not valid json");
    assert.equal(result.findings.length, 0);
    assert.equal(result.toolName, "unknown");
  });

  it("handles empty SARIF runs", () => {
    const emptySarif = JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "Empty" } }, results: [] }],
    });
    const result = ingestSarifContent(emptySarif);
    assert.equal(result.findings.length, 0);
    assert.equal(result.toolName, "Empty");
  });

  it("returns unknown for unregistered provider", () => {
    const result = ingestSarifContent(MINIMAL_SARIF, "nonexistent-provider");
    assert.equal(result.findings.length, 0);
    assert.equal(result.toolName, "unknown");
  });

  it("sets high confidence on SAST findings", () => {
    const result = ingestSarifContent(MINIMAL_SARIF);
    assert.equal(result.findings[0].confidence, 0.9);
  });

  it("sets provenance from tool name", () => {
    const result = ingestSarifContent(MINIMAL_SARIF);
    assert.ok(result.findings[0].provenance?.includes("sast-"));
  });

  it("handles results without locations", () => {
    const noLocSarif = JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "NoLoc" } }, results: [{ ruleId: "r1", message: { text: "issue" } }] }],
    });
    const result = ingestSarifContent(noLocSarif);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].lineNumbers, undefined);
  });
});

// ── Merge with tribunal verdicts ─────────────────────────────────────────

describe("SAST: mergeSastFindings", () => {
  const baseVerdict: TribunalVerdict = {
    overallVerdict: "warning",
    overallScore: 70,
    summary: "Base verdict",
    criticalCount: 0,
    highCount: 1,
    evaluations: [],
    findings: [{ ruleId: "SEC-001", severity: "high", title: "Existing", description: "desc", lineNumbers: [10] }],
  } as TribunalVerdict;

  it("adds non-overlapping SAST findings", () => {
    const sast: Finding[] = [
      { ruleId: "SAST-001", severity: "medium", title: "New", description: "desc", lineNumbers: [50] },
    ];
    const merged = mergeSastFindings(baseVerdict, sast);
    assert.equal(merged.findings.length, 2);
    assert.ok(merged.summary.includes("SAST Supplement"));
  });

  it("deduplicates overlapping findings by line bucket + severity", () => {
    const sast: Finding[] = [
      { ruleId: "SAST-001", severity: "high", title: "Dupe", description: "desc", lineNumbers: [10] },
    ];
    const merged = mergeSastFindings(baseVerdict, sast);
    // Line 10, bucket 9, severity high matches existing finding
    assert.equal(merged.findings.length, 1); // No new findings added
  });

  it("returns verdict unchanged when no SAST findings", () => {
    const merged = mergeSastFindings(baseVerdict, []);
    assert.equal(merged, baseVerdict);
  });

  it("handles SAST findings without line numbers", () => {
    const sast: Finding[] = [{ ruleId: "SAST-002", severity: "low", title: "NoLine", description: "desc" }];
    const merged = mergeSastFindings(baseVerdict, sast);
    assert.ok(merged.findings.length >= 2);
  });
});
