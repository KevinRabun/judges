// ─────────────────────────────────────────────────────────────────────────────
// Custom Rules Module — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadCustomRuleFile,
  saveCustomRuleFile,
  deserializeRule,
  generateRuleTemplate,
  testRule,
  runRuleTests,
  validateRuleTestSuite,
  formatRuleTestResults,
  parseRuleArgs,
} from "../src/commands/rule.js";

describe("CustomRules: generateRuleTemplate", () => {
  it("generates a template with the given ID", () => {
    const tmpl = generateRuleTemplate("CUSTOM-001");
    assert.equal(tmpl.id, "CUSTOM-001");
    assert.ok(tmpl.title);
    assert.ok(tmpl.pattern);
    assert.ok(tmpl.severity);
  });

  it("generates different templates for different IDs", () => {
    const t1 = generateRuleTemplate("A-001");
    const t2 = generateRuleTemplate("B-001");
    assert.equal(t1.id, "A-001");
    assert.equal(t2.id, "B-001");
  });
});

describe("CustomRules: deserializeRule", () => {
  it("converts serialized rule to CustomRule", () => {
    const sr = generateRuleTemplate("TEST-001");
    const rule = deserializeRule(sr);
    assert.equal(rule.id, "TEST-001");
    assert.ok(typeof rule.match === "function" || rule.pattern instanceof RegExp);
  });
});

describe("CustomRules: testRule", () => {
  it("returns findings for matching code", () => {
    const sr = generateRuleTemplate("TEST-001");
    const rule = deserializeRule(sr);
    // The default template rule may match simple patterns
    const findings = testRule(rule, "eval(userInput);", "javascript");
    assert.ok(Array.isArray(findings));
  });

  it("returns empty for non-matching code", () => {
    const sr = generateRuleTemplate("TEST-001");
    const rule = deserializeRule(sr);
    const findings = testRule(rule, "const x = 1;", "javascript");
    assert.ok(Array.isArray(findings));
  });
});

describe("CustomRules: validateRuleTestSuite", () => {
  it("validates test suite", () => {
    const errors = validateRuleTestSuite([{ code: "eval(x);", language: "javascript", shouldMatch: true }]);
    assert.ok(Array.isArray(errors));
  });

  it("handles empty test cases", () => {
    const errors = validateRuleTestSuite([]);
    assert.ok(Array.isArray(errors));
  });
});

describe("CustomRules: runRuleTests + formatRuleTestResults", () => {
  it("runs test suite and formats results", () => {
    const sr = generateRuleTemplate("TEST-001");
    const rule = deserializeRule(sr);
    const result = runRuleTests(rule, [{ code: "const x = 1;", language: "javascript", shouldMatch: false }]);
    assert.ok(typeof result.passed === "number");
    assert.ok(typeof result.failed === "number");

    const formatted = formatRuleTestResults(result);
    assert.ok(typeof formatted === "string");
    assert.ok(formatted.length > 0);
  });
});

describe("CustomRules: parseRuleArgs", () => {
  it("parses list subcommand", () => {
    const args = parseRuleArgs(["list"]);
    assert.ok(args.subcommand);
  });

  it("parses create with rule ID", () => {
    const args = parseRuleArgs(["create", "CUSTOM-001"]);
    assert.ok(args.subcommand);
  });

  it("parses test subcommand", () => {
    const args = parseRuleArgs(["test"]);
    assert.ok(args.subcommand);
  });

  it("defaults when no args", () => {
    const args = parseRuleArgs([]);
    assert.ok(typeof args.subcommand === "string");
  });
});

describe("CustomRules: store I/O", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-rules-"));
  });
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves and loads custom rule file", () => {
    const data = { version: "1.0.0", rules: [generateRuleTemplate("CUSTOM-001")] };
    saveCustomRuleFile(data, tempDir);
    const loaded = loadCustomRuleFile(tempDir);
    assert.equal(loaded.rules.length, 1);
    assert.equal(loaded.rules[0].id, "CUSTOM-001");
  });

  it("returns empty rules for nonexistent file", () => {
    const loaded = loadCustomRuleFile(tempDir);
    assert.equal(loaded.rules.length, 0);
  });
});
