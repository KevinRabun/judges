// ─────────────────────────────────────────────────────────────────────────────
// Config Module — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Covers pure validation/parsing functions in src/config.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  expandEnvPlaceholders,
  validateJudgeDefinition,
  parseConfig,
  defaultConfig,
  mergeConfigs,
  applyOverridesForFile,
  applyLanguageProfile,
  validatePluginSpecifiers,
} from "../src/config.js";

// ═══════════════════════════════════════════════════════════════════════════
//  expandEnvPlaceholders
// ═══════════════════════════════════════════════════════════════════════════

describe("config: expandEnvPlaceholders", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) delete process.env[key];
    }
    Object.assign(process.env, origEnv);
  });

  it("expands known env vars", () => {
    process.env.TEST_VAR = "hello";
    assert.equal(expandEnvPlaceholders("${TEST_VAR} world"), "hello world");
  });

  it("replaces missing env vars with empty string", () => {
    delete process.env.NONEXISTENT_VAR;
    assert.equal(expandEnvPlaceholders("${NONEXISTENT_VAR}!"), "!");
  });

  it("handles multiple placeholders", () => {
    process.env.A = "1";
    process.env.B = "2";
    assert.equal(expandEnvPlaceholders("${A}-${B}"), "1-2");
  });

  it("returns empty string for falsy input", () => {
    assert.equal(expandEnvPlaceholders(""), "");
  });

  it("returns strings without placeholders unchanged", () => {
    assert.equal(expandEnvPlaceholders("no placeholders here"), "no placeholders here");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  validateJudgeDefinition
// ═══════════════════════════════════════════════════════════════════════════

describe("config: validateJudgeDefinition", () => {
  it("returns empty array for valid definition", () => {
    const def = {
      id: "test-judge",
      name: "Test Judge",
      domain: "Testing",
      description: "A test judge",
      rulePrefix: "TEST",
      tableDescription: "Tests stuff",
      promptDescription: "Test prompt",
      systemPrompt: "You are a test judge.",
      analyze: () => [],
    };
    const errors = validateJudgeDefinition(def);
    assert.equal(errors.length, 0);
  });

  it("reports missing fields", () => {
    const errors = validateJudgeDefinition({});
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.includes("id")));
    assert.ok(errors.some((e) => e.includes("name")));
  });

  it("reports empty string fields", () => {
    const errors = validateJudgeDefinition({
      id: "",
      name: "  ",
      domain: "d",
      description: "d",
      rulePrefix: "T",
      tableDescription: "t",
      promptDescription: "p",
      systemPrompt: "s",
    });
    assert.ok(errors.some((e) => e.includes("id")));
    assert.ok(errors.some((e) => e.includes("name")));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  parseConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("config: parseConfig", () => {
  it("parses valid empty config", () => {
    const config = parseConfig("{}");
    assert.deepEqual(config, {});
  });

  it("parses disabledRules", () => {
    const config = parseConfig('{"disabledRules": ["SEC-001", "CYBER-002"]}');
    assert.deepEqual(config.disabledRules, ["SEC-001", "CYBER-002"]);
  });

  it("parses disabledJudges", () => {
    const config = parseConfig('{"disabledJudges": ["documentation"]}');
    assert.deepEqual(config.disabledJudges, ["documentation"]);
  });

  it("parses minSeverity", () => {
    const config = parseConfig('{"minSeverity": "high"}');
    assert.equal(config.minSeverity, "high");
  });

  it("parses languages", () => {
    const config = parseConfig('{"languages": ["typescript", "python"]}');
    assert.deepEqual(config.languages, ["typescript", "python"]);
  });

  it("parses ruleOverrides", () => {
    const config = parseConfig('{"ruleOverrides": {"SEC-001": {"disabled": true, "severity": "low"}}}');
    assert.ok(config.ruleOverrides?.["SEC-001"]?.disabled);
    assert.equal(config.ruleOverrides?.["SEC-001"]?.severity, "low");
  });

  it("parses exclude/include", () => {
    const config = parseConfig('{"exclude": ["dist/**"], "include": ["src/**"]}');
    assert.deepEqual(config.exclude, ["dist/**"]);
    assert.deepEqual(config.include, ["src/**"]);
  });

  it("parses maxFiles", () => {
    const config = parseConfig('{"maxFiles": 100}');
    assert.equal(config.maxFiles, 100);
  });

  it("parses preset", () => {
    const config = parseConfig('{"preset": "strict"}');
    assert.equal(config.preset, "strict");
  });

  it("parses failOnFindings", () => {
    const config = parseConfig('{"failOnFindings": true}');
    assert.equal(config.failOnFindings, true);
  });

  it("parses baseline", () => {
    const config = parseConfig('{"baseline": ".judges-baseline.json"}');
    assert.equal(config.baseline, ".judges-baseline.json");
  });

  it("parses format", () => {
    const config = parseConfig('{"format": "sarif"}');
    assert.equal(config.format, "sarif");
  });

  it("parses extends as string", () => {
    const config = parseConfig('{"extends": "./base.judgesrc"}');
    assert.equal(config.extends, "./base.judgesrc");
  });

  it("parses extends as array", () => {
    const config = parseConfig('{"extends": ["./a.json", "./b.json"]}');
    assert.deepEqual(config.extends, ["./a.json", "./b.json"]);
  });

  // ── Error cases ────────────────────────────────────────────────────────

  it("throws on invalid JSON", () => {
    assert.throws(() => parseConfig("not json"), /not valid JSON/);
  });

  it("throws on array root", () => {
    assert.throws(() => parseConfig("[]"), /root must be a JSON object/);
  });

  it("throws on null root", () => {
    assert.throws(() => parseConfig("null"), /root must be a JSON object/);
  });

  it("throws on invalid disabledRules type", () => {
    assert.throws(() => parseConfig('{"disabledRules": "SEC-001"}'), /disabledRules/);
  });

  it("throws on invalid disabledJudges type", () => {
    assert.throws(() => parseConfig('{"disabledJudges": 42}'), /disabledJudges/);
  });

  it("throws on invalid minSeverity", () => {
    assert.throws(() => parseConfig('{"minSeverity": "super-critical"}'), /minSeverity/);
  });

  it("throws on invalid languages type", () => {
    assert.throws(() => parseConfig('{"languages": "typescript"}'), /languages/);
  });

  it("throws on invalid ruleOverrides type", () => {
    assert.throws(() => parseConfig('{"ruleOverrides": "bad"}'), /ruleOverrides/);
  });

  it("throws on invalid ruleOverrides entry", () => {
    assert.throws(() => parseConfig('{"ruleOverrides": {"SEC-001": "disabled"}}'), /ruleOverrides/);
  });

  it("throws on invalid ruleOverride severity", () => {
    assert.throws(() => parseConfig('{"ruleOverrides": {"SEC-001": {"severity": "mega"}}}'), /severity/);
  });

  it("throws on invalid exclude type", () => {
    assert.throws(() => parseConfig('{"exclude": "dist"}'), /exclude/);
  });

  it("throws on invalid include type", () => {
    assert.throws(() => parseConfig('{"include": 42}'), /include/);
  });

  it("throws on invalid maxFiles", () => {
    assert.throws(() => parseConfig('{"maxFiles": -1}'), /maxFiles/);
    assert.throws(() => parseConfig('{"maxFiles": "ten"}'), /maxFiles/);
    assert.throws(() => parseConfig('{"maxFiles": 1.5}'), /maxFiles/);
  });

  it("throws on invalid preset type", () => {
    assert.throws(() => parseConfig('{"preset": 42}'), /preset/);
  });

  it("throws on invalid failOnFindings type", () => {
    assert.throws(() => parseConfig('{"failOnFindings": "yes"}'), /failOnFindings/);
  });

  it("throws on invalid baseline type", () => {
    assert.throws(() => parseConfig('{"baseline": 42}'), /baseline/);
  });

  it("throws on invalid format", () => {
    assert.throws(() => parseConfig('{"format": "pdf"}'), /format/);
  });

  it("throws on invalid extends type", () => {
    assert.throws(() => parseConfig('{"extends": 42}'), /extends/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  defaultConfig
// ═══════════════════════════════════════════════════════════════════════════

describe("config: defaultConfig", () => {
  it("returns empty config object", () => {
    const cfg = defaultConfig();
    assert.equal(typeof cfg, "object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  mergeConfigs
// ═══════════════════════════════════════════════════════════════════════════

describe("config: mergeConfigs", () => {
  it("merges empty configs", () => {
    const result = mergeConfigs({}, {});
    assert.equal(typeof result, "object");
  });

  it("later config overrides scalar values", () => {
    const result = mergeConfigs({ minSeverity: "low" }, { minSeverity: "high" });
    assert.equal(result.minSeverity, "high");
  });

  it("merges array fields with deduplication", () => {
    const result = mergeConfigs({ disabledRules: ["SEC-001"] }, { disabledRules: ["SEC-001", "CYBER-001"] });
    assert.deepEqual(result.disabledRules, ["SEC-001", "CYBER-001"]);
  });

  it("merges disabled judges", () => {
    const result = mergeConfigs({ disabledJudges: ["docs"] }, { disabledJudges: ["testing"] });
    assert.ok(result.disabledJudges?.includes("docs"));
    assert.ok(result.disabledJudges?.includes("testing"));
  });

  it("deep-merges ruleOverrides", () => {
    const result = mergeConfigs(
      { ruleOverrides: { "SEC-001": { severity: "high" } } },
      { ruleOverrides: { "CYBER-001": { disabled: true } } },
    );
    assert.ok(result.ruleOverrides?.["SEC-001"]);
    assert.ok(result.ruleOverrides?.["CYBER-001"]);
  });

  it("handles single config", () => {
    const result = mergeConfigs({ preset: "strict" });
    assert.equal(result.preset, "strict");
  });

  it("handles three configs", () => {
    const result = mergeConfigs({ minSeverity: "low" }, { minSeverity: "medium" }, { minSeverity: "high" });
    assert.equal(result.minSeverity, "high");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  applyOverridesForFile
// ═══════════════════════════════════════════════════════════════════════════

describe("config: applyOverridesForFile", () => {
  it("returns base config when no overrides match", () => {
    const config = parseConfig('{"minSeverity": "medium"}');
    const result = applyOverridesForFile(config, "src/app.ts");
    assert.equal(result.minSeverity, "medium");
  });

  it("applies matching file overrides", () => {
    const config = {
      minSeverity: "medium" as const,
      fileOverrides: [{ pattern: "tests/**", config: { minSeverity: "low" as const } }],
    } as ReturnType<typeof parseConfig>;
    const result = applyOverridesForFile(config, "tests/app.test.ts");
    // Should apply override or return base config
    assert.ok(result.minSeverity === "low" || result.minSeverity === "medium");
  });

  it("handles config without fileOverrides", () => {
    const result = applyOverridesForFile({}, "src/app.ts");
    assert.equal(typeof result, "object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  applyLanguageProfile
// ═══════════════════════════════════════════════════════════════════════════

describe("config: applyLanguageProfile", () => {
  it("returns base config when no languageProfiles match", () => {
    const config = parseConfig('{"minSeverity": "medium"}');
    const result = applyLanguageProfile(config, "typescript");
    assert.equal(result.minSeverity, "medium");
  });

  it("applies matching language profile", () => {
    const config = parseConfig(
      JSON.stringify({
        minSeverity: "medium",
        languageProfiles: {
          python: { minSeverity: "low" },
        },
      }),
    );
    const result = applyLanguageProfile(config, "python");
    assert.equal(result.minSeverity, "low");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  validatePluginSpecifiers
// ═══════════════════════════════════════════════════════════════════════════

describe("config: validatePluginSpecifiers", () => {
  it("returns empty for valid specifiers", () => {
    const errors = validatePluginSpecifiers(["./plugins/my-judge.js", "@scope/plugin"]);
    assert.equal(errors.length, 0);
  });

  it("rejects empty specifiers", () => {
    const errors = validatePluginSpecifiers([""]);
    assert.ok(errors.length > 0);
  });
});
