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
import { getJudge, JUDGES } from "../judges/index.js";
import type { Finding } from "../types.js";
import type { LlmBenchmarkSnapshot } from "./llm-benchmark.js";
import { formatLlmSnapshotMarkdown, formatLayerComparisonMarkdown } from "./llm-benchmark.js";
import { EXPANDED_BENCHMARK_CASES } from "./benchmark-expanded.js";
import { EXPANDED_BENCHMARK_CASES_2 } from "./benchmark-expanded-2.js";
import { BENCHMARK_SECURITY_DEEP } from "./benchmark-security-deep.js";
import { BENCHMARK_QUALITY_OPS } from "./benchmark-quality-ops.js";
import { BENCHMARK_LANGUAGES } from "./benchmark-languages.js";
import { BENCHMARK_INFRASTRUCTURE } from "./benchmark-infrastructure.js";
import { BENCHMARK_COMPLIANCE_ETHICS } from "./benchmark-compliance-ethics.js";
import { BENCHMARK_AI_AGENTS } from "./benchmark-ai-agents.js";
import { BENCHMARK_ADVANCED_CASES } from "./benchmark-advanced.js";
import { BENCHMARK_AI_OUTPUT } from "./benchmark-ai-output.js";

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
  /** AI model/tool that generated this code (e.g. "gpt-4", "claude", "copilot") */
  aiSource?: string;
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
  /** Precision: TP / (TP + FP) — prefix-based matching */
  precision: number;
  /** Recall: TP / (TP + FN) — prefix-based matching */
  recall: number;
  /** F1 score: harmonic mean of precision and recall — prefix-based */
  f1Score: number;
  /** Detection rate: cases detected / total cases */
  detectionRate: number;
  /** Strict true positives: exact rule-ID match */
  strictTruePositives: number;
  /** Strict false negatives: exact rule-ID not matched */
  strictFalseNegatives: number;
  /** Strict precision: TP / (TP + FP) using exact rule-ID matching */
  strictPrecision: number;
  /** Strict recall: TP / (TP + FN) using exact rule-ID matching */
  strictRecall: number;
  /** Strict F1 score: exact rule-ID matching */
  strictF1Score: number;
  /** Per-category results */
  perCategory: Record<string, CategoryResult>;
  /** Per-judge results */
  perJudge: Record<string, JudgeBenchmarkResult>;
  /** Per-difficulty breakdown */
  perDifficulty: Record<string, DifficultyResult>;
  /** Per-AI-source breakdown (when cases have aiSource tags) */
  perAISource?: Record<string, CategoryResult>;
  /** Individual case results */
  cases: CaseResult[];
}

export interface DifficultyResult {
  difficulty: string;
  total: number;
  detected: number;
  detectionRate: number;
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
  findings?: Finding[];
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
    expectedRuleIds: ["DATA-001", "DATA-002", "LOGPRIV-001"],
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
    expectedRuleIds: ["DATA-001", "RATE-001", "CYBER-001", "API-001", "OBS-001", "AICS-001", "SEC-001"],
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
    expectedRuleIds: ["CFG-001", "SEC-001"],
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
    expectedRuleIds: [
      "CYBER-001",
      "PERF-001",
      "COST-001",
      "DB-001",
      "API-001",
      "TEST-001",
      "CONC-001",
      "AICS-001",
      "SEC-001",
    ],
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
    expectedRuleIds: ["DOC-001", "SEC-001"],
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
    expectedRuleIds: [],
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
    expectedRuleIds: ["COST-001", "OBS-001", "SEC-001"],
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
    expectedRuleIds: ["UX-001", "ERR-001"],
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

  // ── Hard Cases: Subtle/Obfuscated Vulnerabilities ────────────────────────

  // ── Indirect injection through helper function ──
  {
    id: "hard-indirect-sql-injection",
    description: "SQL injection hidden behind helper function indirection",
    language: "typescript",
    code: `function buildQuery(table: string, filter: string): string {
  return "SELECT * FROM " + table + " WHERE " + filter;
}
app.get("/search", (req, res) => {
  const query = buildQuery("users", "name = '" + req.query.name + "'");
  db.query(query);
  res.send("ok");
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "hard",
  },

  // ── SSRF via parameter composition ──
  {
    id: "hard-ssrf",
    description: "Server-side request forgery via user-controlled URL",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  const response = await fetch(targetUrl);
  const body = await response.text();
  res.send(body);
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ── Prototype pollution ──
  {
    id: "hard-prototype-pollution",
    description: "Prototype pollution via recursive merge of user input",
    language: "javascript",
    code: `function deepMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
app.post("/config", (req, res) => {
  const config = deepMerge({}, req.body);
  res.json(config);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ── JWT none algorithm attack ──
  {
    id: "hard-jwt-none-algorithm",
    description: "JWT verification allowing none algorithm",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("No token");
  const decoded = jwt.decode(token);
  if (decoded && (decoded as any).role === "admin") {
    req.user = decoded;
    next();
  } else {
    res.status(403).send("Forbidden");
  }
});`,
    expectedRuleIds: ["AUTH-001", "AUTH-002", "SEC-001"],
    category: "auth",
    difficulty: "hard",
  },

  // ── Mass assignment ──
  {
    id: "hard-mass-assignment",
    description: "Mass assignment allowing privilege escalation",
    language: "typescript",
    code: `app.put("/api/users/:id", async (req, res) => {
  // Directly spreading user input into DB update — allows setting isAdmin, role, etc.
  await db.query("UPDATE users SET ? WHERE id = ?", [req.body, req.params.id]);
  res.json({ updated: true });
});

app.post("/api/register", async (req, res) => {
  const user = { ...req.body, createdAt: new Date() };
  await db.query("INSERT INTO users SET ?", [user]);
  res.json({ id: user.id });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ── Open redirect ──
  {
    id: "hard-open-redirect",
    description: "Open redirect via unvalidated user-controlled redirect URL",
    language: "typescript",
    code: `app.get("/login/callback", (req, res) => {
  const returnTo = req.query.returnTo as string || "/dashboard";
  // Authenticate user...
  res.redirect(returnTo);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect(req.query.next as string);
  });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ── Timing attack on comparison ──
  {
    id: "hard-timing-attack",
    description: "Non-constant-time string comparison for secrets",
    language: "typescript",
    code: `app.post("/api/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"] as string;
  const expected = computeHmac(req.body, process.env.WEBHOOK_SECRET!);
  if (signature === expected) {
    processWebhook(req.body);
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Invalid signature" });
  }
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001", "CYBER-001"],
    category: "auth",
    difficulty: "hard",
  },

  // ── Python pickle deserialization ──
  {
    id: "hard-python-pickle",
    description: "Python pickle deserialization of untrusted data",
    language: "python",
    code: `import pickle
import base64
from flask import Flask, request

app = Flask(__name__)

@app.route("/load", methods=["POST"])
def load_data():
    encoded = request.form.get("data")
    data = pickle.loads(base64.b64decode(encoded))
    return str(data)`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "hard",
  },

  // ── Go race condition with shared state ──
  {
    id: "hard-go-race-condition",
    description: "Go HTTP handler with unsynchronized shared map",
    language: "go",
    code: `package main

import (
    "net/http"
    "encoding/json"
)

var cache = make(map[string]string)

func handler(w http.ResponseWriter, r *http.Request) {
    key := r.URL.Query().Get("key")
    if r.Method == "GET" {
        json.NewEncoder(w).Encode(cache[key])
    } else {
        val := r.URL.Query().Get("val")
        cache[key] = val
        w.Write([]byte("ok"))
    }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },

  // ── Java XXE ──
  {
    id: "hard-java-xxe",
    description: "Java XML External Entity injection",
    language: "java",
    code: `import javax.xml.parsers.*;
import org.w3c.dom.*;
import javax.servlet.http.*;
import java.io.*;

public class XmlServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document doc = builder.parse(req.getInputStream());
        String name = doc.getElementsByTagName("name").item(0).getTextContent();
        resp.getWriter().write("Hello " + name);
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ── C# SQL injection via dynamic LINQ ──
  {
    id: "hard-csharp-sql-injection",
    description: "C# SQL injection via string interpolation in Entity Framework",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    [HttpGet("search")]
    public async Task<IActionResult> Search(string query)
    {
        var users = await _db.Users
            .FromSqlRaw($"SELECT * FROM Users WHERE Name LIKE '%{query}%'")
            .ToListAsync();
        return Ok(users);
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "hard",
  },

  // ── Rust unsafe memory access ──
  {
    id: "hard-rust-unsafe",
    description: "Rust unsafe block with unchecked pointer arithmetic",
    language: "rust",
    code: `use std::io::Read;

fn parse_packet(data: &[u8]) -> u64 {
    unsafe {
        let ptr = data.as_ptr();
        let len_ptr = ptr.add(4) as *const u32;
        let payload_len = *len_ptr as usize;
        // No bounds check — could read past buffer
        let value_ptr = ptr.add(8 + payload_len) as *const u64;
        *value_ptr
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ── Clean code — hardened Node.js (hard negative) ──
  {
    id: "clean-code-hardened-node",
    description: "Hardened Node.js service with CSP, rate-limit, validation, structured logging",
    language: "typescript",
    code: `import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import pino from "pino";
import crypto from "crypto";

const logger = pino({ level: "info" });
const app = express();
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } } }));
app.use(express.json({ limit: "1kb" }));
app.use(rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true }));

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
});

