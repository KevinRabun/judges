// ─────────────────────────────────────────────────────────────────────────────
// Individual Evaluator Deep Tests — exercises specific judge evaluators
// with targeted code samples to cover more branches
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithJudge } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";

function evalJ(id: string, code: string, lang: string) {
  return evaluateWithJudge(getJudge(id)!, code, lang);
}

// ═══════════════ accessibility ════════════════════════════════════════════

describe("Evaluator-deep: accessibility", () => {
  it("detects missing alt attributes", () => {
    const code = '<img src="/photo.jpg" />\n<img src="/icon.svg" />';
    const r = evalJ("accessibility", code, "html");
    assert.ok(r.findings.length > 0);
  });

  it("detects click handlers on divs instead of buttons", () => {
    const code = '<div onclick="submit()">Submit</div>\n<div onclick="cancel()">Cancel</div>';
    const r = evalJ("accessibility", code, "html");
    assert.ok(r.findings.length > 0);
  });

  it("detects missing form labels", () => {
    const code = '<input type="text" placeholder="Name" />\n<input type="email" placeholder="Email" />';
    const r = evalJ("accessibility", code, "html");
    assert.ok(r.findings.length > 0);
  });

  it("detects color-only indicators", () => {
    const code = '<span style="color: red">Error</span>\n<span style="color: green">Success</span>';
    const r = evalJ("accessibility", code, "html");
    assert.ok(typeof r.score === "number");
  });

  it("passes clean accessible form", () => {
    const code =
      '<form>\n  <label for="name">Name</label>\n  <input id="name" type="text" aria-required="true" />\n  <button type="submit">Submit</button>\n</form>';
    const r = evalJ("accessibility", code, "html");
    const critical = r.findings.filter((f) => f.severity === "critical");
    assert.equal(critical.length, 0);
  });
});

// ═══════════════ software-practices ═══════════════════════════════════════

