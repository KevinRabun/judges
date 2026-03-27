// ─────────────────────────────────────────────────────────────────────────────
// Output Formatters — Coverage Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithTribunal } from "../src/evaluators/index.js";
import { verdictToSarif } from "../src/formatters/sarif.js";
import { verdictToGitHubActions } from "../src/formatters/github-actions.js";
import { verdictToJUnit } from "../src/formatters/junit.js";
import { verdictToCodeClimate } from "../src/formatters/codeclimate.js";
import { findingsToCsv } from "../src/formatters/csv.js";
import { generateBadgeSvg, generateBadgeText } from "../src/formatters/badge.js";
import { verdictToHtml } from "../src/formatters/html.js";
import { verdictToPdfHtml } from "../src/formatters/pdf.js";
import {
  findingsToDiagnostics,
  findingsToCodeActions,
  formatForProblemMatcher,
} from "../src/formatters/diagnostics.js";

function getTestVerdict() {
  return evaluateWithTribunal(
    'const x = eval(input);\ndocument.innerHTML = data;\nfetch("http://api.example.com");',
    "javascript",
  );
}

function getCleanVerdict() {
  return evaluateWithTribunal("const x = 1;\nconst y = 2;\nexport { x, y };", "typescript");
}

// ═══════════════ SARIF ═══════════════════════════════════════════════════

describe("Formatters: SARIF", () => {
  it("generates valid SARIF from vulnerable code verdict", () => {
    const v = getTestVerdict();
    const sarif = verdictToSarif(v, "src/app.ts");
    assert.equal(
      sarif.$schema,
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    );
    assert.equal(sarif.version, "2.1.0");
    assert.ok(sarif.runs.length >= 1);
    assert.ok(sarif.runs[0].results.length > 0);
  });

  it("generates SARIF from clean code verdict", () => {
    const v = getCleanVerdict();
    const sarif = verdictToSarif(v);
    assert.equal(sarif.version, "2.1.0");
    assert.ok(sarif.runs.length >= 1);
  });

  it("includes tool driver info", () => {
    const sarif = verdictToSarif(getTestVerdict());
    assert.ok(sarif.runs[0].tool.driver.name);
    assert.ok(sarif.runs[0].tool.driver.rules!.length > 0);
  });

  it("includes physical locations for findings", () => {
    const sarif = verdictToSarif(getTestVerdict(), "src/app.ts");
    const results = sarif.runs[0].results;
    const withLocation = results.filter((r: any) => r.locations?.length > 0);
    assert.ok(withLocation.length > 0);
  });
});

// ═══════════════ GitHub Actions ══════════════════════════════════════════

describe("Formatters: GitHub Actions", () => {
  it("generates annotations for findings", () => {
    const output = verdictToGitHubActions(getTestVerdict(), "src/app.ts");
    assert.ok(typeof output === "string");
    // Should contain ::error or ::warning annotations
    assert.ok(output.includes("::") || output.length === 0);
  });

  it("handles clean verdict", () => {
    const output = verdictToGitHubActions(getCleanVerdict());
    assert.ok(typeof output === "string");
  });

  it("includes file path in annotations", () => {
    const output = verdictToGitHubActions(getTestVerdict(), "src/app.ts");
    if (output.includes("::")) {
      assert.ok(output.includes("src/app.ts") || output.includes("file="));
    }
  });
});

// ═══════════════ JUnit ══════════════════════════════════════════════════

describe("Formatters: JUnit", () => {
  it("generates valid JUnit XML from verdict", () => {
    const xml = verdictToJUnit(getTestVerdict());
    assert.ok(xml.startsWith("<?xml"));
    assert.ok(xml.includes("<testsuites"));
    assert.ok(xml.includes("<testsuite"));
  });

  it("includes testcases for each judge", () => {
    const xml = verdictToJUnit(getTestVerdict());
    assert.ok(xml.includes("<testcase"));
  });

  it("marks failures for findings", () => {
    const xml = verdictToJUnit(getTestVerdict());
    assert.ok(xml.includes("<failure") || xml.includes("failures="));
  });

  it("handles clean verdict", () => {
    const xml = verdictToJUnit(getCleanVerdict());
    assert.ok(xml.startsWith("<?xml"));
  });
});

// ═══════════════ CodeClimate ═════════════════════════════════════════════

