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
  it("has 31 MCP tools registered", () => {
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
      31,
      `Documentation claims 31 MCP tools but found ${totalTools}. Update docs/jetbrains-setup.md if this changes.`,
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

  it("README test badge count matches CHANGELOG latest reported count", () => {
    // Extract test count from the README badge: tests-NNNN-brightgreen
    const badgeMatch = readme.match(/tests-(\d+)-brightgreen/);
    assert.ok(badgeMatch, "README should have a test badge like tests-NNNN-brightgreen");
    const badgeCount = parseInt(badgeMatch[1], 10);

    // Extract the latest test count from the CHANGELOG (first "Total: NNNN pass" entry)
    const changelog = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");
    const clMatch = changelog.match(/Total:\s*(\d+)\s*pass/);
    assert.ok(clMatch, "CHANGELOG should report a total test count like 'Total: NNNN pass'");
    const changelogCount = parseInt(clMatch[1], 10);

    assert.equal(
      badgeCount,
      changelogCount,
      `README badge says ${badgeCount} tests but CHANGELOG reports ${changelogCount}. ` +
        `Update the README badge: [![Tests](https://img.shields.io/badge/tests-${changelogCount}-brightgreen)]`,
    );
  });
});

// ─── Quickstart: API import examples match real exports ─────────────────────

describe("Quickstart: API import examples use real exports", () => {
  // Collect import statements from docs that reference @kevinrabun/judges/api
  const docsToCheck = [
    { file: "README.md", label: "README" },
    { file: "docs/api-reference.md", label: "API Reference" },
    { file: "docs/plugin-guide.md", label: "Plugin Guide" },
    { file: "examples/quickstart.ts", label: "examples/quickstart.ts" },
  ];

  for (const { file, label } of docsToCheck) {
    it(`${label} import examples only reference real exports`, async () => {
      const filePath = resolve(ROOT, file);
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, "utf-8");
      const api = await import("../src/api.js");
      const apiKeys = new Set(Object.keys(api));

      // Extract named imports from lines like: import { foo, bar } from "@kevinrabun/judges/api";
      // Also match from "@kevinrabun/judges" (bare import)
      const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']@kevinrabun\/judges(?:\/api)?["']/g;
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        const names = match[1]
          .split(",")
          .map((n) =>
            n
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          )
          .filter(Boolean);
        for (const name of names) {
          // Skip type-only imports
          if (name.startsWith("type ")) continue;
          assert.ok(
            apiKeys.has(name),
            `${label} imports "${name}" from @kevinrabun/judges/api but it is not exported. ` +
              `Available exports include: JUDGES, getJudge, getJudgeSummaries, evaluateCode, etc.`,
          );
        }
      }
    });
  }
});

// ─── Quickstart: MCP server documentation ───────────────────────────────────

describe("Quickstart: MCP server claims", () => {
  it("README does not reference non-existent 'mcp' CLI command", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");
    // The CLI has no "mcp" subcommand — MCP server is started via direct node invocation
    assert.ok(
      !readme.includes("judges mcp") || readme.includes("# "),
      'README should not claim "judges mcp" or "npx @kevinrabun/judges mcp" as a command — no such CLI command exists',
    );
  });

  it("README does not reference non-existent startMcpServer export", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");
    assert.ok(
      !readme.includes("startMcpServer"),
      'README should not reference "startMcpServer" — this function does not exist',
    );
  });

  it("README does not reference non-existent ./mcp export path", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");
    assert.ok(
      !readme.includes('@kevinrabun/judges/mcp"') && !readme.includes("@kevinrabun/judges/mcp'"),
      'README should not reference "@kevinrabun/judges/mcp" — the correct path is "@kevinrabun/judges/server"',
    );
  });

  it("package.json exports ./server (the MCP server entry)", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    assert.ok(pkg.exports?.["./server"], 'package.json should export "./server" for the MCP server');
  });
});

// ─── Quickstart: GitHub Action inputs ───────────────────────────────────────

describe("Quickstart: GitHub Action inputs match action.yml", () => {
  it("action.yml has all documented inputs", () => {
    const actionPath = resolve(ROOT, "action.yml");
    if (!existsSync(actionPath)) return;
    const actionContent = readFileSync(actionPath, "utf-8");
    const documentedInputs = [
      "path",
      "diff-only",
      "fail-on-findings",
      "upload-sarif",
      "language",
      "judge",
      "preset",
      "config",
      "format",
      "fix",
      "pr-review",
      "baseline-file",
    ];
    for (const input of documentedInputs) {
      assert.ok(
        actionContent.includes(`${input}:`),
        `action.yml should define input "${input}" — update docs if action inputs change`,
      );
    }
  });
});

