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
import { JUDGES, getJudge } from "../judges/index.js";
import type { Finding, TribunalVerdict, JudgeEvaluation } from "../types.js";

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
];

// ─── Benchmark Runner ───────────────────────────────────────────────────────

function ruleIdMatchesExpected(foundRuleId: string, expectedRuleIds: string[]): boolean {
  return expectedRuleIds.some((expected) => {
    // Exact match
    if (foundRuleId === expected) return true;
    // Prefix match: CYBER-001 matches CYBER-*
    if (expected.endsWith("*") && foundRuleId.startsWith(expected.slice(0, -1))) return true;
    // Prefix match: CYBER-003 matches when we expect CYBER-001 (same judge domain)
    const foundPrefix = foundRuleId.split("-")[0];
    return expectedRuleIds.some((e) => e.split("-")[0] === foundPrefix);
  });
}

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

  return {
    timestamp: new Date().toISOString(),
    version: "3.6.0",
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
`);
    process.exit(0);
  }

  let judgeId: string | undefined;
  let outputPath: string | undefined;
  let format: "text" | "json" = "text";

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--judge" || arg === "-j") judgeId = argv[++i];
    else if (arg === "--output" || arg === "-o") outputPath = argv[++i];
    else if (arg === "--format") format = argv[++i] as "text" | "json";
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
