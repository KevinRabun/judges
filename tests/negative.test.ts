// ─────────────────────────────────────────────────────────────────────────────
// Judges Panel — Negative Test Suite
// ─────────────────────────────────────────────────────────────────────────────
// Validates that well-written, secure code does NOT produce false positives.
// Each sample is clean, production-quality code that should receive a "pass"
// or "warning" verdict — never "fail" — with zero critical findings.
//
// Usage:
//   npx tsx --test tests/negative.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateWithJudge, evaluateWithTribunal } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";
import type { TribunalVerdict } from "../src/types.js";

// ─── Clean Code Samples ─────────────────────────────────────────────────────

/** Well-structured Express API with all security best practices */
const cleanExpressServer = `
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import pino from "pino";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const logger = pino({ level: "info" });
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: ["https://app.example.com"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Input validation schemas
const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
});

// Parameterized query helper
async function findUserByEmail(email: string) {
  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
}

// Auth routes with proper error handling
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = UserSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET!, {
      expiresIn: "1h",
      algorithm: "HS256",
    });

    logger.info({ userId: user.id }, "User logged in");
    return res.json({ token });
  } catch (error) {
    logger.error(error, "Login failed");
    next(error);
  }
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err, "Unhandled error");
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred",
    correlationId: crypto.randomUUID(),
  });
});

// Graceful shutdown
process.on("unhandledRejection", (reason) => {
  logger.error(reason, "Unhandled rejection");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

const server = app.listen(Number(process.env.PORT) || 3000, () => {
  logger.info("Server started");
});
`;

/** Clean TypeScript utility module — no server code, no security concerns */
const cleanUtilityModule = `
/**
 * Date formatting utilities with proper error handling and i18n support.
 */

export interface DateFormatOptions {
  locale?: string;
  timeZone?: string;
  includeTime?: boolean;
}

const DEFAULT_OPTIONS: DateFormatOptions = {
  locale: "en-US",
  timeZone: "UTC",
  includeTime: false,
};

/**
 * Format a date with the given options. Returns a localized string.
 * Throws if the input is not a valid date.
 */
export function formatDate(input: Date | string | number, options?: DateFormatOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const date = new Date(input);

  if (isNaN(date.getTime())) {
    throw new Error(\`Invalid date input: \${String(input)}\`);
  }

  const formatOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: opts.timeZone,
  };

  if (opts.includeTime) {
    formatOptions.hour = "2-digit";
    formatOptions.minute = "2-digit";
    formatOptions.second = "2-digit";
  }

  return new Intl.DateTimeFormat(opts.locale, formatOptions).format(date);
}

/**
 * Calculate the difference between two dates in days.
 */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 86_400_000;
  const diff = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diff / msPerDay);
}

/**
 * Check if a date is within a given range (inclusive).
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
`;

/** Clean Python Flask API with security best practices */
const cleanPythonApi = `
from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from marshmallow import Schema, fields, validate
from werkzeug.security import check_password_hash
import logging
import os

app = Flask(__name__)
logger = logging.getLogger(__name__)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
)

class UserSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))

user_schema = UserSchema()

@app.route("/api/users", methods=["GET"])
@limiter.limit("30/minute")
def list_users():
    try:
        page = request.args.get("page", 1, type=int)
        per_page = min(request.args.get("per_page", 20, type=int), 100)

        users = db.session.query(User).paginate(
            page=page, per_page=per_page, error_out=False
        )
        return jsonify({
            "users": [u.to_dict() for u in users.items],
            "total": users.total,
            "page": users.page,
            "pages": users.pages,
        })
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        return jsonify({"error": "Internal error"}), 500

@app.route("/health")
def health_check():
    return jsonify({"status": "ok"})

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {e}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
`;

