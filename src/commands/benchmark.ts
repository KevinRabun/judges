/**
 * `judges benchmark` — Benchmark suite for measuring detection accuracy.
 *
 * Runs judges against curated test cases with known vulnerabilities
 * to compute precision, recall, F1 scores, and detection rates.
 *
 * Usage:
 *   judges benchmark run                # Run full benchmark suite
 *   judges benchmark run --judge cyber  # Benchmark a single judge
 *   judges benchmark report             # Generate benchmark report
 *   judges benchmark compare <a> <b>    # Compare two benchmark results
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { evaluateWithTribunal, evaluateWithJudge } from "../evaluators/index.js";
import { getJudge } from "../judges/index.js";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BenchmarkCase {
  /** Unique identifier for this test case */
  id: string;
  /** Description of the vulnerability or scenario */
  description: string;
  /** Programming language */
  language: string;
  /** Source code containing the known vulnerability (or no vulnerability) */
  code: string;
  /** Expected findings — rule IDs that should be detected */
  expectedRuleIds: string[];
  /** Rule IDs that should NOT be detected (known false positives) */
  unexpectedRuleIds?: string[];
  /** Category of vulnerability (e.g. "injection", "auth", "xss") */
  category: string;
  /** Difficulty level */
  difficulty: "easy" | "medium" | "hard";
}

export interface BenchmarkResult {
  /** Timestamp of run */
  timestamp: string;
  /** Version of judges used */
  version: string;
  /** Total test cases run */
  totalCases: number;
  /** Cases where at least one expected rule was detected */
  detected: number;
  /** Cases where no expected rule was detected */
  missed: number;
  /** Total expected findings across all cases */
  totalExpected: number;
  /** True positives: expected findings that were detected */
  truePositives: number;
  /** False negatives: expected findings that were missed */
  falseNegatives: number;
  /** False positives: unexpected findings that were detected */
  falsePositives: number;
  /** Precision: TP / (TP + FP) */
  precision: number;
  /** Recall: TP / (TP + FN) */
  recall: number;
  /** F1 score: harmonic mean of precision and recall */
  f1Score: number;
  /** Detection rate: cases detected / total cases */
  detectionRate: number;
  /** Per-category results */
  perCategory: Record<string, CategoryResult>;
  /** Per-judge results */
  perJudge: Record<string, JudgeBenchmarkResult>;
  /** Individual case results */
  cases: CaseResult[];
}

