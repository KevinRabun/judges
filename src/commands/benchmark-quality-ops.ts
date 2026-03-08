import type { BenchmarkCase } from "./benchmark.js";

/**
 * Code quality, error handling, database patterns, concurrency, testing,
 * performance, observability, and DevOps benchmark cases.
 *
 * Covers ERR, DB, CONC, TEST, PERF, OBS, MAINT, DOC, CICD prefixes.
 */
export const BENCHMARK_QUALITY_OPS: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  Error Handling — ERR prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "err-deep-empty-catch-java",
    description: "Java code with multiple empty catch blocks",
    language: "java",
    code: `public class DataProcessor {
    public void process(String input) {
        try {
            int value = Integer.parseInt(input);
            data.add(value);
        } catch (NumberFormatException e) {
        }
        try {
            File f = new File(input);
            FileInputStream fis = new FileInputStream(f);
            byte[] buffer = new byte[1024];
            fis.read(buffer);
        } catch (IOException e) {
        }
        try {
            URL url = new URL(input);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.getResponseCode();
        } catch (Exception e) {
        }
    }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "err-deep-go-ignored-errors",
    description: "Go code that systematically ignores error returns",
    language: "go",
    code: `package main

import (
  "database/sql"
  "encoding/json"
  "net/http"
  "os"
)

func loadConfig() map[string]string {
  data, _ := os.ReadFile("config.json")
  var config map[string]string
  json.Unmarshal(data, &config)
  return config
}

func saveRecord(db *sql.DB, name string) {
  db.Exec("INSERT INTO records (name) VALUES (?)", name)
}

func sendNotification(url string, payload []byte) {
  http.Post(url, "application/json", bytes.NewReader(payload))
}

func closeResources(db *sql.DB, f *os.File) {
  db.Close()
  f.Close()
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-deep-python-bare-except",
    description: "Python code with bare except clauses hiding exceptions",
    language: "python",
    code: `import json
import requests

def fetch_user_data(user_id):
    try:
        response = requests.get(f"https://api.example.com/users/{user_id}")
        return response.json()
    except:
        return None

def parse_config(path):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return {}

def process_batch(items):
    results = []
    for item in items:
        try:
            result = transform(item)
            results.append(result)
        except:
            pass
    return results`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "err-deep-kotlin-bang-bang",
    description: "Kotlin code with excessive !! (non-null assertion)",
    language: "kotlin",
    code: `class UserService(private val repository: UserRepository) {
    fun getUserName(id: String): String {
        val user = repository.findById(id)
        return user!!.profile!!.displayName!!.trim()
    }

    fun getOrderTotal(orderId: String): Double {
        val order = orderRepo.findById(orderId)
        val items = order!!.items!!
        return items.sumOf { it!!.price!! * it!!.quantity!! }
    }

    fun processPayment(userId: String) {
        val user = repository.findById(userId)
        val card = user!!.paymentMethods!!.first()!!
        paymentGateway.charge(card.token!!, cart!!.total!!)
    }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-deep-async-no-catch",
    description: "Promise chains and async operations without error handling",
    language: "typescript",
    code: `async function syncUserData(userId: string) {
  const user = await fetchUser(userId);
  const orders = await fetchOrders(userId);
  const recommendations = await fetchRecommendations(userId);

  await updateCache(user);
  await sendAnalytics({ user, orderCount: orders.length });
  await notifyServices(user);
}

function processQueue() {
  getMessages().then(messages => {
    messages.forEach(msg => {
      processMessage(msg).then(() => {
        deleteMessage(msg.id);
      });
    });
  });
}

setInterval(() => {
  cleanupExpiredSessions();
  rotateLogFiles();
  sendHeartbeat();
}, 60000);`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-deep-throw-strings",
    description: "Throwing string literals instead of Error objects",
    language: "typescript",
    code: `function validateAge(age: number): void {
  if (age < 0) throw "Age cannot be negative";
  if (age > 150) throw "Invalid age value";
}

function connectDatabase(url: string): void {
  if (!url) throw "Database URL is required";
  if (!url.startsWith("postgres://")) throw "Only PostgreSQL is supported";
}

async function processPayment(amount: number): Promise<void> {
  if (amount <= 0) throw "Invalid payment amount";
  if (amount > 10000) throw "Amount exceeds maximum";
  const result = await chargeCard(amount);
  if (!result.success) throw "Payment failed: " + result.error;
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "err-deep-process-exit",
    description: "Using process.exit instead of proper error propagation",
    language: "typescript",
    code: `import fs from "fs";

function loadConfig(path: string) {
  if (!fs.existsSync(path)) {
    console.error("Config file not found");
    process.exit(1);
  }
  const data = fs.readFileSync(path, "utf8");
  const config = JSON.parse(data);
  if (!config.apiKey) {
    console.error("API key missing");
    process.exit(1);
  }
  if (!config.dbUrl) {
    console.error("Database URL missing");
    process.exit(1);
  }
  return config;
}

function connectDatabase(url: string) {
  try {
    return new Database(url);
  } catch (e) {
    console.error("DB connection failed");
    process.exit(1);
  }
}`,
    expectedRuleIds: [],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-deep-java-catch-throwable",
    description: "Java code catching Throwable instead of specific exceptions",
    language: "java",
    code: `public class WorkerService {
    public void executeTask(Runnable task) {
        try {
            task.run();
        } catch (Throwable t) {
            logger.error("Task failed", t);
        }
    }

    public Object processRequest(Request req) {
        try {
            validate(req);
            return handle(req);
        } catch (Throwable t) {
            return new ErrorResponse("Internal error");
        }
    }

    public void cleanupResources() {
        try {
            closeConnections();
            flushBuffers();
        } catch (Throwable t) {
            // swallow
        }
    }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-deep-stack-trace-exposure",
    description: "Stack traces exposed in HTTP responses",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.get("/api/data", async (req, res) => {
  try {
    const data = await fetchData(req.query.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      details: error,
    });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).json({
    message: err.message,
    stack: err.stack,
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Database — DB prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "db-deep-select-star-views",
    description: "SELECT * across multiple queries in data access layer",
    language: "typescript",
    code: `import { Pool } from "pg";

const pool = new Pool();

export async function getUsers() {
  const result = await pool.query("SELECT * FROM users");
  return result.rows;
}

export async function getUserOrders(userId: string) {
  const result = await pool.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
  return result.rows;
}

export async function getProductDetails(productId: string) {
  const products = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
  const reviews = await pool.query("SELECT * FROM reviews WHERE product_id = $1", [productId]);
  return { product: products.rows[0], reviews: reviews.rows };
}

export async function getDashboardData() {
  const users = await pool.query("SELECT * FROM users LIMIT 100");
  const orders = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50");
  const products = await pool.query("SELECT * FROM products WHERE active = true");
  return { users: users.rows, orders: orders.rows, products: products.rows };
}`,
    expectedRuleIds: ["DB-001"],
    category: "database",
    difficulty: "easy",
  },
  {
    id: "db-deep-n-plus-one-orm",
    description: "N+1 query pattern in ORM loop",
    language: "typescript",
    code: `import { getRepository } from "typeorm";

async function getOrderSummaries() {
  const orders = await getRepository(Order).find();
  const summaries = [];
  for (const order of orders) {
    const customer = await getRepository(Customer).findOne({ where: { id: order.customerId } });
    const items = await getRepository(OrderItem).find({ where: { orderId: order.id } });
    for (const item of items) {
      const product = await getRepository(Product).findOne({ where: { id: item.productId } });
      item.productName = product?.name;
    }
    summaries.push({ order, customer, items });
  }
  return summaries;
}`,
    expectedRuleIds: [],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "db-deep-no-connection-pool",
    description: "Creating new database connections per request without pooling",
    language: "typescript",
    code: `import { Client } from "pg";
import express from "express";

const app = express();

app.get("/users", async (req, res) => {
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const result = await client.query("SELECT id, name FROM users");
  await client.end();
  res.json(result.rows);
});

app.get("/orders/:id", async (req, res) => {
  const client = new Client({ connectionString: process.env.DB_URL });
  await client.connect();
  const result = await client.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  await client.end();
  res.json(result.rows[0]);
});`,
    expectedRuleIds: [],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "db-deep-destructive-ddl",
    description: "Destructive DDL operations in application code",
    language: "typescript",
    code: `import { Pool } from "pg";
const pool = new Pool();

async function resetDatabase() {
  await pool.query("DROP TABLE IF EXISTS users CASCADE");
  await pool.query("DROP TABLE IF EXISTS orders CASCADE");
  await pool.query("DROP TABLE IF EXISTS products CASCADE");
  await pool.query("TRUNCATE TABLE audit_log");
  console.log("Database reset complete");
}

async function migrateSchema() {
  await pool.query("ALTER TABLE users DROP COLUMN legacy_id");
  await pool.query("ALTER TABLE orders DROP COLUMN old_status");
  await pool.query("DELETE FROM sessions");
}`,
    expectedRuleIds: ["DB-001"],
    category: "database",
    difficulty: "easy",
  },
  {
    id: "db-deep-no-transactions",
    description: "Multi-step database operations without transaction boundaries",
    language: "typescript",
    code: `import { Pool } from "pg";
const pool = new Pool();

async function transferFunds(fromId: string, toId: string, amount: number) {
  await pool.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, fromId]);
  await pool.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, toId]);
  await pool.query(
    "INSERT INTO transactions (from_id, to_id, amount) VALUES ($1, $2, $3)",
    [fromId, toId, amount]
  );
}

