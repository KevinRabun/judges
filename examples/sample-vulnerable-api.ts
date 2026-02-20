// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Sample: Intentionally Flawed API Server
// ─────────────────────────────────────────────────────────────────────────────
// This file is intentionally filled with security, performance, reliability,
// and code quality issues so that the Judges Panel can demonstrate its
// detection capabilities. DO NOT use this code in production!
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import moment from "moment";
import fs from "fs";

// ── DATA-SECURITY: Hardcoded secrets ─────────────────────────────────────────
const password = "SuperSecret123!";
const api_key = "sk-proj-ABCDEF1234567890abcdef";
const secret = "my-jwt-signing-secret-value";
const DATABASE_URL = "postgres://admin:hunter2@prod-db.example.com:5432/myapp";

// ── SCALABILITY: Global mutable state ────────────────────────────────────────
let requestCount = 0;
var userCache: any = {};

// ── CONCURRENCY: Shared mutable state in async context ───────────────────────
let activeConnections = [];

// ── SOFTWARE-PRACTICES: var keyword, any type ────────────────────────────────
var app: any = express();

// ── CYBERSECURITY: Disabled TLS ──────────────────────────────────────────────
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── CYBERSECURITY: Overly permissive CORS ────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// ── API-DESIGN: Verb in URL ──────────────────────────────────────────────────
// ── DOCUMENTATION: API endpoints without documentation ───────────────────────
app.get("/api/getUsers", async (req, res) => {
  // ── PERFORMANCE: Synchronous file I/O ──────────────────────────────────────
  const config = fs.readFileSync("./config.json", "utf-8");

  // ── COST-EFFECTIVENESS: Unbounded query / SELECT * ─────────────────────────
  const users = db.find({});
  const query = `SELECT * FROM users`;

  // ── OBSERVABILITY: Console.log with sensitive data ─────────────────────────
  console.log("Fetching users with token: " + req.headers.authorization);
  console.log("Config loaded");
  console.log("DB query ran");
  console.log("Processing request");

  // ── RELIABILITY: No timeout on fetch ───────────────────────────────────────
  const externalData = await fetch("https://api.example.com/data");

  res.json(users);
});

app.post("/api/createUser", async (req, res) => {
  // ── SOFTWARE-PRACTICES: No input validation ────────────────────────────────
  const userData = req.body;

  // ── DATA-SECURITY: Weak hashing ────────────────────────────────────────────
  const hashedPw = crypto.createHash("md5").update(userData.password).digest("hex");

  // ── COMPLIANCE: PII without protection ─────────────────────────────────────
  const ssn = userData.ssn;
  const cardNumber = userData.cardNumber;

  // ── COMPLIANCE: Sensitive data in logs ─────────────────────────────────────
  console.log("Creating user with password: " + userData.password);

  // ── DATA-SECURITY: SQL injection ───────────────────────────────────────────
  db.execute(`INSERT INTO users VALUES ('${req.body.name}', '${hashedPw}')`);

  // ── CONCURRENCY: Missing await on async operation ──────────────────────────
  async function sendWelcome() {
    emailService.send(userData.email, "Welcome!");
  }
  sendWelcome();

  res.json({ success: true });
});

app.get("/api/fetchReport", async (req, res) => {
  // ── API-DESIGN: Sensitive data in query params ─────────────────────────────
  const token = req.query.token;

  // ── PERFORMANCE: N+1 query pattern ─────────────────────────────────────────
  const departments = await db.find({ type: "department" });
  for (const dept of departments) {
    const employees = await db.findOne({ departmentId: dept.id });
    dept.employees = employees;
  }

  // ── COST-EFFECTIVENESS: Nested loops O(n²) ────────────────────────────────
  for (let i = 0; i < departments.length; i++) {
    for (let j = 0; j < departments[i].employees.length; j++) {
      departments[i].employees[j].score = departments[i].employees[j].rating * 100;
    }
  }

  // ── CYBERSECURITY: innerHTML XSS risk ──────────────────────────────────────
  const rendered = `<div>`;
  document.innerHTML = rendered;

  res.json({ data: departments });
});

