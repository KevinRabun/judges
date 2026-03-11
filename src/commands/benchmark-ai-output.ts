import type { BenchmarkCase } from "./benchmark.js";

/**
 * AI-output-specific benchmark cases targeting patterns characteristic of
 * LLM-generated code: logic inversions, dead code, name-body mismatches,
 * empty error handlers, and inadequate tests.
 *
 * Covers LOGIC, TEST, and enhanced HALLU prefixes.
 */
export const BENCHMARK_AI_OUTPUT: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Inverted security conditions (AI frequently gets these wrong)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-inverted-auth-check",
    description: "AI inverts authentication check — grants access when NOT authenticated",
    language: "typescript",
    code: `export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization;
  const isAuthenticated = verifyToken(token);

  if (!isAuthenticated) {
    // AI inverted: should deny, but grants access
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}`,
    expectedRuleIds: ["LOGIC-001", "AUTH-001"],
    category: "ai-logic-error",
    difficulty: "medium",
    aiSource: "gpt-4",
  },
  {
    id: "ai-logic-inverted-admin-check",
    description: "AI inverts admin role check — grants admin when NOT admin",
    language: "python",
    code: `def require_admin(func):
    def wrapper(request, *args, **kwargs):
        if not request.user.is_admin:
            return func(request, *args, **kwargs)  # Grants access when NOT admin
        return HttpResponseForbidden("Admin access required")
    return wrapper`,
    expectedRuleIds: ["LOGIC-001", "AUTH-001"],
    category: "ai-logic-error",
    difficulty: "medium",
    aiSource: "claude",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Off-by-one errors (classic AI mistake)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-off-by-one-loop",
    description: "AI uses <= instead of < for array bounds",
    language: "typescript",
    code: `export function processItems(items: string[]) {
  const results: string[] = [];
  for (let i = 0; i <= items.length; i++) {
    results.push(items[i].toUpperCase());
  }
  return results;
}`,
    expectedRuleIds: ["LOGIC-002"],
    category: "ai-logic-error",
    difficulty: "easy",
    aiSource: "copilot",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Dead code after return (AI generates unreachable code)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-dead-code-after-return",
    description: "AI generates cleanup code after a return statement",
    language: "typescript",
    code: `export function getUserProfile(userId: string) {
  const user = db.findUser(userId);
  if (!user) {
    return null;
    console.log("User not found, cleaning up...");
    cache.invalidate(userId);
  }
  return user;
}`,
    expectedRuleIds: ["LOGIC-003"],
    category: "ai-logic-error",
    difficulty: "easy",
    aiSource: "gpt-4",
  },
  {
    id: "ai-logic-dead-code-after-throw",
    description: "AI generates code after throw statement",
    language: "typescript",
    code: `export function validateInput(input: string) {
  if (!input) {
    throw new Error("Input is required");
    logger.error("Validation failed for empty input");
    metrics.increment("validation.failures");
  }
  return sanitize(input);
}`,
    expectedRuleIds: ["LOGIC-003"],
    category: "ai-logic-error",
    difficulty: "easy",
    aiSource: "claude",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Name-body mismatch (AI names don't match behavior)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-name-mismatch-validate",
    description: "Function named 'validate' but never rejects invalid input",
    language: "typescript",
    code: `export function validateUserInput(data: any) {
  const name = data.name || "Anonymous";
  const email = data.email || "unknown@example.com";
  const age = data.age || 0;
  return { name, email, age };
}`,
    expectedRuleIds: ["LOGIC-004"],
    category: "ai-logic-error",
    difficulty: "medium",
    aiSource: "copilot",
  },
  {
    id: "ai-logic-name-mismatch-delete",
    description: "Function named 'delete' but only soft-deletes without actual removal",
    language: "python",
    code: `def delete_user(user_id):
    user = User.query.get(user_id)
    user.status = "inactive"
    user.updated_at = datetime.now()
    db.session.commit()
    return {"message": "User updated"}`,
    expectedRuleIds: ["LOGIC-004"],
    category: "ai-logic-error",
    difficulty: "medium",
    aiSource: "gpt-4",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Swapped comparison operands
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-swapped-operands",
    description: "AI swaps password and username in comparison",
    language: "typescript",
    code: `export async function login(username: string, password: string) {
  const user = await db.findUser(username);
  if (!user) return { error: "User not found" };

  // AI swapped: comparing password to username
  if (password === username) {
    return { token: createToken(user) };
  }
  return { error: "Invalid credentials" };
}`,
    expectedRuleIds: ["LOGIC-005"],
    category: "ai-logic-error",
    difficulty: "hard",
    aiSource: "claude",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOGIC — Empty catch blocks (AI silently swallows errors)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-logic-empty-catch",
    description: "AI generates try/catch that silently swallows critical errors",
    language: "typescript",
    code: `export async function transferFunds(from: string, to: string, amount: number) {
  try {
    await db.beginTransaction();
    await db.debit(from, amount);
    await db.credit(to, amount);
    await db.commit();
  } catch (e) {
  }
  return { success: true };
}`,
    expectedRuleIds: ["LOGIC-006", "ERR-001"],
    category: "ai-logic-error",
    difficulty: "easy",
    aiSource: "copilot",
  },
  {
    id: "ai-logic-empty-except-python",
    description: "AI generates bare except that catches everything including SystemExit",
    language: "python",
    code: `def process_payment(order_id, amount):
    try:
        gateway = PaymentGateway()
        result = gateway.charge(amount)
        update_order(order_id, result)
    except:
        pass
    return {"status": "processed"}`,
    expectedRuleIds: ["LOGIC-006"],
    category: "ai-logic-error",
    difficulty: "easy",
    aiSource: "gpt-4",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEST — Happy-path-only tests (AI generates tests without error cases)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-test-happy-path-only",
    description: "AI generates multiple test cases but all are happy paths",
    language: "typescript",
    code: `describe("UserService", () => {
  it("should create a user with valid data", () => {
    const user = createUser({ name: "Alice", email: "alice@example.com" });
    expect(user.id).toBeDefined();
  });

  it("should find a user by id", () => {
    const user = findUser("123");
    expect(user.name).toBe("Alice");
  });

  it("should update a user name", () => {
    const user = updateUser("123", { name: "Bob" });
    expect(user.name).toBe("Bob");
  });

  it("should list all users", () => {
    const users = listUsers();
    expect(users.length).toBeGreaterThan(0);
  });
});`,
    expectedRuleIds: ["TEST-010"],
    category: "ai-test-quality",
    difficulty: "medium",
    aiSource: "copilot",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEST — Status-code-only assertions (AI misses body validation)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-test-status-code-only",
    description: "AI generates API tests that only check status codes",
    language: "typescript",
    code: `describe("API endpoints", () => {
  it("GET /users returns 200", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(200);
  });

  it("POST /users returns 201", async () => {
    const res = await request(app).post("/users").send({ name: "Test" });
    expect(res.statusCode).toBe(201);
  });

  it("DELETE /users/1 returns 204", async () => {
    const res = await request(app).delete("/users/1");
    expect(res.status).toBe(204);
  });
});`,
    expectedRuleIds: ["TEST-011"],
    category: "ai-test-quality",
    difficulty: "medium",
    aiSource: "gpt-4",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  HALLU — Dependency confusion patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-hallu-dependency-confusion",
    description: "AI generates import of internal-looking unscoped package name",
    language: "typescript",
    code: `import { authenticate } from "auth-service-internal";
import { getConfig } from "config-core-api";
import { logger } from "logging-backend-sdk";

export async function handleRequest(req: Request) {
  const config = getConfig("production");
  const user = await authenticate(req.headers.authorization);
  logger.info("Request handled", { userId: user.id });
  return { status: "ok" };
}`,
    expectedRuleIds: ["HALLU-001"],
    category: "ai-dependency-confusion",
    difficulty: "hard",
    aiSource: "claude",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  NEGATIVE — Clean AI-generated code (should NOT flag)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ai-negative-clean-auth-middleware",
    description: "Correct authentication middleware — should NOT flag logic errors",
    language: "typescript",
    code: `export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["LOGIC-001", "LOGIC-005", "LOGIC-006"],
    category: "ai-negative",
    difficulty: "easy",
    aiSource: "gpt-4",
  },
  {
    id: "ai-negative-clean-error-handling",
    description: "Proper error handling with logging — should NOT flag empty catch",
    language: "typescript",
    code: `export async function processOrder(orderId: string) {
  try {
    const order = await db.findOrder(orderId);
    if (!order) throw new Error("Order not found");

    await paymentGateway.charge(order.amount);
    await db.updateOrder(orderId, { status: "paid" });

    return { success: true };
  } catch (error) {
    logger.error("Order processing failed", { orderId, error });
    await db.updateOrder(orderId, { status: "failed" });
    throw error;
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["LOGIC-003", "LOGIC-006"],
    category: "ai-negative",
    difficulty: "easy",
    aiSource: "claude",
  },
  {
    id: "ai-negative-clean-validation",
    description: "Proper input validation function — should NOT flag name mismatch",
    language: "typescript",
    code: `export function validateUserInput(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const { name, email, age } = data as Record<string, unknown>;

  if (typeof name !== "string" || name.length < 2) {
    errors.push("Name must be at least 2 characters");
  }
  if (typeof email !== "string" || !email.includes("@")) {
    errors.push("Invalid email format");
  }
  if (typeof age !== "number" || age < 0 || age > 150) {
    errors.push("Age must be between 0 and 150");
  }

  return { valid: errors.length === 0, errors };
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["LOGIC-004"],
    category: "ai-negative",
    difficulty: "easy",
    aiSource: "copilot",
  },
];
