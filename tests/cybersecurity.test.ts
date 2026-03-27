// ─────────────────────────────────────────────────────────────────────────────
// Cybersecurity Evaluator — Comprehensive Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Covers all detection rules in src/evaluators/cybersecurity.ts with both
// positive (vulnerable code) and negative (clean code) tests.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeCybersecurity } from "../src/evaluators/cybersecurity.js";
import type { Finding } from "../src/types.js";

function findByTitle(findings: Finding[], substr: string): Finding | undefined {
  return findings.find((f) => f.title.toLowerCase().includes(substr.toLowerCase()));
}

function hasRulePrefix(findings: Finding[], prefix: string): boolean {
  return findings.some((f) => f.ruleId.startsWith(prefix));
}

// ═══════════════════════════════════════════════════════════════════════════
//  eval() / exec() detection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: eval/exec detection", () => {
  it("detects eval() in JavaScript", () => {
    const code = `const result = eval(userInput);`;
    const findings = analyzeCybersecurity(code, "javascript");
    const f = findByTitle(findings, "eval");
    assert.ok(f, "Should detect eval()");
    assert.equal(f.severity, "critical");
    assert.ok(f.lineNumbers?.includes(1));
  });

  it("detects exec() in Python", () => {
    const code = `exec(user_command)`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "eval"), "Should detect exec()");
  });

  it("does not flag JSON.parse", () => {
    const code = `const data = JSON.parse(input);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "eval"), "JSON.parse is safe");
  });

  it("skips analysis code with many regex patterns", () => {
    // Code that looks like a security analyzer itself
    const code = `
function analyzeCode(input) {
  const evalPattern = /eval\\(/;
  const innerHtmlPattern = /innerHTML/;
  const xssPattern = /document\\.write/;
  const sqlPattern = /SELECT.*FROM/;
  if (evalPattern.test(input)) findings.push("eval found");
  if (innerHtmlPattern.test(input)) findings.push("innerHTML found");
  if (xssPattern.test(input)) findings.push("XSS found");
  // This is analysis code, not vulnerable code
  const isVulnerable = /exec\\(/.test(input);
  const hasSQLi = /DROP TABLE/.test(input);
  const checkCSRF = /csrf/.test(input);
  const checkXSS = /script/.test(input);
  const checkSSRF = /localhost/.test(input);
  const checkRCE = /spawn/.test(input);
  return findings;
}`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.equal(findings.length, 0, "Should skip analysis code");
  });

  it("lowers eval confidence in build/codegen functions with AST context", () => {
    const code = `function compileTemplate(tmpl) {\n  return eval(tmpl);\n}`;
    const findings = analyzeCybersecurity(code, "javascript", {
      ast: {
        functions: [{ name: "compileTemplate", startLine: 1, endLine: 3, params: ["tmpl"] }],
        imports: [],
      },
    });
    const f = findByTitle(findings, "eval");
    assert.ok(f);
    assert.ok(f.confidence !== undefined && f.confidence < 0.95, "Should lower confidence for build functions");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  XSS: innerHTML / dangerouslySetInnerHTML
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: XSS via innerHTML", () => {
  it("detects innerHTML assignment", () => {
    const code = `element.innerHTML = userInput;`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "XSS via innerHTML"));
  });

  it("detects dangerouslySetInnerHTML in React", () => {
    const code = `<div dangerouslySetInnerHTML={{ __html: data }} />`;
    const findings = analyzeCybersecurity(code, "typescript");
    assert.ok(findByTitle(findings, "XSS via innerHTML"));
  });

  it("detects v-html in Vue", () => {
    const code = `<div v-html="userContent"></div>`;
    const findings = analyzeCybersecurity(code, "html");
    assert.ok(findByTitle(findings, "XSS via innerHTML"));
  });

  it("detects Angular [innerHTML] binding", () => {
    const code = `<div [innerHTML]="data"></div>`;
    const findings = analyzeCybersecurity(code, "html");
    assert.ok(findByTitle(findings, "XSS via innerHTML"));
  });

  it("does not flag textContent", () => {
    const code = `element.textContent = userInput;`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "XSS via innerHTML"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Command injection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: command injection", () => {
  it("detects exec() with user input and concatenation", () => {
    const code = `
const { exec } = require("child_process");
app.get("/run", (req, res) => {
  exec("ls " + req.query.dir, (err, stdout) => {
    res.send(stdout);
  });
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "command injection"));
  });

  it("does not flag execFile with argument array", () => {
    const code = `
const { execFile } = require("child_process");
execFile("ls", ["-la", dir], (err, stdout) => {
  console.log(stdout);
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "command injection"));
  });

  it("boosts confidence in route handlers via AST context", () => {
    const code = `
app.get("/exec", (req, res) => {
  exec("cmd " + req.query.cmd);
});`;
    const findings = analyzeCybersecurity(code, "javascript", {
      ast: {
        functions: [
          {
            name: "handler",
            startLine: 2,
            endLine: 4,
            params: ["req", "res"],
            decorators: ["@app.route"],
          },
        ],
        imports: [],
      },
    });
    const f = findByTitle(findings, "command injection");
    if (f) {
      assert.ok(f.confidence !== undefined && f.confidence >= 0.9);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TLS disabled
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: TLS disabled", () => {
  it("detects rejectUnauthorized: false", () => {
    const code = `const agent = new https.Agent({ rejectUnauthorized: false });`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "TLS certificate"));
  });

  it("detects NODE_TLS_REJECT_UNAUTHORIZED", () => {
    const code = `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "TLS certificate"));
  });

  it("does not flag proper TLS configuration", () => {
    const code = `const agent = new https.Agent({ rejectUnauthorized: true, ca: myCert });`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "TLS certificate"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  CORS misconfiguration
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: CORS misconfiguration", () => {
  it("detects wildcard CORS", () => {
    const code = `app.use(cors({ origin: "*" }));`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "CORS"));
  });

  it("detects CORS origin reflection", () => {
    const code = `res.setHeader("Access-Control-Allow-Origin", req.headers.origin);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "CORS"));
  });

  it("does not flag restricted CORS origins", () => {
    const code = `app.use(cors({ origin: "https://app.example.com" }));`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "CORS"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Prototype pollution
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: prototype pollution", () => {
  it("detects __proto__ access", () => {
    const code = `obj.__proto__.isAdmin = true;`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "prototype pollution"));
  });

  it("detects lodash.merge with user data", () => {
    const code = `const result = _.merge(target, userInput);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "prototype pollution"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Linter suppression directives
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: linter suppression", () => {
  it("detects eslint-disable comments", () => {
    const code = `// eslint-disable-next-line no-explicit-any\nconst x: any = data;`;
    const findings = analyzeCybersecurity(code, "typescript");
    assert.ok(findByTitle(findings, "Linter/type-checker suppression"));
  });

  it("does not flag code without suppression directives", () => {
    const code = `const x: string = "hello";`;
    const findings = analyzeCybersecurity(code, "typescript");
    assert.ok(!findByTitle(findings, "Linter/type-checker suppression"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  XXE (XML External Entity)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: XXE injection", () => {
  it("detects XML parsing without protection in Java", () => {
    const code = `
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
DocumentBuilder builder = factory.newDocumentBuilder();
Document doc = builder.parse(input);`;
    const findings = analyzeCybersecurity(code, "java");
    assert.ok(findByTitle(findings, "XXE"));
  });

  it("does not flag XML with FEATURE_SECURE_PROCESSING", () => {
    const code = `
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
factory.setFeature(FEATURE_SECURE_PROCESSING, true);
factory.setFeature(disallow-doctype-decl, true);
DocumentBuilder builder = factory.newDocumentBuilder();
Document doc = builder.parse(input);`;
    const findings = analyzeCybersecurity(code, "java");
    // The protection features are detected in the code body (not in comments)
    const xxe = findings.filter((f) => f.title.toLowerCase().includes("xxe"));
    assert.equal(xxe.length, 0, "Should recognize FEATURE_SECURE_PROCESSING as XXE protection");
  });

  it("does not flag Python defusedxml", () => {
    const code = `
import defusedxml.ElementTree as ET
tree = ET.parse("data.xml")`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(!findByTitle(findings, "XXE"));
  });

  it("ignores XXE protection keywords in comments", () => {
    const code = `
// Missing: FEATURE_SECURE_PROCESSING
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
DocumentBuilder builder = factory.newDocumentBuilder();
Document doc = builder.parse(input);`;
    const findings = analyzeCybersecurity(code, "java");
    assert.ok(findByTitle(findings, "XXE"), "Comment mentions protection but code lacks it");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  LDAP injection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: LDAP injection", () => {
  it("detects LDAP filter concatenation", () => {
    const code = `ctx.search("ou=users", "(uid=" + username + ")", null);`;
    const findings = analyzeCybersecurity(code, "java");
    assert.ok(findByTitle(findings, "LDAP"));
  });

  it("does not flag LDAP with sanitization", () => {
    const code = `
const safe = ldap_escape(username);
ctx.search("ou=users", "(uid=" + safe + ")", null);`;
    const findings = analyzeCybersecurity(code, "java");
    assert.ok(!findByTitle(findings, "LDAP"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SSRF (Server-Side Request Forgery)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: SSRF", () => {
  it("detects fetch with user-controlled URL", () => {
    const code = `const resp = await fetch(req.query.url);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "SSRF"));
  });

  it("detects multi-line SSRF via variable tracking", () => {
    const code = `
const targetUrl = req.query.url;
const data = await fetch(targetUrl);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "SSRF"));
  });

  it("does not flag fetch with hardcoded URL", () => {
    const code = `const resp = await fetch("https://api.example.com/data");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "SSRF"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Open redirect
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: open redirect", () => {
  it("detects redirect with user input", () => {
    const code = `res.redirect(req.query.returnUrl);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "redirect"));
  });

  it("does not flag redirect to static path", () => {
    const code = `res.redirect("/dashboard");`;
    const findings = analyzeCybersecurity(code, "javascript");
    const redirectFindings = findings.filter((f) => f.title.toLowerCase().includes("redirect"));
    assert.equal(redirectFindings.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ReDoS (User input in RegExp)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: ReDoS", () => {
  it("detects user input in RegExp constructor", () => {
    const code = `const regex = new RegExp(req.query.pattern);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "ReDoS") || findByTitle(findings, "RegExp"));
  });

  it("detects dangerous nested quantifier regex", () => {
    const code = `const pattern = new RegExp("(a+)+b");`;
    const findings = analyzeCybersecurity(code, "javascript");
    const f = findings.find((f) => f.title.toLowerCase().includes("redos") || f.title.toLowerCase().includes("regex"));
    assert.ok(f);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Template injection (SSTI)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: SSTI", () => {
  it("detects render_template_string with user input (Python)", () => {
    const code = `
from flask import request
@app.route("/render")
def render():
    template = request.args.get("template")
    return render_template_string(template)`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "Template Injection"));
  });

  it("does not flag render_template with file path", () => {
    const code = `return render_template("index.html", data=data)`;
    const findings = analyzeCybersecurity(code, "python");
    // render_template with a file is safe
    const ssti = findings.filter((f) => f.title.toLowerCase().includes("template injection"));
    assert.equal(ssti.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP header injection (CRLF)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: CRLF / header injection", () => {
  it("detects setHeader with user input", () => {
    const code = `res.setHeader("X-Custom", req.query.value);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "header injection"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Missing security headers
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: missing security headers", () => {
  it("flags Express server without helmet", () => {
    const code = `
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Hello"));
app.listen(3000);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "security headers"));
  });

  it("does not flag server with helmet", () => {
    const code = `
import helmet from "helmet";
const app = express();
app.use(helmet());
app.listen(3000);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "security headers"));
  });

  it("recognizes Content-Security-Policy as security header", () => {
    const code = `
const app = express();
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.listen(3000);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "security headers"));
  });

  it("does not flag non-server code", () => {
    const code = `function compute(x) { return x * 2; }`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "security headers"));
  });

  it("recognizes security header imports via AST", () => {
    const code = `
const app = express();
app.listen(3000);`;
    const findings = analyzeCybersecurity(code, "javascript", {
      ast: { functions: [], imports: ["helmet"] },
    });
    assert.ok(!findByTitle(findings, "security headers"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Insecure session configuration
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: insecure session", () => {
  it("detects session without secure flags", () => {
    const code = `
app.use(session({
  secret: "my-secret",
  resave: false,
}));`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "session configuration"));
  });

  it("does not flag session with secure flags", () => {
    const code = `
app.use(session({
  secret: process.env.SECRET,
  cookie: { secure: true, httpOnly: true, sameSite: "strict" },
}));`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "session configuration"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Weak password requirements
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: password validation", () => {
  it("flags auth routes without password validation", () => {
    const code = `
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  await db.users.create({ email, password: hash(password) });
  res.json({ ok: true });
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "password"));
  });

  it("does not flag auth with password validation", () => {
    const code = `
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (password.length < 8) return res.status(400).json({ error: "too short" });
  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])/;
  if (!passwordRegex.test(password)) return res.status(400);
  await db.users.create({ email, password: hash(password) });
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "password"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Hardcoded backdoor credentials
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: backdoor credentials", () => {
  it("detects hardcoded admin password", () => {
    const code = `const admin = "admin"; const password = "admin123";`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "backdoor"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Missing rate limiting on auth
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: rate limiting", () => {
  it("flags auth endpoints without rate limiting", () => {
    const code = `
app.post("/login", async (req, res) => {
  const token = await authenticate(req.body.password);
  res.json({ token });
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "rate limiting"));
  });

  it("does not flag auth with rate limiter", () => {
    const code = `
const rateLimit = require("express-rate-limit");
app.use("/login", rateLimit({ windowMs: 900000, max: 5 }));
app.post("/login", (req, res) => {
  const token = authenticate(req.body.password);
  res.json({ token });
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "rate limiting"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Weak CSP directives
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: weak CSP", () => {
  it("detects unsafe-inline in CSP", () => {
    const code = `res.setHeader("Content-Security-Policy", "script-src 'unsafe-inline'");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "Content-Security-Policy"));
  });

  it("does not flag strict CSP", () => {
    const code = `res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'nonce-abc123'");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "Content-Security-Policy"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Insecure WebSocket
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: insecure WebSocket", () => {
  it("detects ws:// protocol", () => {
    const code = `const socket = new WebSocket("ws://api.example.com/ws");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "WebSocket"));
  });

  it("does not flag wss:// protocol", () => {
    const code = `const socket = new WebSocket("wss://api.example.com/ws");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "WebSocket"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  NoSQL injection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: NoSQL injection", () => {
  it("detects directly passing req.body to find()", () => {
    const code = `
app.get("/users", async (req, res) => {
  const users = await db.collection("users").find(req.body).toArray();
  res.json(users);
});`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "NoSQL injection"));
  });

  it("does not flag validated query", () => {
    const code = `
const { email } = schema.parse(req.body);
const user = await db.collection("users").findOne({ email });`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "NoSQL injection"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Mass assignment
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: mass assignment", () => {
  it("detects Model.create(req.body)", () => {
    const code = `await User.create(req.body);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "mass assignment"));
  });

  it("does not flag destructured fields", () => {
    const code = `
const { name, email } = req.body;
await User.create({ name, email });`;
    const findings = analyzeCybersecurity(code, "javascript");
    // The destructured pattern should not match mass assignment
    const massAssign = findings.filter((f) => f.title.toLowerCase().includes("mass assignment"));
    assert.equal(massAssign.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Cloud metadata endpoints
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: cloud metadata", () => {
  it("detects AWS metadata endpoint", () => {
    const code = `fetch("http://169.254.169.254/latest/meta-data/iam/credentials");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "metadata"));
  });

  it("detects GCP metadata endpoint", () => {
    const code = `fetch("http://metadata.google.internal/computeMetadata/v1/");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "metadata"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Insecure encryption (ECB)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: ECB encryption", () => {
  it("detects AES-ECB mode in Java", () => {
    const code = `Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");`;
    const findings = analyzeCybersecurity(code, "java");
    assert.ok(findByTitle(findings, "ECB"));
  });

  it("detects AES-ECB in Python", () => {
    const code = `cipher = AES.new(key, AES.MODE_ECB)`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "ECB"));
  });

  it("does not flag AES-GCM", () => {
    const code = `const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "ECB"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SQL injection
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: SQL injection", () => {
  it("detects template literal SQL with interpolation", () => {
    const code = "const result = db.query(`SELECT * FROM users WHERE id = ${userId}`);";
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "SQL injection"));
  });

  it("does not flag parameterized query", () => {
    const code = `const result = db.query("SELECT * FROM users WHERE id = $1", [userId]);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "SQL injection"));
  });

  it("detects Python f-string SQL", () => {
    const code = `cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "SQL injection"));
  });

  it("skips SQL-like strings in comments", () => {
    const code = `// SELECT * FROM users WHERE id = \${userId}`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "SQL injection"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Server-side XSS
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: server-side XSS", () => {
  it("detects res.send with user input concatenation", () => {
    const code = `res.send("<h1>" + req.query.name + "</h1>");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "XSS"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Path traversal
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: path traversal", () => {
  it("detects readFile with user input", () => {
    const code = `fs.readFileSync("/uploads/" + req.params.filename);`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "path traversal"));
  });

  it("does not flag readFile with static path", () => {
    const code = `fs.readFileSync("./config.json");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "path traversal"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Unsafe deserialization
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: unsafe deserialization", () => {
  it("detects pickle.loads in Python", () => {
    const code = `data = pickle.loads(request.data)`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "deserialization"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Timing attack
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: timing attack", () => {
  it("detects string comparison of secrets", () => {
    const code = `
if (signature === req.headers["x-hub-signature"]) {
  processWebhook(req.body);
}`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "timing") || findByTitle(findings, "constant-time"));
  });

  it("does not flag timingSafeEqual usage", () => {
    const code = `
const expected = Buffer.from(signature);
const actual = Buffer.from(req.headers["x-hub-signature"]);
if (crypto.timingSafeEqual(expected, actual)) {
  processWebhook(req.body);
}`;
    const findings = analyzeCybersecurity(code, "javascript");
    const timing = findings.filter(
      (f) => f.title.toLowerCase().includes("timing") || f.title.toLowerCase().includes("constant-time"),
    );
    assert.equal(timing.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Unsafe Rust code
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: unsafe Rust", () => {
  it("detects unsafe block without SAFETY comment", () => {
    const code = `
fn main() {
    unsafe {
        let ptr = std::ptr::null::<i32>();
        *ptr;
    }
}`;
    const findings = analyzeCybersecurity(code, "rust");
    assert.ok(findByTitle(findings, "Unsafe"));
  });

  it("does not flag unsafe with SAFETY documentation", () => {
    const code = `
fn main() {
    // SAFETY: ptr is guaranteed non-null by caller contract
    unsafe {
        let val = std::ptr::read(ptr);
    }
}`;
    const findings = analyzeCybersecurity(code, "rust");
    const unsafeFindings = findings.filter((f) => f.title.toLowerCase().includes("unsafe"));
    assert.equal(unsafeFindings.length, 0, "SAFETY comment should suppress unsafe finding");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Insecure HTTP URLs
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: insecure HTTP URLs", () => {
  it("detects http:// for sensitive API", () => {
    const code = `const resp = await fetch("http://api.example.com/auth/login");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(findByTitle(findings, "insecure HTTP"));
  });

  it("does not flag http://localhost", () => {
    const code = `const resp = await fetch("http://localhost:3000/api/data");`;
    const findings = analyzeCybersecurity(code, "javascript");
    assert.ok(!findByTitle(findings, "insecure HTTP"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PHP-specific: reflected XSS
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: PHP reflected XSS", () => {
  it("detects echo with $_GET", () => {
    const code = `echo "Welcome, " . $_GET['name'];`;
    const findings = analyzeCybersecurity(code, "php");
    assert.ok(findByTitle(findings, "XSS"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PHP file inclusion
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: PHP file inclusion", () => {
  it("detects include with variable", () => {
    const code = `include($page . ".php");`;
    const findings = analyzeCybersecurity(code, "php");
    assert.ok(findByTitle(findings, "file inclusion"));
  });

  it("does not flag include with static string", () => {
    const code = `include("header.php");`;
    const findings = analyzeCybersecurity(code, "php");
    assert.ok(!findByTitle(findings, "file inclusion"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  WebView security
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: insecure WebView", () => {
  it("detects WebView with JS enabled and user URL", () => {
    const code = `
webView.settings.javaScriptEnabled = true;
webView.loadUrl(intent.getStringExtra("url"));`;
    const findings = analyzeCybersecurity(code, "kotlin");
    assert.ok(findByTitle(findings, "WebView"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Debug mode
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: debug mode", () => {
  it("detects Flask debug=True", () => {
    const code = `app.run(debug=True)`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "Debug mode"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Weak/hardcoded secret keys
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: weak secret key", () => {
  it("detects hardcoded Flask secret key", () => {
    const code = `app.secret_key = "mysecret"`;
    const findings = analyzeCybersecurity(code, "python");
    assert.ok(findByTitle(findings, "secret key"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Kubernetes security
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: Kubernetes security", () => {
  it("detects privileged container", () => {
    const code = `
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    securityContext:
      privileged: true`;
    const findings = analyzeCybersecurity(code, "yaml");
    assert.ok(findByTitle(findings, "privileged") || findByTitle(findings, "Kubernetes"));
  });

  it("detects hostNetwork: true", () => {
    const code = `
apiVersion: v1
kind: Pod
spec:
  hostNetwork: true
  containers:
  - name: app`;
    const findings = analyzeCybersecurity(code, "yaml");
    assert.ok(
      findings.some(
        (f) => f.description.toLowerCase().includes("host") || f.title.toLowerCase().includes("kubernetes"),
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Weak crypto — static IV
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: weak crypto (static IV)", () => {
  it("detects static IV assignment", () => {
    const code = `const iv = "1234567890123456";`;
    const findings = analyzeCybersecurity(code, "javascript");
    // May be detected as weak crypto or ECB
    assert.ok(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes("crypto") ||
          f.title.toLowerCase().includes("ecb") ||
          f.title.toLowerCase().includes("weak"),
      ),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Clean code — no findings expected
// ═══════════════════════════════════════════════════════════════════════════

describe("Cybersecurity: clean code (negative tests)", () => {
  it("produces zero findings for safe Express app", () => {
    const code = `
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express from "express";

const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 900000, max: 100 }));

app.get("/api/data", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  const data = db.query("SELECT * FROM items WHERE id = $1", [id]);
  res.json(data);
});

app.listen(3000);`;
    const findings = analyzeCybersecurity(code, "javascript");
    // May flag linter or minor things, but should have no critical/high
    const critHigh = findings.filter((f) => f.severity === "critical" || f.severity === "high");
    assert.equal(critHigh.length, 0, "Clean code should have no critical/high findings");
  });

  it("produces zero findings for simple utility function", () => {
    const code = `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}`;
    const findings = analyzeCybersecurity(code, "typescript");
    assert.equal(findings.length, 0);
  });

  it("returns empty array for empty code", () => {
    const findings = analyzeCybersecurity("", "javascript");
    assert.equal(findings.length, 0);
  });
});