async function createOrder(userId: string, items: any[]) {
  const order = await pool.query(
    "INSERT INTO orders (user_id, status) VALUES ($1, 'pending') RETURNING id",
    [userId]
  );
  for (const item of items) {
    await pool.query(
      "INSERT INTO order_items (order_id, product_id, qty) VALUES ($1, $2, $3)",
      [order.rows[0].id, item.productId, item.qty]
    );
    await pool.query(
      "UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
      [item.qty, item.productId]
    );
  }
}`,
    expectedRuleIds: ["DB-001"],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "db-deep-raw-sql-orm-bypass",
    description: "Raw SQL queries bypassing ORM safety features",
    language: "python",
    code: `from django.db import connection

def search_products(query, category):
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT * FROM products WHERE name LIKE '%{query}%' AND category = '{category}'"
        )
        return cursor.fetchall()

def delete_old_orders(days):
    with connection.cursor() as cursor:
        cursor.execute(
            f"DELETE FROM orders WHERE created_at < NOW() - INTERVAL '{days} days'"
        )
        return cursor.rowcount

def update_prices(multiplier, category):
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE products SET price = price * {multiplier} WHERE category = '{category}'"
        )`,
    expectedRuleIds: ["DB-001", "CYBER-001"],
    category: "database",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Concurrency — CONC prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "conc-deep-unbounded-promise-all",
    description: "Unbounded Promise.all processing thousands of items",
    language: "typescript",
    code: `async function processAllUsers(userIds: string[]) {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const user = await fetchUser(id);
      const enriched = await enrichUserData(user);
      await saveToCache(enriched);
      return enriched;
    })
  );
  return results;
}

async function sendBulkNotifications(users: User[]) {
  await Promise.all(
    users.map(user =>
      sendEmail(user.email, "Monthly Update", generateNewsletter(user))
    )
  );
}`,
    expectedRuleIds: [],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-deep-shared-mutable-state",
    description: "Shared mutable state accessed from async handlers",
    language: "typescript",
    code: `import express from "express";

let requestCount = 0;
const userSessions: Record<string, any> = {};
let lastRequestTime = Date.now();
const rateLimits: Record<string, number> = {};

const app = express();

app.use((req, res, next) => {
  requestCount++;
  lastRequestTime = Date.now();
  const ip = req.ip!;
  rateLimits[ip] = (rateLimits[ip] || 0) + 1;
  next();
});

app.post("/login", (req, res) => {
  userSessions[req.body.userId] = {
    token: generateToken(),
    loginTime: Date.now(),
  };
  res.json({ success: true });
});

app.get("/stats", (req, res) => {
  res.json({ requestCount, lastRequestTime, activeSessions: Object.keys(userSessions).length });
});`,
    expectedRuleIds: [],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-deep-go-unsync-map",
    description: "Go map accessed concurrently without synchronization",
    language: "go",
    code: `package main

import (
  "net/http"
  "encoding/json"
)

var cache = make(map[string]string)
var counters = make(map[string]int)

func getHandler(w http.ResponseWriter, r *http.Request) {
  key := r.URL.Query().Get("key")
  value, ok := cache[key]
  counters[key]++
  if ok {
    json.NewEncoder(w).Encode(map[string]string{"value": value})
  } else {
    http.Error(w, "Not found", 404)
  }
}