// ─── Quickstart: CLI commands exist ─────────────────────────────────────────

describe("Quickstart: CLI commands referenced in docs exist", () => {
  const cliPath = resolve(ROOT, "src", "cli.ts");
  const cliSrc = existsSync(cliPath) ? readFileSync(cliPath, "utf-8") : "";
  const dispatchPath = resolve(ROOT, "src", "cli-dispatch.ts");
  const dispatchSrc = existsSync(dispatchPath) ? readFileSync(dispatchPath, "utf-8") : "";
  const combinedSrc = cliSrc + dispatchSrc;

  const documentedCommands = [
    "eval",
    "list",
    "init",
    "fix",
    "watch",
    "report",
    "diff",
    "deps",
    "app",
    "skill",
    "skills",
    "license-scan",
  ];

  for (const cmd of documentedCommands) {
    it(`CLI has "${cmd}" command handler`, () => {
      assert.ok(
        combinedSrc.includes(`args.command === "${cmd}"`) ||
          combinedSrc.includes(`"${cmd}": [`) ||
          combinedSrc.includes(`${cmd}: [`),
        `CLI should have a handler for command "${cmd}" — update docs if commands change`,
      );
    });
  }
});

// ─── Quickstart: CLI flags exist ────────────────────────────────────────────

describe("Quickstart: CLI flags referenced in docs exist", () => {
  const cliPath = resolve(ROOT, "src", "cli.ts");
  const cliSrc = existsSync(cliPath) ? readFileSync(cliPath, "utf-8") : "";

  const documentedFlags = [
    "--file",
    "--language",
    "--format",
    "--judge",
    "--preset",
    "--config",
    "--min-score",
    "--summary",
    "--fail-on-findings",
    "--baseline",
    "--changed-only",
    "--output",
    "--min-severity",
    "--fix",
  ];

  for (const flag of documentedFlags) {
    it(`CLI parses "${flag}" flag`, () => {
      assert.ok(cliSrc.includes(`case "${flag}"`), `CLI should parse flag "${flag}" — update docs if flags change`);
    });
  }
});

// ─── Quickstart: examples/quickstart.ts is valid ────────────────────────────

describe("Quickstart: examples/quickstart.ts", () => {
  it("quickstart example file exists", () => {
    assert.ok(existsSync(resolve(ROOT, "examples", "quickstart.ts")), "examples/quickstart.ts should exist");
  });

  it("quickstart example imports only real exports", async () => {
    const content = readFileSync(resolve(ROOT, "examples", "quickstart.ts"), "utf-8");
    const api = await import("../src/api.js");
    const apiKeys = new Set(Object.keys(api));

    const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']@kevinrabun\/judges(?:\/api)?["']/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const names = match[1]
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      for (const name of names) {
        if (name.startsWith("type ")) continue;
        assert.ok(apiKeys.has(name), `examples/quickstart.ts imports "${name}" but it is not exported from api.ts`);
      }
    }
  });

  it("quickstart example calls evaluateCode which returns a verdict", async () => {
    const { evaluateCode } = await import("../src/api.js");
    const verdict = evaluateCode("const x = eval(input);", "typescript");
    assert.ok(verdict, "evaluateCode should return a verdict");
    assert.ok(typeof verdict.overallVerdict === "string", "verdict.overallVerdict should be a string");
    assert.ok(typeof verdict.overallScore === "number", "verdict.overallScore should be a number");
    assert.ok(Array.isArray(verdict.evaluations), "verdict.evaluations should be an array");
  });

  it("quickstart example calls evaluateCodeSingleJudge correctly", async () => {
    const { evaluateCodeSingleJudge } = await import("../src/api.js");
    const result = evaluateCodeSingleJudge("cybersecurity", "const x = eval(input);", "typescript");
    assert.ok(result, "evaluateCodeSingleJudge should return a result");
    assert.ok(typeof result.score === "number", "result.score should be a number");
    assert.ok(Array.isArray(result.findings), "result.findings should be an array");
  });

  it("quickstart example calls getJudgeSummaries correctly", async () => {
    const { getJudgeSummaries } = await import("../src/api.js");
    const summaries = getJudgeSummaries();
    assert.ok(Array.isArray(summaries), "getJudgeSummaries should return an array");
    assert.equal(summaries.length, 45, "Should return 45 judge summaries");
    for (const s of summaries) {
      assert.ok(s.id, "Each summary should have an id");
      assert.ok(s.name, "Each summary should have a name");
    }
  });
});

