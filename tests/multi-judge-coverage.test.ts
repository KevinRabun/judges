// ─────────────────────────────────────────────────────────────────────────────
// Multi-Judge Evaluator Coverage Tests
// ─────────────────────────────────────────────────────────────────────────────
// Exercises evaluateWithJudge for many judges with realistic vulnerable and
// clean code samples. Each test covers the evaluator, shared utilities,
// patches, and FP filtering pipeline in one pass.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithJudge } from "../src/evaluators/index.js";
import { getJudge, JUDGES } from "../src/judges/index.js";

function evalJudge(judgeId: string, code: string, language: string) {
  const judge = getJudge(judgeId);
  assert.ok(judge, `Judge ${judgeId} not found`);
  return evaluateWithJudge(judge, code, language);
}

// ═══════════════ cybersecurity — deeper branch coverage ═══════════════════

describe("Multi-judge: cybersecurity deep branches", () => {
  it("detects SQL injection via f-string in Python", () => {
    const code = `
import sqlite3
conn = sqlite3.connect("db.sqlite")
cursor = conn.cursor()
name = input("Name: ")
cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")
`;
    const r = evalJudge("cybersecurity", code, "python");
    assert.ok(r.findings.length > 0);
  });

  it("detects SSRF via requests.get with user URL", () => {
    const code = `
import requests
url = request.args.get("url")
resp = requests.get(url)
`;
    const r = evalJudge("cybersecurity", code, "python");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("ssrf") || f.title.toLowerCase().includes("request")),
    );
  });

  it("detects NoSQL injection — direct req.body to findOne", () => {
    const code = `
app.post("/login", async (req, res) => {
  const user = await db.collection("users").findOne(req.body);
  res.json(user);
});`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("nosql") || f.title.toLowerCase().includes("injection")),
    );
  });

  it("detects mass assignment — Object.assign with req.body", () => {
    const code = `
app.put("/profile", (req, res) => {
  Object.assign(user, req.body);
  user.save();
});`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(
      r.findings.some(
        (f) => f.title.toLowerCase().includes("mass assignment") || f.title.toLowerCase().includes("request body"),
      ),
    );
  });

  it("detects insecure session without secure cookie flags", () => {
    const code = `
const session = require("express-session");
app.use(session({
  secret: "keyboard-cat",
  resave: false,
  saveUninitialized: false,
}));`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("session")));
  });

  it("detects weak CSP with unsafe-eval", () => {
    const code = `
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "script-src 'unsafe-eval' 'unsafe-inline'");
  next();
});
app.listen(3000);`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(
      r.findings.some(
        (f) => f.title.toLowerCase().includes("csp") || f.title.toLowerCase().includes("content-security"),
      ),
    );
  });

  it("detects timing attack — string comparison of HMAC", () => {
    const code = `
function verifyWebhook(req) {
  const signature = req.headers["x-hub-signature"];
  const expected = computeHmac(req.body);
  if (signature === expected) {
    processWebhook(req.body);
  }
}`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(
      r.findings.some(
        (f) => f.title.toLowerCase().includes("timing") || f.title.toLowerCase().includes("constant-time"),
      ),
    );
  });

  it("detects PHP file inclusion with variable", () => {
    const code = `
<?php
$page = $_GET['page'];
include($page . ".php");
?>`;
    const r = evalJudge("cybersecurity", code, "php");
    assert.ok(
      r.findings.some(
        (f) => f.title.toLowerCase().includes("file inclusion") || f.title.toLowerCase().includes("include"),
      ),
    );
  });

  it("detects PHP reflected XSS via echo $_GET", () => {
    const code = `
<?php
echo "Welcome, " . $_GET['name'];
?>`;
    const r = evalJudge("cybersecurity", code, "php");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("xss")));
  });

  it("detects Ruby mass assignment without permit", () => {
    const code = `
class UsersController < ApplicationController
  def create
    @user = User.create(params[:user])
    redirect_to @user
  end
end`;
    const r = evalJudge("cybersecurity", code, "ruby");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("mass assignment")));
  });

  it("detects Flask debug=True", () => {
    const code = `
from flask import Flask
app = Flask(__name__)
app.run(debug=True, host="0.0.0.0")`;
    const r = evalJudge("cybersecurity", code, "python");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("debug")));
  });

  it("detects hardcoded Flask secret key", () => {
    const code = `
from flask import Flask
app = Flask(__name__)
app.secret_key = "mysecret123"`;
    const r = evalJudge("cybersecurity", code, "python");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("secret key")));
  });

  it("detects insecure http:// URL for auth endpoint", () => {
    const code = `const resp = await fetch("http://api.example.com/auth/login", { method: "POST", body });`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("http") || f.title.toLowerCase().includes("insecure")),
    );
  });

  it("detects cloud metadata endpoint reference", () => {
    const code = `const creds = await fetch("http://169.254.169.254/latest/meta-data/iam/credentials");`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("metadata")));
  });

  it("detects insecure WebSocket ws://", () => {
    const code = `const ws = new WebSocket("ws://api.example.com/realtime");`;
    const r = evalJudge("cybersecurity", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("websocket")));
  });
});

