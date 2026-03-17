// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests — CLI output formats, language detection, evaluator wiring
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateWithTribunal, evaluateProject, evaluateDiff } from "../src/evaluators/index.js";
import { verdictToSarif, validateSarifLog, findingsToSarif } from "../src/formatters/sarif.js";
import { verdictToJUnit } from "../src/formatters/junit.js";
import { verdictToHtml } from "../src/formatters/html.js";
import { verdictToCodeClimate } from "../src/formatters/codeclimate.js";
import { verdictToGitHubActions } from "../src/formatters/github-actions.js";
import type { TribunalVerdict, Finding } from "../src/types.js";

// ─── Sample code snippets for each new language ─────────────────────────────

const DART_CODE = `
import 'package:flutter/material.dart';

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    var password = "hardcoded123";
    return MaterialApp(
      home: Scaffold(
        body: Text(password),
      ),
    );
  }
}
`;

const BASH_CODE = `#!/bin/bash
set -euo pipefail

PASSWORD="secret123"
DB_HOST="localhost"

function connect_db() {
  mysql -u root -p${"$"}{PASSWORD} -h ${"$"}{DB_HOST}
}

eval "$USER_INPUT"

connect_db
`;

const SQL_CODE = `
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  is_admin BOOLEAN DEFAULT FALSE
);

INSERT INTO users (username, password) VALUES ('admin', 'admin123');

SELECT * FROM users WHERE username = 'admin';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%';
`;

const PHP_CODE = `<?php
class UserController {
  private $db;

  public function __construct($database) {
    $this->db = $database;
  }

  public function getUser($id) {
    $query = "SELECT * FROM users WHERE id = " . $id;
    return $this->db->query($query);
  }

  public function login($username, $password) {
    $hash = md5($password);
    return $this->db->query("SELECT * FROM users WHERE username = '$username' AND password = '$hash'");
  }
}
?>`;

const RUBY_CODE = `
class UsersController < ApplicationController
  def show
    @user = User.find(params[:id])
    render json: @user
  end

  def create
    password = "default123"
    @user = User.new(user_params)
    @user.password = Digest::MD5.hexdigest(password)
    @user.save
  end

  private

  def user_params
    params.permit(:name, :email, :password, :is_admin)
  end
end
`;

const KOTLIN_CODE = `
package com.example.app

import java.sql.DriverManager

class DatabaseService {
  private val password = "hardcoded_secret"

  fun getConnection(): java.sql.Connection {
    return DriverManager.getConnection(
      "jdbc:mysql://localhost:3306/db",
      "root",
      password
    )
  }

  fun findUser(userId: String): Any {
    val conn = getConnection()
    val stmt = conn.createStatement()
    val rs = stmt.executeQuery("SELECT * FROM users WHERE id = '$userId'")
    return rs
  }
}
`;

const SWIFT_CODE = `
import Foundation

class APIClient {
  let apiKey = "sk-live-abc123secret"
  let baseURL = "https://api.example.com"

  func fetchUser(id: String) -> Any {
    let url = URL(string: "\\(baseURL)/users/\\(id)")!
    let request = URLRequest(url: url)
    return request
  }

  func processInput(_ input: String) {
    let result = NSExpression(format: input)
    print(result)
  }
}
`;

const TYPESCRIPT_VULNERABLE = `
import express from 'express';
const app = express();

app.get('/user/:id', (req, res) => {
  const query = "SELECT * FROM users WHERE id = " + req.params.id;
  res.send(query);
});

const secret = "my-api-key-12345";
app.listen(3000);
`;

// ─── Output Format Tests ────────────────────────────────────────────────────