app.post("/api/v1/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const user = await db.users.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await argon2.verify(user.passwordHash, parsed.data.password);
  if (!valid) { logger.warn({ email: parsed.data.email }, "Failed login"); return res.status(401).json({ error: "Invalid credentials" }); }
  const token = crypto.randomBytes(32).toString("hex");
  logger.info({ userId: user.id }, "Login success");
  res.json({ token });
});`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001", "SEC-001", "RATE-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── FP Benchmark Corpus — Multi-Language Clean Code ──────────────────────
  // These cases are well-written code that should NOT trigger findings.
  // They measure the false positive rate across languages.
  // ────────────────────────────────────────────────────────────────────────────

  // ── Clean Python: FastAPI with Pydantic validation ──
  {
    id: "clean-python-fastapi",
    description: "Well-structured FastAPI endpoint with Pydantic validation, auth, and error handling",
    language: "python",
    code: `from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging
import secrets

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
logger = logging.getLogger(__name__)

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(min_length=1, max_length=200)

@app.post("/api/v1/users", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_user(user: UserCreate, token: str = Depends(oauth2_scheme)):
    current_user = await verify_token(token)
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    hashed = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt())
    new_user = await db.users.create(email=user.email, password_hash=hashed, name=user.name)
    logger.info("User created: %s by admin %s", new_user.id, current_user.id)
    return {"id": new_user.id, "email": new_user.email}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001", "SEC-001", "RATE-001", "DATA-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Go: HTTP handler with proper error handling ──
  {
    id: "clean-go-handler",
    description: "Well-structured Go HTTP handler with parameterized queries, auth, and logging",
    language: "go",
    code: `package handlers

import (
    "encoding/json"
    "log/slog"
    "net/http"
    "github.com/go-chi/chi/v5"
    "github.com/jmoiron/sqlx"
)

type UserHandler struct {
    db     *sqlx.DB
    logger *slog.Logger
}

type CreateUserRequest struct {
    Email string \`json:"email" validate:"required,email"\`
    Name  string \`json:"name" validate:"required,min=1,max=200"\`
}

func (h *UserHandler) GetUser(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "id")
    if userID == "" {
        http.Error(w, "missing user id", http.StatusBadRequest)
        return
    }
    var user User
    err := h.db.QueryRowContext(r.Context(), "SELECT id, email, name FROM users WHERE id = $1", userID).Scan(&user.ID, &user.Email, &user.Name)
    if err != nil {
        h.logger.Error("failed to fetch user", "error", err, "user_id", userID)
        http.Error(w, "user not found", http.StatusNotFound)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Rust: Safe web handler ──
  {
    id: "clean-rust-handler",
    description: "Well-structured Rust Actix-web handler with validation and error types",
    language: "rust",
    code: `use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use validator::Validate;
use tracing::{info, error};

#[derive(Deserialize, Validate)]
pub struct CreateItemRequest {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    #[validate(range(min = 0.01, max = 999999.99))]
    pub price: f64,
}

#[derive(Serialize)]
pub struct ItemResponse {
    pub id: i64,
    pub name: String,
    pub price: f64,
}

pub async fn create_item(
    pool: web::Data<PgPool>,
    body: web::Json<CreateItemRequest>,
) -> Result<HttpResponse> {
    body.validate().map_err(|e| {
        actix_web::error::ErrorBadRequest(format!("Validation error: {}", e))
    })?;
    let row = sqlx::query_as!(
        ItemResponse,
        "INSERT INTO items (name, price) VALUES ($1, $2) RETURNING id, name, price",
        body.name,
        body.price,
    )
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        error!("DB insert failed: {}", e);
        actix_web::error::ErrorInternalServerError("Failed to create item")
    })?;
    info!(item_id = row.id, "Item created");
    Ok(HttpResponse::Created().json(row))
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Java: Spring Boot controller with validation ──
  {
    id: "clean-java-spring",
    description: "Well-structured Spring Boot REST controller with validation and auth",
    language: "java",
    code: `import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import javax.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    private static final Logger log = LoggerFactory.getLogger(ProductController.class);
    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductDTO> getProduct(@PathVariable Long id) {
        return productService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProductDTO> createProduct(@Valid @RequestBody CreateProductRequest request) {
        log.info("Creating product: {}", request.getName());
        ProductDTO created = productService.create(request);
        return ResponseEntity.status(201).body(created);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        log.info("Deleting product: {}", id);
        productService.delete(id);
        return ResponseEntity.noContent().build();
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001", "SEC-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean C#: ASP.NET Core controller ──
  {
    id: "clean-csharp-aspnet",
    description: "Well-structured ASP.NET Core controller with EF Core parameterized queries",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using FluentValidation;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<OrdersController> _logger;
    private readonly IValidator<CreateOrderRequest> _validator;

    public OrdersController(AppDbContext db, ILogger<OrdersController> logger, IValidator<CreateOrderRequest> validator)
    {
        _db = db;
        _logger = logger;
        _validator = validator;
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetOrder(int id)
    {
        var order = await _db.Orders
            .Where(o => o.Id == id && o.UserId == User.GetUserId())
            .FirstOrDefaultAsync();
        if (order == null) return NotFound();
        return Ok(order);
    }

    [HttpPost]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest request)
    {
        var validation = await _validator.ValidateAsync(request);
        if (!validation.IsValid) return BadRequest(validation.Errors);
        var order = new Order { UserId = User.GetUserId(), Total = request.Total, Items = request.Items };
        _db.Orders.Add(order);
        await _db.SaveChangesAsync();
        _logger.LogInformation("Order {OrderId} created by user {UserId}", order.Id, User.GetUserId());
        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, order);
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "AUTH-001", "SEC-001", "DATA-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean TypeScript: Pure utility library (no server) ──
  {
    id: "clean-ts-utility-lib",
    description: "Pure TypeScript utility library — no server code, should have zero security findings",
    language: "typescript",
    code: `/**
 * A type-safe result type for error handling without exceptions.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/** Retry an async operation with exponential backoff. */
export async function retry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 100): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw new Error("Unreachable");
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "AUTH-001", "RATE-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Terraform: Hardened AWS infrastructure ──
  {
    id: "clean-terraform-hardened",
    description: "Terraform with encryption, private access, and proper security groups",
    language: "hcl",
    code: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "myapp-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Environment = "production"
      Project     = "myapp"
      ManagedBy   = "terraform"
    }
  }
}

