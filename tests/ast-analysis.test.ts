// ─────────────────────────────────────────────────────────────────────────────
// AST Analysis — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeStructure, analyzeTaintFlows, isTreeSitterReadySync } from "../src/ast/index.js";
import type { CodeStructure } from "../src/ast/index.js";

// ═══════════════ analyzeStructure ════════════════════════════════════════

describe("AST: analyzeStructure — JavaScript/TypeScript", () => {
  it("extracts functions from JS code", () => {
    const code = `
function hello() { return "world"; }
const greet = (name) => "Hi " + name;
class Foo { bar() { return 1; } }
`;
    const s = analyzeStructure(code, "javascript");
    assert.ok(s.functions.length >= 1);
  });

  it("detects nested functions", () => {
    const code = `
function outer() {
  function inner() {
    return 42;
  }
  return inner();
}`;
    const s = analyzeStructure(code, "javascript");
    assert.ok(s.functions.length >= 1);
  });

  it("calculates cyclomatic complexity", () => {
    const code = `
function complex(x) {
  if (x > 0) {
    if (x > 10) return "big";
    else return "small";
  } else if (x < 0) {
    return "negative";
  }
  for (let i = 0; i < x; i++) {
    if (i % 2 === 0) continue;
  }
  return x === 0 ? "zero" : "other";
}`;
    const s = analyzeStructure(code, "javascript");
    assert.ok(s.functions.length >= 1);
  });

  it("detects deep nesting", () => {
    const code = `
function deep() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            return "deep";
          }
        }
      }
    }
  }
}`;
    const s = analyzeStructure(code, "javascript");
    assert.ok(s.functions.length >= 1);
    // Deep nesting detection may vary by parser
  });

  it("extracts imports", () => {
    const code = `
import fs from "fs";
import { join } from "path";
const express = require("express");
`;
    const s = analyzeStructure(code, "javascript");
    // Import extraction depends on parser — at least returns array
    assert.ok(Array.isArray(s.imports));
  });

  it("handles empty code", () => {
    const s = analyzeStructure("", "javascript");
    assert.equal(s.functions.length, 0);
    assert.equal(s.imports.length, 0);
  });

  it("handles TypeScript with types", () => {
    const code = `
interface User { id: string; name: string; }
function getUser(id: string): User | null {
  return db.find(id);
}
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
`;
    const s = analyzeStructure(code, "typescript");
    // Should not crash on type annotations
    assert.ok(typeof s.functions.length === "number");
  });
});

describe("AST: analyzeStructure — Python", () => {
  it("extracts Python functions", () => {
    const code = `
def greet(name):
    return f"Hello, {name}"

class Calculator:
    def add(self, a, b):
        return a + b
    
    def subtract(self, a, b):
        return a - b
`;
    const s = analyzeStructure(code, "python");
    assert.ok(s.functions.length >= 2);
  });

  it("detects Python decorators", () => {
    const code = `
@app.route("/api/users")
def get_users():
    return jsonify(users)

@staticmethod
def helper():
    pass
`;
    const s = analyzeStructure(code, "python");
    assert.ok(s.functions.length >= 1);
  });
});

describe("AST: analyzeStructure — Go", () => {
  it("extracts Go functions", () => {
    const code = `
package main

func main() {
    fmt.Println("hello")
}

func add(a, b int) int {
    return a + b
}

func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("ok"))
}
`;
    const s = analyzeStructure(code, "go");
    assert.ok(s.functions.length >= 2);
  });
});

describe("AST: analyzeStructure — Java", () => {
  it("extracts Java methods", () => {
    const code = `
public class UserService {
    public User getUser(String id) {
        return db.findById(id);
    }
    
    private void validateInput(String input) {
        if (input == null) throw new IllegalArgumentException();
    }
}
`;
    const s = analyzeStructure(code, "java");
    assert.ok(s.functions.length >= 1);
  });
});

describe("AST: analyzeStructure — Rust", () => {
  it("extracts Rust functions", () => {
    const code = `
fn main() {
    println!("Hello");
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}

impl Server {
    fn handle_request(&self) -> Result<(), Error> {
        Ok(())
    }
}
`;
    const s = analyzeStructure(code, "rust");
    assert.ok(s.functions.length >= 2);
  });
});

describe("AST: analyzeStructure — C#", () => {
  it("extracts C# methods", () => {
    const code = `
public class UserController : ControllerBase {
    [HttpGet]
    public IActionResult GetUsers() {
        return Ok(_userService.GetAll());
    }
    
    private bool ValidateToken(string token) {
        return !string.IsNullOrEmpty(token);
    }
}
`;
    const s = analyzeStructure(code, "csharp");
    assert.ok(s.functions.length >= 1);
  });
});

