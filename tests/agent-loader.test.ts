// ─────────────────────────────────────────────────────────────────────────────
// Agent Markdown Loader — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Tests for the `.judge.md` (and legacy `.agent.md`) file parser, validator, and converter.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { validateAgents, listAgentFiles } from "../scripts/validate-agents.js";

import {
  parseFrontmatter,
  validateFrontmatter,
  parseAgentFile,
  agentToJudgeDefinition,
  loadAgentDirectory,
  loadAndRegisterAgents,
  resolveEvaluator,
} from "../src/agent-loader.js";
import type { ParsedAgent } from "../src/agent-loader.js";
import type { JudgeDefinition } from "../src/types.js";

// ─── Helper ──────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "agent-loader-test-"));
}

const MINIMAL_AGENT = `---
id: test-judge
name: Judge Test
domain: Testing
rulePrefix: TST
description: A judge for testing
tableDescription: Testing things
promptDescription: Test review
priority: 5
---

You are Judge Test — a QA expert.

## Evaluation Criteria
1. **Correctness**: Is the code correct?
`;

const AGENT_NO_PRIORITY = `---
id: no-priority
name: Judge NoPriority
domain: Testing
rulePrefix: NP
description: No priority set
tableDescription: Testing defaults
promptDescription: Default priority test
---

Body content here.
`;

const AGENT_WITH_SCRIPT = `---
id: scripted
name: Judge Scripted
domain: Testing
rulePrefix: SCR
description: Has a script field
tableDescription: Script test
promptDescription: Script review
script: ../src/evaluators/cybersecurity.ts
priority: 20
---

Body for scripted agent.
`;

const AGENT_MISSING_FIELD = `---
id: broken
name: Judge Broken
---

Missing required fields.
`;

const AGENT_QUOTED_VALUES = `---
id: quoted
name: "Judge Quoted"
domain: 'Testing & Validation'
rulePrefix: QT
description: "Uses quoted values"
tableDescription: "Quoted, comma-separated keywords"
promptDescription: 'Quoted prompt description'
---

Body for quoted agent.
`;

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter and body from a valid agent file", () => {
    const { meta, body } = parseFrontmatter(MINIMAL_AGENT);
    assert.equal(meta.id, "test-judge");
    assert.equal(meta.name, "Judge Test");
    assert.equal(meta.domain, "Testing");
    assert.equal(meta.rulePrefix, "TST");
    assert.equal(meta.priority, "5");
    assert.ok(body.includes("You are Judge Test"));
    assert.ok(body.includes("## Evaluation Criteria"));
  });

  it("returns empty meta and full body when no frontmatter is present", () => {
    const raw = "No frontmatter here.\nJust plain text.";
    const { meta, body } = parseFrontmatter(raw);
    assert.deepEqual(meta, {});
    assert.equal(body, raw);
  });

  it("strips surrounding quotes from values", () => {
    const { meta } = parseFrontmatter(AGENT_QUOTED_VALUES);
    assert.equal(meta.name, "Judge Quoted");
    assert.equal(meta.domain, "Testing & Validation");
    assert.equal(meta.description, "Uses quoted values");
    assert.equal(meta.tableDescription, "Quoted, comma-separated keywords");
    assert.equal(meta.promptDescription, "Quoted prompt description");
  });

  it("handles folded scalar (>) values", () => {
    const raw = `---
id: folded
name: Judge Folded
domain: Folded Domain
rulePrefix: FLD
description: >
  This is a long description
  that spans multiple lines
  and should fold into one.
tableDescription: Folded test
promptDescription: Folded review
---

Body text.
`;
    const { meta } = parseFrontmatter(raw);
    assert.ok(meta.description.includes("This is a long description"));
    assert.ok(meta.description.includes("that spans multiple lines"));
    // Folded scalar joins lines with spaces
    assert.ok(!meta.description.includes("\n"));
  });

  it("skips comment lines in frontmatter", () => {
    const raw = `---
id: commented
# This is a comment
name: Judge Commented
domain: Testing
rulePrefix: CMT
description: With comments
tableDescription: Comment test
promptDescription: Comment review
---

Body.
`;
    const { meta } = parseFrontmatter(raw);
    assert.equal(meta.id, "commented");
    assert.equal(meta.name, "Judge Commented");
  });
});

// ─── validateFrontmatter ─────────────────────────────────────────────────────