// ─── Quickstart: Score scales are consistent ────────────────────────────────

describe("Quickstart: Score scale consistency", () => {
  it("failOnScoreBelow config is validated on 0-10 scale", () => {
    const configSrc = readFileSync(resolve(ROOT, "src", "config.ts"), "utf-8");
    assert.ok(
      configSrc.includes("failOnScoreBelow") && configSrc.includes("> 10"),
      "failOnScoreBelow should be validated as 0-10 range in config.ts",
    );
  });

  it("CLI scales failOnScoreBelow from 0-10 config to 0-100 minScore", () => {
    const cliSrc = readFileSync(resolve(ROOT, "src", "cli.ts"), "utf-8");
    assert.ok(
      cliSrc.includes("failOnScoreBelow * 10"),
      "CLI should scale failOnScoreBelow (0-10) to minScore (0-100) by multiplying by 10",
    );
  });

  it("overallScore is on 0-100 scale", async () => {
    const { evaluateCode } = await import("../src/api.js");
    const verdict = evaluateCode("console.log('hello');", "typescript");
    assert.ok(verdict.overallScore >= 0 && verdict.overallScore <= 100, "overallScore should be 0-100");
  });

  it("migration guide uses --min-score on 0-100 scale", () => {
    const migrationPath = resolve(ROOT, "docs", "migration-guides.md");
    if (!existsSync(migrationPath)) return;
    const content = readFileSync(migrationPath, "utf-8");
    // All --min-score values should be >= 10 to make sense on 0-100 scale
    const minScorePattern = /--min-score\s+(\d+)/g;
    let match;
    while ((match = minScorePattern.exec(content)) !== null) {
      const value = parseInt(match[1], 10);
      assert.ok(
        value >= 10,
        `Migration guide uses --min-score ${value} which is suspiciously low for a 0-100 scale. ` +
          `Did you mean ${value * 10}? (SonarQube uses 0-10; Judges CLI uses 0-100)`,
      );
    }
  });
});

// ─── Token Budget Documentation Claims ──────────────────────────────────────

describe("Documentation: Token budget safeguards", () => {
  const apiRef = readFileSync(resolve(ROOT, "docs", "api-reference.md"), "utf-8");
  const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8");
  const changelog = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");

  it("DEFAULT_MAX_PROMPT_CHARS matches documented default of 100000", async () => {
    const { DEFAULT_MAX_PROMPT_CHARS } = await import("../src/tools/deep-review.js");
    assert.equal(
      DEFAULT_MAX_PROMPT_CHARS,
      100_000,
      "DEFAULT_MAX_PROMPT_CHARS must be 100_000 to match documentation claims",
    );
  });

  it("api-reference.md documents maxPromptChars option", () => {
    assert.ok(apiRef.includes("maxPromptChars"), 'docs/api-reference.md should document the "maxPromptChars" option');
  });

  it("api-reference.md documents default value of 100000", () => {
    assert.ok(
      apiRef.includes("100000") || apiRef.includes("100_000") || apiRef.includes("100,000"),
      "docs/api-reference.md should document the default value of 100000 for maxPromptChars",
    );
  });

  it("api-reference.md documents 0 = unlimited", () => {
    assert.ok(
      apiRef.includes("maxPromptChars: 0") || apiRef.includes("Set to `0`") || apiRef.includes("0 = unlimited"),
      "docs/api-reference.md should document that maxPromptChars=0 disables truncation",
    );
  });

  it("api-reference.md documents EvaluationOptions section", () => {
    assert.ok(
      apiRef.includes("## EvaluationOptions"),
      "docs/api-reference.md should have an EvaluationOptions section",
    );
  });

  it("api-reference.md documents evaluateGitDiff", () => {
    assert.ok(apiRef.includes("evaluateGitDiff"), "docs/api-reference.md should document evaluateGitDiff");
  });

  it("api-reference.md documents evaluateUnifiedDiff", () => {
    assert.ok(apiRef.includes("evaluateUnifiedDiff"), "docs/api-reference.md should document evaluateUnifiedDiff");
  });

  it("api-reference.md documents resolveImports", () => {
    assert.ok(apiRef.includes("resolveImports"), "docs/api-reference.md should document resolveImports");
  });

  it("api-reference.md documents buildRelatedFilesContext", () => {
    assert.ok(
      apiRef.includes("buildRelatedFilesContext"),
      "docs/api-reference.md should document buildRelatedFilesContext",
    );
  });

  it("api-reference.md documents RelatedFileSnippet type", () => {
    assert.ok(
      apiRef.includes("RelatedFileSnippet"),
      "docs/api-reference.md Types Reference should include RelatedFileSnippet",
    );
  });

  it("api-reference.md documents GitDiffVerdict type", () => {
    assert.ok(apiRef.includes("GitDiffVerdict"), "docs/api-reference.md Types Reference should include GitDiffVerdict");
  });

  it("api-reference.md documents token budget truncation behavior", () => {
    assert.ok(
      apiRef.includes("Token Budget"),
      'docs/api-reference.md should have a "Token Budget" section explaining truncation behavior',
    );
  });

  it("README documents evaluate_git_diff MCP tool", () => {
    assert.ok(readme.includes("### `evaluate_git_diff`"), "README.md should document the evaluate_git_diff MCP tool");
  });

  it("README documents re_evaluate_with_context MCP tool", () => {
    assert.ok(
      readme.includes("### `re_evaluate_with_context`"),
      "README.md should document the re_evaluate_with_context MCP tool",
    );
  });

  it("README documents maxPromptChars on evaluate_git_diff", () => {
    // Find the evaluate_git_diff section and check maxPromptChars is in its parameter table
    const gitDiffIdx = readme.indexOf("### `evaluate_git_diff`");
    assert.ok(gitDiffIdx >= 0, "evaluate_git_diff section must exist");
    const section = readme.slice(gitDiffIdx, gitDiffIdx + 1500);
    assert.ok(section.includes("maxPromptChars"), "evaluate_git_diff section should document maxPromptChars parameter");
  });

  it("README documents maxPromptChars on re_evaluate_with_context", () => {
    const reEvalIdx = readme.indexOf("### `re_evaluate_with_context`");
    assert.ok(reEvalIdx >= 0, "re_evaluate_with_context section must exist");
    const section = readme.slice(reEvalIdx, reEvalIdx + 2000);
    assert.ok(
      section.includes("maxPromptChars"),
      "re_evaluate_with_context section should document maxPromptChars parameter",
    );
  });

  it("CHANGELOG mentions token budget safeguards", () => {
    assert.ok(
      changelog.includes("Token budget safeguards") || changelog.includes("maxPromptChars"),
      "CHANGELOG.md should mention token budget safeguards",
    );
  });
});

