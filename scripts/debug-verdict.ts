import { evaluateWithTribunal } from "../src/evaluators/index.js";

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

const v = evaluateWithTribunal(cleanExpressServer, "typescript");
const failJudges = v.evaluations.filter((e) => e.verdict === "fail");
console.log("Overall:", v.overallVerdict, "Score:", v.overallScore);
for (const j of failJudges) {
  console.log(`FAIL: ${j.judgeId} score=${j.score} findings:`);
  for (const f of j.findings) {
    console.log(`  ${f.ruleId} (${f.severity}, conf=${f.confidence}): ${f.title}`);
  }
}
if (failJudges.length === 0) {
  console.log("No judges returned fail verdict");
}
