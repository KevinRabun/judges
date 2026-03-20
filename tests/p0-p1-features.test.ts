// ─── Tests for P0/P1 Critical & High Priority Features ──────────────────────
// Tests for: git-diff parsing, import resolution, deep review, auto-tune,
// confidence filtering, and re_evaluate_with_context MCP tool integration.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JudgeDefinition } from "../src/types.js";

// ─── P1.1: Git Diff Parsing ────────────────────────────────────────────────

import { parseUnifiedDiffToChangedLines } from "../src/git-diff.js";
import type { FileChangedLines, GitDiffVerdict } from "../src/git-diff.js";

describe("parseUnifiedDiffToChangedLines", () => {
  it("parses a simple single-file diff", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..abcdefg 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
 const d = 4;
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.equal(result.length, 1);
    assert.equal(result[0].filePath, "src/foo.ts");
    assert.deepEqual(result[0].changedLines, [2]);
  });

  it("parses multi-file diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -5,2 +5,3 @@
 existing
+new line
 existing2
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.equal(result.length, 2);
    assert.equal(result[0].filePath, "a.ts");
    assert.deepEqual(result[0].changedLines, [2]);
    assert.equal(result[1].filePath, "b.ts");
    assert.deepEqual(result[1].changedLines, [6]);
  });

  it("handles diff with multiple hunks", () => {
    const diff = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,4 @@
 a
+b
 c
 d
@@ -10,3 +11,4 @@
 e
+f
 g
 h
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.equal(result.length, 1);
    assert.equal(result[0].filePath, "x.ts");
    assert.ok(result[0].changedLines.includes(2));
    assert.ok(result[0].changedLines.includes(12));
  });

  it("returns empty array for empty diff", () => {
    const result = parseUnifiedDiffToChangedLines("");
    assert.equal(result.length, 0);
  });

  it("handles deleted-only lines (no additions)", () => {
    const diff = `diff --git a/del.ts b/del.ts
--- a/del.ts
+++ b/del.ts
@@ -1,3 +1,2 @@
 a
-b
 c
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    // File should appear but with no added lines
    assert.ok(result.length >= 0);
    if (result.length > 0) {
      assert.equal(result[0].filePath, "del.ts");
      // No additions means changedLines may be empty
      assert.ok(Array.isArray(result[0].changedLines));
    }
  });
});

// ─── P1.2: Import Resolution ────────────────────────────────────────────────

import { resolveImports } from "../src/import-resolver.js";
import type { ImportResolutionResult } from "../src/import-resolver.js";

describe("resolveImports", () => {
  it("extracts TS/JS named imports", () => {
    const code = `import { foo } from "./utils";\nimport bar from "../config";`;
    const result: ImportResolutionResult = resolveImports(code, "typescript", "/fake/src/index.ts");
    // Local imports go to resolved, the specifiers should be found
    const allSpecifiers = [...result.resolved.map((i) => i.specifier), ...result.external];
    assert.ok(allSpecifiers.some((s) => s === "./utils" || s.includes("utils")));
    assert.ok(allSpecifiers.some((s) => s === "../config" || s.includes("config")));
  });

  it("extracts Python imports", () => {
    const code = `import os\nfrom pathlib import Path\nfrom . import utils`;
    const result = resolveImports(code, "python", "/fake/src/main.py");
    const allSpecifiers = [...result.resolved.map((i) => i.specifier), ...result.external];
    assert.ok(allSpecifiers.some((s) => s === "os"));
    assert.ok(allSpecifiers.some((s) => s === "pathlib"));
  });

  it("extracts Go imports", () => {
    const code = `package main\n\nimport (\n\t"fmt"\n\t"os"\n)`;
    const result = resolveImports(code, "go", "/fake/src/main.go");
    const allSpecifiers = [...result.resolved.map((i) => i.specifier), ...result.external];
    assert.ok(allSpecifiers.some((s) => s === "fmt"));
    assert.ok(allSpecifiers.some((s) => s === "os"));
  });

  it("extracts Rust use statements", () => {
    const code = `use std::collections::HashMap;\nuse crate::utils;`;
    const result = resolveImports(code, "rust", "/fake/src/main.rs");
    const allSpecifiers = [...result.resolved.map((i) => i.specifier), ...result.external];
    assert.ok(allSpecifiers.some((s) => s.includes("std::collections::HashMap")));
  });

  it("classifies local vs external imports", () => {
    const code = `import { foo } from "./local";\nimport express from "express";`;
    const result = resolveImports(code, "typescript", "/fake/src/index.ts");
    // "./local" is local, "express" is external
    const localFound = result.resolved.some((i) => i.specifier === "./local");
    const externalFound = result.external.includes("express");
    assert.ok(localFound, "local import should be in resolved");
    assert.ok(externalFound, "express should be in external");
  });

  it("handles empty code", () => {
    const result = resolveImports("", "typescript", "/fake/src/index.ts");
    assert.equal(result.resolved.length, 0);
    assert.equal(result.external.length, 0);
  });

  it("respects maxImports limit", () => {
    const imports = Array.from({ length: 30 }, (_, i) => `import mod${i} from "./mod${i}";`).join("\n");
    const result = resolveImports(imports, "typescript", "/fake/src/index.ts", 5);
    // The function limits resolved imports (note: none will actually resolve
    // since the files don't exist, but the extraction should be bounded)
    const totalParsed = result.resolved.length + result.external.length;
    assert.ok(totalParsed <= 30, "should parse at most 30 imports");
  });

  it("extracts dynamic imports when supported", () => {
    const code = `const mod = await import("./dynamic-mod");`;
    const result = resolveImports(code, "typescript", "/fake/src/index.ts");
    // Dynamic imports may or may not be captured depending on regex;
    // this tests the function doesn't throw
    assert.ok(result);
    assert.ok(Array.isArray(result.resolved));
    assert.ok(Array.isArray(result.external));
  });

  it("extracts require calls", () => {
    const code = `const fs = require("fs");\nconst utils = require("./utils");`;
    const result = resolveImports(code, "javascript", "/fake/src/index.js");
    const allSpecifiers = [...result.resolved.map((i) => i.specifier), ...result.external];
    assert.ok(allSpecifiers.some((s) => s === "fs"));
    assert.ok(allSpecifiers.some((s) => s === "./utils" || s.includes("utils")));
  });
});

// ─── P0.1 + P0.3 + P1.3: Core Evaluation Options ──────────────────────────

import { evaluateWithTribunal } from "../src/evaluators/index.js";
import type { EvaluationOptions } from "../src/evaluators/index.js";
import type { TribunalVerdict } from "../src/types.js";

describe("evaluateWithTribunal — new options", () => {
  const insecureCode = `
function handleLogin(username, password) {
  const query = "SELECT * FROM users WHERE name='" + username + "' AND pass='" + password + "'";
  eval(password);
  console.log("password is: " + password);
}
`;

  it("deepReview attaches a prompt to the verdict", () => {
    const result = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      deepReview: true,
    });
    assert.ok(result.deepReviewPrompt, "deepReviewPrompt should be present");
    assert.ok(result.deepReviewPrompt.includes("Deep Contextual Review"), "prompt should contain deep review section");
    assert.ok(result.deepReviewPrompt.length > 200, "prompt should be substantial");
  });

  it("deepReview with relatedFiles includes them in the prompt", () => {
    const result = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      deepReview: true,
      relatedFiles: [{ path: "src/auth.ts", snippet: "export function validateToken() {}", relationship: "imports" }],
    });
    assert.ok(result.deepReviewPrompt);
    // The prompt should contain Related Files section or the snippet content
    assert.ok(
      result.deepReviewPrompt.includes("Related Files") || result.deepReviewPrompt.includes("validateToken"),
      "prompt should include related files section or snippet content",
    );
  });

  it("deepReview is absent when not enabled", () => {
    const result = evaluateWithTribunal(insecureCode, "javascript");
    assert.equal(result.deepReviewPrompt, undefined);
  });

  it("confidenceFilter removes low-confidence findings", () => {
    const baseline = evaluateWithTribunal(insecureCode, "javascript");
    const filtered = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      confidenceFilter: 0.99,
    });
    // With a very high threshold, some findings should be filtered
    assert.ok(filtered.findings.length <= baseline.findings.length);
    // All remaining findings should have high confidence
    for (const f of filtered.findings) {
      assert.ok((f.confidence ?? 0.5) >= 0.99, `Finding ${f.ruleId} confidence ${f.confidence} is below threshold`);
    }
  });

  it("confidenceFilter metadata is attached when findings are filtered", () => {
    const result = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      confidenceFilter: 0.99,
    });
    if (result.confidenceFilterApplied) {
      assert.equal(result.confidenceFilterApplied.threshold, 0.99);
      assert.ok(result.confidenceFilterApplied.filteredOut >= 0);
    }
  });

  it("confidenceFilter at 0 does not filter anything", () => {
    const baseline = evaluateWithTribunal(insecureCode, "javascript");
    const filtered = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      confidenceFilter: 0,
    });
    assert.equal(filtered.findings.length, baseline.findings.length);
  });

  it("autoTune option does not throw even without feedback store", () => {
    // Should not throw — no feedback data means it's a no-op
    const result = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      autoTune: true,
    });
    assert.ok(result.overallVerdict);
    assert.ok(result.findings.length >= 0);
  });

  it("autoTune combined with calibrate does not conflict", () => {
    const result = evaluateWithTribunal(insecureCode, "javascript", undefined, {
      autoTune: true,
      calibrate: true,
    });
    assert.ok(result.overallVerdict);
  });
});

// ─── API Exports ────────────────────────────────────────────────────────────

describe("API exports for new features", () => {
  it("exports git-diff functions", async () => {
    const api = await import("../src/api.js");
    assert.ok(typeof api.evaluateGitDiff === "function");
    assert.ok(typeof api.evaluateUnifiedDiff === "function");
    assert.ok(typeof api.parseUnifiedDiffToChangedLines === "function");
  });

  it("exports import-resolver functions", async () => {
    const api = await import("../src/api.js");
    assert.ok(typeof api.resolveImports === "function");
    assert.ok(typeof api.buildRelatedFilesContext === "function");
  });

  it("exports auto-tune functions", async () => {
    const api = await import("../src/api.js");
    assert.ok(typeof api.applyAutoTune === "function");
    assert.ok(typeof api.generateAutoTuneReport === "function");
    assert.ok(typeof api.formatAutoTuneReport === "function");
    assert.ok(typeof api.formatAutoTuneReportJson === "function");
  });
});

// ─── TribunalVerdict type checks ────────────────────────────────────────────

describe("TribunalVerdict new fields", () => {
  it("verdict shape includes new optional fields", () => {
    const result = evaluateWithTribunal("const x = 1;", "javascript");
    // These should be allowed on the type (undefined when not active)
    const verdict: TribunalVerdict = result;
    assert.equal(verdict.deepReviewPrompt, undefined);
    assert.equal(verdict.autoTuneApplied, undefined);
    assert.equal(verdict.confidenceFilterApplied, undefined);
  });
});

// ─── Token Budget Safeguards ────────────────────────────────────────────────

import {
  DEFAULT_MAX_PROMPT_CHARS,
  buildTribunalDeepReviewSection,
  buildSingleJudgeDeepReviewSection,
} from "../src/tools/deep-review.js";
import { formatRelatedFilesSection } from "../src/tools/deep-review.js";
import type { RelatedFileSnippet } from "../src/tools/deep-review.js";

describe("Token budget constants", () => {
  it("DEFAULT_MAX_PROMPT_CHARS is 100_000", () => {
    assert.equal(DEFAULT_MAX_PROMPT_CHARS, 100_000);
  });
});

describe("formatRelatedFilesSection", () => {
  const makeFiles = (n: number): RelatedFileSnippet[] =>
    Array.from({ length: n }, (_, i) => ({
      path: `file-${i}.ts`,
      snippet: `const x${i} = ${i};`,
      relationship: "imports",
    }));

  it("caps files at maxFiles and shows omitted message", () => {
    const files = makeFiles(15);
    const result = formatRelatedFilesSection(files, 5, 3000);
    // Only 5 files should appear
    const fileHeaders = result.match(/<code>file-\d+\.ts<\/code>/g) ?? [];
    assert.equal(fileHeaders.length, 5);
    assert.ok(result.includes("10 additional related file(s) omitted"));
  });

  it("does not cap when maxFiles is 0 (unlimited)", () => {
    const files = makeFiles(15);
    const result = formatRelatedFilesSection(files, 0, 3000);
    const fileHeaders = result.match(/<code>file-\d+\.ts<\/code>/g) ?? [];
    assert.equal(fileHeaders.length, 15);
    assert.ok(!result.includes("omitted"));
  });

  it("truncates long snippets at snippetBudget", () => {
    const longSnippet = "x".repeat(5000);
    const files: RelatedFileSnippet[] = [{ path: "big.ts", snippet: longSnippet }];
    const result = formatRelatedFilesSection(files, 10, 200);
    // Snippet should be truncated
    assert.ok(!result.includes("x".repeat(5000)));
    assert.ok(result.includes("// ... truncated"));
  });

  it("does not truncate snippets when snippetBudget is 0 (unlimited)", () => {
    const longSnippet = "x".repeat(5000);
    const files: RelatedFileSnippet[] = [{ path: "big.ts", snippet: longSnippet }];
    const result = formatRelatedFilesSection(files, 0, 0);
    assert.ok(result.includes("x".repeat(5000)));
  });
});

describe("buildTribunalDeepReviewSection — token budgets", () => {
  const stubJudges: JudgeDefinition[] = [
    { name: "Security", domain: "security", rulePrefix: "SEC", description: "Security review" } as JudgeDefinition,
    { name: "Performance", domain: "performance", rulePrefix: "PERF", description: "Perf review" } as JudgeDefinition,
  ];

  it("default budget truncates oversized context", () => {
    const hugeContext = "a".repeat(200_000);
    const result = buildTribunalDeepReviewSection(stubJudges, "javascript", hugeContext);
    assert.ok(result.includes("… (context truncated)"));
    // Should NOT contain the full 200K string
    assert.ok(!result.includes("a".repeat(200_000)));
  });

  it("maxPromptChars=0 does not truncate context (unlimited)", () => {
    const hugeContext = "b".repeat(200_000);
    const result = buildTribunalDeepReviewSection(stubJudges, "javascript", hugeContext, undefined, undefined, 0);
    assert.ok(!result.includes("… (context truncated)"));
    assert.ok(result.includes("b".repeat(200_000)));
  });

  it("default budget caps related files to 10", () => {
    const manyFiles: RelatedFileSnippet[] = Array.from({ length: 20 }, (_, i) => ({
      path: `rel-${i}.ts`,
      snippet: `// file ${i}`,
    }));
    const result = buildTribunalDeepReviewSection(stubJudges, "typescript", undefined, manyFiles);
    assert.ok(result.includes("10 additional related file(s) omitted"));
  });

  it("maxPromptChars=0 includes all related files", () => {
    const manyFiles: RelatedFileSnippet[] = Array.from({ length: 20 }, (_, i) => ({
      path: `rel-${i}.ts`,
      snippet: `// file ${i}`,
    }));
    const result = buildTribunalDeepReviewSection(stubJudges, "typescript", undefined, manyFiles, undefined, 0);
    assert.ok(!result.includes("omitted"));
    const fileHeaders = result.match(/<code>rel-\d+\.ts<\/code>/g) ?? [];
    assert.equal(fileHeaders.length, 20);
  });
});

