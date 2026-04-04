/**
 * Multi-file benchmark scenarios — cross-file vulnerability patterns.
 *
 * These test cases represent real-world patterns where security issues
 * span multiple files (auth middleware in one file, unprotected routes
 * in another; database config in one file, raw queries in another; etc.)
 *
 * Each case has a primary `code` file and additional `files` for context.
 * The benchmark runner uses `evaluateProject()` for these cases.
 */

import type { BenchmarkCase } from "./benchmark.js";

export const BENCHMARK_MULTI_FILE: BenchmarkCase[] = [
  // ─── Auth middleware defined but not applied to all routes ──────────────
  {
    id: "multi-auth-middleware-not-applied",
    description: "Auth middleware exists in middleware.ts but sensitive routes in api.ts don't use it",
    language: "typescript",
    code: `// api.ts — routes without auth middleware
import express from "express";
import { db } from "./db";

const router = express.Router();

// Public endpoints (fine)
router.get("/health", (req, res) => res.json({ ok: true }));

// SENSITIVE: these should require auth but don't use requireAuth
router.get("/api/users", async (req, res) => {
  const users = await db.query("SELECT id, name, email FROM users");
  res.json(users);
});

router.delete("/api/users/:id", async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.json({ deleted: true });
});

router.get("/api/admin/settings", async (req, res) => {
  const settings = await db.query("SELECT * FROM settings");
  res.json(settings);
});

export default router;`,
    files: [
      {
        path: "middleware.ts",
        content: `import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
}`,
        language: "typescript",
      },
      {
        path: "db.ts",
        content: `import { Pool } from "pg";
export const db = new Pool({ connectionString: process.env.DATABASE_URL });`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    acceptablePrefixes: ["SEC", "CYBER", "API"],
    category: "auth",
    difficulty: "hard",
  },

  // ─── Database connection without pooling, queries in separate file ─────
  {
    id: "multi-db-no-pool-separate-files",
    description: "Database opens new connection per query; queries in separate service file",
    language: "typescript",
    code: `// user-service.ts — queries using per-request connections
import { getConnection } from "./database";

export async function getUsers(search?: string) {
  const conn = await getConnection();
  const query = search
    ? \`SELECT * FROM users WHERE name LIKE '%\${search}%'\`
    : "SELECT * FROM users";
  const result = await conn.query(query);
  // connection never closed
  return result.rows;
}

export async function updateUser(id: string, data: any) {
  const conn = await getConnection();
  await conn.query(\`UPDATE users SET name = '\${data.name}' WHERE id = '\${id}'\`);
}`,
    files: [
      {
        path: "database.ts",
        content: `import { Client } from "pg";

// Creates a NEW connection every time — no pooling
export async function getConnection() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["DB-001", "CYBER-001", "SEC-001"],
    acceptablePrefixes: ["PERF", "SCALE", "REL"],
    category: "database",
    difficulty: "medium",
  },

  // ─── Config/secrets in env file imported by multiple modules ───────────
  {
    id: "multi-config-secrets-spread",
    description: "Secrets hardcoded in config, imported across service files",
    language: "typescript",
    code: `// payment-service.ts — imports secrets from config
import { config } from "./config";
import Stripe from "stripe";

const stripe = new Stripe(config.STRIPE_SECRET_KEY);

export async function chargeCustomer(customerId: string, amount: number) {
  return stripe.charges.create({
    amount,
    currency: "usd",
    customer: customerId,
  });
}`,
    files: [
      {
        path: "config.ts",
        content: `// DANGER: hardcoded secrets
export const config = {
  STRIPE_SECRET_KEY: "sk_test_FAKE_KEY_FOR_BENCHMARK_ONLY_000000",
  JWT_SECRET: "super-secret-jwt-key-2024",
  DATABASE_URL: "postgres://admin:password123@db.prod.internal:5432/maindb",
  AWS_ACCESS_KEY: "AKIA_FAKE_KEY_FOR_BENCHMARK",
  AWS_SECRET_KEY: "FAKE_SECRET_KEY_FOR_BENCHMARK_TESTING_ONLY",
  SENDGRID_API_KEY: "SG.FAKE_KEY_FOR_BENCHMARK_ONLY",
};`,
        language: "typescript",
      },
      {
        path: "email-service.ts",
        content: `import { config } from "./config";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(config.SENDGRID_API_KEY);

export function sendWelcome(email: string) {
  return sgMail.send({ to: email, from: "noreply@app.com", subject: "Welcome", text: "Hello!" });
}`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["AUTH-001", "DATA-001", "CYBER-001"],
    acceptablePrefixes: ["SEC", "CFG"],
    category: "data-security",
    difficulty: "easy",
  },

  // ─── Error handler defined but not wired into Express app ──────────────
  {
    id: "multi-error-handler-not-wired",
    description: "Error handler middleware defined but never registered in the Express app",
    language: "typescript",
    code: `// app.ts — Express app without error handler
import express from "express";
import userRoutes from "./routes/users";
import orderRoutes from "./routes/orders";

const app = express();
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
// Missing: app.use(errorHandler)

app.listen(3000);`,
    files: [
      {
        path: "middleware/error-handler.ts",
        content: `export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: { message: err.message, code: err.code || "INTERNAL_ERROR" },
  });
}`,
        language: "typescript",
      },
      {
        path: "routes/users.ts",
        content: `import { Router } from "express";
const router = Router();
router.get("/", async (req, res) => {
  const users = await db.query("SELECT * FROM users");
  res.json(users); // throws on DB error — no try/catch, no error middleware
});
export default router;`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["ERR-001"],
    acceptablePrefixes: ["REL", "FW", "SWDEV"],
    category: "error-handling",
    difficulty: "hard",
  },

  // ─── Rate limiter on auth but not on API data endpoints ────────────────
  {
    id: "multi-rate-limit-partial",
    description: "Rate limiting on login endpoint but missing on data-heavy API",
    language: "typescript",
    code: `// routes/data.ts — no rate limiting on expensive queries
import { Router } from "express";

const router = Router();

router.get("/api/reports", async (req, res) => {
  // Expensive aggregation — no rate limit, no pagination
  const report = await db.query(\`
    SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
    FROM users u JOIN orders o ON u.id = o.user_id
    GROUP BY u.name ORDER BY total_spent DESC
  \`);
  res.json(report.rows);
});

router.get("/api/export", async (req, res) => {
  // Full table dump — no limit
  const all = await db.query("SELECT * FROM transactions");
  res.json(all.rows);
});

export default router;`,
    files: [
      {
        path: "routes/auth.ts",
        content: `import { Router } from "express";
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const router = Router();

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticate(email, password);
  res.json({ token: generateToken(user) });
});

export default router;`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["RATE-001", "DB-001"],
    acceptablePrefixes: ["PERF", "SCALE", "SEC", "COST"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ─── Logging PII in error handler, sanitized in normal flow ────────────
  {
    id: "multi-pii-leak-error-path",
    description: "User data sanitized in normal responses but leaked in error logs",
    language: "typescript",
    code: `// services/user-service.ts — handles users correctly in normal flow
import { logger } from "./logger";

export async function processUserUpdate(userId: string, updates: any) {
  try {
    const user = await db.findUser(userId);
    if (!user) throw new Error("User not found");
    await db.updateUser(userId, sanitize(updates));
    return { success: true };
  } catch (error) {
    // LEAK: full user object + updates (may contain SSN, password) in error log
    logger.error("Update failed", { userId, user: await db.findUser(userId), updates, error });
    throw error;
  }
}

function sanitize(data: any) {
  const { ssn, password, creditCard, ...safe } = data;
  return safe;
}`,
    files: [
      {
        path: "logger.ts",
        content: `import winston from "winston";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console(),
  ],
});`,
        language: "typescript",
      },
    ],
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    acceptablePrefixes: ["SEC", "COMP", "ERR"],
    category: "logging-privacy",
    difficulty: "hard",
  },

  // ─── Clean multi-file: well-structured Express app ─────────────────────
  {
    id: "clean-multi-file-express-app",
    description: "Well-structured Express app with auth, error handling, rate limiting, and proper logging",
    language: "typescript",
    code: `// app.ts — well-organized Express application
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { apiRouter } from "./routes/api";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/logger";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") }));
app.use(express.json({ limit: "10kb" }));
app.use(requestLogger);

app.use("/auth", authRouter);
app.use("/api", requireAuth, apiRouter);

app.use(errorHandler);

export default app;`,
    files: [
      {
        path: "middleware/auth.ts",
        content: `import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}`,
        language: "typescript",
      },
      {
        path: "middleware/error-handler.ts",
        content: `export function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  res.status(status).json({ error: { message: status === 500 ? "Internal error" : err.message } });
}`,
        language: "typescript",
      },
    ],
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },

  // ─── Clean multi-file: Python FastAPI with dependency injection ────────
  {
    id: "clean-multi-file-fastapi",
    description: "Well-structured FastAPI app with auth deps, connection pooling, and error handling",
    language: "python",
    code: `# main.py
from fastapi import FastAPI, Depends, HTTPException
from .auth import get_current_user
from .database import get_db
from .models import UserResponse

app = FastAPI()

@app.get("/api/users/me", response_model=UserResponse)
async def get_me(user = Depends(get_current_user)):
    return user

@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db = Depends(get_db), _ = Depends(get_current_user)):
    user = await db.fetch_one("SELECT id, name, email FROM users WHERE id = $1", user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user`,
    files: [
      {
        path: "auth.py",
        content: `from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt, os

security = HTTPBearer()

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(creds.credentials, os.environ["JWT_SECRET"], algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")`,
        language: "python",
      },
      {
        path: "database.py",
        content: `import asyncpg, os

pool = None

async def get_db():
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=5, max_size=20)
    async with pool.acquire() as conn:
        yield conn`,
        language: "python",
      },
    ],
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
];