func setHandler(w http.ResponseWriter, r *http.Request) {
  key := r.URL.Query().Get("key")
  value := r.URL.Query().Get("value")
  cache[key] = value
  counters[key] = 0
  w.WriteHeader(200)
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-deep-sequential-await-loop",
    description: "Sequential awaits in loop that should be parallelized",
    language: "typescript",
    code: `async function fetchAllPrices(productIds: string[]) {
  const prices = [];
  for (const id of productIds) {
    const price = await fetchPrice(id);
    prices.push({ id, price });
  }
  return prices;
}

async function validateAddresses(addresses: Address[]) {
  const results = [];
  for (const addr of addresses) {
    const valid = await geocodeAddress(addr);
    const normalized = await normalizeAddress(addr);
    results.push({ ...addr, valid, normalized });
  }
  return results;
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "easy",
  },
  {
    id: "conc-deep-setinterval-no-clear",
    description: "setInterval without cleanup causing resource leaks",
    language: "typescript",
    code: `class DashboardWidget {
  private data: any[] = [];

  start() {
    setInterval(() => {
      this.data = fetchLatestData();
    }, 5000);

    setInterval(() => {
      this.refreshUI();
    }, 1000);

    setInterval(() => {
      sendHeartbeat();
    }, 30000);
  }

  refreshUI() {
    document.getElementById("data")!.innerHTML = JSON.stringify(this.data);
  }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "easy",
  },
  {
    id: "conc-deep-missing-await",
    description: "Missing await on async calls causing fire-and-forget",
    language: "typescript",
    code: `async function handleOrder(order: Order) {
  validateOrder(order);
  saveOrder(order);
  sendConfirmationEmail(order.userEmail, order);
  updateInventory(order.items);
  notifyShipping(order);
  logAnalytics("order_placed", order.id);
}

async function cleanup(userId: string) {
  deleteUserSessions(userId);
  clearUserCache(userId);
  revokeTokens(userId);
}`,
    expectedRuleIds: [],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-deep-read-modify-write",
    description: "Read-modify-write race condition on shared counter",
    language: "typescript",
    code: `import express from "express";
import Redis from "ioredis";

const redis = new Redis();
const app = express();

app.post("/like/:postId", async (req, res) => {
  const key = \`likes:\${req.params.postId}\`;
  const current = await redis.get(key);
  const newCount = (parseInt(current || "0")) + 1;
  await redis.set(key, newCount.toString());
  res.json({ likes: newCount });
});

app.post("/inventory/reserve", async (req, res) => {
  const stock = await redis.get(\`stock:\${req.body.productId}\`);
  const available = parseInt(stock || "0");
  if (available >= req.body.quantity) {
    await redis.set(\`stock:\${req.body.productId}\`, (available - req.body.quantity).toString());
    res.json({ reserved: true });
  } else {
    res.json({ reserved: false });
  }
});`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Performance — PERF prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "perf-deep-sync-file-io",
    description: "Synchronous file I/O in async Node.js application",
    language: "typescript",
    code: `import fs from "fs";
import express from "express";

const app = express();

app.get("/config/:key", (req, res) => {
  const data = fs.readFileSync("config.json", "utf8");
  const config = JSON.parse(data);
  res.json({ value: config[req.params.key] });
});

app.post("/upload", (req, res) => {
  const filename = \`uploads/\${Date.now()}.dat\`;
  fs.writeFileSync(filename, req.body);
  const stats = fs.statSync(filename);
  res.json({ size: stats.size });
});

app.get("/logs", (req, res) => {
  const files = fs.readdirSync("logs/");
  const contents = files.map(f => fs.readFileSync(\`logs/\${f}\`, "utf8"));
  res.json(contents);
});`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "perf-deep-nested-loops-search",
    description: "O(n^3) nested loops for data matching",
    language: "typescript",
    code: `function findCommonItems(
  listA: Product[],
  listB: Product[],
  listC: Product[]
): Product[] {
  const common: Product[] = [];
  for (const a of listA) {
    for (const b of listB) {
      for (const c of listC) {
        if (a.sku === b.sku && b.sku === c.sku) {
          common.push(a);
        }
      }
    }
  }
  return common;
}

function deduplicateByField(items: any[], field: string): any[] {
  const result: any[] = [];
  for (const item of items) {
    let found = false;
    for (const existing of result) {
      if (existing[field] === item[field]) {
        found = true;
        break;
      }
    }
    if (!found) result.push(item);
  }
  return result;
}`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "perf-deep-memory-leak-closures",
    description: "Memory leak via growing array in closure without bounds",
    language: "typescript",
    code: `class EventTracker {
  private events: any[] = [];
  private listeners: Function[] = [];

  track(event: any) {
    this.events.push(event);
    this.listeners.forEach(fn => fn(event));
  }

  addListener(fn: Function) {
    this.listeners.push(fn);
  }

  getHistory() {
    return [...this.events];
  }
}

const tracker = new EventTracker();

setInterval(() => {
  tracker.track({
    type: "heartbeat",
    timestamp: Date.now(),
    memory: process.memoryUsage(),
  });
}, 1000);`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "perf-deep-regex-in-loop",
    description: "RegExp compilation inside hot loop",
    language: "typescript",
    code: `function sanitizeAll(inputs: string[]): string[] {
  return inputs.map(input => {
    input = input.replace(new RegExp("<script[^>]*>.*?</script>", "gi"), "");
    input = input.replace(new RegExp("<[^>]+>", "g"), "");
    input = input.replace(new RegExp("&[a-z]+;", "gi"), "");
    input = input.replace(new RegExp("[^a-zA-Z0-9 .,!?-]", "g"), "");
    return input.trim();
  });
}`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "perf-deep-unbuffered-writes",
    description: "Writing to file line-by-line without buffering",
    language: "python",
    code: `def export_large_dataset(records, output_path):
    with open(output_path, 'w') as f:
        for record in records:
            line = ','.join(str(v) for v in record.values())
            f.write(line + '\\n')
            f.flush()

def generate_report(data, report_path):
    for section in data:
        with open(report_path, 'a') as f:
            f.write(f"## {section['title']}\\n")
            for row in section['rows']:
                f.write(f"- {row}\\n")`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Maintainability — MAINT prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "maint-deep-magic-numbers-config",
    description: "Magic numbers throughout business logic",
    language: "typescript",
    code: `function calculateShipping(weight: number, distance: number): number {
  if (weight < 2.5) return 5.99;
  if (weight < 10) return 12.49;
  if (weight < 25) return 24.99;
  if (distance > 500) return weight * 0.85 + 15.0;
  if (distance > 1000) return weight * 1.25 + 25.0;
  return weight * 0.45 + 8.99;
}

function calculateDiscount(total: number, loyaltyYears: number): number {
  if (total > 500 && loyaltyYears >= 3) return total * 0.15;
  if (total > 200 && loyaltyYears >= 1) return total * 0.10;
  if (total > 100) return total * 0.05;
  return 0;
}

function isEligible(age: number, score: number): boolean {
  return age >= 18 && age <= 65 && score >= 720 && score <= 850;
}

function calculateTax(amount: number, region: string): number {
  if (region === "CA") return amount * 0.0725;
  if (region === "NY") return amount * 0.08;
  if (region === "TX") return amount * 0.0625;
  return amount * 0.05;
}

function retryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 500;
}`,
    expectedRuleIds: [],
    category: "maintainability",
    difficulty: "easy",
  },
  {
    id: "maint-deep-todo-fixme-dump",
    description: "Code littered with TODO and FIXME comments",
    language: "typescript",
    code: `// TODO: implement proper authentication
// TODO: add rate limiting
// FIXME: this crashes on empty input
export function processRequest(data: any) {
  // TODO: validate input schema
  // FIXME: SQL injection vulnerability
  const result = db.query(\`SELECT * FROM items WHERE id = '\${data.id}'\`);
  // TODO: handle errors properly
  // FIXME: memory leak here
  cache.set(data.id, result);
  // TODO: add logging
  // TODO: implement retry logic
  // FIXME: race condition on concurrent requests
  return result;
}

// TODO: refactor this entire module
// TODO: add unit tests
// FIXME: performance degrades with large datasets
// TODO: extract into separate service
// TODO: add metrics/monitoring
// FIXME: timezone handling is broken
// TODO: support pagination
export function getReport() {
  // TODO: cache this query
  return db.query("SELECT * FROM reports");
}`,
    expectedRuleIds: [],
    category: "maintainability",
    difficulty: "easy",
  },
  {
    id: "maint-deep-deep-nesting",
    description: "Deeply nested control flow with excessive indentation",
    language: "typescript",
    code: `function processOrder(order: any, user: any, config: any) {
  if (order) {
    if (order.items && order.items.length > 0) {
      if (user) {
        if (user.isActive) {
          if (user.subscription) {
            if (user.subscription.tier === "premium") {
              if (order.total > 0) {
                if (config.paymentEnabled) {
                  if (user.paymentMethod) {
                    if (user.paymentMethod.isValid) {
                      if (order.shippingAddress) {
                        if (isValidAddress(order.shippingAddress)) {
                          if (checkInventory(order.items)) {
                            return submitOrder(order, user);
                          } else {
                            return { error: "Out of stock" };
                          }
                        } else {
                          return { error: "Invalid address" };
                        }
                      } else {
                        return { error: "No shipping address" };
                      }
                    } else {
                      return { error: "Invalid payment" };
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return { error: "Invalid order" };
}`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "easy",
  },
  {
    id: "maint-deep-var-keyword",
    description: "Using var instead of let/const in modern TypeScript",
    language: "typescript",
    code: `var express = require("express");
var app = express();
var PORT = 3000;
var users = [];

app.get("/users", function(req, res) {
  var result = [];
  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    var formatted = { name: user.name, email: user.email };
    result.push(formatted);
  }
  res.json(result);
});

app.post("/users", function(req, res) {
  var newUser = req.body;
  var id = users.length + 1;
  newUser.id = id;
  users.push(newUser);
  res.json(newUser);
});`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Documentation — DOC prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "doc-deep-undocumented-public-api",
    description: "Public API module with no documentation on exported functions",
    language: "typescript",
    code: `export function crPr(d: any, o: any): any {
  const r = vldOrd(d);
  if (!r.ok) return r;
  const t = clcTtl(d.items, o.disc);
  return { id: genId(), total: t, items: d.items };
}

export function prcRfnd(oid: string, amt: number, rsn: string): any {
  const o = gtOrd(oid);
  if (!o) return null;
  if (amt > o.total) return { err: "exceeds" };
  return updOrd(oid, { rfnd: amt, st: "refunded" });
}

export function gtMtrcs(sd: string, ed: string, f: any): any {
  const d = qryDb(sd, ed, f);
  return { cnt: d.length, avg: clcAvg(d), p95: clcP95(d) };
}

export function updCfg(k: string, v: any, ns: string): boolean {
  if (!vldK(k)) return false;
  return stCfg(ns, k, v);
}

export function bchPrc(items: any[], opts: any): any[] {
  return items.map(i => prcItm(i, opts));
}`,
    expectedRuleIds: ["DOC-001"],
    category: "documentation",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Testing — TEST prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "test-deep-untestable-singleton",
    description: "Untestable singleton with hardcoded dependencies",
    language: "typescript",
    code: `import axios from "axios";
import fs from "fs";

class AppService {
  private static instance: AppService;
  private cache = new Map<string, any>();

  private constructor() {
    const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    setInterval(() => this.cleanup(), 60000);
  }

  static getInstance(): AppService {
    if (!AppService.instance) {
      AppService.instance = new AppService();
    }
    return AppService.instance;
  }

  async fetchData(id: string) {
    if (this.cache.has(id)) return this.cache.get(id);
    const response = await axios.get(\`\${this.apiUrl}/data/\${id}\`, {
      headers: { "x-api-key": this.apiKey },
    });
    this.cache.set(id, response.data);
    return response.data;
  }

  private apiUrl: string;
  private apiKey: string;
  private cleanup() { this.cache.clear(); }
}`,
    expectedRuleIds: [],
    category: "testing",
    difficulty: "medium",
  },
  {
    id: "test-deep-global-state-tests",
    description: "Tests relying on global mutable state and execution order",
    language: "typescript",
    code: `let testDb: any;
let testUser: any;

describe("UserService", () => {
  it("should create a user", async () => {
    testDb = await connectToTestDb();
    testUser = await userService.create({ name: "Test", email: "test@example.com" });
    expect(testUser.id).toBeDefined();
  });

  it("should update the user", async () => {
    const updated = await userService.update(testUser.id, { name: "Updated" });
    expect(updated.name).toBe("Updated");
    testUser = updated;
  });

  it("should find the user", async () => {
    const found = await userService.findById(testUser.id);
    expect(found.name).toBe("Updated");
  });

  it("should delete the user", async () => {
    await userService.delete(testUser.id);
    const found = await userService.findById(testUser.id);
    expect(found).toBeNull();
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Observability — OBS prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "obs-deep-console-log-only",
    description: "Application uses only console.log for all observability",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.use((req, res, next) => {
  console.log("Request:", req.method, req.url);
  next();
});

app.get("/api/users", async (req, res) => {
  console.log("Fetching users...");
  try {
    const users = await db.query("SELECT * FROM users");
    console.log("Found", users.length, "users");
    res.json(users);
  } catch (e) {
    console.log("ERROR:", e);
    res.status(500).send("Error");
  }
});

app.post("/api/orders", async (req, res) => {
  console.log("Creating order:", JSON.stringify(req.body));
  const start = Date.now();
  const order = await createOrder(req.body);
  console.log("Order created in", Date.now() - start, "ms");
  console.log("Order ID:", order.id);
  res.json(order);
});`,
    expectedRuleIds: ["OBS-001"],
    category: "observability",
    difficulty: "easy",
  },
  {
    id: "obs-deep-no-health-check",
    description: "Server with no health check or readiness endpoints",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());

app.get("/api/products", async (req, res) => {
  const products = await db.findAll("products");
  res.json(products);
});

app.post("/api/orders", async (req, res) => {
  const order = await db.create("orders", req.body);
  res.json(order);
});

app.listen(8080, () => {
  console.log("Server running");
});`,
    expectedRuleIds: [],
    category: "observability",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CI/CD — CICD prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cicd-deep-insecure-workflow-patterns",
    description: "GitHub Actions workflow with multiple security issues",
    language: "yaml",
    code: `name: Deploy
on:
  pull_request_target:
    types: [opened]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: echo "PR title is \${{ github.event.pull_request.title }}"
      - run: npm install && npm run build
      - run: |
          curl -X POST https://deploy.example.com/api/deploy \\
            -H "Authorization: Bearer \${{ secrets.DEPLOY_TOKEN }}" \\
            -d '{"sha": "\${{ github.sha }}"}'
      - run: echo "$\{{ secrets.AWS_SECRET_KEY }}" > /tmp/key`,
    expectedRuleIds: [],
    category: "cicd",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Software Practices — SWDEV prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "swdev-deep-weak-types",
    description: "Excessive use of 'any' type in TypeScript code",
    language: "typescript",
    code: `export function processData(data: any): any {
  const result: any = {};
  const items: any[] = data.items || [];
  items.forEach((item: any) => {
    const key: any = item.id;
    const value: any = transform(item);
    result[key] = value;
  });
  return result;
}

export function handleEvent(event: any): any {
  const payload: any = event.data;
  const meta: any = event.metadata;
  const config: any = getConfig();
  return merge(payload, meta, config);
}

export function createService(options: any): any {
  const client: any = new HttpClient(options);
  const cache: any = new Cache(options);
  return { client, cache, options };
}

export function validateInput(input: any): any {
  if (typeof input !== "object") return { valid: false };
  const errors: any[] = [];
  Object.keys(input).forEach((key: any) => {
    const rule: any = rules[key];
    if (rule && !rule.test(input[key])) {
      errors.push({ field: key, message: rule.message });
    }
  });
  return { valid: errors.length === 0, errors };
}`,
    expectedRuleIds: ["SWDEV-001"],
    category: "software-practices",
    difficulty: "easy",
  },
  {
    id: "swdev-deep-linter-suppression",
    description: "Excessive eslint-disable comments throughout the code",
    language: "typescript",
    code: `/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// eslint-disable-next-line no-console
console.log("Starting application");

export function handler(req: any, res: any) {
  // eslint-disable-next-line no-eval
  const result = eval(req.body.expression);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data = JSON.parse(req.body.data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return data;
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import brokenModule from "./broken";

export function process(input) { // eslint-disable-line @typescript-eslint/explicit-function-return-type
  // eslint-disable-next-line no-prototype-builtins
  if (input.hasOwnProperty("key")) {
    return input.key;
  }
}`,
    expectedRuleIds: ["SWDEV-001"],
    category: "software-practices",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Structure — STRUCT prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "struct-deep-god-file",
    description: "Monolithic file handling routing, auth, DB, email, and caching",
    language: "typescript",
    code: `import express from "express";
import nodemailer from "nodemailer";
import Redis from "ioredis";

const app = express();
const redis = new Redis();
app.use(express.json());

// Authentication
function hashPassword(pw: string) { return require("crypto").createHash("sha256").update(pw).digest("hex"); }
function createToken(user: any) { return Buffer.from(JSON.stringify(user)).toString("base64"); }

// Database
const users: any[] = [];
const orders: any[] = [];
const products: any[] = [];

// Routes
app.post("/register", (req, res) => {
  const user = { ...req.body, password: hashPassword(req.body.password), id: users.length + 1 };
  users.push(user);
  const transporter = nodemailer.createTransport({ host: "smtp.example.com" });
  transporter.sendMail({ to: user.email, subject: "Welcome", text: "Hello!" });
  redis.set(\`user:\${user.id}\`, JSON.stringify(user));
  res.json({ token: createToken(user) });
});

app.post("/orders", (req, res) => {
  const order = { ...req.body, id: orders.length + 1 };
  orders.push(order);
  order.items.forEach((item: any) => {
    const product = products.find((p: any) => p.id === item.productId);
    if (product) product.stock -= item.qty;
  });
  const transporter = nodemailer.createTransport({ host: "smtp.example.com" });
  transporter.sendMail({ to: req.body.email, subject: "Order Confirmation", text: "Your order is confirmed!" });
  redis.set(\`order:\${order.id}\`, JSON.stringify(order));
  res.json(order);
});

app.get("/products", (req, res) => { res.json(products); });
app.get("/users", (req, res) => { res.json(users.map(u => ({ id: u.id, name: u.name }))); });`,
    expectedRuleIds: [],
    category: "structure",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEAN CODE — FP Validation (quality/ops patterns)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clean-err-proper-error-handling",
    description: "Clean: Proper error handling with specific catch and error types",
    language: "typescript",
    code: `export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(\`\${resource} \${id} not found\`, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(public readonly errors: Array<{ field: string; message: string }>) {
    super("Validation failed", "VALIDATION_ERROR", 400);
  }
}

export async function getUserById(id: string): Promise<User> {
  try {
    const user = await db.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User", id);
    return user;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Failed to fetch user", "DB_ERROR");
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-db-transaction-pattern",
    description: "Clean: Database operations with proper transactions",
    language: "typescript",
    code: `import { Pool, PoolClient } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function transferFunds(fromId: string, toId: string, amount: number) {
  return withTransaction(async (client) => {
    const from = await client.query("SELECT balance FROM accounts WHERE id = $1 FOR UPDATE", [fromId]);
    if (from.rows[0].balance < amount) throw new Error("Insufficient funds");
    await client.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [amount, fromId]);
    await client.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, toId]);
    await client.query(
      "INSERT INTO transfers (from_id, to_id, amount) VALUES ($1, $2, $3)",
      [fromId, toId, amount]
    );
    return { success: true };
  });
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-conc-bounded-parallel",
    description: "Clean: Bounded parallel task execution with p-limit",
    language: "typescript",
    code: `import pLimit from "p-limit";

const limit = pLimit(10);

export async function processItems(items: Item[]): Promise<Result[]> {
  const tasks = items.map(item =>
    limit(async () => {
      const result = await processItem(item);
      return result;
    })
  );
  return Promise.all(tasks);
}

export async function fetchAllPages(urls: string[]): Promise<PageData[]> {
  const concurrency = pLimit(5);
  const results = await Promise.allSettled(
    urls.map(url =>
      concurrency(async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        return response.json();
      })
    )
  );
  return results
    .filter((r): r is PromiseFulfilledResult<PageData> => r.status === "fulfilled")
    .map(r => r.value);
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-perf-efficient-lookup",
    description: "Clean: Efficient data lookup with Map and Set",
    language: "typescript",
    code: `export function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function indexByField<T>(items: T[], field: keyof T): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const key = String(item[field]);
    const group = index.get(key) ?? [];
    group.push(item);
    index.set(key, group);
  }
  return index;
}

export function findCommon<T extends { sku: string }>(
  listA: T[], listB: T[], listC: T[]
): T[] {
  const setB = new Set(listB.map(b => b.sku));
  const setC = new Set(listC.map(c => c.sku));
  return listA.filter(a => setB.has(a.sku) && setC.has(a.sku));
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-obs-structured-logging",
    description: "Clean: Structured logging with proper log levels",
    language: "typescript",
    code: `import pino from "pino";
import express from "express";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  serializers: pino.stdSerializers,
});

const app = express();

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Math.round(duration),
    }, "request completed");
  });
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/ready", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (error) {
    logger.error({ error }, "readiness check failed");
    res.status(503).json({ status: "not ready" });
  }
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-maint-named-constants",
    description: "Clean: Named constants instead of magic numbers",
    language: "typescript",
    code: `const SHIPPING_RATES = {
  LIGHT_MAX_WEIGHT_KG: 2.5,
  LIGHT_RATE: 5.99,
  MEDIUM_MAX_WEIGHT_KG: 10,
  MEDIUM_RATE: 12.49,
  HEAVY_MAX_WEIGHT_KG: 25,
  HEAVY_RATE: 24.99,
  LONG_DISTANCE_KM: 500,
  LONG_DISTANCE_SURCHARGE: 15.0,
} as const;

const ELIGIBILITY = {
  MIN_AGE: 18,
  MAX_AGE: 65,
  MIN_CREDIT_SCORE: 720,
  MAX_CREDIT_SCORE: 850,
} as const;

function calculateShipping(weightKg: number, distanceKm: number): number {
  if (weightKg < SHIPPING_RATES.LIGHT_MAX_WEIGHT_KG) return SHIPPING_RATES.LIGHT_RATE;
  if (weightKg < SHIPPING_RATES.MEDIUM_MAX_WEIGHT_KG) return SHIPPING_RATES.MEDIUM_RATE;
  if (weightKg < SHIPPING_RATES.HEAVY_MAX_WEIGHT_KG) return SHIPPING_RATES.HEAVY_RATE;
  if (distanceKm > SHIPPING_RATES.LONG_DISTANCE_KM) {
    return weightKg * 0.85 + SHIPPING_RATES.LONG_DISTANCE_SURCHARGE;
  }
  return weightKg * 0.45 + SHIPPING_RATES.LIGHT_RATE;
}

function isEligible(age: number, creditScore: number): boolean {
  return (
    age >= ELIGIBILITY.MIN_AGE &&
    age <= ELIGIBILITY.MAX_AGE &&
    creditScore >= ELIGIBILITY.MIN_CREDIT_SCORE &&
    creditScore <= ELIGIBILITY.MAX_CREDIT_SCORE
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-test-isolated-tests",
    description: "Clean: Isolated test with proper setup/teardown",
    language: "typescript",
    code: `import { createTestDb, cleanupTestDb } from "./test-helpers";

describe("UserService", () => {
  let db: TestDb;
  let service: UserService;

  beforeEach(async () => {
    db = await createTestDb();
    service = new UserService(db);
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  it("should create a user with valid data", async () => {
    const user = await service.create({ name: "Alice", email: "alice@example.com" });
    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
  });

  it("should reject duplicate emails", async () => {
    await service.create({ name: "Alice", email: "alice@example.com" });
    await expect(
      service.create({ name: "Bob", email: "alice@example.com" })
    ).rejects.toThrow("Email already exists");
  });

  it("should return null for nonexistent user", async () => {
    const user = await service.findById("nonexistent-id");
    expect(user).toBeNull();
  });
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-go-proper-errors",
    description: "Clean: Go code with proper error handling and wrapping",
    language: "go",
    code: `package main

import (
  "database/sql"
  "encoding/json"
  "fmt"
  "os"
)

type Config struct {
  DBHost string \`json:"db_host"\`
  DBPort int    \`json:"db_port"\`
}

func loadConfig(path string) (*Config, error) {
  data, err := os.ReadFile(path)
  if err != nil {
    return nil, fmt.Errorf("reading config file: %w", err)
  }
  var config Config
  if err := json.Unmarshal(data, &config); err != nil {
    return nil, fmt.Errorf("parsing config JSON: %w", err)
  }
  return &config, nil
}

func saveRecord(db *sql.DB, name string) error {
  _, err := db.Exec("INSERT INTO records (name) VALUES ($1)", name)
  if err != nil {
    return fmt.Errorf("inserting record %q: %w", name, err)
  }
  return nil
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-python-proper-exceptions",
    description: "Clean: Python with specific exception handling and custom errors",
    language: "python",
    code: `import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

class ConfigError(Exception):
    pass

class ValidationError(Exception):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"{field}: {message}")

def load_config(path: str) -> dict[str, Any]:
    config_path = Path(path)
    if not config_path.exists():
        raise ConfigError(f"Config file not found: {path}")
    try:
        with open(config_path) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        raise ConfigError(f"Invalid JSON in {path}: {e}") from e
    required = ["api_url", "db_host"]
    missing = [k for k in required if k not in config]
    if missing:
        raise ConfigError(f"Missing required keys: {', '.join(missing)}")
    return config

def process_record(record: dict) -> dict:
    if not isinstance(record.get("name"), str) or len(record["name"]) < 1:
        raise ValidationError("name", "must be a non-empty string")
    if not isinstance(record.get("age"), int) or record["age"] < 0:
        raise ValidationError("age", "must be a non-negative integer")
    return {"processed": True, **record}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-doc-well-documented-api",
    description: "Clean: Well-documented TypeScript API with JSDoc",
    language: "typescript",
    code: `/**
 * User management service for handling CRUD operations.
 *
 * @example
 * const service = new UserService(database);
 * const user = await service.create({ name: "Alice", email: "alice@example.com" });
 */
export class UserService {
  constructor(private readonly db: Database) {}

  /**
   * Create a new user with the given details.
   *
   * @param data - The user creation payload
   * @returns The newly created user with generated ID
   * @throws {ValidationError} If email is invalid or name is empty
   * @throws {ConflictError} If email already exists
   */
  async create(data: CreateUserInput): Promise<User> {
    this.validate(data);
    return this.db.users.create({ data });
  }

  /**
   * Find a user by their unique identifier.
   *
   * @param id - The user's UUID
   * @returns The user if found, null otherwise
   */
  async findById(id: string): Promise<User | null> {
    return this.db.users.findUnique({ where: { id } });
  }

  /**
   * Update a user's profile information.
   *
   * @param id - The user's UUID
   * @param updates - Partial user data to merge
   * @returns The updated user
   * @throws {NotFoundError} If user does not exist
   */
  async update(id: string, updates: Partial<CreateUserInput>): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError("User", id);
    return this.db.users.update({ where: { id }, data: updates });
  }

  private validate(data: CreateUserInput): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("Name is required");
    }
    if (!data.email || !data.email.includes("@")) {
      throw new ValidationError("Valid email is required");
    }
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cicd-secure-workflow",
    description: "Clean: Secure GitHub Actions workflow with pinned actions",
    language: "yaml",
    code: `name: CI
on:
  push:
    branches: [main]
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
      - run: npm audit --audit-level=high`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-struct-modular-service",
    description: "Clean: Well-structured modular service with separation of concerns",
    language: "typescript",
    code: `// types.ts
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
}

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered";

// order-repository.ts
export class OrderRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Order | null> {
    return this.db.orders.findUnique({ where: { id }, include: { items: true } });
  }

  async create(data: CreateOrderInput): Promise<Order> {
    return this.db.orders.create({ data });
  }
}

// order-service.ts
export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly notifier: NotificationService,
    private readonly logger: Logger,
  ) {}

  async placeOrder(input: CreateOrderInput): Promise<Order> {
    const order = await this.repo.create(input);
    this.logger.info({ orderId: order.id }, "Order placed");
    await this.notifier.sendOrderConfirmation(order);
    return order;
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional Error Handling, DB, Testing, and Ops cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "err-swallowed-promise-ts",
    description: "Promises with .catch that swallows errors silently",
    language: "typescript",
    code: `async function sendNotification(userId: string, msg: string) {
  fetch("/api/notify", {
    method: "POST",
    body: JSON.stringify({ userId, msg }),
  }).catch(() => {});
}

async function logAudit(action: string) {
  db.query("INSERT INTO audit_log (action) VALUES ($1)", [action]).catch(() => {});
}

async function syncExternal() {
  fetch("https://partner-api.com/sync").catch(() => {});
}`,
    expectedRuleIds: [],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-generic-catch-all-py",
    description: "Python code catching bare Exception and returning None",
    language: "python",
    code: `def parse_config(path):
    try:
        with open(path) as f:
            return yaml.safe_load(f)
    except Exception:
        return None

def connect_database(url):
    try:
        return psycopg2.connect(url)
    except Exception:
        return None

def send_email(to, subject, body):
    try:
        smtp.send_message(to, subject, body)
    except Exception:
        pass`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "db-raw-queries-with-interpolation-ts",
    description: "TypeScript using string interpolation in SQL queries",
    language: "typescript",
    code: `async function searchProducts(name: string, category: string) {
  const query = \`SELECT * FROM products WHERE name LIKE '%\${name}%' AND category = '\${category}'\`;
  return db.query(query);
}

async function deleteUser(userId: string) {
  return db.query(\`DELETE FROM users WHERE id = '\${userId}'\`);
}`,
    expectedRuleIds: ["DB-001", "CYBER-001"],
    category: "database",
    difficulty: "easy",
  },
  {
    id: "db-missing-transaction-py",
    description: "Multi-step database operation without transaction boundaries",
    language: "python",
    code: `def transfer_funds(from_id, to_id, amount):
    from_balance = db.execute("SELECT balance FROM accounts WHERE id = %s", (from_id,)).fetchone()[0]
    if from_balance < amount:
        raise ValueError("Insufficient funds")
    db.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, from_id))
    db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_id))
    db.execute("INSERT INTO transfers (from_id, to_id, amount) VALUES (%s, %s, %s)", (from_id, to_id, amount))`,
    expectedRuleIds: [],
    category: "database",
    difficulty: "medium",
  },
  {
    id: "test-mocking-implementation-ts",
    description: "Tests that mock so heavily they test nothing real",
    language: "typescript",
    code: `describe("OrderService", () => {
  it("should create an order", async () => {
    const mockDb = { create: jest.fn().mockResolvedValue({ id: "1" }) };
    const mockPayment = { charge: jest.fn().mockResolvedValue({ success: true }) };
    const mockEmail = { send: jest.fn().mockResolvedValue(undefined) };
    const mockLogger = { info: jest.fn(), error: jest.fn() };
    const mockCache = { get: jest.fn(), set: jest.fn() };
    const mockMetrics = { increment: jest.fn() };
    const service = new OrderService(mockDb as any, mockPayment as any, mockEmail as any, mockLogger as any, mockCache as any, mockMetrics as any);
    const result = await service.createOrder({ item: "A", qty: 1 });
    expect(mockDb.create).toHaveBeenCalled();
  });
});`,
    expectedRuleIds: [],
    category: "testing",
    difficulty: "hard",
  },
  {
    id: "test-no-negative-tests-go",
    description: "Go test file with only positive cases, no error scenarios",
    language: "go",
    code: `package service

import "testing"

func TestCreateUser(t *testing.T) {
    user, err := svc.CreateUser("alice", "alice@example.com")
    if err != nil { t.Fatal(err) }
    if user.Name != "alice" { t.Fatalf("expected alice, got %s", user.Name) }
}

func TestGetUser(t *testing.T) {
    user, err := svc.GetUser("123")
    if err != nil { t.Fatal(err) }
    if user.ID != "123" { t.Fatalf("expected 123, got %s", user.ID) }
}

func TestListUsers(t *testing.T) {
    users, err := svc.ListUsers()
    if err != nil { t.Fatal(err) }
    if len(users) == 0 { t.Fatal("expected users") }
}`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },
  {
    id: "perf-regex-in-loop-py",
    description: "Compiling regex inside a tight loop instead of once",
    language: "python",
    code: `def extract_emails(texts):
    results = []
    for text in texts:
        import re
        pattern = re.compile(r'[\\w.+-]+@[\\w-]+\\.[\\w.]+')
        matches = pattern.findall(text)
        results.extend(matches)
    return results

def validate_phones(entries):
    valid = []
    for entry in entries:
        import re
        if re.match(r'^\\+?1?\\d{9,15}$', entry.phone):
            valid.append(entry)
    return valid`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "perf-redundant-json-serialization-ts",
    description: "Repeatedly serializing and deserializing JSON unnecessarily",
    language: "typescript",
    code: `function processItems(items: Item[]) {
  for (const item of items) {
    const serialized = JSON.stringify(item);
    const copy = JSON.parse(serialized);
    const validated = JSON.parse(JSON.stringify(copy));
    const logged = JSON.stringify(validated);
    console.log(logged);
    const final = JSON.parse(logged);
    results.push(final);
  }
}`,
    expectedRuleIds: [],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "obs-no-trace-spans-java",
    description: "Java microservice without distributed tracing spans",
    language: "java",
    code: `@RestController
public class OrderController {
    @Autowired private OrderService orderService;
    @Autowired private PaymentService paymentService;
    @Autowired private NotificationService notificationService;

    @PostMapping("/api/orders")
    public ResponseEntity<Order> createOrder(@RequestBody CreateOrderRequest req) {
        Order order = orderService.create(req);
        paymentService.charge(order.getTotal(), req.getPaymentMethod());
        notificationService.sendConfirmation(order.getUserId(), order.getId());
        return ResponseEntity.ok(order);
    }
}`,
    expectedRuleIds: [],
    category: "observability",
    difficulty: "medium",
  },
  {
    id: "maint-magic-numbers-ts",
    description: "Code with unexplained magic numbers throughout",
    language: "typescript",
    code: `function calculateShipping(weight: number, distance: number): number {
  if (weight < 2.5) return distance * 0.0035 + 3.99;
  if (weight < 10) return distance * 0.0078 + 7.49;
  if (weight < 25) return distance * 0.0142 + 14.99;
  if (distance > 500) return weight * 0.85 + 24.99;
  return weight * 0.45 + 12.99 + (distance > 200 ? 5.0 : 0);
}

function adjustPrice(base: number, qty: number): number {
  if (qty > 100) return base * 0.72;
  if (qty > 50) return base * 0.85;
  if (qty > 10) return base * 0.92;
  return base;
}`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "easy",
  },
  {
    id: "maint-dead-code-py",
    description: "Python module with large blocks of dead/unreachable code",
    language: "python",
    code: `def process_data(items):
    results = []
    for item in items:
        results.append(transform(item))
    return results

    # Old implementation — never reached
    legacy_results = []
    for item in items:
        if item.get("type") == "A":
            legacy_results.append(old_transform_a(item))
        elif item.get("type") == "B":
            legacy_results.append(old_transform_b(item))
        else:
            legacy_results.append(item)
    return legacy_results

def old_transform_a(item):
    pass  # deprecated but still in codebase

def old_transform_b(item):
    pass  # deprecated but still in codebase`,
    expectedRuleIds: [],
    category: "maintainability",
    difficulty: "easy",
  },
  {
    id: "doc-misleading-comments-ts",
    description: "Code with comments that contradict the actual implementation",
    language: "typescript",
    code: `// Adds the user to the premium tier
function removeUser(userId: string) {
  db.delete("users", userId);
}

// Returns the sum of all items
function getAverage(items: number[]): number {
  return items.reduce((a, b) => a + b, 0) / items.length;
}

// This function is never called
export function processOrders() {
  // called from 5 routes
  const orders = db.query("SELECT * FROM orders WHERE status = 'pending'");
  return orders.map(o => ({ ...o, processed: true }));
}`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "easy",
  },
  {
    id: "doc-outdated-readme-example-py",
    description: "README code example using deprecated API that no longer works",
    language: "python",
    code: `# # Quick Start
# \`\`\`python
# from mylib import Client
#
# client = Client(api_key="your-key")
# result = client.query("SELECT * FROM data")  # query() was removed in v3
# client.close()  # close() renamed to disconnect() in v2
# \`\`\`
#
# ## Configuration
# Set MYLIB_HOST (removed in v4, now uses MYLIB_URL)
# Set MYLIB_PORT (no longer needed)
# Set MYLIB_SSL=true (now always enabled)`,
    expectedRuleIds: [],
    category: "documentation",
    difficulty: "medium",
  },
  {
    id: "cicd-no-test-stage-yaml",
    description: "CI pipeline that deploys without running tests first",
    language: "yaml",
    code: `name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm run build
      - run: aws s3 sync build/ s3://prod-bucket/
      - run: aws cloudfront create-invalidation --distribution-id EXAMPLE --paths '/*'`,
    expectedRuleIds: [],
    category: "ci-cd",
    difficulty: "easy",
  },
  {
    id: "cicd-hardcoded-creds-in-pipeline-yaml",
    description: "CI pipeline with credentials hardcoded in workflow file",
    language: "yaml",
    code: `name: Deploy
on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE
      AWS_SECRET_ACCESS_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCYzz
      DATABASE_URL: postgres://admin:P@ssw0rd@prod-db.example.com:5432/main
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy`,
    expectedRuleIds: [],
    category: "ci-cd",
    difficulty: "easy",
  },
  {
    id: "scale-no-backpressure-ts",
    description: "Message consumer processing without backpressure control",
    language: "typescript",
    code: `async function consumeMessages(queue: MessageQueue) {
  while (true) {
    const messages = await queue.receive(100);
    // Process all messages concurrently with no limit
    await Promise.all(messages.map(async (msg) => {
      const data = JSON.parse(msg.body);
      await processRecord(data);
      await enrichFromExternalAPI(data);
      await saveToDatabase(data);
      await queue.ack(msg);
    }));
  }
}`,
    expectedRuleIds: [],
    category: "scalability",
    difficulty: "hard",
  },
  {
    id: "conc-toctou-race-py",
    description: "TOCTOU race condition checking file then operating on it",
    language: "python",
    code: `import os

def safe_write(path, data):
    if not os.path.exists(path):
        # Race: file may be created between check and write
        with open(path, "w") as f:
            f.write(data)
    else:
        raise FileExistsError(f"{path} already exists")

def safe_delete(path):
    if os.path.isfile(path):
        # Race: file may be deleted between check and delete
        os.remove(path)`,
    expectedRuleIds: [],
    category: "concurrency",
    difficulty: "hard",
  },
  {
    id: "rel-no-retry-logic-ts",
    description: "API calls to external services with no retry/backoff logic",
    language: "typescript",
    code: `async function chargePayment(orderId: string, amount: number) {
  const response = await fetch("https://payment-api.com/charge", {
    method: "POST",
    body: JSON.stringify({ orderId, amount }),
  });
  if (!response.ok) throw new Error("Payment failed");
  return response.json();
}

async function sendSMS(phone: string, message: string) {
  const response = await fetch("https://sms-api.com/send", {
    method: "POST",
    body: JSON.stringify({ phone, message }),
  });
  return response.json();
}`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "clean-well-structured-modules-py",
    description: "Python code with clean module organization and proper typing",
    language: "python",
    code: `from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass(frozen=True)
class User:
    id: str
    name: str
    email: str
    created_at: datetime
    role: str = "user"

class UserRepository:
    def __init__(self, db):
        self._db = db

    def find_by_id(self, user_id: str) -> Optional[User]:
        row = self._db.execute(
            "SELECT id, name, email, created_at, role FROM users WHERE id = %s",
            (user_id,)
        ).fetchone()
        if not row:
            return None
        return User(**row._asdict())

    def find_by_email(self, email: str) -> Optional[User]:
        row = self._db.execute(
            "SELECT id, name, email, created_at, role FROM users WHERE email = %s",
            (email,)
        ).fetchone()
        if not row:
            return None
        return User(**row._asdict())`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["STRUCT", "MAINT", "DOC", "DB"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-proper-concurrency-ts",
    description: "TypeScript with proper bounded concurrency and error handling",
    language: "typescript",
    code: `import pLimit from "p-limit";

const limit = pLimit(5);

async function processItems(items: Item[]): Promise<Result[]> {
  const results = await Promise.allSettled(
    items.map(item => limit(async () => {
      const response = await fetch(item.url, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status} for \${item.id}\`);
      }
      return response.json();
    }))
  );

  const successes = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<Result>).value);
  const failures = results.filter(r => r.status === "rejected");
  if (failures.length > 0) {
    logger.warn(\`\${failures.length} items failed\`, { failures: failures.map(f => (f as PromiseRejectedResult).reason.message) });
  }
  return successes;
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CONC", "PERF", "ERR", "REL"],
    category: "clean",
    difficulty: "hard",
  },
];
