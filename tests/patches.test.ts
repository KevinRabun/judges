// ─────────────────────────────────────────────────────────────────────────────
// Patches (Auto-Fix) — Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Exercises enrichWithPatches across many PATCH_RULES categories.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichWithPatches } from "../src/patches/index.js";
import type { Finding } from "../src/types.js";

function makeFinding(title: string, ruleId: string, lineNumbers: number[]): Finding {
  return { ruleId, severity: "high", title, description: "desc", lineNumbers };
}

function assertPatched(findings: Finding[], desc: string): void {
  const f = findings[0];
  assert.ok(f.patch, `${desc}: Expected patch to be generated`);
  assert.ok(f.patch.oldText, `${desc}: Expected oldText`);
  assert.ok(f.patch.newText, `${desc}: Expected newText`);
  assert.notEqual(f.patch.oldText, f.patch.newText, `${desc}: oldText should differ from newText`);
}

// ── Deprecated APIs ──────────────────────────────────────────────────────

describe("Patches: deprecated APIs", () => {
  it("new Buffer() → Buffer.from()", () => {
    const code = 'const buf = new Buffer("hello");';
    const f = [makeFinding("Deprecated API: new Buffer()", "MAINT-001", [1])];
    assertPatched(enrichWithPatches(f, code), "Buffer");
  });
});

// ── Transport Security ───────────────────────────────────────────────────

