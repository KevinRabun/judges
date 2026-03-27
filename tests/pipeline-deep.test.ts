// ─────────────────────────────────────────────────────────────────────────────
// Evaluator Pipeline Internals — Coverage Tests
// Exercises specific code patterns to trigger deeper evaluator branches
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateProject,
  formatVerdictAsMarkdown,
  crossEvaluatorDedup,
  enrichWithPatches,
  clearEvaluationCaches,
  preWarmCaches,
} from "../src/evaluators/index.js";
import { getJudge, JUDGES } from "../src/judges/index.js";
import type { Finding } from "../src/types.js";

// ═══════════════ Cache management ════════════════════════════════════════

describe("Pipeline: cache management", () => {
  it("clearEvaluationCaches does not throw", () => {
    assert.doesNotThrow(() => clearEvaluationCaches());
  });

  it("preWarmCaches processes code", () => {
    assert.doesNotThrow(() => preWarmCaches([{ content: "const x = 1;", language: "javascript" }]));
  });

  it("preWarmCaches with different languages", () => {
    assert.doesNotThrow(() =>
      preWarmCaches([
        { content: "x = 1", language: "python" },
        { content: "package main", language: "go" },
      ]),
    );
  });
});

// ═══════════════ Tribunal with options ════════════════════════════════════

describe("Pipeline: tribunal with options", () => {
  it("evaluates with minSeverity filter", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, { minSeverity: "critical" });
    assert.ok(typeof v.overallScore === "number");
    // All findings should be critical or above
    for (const f of v.findings) {
      assert.equal(f.severity, "critical");
    }
  });

  it("evaluates with disabled judges", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, {
      config: { disabledJudges: ["cybersecurity", "security"] },
    });
    assert.ok(typeof v.overallScore === "number");
    // Should have fewer evaluations
    assert.ok(v.evaluations.length < JUDGES.length);
  });

  it("evaluates with disabled rules", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, {
      config: { disabledRules: ["CYBER-001", "SEC-001"] },
    });
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates with context string", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", "This is a build script that uses eval for configuration");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates with includeAstFindings", () => {
    const code = `
function deep() {
  if (a) { if (b) { if (c) { if (d) { if (e) { return 1; } } } } }
}`;
    const v = evaluateWithTribunal(code, "javascript", undefined, { includeAstFindings: true });
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Project evaluation ══════════════════════════════════════

describe("Pipeline: project evaluation", () => {
  it("evaluates multiple files", () => {
    const files = [
      { path: "src/app.ts", content: "const x = eval(input);", language: "typescript" },
      {
        path: "src/utils.ts",
        content: "export function add(a: number, b: number) { return a + b; }",
        language: "typescript",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(typeof result.overallScore === "number");
    assert.ok(result.fileResults.length === 2);
  });

  it("evaluates single file project", () => {
    const files = [{ path: "src/app.ts", content: "const x = 1;", language: "typescript" }];
    const result = evaluateProject(files);
    assert.ok(typeof result.overallScore === "number");
  });

  it("evaluates mixed-language project", () => {
    const files = [
      { path: "src/api.ts", content: 'import express from "express"; app.listen(3000);', language: "typescript" },
      { path: "scripts/deploy.py", content: "import os\nos.system('deploy')", language: "python" },
      { path: "Dockerfile", content: "FROM node:latest\nCOPY . .\nRUN npm install", language: "dockerfile" },
    ];
    const result = evaluateProject(files);
    assert.ok(result.fileResults.length === 3);
  });

  it("handles empty project", () => {
    const result = evaluateProject([]);
    assert.ok(typeof result.overallScore === "number");
  });
});

// ═══════════════ Cross-evaluator dedup — deeper ═════════════════════════

describe("Pipeline: cross-evaluator dedup deep", () => {
  it("deduplicates findings with same line and similar titles", () => {
    const findings: Finding[] = [
      {
        ruleId: "SEC-001",
        severity: "high",
        title: "SQL injection via string concatenation",
        description: "d",
        lineNumbers: [10],
      },
      {
        ruleId: "CYBER-001",
        severity: "critical",
        title: "Potential SQL injection via string concatenation",
        description: "d",
        lineNumbers: [10],
      },
      {
        ruleId: "DB-001",
        severity: "medium",
        title: "SQL query uses string interpolation",
        description: "d",
        lineNumbers: [10],
      },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.ok(deduped.length <= findings.length);
    // Should keep the highest-severity one
    assert.ok(deduped.some((f) => f.severity === "critical"));
  });

  it("keeps findings on different lines", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "SQL injection", description: "d", lineNumbers: [10] },
      { ruleId: "SEC-002", severity: "high", title: "XSS vulnerability", description: "d", lineNumbers: [20] },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.ok(deduped.length >= 1);
  });

  it("keeps findings with different categories", () => {
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval() usage", description: "d", lineNumbers: [5] },
      { ruleId: "PERF-001", severity: "medium", title: "Synchronous I/O", description: "d", lineNumbers: [5] },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.equal(deduped.length, 2);
  });

  it("handles findings without line numbers", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "Missing headers", description: "d" },
      { ruleId: "CYBER-001", severity: "medium", title: "No security headers", description: "d" },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.ok(deduped.length >= 1);
  });
});

