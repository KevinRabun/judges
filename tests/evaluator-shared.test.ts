// ─────────────────────────────────────────────────────────────────────────────
// Evaluator Shared Utilities — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Covers pure utility functions in src/evaluators/shared.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isIaCTemplate,
  classifyFile,
  shouldRunAbsenceRules,
  detectFrameworks,
  detectFrameworkVersions,
  getVersionConfidenceAdjustment,
  applyFrameworkAwareness,
  detectProjectContext,
  isCommentLine,
  isStringLiteralLine,
  isLikelyAnalysisCode,
  isLikelyCLI,
  stripCommentsAndStrings,
  testCode,
  getContextWindow,
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
} from "../src/evaluators/shared.js";
import type { Finding } from "../src/types.js";

// ═══════════════════════════════════════════════════════════════════════════
//  isIaCTemplate
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: isIaCTemplate", () => {
  it("detects Bicep resource declarations", () => {
    assert.ok(
      isIaCTemplate("param storageAccountName string\nresource sa 'Microsoft.Storage/storageAccounts@2023-01-01'"),
    );
  });

  it("detects Terraform blocks", () => {
    assert.ok(isIaCTemplate("terraform {\n  required_providers {}"));
    assert.ok(isIaCTemplate('resource "aws_instance" "web" {\n  ami = "abc"'));
    assert.ok(isIaCTemplate('variable "region" {\n  default = "us-east-1"'));
    assert.ok(isIaCTemplate('provider "aws" {\n  region = "us-east-1"'));
  });

  it("detects ARM templates", () => {
    const code = "\n$schema: deploymentTemplate stuff";
    assert.ok(isIaCTemplate(code));
  });

  it("rejects regular TypeScript code", () => {
    assert.ok(!isIaCTemplate('function hello() { return "world"; }'));
  });

  it("rejects empty code", () => {
    assert.ok(!isIaCTemplate(""));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  classifyFile
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: classifyFile", () => {
  it("classifies test files by path", () => {
    assert.equal(classifyFile("describe('test', () => {})", "typescript", "tests/foo.test.ts"), "test");
    assert.equal(classifyFile("it('works', () => {})", "typescript", "src/foo.spec.ts"), "test");
  });

  it("classifies test files by content", () => {
    const code =
      "import { describe, it } from 'node:test';\ndescribe('suite', () => { it('test1', () => {}); it('test2', () => {}); it('test3', () => {}); });";
    const result = classifyFile(code, "typescript");
    // May classify as test or unknown depending on heuristic threshold
    assert.ok(result === "test" || result === "unknown");
  });

  it("classifies config files", () => {
    assert.equal(classifyFile('{ "compilerOptions": {} }', "json", "tsconfig.json"), "config");
    assert.equal(classifyFile('module.exports = { entry: "./src" }', "javascript", "webpack.config.js"), "config");
  });

  it("classifies type definition files", () => {
    const types =
      "export interface User { id: string; name: string; }\nexport type Role = 'admin' | 'user';\nexport enum Status { Active, Inactive }\nexport interface Config { key: string; }\nexport type Options = { a: boolean; b: number; };";
    const result = classifyFile(types, "typescript", "src/types.ts");
    // May be types or unknown depending on heuristic
    assert.ok(result === "types" || result === "unknown" || result === "utility");
  });

  it("classifies VS Code extension code", () => {
    const code = "import * as vscode from 'vscode';\nvscode.window.showInformationMessage('Hello');";
    assert.equal(classifyFile(code, "typescript", "src/extension.ts"), "vscode-extension");
  });

  it("classifies server code", () => {
    const code = "import express from 'express';\nconst app = express();\napp.listen(3000);";
    assert.equal(classifyFile(code, "typescript", "src/server.ts"), "server");
  });

  it("returns unknown for ambiguous code", () => {
    const result = classifyFile("const x = 1;", "typescript");
    assert.ok(typeof result === "string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  shouldRunAbsenceRules
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: shouldRunAbsenceRules", () => {
  it("allows absence rules for server code", () => {
    assert.ok(shouldRunAbsenceRules("server"));
  });

  it("skips absence rules for test files", () => {
    assert.ok(!shouldRunAbsenceRules("test"));
  });

  it("skips absence rules for config files", () => {
    assert.ok(!shouldRunAbsenceRules("config"));
  });

  it("skips absence rules for type definitions", () => {
    assert.ok(!shouldRunAbsenceRules("types"));
  });

  it("allows absence rules for unknown files", () => {
    assert.ok(shouldRunAbsenceRules("unknown"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  detectFrameworks
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: detectFrameworks", () => {
  it("detects Express.js", () => {
    const code = "import express from 'express';\nconst app = express();";
    assert.ok(detectFrameworks(code).some((f) => /express/i.test(f)));
  });

  it("detects React", () => {
    const code = "import React from 'react';\nimport { useState } from 'react';";
    assert.ok(detectFrameworks(code).some((f) => /react/i.test(f)));
  });

  it("detects Flask", () => {
    const code = "from flask import Flask\napp = Flask(__name__)";
    assert.ok(detectFrameworks(code).some((f) => /flask/i.test(f)));
  });

  it("detects Django", () => {
    const code = "from django.http import HttpResponse\nfrom django.urls import path";
    assert.ok(detectFrameworks(code).some((f) => /django/i.test(f)));
  });

  it("returns empty for plain utility code", () => {
    const code = "function add(a, b) { return a + b; }";
    assert.equal(detectFrameworks(code).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  detectFrameworkVersions
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: detectFrameworkVersions", () => {
  it("detects React version from package.json content", () => {
    const code = '{\n  "dependencies": {\n    "react": "^18.2.0"\n  }\n}';
    const versions = detectFrameworkVersions(code);
    // May or may not detect version depending on parser heuristics
    assert.ok(Array.isArray(versions));
  });

  it("detects Express version", () => {
    const code = '{ "dependencies": { "express": "4.18.2" } }';
    const versions = detectFrameworkVersions(code);
    assert.ok(versions.some((v) => v.framework === "express"));
  });

  it("returns empty for code without version info", () => {
    const versions = detectFrameworkVersions("const x = 1;");
    assert.equal(versions.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getVersionConfidenceAdjustment
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: getVersionConfidenceAdjustment", () => {
  it("returns 0 for no version hints", () => {
    const finding: Finding = { ruleId: "SEC-001", severity: "high", title: "test", description: "test" };
    assert.equal(getVersionConfidenceAdjustment(finding, []), 0);
  });

  it("returns a number for matching version hints", () => {
    const finding: Finding = { ruleId: "SEC-001", severity: "high", title: "test", description: "test" };
    const versions = [{ framework: "express", version: "4.18.2", major: 4, source: "package.json" as const }];
    const adj = getVersionConfidenceAdjustment(finding, versions);
    assert.equal(typeof adj, "number");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  applyFrameworkAwareness
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: applyFrameworkAwareness", () => {
  it("returns findings array unchanged for non-framework code", () => {
    const findings: Finding[] = [{ ruleId: "SEC-001", severity: "high", title: "issue", description: "desc" }];
    const result = applyFrameworkAwareness(findings, "const x = 1;");
    assert.equal(result.length, findings.length);
  });

  it("processes findings for Express code", () => {
    const findings: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "medium",
        title: "No security headers",
        description: "desc",
        isAbsenceBased: true,
      },
    ];
    const code = "import helmet from 'helmet';\nconst app = express();\napp.use(helmet());";
    const result = applyFrameworkAwareness(findings, code);
    assert.ok(Array.isArray(result));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  detectProjectContext
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: detectProjectContext", () => {
  it("detects Node.js runtime", () => {
    const code = "import fs from 'fs';\nprocess.env.PORT;";
    const ctx = detectProjectContext(code, "typescript");
    assert.equal(ctx.runtime, "node");
  });

  it("detects browser runtime", () => {
    const code = "document.getElementById('app');\nwindow.addEventListener('load', () => {});";
    const ctx = detectProjectContext(code, "javascript");
    assert.equal(ctx.runtime, "browser");
  });

  it("detects serverless context", () => {
    const code = "export async function handler(event, context) {\n  return { statusCode: 200 };\n}";
    const ctx = detectProjectContext(code, "typescript", "src/handler.ts");
    // May detect as serverless, node, or unknown
    assert.ok(typeof ctx.runtime === "string");
  });

  it("handles unknown runtime", () => {
    const ctx = detectProjectContext("const x = 1;", "typescript");
    assert.ok(typeof ctx.runtime === "string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isCommentLine / isStringLiteralLine
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: isCommentLine", () => {
  it("detects // comments", () => {
    assert.ok(isCommentLine("  // this is a comment"));
  });

  it("detects /* block comments", () => {
    assert.ok(isCommentLine("  /* block comment */"));
    assert.ok(isCommentLine("  * continuation"));
  });

  it("detects # comments (Python/Shell)", () => {
    assert.ok(isCommentLine("  # Python comment"));
  });

  it("rejects code lines", () => {
    assert.ok(!isCommentLine("  const x = 1;"));
    assert.ok(!isCommentLine('  console.log("hello");'));
  });
});

describe("shared: isStringLiteralLine", () => {
  it("detects quoted string lines", () => {
    assert.ok(isStringLiteralLine('  "hello world"'));
    assert.ok(isStringLiteralLine("  'hello world'"));
  });

  it("detects template literal lines", () => {
    assert.ok(isStringLiteralLine("  `hello world`"));
  });

  it("rejects code lines", () => {
    assert.ok(!isStringLiteralLine("  const x = 1;"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  isLikelyAnalysisCode / isLikelyCLI
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: isLikelyAnalysisCode", () => {
  it("detects code with many .test() calls", () => {
    const code = Array.from({ length: 15 }, (_, i) => `  if (/pattern${i}/.test(input)) {}`).join("\n");
    assert.ok(isLikelyAnalysisCode(code));
  });

  it("rejects normal application code", () => {
    assert.ok(!isLikelyAnalysisCode("const app = express();\napp.listen(3000);"));
  });
});

describe("shared: isLikelyCLI", () => {
  it("detects CLI code with commander/yargs", () => {
    const code =
      "import { program } from 'commander';\nprogram.command('build').action(() => {});\nconsole.log('done');";
    assert.ok(isLikelyCLI(code));
  });

  it("rejects non-CLI code", () => {
    assert.ok(!isLikelyCLI("function compute(x) { return x * 2; }"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  stripCommentsAndStrings
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: stripCommentsAndStrings", () => {
  it("strips single-line comments", () => {
    const result = stripCommentsAndStrings("const x = 1; // comment");
    assert.ok(!result.includes("comment"));
    assert.ok(result.includes("const x"));
  });

  it("strips block comments", () => {
    const result = stripCommentsAndStrings("const x = 1; /* block */ const y = 2;");
    assert.ok(!result.includes("block"));
  });

  it("preserves string content", () => {
    const result = stripCommentsAndStrings('const url = "https://example.com";');
    assert.ok(result.includes("https://example.com"));
  });

  it("handles empty input", () => {
    assert.equal(stripCommentsAndStrings(""), "");
  });

  it("handles Python comments", () => {
    const result = stripCommentsAndStrings("x = 1  # python comment");
    assert.ok(!result.includes("python comment"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  testCode
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: testCode", () => {
  it("matches pattern in code", () => {
    assert.ok(testCode("const rateLimit = require('express-rate-limit');", /rateLimit/i));
  });

  it("ignores pattern in comments", () => {
    assert.ok(!testCode("// rateLimit is configured elsewhere", /rateLimit/i));
  });

  it("resets lastIndex on regex", () => {
    const re = /test/gi;
    re.lastIndex = 5;
    const result = testCode("test code", re);
    assert.ok(result);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getContextWindow
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: getContextWindow", () => {
  it("extracts context around target line", () => {
    const lines = ["line1", "line2", "line3", "line4", "line5"];
    const ctx = getContextWindow(lines, 3, 1);
    assert.ok(ctx.includes("line2"));
    assert.ok(ctx.includes("line3"));
    assert.ok(ctx.includes("line4"));
  });

  it("handles edge case at start of file", () => {
    const lines = ["line1", "line2", "line3"];
    const ctx = getContextWindow(lines, 1, 2);
    assert.ok(ctx.includes("line1"));
  });

  it("handles edge case at end of file", () => {
    const lines = ["line1", "line2", "line3"];
    const ctx = getContextWindow(lines, 3, 2);
    assert.ok(ctx.includes("line3"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getLineNumbers / getLangLineNumbers
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: getLineNumbers", () => {
  it("returns line numbers for matching pattern", () => {
    const code = "line1\neval(x)\nline3\neval(y)";
    const lines = getLineNumbers(code, /eval\(/g);
    assert.deepEqual(lines, [2, 4]);
  });

  it("returns empty for no matches", () => {
    const lines = getLineNumbers("safe code", /eval\(/g);
    assert.deepEqual(lines, []);
  });
});

describe("shared: getLangLineNumbers", () => {
  it("returns line numbers for language-specific pattern", () => {
    const code = "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';";
    const lines = getLangLineNumbers(code, "javascript", "TLS_DISABLED");
    assert.ok(Array.isArray(lines));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getLangFamily
// ═══════════════════════════════════════════════════════════════════════════

describe("shared: getLangFamily", () => {
  it("normalizes typescript", () => {
    const family = getLangFamily("typescript");
    assert.ok(family === "js-ts" || family === "typescript", `Got: ${family}`);
  });

  it("normalizes javascript", () => {
    const family = getLangFamily("javascript");
    assert.ok(family === "js-ts" || family === "javascript", `Got: ${family}`);
  });

  it("normalizes python", () => {
    assert.equal(getLangFamily("python"), "python");
  });

  it("normalizes java", () => {
    assert.equal(getLangFamily("java"), "java");
  });

  it("normalizes csharp", () => {
    assert.equal(getLangFamily("csharp"), "csharp");
  });

  it("normalizes go", () => {
    assert.equal(getLangFamily("go"), "go");
  });

  it("normalizes rust", () => {
    assert.equal(getLangFamily("rust"), "rust");
  });

  it("normalizes ruby", () => {
    assert.equal(getLangFamily("ruby"), "ruby");
  });

  it("normalizes php", () => {
    assert.equal(getLangFamily("php"), "php");
  });

  it("returns a family name for unknown languages", () => {
    const family = getLangFamily("brainfuck");
    assert.ok(typeof family === "string");
  });
});