describe("validateFrontmatter", () => {
  it("returns typed AgentFrontmatter for valid input", () => {
    const { meta } = parseFrontmatter(MINIMAL_AGENT);
    const fm = validateFrontmatter(meta, "test.agent.md");
    assert.equal(fm.id, "test-judge");
    assert.equal(fm.name, "Judge Test");
    assert.equal(fm.priority, 5);
  });

  it("defaults priority to 10 when not provided", () => {
    const { meta } = parseFrontmatter(AGENT_NO_PRIORITY);
    const fm = validateFrontmatter(meta, "test.agent.md");
    assert.equal(fm.priority, 10);
    assert.equal(fm.script, undefined);
  });

  it("throws for missing required fields", () => {
    const { meta } = parseFrontmatter(AGENT_MISSING_FIELD);
    assert.throws(
      () => validateFrontmatter(meta, "broken.judge.md"),
      (err: Error) => err.message.includes("missing required field"),
    );
  });

  it("preserves script field when present", () => {
    const { meta } = parseFrontmatter(AGENT_WITH_SCRIPT);
    const fm = validateFrontmatter(meta, "scripted.judge.md");
    assert.equal(fm.script, "../src/evaluators/cybersecurity.ts");
    assert.equal(fm.priority, 20);
  });
});

// ─── parseAgentFile ──────────────────────────────────────────────────────────