describe("Integration: Output Formats", () => {
  const verdict: TribunalVerdict = evaluateWithTribunal(TYPESCRIPT_VULNERABLE, "typescript");

  it("produces valid SARIF output", () => {
    const sarif = verdictToSarif(verdict, "test.ts");
    assert.ok(sarif, "SARIF output should be defined");
    assert.equal(sarif.version, "2.1.0");
    assert.ok(Array.isArray(sarif.runs), "SARIF should have runs array");
    assert.ok(sarif.runs.length > 0, "SARIF should have at least one run");
    assert.ok(Array.isArray(sarif.runs[0].results), "run should have results");
    // Validate structure
    const errors = validateSarifLog(sarif);
    assert.equal(errors.length, 0, `SARIF validation errors: ${errors.map((e) => e.message).join(", ")}`);
  });

  it("produces valid JUnit XML output", () => {
    const junit = verdictToJUnit(verdict, "test.ts");
    assert.ok(typeof junit === "string", "JUnit output should be a string");
    assert.ok(junit.includes("<?xml"), "JUnit should start with XML declaration");
    assert.ok(junit.includes("<testsuites"), "JUnit should have testsuites element");
    assert.ok(junit.includes("<testsuite"), "JUnit should have testsuite element");
  });

  it("produces valid HTML output", () => {
    const html = verdictToHtml(verdict, "test.ts");
    assert.ok(typeof html === "string", "HTML output should be a string");
    assert.ok(html.includes("<html") || html.includes("<!DOCTYPE"), "HTML should contain html element");
    assert.ok(html.includes("Judges"), "HTML should reference Judges");
  });

  it("produces valid CodeClimate output", () => {
    const cc = verdictToCodeClimate(verdict, "test.ts");
    assert.ok(Array.isArray(cc), "CodeClimate output should be an array");
    if (verdict.findings.length > 0) {
      assert.ok(cc.length > 0, "CodeClimate should have entries for findings");
      assert.ok(cc[0].type === "issue", "First entry should be an issue");
      assert.ok(cc[0].check_name, "Entry should have check_name");
    }
  });

  it("produces valid GitHub Actions output", () => {
    const ga = verdictToGitHubActions(verdict, "test.ts");
    assert.ok(typeof ga === "string", "GitHub Actions output should be a string");
    // GA format uses ::error:: and ::warning:: annotations
    if (verdict.findings.some((f) => f.severity === "critical" || f.severity === "high")) {
      assert.ok(ga.includes("::error") || ga.includes("::warning"), "GA output should have annotations");
    }
  });

  it("SARIF from findings directly works", () => {
    const findings: Finding[] = [
      {
        ruleId: "TEST-001",
        severity: "high",
        title: "Test finding",
        description: "A test finding",
        lineNumbers: [1],
        recommendation: "Fix it",
        confidence: 0.9,
      },
    ];
    const sarif = findingsToSarif(findings, "test.ts");
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0].results.length, 1);
  });
});

// ─── Language Detection & Evaluation ────────────────────────────────────────

describe("Integration: New Language Evaluation", () => {
  it("evaluates Dart code and produces findings", () => {
    const verdict = evaluateWithTribunal(DART_CODE, "dart");
    assert.ok(verdict, "Dart evaluation should return a verdict");
    assert.ok(verdict.overallScore >= 0 && verdict.overallScore <= 100, "Score in range");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable Dart code");
  });

  it("evaluates Bash code and produces findings", () => {
    const verdict = evaluateWithTribunal(BASH_CODE, "bash");
    assert.ok(verdict, "Bash evaluation should return a verdict");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable Bash code");
  });

  it("evaluates SQL code without crashing", () => {
    const verdict = evaluateWithTribunal(SQL_CODE, "sql");
    assert.ok(verdict, "SQL evaluation should return a verdict");
    assert.ok(verdict.overallScore >= 0 && verdict.overallScore <= 100, "Score in range");
    assert.ok(Array.isArray(verdict.findings), "Should have findings array");
  });

  it("evaluates PHP code and produces findings", () => {
    const verdict = evaluateWithTribunal(PHP_CODE, "php");
    assert.ok(verdict, "PHP evaluation should return a verdict");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable PHP code");
  });

  it("evaluates Ruby code and produces findings", () => {
    const verdict = evaluateWithTribunal(RUBY_CODE, "ruby");
    assert.ok(verdict, "Ruby evaluation should return a verdict");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable Ruby code");
  });

  it("evaluates Kotlin code and produces findings", () => {
    const verdict = evaluateWithTribunal(KOTLIN_CODE, "kotlin");
    assert.ok(verdict, "Kotlin evaluation should return a verdict");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable Kotlin code");
  });

  it("evaluates Swift code and produces findings", () => {
    const verdict = evaluateWithTribunal(SWIFT_CODE, "swift");
    assert.ok(verdict, "Swift evaluation should return a verdict");
    assert.ok(verdict.findings.length > 0, "Should find issues in vulnerable Swift code");
  });
});