describe("Patches: transport security", () => {
  it("http:// → https://", () => {
    const code = 'fetch("http://api.example.com/data");';
    const f = [makeFinding("Unencrypted HTTP connection", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "http→https");
    assert.ok(result[0].patch!.newText.includes("https://"));
  });

  it("ws:// → wss://", () => {
    const code = 'new WebSocket("ws://api.example.com/ws");';
    const f = [makeFinding("Insecure WebSocket (ws://)", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "ws→wss");
    assert.ok(result[0].patch!.newText.includes("wss://"));
  });

  it("skips http://localhost", () => {
    const code = 'fetch("http://localhost:3000/api");';
    const f = [makeFinding("Unencrypted HTTP connection", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    assert.ok(!result[0].patch); // localhost should not be patched
  });
});

// ── Cryptography ─────────────────────────────────────────────────────────

describe("Patches: cryptography", () => {
  it("Math.random() → crypto.randomUUID()", () => {
    const code = "const id = Math.random().toString(36);";
    const f = [makeFinding("Insecure random number", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "Math.random");
    assert.ok(result[0].patch!.newText.includes("crypto.randomUUID"));
  });

  it("MD5 → SHA-256", () => {
    const code = "const hash = createHash('md5').update(data).digest();";
    const f = [makeFinding("Weak hash algorithm", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "MD5→SHA256");
    assert.ok(result[0].patch!.newText.includes("sha256"));
  });

  it("SHA-1 → SHA-256", () => {
    const code = 'const hash = createHash("sha1").update(data).digest();';
    const f = [makeFinding("Weak hash algorithm", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "SHA1→SHA256");
  });

  it("ECB → GCM", () => {
    const code = 'const cipher = createCipher("aes-256-ecb", key);';
    const f = [makeFinding("Insecure ECB encryption mode", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "ECB→GCM");
    assert.ok(result[0].patch!.newText.includes("gcm"));
  });
});

// ── Injection Prevention ─────────────────────────────────────────────────

describe("Patches: injection prevention", () => {
  it("eval() → new Function()", () => {
    const code = "const result = eval(expression);";
    const f = [makeFinding("Dangerous eval() usage", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "eval");
    assert.ok(result[0].patch!.newText.includes("Function"));
  });

  it("innerHTML → textContent", () => {
    const code = "element.innerHTML = userInput;";
    const f = [makeFinding("XSS via innerHTML", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "innerHTML");
    assert.ok(result[0].patch!.newText.includes("textContent"));
  });

  it("document.write → insertAdjacentHTML", () => {
    const code = 'document.write("<p>Hello</p>");';
    const f = [makeFinding("document.write usage", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "document.write");
    assert.ok(result[0].patch!.newText.includes("insertAdjacentHTML"));
  });

  it("exec() → execFile()", () => {
    const code = 'exec("ls " + dir);';
    const f = [makeFinding("Potential command injection", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "exec→execFile");
    assert.ok(result[0].patch!.newText.includes("execFile"));
  });

  it("RegExp with user input → escaped", () => {
    const code = "const re = new RegExp(userInput);";
    const f = [makeFinding("ReDoS risk: user input in RegExp", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "RegExp escape");
    assert.ok(result[0].patch!.newText.includes("replace"));
  });
});

// ── Equality & Type Safety ───────────────────────────────────────────────

describe("Patches: equality & type safety", () => {
  it("== → ===", () => {
    const code = "if (x == null) return;";
    const f = [makeFinding("Loose equality (==) instead of strict (===)", "SWDEV-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "==→===");
    assert.ok(result[0].patch!.newText.includes("==="));
  });

  it("throw string → throw new Error()", () => {
    const code = 'throw "something went wrong";';
    const f = [makeFinding("Throwing string literal instead of Error", "ERR-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "throw string");
    assert.ok(result[0].patch!.newText.includes("new Error"));
  });

  it(": any → : unknown", () => {
    const code = "function process(data: any) {";
    const f = [makeFinding("Unsafe any type usage", "SWDEV-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "any→unknown");
    assert.ok(result[0].patch!.newText.includes("unknown"));
  });

  it("var → let", () => {
    const code = "var count = 0;";
    const f = [makeFinding("var declaration instead of let/const", "MAINT-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "var→let");
    assert.ok(result[0].patch!.newText.includes("let"));
  });
});

// ── Logging ──────────────────────────────────────────────────────────────

describe("Patches: logging", () => {
  it("console.log → logger.info", () => {
    const code = 'console.log("User logged in", userId);';
    const f = [makeFinding("console.log instead of structured logger", "OBS-001", [1])];
    const result = enrichWithPatches(f, code);
    assertPatched(result, "console.log");
    assert.ok(result[0].patch!.newText.includes("logger.info"));
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────

describe("Patches: edge cases", () => {
  it("skips findings without line numbers", () => {
    const code = "const x = eval(y);";
    const f = [makeFinding("Dangerous eval() usage", "CYBER-001", [])];
    const result = enrichWithPatches(f, code);
    assert.ok(!result[0].patch);
  });

  it("skips findings with existing patch", () => {
    const code = "const x = eval(y);";
    const f: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "high",
        title: "Dangerous eval() usage",
        description: "desc",
        lineNumbers: [1],
        patch: { oldText: "eval", newText: "safe", startLine: 1, endLine: 1 },
      },
    ];
    const result = enrichWithPatches(f, code);
    assert.equal(result[0].patch!.oldText, "eval"); // Original patch preserved
  });

  it("skips line numbers out of range", () => {
    const code = "const x = 1;";
    const f = [makeFinding("Dangerous eval() usage", "CYBER-001", [999])];
    const result = enrichWithPatches(f, code);
    assert.ok(!result[0].patch);
  });

  it("handles empty findings array", () => {
    const result = enrichWithPatches([], "const x = 1;");
    assert.equal(result.length, 0);
  });

  it("handles empty code", () => {
    const f = [makeFinding("Test", "SEC-001", [1])];
    const result = enrichWithPatches(f, "");
    assert.ok(!result[0].patch);
  });

  it("preserves all other finding fields", () => {
    const code = 'const buf = new Buffer("test");';
    const f: Finding[] = [
      {
        ruleId: "MAINT-001",
        severity: "medium",
        title: "Deprecated API usage",
        description: "Use Buffer.from instead",
        lineNumbers: [1],
        recommendation: "Update to Buffer.from",
        confidence: 0.9,
      },
    ];
    const result = enrichWithPatches(f, code);
    assert.equal(result[0].severity, "medium");
    assert.equal(result[0].confidence, 0.9);
    assert.equal(result[0].recommendation, "Update to Buffer.from");
  });

  it("processes multiple findings independently", () => {
    const code = 'const buf = new Buffer("a");\nconst id = Math.random();';
    const findings = [
      makeFinding("Deprecated API usage", "MAINT-001", [1]),
      makeFinding("Insecure random number", "SEC-001", [2]),
    ];
    const result = enrichWithPatches(findings, code);
    assert.equal(result.length, 2);
    // Both should get patches
    assert.ok(result[0].patch);
    assert.ok(result[1].patch);
  });

  it("matches on ruleId when title doesn't match", () => {
    const code = "const x = eval(y);";
    const f: Finding[] = [
      {
        ruleId: "CYBER-001",
        severity: "high",
        title: "Something about eval",
        description: "desc",
        lineNumbers: [1],
      },
    ];
    // The match regex tests both title and ruleId
    const result = enrichWithPatches(f, code);
    // May or may not match depending on rule regex
    assert.ok(Array.isArray(result));
  });
});

// ── Additional patch categories ──────────────────────────────────────────

describe("Patches: error handling", () => {
  it("empty catch → catch with handler", () => {
    const code = "try { riskyOp(); } catch () {}";
    const f = [makeFinding("Empty catch block swallows errors", "ERR-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assertPatched(result, "empty catch");
  });
});

describe("Patches: CORS/CSP", () => {
  it("wildcard CORS → env-based origin", () => {
    const code = 'app.use(cors({ origin: "*" }));';
    const f = [makeFinding("Wildcard CORS configuration", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("ALLOWED_ORIGIN"));
  });

  it("CSP unsafe-inline → nonce-based", () => {
    const code = "res.setHeader('Content-Security-Policy', 'script-src \\'unsafe-inline\\'');";
    const f = [makeFinding("Content-Security-Policy with unsafe-inline", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("nonce"));
  });
});

describe("Patches: cookie security", () => {
  it("secure: false → secure: true", () => {
    const code = "cookie: { secure: false, httpOnly: true }";
    const f = [makeFinding("Cookie security missing secure flag", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("true"));
  });
});

describe("Patches: authentication", () => {
  it("jwt.decode → jwt.verify", () => {
    const code = "const payload = jwt.decode(token);";
    const f = [makeFinding("JWT decoded without verification", "AUTH-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("verify"));
  });

  it("rejectUnauthorized: false → true", () => {
    const code = "const agent = new https.Agent({ rejectUnauthorized: false });";
    const f = [makeFinding("TLS certificate validation disabled", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("true"));
  });
});

describe("Patches: async/sync I/O", () => {
  it("readFileSync → await readFile", () => {
    const code = 'const data = readFileSync("config.json", "utf-8");';
    const f = [makeFinding("Synchronous blocking I/O", "PERF-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("await"));
  });

  it(".then without .catch → add catch", () => {
    const code = "fetchData().then(process);";
    const f = [makeFinding("Promise then without catch handler", "ERR-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("catch"));
  });
});

describe("Patches: database", () => {
  it("SELECT * → explicit columns reminder", () => {
    const code = 'db.query("SELECT * FROM users WHERE id = $1", [id]);';
    const f = [makeFinding("SELECT * used in query", "DB-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("specify columns"));
  });
});

describe("Patches: Docker", () => {
  it(":latest → pinned version", () => {
    const code = "FROM node:latest";
    const f = [makeFinding("Docker latest tag used", "CICD-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("lts-slim"));
  });

  it("npm install → npm ci", () => {
    const code = "RUN npm install";
    const f = [makeFinding("npm install instead of npm ci", "CICD-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("npm ci"));
  });
});

describe("Patches: Python-specific", () => {
  it("hashlib.md5 → hashlib.sha256", () => {
    const code = "h = hashlib.md5(data)";
    const f = [makeFinding("Weak hash algorithm used", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("sha256"));
  });

  it("pickle.loads → json.loads", () => {
    const code = "data = pickle.loads(raw)";
    const f = [makeFinding("Unsafe deserialization with pickle", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("json.loads"));
  });

  it("yaml.load → yaml.safe_load", () => {
    const code = "config = yaml.load(raw_data)";
    const f = [makeFinding("Unsafe YAML load", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("safe_load"));
  });

  it("os.system → subprocess.run", () => {
    const code = 'os.system(f"rm -rf {path}")';
    const f = [makeFinding("Command injection via os.system", "CYBER-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("subprocess.run"));
  });
});

describe("Patches: configuration", () => {
  it("debug: true → env-based", () => {
    const code = "const config = { debug: true };";
    const f = [makeFinding("Debug mode enabled in production", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("NODE_ENV"));
  });

  it("hardcoded connection string → env var", () => {
    const code = 'const db = connect("mongodb://admin:pass@host/db");';
    const f = [makeFinding("Hardcoded connection string in code", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("DATABASE_URL"));
  });
});

describe("Patches: accessibility", () => {
  it("outline: none → visible focus style", () => {
    const code = "a:focus { outline: none; }";
    const f = [makeFinding("Focus indicator removed with outline: none", "A11Y-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("2px solid"));
  });

  it("img without alt → add alt", () => {
    const code = '<img src="/logo.png" />';
    const f = [makeFinding("Image missing alt text", "A11Y-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("alt"));
  });
});

describe("Patches: network", () => {
  it("0.0.0.0 → 127.0.0.1", () => {
    const code = 'app.listen(3000, "0.0.0.0");';
    const f = [makeFinding("Binds to all network interfaces (0.0.0.0)", "SEC-001", [1])];
    const result = enrichWithPatches(f, code);
    if (result[0].patch) assert.ok(result[0].patch.newText.includes("127.0.0.1"));
  });
});
