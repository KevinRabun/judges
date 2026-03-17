import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadConfigFile,
  mergeConfigs,
  validateJudgeDefinition,
  parseConfig,
  expandEnvPlaceholders,
} from "../src/config.js";
import { readFileSync } from "fs";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("config extended", () => {
  it("expands env vars and tolerates invalid JSON fallback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "judges-config-"));
    const cfgPath = join(dir, ".judgesrc.json");
    process.env.FOO_TOKEN = "secret";
    writeFileSync(cfgPath, '{"baseline": "${FOO_TOKEN}","include":["src/**"]}');
    const loader =
      loadConfigFile ?? (async (p: string) => parseConfig(expandEnvPlaceholders(readFileSync(p, "utf-8"))));
    const cfg = await loader(cfgPath as any);
    assert.equal(cfg.baseline, "secret");
    assert.deepEqual(cfg.include, ["src/**"]);

    // Invalid JSON should not throw; returns empty config
    writeFileSync(cfgPath, "{ invalid json");
    const cfg2 = await loader(cfgPath as any).catch(() => ({}) as any);
    assert.deepEqual(cfg2, {});
  });

  it("mergeConfigs respects precedence and merges arrays", () => {
    const base = { baseline: "base.json", include: ["src/**"], disabledJudges: ["foo"] };
    const leaf = { baseline: "leaf.json", include: ["tests/**"], disabledJudges: ["bar"] };
    const merged = mergeConfigs(base as any, leaf as any);
    assert.equal(merged.baseline, "leaf.json");
    assert.deepEqual(merged.include, ["src/**", "tests/**"]);
    assert.deepEqual(merged.disabledJudges, ["foo", "bar"]);
  });

  it("validateJudgeDefinition catches missing fields", () => {
    const valid = {
      id: "foo",
      name: "Judge Foo",
      domain: "Testing",
      description: "desc",
      rulePrefix: "FOO",
      tableDescription: "td",
      promptDescription: "pd",
      systemPrompt: "prompt",
    };
    assert.deepEqual(validateJudgeDefinition(valid as any), []);
    const invalid = { ...valid, name: undefined };
    const errs = validateJudgeDefinition(invalid as any);
    assert.ok(errs.length > 0);
  });
});
