// ─────────────────────────────────────────────────────────────────────────────
// Documentation Claims Verification Tests
// ─────────────────────────────────────────────────────────────────────────────
// These tests validate that claims made in README.md, docs/api-reference.md,
// docs/jetbrains-setup.md, and other documentation files match the actual
// functionality. If a test fails, the corresponding documentation needs to be
// updated to match reality.
//
// Usage:
//   npx tsx --test tests/documentation-claims.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ─── Judge Count & IDs ──────────────────────────────────────────────────────

describe("Documentation: Judge claims", () => {
  it("has exactly 45 judges registered", async () => {
    const { JUDGES } = await import("../src/judges/index.js");
    assert.equal(
      JUDGES.length,
      45,
      `README claims 45 judges but found ${JUDGES.length}. Update documentation if this changes.`,
    );
  });

  it("all 45 judge .judge.md agent files exist", () => {
    const agentsDir = resolve(ROOT, "agents");
    const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith(".judge.md"));
    assert.equal(
      agentFiles.length,
      45,
      `Expected 45 .judge.md agent files but found ${agentFiles.length}. Update documentation if judges are added/removed.`,
    );
  });

  it("all 45 judge static imports exist in judges/index.ts", () => {
    const indexSrc = readFileSync(resolve(ROOT, "src", "judges", "index.ts"), "utf-8");
    const imports = indexSrc.match(/^import "\.\/([\w-]+)\.js";/gm) ?? [];
    assert.equal(
      imports.length,
      45,
      `Expected 45 judge side-effect imports but found ${imports.length}. Update documentation if judges change.`,
    );
  });

  it("all documented judge IDs resolve via getJudge()", async () => {
    const { JUDGES, getJudge } = await import("../src/judges/index.js");
    const expectedIds = [
      "accessibility",
      "agent-instructions",
      "ai-code-safety",
      "api-contract",
      "api-design",
      "authentication",
      "backwards-compatibility",
      "caching",
      "ci-cd",
      "cloud-readiness",
      "code-structure",
      "compliance",
      "concurrency",
      "configuration-management",
      "cost-effectiveness",
      "cybersecurity",
      "data-security",
      "data-sovereignty",
      "database",
      "dependency-health",
      "documentation",
      "error-handling",
      "ethics-bias",
      "false-positive-review",
      "framework-safety",
      "hallucination-detection",
      "iac-security",
      "intent-alignment",
      "internationalization",
      "logging-privacy",
      "logic-review",
      "maintainability",
      "model-fingerprint",
      "multi-turn-coherence",
      "observability",
      "over-engineering",
      "performance",
      "portability",
      "rate-limiting",
      "reliability",
      "scalability",
      "security",
      "software-practices",
      "testing",
      "ux",
    ];

    assert.equal(expectedIds.length, 45, "Expected IDs list should have 45 entries");

    const registeredIds = JUDGES.map((j: { id: string }) => j.id).sort();
    assert.deepEqual(
      registeredIds,
      [...expectedIds].sort(),
      "Registered judge IDs don't match documented IDs. Update README and docs if judges are added/removed.",
    );

    for (const id of expectedIds) {
      const judge = getJudge(id);
      assert.ok(judge, `getJudge("${id}") returned undefined — judge is documented but not registered`);
    }
  });
});

// ─── Preset Count & Names ───────────────────────────────────────────────────

describe("Documentation: Preset claims", () => {
  it("has exactly 22 presets defined", async () => {
    const { PRESETS } = await import("../src/presets.js");
    const presetCount = Object.keys(PRESETS).length;
    assert.equal(
      presetCount,
      22,
      `Documentation claims 22 presets but found ${presetCount}. Update documentation if presets change.`,
    );
  });

  it("all documented preset names exist", async () => {
    const { getPreset } = await import("../src/presets.js");
    const expectedPresets = [
      "strict",
      "lenient",
      "security-only",
      "startup",
      "compliance",
      "performance",
      "react",
      "express",
      "fastapi",
      "django",
      "spring-boot",
      "rails",
      "nextjs",
      "terraform",
      "kubernetes",
      "onboarding",
      "fintech",
      "healthtech",
      "saas",
      "open-source",
      "government",
      "ai-review",
    ];

    for (const name of expectedPresets) {
      const preset = getPreset(name);
      assert.ok(preset, `getPreset("${name}") returned undefined — preset is documented but not defined`);
    }
  });

  it("listPresets() returns all presets", async () => {
    const { listPresets, PRESETS } = await import("../src/presets.js");
    const listed = listPresets();
    assert.equal(
      listed.length,
      Object.keys(PRESETS).length,
      "listPresets() should return one entry per preset in PRESETS",
    );
  });

  it("composePresets() is functional", async () => {
    const { composePresets } = await import("../src/presets.js");
    const composed = composePresets(["security-only", "performance"]);
    assert.ok(composed, "composePresets should return a composed preset");
    assert.ok(composed.config, "Composed preset should have a config property");
  });
});