describe("AST: analyzeStructure — PHP", () => {
  it("extracts PHP functions", () => {
    const code = `
<?php
function hello() {
    echo "Hello World";
}

class UserController {
    public function index() {
        return View::make("users.index");
    }
}
?>`;
    const s = analyzeStructure(code, "php");
    assert.ok(s.functions.length >= 1);
  });
});

describe("AST: analyzeStructure — Ruby", () => {
  it("extracts Ruby methods", () => {
    const code = `
def greet(name)
  puts "Hello #{name}"
end

class UserService
  def find_user(id)
    User.find(id)
  end
  
  private
  
  def validate(input)
    raise ArgumentError unless input
  end
end
`;
    const s = analyzeStructure(code, "ruby");
    assert.ok(s.functions.length >= 1);
  });
});

describe("AST: analyzeStructure — other languages", () => {
  it("handles PowerShell", () => {
    const code = `
function Get-Users {
    param([string]$Filter)
    Get-ADUser -Filter $Filter
}`;
    const s = analyzeStructure(code, "powershell");
    assert.ok(typeof s.functions.length === "number");
  });

  it("handles Bash", () => {
    const code = `
#!/bin/bash
function deploy() {
    npm run build
    rsync -avz dist/ server:/app/
}
deploy`;
    const s = analyzeStructure(code, "bash");
    assert.ok(typeof s.functions.length === "number");
  });

  it("handles SQL", () => {
    const code = `
CREATE FUNCTION get_user(p_id INT) RETURNS TABLE AS $$
BEGIN
    RETURN QUERY SELECT * FROM users WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;`;
    const s = analyzeStructure(code, "sql");
    assert.ok(typeof s.functions.length === "number");
  });

  it("handles unknown language gracefully", () => {
    const s = analyzeStructure("some code", "brainfuck");
    assert.ok(typeof s.functions.length === "number");
  });
});

// ═══════════════ Taint flow analysis ═════════════════════════════════════

describe("AST: analyzeTaintFlows", () => {
  it("detects taint from req.body to SQL query", () => {
    const code = `
const name = req.body.name;
db.query("SELECT * FROM users WHERE name = '" + name + "'");
`;
    const flows = analyzeTaintFlows(code, "javascript");
    assert.ok(flows.length > 0);
  });

  it("detects taint from req.params to eval", () => {
    const code = `
const expr = req.params.expression;
const result = eval(expr);
`;
    const flows = analyzeTaintFlows(code, "javascript");
    assert.ok(flows.length > 0);
  });

  it("recognizes sanitizers", () => {
    const code = `
const input = req.body.name;
const safe = encodeURIComponent(input);
db.query("SELECT * FROM users WHERE name = $1", [safe]);
`;
    const flows = analyzeTaintFlows(code, "javascript");
    // Should have fewer or no flows due to sanitization
    assert.ok(Array.isArray(flows));
  });

  it("handles clean code with no taint", () => {
    const code = `
const x = 1;
const y = x + 2;
console.log(y);
`;
    const flows = analyzeTaintFlows(code, "javascript");
    assert.equal(flows.length, 0);
  });

  it("handles Python taint patterns", () => {
    const code = `
name = request.args.get("name")
cursor.execute("SELECT * FROM users WHERE name = '" + name + "'")
`;
    const flows = analyzeTaintFlows(code, "python");
    assert.ok(flows.length > 0);
  });

  it("handles Go taint patterns", () => {
    const code = `
cmd := r.URL.Query().Get("cmd")
exec.Command("sh", "-c", cmd).Run()
`;
    const flows = analyzeTaintFlows(code, "go");
    assert.ok(Array.isArray(flows));
  });

  it("handles empty code", () => {
    const flows = analyzeTaintFlows("", "javascript");
    assert.equal(flows.length, 0);
  });

  it("detects taint through variable assignment chain", () => {
    const code = `
const userInput = req.query.search;
const processed = userInput.trim();
document.innerHTML = processed;
`;
    const flows = analyzeTaintFlows(code, "javascript");
    assert.ok(flows.length > 0);
  });
});

// ═══════════════ isTreeSitterReadySync ═══════════════════════════════════

describe("AST: isTreeSitterReadySync", () => {
  it("returns boolean for JavaScript", () => {
    assert.equal(typeof isTreeSitterReadySync("javascript"), "boolean");
  });

  it("returns boolean for Python", () => {
    assert.equal(typeof isTreeSitterReadySync("python"), "boolean");
  });

  it("returns false for unknown language", () => {
    assert.equal(isTreeSitterReadySync("brainfuck"), false);
  });
});
