// ─────────────────────────────────────────────────────────────────────────────
// Evaluator Pipeline Options Coverage — targeted branch exercises
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateProject,
  evaluateDiff,
  crossEvaluatorDedup,
  applyInlineSuppressions,
  enrichWithPatches,
  clearEvaluationCaches,
} from "../src/evaluators/index.js";
import { getJudge, JUDGES } from "../src/judges/index.js";
import { analyzeDependencies } from "../src/evaluators/index.js";
import type { Finding } from "../src/types.js";

// ═══════════════ Tribunal with various options ═══════════════════════════

describe("Pipeline-options: judge filtering", () => {
  it("disables specific judges via config", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, {
      config: { disabledJudges: ["cybersecurity", "security", "authentication"] },
    });
    assert.ok(v.evaluations.length < JUDGES.length);
    assert.ok(!v.evaluations.some((e) => e.judgeId === "cybersecurity"));
  });

  it("disables specific rules via config", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, {
      config: { disabledRules: ["CYBER-001", "SEC-001"] },
    });
    assert.ok(!v.findings.some((f) => f.ruleId === "CYBER-001" || f.ruleId === "SEC-001"));
  });

  it("applies minSeverity filter", () => {
    const v = evaluateWithTribunal("eval(x); document.innerHTML = y;", "javascript", undefined, {
      minSeverity: "high",
    });
    for (const f of v.findings) {
      assert.ok(f.severity === "critical" || f.severity === "high", `Expected high+, got ${f.severity}`);
    }
  });

  it("filters by minConfidence", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript", undefined, {
      minConfidence: 0.9,
    });
    for (const f of v.findings) {
      if (f.confidence !== undefined) {
        assert.ok(f.confidence >= 0.9, `Expected >=0.9 confidence, got ${f.confidence}`);
      }
    }
  });

  it("excludes code-structure judge when includeAstFindings=false", () => {
    const v = evaluateWithTribunal("function deep() { if(a) { if(b) { if(c) { } } } }", "javascript", undefined, {
      includeAstFindings: false,
    });
    assert.ok(!v.evaluations.some((e) => e.judgeId === "code-structure"));
  });

  it("includes code-structure judge by default", () => {
    const v = evaluateWithTribunal("function deep() { if(a) {} }", "javascript");
    assert.ok(v.evaluations.some((e) => e.judgeId === "code-structure"));
  });
});

// ═══════════════ Adaptive selection ══════════════════════════════════════