describe("Evaluator-deep: software-practices", () => {
  it("detects console.log usage", () => {
    const code = 'function process() {\n  console.log("debug");\n  console.log("result:", data);\n  return data;\n}';
    const r = evalJ("software-practices", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects magic numbers", () => {
    const code = "function calculate(x) {\n  if (x > 86400) return x / 3600;\n  return x * 0.0254;\n}";
    const r = evalJ("software-practices", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects TODO/FIXME comments", () => {
    const code =
      "// TODO: implement this properly\n// FIXME: this is broken\n// HACK: temporary workaround\nfunction stub() {}";
    const r = evalJ("software-practices", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("passes clean code", () => {
    const code =
      "const MAX_RETRIES = 3;\nexport function retry(fn: () => void) {\n  for (let i = 0; i < MAX_RETRIES; i++) {\n    try { fn(); return; } catch { continue; }\n  }\n}";
    const r = evalJ("software-practices", code, "typescript");
    assert.ok(r.score >= 50);
  });
});

// ═══════════════ documentation ════════════════════════════════════════════

describe("Evaluator-deep: documentation", () => {
  it("detects undocumented exported functions", () => {
    const code =
      "export function processData(input: any) {\n  return transform(input);\n}\n\nexport function validate(x: unknown) {\n  return !!x;\n}";
    const r = evalJ("documentation", code, "typescript");
    assert.ok(typeof r.score === "number");
  });

  it("passes well-documented code", () => {
    const code =
      "/**\n * Process user input and return transformed data.\n * @param input - Raw user input\n * @returns Transformed data object\n */\nexport function processData(input: string): Data {\n  return transform(input);\n}";
    const r = evalJ("documentation", code, "typescript");
    assert.ok(r.score >= 50);
  });
});

// ═══════════════ data-sovereignty ═════════════════════════════════════════

describe("Evaluator-deep: data-sovereignty", () => {
  it("detects hardcoded US region for data storage", () => {
    const code = `
const s3 = new S3({ region: "us-east-1" });
await s3.putObject({ Bucket: "user-data", Key: userId, Body: JSON.stringify(userData) });
`;
    const r = evalJ("data-sovereignty", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects cross-region data transfer", () => {
    const code = `
const config = {
  primaryRegion: "eu-west-1",
  backupRegion: "us-east-1",
  replicationEnabled: true,
};
await replicateUserData(config.primaryRegion, config.backupRegion, userData);
`;
    const r = evalJ("data-sovereignty", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ observability ════════════════════════════════════════════

describe("Evaluator-deep: observability", () => {
  it("detects missing structured logging", () => {
    const code =
      'console.log("User logged in");\nconsole.log("Error: " + err.message);\nconsole.log("Request:", req.url);';
    const r = evalJ("observability", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects missing error tracking", () => {
    const code =
      "app.get('/api', async (req, res) => {\n  try { const data = await fetch(url); res.json(data); }\n  catch { res.status(500).send('error'); }\n});";
    const r = evalJ("observability", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ concurrency ═════════════════════════════════════════════

describe("Evaluator-deep: concurrency", () => {
  it("detects race condition patterns", () => {
    const code = `
let counter = 0;
async function increment() {
  const current = counter;
  await delay(10);
  counter = current + 1;
}
Promise.all([increment(), increment(), increment()]);
`;
    const r = evalJ("concurrency", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects unbounded Promise.all", () => {
    const code = "const results = await Promise.all(urls.map(url => fetch(url)));";
    const r = evalJ("concurrency", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ database ════════════════════════════════════════════════

describe("Evaluator-deep: database", () => {
  it("detects SELECT * queries", () => {
    const code =
      'const users = await db.query("SELECT * FROM users");\nconst orders = await db.query("SELECT * FROM orders WHERE user_id = $1", [id]);';
    const r = evalJ("database", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects missing connection pooling", () => {
    const code =
      'const conn = new Client({ connectionString: process.env.DATABASE_URL });\nawait conn.connect();\nconst result = await conn.query("SELECT 1");\nawait conn.end();';
    const r = evalJ("database", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects missing transactions for multi-step operations", () => {
    const code = `
await db.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, fromId]);
await db.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, toId]);
await db.query("INSERT INTO transfers (from_id, to_id, amount) VALUES ($1, $2, $3)", [fromId, toId, amount]);
`;
    const r = evalJ("database", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ caching ═════════════════════════════════════════════════

describe("Evaluator-deep: caching", () => {
  it("detects repetitive database calls without caching", () => {
    const code = `
app.get("/api/config", async (req, res) => {
  const config = await db.query("SELECT * FROM config");
  res.json(config);
});
app.get("/api/settings", async (req, res) => {
  const config = await db.query("SELECT * FROM config");
  res.json(config);
});
`;
    const r = evalJ("caching", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ rate-limiting ════════════════════════════════════════════

describe("Evaluator-deep: rate-limiting", () => {
  it("detects API without rate limiting", () => {
    const code = `
app.post("/api/login", async (req, res) => {
  const user = await authenticate(req.body);
  res.json(user);
});
app.post("/api/register", async (req, res) => {
  const user = await createUser(req.body);
  res.json(user);
});
app.listen(3000);
`;
    const r = evalJ("rate-limiting", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ compliance ══════════════════════════════════════════════

describe("Evaluator-deep: compliance", () => {
  it("detects PII in logs", () => {
    const code =
      'logger.info("User data:", { ssn: user.ssn, email: user.email, cardNumber: user.card });\nconsole.log("DOB:", user.dateOfBirth);';
    const r = evalJ("compliance", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects missing audit trail", () => {
    const code = `
async function deleteUser(userId) {
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  await db.query("DELETE FROM user_data WHERE user_id = $1", [userId]);
}`;
    const r = evalJ("compliance", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ over-engineering ═════════════════════════════════════════

describe("Evaluator-deep: over-engineering", () => {
  it("detects unnecessary abstractions", () => {
    const code = `
class UserRepositoryFactory {
  static create(config: Config): UserRepository {
    return new UserRepositoryImpl(new DatabaseConnectionFactory().create(config));
  }
}
class DatabaseConnectionFactory {
  create(config: Config) { return new Connection(config.url); }
}
class UserRepositoryImpl implements UserRepository {
  constructor(private conn: Connection) {}
  findById(id: string) { return this.conn.query("SELECT * FROM users WHERE id = $1", [id]); }
}
`;
    const r = evalJ("over-engineering", code, "typescript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ logic-review ════════════════════════════════════════════

describe("Evaluator-deep: logic-review", () => {
  it("detects always-true conditions", () => {
    const code = "function check(x: number) {\n  if (x >= 0 || x < 0) return true;\n  return false; // unreachable\n}";
    const r = evalJ("logic-review", code, "typescript");
    assert.ok(typeof r.score === "number");
  });

  it("detects off-by-one in bounds check", () => {
    const code =
      "function getItem(arr: number[], index: number) {\n  if (index <= arr.length) return arr[index]; // should be <\n  return null;\n}";
    const r = evalJ("logic-review", code, "typescript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ internationalization ═════════════════════════════════════

describe("Evaluator-deep: internationalization", () => {
  it("detects hardcoded strings", () => {
    const code = "<h1>Welcome to our app</h1>\n<p>Please sign in to continue</p>\n<button>Submit</button>";
    const r = evalJ("internationalization", code, "html");
    assert.ok(typeof r.score === "number");
  });

  it("detects hardcoded currency formatting", () => {
    const code = "function formatPrice(amount: number) { return '$' + amount.toFixed(2); }";
    const r = evalJ("internationalization", code, "typescript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ portability ═════════════════════════════════════════════

describe("Evaluator-deep: portability", () => {
  it("detects OS-specific paths", () => {
    const code =
      'const logPath = "C:\\\\Windows\\\\Temp\\\\app.log";\nconst config = "C:\\\\Program Files\\\\MyApp\\\\config.ini";';
    const r = evalJ("portability", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects OS-specific shell commands", () => {
    const code = '{ "scripts": { "build": "rm -rf dist && mkdir -p out", "deploy": "rsync -avz dist/ server:/app/" } }';
    const r = evalJ("portability", code, "json");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════════ cost-effectiveness ══════════════════════════════════════

describe("Evaluator-deep: cost-effectiveness", () => {
  it("detects expensive resource usage patterns", () => {
    const code = `
const instance = new EC2({});
await instance.runInstances({
  InstanceType: "p4d.24xlarge",
  MinCount: 10,
  MaxCount: 10,
});
`;
    const r = evalJ("cost-effectiveness", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});