// ─── Patch Rule Count ───────────────────────────────────────────────────────

describe("Documentation: Patch rules", () => {
  it("has 200+ auto-fix patch rules", () => {
    const patchSrc = readFileSync(resolve(ROOT, "src", "patches", "index.ts"), "utf-8");
    // Each patch rule has a `generate:` function
    const generateMatches = patchSrc.match(/generate:/g) ?? [];
    // Subtract 1 for the type definition's `generate:` property
    const patchCount = generateMatches.length - 1;
    assert.ok(
      patchCount >= 200,
      `README claims "200+" patch rules but found ${patchCount}. Update documentation if this changes.`,
    );
  });
});

// ─── MCP Tool Count ─────────────────────────────────────────────────────────

describe("Documentation: MCP tool count", () => {
  it("has 29 MCP tools registered", () => {
    const toolsDir = resolve(ROOT, "src", "tools");
    const registerFiles = readdirSync(toolsDir).filter((f) => f.startsWith("register-") && f.endsWith(".ts"));
    let totalTools = 0;

    for (const file of registerFiles) {
      const content = readFileSync(resolve(toolsDir, file), "utf-8");
      const matches = content.match(/server\.tool\(/g) ?? [];
      totalTools += matches.length;
    }

    assert.equal(
      totalTools,
      29,
      `Documentation claims 29 MCP tools but found ${totalTools}. Update docs/jetbrains-setup.md if this changes.`,
    );
  });
});

// ─── Formatter Count ────────────────────────────────────────────────────────

describe("Documentation: Formatters", () => {
  it("has 9 formatter files", () => {
    const formattersDir = resolve(ROOT, "src", "formatters");
    const formatterFiles = readdirSync(formattersDir).filter((f) => f.endsWith(".ts"));
    assert.equal(
      formatterFiles.length,
      9,
      `Expected 9 formatter files but found ${formatterFiles.length}. Update documentation if formatters change.`,
    );
  });

  it("all documented formatters exist", () => {
    const formattersDir = resolve(ROOT, "src", "formatters");
    const expected = [
      "badge.ts",
      "codeclimate.ts",
      "csv.ts",
      "diagnostics.ts",
      "github-actions.ts",
      "html.ts",
      "junit.ts",
      "pdf.ts",
      "sarif.ts",
    ];
    for (const file of expected) {
      assert.ok(existsSync(resolve(formattersDir, file)), `Expected formatter file ${file} not found`);
    }
  });
});

// ─── API Exports ────────────────────────────────────────────────────────────

describe("Documentation: API exports from src/api.ts", () => {
  it("exports evaluateCode convenience wrapper", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateCode, "function");
  });

  it("exports evaluateCodeSingleJudge convenience wrapper", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateCodeSingleJudge, "function");
  });

  it("exports evaluateProject", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateProject, "function");
  });

  it("exports evaluateDiff", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateDiff, "function");
  });

  it("exports analyzeDependencies", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.analyzeDependencies, "function");
  });

  it("exports listPresets", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.listPresets, "function");
  });

  it("exports crossFileDedup", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.crossFileDedup, "function");
  });

  it("exports loadConfigFile", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.loadConfigFile, "function");
  });

  it("exports expandEnvPlaceholders", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.expandEnvPlaceholders, "function");
  });

  it("exports validateJudgeDefinition", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.validateJudgeDefinition, "function");
  });

  it("exports isValidJudgeDefinition (alias)", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.isValidJudgeDefinition, "function");
  });

  it("exports getPreset", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.getPreset, "function");
  });

  it("exports PRESETS record", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.PRESETS, "object");
  });

  it("exports JUDGES array", async () => {
    const api = await import("../src/api.js");
    assert.ok(Array.isArray(api.JUDGES));
  });

  it("exports getJudge", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.getJudge, "function");
  });

  it("exports parseConfig", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.parseConfig, "function");
  });

  it("exports defaultConfig", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.defaultConfig, "function");
  });

  it("exports enrichWithPatches", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.enrichWithPatches, "function");
  });

  it("exports crossEvaluatorDedup", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.crossEvaluatorDedup, "function");
  });

  it("exports evaluateCodeV2", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateCodeV2, "function");
  });

  it("exports evaluateProjectV2", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateProjectV2, "function");
  });

  // Plugin API exports
  it("exports registerPlugin", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.registerPlugin, "function");
  });

  it("exports unregisterPlugin", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.unregisterPlugin, "function");
  });

  it("exports getRegisteredPlugins", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.getRegisteredPlugins, "function");
  });

  it("exports evaluateCustomRules", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateCustomRules, "function");
  });

  // Formatter exports
  it("exports findingsToSarif", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.findingsToSarif, "function");
  });

  it("exports verdictToGitHubActions", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.verdictToGitHubActions, "function");
  });

  it("exports findingsToDiagnostics", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.findingsToDiagnostics, "function");
  });

  // Fingerprinting
  it("exports fingerprintCode", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.fingerprintCode, "function");
  });

  // Calibration
  it("exports buildCalibrationProfile", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.buildCalibrationProfile, "function");
  });

  // Streaming API
  it("exports evaluateFilesStream", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateFilesStream, "function");
  });

  // Review conversation
  it("exports startReviewConversation", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.startReviewConversation, "function");
  });

  // A2A Protocol
  it("exports getAgentCard", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.getAgentCard, "function");
  });

  // Escalation
  it("exports evaluateEscalations", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateEscalations, "function");
  });

  // Audit Trail
  it("exports appendAuditEvent", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.appendAuditEvent, "function");
  });

  // SAST
  it("exports registerSastProvider", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.registerSastProvider, "function");
  });

  // Evaluation session
  it("exports EvaluationSession", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.EvaluationSession, "function");
  });

  // Adaptive judge selection
  it("exports selectJudges", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.selectJudges, "function");
  });
});