resource "aws_s3_bucket" "data" {
  bucket = "myapp-data-prod"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_db_instance" "main" {
  engine               = "postgres"
  instance_class       = "db.r6g.large"
  publicly_accessible  = false
  storage_encrypted    = true
  multi_az             = true
  deletion_protection  = true
  backup_retention_period = 7
}

resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["IAC-001", "SEC-001", "CYBER-001", "DATA-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Python: Data processing script (not a server) ──
  {
    id: "clean-python-data-script",
    description: "Python data processing script — no web endpoints, should not flag server concerns",
    language: "python",
    code: `"""Data pipeline for aggregating daily sales metrics."""
import csv
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Iterator

logger = logging.getLogger(__name__)

@dataclass
class SalesRecord:
    date: str
    product_id: str
    quantity: int
    unit_price: float

    @property
    def total(self) -> float:
        return self.quantity * self.unit_price

def read_records(path: Path) -> Iterator[SalesRecord]:
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                yield SalesRecord(
                    date=row["date"],
                    product_id=row["product_id"],
                    quantity=int(row["quantity"]),
                    unit_price=float(row["unit_price"]),
                )
            except (KeyError, ValueError) as e:
                logger.warning("Skipping invalid row: %s (%s)", row, e)

def aggregate_by_date(records: Iterator[SalesRecord]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for record in records:
        totals[record.date] = totals.get(record.date, 0.0) + record.total
    return totals

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    path = Path("data/sales.csv")
    if not path.exists():
        logger.error("File not found: %s", path)
        raise SystemExit(1)
    results = aggregate_by_date(read_records(path))
    for date, total in sorted(results.items()):
        logger.info("Date: %s, Total: $%.2f", date, total)`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "AUTH-001", "RATE-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean Go: CLI tool (not a server) ──
  {
    id: "clean-go-cli-tool",
    description: "Go CLI tool — should not flag server-side security concerns",
    language: "go",
    code: `package main

import (
    "encoding/json"
    "flag"
    "fmt"
    "log"
    "os"
    "path/filepath"
    "sort"
)

type Config struct {
    InputDir  string \`json:"input_dir"\`
    OutputDir string \`json:"output_dir"\`
    Verbose   bool   \`json:"verbose"\`
}

func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("read config: %w", err)
    }
    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("parse config: %w", err)
    }
    return &cfg, nil
}

func processFiles(cfg *Config) error {
    entries, err := os.ReadDir(cfg.InputDir)
    if err != nil {
        return fmt.Errorf("read dir: %w", err)
    }
    sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
    for _, entry := range entries {
        if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
            continue
        }
        src := filepath.Join(cfg.InputDir, entry.Name())
        dst := filepath.Join(cfg.OutputDir, entry.Name())
        if cfg.Verbose {
            log.Printf("Processing: %s -> %s", src, dst)
        }
        data, err := os.ReadFile(src)
        if err != nil {
            log.Printf("Warning: skip %s: %v", src, err)
            continue
        }
        if err := os.WriteFile(dst, data, 0644); err != nil {
            return fmt.Errorf("write %s: %w", dst, err)
        }
    }
    return nil
}

func main() {
    configPath := flag.String("config", "config.json", "path to config file")
    flag.Parse()
    cfg, err := loadConfig(*configPath)
    if err != nil {
        log.Fatal(err)
    }
    if err := processFiles(cfg); err != nil {
        log.Fatal(err)
    }
    fmt.Println("Done.")
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "AUTH-001", "RATE-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ── Clean TypeScript: React component (not a server) ──
  {
    id: "clean-ts-react-component",
    description: "React component with hooks — should not trigger server-side security findings",
    language: "typescript",
    code: `import React, { useState, useCallback, useMemo } from "react";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserListProps {
  users: User[];
  onSelect: (user: User) => void;
  searchLabel?: string;
}

export function UserList({ users, onSelect, searchLabel = "Search users" }: UserListProps): React.JSX.Element {
  const [filter, setFilter] = useState("");

  const handleFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFilter(event.target.value);
    },
    [],
  );

  const filteredUsers = useMemo(() => {
    const lower = filter.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
    );
  }, [users, filter]);

  return (
    <div role="search" aria-label={searchLabel}>
      <label htmlFor="user-search">{searchLabel}</label>
      <input
        id="user-search"
        type="text"
        value={filter}
        onChange={handleFilterChange}
        placeholder="Type to filter..."
        aria-describedby="user-count"
      />
      <p id="user-count" aria-live="polite">
        {filteredUsers.length} users found
      </p>
      <ul role="list">
        {filteredUsers.map((user) => (
          <li key={user.id}>
            <button onClick={() => onSelect(user)} aria-label={\`Select \${user.name}\`}>
              {user.name} ({user.email})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "AUTH-001", "A11Y-001"],
    category: "clean",
    difficulty: "hard",
  },
  // ── Expanded benchmark cases ──
  ...EXPANDED_BENCHMARK_CASES,
  ...EXPANDED_BENCHMARK_CASES_2,
  ...BENCHMARK_SECURITY_DEEP,
  ...BENCHMARK_QUALITY_OPS,
  ...BENCHMARK_LANGUAGES,
  ...BENCHMARK_INFRASTRUCTURE,
  ...BENCHMARK_COMPLIANCE_ETHICS,
  ...BENCHMARK_AI_AGENTS,
  ...BENCHMARK_ADVANCED_CASES,
  ...BENCHMARK_AI_OUTPUT,
];

// ─── Benchmark Runner ───────────────────────────────────────────────────────

export function runBenchmarkSuite(cases?: BenchmarkCase[], judgeId?: string): BenchmarkResult {
  const testCases = cases || BENCHMARK_CASES;
  const caseResults: CaseResult[] = [];
  const perCategory: Record<string, CategoryResult> = {};
  const perJudge: Record<string, JudgeBenchmarkResult> = {};
  const perDifficulty: Record<string, DifficultyResult> = {};
  const perAISource: Record<string, CategoryResult> = {};

  let totalTP = 0;
  let totalFN = 0;
  let totalFP = 0;
  let totalDetected = 0;
  let totalStrictTP = 0;
  let totalStrictFN = 0;

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

    // Collect ruleIds including cross-references from dedup annotations
    const allRuleIds = new Set(findings.map((f) => f.ruleId));
    for (const f of findings) {
      const m = f.description.match(/_Also identified by:\s*(.+?)_/);
      if (m) {
        for (const id of m[1].split(/,\s*/)) {
          if (id.match(/^[A-Z]+-\d+$/)) allRuleIds.add(id);
        }
      }
    }
    const foundRuleIds = [...allRuleIds];

    // Prefix-based matching (lenient — CYBER-001 matches any CYBER-*)
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

    // Strict matching (exact rule-ID: CYBER-001 only matches CYBER-001)
    const foundRuleIdSet = new Set(foundRuleIds);
    const strictMatchedExpected = tc.expectedRuleIds.filter((expected) => foundRuleIdSet.has(expected));
    const strictMissedExpected = tc.expectedRuleIds.filter((expected) => !foundRuleIdSet.has(expected));

    const caseTP = matchedExpected.length;
    const caseFN = missedExpected.length;
    const caseFP = falsePositiveIds.length;
    const casePassed = tc.expectedRuleIds.length === 0 ? falsePositiveIds.length === 0 : matchedExpected.length > 0;

    if (casePassed) totalDetected++;
    totalTP += caseTP;
    totalFN += caseFN;
    totalFP += caseFP;
    totalStrictTP += strictMatchedExpected.length;
    totalStrictFN += strictMissedExpected.length;

    // Per-difficulty tracking
    if (!perDifficulty[tc.difficulty]) {
      perDifficulty[tc.difficulty] = { difficulty: tc.difficulty, total: 0, detected: 0, detectionRate: 0 };
    }
    perDifficulty[tc.difficulty].total++;
    if (casePassed) perDifficulty[tc.difficulty].detected++;

    // Per-AI-source tracking (when cases are tagged)
    if (tc.aiSource) {
      if (!perAISource[tc.aiSource]) {
        perAISource[tc.aiSource] = {
          category: tc.aiSource,
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
      const src = perAISource[tc.aiSource];
      src.total++;
      if (casePassed) src.detected++;
      src.truePositives += caseTP;
      src.falseNegatives += caseFN;
      src.falsePositives += caseFP;
    }

    caseResults.push({
      caseId: tc.id,
      category: tc.category,
      difficulty: tc.difficulty,
      passed: casePassed,
      expectedRuleIds: tc.expectedRuleIds,
      detectedRuleIds: foundRuleIds,
      missedRuleIds: missedExpected,
      falsePositiveRuleIds: falsePositiveIds,
      findings,
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
    // Only count detections on clean cases (expectedRuleIds empty) as FP.
    // Dirty-case "extra" detections are legitimate secondary findings and
    // should not inflate per-judge false-positive rates.
    const isCleanCase = tc.expectedRuleIds.length === 0;
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
      } else if (isCleanCase) {
        jb.falsePositives++;
      }
    }
  }

  // Compute final metrics
  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Strict metrics (exact rule-ID matching)
  const strictPrecision = totalStrictTP + totalFP > 0 ? totalStrictTP / (totalStrictTP + totalFP) : 1;
  const strictRecall = totalStrictTP + totalStrictFN > 0 ? totalStrictTP / (totalStrictTP + totalStrictFN) : 1;
  const strictF1Score =
    strictPrecision + strictRecall > 0 ? (2 * strictPrecision * strictRecall) / (strictPrecision + strictRecall) : 0;

  // Compute per-difficulty rates
  for (const d of Object.values(perDifficulty)) {
    d.detectionRate = d.total > 0 ? d.detected / d.total : 0;
  }

  // Compute per-category metrics
  for (const cat of Object.values(perCategory)) {
    cat.precision =
      cat.truePositives + cat.falsePositives > 0 ? cat.truePositives / (cat.truePositives + cat.falsePositives) : 1;
    cat.recall =
      cat.truePositives + cat.falseNegatives > 0 ? cat.truePositives / (cat.truePositives + cat.falseNegatives) : 1;
    cat.f1Score = cat.precision + cat.recall > 0 ? (2 * cat.precision * cat.recall) / (cat.precision + cat.recall) : 0;
  }

  // Compute per-AI-source metrics
  for (const src of Object.values(perAISource)) {
    src.precision =
      src.truePositives + src.falsePositives > 0 ? src.truePositives / (src.truePositives + src.falsePositives) : 1;
    src.recall =
      src.truePositives + src.falseNegatives > 0 ? src.truePositives / (src.truePositives + src.falseNegatives) : 1;
    src.f1Score = src.precision + src.recall > 0 ? (2 * src.precision * src.recall) / (src.precision + src.recall) : 0;
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
    strictTruePositives: totalStrictTP,
    strictFalseNegatives: totalStrictFN,
    strictPrecision,
    strictRecall,
    strictF1Score,
    perCategory,
    perJudge,
    perDifficulty,
    ...(Object.keys(perAISource).length > 0 ? { perAISource } : {}),
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
  lines.push("");
  lines.push("  Prefix-Based Matching (lenient):");
  lines.push(`    Precision    : ${(result.precision * 100).toFixed(1)}%`);
  lines.push(`    Recall       : ${(result.recall * 100).toFixed(1)}%`);
  lines.push(`    F1 Score     : ${(result.f1Score * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("  Exact Rule-ID Matching (strict):");
  lines.push(`    Precision    : ${(result.strictPrecision * 100).toFixed(1)}%`);
  lines.push(`    Recall       : ${(result.strictRecall * 100).toFixed(1)}%`);
  lines.push(`    F1 Score     : ${(result.strictF1Score * 100).toFixed(1)}%`);
  lines.push("");
  lines.push(`  True Positives  : ${result.truePositives} (strict: ${result.strictTruePositives})`);
  lines.push(`  False Negatives : ${result.falseNegatives} (strict: ${result.strictFalseNegatives})`);
  lines.push(`  False Positives : ${result.falsePositives}`);
  lines.push("");

  // Per-difficulty breakdown
  if (result.perDifficulty && Object.keys(result.perDifficulty).length > 0) {
    lines.push("  Per-Difficulty Detection Rates:");
    lines.push("  " + "─".repeat(40));
    for (const diff of ["easy", "medium", "hard"]) {
      const d = result.perDifficulty[diff];
      if (d) {
        const rate = `${d.detected}/${d.total}`.padStart(6);
        const pct = `${(d.detectionRate * 100).toFixed(1)}%`.padStart(6);
        lines.push(`  ${diff.padEnd(10)} ${rate}  ${pct}`);
      }
    }
    lines.push("");
  }

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

// ─── Markdown Report for GitHub Publishing ─────────────────────────────────

export function formatBenchmarkMarkdown(result: BenchmarkResult, llmSnapshot?: LlmBenchmarkSnapshot): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
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
  const gradeEmoji = grade === "A" ? "🟢" : grade === "B" ? "🟡" : grade === "C" ? "🟠" : "🔴";

  lines.push("# Judges Panel — Benchmark Report");
  lines.push("");
  lines.push(`> Auto-generated on ${result.timestamp} · v${result.version}`);
  lines.push("");

  // ── Methodology ──
  lines.push("## How to Read This Report");
  lines.push("");
  lines.push("The Judges Panel uses a **dual-layer architecture** for code analysis:");
  lines.push("");
  lines.push("### Layer 1 — Deterministic Analysis (Pattern Matching)");
  lines.push("The first layer uses deterministic evaluators — regex patterns, AST analysis, and heuristic");
  lines.push("rules — to identify code issues instantly, offline, and with zero LLM costs. Each of the 45");
  lines.push("judges has a built-in `analyze()` function that scans code for known patterns. This layer is:");
  lines.push("- **Fast** — millisecond response times");
  lines.push("- **Reproducible** — same input always produces the same output");
  lines.push("- **Free** — no API calls or external dependencies");
  lines.push("");
  lines.push("Layer 1 is benchmarked on every commit via automated CI.");
  lines.push("");
  lines.push("### Layer 2 — LLM Deep Review (AI-Powered Prompts)");
  lines.push("The second layer uses expert persona prompts served via MCP (Model Context Protocol) to");
  lines.push("LLM-based clients like GitHub Copilot and Claude Desktop. When invoked, the calling LLM");
  lines.push("applies the judge's evaluation criteria to perform a deeper, context-aware analysis that can");
  lines.push("catch issues pattern matching cannot — such as logical flaws, architectural concerns, and");
  lines.push("nuanced security vulnerabilities.");
  lines.push("");
  lines.push("Layer 2 is benchmarked periodically by sending test cases to an LLM API and scoring the");
  lines.push("results against expected findings. Because LLM outputs are probabilistic, L2 scores may");
  lines.push("vary across runs and models.");
  lines.push("");
  lines.push("### Metrics Explained");
  lines.push("| Metric | Description |");
  lines.push("|--------|-------------|");
  lines.push(
    "| **Precision** | Of all findings reported, what percentage are real issues? Higher = fewer false alarms. |",
  );
  lines.push("| **Recall** | Of all known issues, what percentage are detected? Higher = fewer missed issues. |");
  lines.push(
    "| **F1 Score** | Harmonic mean of precision and recall — the single best indicator of overall accuracy. |",
  );
  lines.push("| **Detection Rate** | Percentage of test cases where at least one expected issue was found. |");
  lines.push("| **FP Rate** | False Positive Rate — percentage of findings that are not real issues. |");
  lines.push(
    "| **Lenient matching** | A finding matches if its rule prefix matches (e.g., CYBER-005 matches expected CYBER-001). |",
  );
  lines.push("| **Strict matching** | A finding matches only with the exact rule ID. |");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Layer 1 Results ──
  lines.push("## Layer 1 — Deterministic Analysis");
  lines.push("");

  // Summary badges
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Overall Grade | ${gradeEmoji} **${grade}** |`);
  lines.push(`| Test Cases | ${result.totalCases} |`);
  lines.push(`| Detection Rate | ${pct(result.detectionRate)} (${result.detected}/${result.totalCases}) |`);
  lines.push(`| Precision (lenient) | ${pct(result.precision)} |`);
  lines.push(`| Recall (lenient) | ${pct(result.recall)} |`);
  lines.push(`| F1 Score (lenient) | ${pct(result.f1Score)} |`);
  lines.push(`| Precision (strict) | ${pct(result.strictPrecision)} |`);
  lines.push(`| Recall (strict) | ${pct(result.strictRecall)} |`);
  lines.push(`| F1 Score (strict) | ${pct(result.strictF1Score)} |`);
  lines.push(`| True Positives | ${result.truePositives} (strict: ${result.strictTruePositives}) |`);
  lines.push(`| False Negatives | ${result.falseNegatives} (strict: ${result.strictFalseNegatives}) |`);
  lines.push(`| False Positives | ${result.falsePositives} |`);
  lines.push("");

  // FP Rate section
  const totalTP = result.truePositives;
  const totalFP = result.falsePositives;
  const overallFpRate = totalTP + totalFP > 0 ? totalFP / (totalTP + totalFP) : 0;
  lines.push("## False Positive Rate");
  lines.push("");
  lines.push(`**Overall FP Rate: ${pct(overallFpRate)}**`);
  lines.push("");
  lines.push("The false positive rate measures how often the tool flags code that is actually correct.");
  lines.push("Lower is better. Industry-standard SAST tools typically range from 20-60% FP rates.");
  lines.push("");

  // Per-difficulty breakdown
  if (result.perDifficulty && Object.keys(result.perDifficulty).length > 0) {
    lines.push("## Detection by Difficulty");
    lines.push("");
    lines.push("| Difficulty | Detected | Total | Rate |");
    lines.push("|------------|----------|-------|------|");
    for (const diff of ["easy", "medium", "hard"]) {
      const d = result.perDifficulty[diff];
      if (d) {
        lines.push(`| ${diff} | ${d.detected} | ${d.total} | ${pct(d.detectionRate)} |`);
      }
    }
    lines.push("");
  }

  // Per-category breakdown
  lines.push("## Results by Category");
  lines.push("");
  lines.push("| Category | Detected | Total | Precision | Recall | F1 | FP Rate |");
  lines.push("|----------|----------|-------|-----------|--------|-----|---------|");
  for (const [cat, stats] of Object.entries(result.perCategory).sort(([a], [b]) => a.localeCompare(b))) {
    const catFpRate =
      stats.truePositives + stats.falsePositives > 0
        ? stats.falsePositives / (stats.truePositives + stats.falsePositives)
        : 0;
    lines.push(
      `| ${cat} | ${stats.detected} | ${stats.total} | ${pct(stats.precision)} | ${pct(stats.recall)} | ${pct(stats.f1Score)} | ${pct(catFpRate)} |`,
    );
  }
  lines.push("");

  // Per-judge breakdown
  if (result.perJudge && Object.keys(result.perJudge).length > 0) {
    lines.push("## Results by Judge");
    lines.push("");
    lines.push("| Judge | Findings | TP | FP | Precision | FP Rate |");
    lines.push("|-------|----------|-----|-----|-----------|---------|");
    for (const [judgeId, stats] of Object.entries(result.perJudge).sort(([a], [b]) => a.localeCompare(b))) {
      const judgeFpRate =
        stats.truePositives + stats.falsePositives > 0
          ? stats.falsePositives / (stats.truePositives + stats.falsePositives)
          : 0;
      lines.push(
        `| ${judgeId} | ${stats.total} | ${stats.truePositives} | ${stats.falsePositives} | ${pct(stats.precision)} | ${pct(judgeFpRate)} |`,
      );
    }
    lines.push("");
  }

  // Clean code / FP test results
  const cleanCases = result.cases.filter((c) => c.category === "clean");
  if (cleanCases.length > 0) {
    lines.push("## Clean Code (False Positive Tests)");
    lines.push("");
    lines.push("These test cases are well-written code that should produce **zero** findings.");
    lines.push("Any finding on these cases is a false positive.");
    lines.push("");
    lines.push("| Case | Passed | False Positives |");
    lines.push("|------|--------|-----------------|");
    for (const c of cleanCases) {
      const status = c.passed ? "✅" : "❌";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "none";
      lines.push(`| ${c.caseId} | ${status} | ${fps} |`);
    }
    const fpCleanTotal = cleanCases.filter((c) => !c.passed).length;
    lines.push("");
    lines.push(
      `**Clean code FP rate: ${fpCleanTotal}/${cleanCases.length} cases had false positives (${pct(fpCleanTotal / cleanCases.length)})**`,
    );
    lines.push("");
  }

  // Failed cases detail
  const failed = result.cases.filter((c) => !c.passed);
  if (failed.length > 0) {
    lines.push("## Failed Cases");
    lines.push("");
    lines.push("| Case | Difficulty | Category | Missed Rules | False Positives |");
    lines.push("|------|------------|----------|--------------|-----------------|");
    for (const c of failed) {
      const missed = c.missedRuleIds.length > 0 ? c.missedRuleIds.join(", ") : "—";
      const fps = c.falsePositiveRuleIds.length > 0 ? c.falsePositiveRuleIds.join(", ") : "—";
      lines.push(`| ${c.caseId} | ${c.difficulty} | ${c.category} | ${missed} | ${fps} |`);
    }
    lines.push("");
  }

  // ── Layer 2 Results (if LLM snapshot available) ──
  if (llmSnapshot) {
    lines.push("---");
    lines.push("");
    lines.push(formatLlmSnapshotMarkdown(llmSnapshot));

    // Layer comparison table
    lines.push("---");
    lines.push("");
    lines.push(formatLayerComparisonMarkdown(result, llmSnapshot));
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by [Judges Panel](https://github.com/KevinRabun/judges) benchmark suite.*");
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
  judges benchmark report                  Generate markdown benchmark report
  judges benchmark compare <a.json> <b.json>  Compare two runs
  judges benchmark l2-coverage             Analyze L2 prompt coverage of L1 gaps
  judges benchmark ingest <file.json>      Ingest findings as benchmark cases

OPTIONS:
  --judge, -j <id>     Benchmark a single judge
  --output, -o <path>  Save results to file
  --save               Save results to benchmark-results.json
  --format <fmt>       Output: text, json, markdown
  --fresh              Re-run benchmark even if saved results exist

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
  let save = false;
  let minF1 = 0.6;
  let minPrecision = 0.5;
  let minRecall = 0.5;
  let minDetectionRate = 0.5;
  let baselinePath: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--judge" || arg === "-j") judgeId = argv[++i];
    else if (arg === "--output" || arg === "-o") outputPath = argv[++i];
    else if (arg === "--save") save = true;
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

    // Auto-save to benchmark-results.json
    if (save && !outputPath) {
      const savePath = resolve("benchmark-results.json");
      writeFileSync(savePath, JSON.stringify(result, null, 2), "utf-8");
      console.log(`\n  Results saved to: benchmark-results.json`);
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

  if (subcommand === "report") {
    // Generate or display a benchmark report in markdown format
    const reportOutputPath = argv.find((_, i) => argv[i - 1] === "--output" || argv[i - 1] === "-o") || undefined;
    const reportFormat = argv.find((_, i) => argv[i - 1] === "--format") || "markdown";

    // Check if there's a saved result to load, otherwise run fresh
    let result: BenchmarkResult;
    const savedPath = resolve("benchmark-results.json");
    if (existsSync(savedPath) && !argv.includes("--fresh")) {
      result = JSON.parse(readFileSync(savedPath, "utf-8"));
      console.log(`  Loaded saved benchmark results from: benchmark-results.json`);
    } else {
      result = runBenchmarkSuite(undefined, judgeId);
    }

    // Load LLM snapshot if available
    let llmSnapshot: LlmBenchmarkSnapshot | undefined;
    const llmSnapshotPath = resolve("benchmarks/llm-snapshot-latest.json");
    if (existsSync(llmSnapshotPath)) {
      try {
        llmSnapshot = JSON.parse(readFileSync(llmSnapshotPath, "utf-8"));
        console.log(
          `  Loaded LLM benchmark snapshot: ${llmSnapshot!.model} (${new Date(llmSnapshot!.timestamp).toLocaleDateString()})`,
        );
      } catch {
        /* ignore malformed snapshot */
      }
    }

    if (reportFormat === "json") {
      const output = JSON.stringify(result, null, 2);
      if (reportOutputPath) {
        const rDir = dirname(resolve(reportOutputPath));
        if (!existsSync(rDir)) mkdirSync(rDir, { recursive: true });
        writeFileSync(resolve(reportOutputPath), output, "utf-8");
        console.log(`  Report saved to: ${reportOutputPath}`);
      } else {
        console.log(output);
      }
    } else {
      const md = formatBenchmarkMarkdown(result, llmSnapshot);
      if (reportOutputPath) {
        const rDir = dirname(resolve(reportOutputPath));
        if (!existsSync(rDir)) mkdirSync(rDir, { recursive: true });
        writeFileSync(resolve(reportOutputPath), md, "utf-8");
        console.log(`  Report saved to: ${reportOutputPath}`);
      } else {
        console.log(md);
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

  if (subcommand === "l2-coverage") {
    const result = runBenchmarkSuite(undefined, judgeId);
    const analysis = analyzeL2Coverage(result);
    const report = formatL2CoverageReport(analysis);
    if (outputPath) {
      const dir = dirname(resolve(outputPath));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(outputPath), format === "json" ? JSON.stringify(analysis, null, 2) : report, "utf-8");
      console.log(`\n  L2 coverage report saved to: ${outputPath}`);
    } else if (format === "json") {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log(report);
    }
    process.exit(0);
  }

  if (subcommand === "ingest") {
    const findingsFile = argv[4];
    if (!findingsFile) {
      console.error("Error: Specify a findings JSON file to ingest.");
      console.error("Usage: judges benchmark ingest <findings.json> [--output cases.json]");
      process.exit(1);
    }
    try {
      const raw = JSON.parse(readFileSync(resolve(findingsFile), "utf-8"));
      const findings: Array<{ code: string; language: string; findings: Array<{ ruleId: string }> }> = Array.isArray(
        raw,
      )
        ? raw
        : [raw];
      const candidates = ingestFindingsAsBenchmarkCases(findings);
      const deduped = deduplicateIngestCases(BENCHMARK_CASES, candidates);
      const outPath = outputPath || "ingested-benchmark-cases.json";
      writeFileSync(resolve(outPath), JSON.stringify(deduped, null, 2), "utf-8");
      console.log(`\n  ✅ Ingested ${deduped.length} new benchmark cases (from ${candidates.length} candidates)`);
      console.log(`  Saved to: ${outPath}`);
      console.log(`  Review and add to a benchmark case array to include in the suite.`);
    } catch (err: unknown) {
      console.error(`Error ingesting findings: ${(err as Error).message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error(`Unknown benchmark subcommand: ${subcommand}`);
  process.exit(1);
}

// ─── L2 Coverage Analysis ───────────────────────────────────────────────────
// Analyzes which L1 false negatives would be addressable by L2 (LLM-based)
// deep review prompts, providing visibility into the value L2 adds.
// ─────────────────────────────────────────────────────────────────────────────

export interface L2CoverageAnalysis {
  /** Total false negatives from L1-only benchmark */
  totalFalseNegatives: number;
  /** False negatives whose rule prefix maps to a judge with an L2 systemPrompt */
  l2Coverable: number;
  /** L2 coverage ratio: l2Coverable / totalFalseNegatives */
  l2CoverageRate: number;
  /** Per-judge breakdown of L1 misses that L2 could address */
  perJudge: Record<string, L2JudgeCoverage>;
  /** Per-category breakdown */
  perCategory: Record<string, L2CategoryCoverage>;
  /** Per-difficulty breakdown */
  perDifficulty: Record<string, { difficulty: string; falseNegatives: number; l2Coverable: number }>;
  /** Missed case IDs grouped by responsible judge prefix */
  missedCasesByJudge: Record<string, string[]>;
}

export interface L2JudgeCoverage {
  judgeId: string;
  judgeName: string;
  /** Number of L1 false negatives mapping to this judge */
  falseNegatives: number;
  /** Whether this judge has an L2 systemPrompt */
  hasL2Prompt: boolean;
  /** Length of the L2 systemPrompt (0 if none) */
  promptLength: number;
}

export interface L2CategoryCoverage {
  category: string;
  falseNegatives: number;
  l2Coverable: number;
  coverageRate: number;
}

/**
 * Analyze which L1 false negatives are coverable by L2 prompts.
 *
 * Maps each missed rule ID back to its judge (via rule prefix) and checks
 * whether that judge has an L2 systemPrompt. This reveals the theoretical
 * value L2 adds on top of L1 pattern matching.
 */
export function analyzeL2Coverage(result: BenchmarkResult): L2CoverageAnalysis {
  const judgesByPrefix: Record<string, { id: string; name: string; systemPrompt: string }> = {};
  for (const j of JUDGES) {
    judgesByPrefix[j.rulePrefix] = { id: j.id, name: j.name, systemPrompt: j.systemPrompt };
  }

  const perJudge: Record<string, L2JudgeCoverage> = {};
  const perCategory: Record<string, L2CategoryCoverage> = {};
  const perDifficulty: Record<string, { difficulty: string; falseNegatives: number; l2Coverable: number }> = {};
  const missedCasesByJudge: Record<string, string[]> = {};

  let totalFN = 0;
  let l2Coverable = 0;

  for (const c of result.cases) {
    if (c.missedRuleIds.length === 0) continue;

    for (const missedRule of c.missedRuleIds) {
      totalFN++;
      const prefix = missedRule.split("-")[0];
      const judge = judgesByPrefix[prefix];

      // Initialize per-judge
      if (!perJudge[prefix]) {
        perJudge[prefix] = {
          judgeId: judge?.id ?? prefix,
          judgeName: judge?.name ?? prefix,
          falseNegatives: 0,
          hasL2Prompt: !!(judge?.systemPrompt && judge.systemPrompt.length > 0),
          promptLength: judge?.systemPrompt?.length ?? 0,
        };
      }
      perJudge[prefix].falseNegatives++;

      // Track by judge prefix
      if (!missedCasesByJudge[prefix]) missedCasesByJudge[prefix] = [];
      if (!missedCasesByJudge[prefix].includes(c.caseId)) {
        missedCasesByJudge[prefix].push(c.caseId);
      }

      // L2 coverable?
      const coverable = !!(judge?.systemPrompt && judge.systemPrompt.length > 0);
      if (coverable) l2Coverable++;

      // Per-category
      if (!perCategory[c.category]) {
        perCategory[c.category] = { category: c.category, falseNegatives: 0, l2Coverable: 0, coverageRate: 0 };
      }
      perCategory[c.category].falseNegatives++;
      if (coverable) perCategory[c.category].l2Coverable++;

      // Per-difficulty
      if (!perDifficulty[c.difficulty]) {
        perDifficulty[c.difficulty] = { difficulty: c.difficulty, falseNegatives: 0, l2Coverable: 0 };
      }
      perDifficulty[c.difficulty].falseNegatives++;
      if (coverable) perDifficulty[c.difficulty].l2Coverable++;
    }
  }

  // Compute coverage rates
  for (const cat of Object.values(perCategory)) {
    cat.coverageRate = cat.falseNegatives > 0 ? cat.l2Coverable / cat.falseNegatives : 0;
  }

  return {
    totalFalseNegatives: totalFN,
    l2Coverable,
    l2CoverageRate: totalFN > 0 ? l2Coverable / totalFN : 0,
    perJudge,
    perCategory,
    perDifficulty,
    missedCasesByJudge,
  };
}

/**
 * Format an L2 coverage analysis as a markdown report.
 */
export function formatL2CoverageReport(analysis: L2CoverageAnalysis): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const lines: string[] = [];

  lines.push("# L2 (LLM Deep Review) Coverage Analysis");
  lines.push("");
  lines.push("This report analyzes which L1 (pattern-based) false negatives are");
  lines.push("theoretically coverable by L2 (LLM deep review) prompts.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total L1 False Negatives | ${analysis.totalFalseNegatives} |`);
  lines.push(`| L2-Coverable | ${analysis.l2Coverable} |`);
  lines.push(`| L2 Coverage Rate | ${pct(analysis.l2CoverageRate)} |`);
  lines.push("");

  // Per-judge breakdown
  const judges = Object.values(analysis.perJudge).sort((a, b) => b.falseNegatives - a.falseNegatives);
  if (judges.length > 0) {
    lines.push("## L1 Misses by Judge");
    lines.push("");
    lines.push("| Judge | FN Count | Has L2 Prompt | Prompt Size |");
    lines.push("|-------|----------|---------------|-------------|");
    for (const j of judges) {
      lines.push(
        `| ${j.judgeName} (${j.judgeId}) | ${j.falseNegatives} | ${j.hasL2Prompt ? "✅" : "❌"} | ${j.promptLength > 0 ? `${j.promptLength} chars` : "—"} |`,
      );
    }
    lines.push("");
  }

  // Per-category breakdown
  const categories = Object.values(analysis.perCategory).sort((a, b) => b.falseNegatives - a.falseNegatives);
  if (categories.length > 0) {
    lines.push("## L2 Coverage by Category");
    lines.push("");
    lines.push("| Category | L1 Misses | L2-Coverable | Coverage |");
    lines.push("|----------|-----------|--------------|----------|");
    for (const cat of categories) {
      lines.push(`| ${cat.category} | ${cat.falseNegatives} | ${cat.l2Coverable} | ${pct(cat.coverageRate)} |`);
    }
    lines.push("");
  }

  // Per-difficulty breakdown
  const difficulties = Object.values(analysis.perDifficulty);
  if (difficulties.length > 0) {
    lines.push("## L2 Coverage by Difficulty");
    lines.push("");
    lines.push("| Difficulty | L1 Misses | L2-Coverable |");
    lines.push("|------------|-----------|--------------|");
    for (const d of difficulties) {
      lines.push(`| ${d.difficulty} | ${d.falseNegatives} | ${d.l2Coverable} |`);
    }
    lines.push("");
  }

  // Top missed cases by judge
  const topJudges = judges.slice(0, 5);
  if (topJudges.length > 0) {
    lines.push("## Top Missed Cases by Judge");
    lines.push("");
    for (const j of topJudges) {
      const prefix = Object.keys(analysis.missedCasesByJudge).find((k) => analysis.perJudge[k]?.judgeId === j.judgeId);
      const cases = prefix ? analysis.missedCasesByJudge[prefix] : [];
      if (cases.length > 0) {
        lines.push(`### ${j.judgeName}`);
        lines.push("");
        for (const caseId of cases.slice(0, 10)) {
          lines.push(`- ${caseId}`);
        }
        if (cases.length > 10) {
          lines.push(`- ... and ${cases.length - 10} more`);
        }
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("*Generated by [Judges Panel](https://github.com/KevinRabun/judges) L2 coverage analysis.*");
  lines.push("");

  return lines.join("\n");
}

// ─── Benchmark Case Ingestion ───────────────────────────────────────────────
// Convert real-world findings (from daily-popular-repo-autofix or manual
// evaluations) into candidate BenchmarkCase entries.
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestFindingsInput {
  /** Source code that was evaluated */
  code: string;
  /** Language of the code */
  language: string;
  /** Findings produced by the evaluation */
  findings: Array<{ ruleId: string }>;
}

/**
 * Convert real-world evaluation results into candidate benchmark cases.
 *
 * Each input becomes a BenchmarkCase whose expectedRuleIds come from the
 * actual findings produced. This lets operators take real-world detections
 * and "pin" them as regression tests.
 */
export function ingestFindingsAsBenchmarkCases(inputs: IngestFindingsInput[]): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i];
    if (!inp.code || !inp.language || !inp.findings?.length) continue;

    const ruleIds = [...new Set(inp.findings.map((f) => f.ruleId))];
    // Infer category from the dominant rule prefix
    const prefixCounts: Record<string, number> = {};
    for (const rid of ruleIds) {
      const prefix = rid.split("-")[0];
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    }
    const dominantPrefix = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    const category = dominantPrefix.toLowerCase();

    cases.push({
      id: `ingested-${i + 1}-${category}`,
      description: `Ingested finding: ${ruleIds.join(", ")}`,
      language: inp.language,
      code: inp.code.length > 2000 ? inp.code.slice(0, 2000) + "\n// ... truncated" : inp.code,
      expectedRuleIds: ruleIds,
      category,
      difficulty: "medium",
    });
  }

  return cases;
}

/**
 * Deduplicate ingested cases against existing benchmark cases.
 *
 * Uses code fingerprinting (normalized whitespace hash) to detect
 * near-duplicate test cases. Returns only novel candidates.
 */
export function deduplicateIngestCases(existing: BenchmarkCase[], candidates: BenchmarkCase[]): BenchmarkCase[] {
  // Build a set of normalized code fingerprints from existing cases
  const normalize = (code: string) => code.replace(/\s+/g, " ").trim().toLowerCase();
  const existingFingerprints = new Set(existing.map((c) => normalize(c.code)));

  return candidates.filter((c) => !existingFingerprints.has(normalize(c.code)));
}