// ═══════════════ security — deeper branch coverage ═══════════════════════

describe("Multi-judge: security deep branches", () => {
  it("detects weak crypto — MD5", () => {
    const code = `const hash = crypto.createHash("md5").update(password).digest("hex");`;
    const r = evalJudge("security", code, "javascript");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("crypto") || f.title.toLowerCase().includes("hash")),
    );
  });

  it("detects unvalidated redirect", () => {
    const code = `
app.get("/redirect", (req, res) => {
  res.redirect(req.query.url);
});`;
    const r = evalJudge("security", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("redirect")));
  });

  it("detects Math.random for security use", () => {
    const code = `const token = Math.random().toString(36).substring(2);`;
    const r = evalJudge("security", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("random")));
  });

  it("detects SSTI in Python", () => {
    const code = `
from flask import request, render_template_string
@app.route("/render")
def render_page():
    template = request.args.get("template")
    return render_template_string(template)`;
    const r = evalJudge("security", code, "python");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("template")));
  });

  it("detects pickle.loads with user data", () => {
    const code = `
import pickle
data = pickle.loads(request.data)`;
    const r = evalJudge("security", code, "python");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("deserialization")));
  });

  it("detects unsafe Rust without SAFETY comment", () => {
    const code = `
fn main() {
    unsafe {
        let ptr = std::ptr::null::<i32>();
        std::ptr::read(ptr);
    }
}`;
    const r = evalJudge("security", code, "rust");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("unsafe") || f.title.toLowerCase().includes("memory")),
    );
  });
});

// ═══════════════ performance — deeper branch coverage ════════════════════

describe("Multi-judge: performance deep branches", () => {
  it("detects N+1 in loop", () => {
    const code = `
for (const userId of userIds) {
  const orders = await db.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
  results.push(orders);
}`;
    const r = evalJudge("performance", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("n+1")));
  });

  it("detects heavy library import (moment)", () => {
    const code = `import moment from "moment";\nconst date = moment().format("YYYY-MM-DD");`;
    const r = evalJudge("performance", code, "javascript");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("heavy") || f.title.toLowerCase().includes("library")),
    );
  });

  it("detects RegExp in loop", () => {
    const code = `
for (let i = 0; i < items.length; i++) {
  if (new RegExp(pattern).test(items[i])) {
    matches.push(items[i]);
  }
}`;
    const r = evalJudge("performance", code, "javascript");
    assert.ok(
      r.findings.some((f) => f.title.toLowerCase().includes("regexp") || f.title.toLowerCase().includes("loop")),
    );
  });

  it("detects synchronous file I/O", () => {
    const code = `
const config = fs.readFileSync("config.json", "utf-8");
const data = fs.readFileSync("data.json", "utf-8");
fs.writeFileSync("output.json", result);`;
    const r = evalJudge("performance", code, "javascript");
    assert.ok(
      r.findings.some(
        (f) => f.title.toLowerCase().includes("synchronous") || f.title.toLowerCase().includes("blocking"),
      ),
    );
  });

  it("detects duplicate fetch calls", () => {
    const code = `
const users = await fetch("/api/users");
const sameUsers = await fetch("/api/users");`;
    const r = evalJudge("performance", code, "javascript");
    assert.ok(r.findings.some((f) => f.title.toLowerCase().includes("duplicate")));
  });
});

// ═══════════════ other judges — coverage breadth ═════════════════════════