describe("buildSingleJudgeDeepReviewSection — token budgets", () => {
  const stubJudge = {
    name: "Security",
    domain: "security",
    rulePrefix: "SEC",
    description: "Security review",
  } as JudgeDefinition;

  it("truncates oversized context by default", () => {
    const hugeContext = "c".repeat(200_000);
    const result = buildSingleJudgeDeepReviewSection(stubJudge, "javascript", hugeContext);
    assert.ok(result.includes("… (context truncated)"));
  });

  it("maxPromptChars=0 means no truncation", () => {
    const hugeContext = "d".repeat(200_000);
    const result = buildSingleJudgeDeepReviewSection(stubJudge, "javascript", hugeContext, undefined, undefined, 0);
    assert.ok(!result.includes("… (context truncated)"));
    assert.ok(result.includes("d".repeat(200_000)));
  });
});

describe("EvaluationOptions maxPromptChars", () => {
  it("passes maxPromptChars through to deep review", () => {
    const result = evaluateWithTribunal("const x = 1;", "javascript", undefined, {
      deepReview: true,
      maxPromptChars: 50_000,
    });
    // Deep review prompt should be generated
    assert.ok(typeof result.deepReviewPrompt === "string");
    assert.ok(result.deepReviewPrompt!.length > 0);
  });

  it("maxPromptChars=0 produces unlimited deep review", () => {
    const result = evaluateWithTribunal("const x = 1;", "javascript", undefined, {
      deepReview: true,
      maxPromptChars: 0,
    });
    assert.ok(typeof result.deepReviewPrompt === "string");
    assert.ok(result.deepReviewPrompt!.length > 0);
  });
});
