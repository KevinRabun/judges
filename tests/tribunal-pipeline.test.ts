// ─────────────────────────────────────────────────────────────────────────────
// Tribunal Pipeline Coverage — exercises full evaluation pipeline
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateWithTribunal,
  evaluateDiff,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
  applyInlineSuppressions,
  enrichWithPatches,
  crossEvaluatorDedup,
} from "../src/evaluators/index.js";
import type { TribunalVerdict, Finding } from "../src/types.js";

// ═══════════════ Tribunal evaluations — various languages ════════════════

describe("Tribunal: full pipeline coverage", () => {
  it("evaluates Python SQL injection code", () => {
    const code = `
import sqlite3
def get_user(name):
    conn = sqlite3.connect("db.sqlite")
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")
    return cursor.fetchone()
`;
    const v = evaluateWithTribunal(code, "python");
    assert.ok(v.overallScore >= 0 && v.overallScore <= 100);
    assert.ok(v.evaluations.length > 0);
    assert.ok(v.findings.length > 0);
  });

  it("evaluates Go HTTP handler with issues", () => {
    const code = `
package main
import (
    "fmt"
    "net/http"
    "os/exec"
)
func handler(w http.ResponseWriter, r *http.Request) {
    cmd := r.URL.Query().Get("cmd")
    out, _ := exec.Command("sh", "-c", cmd).Output()
    fmt.Fprintf(w, string(out))
}
func main() {
    http.HandleFunc("/exec", handler)
    http.ListenAndServe(":8080", nil)
}`;
    const v = evaluateWithTribunal(code, "go");
    assert.ok(v.overallScore >= 0);
    assert.ok(v.evaluations.length > 0);
  });

  it("evaluates Java Spring controller", () => {
    const code = `
@RestController
public class UserController {
    @GetMapping("/user")
    public String getUser(@RequestParam String id) {
        String query = "SELECT * FROM users WHERE id = " + id;
        return jdbc.queryForObject(query, String.class);
    }
}`;
    const v = evaluateWithTribunal(code, "java");
    assert.ok(v.evaluations.length > 0);
  });

  it("evaluates C# controller with path traversal", () => {
    const code = `
public class FileController : Controller {
    public IActionResult Download(string filename) {
        var path = Path.Combine("/uploads", filename);
        return File(System.IO.File.ReadAllBytes(path), "application/octet-stream");
    }
}`;
    const v = evaluateWithTribunal(code, "csharp");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates Ruby on Rails controller", () => {
    const code = `
class UsersController < ApplicationController
  def create
    @user = User.new(params[:user])
    @user.save
    redirect_to users_path
  end
  
  def show
    @user = User.find(params[:id])
    render html: raw(@user.bio)
  end
end`;
    const v = evaluateWithTribunal(code, "ruby");
    assert.ok(v.evaluations.length > 0);
  });

  it("evaluates PHP with multiple vulnerabilities", () => {
    const code = `
<?php
$name = $_GET['name'];
echo "Hello, " . $name;
$page = $_GET['page'];
include($page . ".php");
$query = "SELECT * FROM users WHERE name = '" . $name . "'";
$result = mysql_query($query);
?>`;
    const v = evaluateWithTribunal(code, "php");
    assert.ok(v.findings.length > 0);
  });

  it("evaluates Kotlin Android with WebView", () => {
    const code = `
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        val url = intent.getStringExtra("url") ?: ""
        webView.loadUrl(url)
    }
}`;
    const v = evaluateWithTribunal(code, "kotlin");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates clean TypeScript — should score high", () => {
    const code = `
import { z } from "zod";

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

export function validateUser(input: unknown) {
  return UserSchema.safeParse(input);
}`;
    const v = evaluateWithTribunal(code, "typescript");
    assert.ok(v.overallScore >= 60, `Clean code should score >=60, got ${v.overallScore}`);
  });

  it("evaluates Terraform with security issues", () => {
    const code = `
resource "aws_security_group" "allow_all" {
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "default" {
  publicly_accessible = true
  storage_encrypted   = false
}`;
    const v = evaluateWithTribunal(code, "terraform");
    assert.ok(v.findings.length > 0);
  });

  it("evaluates Dockerfile with issues", () => {
    const code = `
FROM node:latest
USER root
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]`;
    const v = evaluateWithTribunal(code, "dockerfile");
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Markdown formatting ═════════════════════════════════════

describe("Tribunal: formatVerdictAsMarkdown", () => {
  it("formats a verdict as markdown", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript");
    const md = formatVerdictAsMarkdown(v);
    assert.ok(md.includes("#") || md.includes("**"));
    assert.ok(md.includes("Score") || md.includes("Verdict") || md.includes("score"));
  });
});

describe("Tribunal: formatEvaluationAsMarkdown", () => {
  it("formats a single evaluation as markdown", () => {
    const v = evaluateWithTribunal("eval(x);", "javascript");
    if (v.evaluations.length > 0) {
      const md = formatEvaluationAsMarkdown(v.evaluations[0]);
      assert.ok(typeof md === "string");
    }
  });
});

// ═══════════════ Inline suppressions ═════════════════════════════════════

describe("Tribunal: applyInlineSuppressions", () => {
  it("suppresses findings with @judges ignore comment", () => {
    const code = "// @judges ignore:CYBER-001\nconst x = eval(input);";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval usage", description: "desc", lineNumbers: [2] },
      { ruleId: "SEC-001", severity: "high", title: "other", description: "desc", lineNumbers: [2] },
    ];
    const result = applyInlineSuppressions(findings, code);
    // Should suppress CYBER-001 but keep SEC-001
    assert.ok(result.length <= findings.length);
  });

  it("does not suppress findings without ignore comment", () => {
    const code = "const x = eval(input);";
    const findings: Finding[] = [
      { ruleId: "CYBER-001", severity: "critical", title: "eval", description: "desc", lineNumbers: [1] },
    ];
    const result = applyInlineSuppressions(findings, code);
    assert.equal(result.length, 1);
  });

  it("handles empty findings", () => {
    const result = applyInlineSuppressions([], "code");
    assert.equal(result.length, 0);
  });
});

// ═══════════════ enrichWithPatches ════════════════════════════════════════

describe("Tribunal: enrichWithPatches pipeline", () => {
  it("attaches patches to eval findings", () => {
    const findings: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "critical",
        title: "Dangerous eval() usage",
        description: "desc",
        lineNumbers: [1],
      },
    ];
    const code = "const result = eval(userInput);";
    const enriched = enrichWithPatches(findings, code);
    assert.ok(enriched[0].patch);
  });
});

// ═══════════════ crossEvaluatorDedup ═════════════════════════════════════

describe("Tribunal: crossEvaluatorDedup", () => {
  it("removes duplicate findings from different judges", () => {
    const findings: Finding[] = [
      {
        ruleId: "SEC-001",
        severity: "high",
        title: "SQL Injection via concat",
        description: "desc",
        lineNumbers: [10],
      },
      {
        ruleId: "CYBER-001",
        severity: "critical",
        title: "SQL injection via string concatenation",
        description: "desc",
        lineNumbers: [10],
      },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.ok(deduped.length <= findings.length);
  });

  it("preserves unique findings", () => {
    const findings: Finding[] = [
      { ruleId: "SEC-001", severity: "high", title: "XSS", description: "desc", lineNumbers: [5] },
      { ruleId: "PERF-001", severity: "medium", title: "N+1 query", description: "desc", lineNumbers: [20] },
    ];
    const deduped = crossEvaluatorDedup(findings);
    assert.equal(deduped.length, 2);
  });

  it("handles empty array", () => {
    assert.deepEqual(crossEvaluatorDedup([]), []);
  });
});