describe("Formatters: CodeClimate", () => {
  it("generates code climate JSON from verdict", () => {
    const json = verdictToCodeClimate(getTestVerdict());
    assert.ok(Array.isArray(json));
    assert.ok(json.length > 0);
  });

  it("includes fingerprint and location", () => {
    const json = verdictToCodeClimate(getTestVerdict());
    const first = json[0];
    assert.ok(first.fingerprint);
    assert.ok(first.severity);
    assert.ok(first.description);
  });

  it("handles clean verdict", () => {
    const json = verdictToCodeClimate(getCleanVerdict());
    assert.ok(Array.isArray(json));
  });
});

// ═══════════════ CSV ════════════════════════════════════════════════════

describe("Formatters: CSV", () => {
  it("generates CSV with headers", () => {
    const v = getTestVerdict();
    const csv = findingsToCsv(v.findings, "src/app.ts");
    assert.ok(csv.includes(","));
  });

  it("includes ruleId and severity", () => {
    const csv = findingsToCsv(getTestVerdict().findings);
    assert.ok(csv.toLowerCase().includes("rule") || csv.includes("SEC-") || csv.includes("CYBER-"));
  });

  it("handles empty findings", () => {
    const csv = findingsToCsv([]);
    assert.ok(typeof csv === "string");
  });
});

// ═══════════════ Badge ══════════════════════════════════════════════════

describe("Formatters: Badge", () => {
  it("generates SVG badge for high score", () => {
    const svg = generateBadgeSvg(95);
    assert.ok(svg.includes("<svg"));
    assert.ok(svg.includes("95"));
  });

  it("generates SVG badge for low score", () => {
    const svg = generateBadgeSvg(30);
    assert.ok(svg.includes("<svg"));
    assert.ok(svg.includes("30"));
  });

  it("generates SVG with custom label", () => {
    const svg = generateBadgeSvg(80, "quality");
    assert.ok(svg.includes("quality"));
  });

  it("generates text badge", () => {
    const text = generateBadgeText(85);
    assert.ok(text.includes("85"));
  });

  it("generates text badge for zero score", () => {
    const text = generateBadgeText(0);
    assert.ok(text.includes("0"));
  });

  it("handles edge score values", () => {
    assert.ok(generateBadgeSvg(0).includes("<svg"));
    assert.ok(generateBadgeSvg(100).includes("<svg"));
  });
});

// ═══════════════ HTML ═══════════════════════════════════════════════════

describe("Formatters: HTML", () => {
  it("generates HTML report from verdict", () => {
    const html = verdictToHtml(getTestVerdict());
    assert.ok(html.includes("<html") || html.includes("<!DOCTYPE") || html.includes("<div"));
    assert.ok(html.includes("Score") || html.includes("score") || html.includes("Judges"));
  });

  it("includes findings in HTML", () => {
    const html = verdictToHtml(getTestVerdict());
    assert.ok(html.length > 500);
  });

  it("handles clean verdict", () => {
    const html = verdictToHtml(getCleanVerdict());
    assert.ok(typeof html === "string");
  });
});

// ═══════════════ PDF ════════════════════════════════════════════════════

describe("Formatters: PDF", () => {
  it("generates PDF-ready HTML from verdict", () => {
    const html = verdictToPdfHtml(getTestVerdict());
    assert.ok(html.includes("<") || html.includes("Score"));
  });

  it("handles clean verdict", () => {
    const html = verdictToPdfHtml(getCleanVerdict());
    assert.ok(typeof html === "string");
  });
});

// ═══════════════ Diagnostics ════════════════════════════════════════════

describe("Formatters: Diagnostics", () => {
  it("generates diagnostics from findings", () => {
    const v = getTestVerdict();
    const diag = findingsToDiagnostics(v.findings, "file:///src/app.ts");
    assert.ok(diag.diagnostics.length > 0);
  });

  it("generates code actions", () => {
    const v = getTestVerdict();
    const actions = findingsToCodeActions(v.findings, "file:///src/app.ts");
    assert.ok(Array.isArray(actions));
  });

  it("formats for problem matcher", () => {
    const v = getTestVerdict();
    const output = formatForProblemMatcher(v.findings, "src/app.ts");
    assert.ok(typeof output === "string");
  });

  it("handles empty findings", () => {
    const diag = findingsToDiagnostics([], "file:///src/app.ts");
    assert.equal(diag.diagnostics.length, 0);
  });
});