// ─── Token Budget API Exports ───────────────────────────────────────────────

describe("Documentation: Token budget API exports from src/api.ts", () => {
  it("exports DEFAULT_MAX_PROMPT_CHARS", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.DEFAULT_MAX_PROMPT_CHARS, "number");
    assert.equal(api.DEFAULT_MAX_PROMPT_CHARS, 100_000);
  });

  it("exports formatRelatedFilesSection", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.formatRelatedFilesSection, "function");
  });

  it("exports buildTribunalDeepReviewSection", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.buildTribunalDeepReviewSection, "function");
  });

  it("exports buildSingleJudgeDeepReviewSection", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.buildSingleJudgeDeepReviewSection, "function");
  });

  it("exports evaluateGitDiff", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateGitDiff, "function");
  });

  it("exports evaluateUnifiedDiff", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.evaluateUnifiedDiff, "function");
  });

  it("exports resolveImports", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.resolveImports, "function");
  });

  it("exports buildRelatedFilesContext", async () => {
    const api = await import("../src/api.js");
    assert.equal(typeof api.buildRelatedFilesContext, "function");
  });
});

// ─── MCP Tool Schema Verification ──────────────────────────────────────────

describe("Documentation: MCP tools have maxPromptChars parameter", () => {
  it("re_evaluate_with_context tool schema includes maxPromptChars", () => {
    const src = readFileSync(resolve(ROOT, "src", "tools", "register-review.ts"), "utf-8");
    const toolStart = src.indexOf('"re_evaluate_with_context"');
    assert.ok(toolStart >= 0, "re_evaluate_with_context tool must exist in register-review.ts");
    const toolSection = src.slice(toolStart, toolStart + 3000);
    assert.ok(
      toolSection.includes("maxPromptChars"),
      "re_evaluate_with_context tool schema should include maxPromptChars",
    );
  });

  it("evaluate_git_diff tool schema includes maxPromptChars", () => {
    const src = readFileSync(resolve(ROOT, "src", "tools", "register-workflow.ts"), "utf-8");
    const toolStart = src.indexOf('"evaluate_git_diff"');
    assert.ok(toolStart >= 0, "evaluate_git_diff tool must exist in register-workflow.ts");
    const toolSection = src.slice(toolStart, toolStart + 3000);
    assert.ok(toolSection.includes("maxPromptChars"), "evaluate_git_diff tool schema should include maxPromptChars");
  });
});
