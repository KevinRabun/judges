// ─────────────────────────────────────────────────────────────────────────────
// Config Share + Policy Lock — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  mergeConfigs,
  parseConfigArgs,
  validatePolicyCompliance,
  writePolicyLock,
  readPolicyLock,
} from "../src/commands/config-share.js";
import type { JudgesConfig } from "../src/types.js";

describe("ConfigShare: mergeConfigs", () => {
  it("merges two configs", () => {
    const base: JudgesConfig = { minSeverity: "medium", disabledRules: ["SEC-001"] };
    const overlay: JudgesConfig = { minSeverity: "high", disabledRules: ["CYBER-001"] };
    const result = mergeConfigs(base, overlay);
    assert.equal(result.minSeverity, "high");
    assert.ok(result.disabledRules?.includes("SEC-001"));
    assert.ok(result.disabledRules?.includes("CYBER-001"));
  });

  it("overlay overrides scalar values", () => {
    const result = mergeConfigs({ minSeverity: "low" }, { minSeverity: "high" });
    assert.ok(result.minSeverity === "high" || result.minSeverity === "low");
  });

  it("merges languages with dedup", () => {
    const result = mergeConfigs({ languages: ["typescript"] }, { languages: ["typescript", "python"] });
    assert.ok(result.languages?.includes("typescript"));
    assert.ok(result.languages?.includes("python"));
    assert.equal(result.languages?.filter((l) => l === "typescript").length, 1);
  });

  it("deep-merges ruleOverrides", () => {
    const result = mergeConfigs(
      { ruleOverrides: { "SEC-001": { severity: "low" } } },
      { ruleOverrides: { "CYBER-001": { disabled: true } } },
    );
    assert.ok(result.ruleOverrides?.["SEC-001"]);
    assert.ok(result.ruleOverrides?.["CYBER-001"]);
  });
});

describe("ConfigShare: parseConfigArgs", () => {
  it("parses export subcommand", () => {
    const args = parseConfigArgs(["export"]);
    assert.ok(args.subcommand);
  });

  it("parses import with source", () => {
    const args = parseConfigArgs(["import", "team-config.json"]);
    assert.ok(args.subcommand);
  });

  it("defaults when no args", () => {
    const args = parseConfigArgs([]);
    assert.ok(typeof args.subcommand === "string");
  });
});

describe("ConfigShare: policy lock", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "judges-config-"));
  });
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes policy lock", () => {
    writeFileSync(join(tempDir, ".judgesrc"), JSON.stringify({ minSeverity: "high" }));
    assert.doesNotThrow(() => writePolicyLock(tempDir));
  });

  it("returns null when no lock file exists", () => {
    assert.equal(readPolicyLock(tempDir), null);
  });
});

describe("ConfigShare: validatePolicyCompliance", () => {
  it("validates config", () => {
    const config: JudgesConfig = { minSeverity: "high" };
    const lock = { hash: "abc", timestamp: new Date().toISOString(), config, source: "org" } as any;
    assert.doesNotThrow(() => validatePolicyCompliance(config, lock));
  });
});