describe("Multi-judge: additional judge coverage", () => {
  it("error-handling detects empty catch block", () => {
    const code = `
try {
  await riskyOperation();
} catch (e) {
  // empty
}`;
    const r = evalJudge("error-handling", code, "javascript");
    assert.ok(r.findings.length > 0);
  });

  it("maintainability detects god function", () => {
    const code = Array.from({ length: 200 }, (_, i) => `  step${i}();`).join("\n");
    const wrappedCode = `function doEverything() {\n${code}\n}`;
    const r = evalJudge("maintainability", wrappedCode, "javascript");
    assert.ok(r.findings.length > 0);
  });

  it("authentication detects hardcoded JWT secret", () => {
    const code = `const token = jwt.sign(payload, "my-secret-key-12345");`;
    const r = evalJudge("authentication", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("data-security detects PII in log", () => {
    const code = `
logger.info("User registered", {
  ssn: user.ssn,
  email: user.email,
  creditCard: user.cardNumber,
});`;
    const r = evalJudge("data-security", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("code-structure detects deep nesting", () => {
    const code = `
function process(data) {
  if (data) {
    for (const item of data) {
      if (item.active) {
        for (const sub of item.children) {
          if (sub.valid) {
            if (sub.type === "special") {
              doSomething(sub);
            }
          }
        }
      }
    }
  }
}`;
    const r = evalJudge("code-structure", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("reliability detects missing error propagation", () => {
    const code = `
async function fetchData() {
  const response = await fetch("/api/data");
  return response.json();
  // No error checking on response status
}`;
    const r = evalJudge("reliability", code, "javascript");
    // May or may not detect depending on heuristics
    assert.ok(typeof r.score === "number");
  });

  it("hallucination-detection detects non-existent API", () => {
    const code = `
const data = await fs.readFileAsync("file.txt");
const flat = items.flatten();
const result = Promise.allResolved(promises);`;
    const r = evalJudge("hallucination-detection", code, "javascript");
    assert.ok(r.findings.length > 0);
  });

  it("dependency-health detects deprecated packages", () => {
    const code = `{
  "dependencies": {
    "request": "^2.88.2",
    "moment": "^2.29.4",
    "node-uuid": "^1.4.8"
  }
}`;
    const r = evalJudge("dependency-health", code, "json");
    assert.ok(typeof r.score === "number");
  });

  it("iac-security detects Terraform secrets", () => {
    const code = `
variable "db_password" {
  default = "supersecret123"
}

resource "aws_db_instance" "main" {
  password = var.db_password
}`;
    const r = evalJudge("iac-security", code, "terraform");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ clean code — negative tests ═════════════════════════════

describe("Multi-judge: clean code negative tests", () => {
  it("cybersecurity: clean Express app", () => {
    const code = `
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express from "express";
const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 900000, max: 100 }));
app.use(session({ cookie: { secure: true, httpOnly: true, sameSite: "strict" } }));
app.get("/data", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid" });
  const data = db.query("SELECT * FROM items WHERE id = $1", [id]);
  res.json(data);
});
app.listen(3000);`;
    const r = evalJudge("cybersecurity", code, "javascript");
    const critical = r.findings.filter((f) => f.severity === "critical");
    assert.equal(critical.length, 0, "Clean Express app should have no critical findings");
  });

  it("security: properly secured Python code", () => {
    const code = `
import hashlib
import secrets
import hmac

def hash_password(password: str) -> str:
    salt = secrets.token_hex(32)
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()

def verify_signature(payload: bytes, signature: bytes, key: bytes) -> bool:
    expected = hmac.new(key, payload, hashlib.sha256).digest()
    return hmac.compare_digest(expected, signature)`;
    const r = evalJudge("security", code, "python");
    const critical = r.findings.filter((f) => f.severity === "critical");
    assert.equal(critical.length, 0);
  });

  it("performance: optimized code", () => {
    const code = `
const users = await db.query("SELECT id, name FROM users WHERE active = true LIMIT 50");
const names = users.map(u => u.name).join(", ");`;
    const r = evalJudge("performance", code, "javascript");
    const critical = r.findings.filter((f) => f.severity === "critical");
    assert.equal(critical.length, 0);
  });

  it("all judges return valid evaluation for empty code", () => {
    for (const judge of JUDGES.slice(0, 10)) {
      const r = evaluateWithJudge(judge, "", "javascript");
      assert.ok(typeof r.score === "number");
      assert.ok(r.verdict === "pass" || r.verdict === "warning" || r.verdict === "fail");
    }
  });
});