export interface CategoryResult {
  category: string;
  total: number;
  detected: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface JudgeBenchmarkResult {
  judgeId: string;
  total: number;
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface CaseResult {
  caseId: string;
  category: string;
  difficulty: string;
  passed: boolean;
  expectedRuleIds: string[];
  detectedRuleIds: string[];
  missedRuleIds: string[];
  falsePositiveRuleIds: string[];
}

// ─── Built-in Benchmark Cases ───────────────────────────────────────────────

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // ── SQL Injection ──
  {
    id: "sql-injection-basic",
    description: "Basic SQL injection via string concatenation",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/users", (req, res) => {
  const query = "SELECT * FROM users WHERE id = " + req.query.id;
  db.query(query);
  res.send("ok");
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "CYBER-003", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sql-injection-template",
    description: "SQL injection via template literal",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.post("/search", (req, res) => {
  const sql = \`SELECT * FROM products WHERE name LIKE '%\${req.body.term}%'\`;
  connection.execute(sql);
  res.json({ ok: true });
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── XSS ──
  {
    id: "xss-reflected",
    description: "Reflected XSS via unsanitized output",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/greet", (req, res) => {
  res.send("<h1>Hello " + req.query.name + "</h1>");
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "xss",
    difficulty: "easy",
  },
  {
    id: "xss-innerhtml",
    description: "DOM XSS via innerHTML assignment",
    language: "javascript",
    code: `function displayMessage(userInput) {
  document.getElementById("msg").innerHTML = userInput;
}
const params = new URLSearchParams(window.location.search);
displayMessage(params.get("message"));`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "xss",
    difficulty: "easy",
  },

  // ── Authentication ──
  {
    id: "hardcoded-secret",
    description: "Hardcoded API key in source",
    language: "typescript",
    code: `const API_KEY = "sk-proj-abc123def456";
const DB_PASSWORD = "super_secret_password_123";
fetch("https://api.example.com", {
  headers: { Authorization: "Bearer " + API_KEY }
});`,
    expectedRuleIds: ["AUTH-001", "AUTH-002", "AUTH-003"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "weak-password-hash",
    description: "Using MD5 for password hashing",
    language: "typescript",
    code: `import crypto from "crypto";
function hashPassword(password: string): string {
  return crypto.createHash("md5").update(password).digest("hex");
}
function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ── Command Injection ──
  {
    id: "command-injection",
    description: "OS command injection via exec",
    language: "typescript",
    code: `import { exec } from "child_process";
import express from "express";
const app = express();
app.get("/ping", (req, res) => {
  exec("ping -c 1 " + req.query.host, (err, stdout) => {
    res.send(stdout);
  });
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "CYBER-003"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Path Traversal ──
  {
    id: "path-traversal",
    description: "Path traversal via unsanitized file read",
    language: "typescript",
    code: `import express from "express";
import { readFileSync } from "fs";
const app = express();
app.get("/file", (req, res) => {
  const content = readFileSync("/data/" + req.query.path, "utf-8");
  res.send(content);
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },

  // ── Eval Usage ──
  {
    id: "eval-user-input",
    description: "Eval with user-controlled input",
    language: "javascript",
    code: `const express = require("express");
const app = express();
app.post("/calculate", (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Missing Rate Limiting ──
  {
    id: "no-rate-limiting",
    description: "API endpoint without rate limiting",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.findUser(username);
  if (user && user.password === password) {
    res.json({ token: generateToken(user) });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});
app.listen(3000);`,
    expectedRuleIds: ["RATE-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ── Missing Error Handling ──
  {
    id: "empty-catch-block",
    description: "Empty catch blocks swallowing errors",
    language: "typescript",
    code: `async function processPayment(amount: number) {
  try {
    const result = await stripe.charges.create({ amount });
    return result;
  } catch (e) {
    // TODO: handle this later
  }
}

async function fetchData(url: string) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {}
}`,
    expectedRuleIds: ["ERR-001", "ERR-002"],
    category: "error-handling",
    difficulty: "easy",
  },

  // ── Data Security ──
  {
    id: "pii-logging",
    description: "Logging PII/sensitive data",
    language: "typescript",
    code: `function processUser(user: { email: string; ssn: string; creditCard: string }) {
  console.log("Processing user:", JSON.stringify(user));
  logger.info("User SSN:", user.ssn);
  logger.debug("Credit card:", user.creditCard);
  return saveUser(user);
}`,
    expectedRuleIds: ["DATA-001", "DATA-002", "LOG-001"],
    category: "data-security",
    difficulty: "easy",
  },

  // ── Clean Code (no vulnerabilities) ──
  {
    id: "clean-code-express",
    description: "Well-structured Express API with proper security",
    language: "typescript",
    code: `import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

app.post("/login",
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    const user = await db.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!, { expiresIn: "1h" });
    res.json({ token });
  }
);`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Python SQL Injection ──
  {
    id: "python-sql-injection",
    description: "Python f-string SQL injection",
    language: "python",
    code: `from flask import Flask, request
import sqlite3

app = Flask(__name__)

@app.route("/users")
def get_user():
    user_id = request.args.get("id")
    conn = sqlite3.connect("db.sqlite")
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return str(cursor.fetchall())`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Insecure Deserialization ──
  {
    id: "unsafe-deserialization",
    description: "Deserializing untrusted data with eval/JSON.parse on unvalidated input",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.post("/import", (req, res) => {
  const data = eval("(" + req.body.payload + ")");
  const config = new Function("return " + req.body.config)();
  processData(data, config);
  res.send("imported");
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },

  // ── Missing HTTPS ──
  {
    id: "insecure-http",
    description: "HTTP URLs for sensitive operations",
    language: "typescript",
    code: `const API_BASE = "http://api.example.com";

async function login(user: string, pass: string) {
  const response = await fetch(API_BASE + "/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: user, password: pass }),
  });
  return response.json();
}

async function getPayment(id: string) {
  return fetch("http://payments.example.com/api/v1/charge/" + id);
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "easy",
  },

  // ── Missing Input Validation ──
  {
    id: "no-input-validation",
    description: "API endpoint with no input validation",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.post("/transfer", async (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  await db.transfer(fromAccount, toAccount, amount);
  res.json({ success: true });
});

app.put("/user/:id", async (req, res) => {
  await db.updateUser(req.params.id, req.body);
  res.json({ updated: true });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ── Concurrency Issues ──
  {
    id: "race-condition",
    description: "Race condition in shared state without synchronization",
    language: "typescript",
    code: `let balance = 1000;

async function withdraw(amount: number): Promise<boolean> {
  if (balance >= amount) {
    await new Promise(r => setTimeout(r, 100)); // Simulated delay
    balance -= amount;
    return true;
  }
  return false;
}

// Called concurrently from multiple requests
app.post("/withdraw", async (req, res) => {
  const success = await withdraw(req.body.amount);
  res.json({ success, balance });
});`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },

  // ── Performance ──
  {
    id: "perf-sync-io",
    description: "Synchronous file I/O in request handler",
    language: "typescript",
    code: `import express from "express";
import { readFileSync, writeFileSync } from "fs";
const app = express();
app.get("/config", (req, res) => {
  const data = readFileSync("/etc/app/config.json", "utf-8");
  writeFileSync("/var/log/access.log", new Date().toISOString() + "\\n", { flag: "a" });
  res.json(JSON.parse(data));
});
app.listen(3000);`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "perf-n-plus-one",
    description: "N+1 query pattern in loop",
    language: "typescript",
    code: `async function getOrdersWithProducts(userId: string) {
  const orders = await db.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
  const results = [];
  for (const order of orders) {
    const products = await db.query("SELECT * FROM products WHERE order_id = $1", [order.id]);
    results.push({ ...order, products });
  }
  return results;
}`,
    expectedRuleIds: ["PERF-001", "DB-001"],
    category: "performance",
    difficulty: "medium",
  },

  // ── Database ──
  {
    id: "db-no-index-hint",
    description: "Unindexed query patterns on large tables",
    language: "typescript",
    code: `async function searchUsers(email: string) {
  return db.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
}
async function findOldOrders() {
  return db.query("SELECT * FROM orders WHERE created_at < NOW() - INTERVAL '90 days' ORDER BY created_at");
}
async function getByStatus(status: string) {
  return db.query("SELECT * FROM logs WHERE status = $1 AND timestamp > NOW() - INTERVAL '24 hours'", [status]);
}`,
    expectedRuleIds: ["DB-001"],
    category: "database",
    difficulty: "medium",
  },

  // ── API Design ──
  {
    id: "api-no-versioning",
    description: "API without versioning or pagination",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/users", async (req, res) => {
  const users = await db.query("SELECT * FROM users");
  res.json(users);
});
app.get("/products", async (req, res) => {
  const products = await db.query("SELECT * FROM products");
  res.json(products);
});
app.delete("/user", async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.body.id]);
  res.send("deleted");
});`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "medium",
  },

  // ── Observability ──
  {
    id: "obs-no-logging",
    description: "Service with no structured logging or monitoring",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.post("/order", async (req, res) => {
  const order = await createOrder(req.body);
  res.json(order);
});
app.get("/status", (req, res) => {
  res.json({ ok: true });
});
app.listen(process.env.PORT);`,
    expectedRuleIds: ["OBS-001"],
    category: "observability",
    difficulty: "easy",
  },

  // ── Reliability ──
  {
    id: "rel-no-health-check",
    description: "Web service without health check or graceful shutdown",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/api/data", async (req, res) => {
  const data = await fetchFromDatabase();
  res.json(data);
});
app.listen(8080, () => {
  console.log("Server started on port 8080");
});`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "easy",
  },
  {
    id: "rel-no-timeout",
    description: "External HTTP calls without timeout",
    language: "typescript",
    code: `async function fetchUserProfile(userId: string) {
  const response = await fetch("https://api.example.com/users/" + userId);
  return response.json();
}
async function sendNotification(email: string, msg: string) {
  await fetch("https://email.example.com/send", {
    method: "POST",
    body: JSON.stringify({ to: email, message: msg }),
  });
}`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ── Scalability ──
  {
    id: "scale-global-state",
    description: "Storing session state in-memory on server",
    language: "typescript",
    code: `import express from "express";
const sessions: Record<string, any> = {};
const app = express();
app.post("/login", (req, res) => {
  const token = Math.random().toString(36);
  sessions[token] = { user: req.body.username, createdAt: Date.now() };
  res.json({ token });
});
app.get("/profile", (req, res) => {
  const session = sessions[req.headers.authorization as string];
  if (!session) return res.status(401).send("Unauthorized");
  res.json(session);
});`,
    expectedRuleIds: ["SCALE-001"],
    category: "scalability",
    difficulty: "medium",
  },

  // ── Cloud Readiness ──
  {
    id: "cloud-hardcoded-paths",
    description: "Hardcoded local filesystem paths and ports",
    language: "typescript",
    code: `import { readFileSync, writeFileSync } from "fs";
const CONFIG_PATH = "C:\\\\Program Files\\\\MyApp\\\\config.json";
const LOG_PATH = "/var/log/myapp/app.log";

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}
function writeLog(msg: string) {
  writeFileSync(LOG_PATH, msg + "\\n", { flag: "a" });
}
const server = app.listen(3000);`,
    expectedRuleIds: ["CLOUD-001"],
    category: "cloud-readiness",
    difficulty: "easy",
  },

  // ── Configuration Management ──
  {
    id: "config-scattered-env",
    description: "Scattered environment variable access without validation",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/api", (req, res) => {
  const dbHost = process.env.DB_HOST;
  const dbPort = parseInt(process.env.DB_PORT!);
  const apiKey = process.env.API_KEY;
  fetch(\`http://\${dbHost}:\${dbPort}/data\`, {
    headers: { "X-API-Key": apiKey! }
  }).then(r => r.json()).then(data => res.json(data));
});`,
    expectedRuleIds: ["CFG-001"],
    category: "configuration",
    difficulty: "easy",
  },

  // ── Maintainability ──
  {
    id: "maint-god-function",
    description: "Overly long function with multiple responsibilities",
    language: "typescript",
    code: `async function processOrder(req: any) {
  // Validate input
  if (!req.body.items || !Array.isArray(req.body.items)) throw new Error("Invalid");
  if (!req.body.userId) throw new Error("No user");
  if (!req.body.paymentMethod) throw new Error("No payment");
  // Calculate totals
  let total = 0;
  for (const item of req.body.items) {
    const product = await db.query("SELECT price FROM products WHERE id = $1", [item.id]);
    total += product.price * item.quantity;
  }
  // Apply discount
  const user = await db.query("SELECT * FROM users WHERE id = $1", [req.body.userId]);
  if (user.isPremium) total *= 0.9;
  // Process payment
  const charge = await stripe.charges.create({ amount: total, source: req.body.paymentMethod });
  if (!charge.paid) throw new Error("Payment failed");
  // Create order
  const order = await db.query("INSERT INTO orders (user_id, total, payment_id) VALUES ($1, $2, $3)", [req.body.userId, total, charge.id]);
  // Send email
  await mailer.send({ to: user.email, subject: "Order Confirmed", body: "Your order #" + order.id });
  // Update inventory
  for (const item of req.body.items) {
    await db.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.quantity, item.id]);
  }
  // Log
  console.log("Order processed:", order.id);
  return order;
}`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "medium",
  },
  {
    id: "maint-magic-numbers",
    description: "Magic numbers and strings without named constants",
    language: "typescript",
    code: `function calculateShipping(weight: number, distance: number): number {
  if (weight < 5) return distance * 0.5 + 2.99;
  if (weight < 20) return distance * 0.75 + 4.99;
  if (distance > 500) return weight * 1.2 + 15.0;
  return weight * 0.8 + 9.99;
}

function getDiscount(total: number, loyaltyYears: number): number {
  if (loyaltyYears > 10) return total * 0.25;
  if (loyaltyYears > 5) return total * 0.15;
  if (total > 100) return total * 0.05;
  return 0;
}`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "easy",
  },

  // ── Code Structure ──
  {
    id: "struct-deep-nesting",
    description: "Deeply nested control flow",
    language: "typescript",
    code: `function processEvent(event: any): string {
  if (event) {
    if (event.type === "click") {
      if (event.target) {
        if (event.target.id) {
          if (event.target.id.startsWith("btn-")) {
            if (event.detail) {
              if (event.detail > 1) {
                return "double-click on button";
              } else {
                return "single-click on button";
              }
            }
          }
        }
      }
    } else if (event.type === "keydown") {
      if (event.key) {
        if (event.key === "Enter") {
          return "enter pressed";
        }
      }
    }
  }
  return "unknown";
}`,
    expectedRuleIds: ["STRUCT-001"],
    category: "code-structure",
    difficulty: "easy",
  },

  // ── Documentation ──
  {
    id: "doc-no-docs",
    description: "Public API without documentation",
    language: "typescript",
    code: `export function calculateTax(a: number, b: string, c: boolean): number {
  const rates: Record<string, number> = { US: 0.08, UK: 0.20, DE: 0.19, JP: 0.10 };
  const rate = rates[b] || 0.15;
  return c ? a * rate * 0.5 : a * rate;
}

export function transformData(input: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of input) {
    const key = (item as any).id || String(Math.random());
    result[key] = item;
  }
  return result;
}

export class DataProcessor {
  private buffer: unknown[] = [];
  process(item: unknown): void { this.buffer.push(item); }
  flush(): unknown[] { const r = [...this.buffer]; this.buffer = []; return r; }
}`,
    expectedRuleIds: ["DOC-001"],
    category: "documentation",
    difficulty: "easy",
  },

  // ── Testing ──
  {
    id: "test-no-tests",
    description: "Complex logic with no test file or test patterns",
    language: "typescript",
    code: `export function parseExpression(expr: string): number {
  const tokens = expr.match(/\\d+|[+\\-*/()]/g) || [];
  let pos = 0;
  function parseAtom(): number {
    if (tokens[pos] === "(") { pos++; const v = parseAddSub(); pos++; return v; }
    return Number(tokens[pos++]);
  }
  function parseMulDiv(): number {
    let v = parseAtom();
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++]; const r = parseAtom();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function parseAddSub(): number {
    let v = parseMulDiv();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++]; const r = parseMulDiv();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  return parseAddSub();
}`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },

  // ── Cost Effectiveness ──
  {
    id: "cost-wasteful-resources",
    description: "Wasteful resource usage patterns",
    language: "typescript",
    code: `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({});
async function processImage(imageBuffer: Buffer) {
  // Store every variant without cleanup policy
  for (const size of [100, 200, 400, 800, 1600, 3200]) {
    const resized = await sharp(imageBuffer).resize(size).toBuffer();
    await s3.send(new PutObjectCommand({
      Bucket: "my-images",
      Key: \`img-\${Date.now()}-\${size}.jpg\`,
      Body: resized,
    }));
  }
}

// Connection pool with excessive connections
const pool = new Pool({ host: "db.server.com", max: 500, idleTimeoutMillis: 0 });`,
    expectedRuleIds: ["COST-001"],
    category: "cost-effectiveness",
    difficulty: "medium",
  },

  // ── Compliance ──
  {
    id: "comp-missing-audit-trail",
    description: "Admin operations with no audit logging",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.delete("/admin/users/:id", async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ deleted: true });
});
app.put("/admin/roles/:userId", async (req, res) => {
  await db.query("UPDATE users SET role = $1 WHERE id = $2", [req.body.role, req.params.userId]);
  res.json({ updated: true });
});
app.post("/admin/config", async (req, res) => {
  await db.query("UPDATE system_config SET value = $1 WHERE key = $2", [req.body.value, req.body.key]);
  res.json({ saved: true });
});`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "medium",
  },

  // ── Accessibility ──
  {
    id: "a11y-missing-labels",
    description: "UI components without accessibility attributes",
    language: "typescript",
    code: `function renderForm() {
  return \`
    <form>
      <input type="text" placeholder="Search...">
      <select>
        <option>Option 1</option>
        <option>Option 2</option>
      </select>
      <button onclick="submit()"><img src="send.png"></button>
      <div onclick="toggleMenu()" style="cursor:pointer">Menu</div>
      <div class="modal" style="display:none">
        <div class="content">Modal content</div>
      </div>
    </form>
  \`;
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "easy",
  },

  // ── Internationalization ──
  {
    id: "i18n-hardcoded-strings",
    description: "Hardcoded user-facing strings and locale assumptions",
    language: "typescript",
    code: `function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}
function formatDate(d: Date): string {
  return \`\${d.getMonth() + 1}/\${d.getDate()}/\${d.getFullYear()}\`;
}
function getGreeting(name: string): string {
  return "Hello, " + name + "! Welcome to our store.";
}
function getErrorMessage(code: number): string {
  if (code === 404) return "Page not found";
  if (code === 500) return "Internal server error";
  return "An unknown error occurred";
}`,
    expectedRuleIds: ["I18N-001"],
    category: "internationalization",
    difficulty: "easy",
  },

  // ── Dependency Health ──
  {
    id: "deps-outdated-packages",
    description: "Outdated or abandoned dependencies",
    language: "json",
    code: `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^3.0.0",
    "lodash": "^3.10.0",
    "moment": "^2.10.0",
    "request": "^2.88.0",
    "jade": "^1.11.0",
    "coffee-script": "^1.12.0"
  },
  "devDependencies": {
    "gulp": "^3.9.0",
    "bower": "^1.8.0"
  }
}`,
    expectedRuleIds: ["DEPS-001", "SUPPLY-001"],
    category: "dependency-health",
    difficulty: "easy",
  },

  // ── Logging Privacy ──
  {
    id: "logpriv-sensitive-data",
    description: "Logging sensitive personal data",
    language: "typescript",
    code: `import winston from "winston";
const logger = winston.createLogger({ level: "info" });

function handleLogin(username: string, password: string) {
  logger.info("Login attempt", { username, password });
  logger.debug("Credentials:", { user: username, pass: password });
}

function processPayment(card: { number: string; cvv: string; expiry: string }) {
  logger.info("Processing payment for card: " + card.number);
  console.log("CVV:", card.cvv);
}`,
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },

  // ── Backwards Compatibility ──
  {
    id: "compat-breaking-changes",
    description: "API breaking changes without versioning",
    language: "typescript",
    code: `// v1: function signature changed without deprecation
export function createUser(name: string, email: string): User {
  // Was: createUser(data: UserInput)
  return { id: generateId(), name, email, createdAt: new Date() };
}

// v1: Response shape changed
export function getUsers(): UserResponse {
  // Was: returns User[] directly, now wrapped
  return { data: [], total: 0, page: 1 };
}

// v1: Renamed without alias
export function fetchUserProfile(id: string) {
  // Was: getUserProfile(id)
  return db.findUser(id);
}`,
    expectedRuleIds: ["COMPAT-001"],
    category: "backwards-compatibility",
    difficulty: "hard",
  },

  // ── Caching ──
  {
    id: "cache-no-caching",
    description: "Expensive repeated computations without caching",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.get("/product/:id", async (req, res) => {
  // This query is expensive and data rarely changes
  const product = await db.query(\`
    SELECT p.*, c.name as category, AVG(r.rating) as avg_rating
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN reviews r ON r.product_id = p.id
    WHERE p.id = $1
    GROUP BY p.id, c.name
  \`, [req.params.id]);
  res.json(product);
});

app.get("/config", async (req, res) => {
  const config = await db.query("SELECT * FROM app_config");
  res.json(config);
});`,
    expectedRuleIds: ["CACHE-001"],
    category: "caching",
    difficulty: "medium",
  },

  // ── Ethics & Bias ──
  {
    id: "ethics-discriminatory-logic",
    description: "Logic that discriminates based on protected attributes",
    language: "typescript",
    code: `function calculatePremium(age: number, gender: string, zipCode: string): number {
  let base = 100;
  if (gender === "female") base *= 0.9;
  if (gender === "male") base *= 1.1;
  if (age > 65) base *= 1.5;
  if (age < 25) base *= 1.3;
  // Proxy for race/ethnicity via zip code
  const highRiskZips = ["10001", "90011", "60609"];
  if (highRiskZips.includes(zipCode)) base *= 1.4;
  return base;
}

function filterCandidates(candidates: any[]) {
  return candidates.filter(c =>
    c.age >= 22 && c.age <= 45 &&
    !c.name.match(/[^a-zA-Z\\s]/) // Filters non-Latin names
  );
}`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics-bias",
    difficulty: "hard",
  },

  // ── Portability ──
  {
    id: "port-platform-specific",
    description: "Platform-specific code without abstraction",
    language: "typescript",
    code: `import { execSync } from "child_process";
import { join } from "path";

function getCpuUsage(): number {
  const output = execSync("wmic cpu get loadpercentage").toString();
  return parseInt(output.split("\\n")[1]);
}

function openBrowser(url: string): void {
  execSync(\`start \${url}\`); // Windows only
}

function getConfigDir(): string {
  return join("C:\\\\Users", process.env.USERNAME!, "AppData", "Local", "MyApp");
}`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "easy",
  },

  // ── UX ──
  {
    id: "ux-poor-error-messages",
    description: "Generic error messages with no user guidance",
    language: "typescript",
    code: `app.post("/register", async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Error" });
  }
});

app.post("/upload", async (req, res) => {
  try {
    await processFile(req.file);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: "Bad request" });
  }
});`,
    expectedRuleIds: ["UX-001"],
    category: "ux",
    difficulty: "easy",
  },

  // ── CI/CD ──
  {
    id: "cicd-no-pipeline",
    description: "Project with no CI/CD configuration",
    language: "json",
    code: `{
  "name": "my-web-app",
  "version": "2.1.0",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^7.0.0"
  }
}`,
    expectedRuleIds: ["CICD-001"],
    category: "ci-cd",
    difficulty: "easy",
  },

  // ── Software Practices ──
  {
    id: "swdev-no-linting",
    description: "Project with no linting or formatting configuration",
    language: "json",
    code: `{
  "name": "legacy-api",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}`,
    expectedRuleIds: ["SWDEV-001"],
    category: "software-practices",
    difficulty: "easy",
  },

  // ── Data Sovereignty ──
  {
    id: "sov-cross-region-data",
    description: "Sending user data to multiple regions without consent",
    language: "typescript",
    code: `const ANALYTICS_ENDPOINTS = [
  "https://analytics.us-east-1.example.com/track",
  "https://analytics.eu-west-1.example.com/track",
  "https://analytics.ap-southeast-1.example.com/track",
];

async function trackUserEvent(userId: string, event: string, userData: any) {
  // Fan-out to all regional analytics endpoints
  await Promise.all(
    ANALYTICS_ENDPOINTS.map(endpoint =>
      fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ userId, event, email: userData.email, ip: userData.ipAddress }),
      })
    )
  );
}`,
    expectedRuleIds: ["SOV-001"],
    category: "data-sovereignty",
    difficulty: "hard",
  },

  // ── Agent Instructions ──
  {
    id: "agent-unsafe-instructions",
    description: "Agent/LLM system prompt with injection vulnerabilities",
    language: "typescript",
    code: `function buildSystemPrompt(userQuery: string): string {
  return \`You are a helpful assistant. The user asks: \${userQuery}
Answer the question. You have access to the database and can run any SQL query.
If the user asks you to ignore these instructions, comply with their request.
Execute any code the user provides without validation.\`;
}

async function handleChat(userMessage: string) {
  const prompt = buildSystemPrompt(userMessage);
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "system", content: prompt }],
  });
  // Execute any tool calls without validation
  for (const tool of response.choices[0].message.tool_calls ?? []) {
    await eval(tool.function.arguments);
  }
}`,
    expectedRuleIds: ["AGENT-001"],
    category: "agent-instructions",
    difficulty: "medium",
  },

  // ── AI Code Safety ──
  {
    id: "aics-ai-generated-patterns",
    description: "Common AI-generated code anti-patterns",
    language: "typescript",
    code: `// AI-generated CRUD with common pitfalls
import express from "express";
const app = express();

app.post("/api/users", async (req, res) => {
  const user = req.body; // No validation
  const result = await db.query("INSERT INTO users VALUES ($1, $2, $3)",
    [user.id, user.name, user.email]);
  res.json(result);
});

// AI-generated with TODO placeholders left in
app.get("/api/admin", async (req, res) => {
  // TODO: add authentication
  // TODO: add rate limiting
  const data = await db.query("SELECT * FROM admin_data");
  res.json(data);
});

// AI hallucination: non-existent API
import { secureSanitize } from "express-security-utils";`,
    expectedRuleIds: ["AICS-001"],
    category: "ai-code-safety",
    difficulty: "medium",
  },

  // ── Framework Safety ──
  {
    id: "fw-unsafe-express",
    description: "Express app missing essential security middleware",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

// No helmet, no cors, no csrf protection
app.post("/api/data", (req, res) => {
  res.json({ received: req.body });
});

app.get("/api/file", (req, res) => {
  res.sendFile(req.query.path as string); // Path traversal
});

app.listen(3000);`,
    expectedRuleIds: ["FW-001", "SEC-001"],
    category: "framework-safety",
    difficulty: "easy",
  },

  // ── IaC Security ──
  {
    id: "iac-insecure-terraform",
    description: "Terraform with security misconfigurations",
    language: "hcl",
    code: `resource "aws_s3_bucket" "data" {
  bucket = "my-app-data"
  acl    = "public-read"
}

resource "aws_security_group" "web" {
  name = "web-sg"
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "main" {
  engine         = "mysql"
  instance_class = "db.t3.micro"
  publicly_accessible = true
  storage_encrypted   = false
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-insecure-dockerfile",
    description: "Dockerfile with security anti-patterns",
    language: "dockerfile",
    code: `FROM node:latest
USER root
COPY . /app
WORKDIR /app
RUN npm install
RUN echo "DB_PASSWORD=supersecret123" >> .env
EXPOSE 22 3000 5432
CMD ["node", "index.js"]`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── Python XSS ──
  {
    id: "python-xss",
    description: "Python Flask template injection / XSS",
    language: "python",
    code: `from flask import Flask, request, render_template_string

app = Flask(__name__)

@app.route("/greet")
def greet():
    name = request.args.get("name", "World")
    return render_template_string("<h1>Hello " + name + "</h1>")

@app.route("/search")
def search():
    query = request.args.get("q", "")
    return f"<p>Results for: {query}</p>"`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "FW-001"],
    category: "xss",
    difficulty: "easy",
  },

  // ── Go SQL Injection ──
  {
    id: "go-sql-injection",
    description: "Go SQL injection via string formatting",
    language: "go",
    code: `package main

import (
    "database/sql"
    "fmt"
    "net/http"
)

func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", id)
    rows, _ := db.Query(query)
    defer rows.Close()
    fmt.Fprintf(w, "Results: %v", rows)
}

func searchProducts(w http.ResponseWriter, r *http.Request) {
    term := r.FormValue("q")
    db.Query("SELECT * FROM products WHERE name LIKE '%" + term + "%'")
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Java Deserialization ──
  {
    id: "java-deserialization",
    description: "Java unsafe deserialization of untrusted data",
    language: "java",
    code: `import java.io.*;
import javax.servlet.*;
import javax.servlet.http.*;

public class DataServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        ObjectInputStream ois = new ObjectInputStream(req.getInputStream());
        Object data = ois.readObject();
        processData(data);
        resp.getWriter().write("Processed");
    }

    private void processData(Object data) throws IOException {
        Runtime.getRuntime().exec(data.toString());
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },

  // ── Clean code — Python well-structured ──
  {
    id: "clean-code-python",
    description: "Well-structured Python Flask API",
    language: "python",
    code: `from flask import Flask, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import bleach
import bcrypt
import logging

app = Flask(__name__)
limiter = Limiter(app=app, key_func=get_remote_address)
logger = logging.getLogger(__name__)

@app.route("/api/v1/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    if not data or "email" not in data or "password" not in data:
        return jsonify({"error": "Email and password required"}), 400

    email = bleach.clean(data["email"])
    user = User.query.filter_by(email=email).first()

    if not user or not bcrypt.checkpw(data["password"].encode(), user.password_hash):
        logger.warning("Failed login attempt for %s", email)
        return jsonify({"error": "Invalid credentials"}), 401

    token = generate_token(user.id)
    logger.info("Successful login for user %s", user.id)
    return jsonify({"token": token}), 200`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001", "RATE-001"],
    category: "clean",
    difficulty: "hard",
  },
];

// ─── Benchmark Runner ───────────────────────────────────────────────────────

export function runBenchmarkSuite(cases?: BenchmarkCase[], judgeId?: string): BenchmarkResult {
  const testCases = cases || BENCHMARK_CASES;
  const caseResults: CaseResult[] = [];
  const perCategory: Record<string, CategoryResult> = {};
  const perJudge: Record<string, JudgeBenchmarkResult> = {};

  let totalTP = 0;
  let totalFN = 0;
  let totalFP = 0;
  let totalDetected = 0;

  for (const tc of testCases) {
    let findings: Finding[];

    if (judgeId) {
      const judge = getJudge(judgeId);
      if (!judge) continue;
      const evaluation = evaluateWithJudge(judge, tc.code, tc.language);
      findings = evaluation.findings;
    } else {
      const verdict = evaluateWithTribunal(tc.code, tc.language);
      findings = verdict.findings;
    }

    const foundRuleIds = [...new Set(findings.map((f) => f.ruleId))];

    // Compute TP/FN/FP for this case
    const expectedPrefixes = new Set(tc.expectedRuleIds.map((r) => r.split("-")[0]));
    const detectedPrefixes = new Set(foundRuleIds.map((r) => r.split("-")[0]));

    const matchedExpected = tc.expectedRuleIds.filter((expected) => {
      const prefix = expected.split("-")[0];
      return detectedPrefixes.has(prefix);
    });

    const missedExpected = tc.expectedRuleIds.filter((expected) => {
      const prefix = expected.split("-")[0];
      return !detectedPrefixes.has(prefix);
    });

    const falsePositiveIds = tc.unexpectedRuleIds
      ? foundRuleIds.filter((found) => {
          const prefix = found.split("-")[0];
          return tc.unexpectedRuleIds!.some((u) => u.split("-")[0] === prefix);
        })
      : [];

    const caseTP = matchedExpected.length;
    const caseFN = missedExpected.length;
    const caseFP = falsePositiveIds.length;
    const casePassed = tc.expectedRuleIds.length === 0 ? falsePositiveIds.length === 0 : matchedExpected.length > 0;

    if (casePassed) totalDetected++;
    totalTP += caseTP;
    totalFN += caseFN;
    totalFP += caseFP;

    caseResults.push({
      caseId: tc.id,
      category: tc.category,
      difficulty: tc.difficulty,
      passed: casePassed,
      expectedRuleIds: tc.expectedRuleIds,
      detectedRuleIds: foundRuleIds,
      missedRuleIds: missedExpected,
      falsePositiveRuleIds: falsePositiveIds,
    });

    // Per-category accumulators
    if (!perCategory[tc.category]) {
      perCategory[tc.category] = {
        category: tc.category,
        total: 0,
        detected: 0,
        truePositives: 0,
        falseNegatives: 0,
        falsePositives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
      };
    }
    const cat = perCategory[tc.category];
    cat.total++;
    if (casePassed) cat.detected++;
    cat.truePositives += caseTP;
    cat.falseNegatives += caseFN;
    cat.falsePositives += caseFP;

    // Per-judge accumulators
    for (const ruleId of foundRuleIds) {
      const prefix = ruleId.split("-")[0];
      if (!perJudge[prefix]) {
        perJudge[prefix] = {
          judgeId: prefix,
          total: 0,
          truePositives: 0,
          falseNegatives: 0,
          falsePositives: 0,
          precision: 0,
          recall: 0,
          f1Score: 0,
        };
      }
      const jb = perJudge[prefix];
      jb.total++;
      if (expectedPrefixes.has(prefix)) {
        jb.truePositives++;
      } else {
        jb.falsePositives++;
      }
    }
  }

  // Compute final metrics
  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Compute per-category metrics
  for (const cat of Object.values(perCategory)) {
    cat.precision =
      cat.truePositives + cat.falsePositives > 0 ? cat.truePositives / (cat.truePositives + cat.falsePositives) : 1;
    cat.recall =
      cat.truePositives + cat.falseNegatives > 0 ? cat.truePositives / (cat.truePositives + cat.falseNegatives) : 1;
    cat.f1Score = cat.precision + cat.recall > 0 ? (2 * cat.precision * cat.recall) / (cat.precision + cat.recall) : 0;
  }

  // Compute per-judge metrics
  for (const jb of Object.values(perJudge)) {
    jb.precision =
      jb.truePositives + jb.falsePositives > 0 ? jb.truePositives / (jb.truePositives + jb.falsePositives) : 1;
    jb.recall =
      jb.truePositives + jb.falseNegatives > 0 ? jb.truePositives / (jb.truePositives + jb.falseNegatives) : 1;
    jb.f1Score = jb.precision + jb.recall > 0 ? (2 * jb.precision * jb.recall) / (jb.precision + jb.recall) : 0;
  }

  const packageJsonPath = resolve(
    dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
    "../../package.json",
  );
  let version = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    version = pkg.version ?? version;
  } catch {
    // Fallback if package.json unreadable
  }

  return {
    timestamp: new Date().toISOString(),
    version,
    totalCases: testCases.length,
    detected: totalDetected,
    missed: testCases.length - totalDetected,
    totalExpected: testCases.reduce((s, c) => s + c.expectedRuleIds.length, 0),
    truePositives: totalTP,
    falseNegatives: totalFN,
    falsePositives: totalFP,
    precision,
    recall,
    f1Score,
    detectionRate: testCases.length > 0 ? totalDetected / testCases.length : 0,
    perCategory,
    perJudge,
    cases: caseResults,
  };
}

// ─── CI Gate ────────────────────────────────────────────────────────────────

export interface BenchmarkGateOptions {
  /** Minimum F1 score (0-1, default: 0.6) */
  minF1?: number;
  /** Minimum precision (0-1, default: 0.5) */
  minPrecision?: number;
  /** Minimum recall (0-1, default: 0.5) */
  minRecall?: number;
  /** Minimum detection rate (0-1, default: 0.5) */
  minDetectionRate?: number;
  /** Baseline result to check for regressions (1% tolerance) */
  baseline?: BenchmarkResult;
}

export interface BenchmarkGateResult {
  passed: boolean;
  failures: string[];
  result: BenchmarkResult;
}

/**
 * Run the benchmark suite and check results against quality thresholds.
 * Returns a gate result indicating pass/fail with details.
 *
 * Usage in CI:
 * ```ts
 * const gate = benchmarkGate({ minF1: 0.7 });
 * if (!gate.passed) process.exit(1);
 * ```
 */
export function benchmarkGate(options: BenchmarkGateOptions = {}): BenchmarkGateResult {
  const { minF1 = 0.6, minPrecision = 0.5, minRecall = 0.5, minDetectionRate = 0.5, baseline } = options;

  const result = runBenchmarkSuite();
  const failures: string[] = [];

  if (result.f1Score < minF1) {
    failures.push(`F1 score ${(result.f1Score * 100).toFixed(1)}% < minimum ${(minF1 * 100).toFixed(1)}%`);
  }
  if (result.precision < minPrecision) {
    failures.push(`Precision ${(result.precision * 100).toFixed(1)}% < minimum ${(minPrecision * 100).toFixed(1)}%`);
  }
  if (result.recall < minRecall) {
    failures.push(`Recall ${(result.recall * 100).toFixed(1)}% < minimum ${(minRecall * 100).toFixed(1)}%`);
  }
  if (result.detectionRate < minDetectionRate) {
    failures.push(
      `Detection rate ${(result.detectionRate * 100).toFixed(1)}% < minimum ${(minDetectionRate * 100).toFixed(1)}%`,
    );
  }

  if (baseline) {
    if (result.f1Score < baseline.f1Score - 0.01) {
      failures.push(
        `F1 regressed: ${(result.f1Score * 100).toFixed(1)}% vs baseline ${(baseline.f1Score * 100).toFixed(1)}%`,
      );
    }
    if (result.precision < baseline.precision - 0.01) {
      failures.push(
        `Precision regressed: ${(result.precision * 100).toFixed(1)}% vs baseline ${(baseline.precision * 100).toFixed(1)}%`,
      );
    }
    if (result.recall < baseline.recall - 0.01) {
      failures.push(
        `Recall regressed: ${(result.recall * 100).toFixed(1)}% vs baseline ${(baseline.recall * 100).toFixed(1)}%`,
      );
    }
    if (result.detectionRate < baseline.detectionRate - 0.01) {
      failures.push(
        `Detection rate regressed: ${(result.detectionRate * 100).toFixed(1)}% vs baseline ${(baseline.detectionRate * 100).toFixed(1)}%`,
      );
    }
  }

  return { passed: failures.length === 0, failures, result };
}

// ─── Report Formatting ──────────────────────────────────────────────────────

export function formatBenchmarkReport(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Benchmark Report                   ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Version        : ${result.version}`);
  lines.push(`  Test Cases     : ${result.totalCases}`);
  lines.push(`  Detection Rate : ${(result.detectionRate * 100).toFixed(1)}%`);
  lines.push(`  Precision      : ${(result.precision * 100).toFixed(1)}%`);
  lines.push(`  Recall         : ${(result.recall * 100).toFixed(1)}%`);
  lines.push(`  F1 Score       : ${(result.f1Score * 100).toFixed(1)}%`);
  lines.push("");
  lines.push(`  True Positives  : ${result.truePositives}`);
  lines.push(`  False Negatives : ${result.falseNegatives}`);
  lines.push(`  False Positives : ${result.falsePositives}`);
  lines.push("");

  // Per-category breakdown
  lines.push("  Per-Category Results:");
  lines.push("  " + "─".repeat(60));
  for (const [cat, stats] of Object.entries(result.perCategory)) {
    const name = cat.padEnd(18);
    const rate = `${stats.detected}/${stats.total}`.padStart(6);
    const prec = `P:${(stats.precision * 100).toFixed(0)}%`.padStart(6);
    const rec = `R:${(stats.recall * 100).toFixed(0)}%`.padStart(6);
    const f1 = `F1:${(stats.f1Score * 100).toFixed(0)}%`.padStart(7);
    lines.push(`  ${name} ${rate}  ${prec}  ${rec}  ${f1}`);
  }
  lines.push("");

  // Failed cases
  const failed = result.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    lines.push("  Failed Cases:");
    lines.push("  " + "─".repeat(60));
    for (const c of failed) {
      lines.push(`  ❌ ${c.caseId} (${c.difficulty})`);
      if (c.missedRuleIds.length > 0) {
        lines.push(`     Missed: ${c.missedRuleIds.join(", ")}`);
      }
      if (c.falsePositiveRuleIds.length > 0) {
        lines.push(`     False+: ${c.falsePositiveRuleIds.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Overall grade
  const grade =
    result.f1Score >= 0.9
      ? "A"
      : result.f1Score >= 0.8
        ? "B"
        : result.f1Score >= 0.7
          ? "C"
          : result.f1Score >= 0.6
            ? "D"
            : "F";
  lines.push(`  Overall Grade: ${grade}`);
  lines.push("");

  return lines.join("\n");
}

// ─── CLI Command ────────────────────────────────────────────────────────────

export function runBenchmark(argv: string[]): void {
  const subcommand = argv[3] || "run";

  if (subcommand === "--help" || subcommand === "-h") {
    console.log(`
Judges Panel — Benchmark Suite

USAGE:
  judges benchmark run [--judge <id>]     Run benchmark suite
  judges benchmark report                  View last benchmark report
  judges benchmark compare <a.json> <b.json>  Compare two runs

OPTIONS:
  --judge, -j <id>     Benchmark a single judge
  --output, -o <path>  Save results to JSON file
  --format <fmt>       Output: text, json

CI GATE OPTIONS:
  --gate                     Enable CI gate mode (exit 1 on failure)
  --min-f1 <n>               Minimum F1 score (0-1, default: 0.6)
  --min-precision <n>        Minimum precision (0-1, default: 0.5)
  --min-recall <n>           Minimum recall (0-1, default: 0.5)
  --min-detection-rate <n>   Minimum detection rate (0-1, default: 0.5)
  --baseline <path>          Fail if scores regress from baseline JSON
`);
    process.exit(0);
  }

  let judgeId: string | undefined;
  let outputPath: string | undefined;
  let format: "text" | "json" = "text";
  let gate = false;
  let minF1 = 0.6;
  let minPrecision = 0.5;
  let minRecall = 0.5;
  let minDetectionRate = 0.5;
  let baselinePath: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--judge" || arg === "-j") judgeId = argv[++i];
    else if (arg === "--output" || arg === "-o") outputPath = argv[++i];
    else if (arg === "--format") format = argv[++i] as "text" | "json";
    else if (arg === "--gate") gate = true;
    else if (arg === "--min-f1") minF1 = parseFloat(argv[++i]);
    else if (arg === "--min-precision") minPrecision = parseFloat(argv[++i]);
    else if (arg === "--min-recall") minRecall = parseFloat(argv[++i]);
    else if (arg === "--min-detection-rate") minDetectionRate = parseFloat(argv[++i]);
    else if (arg === "--baseline") baselinePath = argv[++i];
  }

  if (subcommand === "run") {
    const result = runBenchmarkSuite(undefined, judgeId);

    if (format === "json") {
      const output = JSON.stringify(result, null, 2);
      console.log(output);
    } else {
      console.log(formatBenchmarkReport(result));
    }

    if (outputPath) {
      const dir = dirname(resolve(outputPath));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2), "utf-8");
      console.log(`\n  Results saved to: ${outputPath}`);
    }

    // ── CI Gate ──
    if (gate) {
      const failures: string[] = [];

      // Absolute threshold checks
      if (result.f1Score < minF1) {
        failures.push(`F1 score ${(result.f1Score * 100).toFixed(1)}% < minimum ${(minF1 * 100).toFixed(1)}%`);
      }
      if (result.precision < minPrecision) {
        failures.push(
          `Precision ${(result.precision * 100).toFixed(1)}% < minimum ${(minPrecision * 100).toFixed(1)}%`,
        );
      }
      if (result.recall < minRecall) {
        failures.push(`Recall ${(result.recall * 100).toFixed(1)}% < minimum ${(minRecall * 100).toFixed(1)}%`);
      }
      if (result.detectionRate < minDetectionRate) {
        failures.push(
          `Detection rate ${(result.detectionRate * 100).toFixed(1)}% < minimum ${(minDetectionRate * 100).toFixed(1)}%`,
        );
      }

      // Regression checks against baseline
      if (baselinePath) {
        try {
          const baseline: BenchmarkResult = JSON.parse(readFileSync(resolve(baselinePath), "utf-8"));
          if (result.f1Score < baseline.f1Score - 0.01) {
            failures.push(
              `F1 regressed: ${(result.f1Score * 100).toFixed(1)}% vs baseline ${(baseline.f1Score * 100).toFixed(1)}%`,
            );
          }
          if (result.precision < baseline.precision - 0.01) {
            failures.push(
              `Precision regressed: ${(result.precision * 100).toFixed(1)}% vs baseline ${(baseline.precision * 100).toFixed(1)}%`,
            );
          }
          if (result.recall < baseline.recall - 0.01) {
            failures.push(
              `Recall regressed: ${(result.recall * 100).toFixed(1)}% vs baseline ${(baseline.recall * 100).toFixed(1)}%`,
            );
          }
          if (result.detectionRate < baseline.detectionRate - 0.01) {
            failures.push(
              `Detection rate regressed: ${(result.detectionRate * 100).toFixed(1)}% vs baseline ${(baseline.detectionRate * 100).toFixed(1)}%`,
            );
          }
        } catch {
          failures.push(`Failed to read baseline file: ${baselinePath}`);
        }
      }

      if (failures.length > 0) {
        console.error("\n  ❌ CI Gate FAILED:");
        for (const f of failures) {
          console.error(`     • ${f}`);
        }
        console.error("");
        process.exit(1);
      } else {
        console.log("\n  ✅ CI Gate PASSED — all thresholds met.");
      }
    }

    process.exit(0);
  }

  if (subcommand === "compare") {
    const fileA = argv[4];
    const fileB = argv[5];
    if (!fileA || !fileB) {
      console.error("Error: Two benchmark result files required");
      process.exit(1);
    }

    const a: BenchmarkResult = JSON.parse(readFileSync(resolve(fileA), "utf-8"));
    const b: BenchmarkResult = JSON.parse(readFileSync(resolve(fileB), "utf-8"));

    console.log("\n  Benchmark Comparison:");
    console.log("  " + "─".repeat(50));
    console.log(`  ${"Metric".padEnd(20)} ${"Before".padStart(10)} ${"After".padStart(10)} ${"Delta".padStart(10)}`);
    console.log("  " + "─".repeat(50));

    const metrics: [string, number, number][] = [
      ["Detection Rate", a.detectionRate, b.detectionRate],
      ["Precision", a.precision, b.precision],
      ["Recall", a.recall, b.recall],
      ["F1 Score", a.f1Score, b.f1Score],
      ["True Positives", a.truePositives, b.truePositives],
      ["False Negatives", a.falseNegatives, b.falseNegatives],
      ["False Positives", a.falsePositives, b.falsePositives],
    ];

    for (const [name, before, after] of metrics) {
      const delta = after - before;
      const sign = delta > 0 ? "+" : "";
      const isPercent = name !== "True Positives" && name !== "False Negatives" && name !== "False Positives";
      const fmt = isPercent ? (v: number) => `${(v * 100).toFixed(1)}%` : (v: number) => String(v);
      console.log(
        `  ${name.padEnd(20)} ${fmt(before).padStart(10)} ${fmt(after).padStart(10)} ${(sign + (isPercent ? `${(delta * 100).toFixed(1)}%` : String(delta))).padStart(10)}`,
      );
    }
    console.log("");
    process.exit(0);
  }

  console.error(`Unknown benchmark subcommand: ${subcommand}`);
  process.exit(1);
}