// ─── Multi-file Project Evaluation ──────────────────────────────────────────

describe("Integration: Project Evaluation", () => {
  it("evaluates multi-file project", () => {
    const files = [
      { path: "src/app.ts", content: TYPESCRIPT_VULNERABLE, language: "typescript" },
      { path: "src/db.kt", content: KOTLIN_CODE, language: "kotlin" },
    ];
    const verdict = evaluateProject(files);
    assert.ok(verdict, "Project verdict should be defined");
    assert.ok(verdict.fileResults, "Should have fileResults");
    assert.equal(verdict.fileResults!.length, 2, "Should evaluate both files");
    assert.ok(verdict.findings.length > 0, "Should find issues across files");
  });

  it("evaluates project with new languages", () => {
    const files = [
      { path: "main.dart", content: DART_CODE, language: "dart" },
      { path: "deploy.sh", content: BASH_CODE, language: "bash" },
      { path: "schema.sql", content: SQL_CODE, language: "sql" },
    ];
    const verdict = evaluateProject(files);
    assert.ok(verdict, "Project verdict should be defined");
    assert.equal(verdict.fileResults!.length, 3, "Should evaluate all 3 new-lang files");
  });
});

// ─── Diff Evaluation ────────────────────────────────────────────────────────

describe("Integration: Diff Evaluation", () => {
  it("evaluates changed lines only", () => {
    const changedLines = [6, 7, 10]; // lines with SQL injection & hardcoded secret
    const verdict = evaluateDiff(TYPESCRIPT_VULNERABLE, "typescript", changedLines);
    assert.ok(verdict, "Diff verdict should be defined");
    assert.ok(verdict.linesAnalyzed === changedLines.length, "Should report correct number of lines analyzed");
    // All findings should be on changed lines
    for (const f of verdict.findings) {
      if (f.lineNumbers && f.lineNumbers.length > 0) {
        assert.ok(
          f.lineNumbers.some((ln) => changedLines.includes(ln)),
          `Finding ${f.ruleId} should be on a changed line`,
        );
      }
    }
  });
});

// ─── Verdict Structure Validation ───────────────────────────────────────────

describe("Integration: Verdict Structure", () => {
  it("verdict has all required fields", () => {
    const verdict = evaluateWithTribunal(TYPESCRIPT_VULNERABLE, "typescript");
    assert.ok(["pass", "warning", "fail"].includes(verdict.overallVerdict), "Valid verdict");
    assert.ok(typeof verdict.overallScore === "number", "Score should be a number");
    assert.ok(typeof verdict.summary === "string", "Summary should be a string");
    assert.ok(Array.isArray(verdict.evaluations), "Should have evaluations array");
    assert.ok(Array.isArray(verdict.findings), "Should have findings array");
    assert.ok(typeof verdict.timestamp === "string", "Should have timestamp");
    assert.ok(typeof verdict.criticalCount === "number", "Should have criticalCount");
    assert.ok(typeof verdict.highCount === "number", "Should have highCount");
  });

  it("findings have required properties", () => {
    const verdict = evaluateWithTribunal(TYPESCRIPT_VULNERABLE, "typescript");
    for (const f of verdict.findings) {
      assert.ok(f.ruleId, "Finding should have ruleId");
      assert.ok(f.severity, "Finding should have severity");
      assert.ok(f.title, "Finding should have title");
      assert.ok(f.description, "Finding should have description");
      assert.ok(typeof f.confidence === "number", "Finding should have numeric confidence");
      assert.ok(f.confidence >= 0 && f.confidence <= 1, "Confidence should be between 0 and 1");
    }
  });

  it("evaluations reference valid judges", () => {
    const verdict = evaluateWithTribunal(TYPESCRIPT_VULNERABLE, "typescript");
    for (const e of verdict.evaluations) {
      assert.ok(e.judgeId, "Evaluation should have judgeId");
      assert.ok(typeof e.score === "number", "Evaluation should have numeric score");
      assert.ok(["pass", "warning", "fail"].includes(e.verdict), "Evaluation should have valid verdict");
    }
  });
});