// ─── Package Exports Map ────────────────────────────────────────────────────

describe("Documentation: package.json exports map", () => {
  it("has the documented export paths", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    const exports = pkg.exports ?? {};
    const documentedPaths = [
      ".",
      "./api",
      "./server",
      "./sarif",
      "./junit",
      "./codeclimate",
      "./badge",
      "./diagnostics",
      "./plugins",
      "./fingerprint",
      "./comparison",
    ];

    for (const path of documentedPaths) {
      assert.ok(exports[path] !== undefined, `Expected package.json to export "${path}" but it was not found`);
    }
  });
});

// ─── CLI Format Types ───────────────────────────────────────────────────────

describe("Documentation: CLI format types", () => {
  it("cli.ts defines all documented format options", () => {
    // Read the CLI source to verify format type definitions
    const cliPath = resolve(ROOT, "src", "cli.ts");
    if (existsSync(cliPath)) {
      const cliSrc = readFileSync(cliPath, "utf-8");
      const expectedFormats = [
        "text",
        "json",
        "sarif",
        "markdown",
        "html",
        "pdf",
        "junit",
        "codeclimate",
        "github-actions",
      ];
      for (const fmt of expectedFormats) {
        assert.ok(
          cliSrc.includes(`"${fmt}"`),
          `CLI source should reference format "${fmt}" — update documentation if format options change`,
        );
      }
    }
  });
});

// ─── README Specific Claims ─────────────────────────────────────────────────

describe("Documentation: README claims consistency", () => {
  const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");

  it("README references 45 dimensions", () => {
    assert.ok(
      readme.includes("45 dimensions") || readme.includes("45-dimension"),
      'README should reference "45 dimensions" to match the 45 registered judges',
    );
  });

  it("README references 200+ patch rules", () => {
    assert.ok(
      readme.includes("200+") || readme.includes("200 "),
      'README should reference "200+" auto-fix patch rules',
    );
  });
});