/** Clean Rust web service */
const cleanRustApi = `
use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{info, error};
use validator::Validate;
use std::env;

#[derive(Deserialize, Validate)]
struct CreateUserRequest {
    #[validate(email)]
    email: String,
    #[validate(length(min = 8, max = 128))]
    password: String,
}

#[derive(Serialize)]
struct UserResponse {
    id: i64,
    email: String,
}

async fn create_user(
    pool: web::Data<PgPool>,
    body: web::Json<CreateUserRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    body.validate().map_err(|e| {
        error!("Validation failed: {}", e);
        actix_web::error::ErrorBadRequest(e)
    })?;

    let user = sqlx::query_as!(
        UserResponse,
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
        body.email,
        hash_password(&body.password)?
    )
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| {
        error!("Database error: {}", e);
        actix_web::error::ErrorInternalServerError("Internal error")
    })?;

    Ok(HttpResponse::Created().json(user))
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::init();
    let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");

    info!("Starting server on port {}", port);

    HttpServer::new(move || {
        App::new()
            .wrap(middleware::Logger::default())
            .app_data(web::Data::new(pool.clone()))
            .route("/api/users", web::post().to(create_user))
            .route("/health", web::get().to(health))
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}
`;

/** Pure TypeScript type definitions — no runtime code */
const cleanTypeDefinitions = `
/**
 * Core domain types for the order management system.
 */

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

export type PaymentMethod = "credit_card" | "debit_card" | "paypal" | "bank_transfer";

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: PaymentMethod;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderSummary {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Record<OrderStatus, number>;
}
`;

/** Well-written test file — should not trigger security rules */
const cleanTestFile = `
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatDate, daysBetween, isDateInRange } from "../src/utils/date";

describe("formatDate", () => {
  it("should format a valid date with default options", () => {
    const result = formatDate(new Date("2024-01-15"));
    expect(result).toBe("January 15, 2024");
  });

  it("should format with custom locale", () => {
    const result = formatDate(new Date("2024-01-15"), { locale: "de-DE" });
    expect(result).toContain("Januar");
  });

  it("should include time when requested", () => {
    const result = formatDate(new Date("2024-01-15T10:30:00Z"), {
      includeTime: true,
      timeZone: "UTC",
    });
    expect(result).toContain("10:");
  });

  it("should throw for invalid date input", () => {
    expect(() => formatDate("not-a-date")).toThrow("Invalid date input");
  });
});

describe("daysBetween", () => {
  it("should calculate days between two dates", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-01-31");
    expect(daysBetween(start, end)).toBe(30);
  });

  it("should return 0 for the same date", () => {
    const date = new Date("2024-06-15");
    expect(daysBetween(date, date)).toBe(0);
  });

  it("should handle reverse order", () => {
    const start = new Date("2024-01-31");
    const end = new Date("2024-01-01");
    expect(daysBetween(start, end)).toBe(30);
  });
});

describe("isDateInRange", () => {
  const rangeStart = new Date("2024-01-01");
  const rangeEnd = new Date("2024-12-31");

  it("should return true for date within range", () => {
    expect(isDateInRange(new Date("2024-06-15"), rangeStart, rangeEnd)).toBe(true);
  });

  it("should return true for boundary dates", () => {
    expect(isDateInRange(rangeStart, rangeStart, rangeEnd)).toBe(true);
    expect(isDateInRange(rangeEnd, rangeStart, rangeEnd)).toBe(true);
  });

  it("should return false for date outside range", () => {
    expect(isDateInRange(new Date("2025-01-01"), rangeStart, rangeEnd)).toBe(false);
  });
});
`;

// ═════════════════════════════════════════════════════════════════════════════
// Negative Tests: Clean Code Should Not Produce Critical/High Findings
// ═════════════════════════════════════════════════════════════════════════════