app.post("/api/deleteItem", async (req, res) => {
  // ── CYBERSECURITY: eval() usage ────────────────────────────────────────────
  const filter = eval(req.body.filterExpression);

  // ── RELIABILITY: Empty catch block ─────────────────────────────────────────
  try {
    await db.deleteMany(filter);
  } catch (err) {
  }

  // ── RELIABILITY: process.exit() ────────────────────────────────────────────
  if (req.body.shutdown) {
    process.exit(1);
  }

  res.json({ deleted: true });
});

// ── ETHICS-BIAS: Demographic-based conditional logic ─────────────────────────
function calculateDiscount(user: any) {
  if (user.gender === "male") {
    return 10;
  }
  // ── ETHICS-BIAS: Non-inclusive language ─────────────────────────────────────
  // Check the whitelist for approved customers
  const blacklist = ["badUser1", "badUser2"];
  return 5;
}

// ── INTERNATIONALIZATION: Hardcoded currency, string concat ──────────────────
function formatPrice(amount: number, name: string) {
  // ── I18N: Hardcoded currency symbol ────────────────────────────────────────
  const message = "$" + amount.toFixed(2);
  // ── I18N: String concatenation for user messages ───────────────────────────
  const errorMsg = "Hello " + name + " your total is";
  return message;
}

// ── ACCESSIBILITY: Image without alt, input without label ────────────────────
const html = `
  <html>
    <nav role="navigation">
      <img src="logo.png">
      <input type="text" placeholder="Search">
      <div role="button" onClick="handleClick()">Click me</div>
      <button style="outline: none">Submit</button>
    </nav>
  </html>
`;

// ── TESTING: No tests detected ───────────────────────────────────────────────
// (This file contains logic but no test structure)

// ── CONCURRENCY: setInterval without cleanup ─────────────────────────────────
setInterval(() => {
  requestCount++;
  console.log("Heartbeat: " + requestCount);
}, 5000);

// ── CLOUD-READINESS: Hardcoded host/port, no health check, no graceful shutdown
const PORT = 3000;

// ── PORTABILITY: OS-specific path ────────────────────────────────────────────
const backupPath = "/var/backups/myapp/data.json";

app.listen(PORT, () => {
  console.log("Server running on localhost:" + PORT);
});

// ── DEPENDENCY-HEALTH: deprecated import (moment) is handled at the top ──────
// ── COST-EFFECTIVENESS: No caching, sync I/O ────────────────────────────────
// ── OBSERVABILITY: No structured logging, no metrics, no tracing ─────────────
// ── COMPLIANCE: No data deletion mechanism, no consent check ─────────────────
// ── DOCUMENTATION: No JSDoc on exported functions ────────────────────────────
// ── MAINTAINABILITY: any types, magic numbers, var keyword, TODO/FIXME ───────
// ── ERROR-HANDLING: empty catch, no global error handler, process.exit ────────
// ── AUTHENTICATION: hardcoded creds, no auth middleware, token in query ───────
// ── DATABASE: SQL injection, N+1 queries, SELECT *, hardcoded connection ─────
// ── CACHING: unbounded global cache, no HTTP cache headers ───────────────────
// ── CONFIGURATION: hardcoded PORT, DATABASE_URL, secrets in code ─────────────
// ── BACKWARDS-COMPAT: API routes without version prefix ──────────────────────
// ── PORTABILITY: OS-specific path, hardcoded relative paths ──────────────────
// ── UX: inline event handler, no loading states, generic errors ──────────────
// ── LOGGING-PRIVACY: auth token logged, password logged, PII in logs ─────────
// ── RATE-LIMITING: no rate limit, unbounded queries, no backoff ──────────────
// ── CI/CD: @ts-nocheck, no lint config, process.exit ─────────────────────────

// TODO fix security issues before launch
// FIXME this entire file needs refactoring