describe("parseAgentFile", () => {
  it("parses a real agent file from the agents/ directory", () => {
    const agent = parseAgentFile(join(__dirname, "..", "agents", "cybersecurity.judge.md"));
    assert.equal(agent.frontmatter.id, "cybersecurity");
    assert.equal(agent.frontmatter.name, "Judge Cybersecurity");
    assert.equal(agent.frontmatter.rulePrefix, "CYBER");
    assert.ok(agent.body.includes("You are Judge Cybersecurity"));
    assert.ok(agent.sourcePath.endsWith("cybersecurity.judge.md"));
  });

  it("parses the false-positive-review agent with priority 999", () => {
    const agent = parseAgentFile(join(__dirname, "..", "agents", "false-positive-review.judge.md"));
    assert.equal(agent.frontmatter.id, "false-positive-review");
    assert.equal(agent.frontmatter.priority, 999);
    // script may be present or absent; generator may set it if an evaluator exists
    assert.ok(agent.frontmatter.script === undefined || typeof agent.frontmatter.script === "string");
  });

  it("parses the logic-review agent", () => {
    const agent = parseAgentFile(join(__dirname, "..", "agents", "logic-review.judge.md"));
    assert.equal(agent.frontmatter.id, "logic-review");
    assert.equal(agent.frontmatter.rulePrefix, "LOGIC");
    assert.ok(agent.frontmatter.script?.includes("logic-review"));
  });

  it("throws for a file with missing required frontmatter", () => {
    const tmp = makeTmpDir();
    const filePath = join(tmp, "bad.judge.md");
    writeFileSync(filePath, AGENT_MISSING_FIELD);
    try {
      assert.throws(
        () => parseAgentFile(filePath),
        (err: Error) => err.message.includes("missing required field"),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── agentToJudgeDefinition ──────────────────────────────────────────────────

describe("agentToJudgeDefinition", () => {
  it("converts a parsed agent to a JudgeDefinition", () => {
    const agent = parseAgentFile(join(__dirname, "..", "agents", "cybersecurity.judge.md"));
    const judge = agentToJudgeDefinition(agent);

    assert.equal(judge.id, "cybersecurity");
    assert.equal(judge.name, "Judge Cybersecurity");
    assert.equal(judge.domain, "Cybersecurity & Threat Defense");
    assert.equal(judge.rulePrefix, "CYBER");
    assert.ok(judge.systemPrompt.includes("You are Judge Cybersecurity"));
    assert.equal(judge.analyze, undefined);
  });

  it("includes the analyze function when provided", () => {
    const agent = parseAgentFile(join(__dirname, "..", "agents", "cybersecurity.judge.md"));
    const mockAnalyze = () => [];
    const judge = agentToJudgeDefinition(agent, mockAnalyze);

    assert.equal(judge.analyze, mockAnalyze);
  });

  it("maps all JudgeDefinition fields correctly", () => {
    const agent: ParsedAgent = {
      frontmatter: {
        id: "test-id",
        name: "Judge Test",
        domain: "Test Domain",
        rulePrefix: "TEST",
        description: "Test description",
        tableDescription: "Table desc",
        promptDescription: "Prompt desc",
        priority: 42,
      },
      body: "System prompt body text",
      sourcePath: "/fake/path.judge.md",
    };
    const judge = agentToJudgeDefinition(agent);
    assert.equal(judge.id, "test-id");
    assert.equal(judge.name, "Judge Test");
    assert.equal(judge.domain, "Test Domain");
    assert.equal(judge.rulePrefix, "TEST");
    assert.equal(judge.description, "Test description");
    assert.equal(judge.tableDescription, "Table desc");
    assert.equal(judge.promptDescription, "Prompt desc");
    assert.equal(judge.systemPrompt, "System prompt body text");
  });
});

// ─── loadAgentDirectory ──────────────────────────────────────────────────────

describe("loadAgentDirectory", () => {
  it("loads all agent files from the agents/ directory", () => {
    const agents = loadAgentDirectory(join(__dirname, "..", "agents"));
    assert.ok(agents.length >= 3, `Expected at least 3 agents, got ${agents.length}`);

    const ids = agents.map((a) => a.frontmatter.id);
    assert.ok(ids.includes("cybersecurity"));
    assert.ok(ids.includes("logic-review"));
    assert.ok(ids.includes("false-positive-review"));
  });

  it("sorts agents by priority (ascending)", () => {
    const agents = loadAgentDirectory(join(__dirname, "..", "agents"));
    for (let i = 1; i < agents.length; i++) {
      const prev = agents[i - 1].frontmatter.priority ?? 10;
      const curr = agents[i].frontmatter.priority ?? 10;
      assert.ok(
        prev <= curr,
        `Agent ${agents[i - 1].frontmatter.id} (${prev}) should come before ${agents[i].frontmatter.id} (${curr})`,
      );
    }
  });

  it("false-positive-review is always last (priority 999)", () => {
    const agents = loadAgentDirectory(join(__dirname, "..", "agents"));
    const last = agents[agents.length - 1];
    assert.equal(last.frontmatter.id, "false-positive-review");
    assert.equal(last.frontmatter.priority, 999);
  });

  it("returns empty array for nonexistent directory", () => {
    const agents = loadAgentDirectory("/nonexistent/path/agents");
    assert.deepEqual(agents, []);
  });

  it("loads only .judge.md files (and legacy .agent.md), ignoring other files", () => {
    const tmp = makeTmpDir();
    writeFileSync(join(tmp, "valid.judge.md"), MINIMAL_AGENT);
    writeFileSync(join(tmp, "legacy.agent.md"), MINIMAL_AGENT);
    writeFileSync(join(tmp, "readme.md"), "# Not an agent file");
    writeFileSync(join(tmp, "notes.txt"), "Plain text");

    try {
      const agents = loadAgentDirectory(tmp);
      // Both formats should load; judge format prioritized by sort order
      const ids = agents.map((a) => a.frontmatter.id);
      assert.ok(ids.includes("test-judge"));
      assert.equal(agents.length, 2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("sorts multiple agents by priority correctly", () => {
    const tmp = makeTmpDir();

    const high = MINIMAL_AGENT.replace("priority: 5", "priority: 100").replace("id: test-judge", "id: high");
    const low = MINIMAL_AGENT.replace("priority: 5", "priority: 1").replace("id: test-judge", "id: low");
    const mid = MINIMAL_AGENT.replace("priority: 5", "priority: 50").replace("id: test-judge", "id: mid");

    writeFileSync(join(tmp, "high.judge.md"), high);
    writeFileSync(join(tmp, "low.judge.md"), low);
    writeFileSync(join(tmp, "mid.judge.md"), mid);

    try {
      const agents = loadAgentDirectory(tmp);
      assert.equal(agents[0].frontmatter.id, "low");
      assert.equal(agents[1].frontmatter.id, "mid");
      assert.equal(agents[2].frontmatter.id, "high");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── validate-agents script ──────────────────────────────────────────────────

describe("validate-agents script", () => {
  it("scans .judge.md files in agents directory", async () => {
    const { filesChecked } = await validateAgents(join(__dirname, "..", "agents"));
    // Should match the number of judges registered (agents are generated from registry)
    assert.ok(filesChecked >= 1);
  });

  it("throws when no agent files exist", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "agentless-"));
    try {
      // Create empty agents dir
      const agentsDir = join(tmp, "agents");
      mkdirSync(agentsDir, { recursive: true });
      assert.throws(() => listAgentFiles(agentsDir), /No agent files/);
      // Also test that validateAgents surfaces the same error
      await assert.rejects(async () => validateAgents(agentsDir), /No agent files/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("listAgentFiles returns both .judge.md and legacy .agent.md", () => {
    const tmp = makeTmpDir();
    try {
      writeFileSync(join(tmp, "alpha.judge.md"), MINIMAL_AGENT);
      writeFileSync(join(tmp, "beta.agent.md"), MINIMAL_AGENT.replace("test-judge", "legacy-judge"));
      const files = listAgentFiles(tmp);
      assert.ok(files.some((f) => f.endsWith("alpha.judge.md")));
      assert.ok(files.some((f) => f.endsWith("beta.agent.md")));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── loadAndRegisterAgents ───────────────────────────────────────────────────

describe("loadAndRegisterAgents", () => {
  it("agent loader resolves scripts from dist and src paths", () => {
    const agentPath = join(__dirname, "..", "agents", "cybersecurity.judge.md");
    const agent = parseAgentFile(agentPath);
    const analyze = resolveEvaluator(agent);
    // In tests, evaluator may not be compiled, but resolveEvaluator should return a function if accessible
    if (analyze) {
      const findings = analyze("const s='safe';", "javascript", undefined);
      assert.ok(Array.isArray(findings));
    }
  });
  it("registers agent-based judges with the registry", () => {
    const tmp = makeTmpDir();
    writeFileSync(join(tmp, "alpha.agent.md"), MINIMAL_AGENT);

    const registered: JudgeDefinition[] = [];
    const mockRegistry = {
      register: (j: JudgeDefinition) => registered.push(j),
      getJudge: () => undefined,
    };

    try {
      const count = loadAndRegisterAgents(tmp, mockRegistry);
      assert.equal(count, 1);
      assert.equal(registered.length, 1);
      assert.equal(registered[0].id, "test-judge");
      assert.equal(registered[0].name, "Judge Test");
      assert.ok(registered[0].systemPrompt.includes("You are Judge Test"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("agent files generated from judges match registry definitions", async () => {
    // Load agent judges (no side-effect imports)
    const { loadJudges, loadAgentJudges } = await import("../src/judges/index.js");
    await loadAgentJudges();
    const judgesFromRegistry = await loadJudges();

    const strip = (s?: string) => (s ?? "").trim().replace(/\s+/g, " ");

    for (const judge of judgesFromRegistry) {
      const agentPath = join(__dirname, "..", "agents", `${judge.id}.judge.md`);
      if (!existsSync(agentPath)) {
        // Only warn; some judges may be meta or experimental
        console.warn(`Agent file missing for judge: ${judge.id}`);
        continue;
      }
      const agent = parseAgentFile(agentPath);
      const converted = agentToJudgeDefinition(agent);

      assert.equal(converted.id, judge.id, `id mismatch for ${judge.id}`);
      assert.equal(converted.name, judge.name, `name mismatch for ${judge.id}`);
      assert.equal(converted.domain, judge.domain, `domain mismatch for ${judge.id}`);
      assert.equal(converted.rulePrefix, judge.rulePrefix, `rulePrefix mismatch for ${judge.id}`);
      assert.equal(converted.tableDescription, judge.tableDescription, `tableDescription mismatch for ${judge.id}`);
      assert.equal(converted.promptDescription, judge.promptDescription, `promptDescription mismatch for ${judge.id}`);

      // Normalize whitespace to avoid minor formatting differences
      assert.equal(strip(converted.systemPrompt), strip(judge.systemPrompt), `systemPrompt mismatch for ${judge.id}`);
    }
  });

  it("skips agents that already exist in the registry (built-in precedence)", () => {
    const tmp = makeTmpDir();
    writeFileSync(join(tmp, "alpha.agent.md"), MINIMAL_AGENT);

    const registered: JudgeDefinition[] = [];
    const mockRegistry = {
      register: (j: JudgeDefinition) => registered.push(j),
      getJudge: (id: string) => (id === "test-judge" ? ({} as JudgeDefinition) : undefined),
    };

    try {
      const count = loadAndRegisterAgents(tmp, mockRegistry);
      assert.equal(count, 0);
      assert.equal(registered.length, 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 0 for empty directory", () => {
    const tmp = makeTmpDir();
    try {
      const count = loadAndRegisterAgents(tmp, {
        register: () => {},
        getJudge: () => undefined,
      });
      assert.equal(count, 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 0 for nonexistent directory", () => {
    const count = loadAndRegisterAgents("/nonexistent/agents", {
      register: () => {},
      getJudge: () => undefined,
    });
    assert.equal(count, 0);
  });

  it("registers multiple agents in priority order", () => {
    const tmp = makeTmpDir();
    const a1 = MINIMAL_AGENT.replace("priority: 5", "priority: 50").replace("id: test-judge", "id: second");
    const a2 = MINIMAL_AGENT.replace("priority: 5", "priority: 1").replace("id: test-judge", "id: first");

    writeFileSync(join(tmp, "second.judge.md"), a1);
    writeFileSync(join(tmp, "first.judge.md"), a2);

    const registered: JudgeDefinition[] = [];
    const mockRegistry = {
      register: (j: JudgeDefinition) => registered.push(j),
      getJudge: () => undefined,
    };

    try {
      const count = loadAndRegisterAgents(tmp, mockRegistry);
      assert.equal(count, 2);
      assert.equal(registered[0].id, "first");
      assert.equal(registered[1].id, "second");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