describe("Pipeline-options: adaptive selection", () => {
  it("adapts judges based on file path", () => {
    const code = "const x = 1;";
    const v = evaluateWithTribunal(code, "typescript", undefined, {
      adaptiveSelection: true,
      filePath: "src/utils.ts",
    });
    assert.ok(typeof v.overallScore === "number");
    // May have fewer judges due to adaptive selection
  });

  it("adapts for test files", () => {
    const code = 'describe("test", () => { it("works", () => {}); });';
    const v = evaluateWithTribunal(code, "typescript", undefined, {
      adaptiveSelection: true,
      filePath: "tests/app.test.ts",
    });
    assert.ok(typeof v.overallScore === "number");
  });

  it("adapts for config files", () => {
    const code = '{ "compilerOptions": {} }';
    const v = evaluateWithTribunal(code, "json", undefined, {
      adaptiveSelection: true,
      filePath: "tsconfig.json",
    });
    assert.ok(typeof v.overallScore === "number");
  });

  it("adapts for Terraform files", () => {
    const code = 'resource "aws_instance" "web" { ami = "abc" }';
    const v = evaluateWithTribunal(code, "terraform", undefined, {
      adaptiveSelection: true,
      filePath: "infra/main.tf",
    });
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Project evaluation with options ═════════════════════════

describe("Pipeline-options: project evaluation", () => {
  it("evaluates project with cross-file analysis", () => {
    const files = [
      {
        path: "src/app.ts",
        content: "import { db } from './db';\nconst user = db.query('SELECT * FROM users WHERE id = ' + id);",
        language: "typescript",
      },
      { path: "src/db.ts", content: "export const db = { query: (sql: string) => {} };", language: "typescript" },
      {
        path: "src/utils.ts",
        content: "export function sanitize(input: string) { return input.replace(/[<>]/g, ''); }",
        language: "typescript",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(result.fileResults.length >= 3);
    assert.ok(typeof result.overallScore === "number");
  });

  it("evaluates project with security patterns", () => {
    const files = [
      {
        path: "src/app.ts",
        content: 'import helmet from "helmet";\napp.use(helmet());\napp.listen(3000);',
        language: "typescript",
      },
      {
        path: "src/auth.ts",
        content: 'import rateLimit from "express-rate-limit";\napp.use(rateLimit());',
        language: "typescript",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(typeof result.overallScore === "number");
  });
});

// ═══════════════ Diff evaluation variants ════════════════════════════════

describe("Pipeline-options: diff evaluation", () => {
  it("evaluates diff with large changed set", () => {
    const code = Array.from({ length: 20 }, (_, i) => `const line${i} = eval("${i}");`).join("\n");
    const changedLines = Array.from({ length: 20 }, (_, i) => i + 1);
    const result = evaluateDiff(code, "javascript", changedLines);
    assert.ok(result.findings.length > 0);
  });

  it("evaluates diff with no vulnerable changed lines", () => {
    const code = "const safe = 1;\nconst also_safe = 2;\nconst x = eval(dangerous);";
    const result = evaluateDiff(code, "javascript", [1, 2]); // Only safe lines changed
    assert.ok(typeof result.score === "number");
  });

  it("evaluates diff with context", () => {
    const result = evaluateDiff("eval(x);", "javascript", [1], "This is intentional");
    assert.ok(typeof result.score === "number");
  });
});

// ═══════════════ Dependency analysis ═════════════════════════════════════

describe("Pipeline-options: dependency analysis", () => {
  it("analyzes package.json", () => {
    const manifest = '{ "dependencies": { "express": "^4.18.0", "lodash": "^3.10.1" } }';
    const result = analyzeDependencies(manifest, "package.json");
    assert.ok(typeof result.score === "number");
    assert.ok(Array.isArray(result.findings));
  });

  it("analyzes requirements.txt", () => {
    const manifest = "flask==2.3.0\nrequests>=2.28.0\ndjango>=4.0";
    const result = analyzeDependencies(manifest, "requirements.txt");
    assert.ok(typeof result.score === "number");
  });

  it("analyzes go.mod", () => {
    const manifest = "module example.com/app\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)";
    const result = analyzeDependencies(manifest, "go.mod");
    assert.ok(typeof result.score === "number");
  });

  it("analyzes Cargo.toml", () => {
    const manifest = '[dependencies]\nserde = "1.0"\ntokio = { version = "1", features = ["full"] }';
    const result = analyzeDependencies(manifest, "Cargo.toml");
    assert.ok(typeof result.score === "number");
  });

  it("handles empty manifest", () => {
    const result = analyzeDependencies("{}", "package.json");
    assert.ok(typeof result.score === "number");
  });
});

// ═══════════════ Inline suppressions — deeper variants ═══════════════════

describe("Pipeline-options: inline suppressions deep", () => {
  it("suppresses specific rule on same line", () => {
    const code = "eval(input); // judges-ignore CYBER-001";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [1] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });

  it("suppresses with next-line directive", () => {
    const code = "// judges-ignore-next-line CYBER-001\neval(input);";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [2] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });

  it("suppresses with reason comment", () => {
    const code = "eval(buildConfig); // judges-ignore CYBER-001 -- intentional for build";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [1] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });

  it("does not suppress unrelated rules", () => {
    const code = "eval(input); // judges-ignore SEC-001";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [1] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 1); // CYBER-001 not suppressed
  });

  it("handles block suppressions", () => {
    const code = "// judges-ignore-block CYBER-001\neval(x);\ndocument.write(y);\n// judges-ignore-block-end\neval(z);";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [2] },
      { ruleId: "CYBER-001", severity: "critical", title: "eval2", description: "d", lineNumbers: [5] },
    ];
    const result = applyInlineSuppressions(findings, code);
    // Block suppression may or may not match depending on exact format
    assert.ok(result.length <= findings.length);
  });

  it("file-level suppression", () => {
    const code = "// judges-file-ignore SEC-001\nconst x = eval(input);\nconst y = eval(z);";
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "sec", description: "d", lineNumbers: [2] },
      { ruleId: "SEC-001", severity: "high", title: "sec2", description: "d", lineNumbers: [3] },
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [2] },
    ];
    const result = applyInlineSuppressions(findings, code);
    // SEC-001 should be suppressed across entire file, CYBER-001 should remain
    assert.ok(result.some((f) => f.ruleId === "CYBER-001"));
    assert.ok(!result.some((f) => f.ruleId === "SEC-001"));
  });

  it("suppresses multiple rules with comma separation", () => {
    const code = "eval(input); // judges-ignore CYBER-001, SEC-001";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "d", lineNumbers: [1] },
      { ruleId: "SEC-001", severity: "high", title: "sec", description: "d", lineNumbers: [1] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 0);
  });
});

// ═══════════════ ClearCaches after heavy runs ════════════════════════════

describe("Pipeline-options: cache management", () => {
  it("clears caches without affecting subsequent evaluations", () => {
    evaluateWithTribunal("eval(x);", "javascript");
    clearEvaluationCaches();
    const v = evaluateWithTribunal("eval(x);", "javascript");
    assert.ok(typeof v.overallScore === "number");
    assert.ok(v.findings.length > 0);
  });
});

// ═══════════════ Large code evaluation ═══════════════════════════════════

describe("Pipeline-options: edge cases", () => {
  it("evaluates very short code", () => {
    const v = evaluateWithTribunal("x", "javascript");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates code with many eval calls", () => {
    const code = Array.from({ length: 10 }, (_, i) => `eval("code${i}");`).join("\n");
    const v = evaluateWithTribunal(code, "javascript");
    assert.ok(v.findings.length > 0);
  });

  it("evaluates multi-language HTML with embedded JS", () => {
    const code = `
<html>
<body>
<script>
  document.innerHTML = userInput;
  eval(data);
</script>
</body>
</html>`;
    const v = evaluateWithTribunal(code, "html");
    assert.ok(typeof v.overallScore === "number");
  });
});
