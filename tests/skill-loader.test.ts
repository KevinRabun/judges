// ─────────────────────────────────────────────────────────────────────────────
// Skill Loader — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSkillFrontmatter,
  validateSkillFrontmatter,
  parseSkillFile,
  loadSkillDirectory,
  listSkills,
  runSkill,
} from "../src/skill-loader.js";
import { loadJudges, loadAgentJudges } from "../src/judges/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAMPLE_SKILL = `---
id: sample-skill
name: Sample Skill
description: Sample
tags: [alpha, beta]
agents: [cybersecurity, data-security]
priority: 3
---

Body instructions here
`;

describe("parseSkillFrontmatter", () => {
  it("parses YAML frontmatter into meta and body", () => {
    const { meta, body } = parseSkillFrontmatter(SAMPLE_SKILL);
    assert.equal(meta.id, "sample-skill");
    assert.equal(meta.name, "Sample Skill");
    assert.equal(meta.description, "Sample");
    assert.deepEqual(meta.tags, ["alpha", "beta"]);
    assert.deepEqual(meta.agents, ["cybersecurity", "data-security"]);
    assert.ok(body.includes("Body instructions here"));
  });
});

describe("validateSkillFrontmatter", () => {
  it("validates required fields and normalizes arrays", () => {
    const { meta } = parseSkillFrontmatter(SAMPLE_SKILL);
    const fm = validateSkillFrontmatter(meta, "sample.skill.md");
    assert.equal(fm.id, "sample-skill");
    assert.equal(fm.name, "Sample Skill");
    assert.equal(fm.description, "Sample");
    assert.deepEqual(fm.agents, ["cybersecurity", "data-security"]);
    assert.equal(fm.priority, 3);
  });

  it("throws for missing fields", () => {
    const broken = `---\nid: x\n---`; // missing name/description/agents
    const { meta } = parseSkillFrontmatter(broken);
    assert.throws(() => validateSkillFrontmatter(meta, "broken.skill.md"));
  });
});

describe("parseSkillFile", () => {
  it("parses an existing skill file", () => {
    const skillFile = join(__dirname, "..", "skills", "security-review.skill.md");
    const skill = parseSkillFile(skillFile);
    assert.equal(skill.frontmatter.id, "security-review");
    assert.ok(skill.frontmatter.agents.includes("cybersecurity"));
    assert.ok(skill.body.includes("Security Review Skill"));
  });
});

describe("loadSkillDirectory", () => {
  it("loads all skill files", () => {
    const skills = loadSkillDirectory(join(__dirname, "..", "skills"));
    const ids = skills.map((s) => s.frontmatter.id);
    assert.ok(ids.includes("ai-code-review"));
    assert.ok(ids.includes("security-review"));
    assert.ok(ids.includes("release-gate"));
  });

  it("lists skills with metadata", () => {
    const skills = listSkills(join(__dirname, "..", "skills"));
    const ids = skills.map((s) => s.id);
    assert.ok(ids.includes("ai-code-review"));
    const ai = skills.find((s) => s.id === "ai-code-review")!;
    assert.ok(ai.agents.length > 0);
  });
});

describe("runSkill", () => {
  it("runs a skill against sample code using registered judges", async () => {
    await loadJudges(); // ensures registry available
    loadAgentJudges(); // ensure agent files loaded

    const code =
      `const name = "World"; function hello(n){ return ` +
      "`" +
      `Hello ${"${"}n${"}"}` +
      "`" +
      `; } console.log(hello(name));`;
    const verdict = await runSkill("ai-code-review", code, "javascript", { context: { source: "unit-test" } });
    assert.ok(verdict); // basic sanity
    const maybeEvaluations = (verdict as { judgeEvaluations?: unknown }).judgeEvaluations;
    assert.ok(Array.isArray(maybeEvaluations ?? []));
  });
});
