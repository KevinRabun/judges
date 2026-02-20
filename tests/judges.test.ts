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
  runAppBuilderWorkflow,
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
  it("should have exactly 32 judges registered", () => {
    assert.equal(JUDGES.length, 32);
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

  it("should produce evaluations from all judges", () => {
    assert.equal(verdict.evaluations.length, JUDGES.length);
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
  "data-sovereignty":    { prefix: "SOV",    minFindings: 1 },
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
  "code-structure":       { prefix: "STRUCT", minFindings: 1 },
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
// Test: Data Sovereignty Judge
// ═════════════════════════════════════════════════════════════════════════════

describe("Data Sovereignty Judge", () => {
  const riskyCode = `
const defaultRegion = "global";
async function syncCustomerData(payload) {
  await fetch("https://thirdparty.example.com/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function configureStorage() {
  return { replication: "geo-redundant", backup: "cross-region" };
}
`;

  const guardedCode = `
const approvedRegions = ["eu-west-1", "eu-central-1"];

function assertResidency(region: string) {
  if (!approvedRegions.includes(region)) {
    throw new Error("residencyViolation");
  }
}

async function exportAggregated(region: string, payload: unknown) {
  assertResidency(region);
  return fetch("https://eu-api.example.com/report", {
    method: "POST",
    body: JSON.stringify({ region, payload }),
  });
}
`;

  it("should trigger SOV findings for risky cross-border patterns", () => {
    const judge = getJudge("data-sovereignty");
    assert.ok(judge, "data-sovereignty judge should exist");

    const evaluation = evaluateWithJudge(judge!, riskyCode, "typescript");
    assert.ok(
      hasRulePrefix(evaluation.findings, "SOV"),
      "Expected at least one SOV-* finding"
    );
    assert.ok(evaluation.findings.length > 0, "Expected sovereignty findings");
  });

  it("should score guarded code higher than risky code", () => {
    const judge = getJudge("data-sovereignty");
    assert.ok(judge, "data-sovereignty judge should exist");

    const risky = evaluateWithJudge(judge!, riskyCode, "typescript");
    const guarded = evaluateWithJudge(judge!, guardedCode, "typescript");

    assert.ok(
      guarded.score >= risky.score,
      `Expected guarded score (${guarded.score}) >= risky score (${risky.score})`
    );
  });
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
    assert.equal(verdict.evaluations.length, JUDGES.length);
  });

  it("should handle unknown language gracefully", () => {
    const verdict = evaluateWithTribunal(sampleCode, "brainfuck");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, JUDGES.length);
  });

  it("should handle very short code gracefully", () => {
    const verdict = evaluateWithTribunal("const x = 1;", "javascript");
    assert.ok(verdict);
    assert.ok(verdict.overallScore >= 0);
  });

  it("should handle code with only comments", () => {
    const verdict = evaluateWithTribunal("// This is a comment\n// Another comment", "typescript");
    assert.ok(verdict);
    assert.equal(verdict.evaluations.length, JUDGES.length);
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

      it(`should produce evaluations from all judges for ${label}`, () => {
        assert.equal(verdict.evaluations.length, JUDGES.length);
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
// Test: App Builder Workflow (review → translate → task plan)
// ═════════════════════════════════════════════════════════════════════════════

describe("App Builder Workflow", () => {
  it("should produce do-not-ship for heavily flawed code", () => {
    const result = runAppBuilderWorkflow({
      code: sampleCode,
      language: "typescript",
    });

    assert.equal(result.mode, "code");
    assert.equal(result.releaseDecision, "do-not-ship");
    assert.ok(result.criticalCount > 0, "Expected critical findings");
    assert.ok(result.plainLanguageFindings.length > 0, "Expected translated findings");
    assert.ok(result.tasks.length > 0, "Expected remediation tasks");
  });

  it("should support project mode and produce prioritized tasks", () => {
    const result = runAppBuilderWorkflow({
      files: [
        {
          path: "src/a.ts",
          language: "typescript",
          content: `export function bad(input: string) { return eval(input); }`,
        },
        {
          path: "src/b.ts",
          language: "typescript",
          content: `export const pwd = "admin123";`,
        },
      ],
      maxTasks: 5,
    });

    assert.equal(result.mode, "project");
    assert.ok(result.tasks.length > 0, "Expected tasks in project mode");
    assert.ok(
      result.tasks.every((task) => ["P0", "P1", "P2"].includes(task.priority)),
      "Tasks should have valid priority"
    );
  });

  it("should support diff mode and return AI-fixable P0/P1 subset", () => {
    const code = `
app.get("/data", (req, res) => {
  const q = "SELECT * FROM t WHERE id=" + req.query.id;
  eval(req.body.code);
  res.json({ ok: true });
});`;

    const result = runAppBuilderWorkflow({
      code,
      language: "typescript",
      changedLines: [2, 3, 4],
    });

    assert.equal(result.mode, "diff");
    assert.ok(Array.isArray(result.aiFixableNow));
    assert.ok(
      result.aiFixableNow.every(
        (task) => task.aiFixable && (task.priority === "P0" || task.priority === "P1")
      ),
      "AI-fixable-now list should only contain P0/P1 AI-fixable tasks"
    );
  });

  it("should throw for invalid mode input", () => {
    assert.throws(
      () =>
        runAppBuilderWorkflow({
          changedLines: [1, 2],
          language: "typescript",
        }),
      /requires both code and language inputs/
    );
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

// ═════════════════════════════════════════════════════════════════════════════
// Test: AST / Structural Analysis
// ═════════════════════════════════════════════════════════════════════════════

import { analyzeStructure } from "../src/ast/index.js";
import { analyzeCodeStructure } from "../src/evaluators/code-structure.js";

describe("AST Analysis — TypeScript", () => {
  const tsCode = `
function simple(a: number, b: number): number {
  return a + b;
}

function complex(x: number): string {
  if (x > 0) {
    if (x > 10) {
      if (x > 100) {
        if (x > 1000) {
          if (x > 10000) {
            return "huge";
          }
          return "very large";
        }
        return "large";
      }
      return "medium";
    }
    return "small";
  }
  return "zero or negative";
}

function tooManyParams(a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any, i: any): void {
  console.log(a);
}
`;

  it("should parse TypeScript code into a CodeStructure", () => {
    const structure = analyzeStructure(tsCode, "typescript");
    assert.ok(structure);
    assert.equal(structure.language, "typescript");
    assert.ok(structure.functions.length >= 3, `Expected >=3 functions, got ${structure.functions.length}`);
  });

  it("should compute cyclomatic complexity", () => {
    const structure = analyzeStructure(tsCode, "typescript");
    const complexFn = structure.functions.find((f) => f.name === "complex");
    assert.ok(complexFn, "Should find the 'complex' function");
    assert.ok(complexFn!.cyclomaticComplexity >= 5, `Expected CC >= 5, got ${complexFn!.cyclomaticComplexity}`);
  });

  it("should compute nesting depth", () => {
    const structure = analyzeStructure(tsCode, "typescript");
    const complexFn = structure.functions.find((f) => f.name === "complex");
    assert.ok(complexFn, "Should find the 'complex' function");
    assert.ok(complexFn!.maxNestingDepth >= 4, `Expected nesting >= 4, got ${complexFn!.maxNestingDepth}`);
  });

  it("should count parameters", () => {
    const structure = analyzeStructure(tsCode, "typescript");
    const manyParams = structure.functions.find((f) => f.name === "tooManyParams");
    assert.ok(manyParams, "Should find the 'tooManyParams' function");
    assert.equal(manyParams!.parameterCount, 9);
  });

  it("should detect any type usage", () => {
    const structure = analyzeStructure(tsCode, "typescript");
    assert.ok(structure.typeAnyLines.length > 0, "Should detect 'any' type annotations");
  });

  it("should detect deeply nested code via evaluator", () => {
    const findings = analyzeCodeStructure(tsCode, "typescript");
    const deepNest = findings.filter((f) => f.ruleId === "STRUCT-002");
    assert.ok(deepNest.length > 0, "Should flag deeply nested code");
  });

  it("should detect too many parameters via evaluator", () => {
    const findings = analyzeCodeStructure(tsCode, "typescript");
    const params = findings.filter((f) => f.ruleId === "STRUCT-004" || f.ruleId === "STRUCT-009");
    assert.ok(params.length > 0, "Should flag excessive parameters");
  });

  it("should detect any types via evaluator", () => {
    const findings = analyzeCodeStructure(tsCode, "typescript");
    const anyTypes = findings.filter((f) => f.ruleId === "STRUCT-006");
    assert.ok(anyTypes.length > 0, "Should flag any type usage");
  });
});

describe("AST Analysis — Dead Code Detection", () => {
  const deadCode = `
function hasDeadCode(): string {
  return "early";
  console.log("this is dead");
  const x = 42;
}
`;

  it("should detect unreachable code after return", () => {
    const structure = analyzeStructure(deadCode, "typescript");
    assert.ok(structure.deadCodeLines.length > 0, "Should detect dead code lines");
  });

  it("should produce STRUCT-005 findings", () => {
    const findings = analyzeCodeStructure(deadCode, "typescript");
    const dead = findings.filter((f) => f.ruleId === "STRUCT-005");
    assert.ok(dead.length > 0, "Should flag dead code");
  });
});

describe("AST Analysis — Long Functions", () => {
  // Generate a function with 60 lines
  const longLines = Array.from({ length: 55 }, (_, i) => `  const v${i} = ${i};`).join("\n");
  const longFnCode = `function longFunction() {\n${longLines}\n  return 0;\n}`;

  it("should detect long functions (>50 lines)", () => {
    const findings = analyzeCodeStructure(longFnCode, "typescript");
    const longFn = findings.filter((f) => f.ruleId === "STRUCT-003");
    assert.ok(longFn.length > 0, "Should flag long function");
  });
});

describe("AST Analysis — Python", () => {
  const pythonCode = `
def simple(a, b):
    return a + b

def complex_function(x):
    if x > 0:
        if x > 10:
            if x > 100:
                if x > 1000:
                    if x > 10000:
                        return "huge"
                    return "very large"
                return "large"
            return "medium"
        return "small"
    return "zero"

def too_many(a, b, c, d, e, f, g, h, i):
    pass
`;

  it("should parse Python code into a CodeStructure", () => {
    const structure = analyzeStructure(pythonCode, "python");
    assert.ok(structure);
    assert.equal(structure.language, "python");
    assert.ok(structure.functions.length >= 3, `Expected >=3 functions, got ${structure.functions.length}`);
  });

  it("should count parameters in Python", () => {
    const structure = analyzeStructure(pythonCode, "python");
    const manyParams = structure.functions.find((f) => f.name === "too_many");
    assert.ok(manyParams, "Should find too_many function");
    assert.equal(manyParams!.parameterCount, 9);
  });

  it("should detect complexity in Python", () => {
    const findings = analyzeCodeStructure(pythonCode, "python");
    assert.ok(findings.length > 0, "Should produce at least one finding for complex Python code");
  });
});

describe("AST Analysis — Go", () => {
  const goCode = `
package main

func simple(a int, b int) int {
    return a + b
}

func complex(x int) string {
    if x > 0 {
        if x > 10 {
            if x > 100 {
                if x > 1000 {
                    if x > 10000 {
                        return "huge"
                    }
                    return "very large"
                }
                return "large"
            }
            return "medium"
        }
        return "small"
    }
    return "zero"
}
`;

  it("should parse Go code into a CodeStructure", () => {
    const structure = analyzeStructure(goCode, "go");
    assert.ok(structure);
    assert.equal(structure.language, "go");
    assert.ok(structure.functions.length >= 2, `Expected >=2 functions, got ${structure.functions.length}`);
  });

  it("should detect deep nesting in Go", () => {
    const structure = analyzeStructure(goCode, "go");
    assert.ok(structure.maxNestingDepth >= 4, `Expected nesting >= 4, got ${structure.maxNestingDepth}`);
  });
});

describe("AST Analysis — Rust", () => {
  const rustCode = `
fn simple(a: i32, b: i32) -> i32 {
    a + b
}

fn complex(x: i32) -> &'static str {
    if x > 0 {
        if x > 10 {
            if x > 100 {
                if x > 1000 {
                    return "huge";
                }
                return "large";
            }
            return "medium";
        }
        return "small";
    }
    "zero"
}

unsafe fn dangerous() {
    let ptr: *const i32 = std::ptr::null();
}
`;

  it("should parse Rust code into a CodeStructure", () => {
    const structure = analyzeStructure(rustCode, "rust");
    assert.ok(structure);
    assert.equal(structure.language, "rust");
    assert.ok(structure.functions.length >= 2, `Expected >=2 functions, got ${structure.functions.length}`);
  });

  it("should detect unsafe in Rust as weak type usage", () => {
    const structure = analyzeStructure(rustCode, "rust");
    assert.ok(structure.typeAnyLines.length > 0, "Should detect unsafe usage");
  });
});

describe("AST Analysis — Java", () => {
  const javaCode = `
public class Example {
    public int simple(int a, int b) {
        return a + b;
    }

    public String complex(int x) {
        if (x > 0) {
            if (x > 10) {
                if (x > 100) {
                    if (x > 1000) {
                        return "huge";
                    }
                    return "large";
                }
                return "medium";
            }
            return "small";
        }
        return "zero";
    }

    public void tooMany(Object a, Object b, Object c, Object d, Object e, Object f, Object g, Object h, Object i) {
        System.out.println(a);
    }
}
`;

  it("should parse Java code into a CodeStructure", () => {
    const structure = analyzeStructure(javaCode, "java");
    assert.ok(structure);
    assert.equal(structure.language, "java");
    assert.ok(structure.functions.length >= 2, `Expected >=2 functions, got ${structure.functions.length}`);
  });
});

describe("AST Analysis — C#", () => {
  const csharpCode = `
public class Example {
    public int Simple(int a, int b) {
        return a + b;
    }

    public string Complex(int x) {
        if (x > 0) {
            if (x > 10) {
                if (x > 100) {
                    if (x > 1000) {
                        return "huge";
                    }
                    return "large";
                }
                return "medium";
            }
            return "small";
        }
        return "zero";
    }

    public void TooMany(dynamic a, dynamic b, dynamic c, dynamic d, dynamic e, dynamic f, dynamic g, dynamic h, dynamic i) {
        Console.WriteLine(a);
    }
}
`;

  it("should parse C# code into a CodeStructure", () => {
    const structure = analyzeStructure(csharpCode, "csharp");
    assert.ok(structure);
    assert.equal(structure.language, "csharp");
    assert.ok(structure.functions.length >= 2, `Expected >=2 functions, got ${structure.functions.length}`);
  });

  it("should detect dynamic type usage in C#", () => {
    const structure = analyzeStructure(csharpCode, "csharp");
    assert.ok(structure.typeAnyLines.length > 0, "Should detect dynamic type usage");
  });
});

describe("AST Analysis — Unknown Language", () => {
  it("should return a minimal structure for unknown languages", () => {
    const structure = analyzeStructure("some code", "brainfuck");
    assert.ok(structure);
    assert.equal(structure.functions.length, 0);
  });
});