describe("Negative Tests — Clean Code False Positive Prevention", () => {
  describe("Well-secured Express server", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanExpressServer, "typescript");
      assert.ok(verdict);
    });

    it("should NOT produce a fail verdict", () => {
      assert.notEqual(
        verdict.overallVerdict,
        "fail",
        `Clean Express server should not fail. Score: ${verdict.overallScore}, ` +
          `critical: ${verdict.criticalCount}, high: ${verdict.highCount}`,
      );
    });

    it("should have zero critical findings", () => {
      const criticals = verdict.findings.filter((f) => f.severity === "critical");
      assert.equal(
        criticals.length,
        0,
        `Expected 0 critical findings, got ${criticals.length}: ${criticals.map((f) => `${f.ruleId}: ${f.title}`).join(", ")}`,
      );
    });

    it("should have a score >= 60", () => {
      assert.ok(verdict.overallScore >= 60, `Expected score >= 60, got ${verdict.overallScore}`);
    });

    it("should detect positive signals (helmet, zod, bcrypt, etc.)", () => {
      // The score should reflect positive signals from security libraries
      assert.ok(verdict.overallScore >= 65, `Expected positive signal bonus, score: ${verdict.overallScore}`);
    });
  });

  describe("Clean utility module (no server code)", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanUtilityModule, "typescript");
      assert.ok(verdict);
    });

    it("should NOT produce a fail verdict", () => {
      assert.notEqual(verdict.overallVerdict, "fail", `Clean utility module should not fail`);
    });

    it("should have zero critical findings", () => {
      const criticals = verdict.findings.filter((f) => f.severity === "critical");
      assert.equal(criticals.length, 0, `Unexpected critical findings: ${criticals.map((f) => f.ruleId).join(", ")}`);
    });

    it("should have very few high findings", () => {
      const highs = verdict.findings.filter((f) => f.severity === "high");
      assert.ok(
        highs.length <= 2,
        `Expected <= 2 high findings for a utility module, got ${highs.length}: ${highs.map((f) => `${f.ruleId}: ${f.title}`).join(", ")}`,
      );
    });

    it("should have a high score", () => {
      assert.ok(verdict.overallScore >= 75, `Expected score >= 75 for utility, got ${verdict.overallScore}`);
    });
  });

  describe("Clean Python Flask API", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanPythonApi, "python");
      assert.ok(verdict);
    });

    it("should NOT produce a fail verdict", () => {
      assert.notEqual(verdict.overallVerdict, "fail", `Clean Python API should not fail`);
    });

    it("should have zero critical findings", () => {
      const criticals = verdict.findings.filter((f) => f.severity === "critical");
      assert.equal(criticals.length, 0, `Unexpected critical findings: ${criticals.map((f) => f.ruleId).join(", ")}`);
    });
  });

  describe("Clean Rust web service", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanRustApi, "rust");
      assert.ok(verdict);
    });

    it("should NOT produce a fail verdict", () => {
      assert.notEqual(verdict.overallVerdict, "fail", `Clean Rust API should not fail`);
    });

    it("should have zero critical findings", () => {
      const criticals = verdict.findings.filter((f) => f.severity === "critical");
      assert.equal(criticals.length, 0, `Unexpected critical findings: ${criticals.map((f) => f.ruleId).join(", ")}`);
    });
  });

  describe("Pure type definitions (no runtime code)", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanTypeDefinitions, "typescript");
      assert.ok(verdict);
    });

    it("should produce a pass or warning verdict", () => {
      assert.ok(
        verdict.overallVerdict === "pass" || verdict.overallVerdict === "warning",
        `Pure type file should pass or warn, not fail. Findings: ${verdict.findings.map((f) => f.ruleId).join(", ")}`,
      );
    });

    it("should have zero critical or high findings", () => {
      const severe = verdict.findings.filter((f) => f.severity === "critical" || f.severity === "high");
      assert.equal(severe.length, 0, `No severe findings expected for types-only file`);
    });

    it("should score very high", () => {
      assert.ok(verdict.overallScore >= 90, `Expected score >= 90 for types, got ${verdict.overallScore}`);
    });
  });

  describe("Test file should not trigger security rules", () => {
    let verdict: TribunalVerdict;

    it("should evaluate without throwing", () => {
      verdict = evaluateWithTribunal(cleanTestFile, "typescript");
      assert.ok(verdict);
    });

    it("should NOT produce a fail verdict", () => {
      assert.notEqual(verdict.overallVerdict, "fail", `Test file should not fail`);
    });

    it("should have zero critical findings", () => {
      const criticals = verdict.findings.filter((f) => f.severity === "critical");
      assert.equal(criticals.length, 0, `No critical findings expected in test code`);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Negative Tests: Specific False Positive Regression Tests
// ═════════════════════════════════════════════════════════════════════════════

describe("Negative Tests — Specific False Positive Regressions", () => {
  describe("Object.assign({}, source) should NOT flag as prototype pollution", () => {
    const code = `
const defaults = { theme: "dark", lang: "en" };
const config = Object.assign({}, defaults, userPrefs);
const merged = Object.assign({}, baseConfig);
export default config;
`;
    it("should not produce CYBER findings for safe Object.assign", () => {
      const judge = getJudge("cybersecurity");
      assert.ok(judge);
      const evaluation = evaluateWithJudge(judge, code, "typescript");
      const protoFindings = evaluation.findings.filter((f) => /prototype\s*pollution/i.test(f.title));
      assert.equal(
        protoFindings.length,
        0,
        `Object.assign({}, ...) is safe but was flagged: ${protoFindings.map((f) => f.ruleId).join(", ")}`,
      );
    });
  });

  describe("console.error in utility code should NOT flag as 'sole error strategy'", () => {
    const code = `
import { logger } from "./logger";

export function processItem(item: Item): Result {
  try {
    return transform(item);
  } catch (error) {
    console.error("Transform failed:", error);
    logger.error(error, "Transform failed");
    throw new AppError("TRANSFORM_FAILED", { cause: error });
  }
}
`;
    it("should not flag console.error when proper error handling exists", () => {
      const judge = getJudge("error-handling");
      assert.ok(judge);
      const evaluation = evaluateWithJudge(judge, code, "typescript");
      const soleStrategyFindings = evaluation.findings.filter((f) => /sole.*error.*strategy/i.test(f.title));
      assert.equal(soleStrategyFindings.length, 0, "Should not flag console.error when logger is also used");
    });
  });

  describe("Absence-based findings should be tagged appropriately", () => {
    const serverCode = `
import express from "express";
const app = express();
app.get("/api/data", (req, res) => { res.json({ ok: true }); });
app.listen(3000);
`;

    it("absence-based findings should have isAbsenceBased=true", () => {
      const verdict = evaluateWithTribunal(serverCode, "typescript");
      const absenceFindings = verdict.findings.filter((f) => f.isAbsenceBased);
      // A bare server should have some absence-based findings (no rate limit, no error handler, etc.)
      assert.ok(absenceFindings.length > 0, "Expected some absence-based findings on bare server");
      for (const finding of absenceFindings) {
        assert.ok(finding.provenance, `Absence finding ${finding.ruleId} should have provenance`);
      }
    });

    it("absence-based findings should not be critical or high severity", () => {
      const verdict = evaluateWithTribunal(serverCode, "typescript");
      const absenceFindings = verdict.findings.filter((f) => f.isAbsenceBased);
      const severeAbsence = absenceFindings.filter((f) => f.severity === "critical" || f.severity === "high");
      assert.equal(
        severeAbsence.length,
        0,
        `Absence findings should be capped at medium: ${severeAbsence.map((f) => `${f.ruleId}(${f.severity})`).join(", ")}`,
      );
    });
  });

  describe("Confidence-weighted scoring should reduce low-confidence impact", () => {
    it("low-confidence findings should have less impact on score", () => {
      const judge = getJudge("cybersecurity");
      assert.ok(judge);

      // Code with only low-confidence matches
      const code = `
import express from "express";
const app = express();
app.get("/api/data", (req, res) => {
  const data = fetchData();
  res.json(data);
});
app.listen(3000);
`;
      const evaluation = evaluateWithJudge(judge, code, "typescript");
      // With confidence weighting, score should stay relatively high
      // even if some low-confidence findings are raised
      assert.ok(
        evaluation.score >= 50,
        `Score should be reasonable with confidence weighting, got ${evaluation.score}`,
      );
    });
  });
});
