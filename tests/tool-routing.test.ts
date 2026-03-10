// ─────────────────────────────────────────────────────────────────────────────
// Judges Panel — MCP Tool Routing Tests
// ─────────────────────────────────────────────────────────────────────────────
// Validates that natural-language user prompts route to the correct MCP tool.
// Uses term-frequency scoring against tool descriptions and parameter names
// to simulate LLM tool selection. Catches description regressions that cause
// misrouting (e.g., sovereignty+keyvault queries landing on analyze_dependencies).
//
// Usage:
//   npx tsx --test tests/tool-routing.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ═══════════════════════════════════════════════════════════════════════════
// Tool Definitions — mirrors the MCP tool registrations in src/tools/
// ═══════════════════════════════════════════════════════════════════════════

interface ToolDefinition {
  name: string;
  description: string;
  /** Flattened list of parameter names + their descriptions */
  parameterHints: string[];
}

/**
 * Canonical tool definitions extracted from register-evaluation.ts and
 * register-workflow.ts. When tool descriptions change in source, update
 * these to match — or better, the tests will catch misrouting regressions.
 */
const TOOLS: ToolDefinition[] = [
  {
    name: "get_judges",
    description:
      "List all available judges on the Agent Tribunal panel, including their areas of expertise and what they evaluate.",
    parameterHints: [],
  },
  {
    name: "evaluate_code",
    description:
      "Submit code to the full Judges Panel for evaluation. Handles ALL code types including application code, infrastructure-as-code (Bicep, Terraform, ARM, CloudFormation). All 44 judges will independently review the code using both automated pattern detection and deep contextual analysis criteria. Returns a combined verdict with scores, findings, and expert review guidance for thorough evaluation.",
    parameterHints: [
      "code source code",
      "language programming language typescript python javascript csharp java",
      "context framework deployment target",
      "includeAstFindings AST code-structure",
      "minConfidence confidence threshold",
      "config inline configuration",
    ],
  },
  {
    name: "evaluate_code_single_judge",
    description:
      "Submit code to a specific judge for targeted domain analysis. Handles ALL code types including application code, infrastructure-as-code (Bicep, Terraform, ARM, CloudFormation). Key domains: cybersecurity, data-sovereignty, iac-security, compliance, cost-effectiveness, authentication, cloud-readiness.",
    parameterHints: [
      "code source code",
      "language programming language typescript python javascript csharp java",
      "judgeId judge ID cybersecurity data-sovereignty iac-security compliance cost-effectiveness authentication cloud-readiness",
      "context framework deployment target",
      "minConfidence confidence threshold",
      "config inline configuration",
    ],
  },
  {
    name: "evaluate_v2",
    description:
      "Run V2 context-aware tribunal evaluation with policy profiles, evidence calibration, specialty feedback, confidence scoring, and uncertainty reporting.",
    parameterHints: [
      "code source code",
      "language programming language",
      "files project files path content",
      "context high-level context",
      "includeAstFindings AST code-structure",
      "minConfidence confidence threshold",
      "policyProfile policy profile startup regulated healthcare fintech public-sector",
      "evaluationContext architecture notes constraints standards known risks data boundary",
      "evidence test summary coverage latency error rate vulnerability deployment",
    ],
  },
  {
    name: "evaluate_project",
    description:
      "Submit multiple files for project-level analysis. All 44 judges evaluate each file, plus cross-file architectural analysis detects issues like code duplication, inconsistent error handling, and dependency cycles.",
    parameterHints: [
      "files project files path content language",
      "context project context",
      "includeAstFindings AST code-structure",
      "minConfidence confidence threshold",
      "config inline configuration",
    ],
  },
  {
    name: "evaluate_diff",
    description:
      "Evaluate only the changed lines in a code diff. Runs all 44 judges on the full file but filters findings to only those affecting the specified changed lines. Ideal for PR reviews and incremental analysis.",
    parameterHints: [
      "code full file content post-change",
      "language programming language",
      "changedLines changed line numbers added modified",
      "context change context",
      "includeAstFindings AST code-structure",
      "minConfidence confidence threshold",
      "config inline configuration",
    ],
  },
  {
    name: "analyze_dependencies",
    description:
      "Analyze a PACKAGE MANAGER manifest file (NOT infrastructure code) for supply-chain risks, version pinning issues, typosquatting indicators, and dependency hygiene. ONLY accepts: package.json, requirements.txt, Cargo.toml, go.mod, pom.xml, .csproj. Do NOT use this for Bicep, Terraform, ARM templates, CloudFormation, Dockerfiles, or any other infrastructure/deployment configuration — use evaluate_code or evaluate_code_single_judge for those.",
    parameterHints: [
      "manifest full content of the manifest file",
      "manifestType package.json requirements.txt Cargo.toml go.mod pom.xml csproj",
    ],
  },
  {
    name: "evaluate_app_builder_flow",
    description:
      "Run a 3-step app-builder workflow: tribunal review, plain-language risk translation, and prioritized remediation tasks with AI-fixable P0/P1 items.",
    parameterHints: [
      "code source code",
      "language programming language",
      "files project files path content",
      "changedLines changed line numbers diff",
      "context business purpose constraints",
      "includeAstFindings AST code-structure",
      "minConfidence confidence threshold",
      "maxFindings translated top findings",
      "maxTasks remediation tasks",
    ],
  },
  {
    name: "evaluate_public_repo_report",
    description:
      "Clone a public repository URL, run the full judges panel across source files, and generate a consolidated markdown report.",
    parameterHints: [
      "repoUrl public repository URL HTTP HTTPS",
      "branch branch name",
      "outputPath markdown report path",
      "maxFiles maximum source files",
      "maxFileBytes maximum file size bytes",
      "credentialMode credential detection standard strict",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Scoring Engine — term-frequency based tool routing simulation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tokenize a string into lowercase alphanumeric tokens, splitting on
 * non-alphanumeric characters. Filters out very short tokens (≤1 char)
 * and common stop words.
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "shall",
    "should",
    "may",
    "might",
    "must",
    "can",
    "could",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "about",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "he",
    "she",
    "they",
    "them",
    "and",
    "or",
    "but",
    "if",
    "not",
    "no",
    "so",
    "than",
    "too",
    "very",
    "just",
    "any",
    "all",
    "each",
    "every",
    "some",
    "what",
    "which",
    "who",
    "whom",
    "how",
    "when",
    "where",
    "why",
  ]);

  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

/**
 * Build an inverse document frequency map across all tool descriptions.
 * Terms that appear in many tools get lower weight; terms unique to one
 * tool get higher weight.
 */
function buildIdf(tools: ToolDefinition[]): Map<string, number> {
  const docCount = tools.length;
  const termDocCounts = new Map<string, number>();

  for (const tool of tools) {
    const corpus = [tool.description, ...tool.parameterHints].join(" ");
    const uniqueTerms = new Set(tokenize(corpus));
    for (const term of uniqueTerms) {
      termDocCounts.set(term, (termDocCounts.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of termDocCounts) {
    idf.set(term, Math.log(docCount / count));
  }
  return idf;
}

/**
 * Score a user prompt against a single tool using TF-IDF weighted overlap.
 * Returns higher score for stronger match.
 */
function scoreTool(prompt: string, tool: ToolDefinition, idf: Map<string, number>): number {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return 0;

  // Strip "Do NOT use" / "Do not use" exclusion clauses — these are negative
  // instructions that should not contribute positive matching signal.
  const descriptionCleaned = tool.description.replace(/Do NOT use[^.]*\./gi, "").replace(/Do not use[^.]*\./gi, "");
  const corpus = [tool.name.replace(/_/g, " "), descriptionCleaned, ...tool.parameterHints].join(" ");
  const toolTokens = new Set(tokenize(corpus));

  let score = 0;
  for (const token of promptTokens) {
    if (toolTokens.has(token)) {
      // Weight by IDF — unique terms score higher
      score += idf.get(token) ?? 1;
    }
    // Partial/substring match (lower weight) for compound words
    for (const toolToken of toolTokens) {
      if (toolToken !== token && (toolToken.includes(token) || token.includes(toolToken)) && token.length >= 3) {
        score += (idf.get(toolToken) ?? 1) * 0.3;
      }
    }
  }

  return score;
}

/**
 * Rank all tools for a given prompt. Returns tools sorted by score (desc).
 */
function rankTools(prompt: string): Array<{ name: string; score: number }> {
  const idf = buildIdf(TOOLS);
  const results = TOOLS.map((tool) => ({
    name: tool.name,
    score: scoreTool(prompt, tool, idf),
  }));
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Get the top-ranked tool for a prompt.
 */
function topTool(prompt: string): string {
  return rankTools(prompt)[0].name;
}

/**
 * Check that a specific tool is NOT the top-ranked tool for a prompt.
 */
function isNotTopTool(prompt: string, toolName: string): boolean {
  return rankTools(prompt)[0].name !== toolName;
}

// ═══════════════════════════════════════════════════════════════════════════
// Positive Routing Tests — prompt should route to the expected tool
// ═══════════════════════════════════════════════════════════════════════════

describe("Tool routing — positive (correct tool is top-ranked)", () => {
  // ─── evaluate_code ─────────────────────────────────────────────────
  describe("evaluate_code", () => {
    const expected = "evaluate_code";

    it("review this code with all judges", () => {
      assert.equal(topTool("review this code with all 44 judges on the full panel"), expected);
    });

    it("submit this typescript file to the full judges panel", () => {
      assert.equal(topTool("submit this typescript file to the full judges panel for evaluation"), expected);
    });

    it("run all judges on this python code", () => {
      assert.equal(topTool("run all judges on this python code"), expected);
    });

    it("check this Bicep template with the full panel", () => {
      assert.equal(topTool("check this Bicep infrastructure template with the full judges panel"), expected);
    });
  });

  // ─── evaluate_code_single_judge ────────────────────────────────────
  describe("evaluate_code_single_judge", () => {
    const expected = "evaluate_code_single_judge";

    it("sovereignty judge + keyvault deployment config", () => {
      assert.equal(
        topTool("does the sovereignty judge have any recommendations about this keyvault deployment configuration"),
        expected,
      );
    });

    it("run the cybersecurity judge on this code", () => {
      assert.equal(topTool("run the cybersecurity judge on this code"), expected);
    });

    it("what does the iac-security judge think of this Terraform file", () => {
      assert.equal(topTool("what does the iac-security judge think of this Terraform file"), expected);
    });

    it("check compliance for this healthcare API", () => {
      assert.equal(topTool("run the compliance judge against this healthcare API"), expected);
    });

    it("authentication judge review of login endpoint", () => {
      assert.equal(topTool("have the authentication judge review this login endpoint"), expected);
    });

    it("cost-effectiveness analysis of this cloud function", () => {
      assert.equal(topTool("run cost-effectiveness judge on this cloud function code"), expected);
    });

    it("data-sovereignty judge on cross-border data transfer code", () => {
      assert.equal(topTool("analyze this cross-border data transfer code with the data-sovereignty judge"), expected);
    });

    it("single judge review of ARM template", () => {
      assert.equal(topTool("use the iac-security judge to review this ARM template"), expected);
    });
  });

  // ─── evaluate_v2 ──────────────────────────────────────────────────
  describe("evaluate_v2", () => {
    const expected = "evaluate_v2";

    it("v2 evaluation with policy profile", () => {
      assert.equal(topTool("run a v2 evaluation with the healthcare policy profile"), expected);
    });

    it("context-aware tribunal with evidence calibration", () => {
      assert.equal(
        topTool("context-aware tribunal evaluation with evidence calibration and confidence scoring"),
        expected,
      );
    });

    it("evaluate with fintech policy profile and uncertainty reporting", () => {
      assert.equal(topTool("evaluate code with fintech policy profile and uncertainty reporting"), expected);
    });
  });

  // ─── evaluate_project ─────────────────────────────────────────────
  describe("evaluate_project", () => {
    const expected = "evaluate_project";

    it("analyze all project files for architectural issues", () => {
      assert.equal(topTool("analyze all project files for architectural issues and code duplication"), expected);
    });

    it("cross-file analysis for dependency cycles", () => {
      assert.equal(
        topTool("run cross-file analysis to find dependency cycles and inconsistent error handling"),
        expected,
      );
    });
  });

  // ─── evaluate_diff ────────────────────────────────────────────────
  describe("evaluate_diff", () => {
    const expected = "evaluate_diff";

    it("review only the changed lines in this PR", () => {
      assert.equal(topTool("review only the changed lines in this pull request diff"), expected);
    });

    it("evaluate the diff for this commit", () => {
      assert.equal(topTool("evaluate the diff for this commit, only check modified lines"), expected);
    });
  });

  // ─── analyze_dependencies ─────────────────────────────────────────
  describe("analyze_dependencies", () => {
    const expected = "analyze_dependencies";

    it("check my package.json for supply chain risks", () => {
      assert.equal(topTool("check my package.json for supply chain risks"), expected);
    });

    it("analyze requirements.txt for typosquatting", () => {
      assert.equal(topTool("analyze this requirements.txt for typosquatting and version pinning"), expected);
    });

    it("scan Cargo.toml for dependency hygiene", () => {
      assert.equal(topTool("scan this Cargo.toml for dependency hygiene issues"), expected);
    });

    it("review go.mod for vulnerabilities", () => {
      assert.equal(topTool("review my go.mod manifest for vulnerable dependencies"), expected);
    });
  });

  // ─── evaluate_app_builder_flow ────────────────────────────────────
  describe("evaluate_app_builder_flow", () => {
    const expected = "evaluate_app_builder_flow";

    it("run the app builder workflow with remediation tasks", () => {
      assert.equal(topTool("run the app builder workflow with remediation tasks and risk translation"), expected);
    });

    it("plain language risk summary and prioritized tasks", () => {
      assert.equal(topTool("give me a plain language risk summary with prioritized remediation tasks"), expected);
    });
  });

  // ─── evaluate_public_repo_report ──────────────────────────────────
  describe("evaluate_public_repo_report", () => {
    const expected = "evaluate_public_repo_report";

    it("clone and analyze a public GitHub repo", () => {
      assert.equal(topTool("clone and analyze this public GitHub repository URL"), expected);
    });

    it("generate a report for a public repo", () => {
      assert.equal(topTool("generate a consolidated report for this public repo URL"), expected);
    });
  });

  // ─── get_judges ───────────────────────────────────────────────────
  describe("get_judges", () => {
    const expected = "get_judges";

    it("list all available judges", () => {
      assert.equal(topTool("list all available judges and their domains"), expected);
    });

    it("what judges are on the panel", () => {
      assert.equal(topTool("what judges are available on the tribunal panel and their areas of expertise"), expected);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Negative Routing Tests — prompt must NOT route to the wrong tool
// ═══════════════════════════════════════════════════════════════════════════

describe("Tool routing — negative (wrong tool must NOT be top-ranked)", () => {
  // ─── The original misrouting bug: sovereignty+keyvault → analyze_dependencies
  describe("sovereignty/IaC prompts must NOT route to analyze_dependencies", () => {
    it("sovereignty judge + keyvault deployment config must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool(
          "does the sovereignty judge have any recommendations about this keyvault deployment configuration",
          "analyze_dependencies",
        ),
        "sovereignty+keyvault prompt was misrouted to analyze_dependencies",
      );
    });

    it("sovereignty review of Azure infrastructure must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("run the sovereignty judge on this Azure infrastructure deployment", "analyze_dependencies"),
        "sovereignty+Azure infrastructure prompt was misrouted to analyze_dependencies",
      );
    });

    it("IaC security check on Bicep must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("check this Bicep file for security issues with the iac-security judge", "analyze_dependencies"),
        "Bicep security check was misrouted to analyze_dependencies",
      );
    });

    it("Terraform compliance review must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("evaluate this Terraform configuration for compliance issues", "analyze_dependencies"),
        "Terraform compliance review was misrouted to analyze_dependencies",
      );
    });

    it("ARM template security review must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("review this ARM template for security and sovereignty concerns", "analyze_dependencies"),
        "ARM template review was misrouted to analyze_dependencies",
      );
    });

    it("CloudFormation review must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("analyze this CloudFormation template for cloud readiness", "analyze_dependencies"),
        "CloudFormation review was misrouted to analyze_dependencies",
      );
    });
  });

  // ─── Package manager prompts must NOT route to evaluation tools ───
  describe("package manager prompts must NOT route to evaluation tools", () => {
    it("package.json supply chain scan must NOT go to evaluate_code", () => {
      assert.ok(
        isNotTopTool("scan my package.json for supply chain risks and typosquatting", "evaluate_code"),
        "package.json scan was misrouted to evaluate_code",
      );
    });

    it("requirements.txt pinning check must NOT go to evaluate_code_single_judge", () => {
      assert.ok(
        isNotTopTool("check requirements.txt for unpinned dependency versions", "evaluate_code_single_judge"),
        "requirements.txt check was misrouted to evaluate_code_single_judge",
      );
    });
  });

  // ─── Single-judge prompts must NOT route to full tribunal ─────────
  describe("single-judge prompts should not misroute", () => {
    it("specific judge request must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("run the data-sovereignty judge on this database migration code", "analyze_dependencies"),
        "specific judge request was misrouted to analyze_dependencies",
      );
    });

    it("configuration review with specific judge must NOT go to analyze_dependencies", () => {
      assert.ok(
        isNotTopTool("have the configuration-management judge review this config file", "analyze_dependencies"),
        "config review with specific judge was misrouted to analyze_dependencies",
      );
    });
  });

  // ─── Diff prompts must NOT route to full evaluation ───────────────
  describe("diff prompts must NOT misroute", () => {
    it("PR diff review must NOT go to evaluate_project", () => {
      assert.ok(
        isNotTopTool("review only the changed lines in this PR diff", "evaluate_project"),
        "PR diff review was misrouted to evaluate_project",
      );
    });
  });

  // ─── Public repo prompts must NOT misroute ────────────────────────
  describe("public repo prompts must NOT misroute", () => {
    it("clone and report on public repo must NOT go to evaluate_project", () => {
      assert.ok(
        isNotTopTool("clone this public GitHub repository URL and generate a report", "evaluate_project"),
        "public repo report was misrouted to evaluate_project",
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Regression Tests — specific prompts that previously caused misrouting
// ═══════════════════════════════════════════════════════════════════════════

describe("Tool routing — regressions", () => {
  it("REGRESSION: sovereignty judge + keyvault → should pick evaluate_code_single_judge, not analyze_dependencies", () => {
    const ranking = rankTools(
      "does the sovereignty judge have any recommendations about this keyvault deployment configuration",
    );

    // The correct tool must outrank analyze_dependencies
    const correctIdx = ranking.findIndex((r) => r.name === "evaluate_code_single_judge");
    const wrongIdx = ranking.findIndex((r) => r.name === "analyze_dependencies");

    assert.ok(
      correctIdx < wrongIdx,
      `evaluate_code_single_judge (rank ${correctIdx + 1}) must rank higher than analyze_dependencies (rank ${wrongIdx + 1}). ` +
        `Scores: evaluate_code_single_judge=${ranking[correctIdx].score.toFixed(2)}, ` +
        `analyze_dependencies=${ranking[wrongIdx].score.toFixed(2)}`,
    );
  });

  it("REGRESSION: IaC + deployment + configuration → should NOT pick analyze_dependencies", () => {
    const ranking = rankTools("review this deployment configuration Bicep template for security issues");

    const wrongIdx = ranking.findIndex((r) => r.name === "analyze_dependencies");

    assert.ok(wrongIdx > 2, `analyze_dependencies should not be in top 3 for IaC prompt (was rank ${wrongIdx + 1})`);
  });
});
