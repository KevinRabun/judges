// ─────────────────────────────────────────────────────────────────────────────
// Judges Panel — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Runs every judge against the intentionally flawed sample-vulnerable-api.ts
// and asserts that each judge produces the expected findings.
//
// Usage:
//   npm test                    (after adding the test script to package.json)
//   npx tsx --test tests/judges.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  evaluateWithJudge,
  evaluateWithTribunal,
  evaluateProject,
  evaluateDiff,
  analyzeDependencies,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "../src/evaluators/index.js";
import { JUDGES, getJudge } from "../src/judges/index.js";
import type {
  JudgeEvaluation,
  TribunalVerdict,
  ProjectVerdict,
  DiffVerdict,
  DependencyVerdict,
  Finding,
  Verdict,
} from "../src/types.js";

// ─── Load sample code once ───────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const samplePath = resolve(__dirname, "..", "examples", "sample-vulnerable-api.ts");
const sampleCode = readFileSync(samplePath, "utf-8");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Assert that at least one finding has a ruleId starting with the given prefix */
function hasRulePrefix(findings: Finding[], prefix: string): boolean {
  return findings.some((f) => f.ruleId.startsWith(prefix));
}

/** Assert that none of the findings reference zero-length or empty strings */
function findingsAreWellFormed(findings: Finding[]): void {
  for (const f of findings) {
    assert.ok(f.ruleId.length > 0, "ruleId must be non-empty");
    assert.ok(f.title.length > 0, "title must be non-empty");
    assert.ok(f.description.length > 0, "description must be non-empty");
    assert.ok(f.recommendation.length > 0, "recommendation must be non-empty");
    assert.ok(
      ["critical", "high", "medium", "low", "info"].includes(f.severity),
      `severity must be valid, got: ${f.severity}`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Test: Judge Registry
// ═════════════════════════════════════════════════════════════════════════════

describe("Judge Registry", () => {
  it("should have exactly 30 judges registered", () => {
    assert.equal(JUDGES.length, 30);
  });

  it("should allow lookup of every judge by ID", () => {
    for (const judge of JUDGES) {
      const found = getJudge(judge.id);
      assert.ok(found, `getJudge("${judge.id}") should return a judge`);
      assert.equal(found!.id, judge.id);
    }
  });

  it("should return undefined for an unknown judge ID", () => {
    assert.equal(getJudge("nonexistent-judge"), undefined);
  });

  it("every judge should have required fields", () => {
    for (const judge of JUDGES) {
      assert.ok(judge.id, "id must be set");
      assert.ok(judge.name, "name must be set");
      assert.ok(judge.domain, "domain must be set");
      assert.ok(judge.description, "description must be set");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Full Tribunal Evaluation
// ═════════════════════════════════════════════════════════════════════════════

describe("Full Tribunal Evaluation", () => {
  let verdict: TribunalVerdict;

  it("should run without throwing", () => {
    verdict = evaluateWithTribunal(sampleCode, "typescript");
    assert.ok(verdict);
  });

  it("should produce a FAIL verdict for the sample code", () => {
    assert.equal(verdict.overallVerdict, "fail");
  });

  it("should have a low score for heavily flawed code", () => {
    assert.ok(
      verdict.overallScore < 75,
      `Expected score < 75, got ${verdict.overallScore}`
    );
  });

  it("should detect critical findings", () => {
    assert.ok(
      verdict.criticalCount > 0,
      `Expected at least 1 critical finding, got ${verdict.criticalCount}`
    );
  });

  it("should detect high findings", () => {
    assert.ok(
      verdict.highCount > 0,
      `Expected at least 1 high finding, got ${verdict.highCount}`
    );
  });

  it("should produce evaluations from all 30 judges", () => {
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should include a timestamp", () => {
    assert.ok(verdict.timestamp);
    // Should be a valid ISO date
    assert.ok(!isNaN(Date.parse(verdict.timestamp)));
  });

  it("should produce a non-empty summary", () => {
    assert.ok(verdict.summary.length > 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Individual Judge Evaluations Against Sample Code
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Map of judge ID → expected ruleId prefix and minimum number of findings
 * the sample-vulnerable-api.ts should trigger.
 */
const JUDGE_EXPECTATIONS: Record<
  string,
  { prefix: string; minFindings: number; expectVerdict?: Verdict }
> = {
  "data-security":       { prefix: "DATA",   minFindings: 3, expectVerdict: "fail" },
  "cybersecurity":       { prefix: "CYBER",  minFindings: 3, expectVerdict: "fail" },
  "cost-effectiveness":  { prefix: "COST",   minFindings: 2 },
  "scalability":         { prefix: "SCALE",  minFindings: 1 },
  "cloud-readiness":     { prefix: "CLOUD",  minFindings: 1 },
  "software-practices":  { prefix: "SWDEV",  minFindings: 2 },
  "accessibility":       { prefix: "A11Y",   minFindings: 2 },
  "api-design":          { prefix: "API",    minFindings: 1 },
  "reliability":         { prefix: "REL",    minFindings: 2 },
  "observability":       { prefix: "OBS",    minFindings: 2 },
  "performance":         { prefix: "PERF",   minFindings: 2 },
  "compliance":          { prefix: "COMP",   minFindings: 2 },
  "testing":             { prefix: "TEST",   minFindings: 1 },
  "documentation":       { prefix: "DOC",    minFindings: 1 },
  "internationalization": { prefix: "I18N",  minFindings: 1 },
  "dependency-health":   { prefix: "DEPS",   minFindings: 1 },
  "concurrency":         { prefix: "CONC",   minFindings: 1 },
  "ethics-bias":         { prefix: "ETHICS", minFindings: 2 },
  "maintainability":     { prefix: "MAINT",  minFindings: 3 },
  "error-handling":      { prefix: "ERR",    minFindings: 2 },
  "authentication":      { prefix: "AUTH",   minFindings: 3, expectVerdict: "fail" },
  "database":            { prefix: "DB",     minFindings: 3, expectVerdict: "fail" },
  "caching":             { prefix: "CACHE",  minFindings: 2 },
  "configuration-management": { prefix: "CFG", minFindings: 3, expectVerdict: "fail" },
  "backwards-compatibility":  { prefix: "COMPAT", minFindings: 2 },
  "portability":         { prefix: "PORTA",  minFindings: 3, expectVerdict: "fail" },
  "ux":                  { prefix: "UX",     minFindings: 2 },
  "logging-privacy":     { prefix: "LOGPRIV", minFindings: 3, expectVerdict: "fail" },
  "rate-limiting":       { prefix: "RATE",   minFindings: 3, expectVerdict: "fail" },
  "ci-cd":               { prefix: "CICD",   minFindings: 3 },
};

describe("Individual Judge Evaluations", () => {
  for (const judge of JUDGES) {
    describe(judge.name, () => {
      let evaluation: JudgeEvaluation;
      const expectations = JUDGE_EXPECTATIONS[judge.id];

      it("should evaluate without throwing", () => {
        evaluation = evaluateWithJudge(judge, sampleCode, "typescript");
        assert.ok(evaluation);
      });

      it("should return the correct judgeId", () => {
        assert.equal(evaluation.judgeId, judge.id);
      });

      it("should return the correct judgeName", () => {
        assert.equal(evaluation.judgeName, judge.name);
      });

      it("should return a valid verdict", () => {
        assert.ok(
          ["pass", "fail", "warning"].includes(evaluation.verdict),
          `Invalid verdict: ${evaluation.verdict}`
        );
      });

      it("should return a score between 0 and 100", () => {
        assert.ok(evaluation.score >= 0, `Score below 0: ${evaluation.score}`);
        assert.ok(evaluation.score <= 100, `Score above 100: ${evaluation.score}`);
      });

      it("should produce well-formed findings", () => {
        findingsAreWellFormed(evaluation.findings);
      });

      if (expectations) {
        it(`should produce findings with ${expectations.prefix}- prefix`, () => {
          assert.ok(
            hasRulePrefix(evaluation.findings, expectations.prefix),
            `Expected at least one finding with prefix "${expectations.prefix}"`
          );
        });

        it(`should produce at least ${expectations.minFindings} finding(s)`, () => {
          assert.ok(
            evaluation.findings.length >= expectations.minFindings,
            `Expected >= ${expectations.minFindings} findings, got ${evaluation.findings.length}`
          );
        });

        if (expectations.expectVerdict) {
          it(`should return verdict "${expectations.expectVerdict}"`, () => {
            assert.equal(evaluation.verdict, expectations.expectVerdict);
          });
        }
      }

      it("should produce a non-empty summary", () => {
        assert.ok(evaluation.summary.length > 0);
      });
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Clean Code (minimal findings)
// ═════════════════════════════════════════════════════════════════════════════

describe("Clean Code Evaluation", () => {
  const cleanCode = `
/**
 * A well-structured Express API endpoint.
 * @param req - Express Request
 * @param res - Express Response
 */
import { Router } from "express";

const router = Router();

/**
 * Retrieves a list of items from the database.
 */
router.get("/items", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const items = await db.find({}).limit(limit);
    res.json({ data: items, count: items.length });
  } catch (error) {
    console.error("Failed to fetch items:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
`;

  it("should produce a higher score than the flawed sample", () => {
    const cleanVerdict = evaluateWithTribunal(cleanCode, "typescript");
    const flawedVerdict = evaluateWithTribunal(sampleCode, "typescript");
    assert.ok(
      cleanVerdict.overallScore > flawedVerdict.overallScore,
      `Clean (${cleanVerdict.overallScore}) should score higher than flawed (${flawedVerdict.overallScore})`
    );
  });

  it("should produce fewer total findings than the flawed sample", () => {
    const cleanVerdict = evaluateWithTribunal(cleanCode, "typescript");
    const flawedVerdict = evaluateWithTribunal(sampleCode, "typescript");
    const cleanTotal = cleanVerdict.evaluations.reduce(
      (s, e) => s + e.findings.length,
      0
    );
    const flawedTotal = flawedVerdict.evaluations.reduce(
      (s, e) => s + e.findings.length,
      0
    );
    assert.ok(
      cleanTotal < flawedTotal,
      `Clean (${cleanTotal} findings) should have fewer findings than flawed (${flawedTotal})`
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Markdown Formatters
// ═════════════════════════════════════════════════════════════════════════════

describe("Markdown Formatters", () => {
  it("formatVerdictAsMarkdown should produce valid markdown", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const md = formatVerdictAsMarkdown(verdict);
    assert.ok(md.length > 0, "Markdown output should be non-empty");
    assert.ok(md.includes("# Judges Panel"), "Should include tribunal header");
    assert.ok(md.includes("CRITICAL") || md.includes("HIGH"), "Should include severity badges");
  });

  it("formatEvaluationAsMarkdown should produce valid markdown", () => {
    const judge = JUDGES[0];
    const evaluation = evaluateWithJudge(judge, sampleCode, "typescript");
    const md = formatEvaluationAsMarkdown(evaluation);
    assert.ok(md.length > 0, "Markdown output should be non-empty");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Edge Cases
// ═════════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("should handle empty code gracefully", () => {
    const verdict = evaluateWithTribunal("", "typescript");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should handle unknown language gracefully", () => {
    const verdict = evaluateWithTribunal(sampleCode, "brainfuck");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });

  it("should handle very short code gracefully", () => {
    const verdict = evaluateWithTribunal("const x = 1;", "javascript");
    assert.ok(verdict);
    assert.ok(verdict.overallScore >= 0);
  });

  it("should handle code with only comments", () => {
    const verdict = evaluateWithTribunal("// This is a comment\n// Another comment", "typescript");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, 30);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Multi-Language Support
// ═════════════════════════════════════════════════════════════════════════════

describe("Multi-Language Support", () => {
  const pythonCode = `
import os, pickle, hashlib

def handle_request(user_input):
    # eval usage
    result = eval(user_input)
    # SQL injection
    query = "SELECT * FROM users WHERE id = " + user_input
    # weak hash
    h = hashlib.md5(user_input.encode()).hexdigest()
    # hardcoded password
    password = "admin123"
    data = pickle.loads(user_input)
    os.system("rm -rf " + user_input)
    return result
`;

  const rustCode = `
use std::sync::Mutex;
use std::collections::HashMap;

static GLOBAL_STATE: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());

fn process(input: &str) -> String {
    let result = GLOBAL_STATE.lock().unwrap();
    let query = format!("SELECT * FROM users WHERE id = {}", input);
    let password = "secret123";
    println!("Processing: {}", input);
    result.get(input).unwrap().clone()
}
`;

  const goCode = `
package main

import (
    "database/sql"
    "fmt"
    "os/exec"
    "net/http"
    "crypto/md5"
)

var globalCache = make(map[string]string)

func handler(w http.ResponseWriter, r *http.Request) {
    input := r.URL.Query().Get("input")
    cmd := exec.Command("bash", "-c", input)
    cmd.Run()
    query := fmt.Sprintf("SELECT * FROM users WHERE id = %s", input)
    db, _ := sql.Open("mysql", "root:password@/db")
    db.Query(query)
    h := md5.Sum([]byte(input))
    fmt.Println("Processed:", input)
}
`;

  const javaCode = `
import java.sql.*;
import java.security.MessageDigest;

public class Handler {
    private static String password = "hunter2";

    public void handle(String input) throws Exception {
        Runtime.getRuntime().exec(input);
        Connection conn = DriverManager.getConnection("jdbc:mysql://localhost/db");
        Statement stmt = conn.createStatement();
        stmt.executeQuery("SELECT * FROM users WHERE id = " + input);
        MessageDigest md = MessageDigest.getInstance("MD5");
        System.out.println("Processed: " + input);
    }
}
`;

  const csharpCode = `
using System;
using System.Data.SqlClient;
using System.Diagnostics;
using System.Security.Cryptography;

public class Handler {
    private string password = "letmein";

    public void Handle(string input) {
        Process.Start(input);
        var conn = new SqlConnection("Server=.;Database=db;User=sa;Password=pass;");
        var cmd = new SqlCommand("SELECT * FROM users WHERE id = " + input, conn);
        var md5 = MD5.Create();
        Console.WriteLine("Processed: " + input);
    }
}
`;

  const samples: Array<{ lang: string; code: string; label: string }> = [
    { lang: "python", code: pythonCode, label: "Python" },
    { lang: "rust", code: rustCode, label: "Rust" },
    { lang: "go", code: goCode, label: "Go" },
    { lang: "java", code: javaCode, label: "Java" },
    { lang: "csharp", code: csharpCode, label: "C#" },
  ];

  for (const { lang, code, label } of samples) {
    describe(`${label} code analysis`, () => {
      let verdict: TribunalVerdict;

      it(`should evaluate ${label} code without throwing`, () => {
        verdict = evaluateWithTribunal(code, lang);
        assert.ok(verdict);
      });

      it(`should produce evaluations from all 30 judges for ${label}`, () => {
        assert.equal(verdict.evaluations.length, 30);
      });

      it(`should detect at least some findings in flawed ${label} code`, () => {
        const total = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        assert.ok(total > 0, `Expected findings in flawed ${label} code, got ${total}`);
      });

      it(`should detect security issues in ${label} code`, () => {
        const secFindings = verdict.evaluations
          .filter((e) => e.judgeId === "cybersecurity" || e.judgeId === "data-security")
          .flatMap((e) => e.findings);
        assert.ok(
          secFindings.length > 0,
          `Expected security findings in ${label} code`
        );
      });

      it(`should produce a score below 100 for flawed ${label} code`, () => {
        assert.ok(
          verdict.overallScore < 100,
          `Expected score < 100 for flawed ${label} code, got ${verdict.overallScore}`
        );
      });
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Project Evaluation (multi-file)
// ═════════════════════════════════════════════════════════════════════════════

describe("Project Evaluation", () => {
  const projectFiles = [
    {
      path: "src/server.ts",
      language: "typescript",
      content: `
import express from "express";
const app = express();
app.get("/api/data", (req, res) => {
  const q = "SELECT * FROM t WHERE id=" + req.query.id;
  res.json({ data: q });
});
app.listen(3000);
`,
    },
    {
      path: "src/utils.ts",
      language: "typescript",
      content: `
export function helper(input: string) {
  return eval(input);
}
export function formatDate(d: Date): string {
  return d.toISOString();
}
`,
    },
    {
      path: "src/handler.py",
      language: "python",
      content: `
import os
def helper(input):
    return eval(input)
def process(data):
    os.system("ls " + data)
`,
    },
  ];

  let result: ProjectVerdict;

  it("should evaluate a project without throwing", () => {
    result = evaluateProject(projectFiles);
    assert.ok(result);
  });

  it("should produce per-file results", () => {
    assert.equal(result.fileResults.length, 3);
    for (const fr of result.fileResults) {
      assert.ok(fr.path.length > 0);
      assert.ok(fr.score >= 0 && fr.score <= 100);
    }
  });

  it("should produce architectural findings for duplicated helper()", () => {
    assert.ok(
      result.architecturalFindings.length > 0,
      `Expected architectural findings for duplicate functions across files`
    );
  });

  it("should produce a summary", () => {
    assert.ok(result.summary.length > 0);
  });

  it("should produce an overall score", () => {
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  });

  it("should produce a valid overall verdict", () => {
    assert.ok(["pass", "fail", "warning"].includes(result.overallVerdict));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Diff Evaluation
// ═════════════════════════════════════════════════════════════════════════════

describe("Diff Evaluation", () => {
  const diffCode = `
import express from "express";
const app = express();

// safe line
const port = 3000;

// dangerous line at ~line 8
app.get("/data", (req, res) => {
  const q = "SELECT * FROM t WHERE id=" + req.query.id;
  eval(req.body.code);
  res.json({});
});

app.listen(port);
`;

  let result: DiffVerdict;

  it("should evaluate a diff without throwing", () => {
    result = evaluateDiff(diffCode, "typescript", [8, 9, 10, 11]);
    assert.ok(result);
  });

  it("should report the number of changed lines", () => {
    assert.equal(result.linesAnalyzed, 4);
  });

  it("should filter findings to only changed lines", () => {
    for (const f of result.findings) {
      assert.ok(
        f.lineNumbers && f.lineNumbers.some((ln) => [8, 9, 10, 11].includes(ln)),
        `Finding ${f.ruleId} should reference changed lines`
      );
    }
  });

  it("should produce a score", () => {
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it("should produce a valid verdict", () => {
    assert.ok(["pass", "fail", "warning"].includes(result.verdict));
  });

  it("should have fewer findings than full analysis", () => {
    const fullVerdict = evaluateWithTribunal(diffCode, "typescript");
    const fullFindings = fullVerdict.evaluations.flatMap((e) => e.findings);
    assert.ok(
      result.findings.length <= fullFindings.length,
      `Diff findings (${result.findings.length}) should be <= full findings (${fullFindings.length})`
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Dependency / Supply-chain Analysis
// ═════════════════════════════════════════════════════════════════════════════

describe("Dependency Analysis", () => {
  describe("package.json analysis", () => {
    const manifest = JSON.stringify({
      dependencies: {
        express: "*",
        lodash: "^4.17.21",
        "event-stream": "3.3.6",
      },
      devDependencies: {
        jest: "^29.0.0",
        typescript: "~5.0.0",
      },
    });

    let result: DependencyVerdict;

    it("should analyze package.json without throwing", () => {
      result = analyzeDependencies(manifest, "package.json");
      assert.ok(result);
    });

    it("should parse all dependencies", () => {
      assert.equal(result.totalDependencies, 5);
      assert.equal(result.dependencies.length, 5);
    });

    it("should detect unpinned version (*)", () => {
      const unpinned = result.findings.filter((f) => f.title.toLowerCase().includes("unpinned") || f.description.includes("*"));
      assert.ok(unpinned.length > 0, "Should flag unpinned version *");
    });

    it("should produce a score", () => {
      assert.ok(result.score >= 0 && result.score <= 100);
    });

    it("should produce a valid verdict", () => {
      assert.ok(["pass", "fail", "warning"].includes(result.verdict));
    });

    it("should produce a summary", () => {
      assert.ok(result.summary.length > 0);
    });
  });

  describe("requirements.txt analysis", () => {
    const manifest = `
flask
requests==2.28.0
django>=3.2
numpy
`;

    let result: DependencyVerdict;

    it("should analyze requirements.txt without throwing", () => {
      result = analyzeDependencies(manifest, "requirements.txt");
      assert.ok(result);
    });

    it("should parse dependencies", () => {
      assert.ok(result.totalDependencies >= 3, `Expected >=3 deps, got ${result.totalDependencies}`);
    });

    it("should detect unpinned dependencies", () => {
      const unpinned = result.findings.filter((f) => f.title.toLowerCase().includes("unpinned") || f.description.toLowerCase().includes("unpin"));
      assert.ok(unpinned.length > 0, "Should flag unpinned Python deps");
    });
  });

  describe("Cargo.toml analysis", () => {
    const manifest = `
[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = "*"
tokio = { version = "1", features = ["full"] }
actix-web = "4.0"
`;

    let result: DependencyVerdict;

    it("should analyze Cargo.toml without throwing", () => {
      result = analyzeDependencies(manifest, "Cargo.toml");
      assert.ok(result);
    });

    it("should parse dependencies", () => {
      assert.ok(result.totalDependencies >= 3, `Expected >=3 deps, got ${result.totalDependencies}`);
    });

    it("should detect wildcard version", () => {
      const wildcard = result.findings.filter((f) => f.description.includes("*") || f.title.toLowerCase().includes("unpinned"));
      assert.ok(wildcard.length > 0, "Should flag wildcard * version in Cargo.toml");
    });
  });

  describe("go.mod analysis", () => {
    const manifest = `
module example.com/myapp

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-sql-driver/mysql v1.7.0
)
`;

    let result: DependencyVerdict;

    it("should analyze go.mod without throwing", () => {
      result = analyzeDependencies(manifest, "go.mod");
      assert.ok(result);
    });

    it("should parse dependencies", () => {
      assert.ok(result.totalDependencies >= 2, `Expected >=2 deps, got ${result.totalDependencies}`);
    });
  });

  describe("invalid manifest", () => {
    it("should handle malformed JSON gracefully", () => {
      const result = analyzeDependencies("{invalid json", "package.json");
      assert.ok(result);
      assert.ok(result.findings.length > 0, "Should report parse error");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: suggestedFix Field
// ═════════════════════════════════════════════════════════════════════════════

describe("suggestedFix Support", () => {
  it("should include suggestedFix on some findings for flawed code", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const allFindings = verdict.evaluations.flatMap((e) => e.findings);
    const withFix = allFindings.filter((f) => f.suggestedFix && f.suggestedFix.length > 0);
    assert.ok(
      withFix.length > 0,
      `Expected at least one finding with suggestedFix, found ${withFix.length}`
    );
  });
});