// ═══════════════ Format markdown — deeper ════════════════════════════════

describe("Pipeline: formatVerdictAsMarkdown deep", () => {
  it("formats verdict with many findings", () => {
    const v = evaluateWithTribunal("eval(x); document.innerHTML = y; exec('cmd ' + z);", "javascript");
    const md = formatVerdictAsMarkdown(v);
    assert.ok(md.length > 100);
    assert.ok(md.includes("Score") || md.includes("score") || md.includes("#"));
  });

  it("formats clean verdict", () => {
    const v = evaluateWithTribunal("const x = 1;", "javascript");
    const md = formatVerdictAsMarkdown(v);
    assert.ok(typeof md === "string");
  });

  it("formats verdict with timing info", () => {
    const v = evaluateWithTribunal("const x = eval(y);", "javascript");
    const md = formatVerdictAsMarkdown(v);
    assert.ok(typeof md === "string");
  });
});

// ═══════════════ Enrichment pipeline ═════════════════════════════════════

describe("Pipeline: enrichWithPatches for common findings", () => {
  it("enriches eval finding with patch", () => {
    const findings: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "critical",
        title: "Dangerous eval() usage",
        description: "d",
        lineNumbers: [1],
      },
    ];
    const code = "const result = eval(userInput);";
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
    assert.ok(enriched[0].patch!.newText.includes("Function"));
  });

  it("enriches innerHTML finding with patch", () => {
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "high", title: "XSS via innerHTML", description: "d", lineNumbers: [1] },
    ];
    const code = "element.innerHTML = data;";
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
    assert.ok(enriched[0].patch!.newText.includes("textContent"));
  });

  it("enriches http URL finding with patch", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "Unencrypted HTTP connection", description: "d", lineNumbers: [1] },
    ];
    const code = 'fetch("http://api.example.com/data");';
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
    assert.ok(enriched[0].patch!.newText.includes("https"));
  });

  it("enriches Math.random finding with patch", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "medium", title: "Insecure random number", description: "d", lineNumbers: [1] },
    ];
    const code = "const token = Math.random().toString(36);";
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
  });

  it("enriches multiple findings independently", () => {
    const findings: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "critical",
        title: "Dangerous eval() usage",
        description: "d",
        lineNumbers: [1],
      },
      { ruleId: "SEC-001", severity: "high", title: "Unencrypted HTTP connection", description: "d", lineNumbers: [2] },
    ];
    const code = 'const x = eval(y);\nfetch("http://api.example.com");';
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
    assert.ok(enriched[1].patch);
  });
});

// ═══════════════ Language-specific evaluations for branch coverage ════════

describe("Pipeline: language-specific branch coverage", () => {
  const languages = [
    { lang: "typescript", code: "const x = eval(input);" },
    { lang: "python", code: "exec(user_input)" },
    { lang: "java", code: 'stmt.executeQuery("SELECT * FROM t WHERE id = " + id);' },
    { lang: "csharp", code: 'new SqlCommand("SELECT * FROM Users WHERE Id = " + id);' },
    { lang: "go", code: 'exec.Command("sh", "-c", cmd).Run()' },
    { lang: "rust", code: "unsafe { std::ptr::read(ptr) }" },
    { lang: "ruby", code: "User.create(params[:user])" },
    { lang: "php", code: "echo $_GET['name'];" },
    { lang: "kotlin", code: 'Runtime.getRuntime().exec("cmd " + args)' },
    { lang: "swift", code: 'let result = try Process.run("\\(cmd)")' },
    { lang: "powershell", code: "Invoke-Expression $userInput" },
    { lang: "bash", code: "eval $USER_INPUT" },
    { lang: "terraform", code: 'resource "aws_s3_bucket" "b" { acl = "public-read" }' },
    { lang: "dockerfile", code: "FROM node:latest\nUSER root" },
    { lang: "yaml", code: "apiVersion: v1\nkind: Pod\nspec:\n  hostNetwork: true" },
    { lang: "json", code: '{ "dependencies": { "request": "*" } }' },
    { lang: "html", code: '<img src="x" /><div onclick="go()" />' },
    { lang: "sql", code: "SELECT * FROM users WHERE name = '" },
    { lang: "bicep", code: "param adminPassword string\n@secure()" },
  ];

  for (const { lang, code } of languages) {
    it(`tribunal evaluates ${lang} code`, () => {
      const v = evaluateWithTribunal(code, lang);
      assert.ok(typeof v.overallScore === "number");
      assert.ok(v.evaluations.length > 0);
    });
  }
});
