import type { BenchmarkCase } from "./benchmark.js";

/**
 * Multi-language benchmark cases exercising judges across Go, Rust, Kotlin,
 * Swift, PHP, Ruby, C#, Java, C++, and Python with language-idiomatic patterns.
 *
 * Covers various judge prefixes in non-TypeScript languages.
 */
export const BENCHMARK_LANGUAGES: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  Go-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-go-goroutine-leak",
    description: "Go goroutine leak from unbuffered channel with no receiver",
    language: "go",
    code: `package main

import "net/http"

func handleRequest(w http.ResponseWriter, r *http.Request) {
  ch := make(chan string)
  go func() {
    result := heavyComputation(r.URL.Query().Get("input"))
    ch <- result
  }()
  select {
  case res := <-ch:
    w.Write([]byte(res))
  case <-time.After(1 * time.Second):
    w.WriteHeader(504)
  }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },
  {
    id: "lang-go-defer-in-loop",
    description: "Go defer inside loop causing resource leak",
    language: "go",
    code: `package main

import (
  "database/sql"
  "os"
)

func processFiles(paths []string) error {
  for _, path := range paths {
    f, err := os.Open(path)
    if err != nil {
      return err
    }
    defer f.Close()
    data := make([]byte, 1024)
    f.Read(data)
    processData(data)
  }
  return nil
}

func queryAll(db *sql.DB, ids []int) ([]Record, error) {
  var results []Record
  for _, id := range ids {
    rows, err := db.Query("SELECT * FROM records WHERE id = ?", id)
    if err != nil {
      return nil, err
    }
    defer rows.Close()
    for rows.Next() {
      var r Record
      rows.Scan(&r.ID, &r.Name)
      results = append(results, r)
    }
  }
  return results, nil
}`,
    expectedRuleIds: ["DB-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "lang-go-fmt-errorf-no-wrap",
    description: "Go error creation without wrapping for chain inspection",
    language: "go",
    code: `package service

import (
  "fmt"
  "os"
)

func ReadConfig(path string) (*Config, error) {
  data, err := os.ReadFile(path)
  if err != nil {
    return nil, fmt.Errorf("failed to read config: %s", err)
  }
  var cfg Config
  if err := json.Unmarshal(data, &cfg); err != nil {
    return nil, fmt.Errorf("failed to parse config: %s", err)
  }
  if err := cfg.Validate(); err != nil {
    return nil, fmt.Errorf("invalid config: %s", err)
  }
  return &cfg, nil
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "lang-go-hardcoded-tls-config",
    description: "Go server with hardcoded TLS config and insecure settings",
    language: "go",
    code: `package main

import (
  "crypto/tls"
  "net/http"
)

func main() {
  tlsConfig := &tls.Config{
    InsecureSkipVerify: true,
    MinVersion:         tls.VersionTLS10,
    CipherSuites: []uint16{
      tls.TLS_RSA_WITH_RC4_128_SHA,
      tls.TLS_RSA_WITH_3DES_EDE_CBC_SHA,
    },
  }
  client := &http.Client{Transport: &http.Transport{TLSClientConfig: tlsConfig}}
  resp, _ := client.Get("https://api.internal.example.com/data")
  defer resp.Body.Close()
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Rust-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-rust-unwrap-production",
    description: "Rust production code littered with unwrap() calls",
    language: "rust",
    code: `use std::fs;
use std::collections::HashMap;

fn load_users(path: &str) -> Vec<User> {
    let content = fs::read_to_string(path).unwrap();
    let users: Vec<User> = serde_json::from_str(&content).unwrap();
    users
}

fn get_config_value(config: &HashMap<String, String>, key: &str) -> String {
    config.get(key).unwrap().clone()
}

fn connect_database(url: &str) -> Connection {
    let conn = Connection::establish(url).unwrap();
    conn.execute("SET timezone = 'UTC'").unwrap();
    conn
}

fn parse_request(body: &[u8]) -> Request {
    let text = std::str::from_utf8(body).unwrap();
    serde_json::from_str(text).unwrap()
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "lang-rust-unsafe-transmute",
    description: "Rust code using unsafe transmute and raw pointer dereference",
    language: "rust",
    code: `use std::mem;

fn reinterpret_bytes(data: &[u8]) -> &[f32] {
    unsafe {
        let ptr = data.as_ptr() as *const f32;
        let len = data.len() / mem::size_of::<f32>();
        std::slice::from_raw_parts(ptr, len)
    }
}

fn cast_value<T, U>(val: T) -> U {
    unsafe { mem::transmute_copy(&val) }
}

fn modify_through_pointer(data: &[u8], offset: usize, value: u8) {
    unsafe {
        let ptr = data.as_ptr() as *mut u8;
        *ptr.add(offset) = value;
    }
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "lang-rust-sql-format",
    description: "Rust web handler building SQL query with format!",
    language: "rust",
    code: `use actix_web::{web, HttpResponse};
use sqlx::PgPool;

async fn search_users(
    pool: web::Data<PgPool>,
    query: web::Query<SearchParams>,
) -> HttpResponse {
    let sql = format!(
        "SELECT * FROM users WHERE name LIKE '%{}%' AND role = '{}'",
        query.name,
        query.role
    );
    let rows = sqlx::query(&sql)
        .fetch_all(pool.get_ref())
        .await
        .unwrap();
    HttpResponse::Ok().json(rows)
}

async fn delete_user(
    pool: web::Data<PgPool>,
    path: web::Path<String>,
) -> HttpResponse {
    let sql = format!("DELETE FROM users WHERE id = '{}'", path.into_inner());
    sqlx::query(&sql).execute(pool.get_ref()).await.unwrap();
    HttpResponse::Ok().finish()
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Kotlin-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-kotlin-lateinit-abuse",
    description: "Kotlin lateinit vars used without initialization checks",
    language: "kotlin",
    code: `class OrderService {
    lateinit var database: Database
    lateinit var emailService: EmailService
    lateinit var paymentGateway: PaymentGateway
    lateinit var logger: Logger

    fun processOrder(order: Order): OrderResult {
        logger.info("Processing order \${order.id}")
        val payment = paymentGateway.charge(order.total)
        database.save(order.copy(status = "paid"))
        emailService.sendConfirmation(order)
        return OrderResult(success = true)
    }

    fun cancelOrder(orderId: String) {
        val order = database.findById(orderId)!!
        paymentGateway.refund(order.paymentId!!)
        database.save(order.copy(status = "cancelled"))
        emailService.sendCancellation(order)
    }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "lang-kotlin-sql-template",
    description: "Kotlin Spring Boot with SQL string templates",
    language: "kotlin",
    code: `@RestController
class UserController(private val jdbc: JdbcTemplate) {

    @GetMapping("/search")
    fun searchUsers(@RequestParam name: String, @RequestParam role: String): List<Map<String, Any>> {
        val sql = "SELECT * FROM users WHERE name = '$name' AND role = '$role'"
        return jdbc.queryForList(sql)
    }

    @DeleteMapping("/users/{id}")
    fun deleteUser(@PathVariable id: String): ResponseEntity<Void> {
        jdbc.execute("DELETE FROM users WHERE id = '$id'")
        return ResponseEntity.noContent().build()
    }

    @PutMapping("/users/{id}/role")
    fun updateRole(@PathVariable id: String, @RequestBody body: Map<String, String>): ResponseEntity<Void> {
        val role = body["role"] ?: "user"
        jdbc.execute("UPDATE users SET role = '$role' WHERE id = '$id'")
        return ResponseEntity.ok().build()
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Swift-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-swift-force-unwrap",
    description: "Swift code with excessive force unwrapping",
    language: "swift",
    code: `class UserManager {
    var currentUser: User?
    var session: Session?

    func displayProfile() {
        let name = currentUser!.name
        let email = currentUser!.email!
        let avatar = currentUser!.profile!.avatarURL!
        let token = session!.authToken!
        print("User: \\(name), Email: \\(email)")
        loadImage(from: URL(string: avatar)!)
        fetchData(token: token)
    }

    func processPayment(amount: Double) {
        let card = currentUser!.paymentMethods!.first!
        let response = paymentGateway.charge(card: card, amount: amount)
        let receipt = response!.receipt!
        saveReceipt(receipt)
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "lang-swift-insecure-storage",
    description: "Swift storing sensitive data in UserDefaults instead of Keychain",
    language: "swift",
    code: `import Foundation

class AuthManager {
    func saveCredentials(username: String, password: String, token: String) {
        UserDefaults.standard.set(username, forKey: "username")
        UserDefaults.standard.set(password, forKey: "password")
        UserDefaults.standard.set(token, forKey: "authToken")
        UserDefaults.standard.set(Date(), forKey: "loginDate")
    }

    func getToken() -> String? {
        return UserDefaults.standard.string(forKey: "authToken")
    }

    func saveApiKey(_ key: String) {
        UserDefaults.standard.set(key, forKey: "apiKey")
    }

    func clearCredentials() {
        UserDefaults.standard.removeObject(forKey: "username")
        UserDefaults.standard.removeObject(forKey: "password")
        UserDefaults.standard.removeObject(forKey: "authToken")
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHP-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-php-sql-concat",
    description: "PHP SQL with string concatenation in PDO",
    language: "php",
    code: `<?php
class UserRepository {
    private PDO $pdo;

    public function search(string $name, string $role): array {
        $sql = "SELECT * FROM users WHERE name LIKE '%" . $name . "%' AND role = '" . $role . "'";
        return $this->pdo->query($sql)->fetchAll();
    }

    public function updateEmail(string $id, string $email): void {
        $sql = "UPDATE users SET email = '" . $email . "' WHERE id = " . $id;
        $this->pdo->exec($sql);
    }

    public function deleteByName(string $name): int {
        $sql = "DELETE FROM users WHERE name = '" . $name . "'";
        return $this->pdo->exec($sql);
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-php-deserialization",
    description: "PHP unserializing untrusted user input",
    language: "php",
    code: `<?php
class SessionHandler {
    public function restoreSession(): void {
        if (isset($_COOKIE['session_data'])) {
            $data = base64_decode($_COOKIE['session_data']);
            $session = unserialize($data);
            $_SESSION = array_merge($_SESSION, $session);
        }
    }

    public function importConfig(): void {
        $raw = file_get_contents('php://input');
        $config = unserialize($raw);
        $this->applyConfig($config);
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-php-md5-password",
    description: "PHP using MD5 for password hashing",
    language: "php",
    code: `<?php
class AuthService {
    private PDO $db;

    public function register(string $username, string $password): bool {
        $hash = md5($password);
        $stmt = $this->db->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
        return $stmt->execute([$username, $hash]);
    }

    public function login(string $username, string $password): ?array {
        $hash = md5($password);
        $stmt = $this->db->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
        $stmt->execute([$username, $hash]);
        return $stmt->fetch() ?: null;
    }

    public function generateApiKey(string $userId): string {
        return md5($userId . time());
    }
}`,
    expectedRuleIds: ["AUTH-001", "CYBER-001"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Ruby-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-ruby-eval-user-input",
    description: "Ruby eval on user-provided input in Sinatra app",
    language: "ruby",
    code: `require 'sinatra'

get '/calculate' do
  expression = params[:expr]
  result = eval(expression)
  { result: result }.to_json
end

post '/transform' do
  code = JSON.parse(request.body.read)['code']
  eval(code)
end

get '/config/:key' do
  key = params[:key]
  value = eval("CONFIG.#{key}")
  { key: key, value: value }.to_json
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-ruby-open-uri",
    description: "Ruby using open-uri with user-controlled URL (SSRF)",
    language: "ruby",
    code: `require 'open-uri'
require 'sinatra'
require 'json'

get '/fetch' do
  url = params[:url]
  content = URI.open(url).read
  { content: content }.to_json
end

get '/preview' do
  image_url = params[:image_url]
  data = URI.open(image_url).read
  content_type 'image/png'
  data
end

post '/webhook' do
  payload = JSON.parse(request.body.read)
  response = URI.open(payload['callback_url']).read
  { status: 'delivered', response: response }.to_json
end`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-ruby-system-call",
    description: "Ruby command injection via system call with user input",
    language: "ruby",
    code: `require 'sinatra'

post '/convert' do
  filename = params[:filename]
  format = params[:format]
  system("convert uploads/#{filename} -resize 800x600 output/#{filename}.#{format}")
  send_file "output/#{filename}.#{format}"
end

get '/ping' do
  host = params[:host]
  output = \`ping -c 3 #{host}\`
  { result: output }.to_json
end

post '/backup' do
  db_name = params[:database]
  system("pg_dump #{db_name} > /backups/#{db_name}_#{Time.now.to_i}.sql")
  { status: 'backup created' }.to_json
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  C# / .NET-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-csharp-sql-concat-ado",
    description: "C# ADO.NET with string concatenation in SQL queries",
    language: "csharp",
    code: `using System.Data.SqlClient;

public class UserRepository
{
    private readonly string _connectionString;

    public User GetUser(string username)
    {
        using var conn = new SqlConnection(_connectionString);
        conn.Open();
        var cmd = new SqlCommand(
            "SELECT * FROM Users WHERE Username = '" + username + "'", conn);
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
            return new User { Id = (int)reader["Id"], Name = (string)reader["Username"] };
        return null;
    }

    public void DeleteUser(string userId)
    {
        using var conn = new SqlConnection(_connectionString);
        conn.Open();
        var cmd = new SqlCommand("DELETE FROM Users WHERE Id = " + userId, conn);
        cmd.ExecuteNonQuery();
    }

    public List<User> Search(string term, string role)
    {
        using var conn = new SqlConnection(_connectionString);
        conn.Open();
        var cmd = new SqlCommand(
            $"SELECT * FROM Users WHERE Name LIKE '%{term}%' AND Role = '{role}'", conn);
        // ...
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-csharp-insecure-deserialization",
    description: "C# BinaryFormatter deserialization of untrusted data",
    language: "csharp",
    code: `using System.Runtime.Serialization.Formatters.Binary;

public class SessionManager
{
    public object DeserializeSession(byte[] data)
    {
        var formatter = new BinaryFormatter();
        using var stream = new MemoryStream(data);
        return formatter.Deserialize(stream);
    }

    public object LoadFromFile(string path)
    {
        var formatter = new BinaryFormatter();
        using var stream = File.OpenRead(path);
        return formatter.Deserialize(stream);
    }

    public byte[] Serialize(object obj)
    {
        var formatter = new BinaryFormatter();
        using var stream = new MemoryStream();
        formatter.Serialize(stream, obj);
        return stream.ToArray();
    }
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-csharp-controller-no-auth",
    description: "C# ASP.NET controller with no authorization attributes",
    language: "csharp",
    code: `[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly IUserService _userService;

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _userService.GetAll();
        return Ok(users);
    }

    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        await _userService.Delete(id);
        return NoContent();
    }

    [HttpPost("users/{id}/role")]
    public async Task<IActionResult> ChangeRole(int id, [FromBody] RoleChangeRequest request)
    {
        await _userService.ChangeRole(id, request.Role);
        return Ok();
    }

    [HttpGet("audit-log")]
    public async Task<IActionResult> GetAuditLog()
    {
        var logs = await _auditService.GetAll();
        return Ok(logs);
    }
}`,
    expectedRuleIds: ["AUTH-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Java-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-java-thread-unsafe-singleton",
    description: "Java thread-unsafe singleton with lazy initialization",
    language: "java",
    code: `public class DatabasePool {
    private static DatabasePool instance;
    private Connection[] connections;
    private int currentIndex = 0;

    private DatabasePool() {
        connections = new Connection[10];
        for (int i = 0; i < 10; i++) {
            connections[i] = DriverManager.getConnection(DB_URL);
        }
    }

    public static DatabasePool getInstance() {
        if (instance == null) {
            instance = new DatabasePool();
        }
        return instance;
    }

    public Connection getConnection() {
        Connection conn = connections[currentIndex];
        currentIndex = (currentIndex + 1) % connections.length;
        return conn;
    }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "lang-java-resource-leak",
    description: "Java code not using try-with-resources for AutoCloseable",
    language: "java",
    code: `public class FileProcessor {
    public String readFile(String path) throws IOException {
        FileInputStream fis = new FileInputStream(path);
        BufferedReader reader = new BufferedReader(new InputStreamReader(fis));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append("\\n");
        }
        return sb.toString();
    }

    public void copyFile(String src, String dst) throws IOException {
        FileInputStream in = new FileInputStream(src);
        FileOutputStream out = new FileOutputStream(dst);
        byte[] buffer = new byte[4096];
        int bytesRead;
        while ((bytesRead = in.read(buffer)) != -1) {
            out.write(buffer, 0, bytesRead);
        }
    }

    public List<String> queryDatabase(String sql) throws SQLException {
        Connection conn = DriverManager.getConnection(DB_URL);
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(sql);
        List<String> results = new ArrayList<>();
        while (rs.next()) {
            results.add(rs.getString(1));
        }
        return results;
    }
}`,
    expectedRuleIds: ["ERR-001", "PERF-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "lang-java-xxe-transformer",
    description: "Java XML parsing vulnerable to XXE via TransformerFactory",
    language: "java",
    code: `import javax.xml.transform.*;
import javax.xml.transform.stream.*;

public class XmlService {
    public String transformXml(String xmlInput, String xsltPath) throws Exception {
        TransformerFactory factory = TransformerFactory.newInstance();
        Source xslt = new StreamSource(new File(xsltPath));
        Transformer transformer = factory.newTransformer(xslt);

        Source xmlSource = new StreamSource(new StringReader(xmlInput));
        StringWriter writer = new StringWriter();
        transformer.transform(xmlSource, new StreamResult(writer));
        return writer.toString();
    }

    public Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        return builder.parse(new InputSource(new StringReader(xml)));
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Python-specific patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-python-mutable-default",
    description: "Python mutable default arguments causing shared state",
    language: "python",
    code: `def add_item(item, items=[]):
    items.append(item)
    return items

def create_user(name, roles=[], metadata={}):
    metadata['created'] = time.time()
    roles.append('user')
    return {'name': name, 'roles': roles, 'metadata': metadata}

class TaskQueue:
    def __init__(self, tasks=[], config={}):
        self.tasks = tasks
        self.config = config

    def add_task(self, task):
        self.tasks.append(task)

    def set_config(self, key, value):
        self.config[key] = value`,
    expectedRuleIds: ["SWDEV-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "lang-python-pickle-load",
    description: "Python loading pickle from untrusted source",
    language: "python",
    code: `import pickle
import flask

app = flask.Flask(__name__)

@app.route('/load-model', methods=['POST'])
def load_model():
    model_data = flask.request.get_data()
    model = pickle.loads(model_data)
    return flask.jsonify(model.predict([1, 2, 3]))

@app.route('/import-data', methods=['POST'])
def import_data():
    file = flask.request.files['data']
    data = pickle.load(file.stream)
    return flask.jsonify({'rows': len(data)})

def load_cache(path):
    with open(path, 'rb') as f:
        return pickle.load(f)`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-python-global-state-flask",
    description: "Python Flask app using module-level mutable global state",
    language: "python",
    code: `from flask import Flask, request, jsonify

app = Flask(__name__)

request_count = 0
users_cache = {}
active_sessions = []

@app.route('/users/<user_id>')
def get_user(user_id):
    global request_count
    request_count += 1
    if user_id in users_cache:
        return jsonify(users_cache[user_id])
    user = db.find_user(user_id)
    users_cache[user_id] = user
    return jsonify(user)

@app.route('/login', methods=['POST'])
def login():
    global request_count
    request_count += 1
    session = create_session(request.json)
    active_sessions.append(session)
    return jsonify(session)

@app.route('/stats')
def stats():
    return jsonify({
        'requests': request_count,
        'cached_users': len(users_cache),
        'active_sessions': len(active_sessions)
    })`,
    expectedRuleIds: ["CYBER-001", "OBS-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "lang-python-assert-validation",
    description: "Python using assert for input validation (removed with -O)",
    language: "python",
    code: `def transfer_funds(from_account, to_account, amount):
    assert amount > 0, "Amount must be positive"
    assert from_account != to_account, "Cannot transfer to same account"
    assert from_account.balance >= amount, "Insufficient funds"
    from_account.balance -= amount
    to_account.balance += amount

def create_user(username, email, age):
    assert len(username) >= 3, "Username too short"
    assert '@' in email, "Invalid email"
    assert 0 < age < 150, "Invalid age"
    return User(username=username, email=email, age=age)

def process_order(items, discount_code=None):
    assert len(items) > 0, "Order must have items"
    assert all(item['qty'] > 0 for item in items), "Quantities must be positive"
    if discount_code:
        assert len(discount_code) == 8, "Invalid discount code"`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  C++ patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-cpp-buffer-overflow",
    description: "C++ buffer overflow with strcpy and gets",
    language: "cpp",
    code: `#include <cstring>
#include <cstdio>

void processInput(const char* input) {
    char buffer[64];
    strcpy(buffer, input);
    printf("Processed: %s\\n", buffer);
}

void readUserName() {
    char name[32];
    printf("Enter name: ");
    gets(name);
    printf("Hello, %s\\n", name);
}

void copyData(const char* src) {
    char dest[128];
    sprintf(dest, "Data: %s (processed at %s)", src, __TIME__);
    processOutput(dest);
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-cpp-use-after-free",
    description: "C++ use-after-free with raw pointers",
    language: "cpp",
    code: `#include <vector>
#include <string>

class ConnectionPool {
    std::vector<Connection*> connections;
public:
    Connection* getConnection() {
        if (connections.empty()) return nullptr;
        Connection* conn = connections.back();
        connections.pop_back();
        return conn;
    }

    void releaseConnection(Connection* conn) {
        delete conn;
        connections.push_back(conn);  // use-after-free
    }

    void cleanup() {
        for (auto* conn : connections) {
            delete conn;
        }
        // connections still holds dangling pointers
        for (auto* conn : connections) {
            conn->reset();  // use-after-free
        }
    }
};`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Multi-language Database patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-python-django-raw-sql",
    description: "Django model using raw SQL instead of ORM",
    language: "python",
    code: `from django.db import connection, models

class Product(models.Model):
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=10, decimal_places=2)

    @staticmethod
    def search(query, min_price):
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT * FROM products WHERE name LIKE '%%{query}%%' AND price >= {min_price}"
            )
            return cursor.fetchall()

    @staticmethod
    def bulk_update_prices(category, multiplier):
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE products SET price = price * {multiplier} WHERE category = '{category}'"
            )`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-go-sql-string-concat",
    description: "Go database queries with fmt.Sprintf for SQL",
    language: "go",
    code: `package handlers

import (
  "database/sql"
  "fmt"
  "net/http"
)

func SearchHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    category := r.URL.Query().Get("category")
    query := fmt.Sprintf(
      "SELECT * FROM products WHERE name LIKE '%%%s%%' AND category = '%s'",
      name, category,
    )
    rows, err := db.Query(query)
    if err != nil {
      http.Error(w, err.Error(), 500)
      return
    }
    defer rows.Close()
    json.NewEncoder(w).Encode(scanRows(rows))
  }
}`,
    expectedRuleIds: ["SCALE-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Multi-language Auth patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-python-hardcoded-secret",
    description: "Python Flask app with hardcoded secret keys",
    language: "python",
    code: `from flask import Flask

app = Flask(__name__)
app.secret_key = 'super-secret-key-do-not-share'

JWT_SECRET = 'jwt-signing-key-2024'
API_KEY = 'sk-prod-a1b2c3d4e5f6g7h8i9j0'
DATABASE_PASSWORD = 'P@ssw0rd123!'

STRIPE_SECRET_KEY = 'sk_live_abc123def456ghi789'
AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

@app.route('/')
def index():
    return 'Hello'`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Multi-language Error Handling patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-ruby-rescue-exception",
    description: "Ruby rescuing Exception instead of StandardError",
    language: "ruby",
    code: `class DataProcessor
  def process(data)
    result = transform(data)
    save_to_database(result)
  rescue Exception => e
    puts "Error: #{e.message}"
    nil
  end

  def fetch_remote(url)
    response = Net::HTTP.get(URI(url))
    JSON.parse(response)
  rescue Exception
    {}
  end

  def critical_operation
    perform_operation
  rescue Exception => e
    logger.error(e.message)
    retry
  end
end`,
    expectedRuleIds: ["SCALE-001", "SWDEV-001", "RATE-001"],
    category: "error-handling",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Multi-language Performance patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "lang-python-string-concat-loop",
    description: "Python building strings with += in loop instead of join",
    language: "python",
    code: `def generate_csv(records):
    output = ""
    output += "id,name,email,created_at\\n"
    for record in records:
        output += f"{record['id']},{record['name']},{record['email']},{record['created_at']}\\n"
    return output

def build_html_table(rows):
    html = "<table>"
    for row in rows:
        html += "<tr>"
        for cell in row:
            html += f"<td>{cell}</td>"
        html += "</tr>"
    html += "</table>"
    return html

def create_report(sections):
    report = ""
    for section in sections:
        report += f"# {section['title']}\\n\\n"
        for line in section['content']:
            report += f"  {line}\\n"
        report += "\\n"
    return report`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },
  {
    id: "lang-java-string-concat-loop",
    description: "Java String concatenation in loop instead of StringBuilder",
    language: "java",
    code: `public class ReportGenerator {
    public String generateReport(List<Record> records) {
        String report = "";
        report += "Report generated at: " + new Date() + "\\n";
        report += "Total records: " + records.size() + "\\n\\n";

        for (Record record : records) {
            report += "ID: " + record.getId() + "\\n";
            report += "Name: " + record.getName() + "\\n";
            report += "Status: " + record.getStatus() + "\\n";
            report += "---\\n";
        }

        return report;
    }

    public String buildCsv(List<String[]> rows) {
        String csv = "";
        for (String[] row : rows) {
            for (int i = 0; i < row.length; i++) {
                csv += row[i];
                if (i < row.length - 1) csv += ",";
            }
            csv += "\\n";
        }
        return csv;
    }
}`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEAN CODE — Language-specific FP validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clean-go-idiomatic-errors",
    description: "Clean: Go code with idiomatic error handling and context",
    language: "go",
    code: `package repository

import (
  "context"
  "database/sql"
  "fmt"
)

type UserRepo struct {
  db *sql.DB
}

func (r *UserRepo) FindByID(ctx context.Context, id string) (*User, error) {
  row := r.db.QueryRowContext(ctx, "SELECT id, name, email FROM users WHERE id = $1", id)
  var u User
  if err := row.Scan(&u.ID, &u.Name, &u.Email); err != nil {
    if err == sql.ErrNoRows {
      return nil, nil
    }
    return nil, fmt.Errorf("querying user %s: %w", id, err)
  }
  return &u, nil
}

func (r *UserRepo) Create(ctx context.Context, u *User) error {
  _, err := r.db.ExecContext(ctx,
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
    u.ID, u.Name, u.Email,
  )
  if err != nil {
    return fmt.Errorf("inserting user: %w", err)
  }
  return nil
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-rust-result-handling",
    description: "Clean: Rust using Result and ? operator properly",
    language: "rust",
    code: `use std::fs;
use std::io;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("Config missing key: {0}")]
    MissingKey(String),
}

pub fn load_config(path: &str) -> Result<Config, AppError> {
    let content = fs::read_to_string(path)?;
    let config: Config = serde_json::from_str(&content)?;
    if config.api_url.is_empty() {
        return Err(AppError::MissingKey("api_url".into()));
    }
    Ok(config)
}

pub fn process_request(body: &[u8]) -> Result<Response, AppError> {
    let text = std::str::from_utf8(body)
        .map_err(|e| AppError::Parse(serde_json::Error::custom(e.to_string())))?;
    let req: Request = serde_json::from_str(text)?;
    Ok(handle_request(req))
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-kotlin-null-safety",
    description: "Clean: Kotlin using proper null safety patterns",
    language: "kotlin",
    code: `data class UserProfile(
    val name: String,
    val email: String?,
    val avatarUrl: String?
)

class UserService(private val repository: UserRepository) {
    fun getUserDisplayName(id: String): String {
        val user = repository.findById(id) ?: return "Unknown User"
        return user.profile?.displayName ?: user.name
    }

    fun getOrderTotal(orderId: String): Double? {
        val order = orderRepo.findById(orderId) ?: return null
        return order.items?.sumOf { it.price * it.quantity } ?: 0.0
    }

    fun processPayment(userId: String): PaymentResult {
        val user = repository.findById(userId)
            ?: return PaymentResult.Error("User not found")
        val card = user.paymentMethods?.firstOrNull()
            ?: return PaymentResult.Error("No payment method")
        return paymentGateway.charge(card.token, cart?.total ?: 0.0)
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-swift-optional-binding",
    description: "Clean: Swift using guard let and optional chaining",
    language: "swift",
    code: `class UserManager {
    var currentUser: User?
    var session: Session?

    func displayProfile() {
        guard let user = currentUser else {
            print("No user logged in")
            return
        }
        guard let email = user.email else {
            print("No email on file")
            return
        }
        let avatarURL = user.profile?.avatarURL ?? "default-avatar.png"
        print("User: \\(user.name), Email: \\(email)")
        if let url = URL(string: avatarURL) {
            loadImage(from: url)
        }
    }

    func processPayment(amount: Double) {
        guard let card = currentUser?.paymentMethods?.first else {
            print("No payment method available")
            return
        }
        if let response = paymentGateway.charge(card: card, amount: amount),
           let receipt = response.receipt {
            saveReceipt(receipt)
        }
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-java-try-with-resources",
    description: "Clean: Java using try-with-resources for AutoCloseable",
    language: "java",
    code: `import java.io.*;
import java.sql.*;
import java.util.*;

public class FileProcessor {
    public String readFile(String path) throws IOException {
        try (var fis = new FileInputStream(path);
             var reader = new BufferedReader(new InputStreamReader(fis))) {
            var sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\\n");
            }
            return sb.toString();
        }
    }

    public List<String> queryDatabase(String sql) throws SQLException {
        try (var conn = DriverManager.getConnection(DB_URL);
             var stmt = conn.createStatement();
             var rs = stmt.executeQuery(sql)) {
            var results = new ArrayList<String>();
            while (rs.next()) {
                results.add(rs.getString(1));
            }
            return results;
        }
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-php-prepared-statements",
    description: "Clean: PHP using PDO prepared statements throughout",
    language: "php",
    code: `<?php
class UserRepository {
    private PDO $pdo;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    public function search(string $name, string $role): array {
        $stmt = $this->pdo->prepare(
            "SELECT * FROM users WHERE name LIKE :name AND role = :role"
        );
        $stmt->execute([':name' => "%{$name}%", ':role' => $role]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function updateEmail(int $id, string $email): void {
        $stmt = $this->pdo->prepare("UPDATE users SET email = :email WHERE id = :id");
        $stmt->execute([':email' => $email, ':id' => $id]);
    }

    public function deleteById(int $id): bool {
        $stmt = $this->pdo->prepare("DELETE FROM users WHERE id = :id");
        return $stmt->execute([':id' => $id]);
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-ruby-safe-sinatra",
    description: "Clean: Ruby Sinatra with parameterized queries and input validation",
    language: "ruby",
    code: `require 'sinatra'
require 'sequel'
require 'json'

DB = Sequel.connect(ENV['DATABASE_URL'])

get '/users' do
  name = params[:name]
  halt 400, { error: 'name parameter required' }.to_json unless name

  users = DB[:users].where(Sequel.ilike(:name, "%#{DB.literal(name).gsub("'", '')}%")).all
  users.to_json
end

post '/users' do
  data = JSON.parse(request.body.read)
  halt 400, { error: 'name required' }.to_json unless data['name']&.length&.between?(1, 100)
  halt 400, { error: 'invalid email' }.to_json unless data['email']&.match?(/\\A[^@]+@[^@]+\\z/)

  id = DB[:users].insert(name: data['name'], email: data['email'])
  status 201
  { id: id }.to_json
end`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-python-proper-logging",
    description: "Clean: Python with proper logging and error handling",
    language: "python",
    code: `import logging
from contextlib import contextmanager
from typing import Generator

logger = logging.getLogger(__name__)

@contextmanager
def managed_connection(url: str) -> Generator[Connection, None, None]:
    conn = connect(url)
    try:
        yield conn
    except DatabaseError as e:
        logger.error("Database error: %s", e, exc_info=True)
        raise
    finally:
        conn.close()

def process_batch(items: list[dict]) -> list[dict]:
    results = []
    for item in items:
        try:
            result = transform(item)
            results.append(result)
        except ValueError as e:
            logger.warning("Skipping invalid item %s: %s", item.get('id'), e)
        except IOError as e:
            logger.error("I/O error processing %s: %s", item.get('id'), e)
            raise
    return results`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-csharp-parameterized",
    description: "Clean: C# with parameterized queries and proper disposal",
    language: "csharp",
    code: `using System.Data.SqlClient;

public class UserRepository : IDisposable
{
    private readonly SqlConnection _conn;

    public UserRepository(string connectionString)
    {
        _conn = new SqlConnection(connectionString);
        _conn.Open();
    }

    public User? GetUser(string username)
    {
        using var cmd = new SqlCommand("SELECT Id, Username, Email FROM Users WHERE Username = @username", _conn);
        cmd.Parameters.AddWithValue("@username", username);
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
        {
            return new User
            {
                Id = reader.GetInt32(0),
                Name = reader.GetString(1),
                Email = reader.GetString(2)
            };
        }
        return null;
    }

    public void Dispose()
    {
        _conn?.Dispose();
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-cpp-smart-pointers",
    description: "Clean: C++ using smart pointers and RAII",
    language: "cpp",
    code: `#include <memory>
#include <vector>
#include <string>

class ConnectionPool {
    std::vector<std::unique_ptr<Connection>> connections;
public:
    std::unique_ptr<Connection> getConnection() {
        if (connections.empty()) return nullptr;
        auto conn = std::move(connections.back());
        connections.pop_back();
        return conn;
    }

    void releaseConnection(std::unique_ptr<Connection> conn) {
        conn->reset();
        connections.push_back(std::move(conn));
    }

    void addConnection(const std::string& url) {
        connections.push_back(std::make_unique<Connection>(url));
    }
};

void processData(const std::string& input) {
    auto buffer = std::make_unique<char[]>(input.size() + 1);
    std::copy(input.begin(), input.end(), buffer.get());
    buffer[input.size()] = '\\0';
    processOutput(buffer.get());
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Additional multi-language benchmark cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "lang-ruby-sql-injection",
    description: "Ruby on Rails controller with SQL injection via string interpolation",
    language: "ruby",
    code: `class UsersController < ApplicationController
  def search
    query = params[:q]
    @users = User.where("name LIKE '%#{query}%'")
    render json: @users
  end

  def destroy
    User.connection.execute("DELETE FROM users WHERE id = #{params[:id]}")
    head :no_content
  end
end`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-ruby-mass-assignment",
    description: "Ruby on Rails controller permitting all params without filtering",
    language: "ruby",
    code: `class AccountsController < ApplicationController
  def create
    @account = Account.new(params.permit!)
    if @account.save
      render json: @account, status: :created
    else
      render json: @account.errors, status: :unprocessable_entity
    end
  end

  def update
    @account = Account.find(params[:id])
    @account.update(params.permit!)
    render json: @account
  end
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-php-eval-user-input",
    description: "PHP code using eval with user-supplied input",
    language: "php",
    code: `<?php
function calculate($expression) {
    return eval("return " . $_GET['expr'] . ";");
}

function processTemplate($template, $vars) {
    foreach ($vars as $key => $value) {
        $template = str_replace("{{" . $key . "}}", $value, $template);
    }
    eval("?>" . $template);
}
?>`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-php-file-inclusion",
    description: "PHP remote/local file inclusion vulnerability",
    language: "php",
    code: `<?php
$page = $_GET['page'];
include($page . '.php');

function loadModule($module) {
    require_once($_POST['module_path'] . '/' . $module);
}

function getTemplate() {
    $template = $_COOKIE['template'];
    include("templates/" . $template);
}
?>`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-scala-blocking-future",
    description: "Scala code blocking on Future with Await.result in async context",
    language: "scala",
    code: `import scala.concurrent._
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global

class UserService {
  def getUser(id: String): User = {
    val future = Future { db.findUser(id) }
    Await.result(future, 30.seconds) // blocks thread pool thread
  }

  def getAllUsers(): List[User] = {
    val futures = userIds.map(id => Future { db.findUser(id) })
    futures.map(f => Await.result(f, 10.seconds)).toList // blocks for each
  }
}`,
    expectedRuleIds: ["COST-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "lang-dart-insecure-http",
    description: "Dart/Flutter app using insecure HTTP for API calls",
    language: "dart",
    code: `import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  static const baseUrl = 'http://api.example.com';

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      body: jsonEncode({'email': email, 'password': password}),
    );
    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> getProfile(String token) async {
    final response = await http.get(
      Uri.parse('$baseUrl/profile'),
      headers: {'Authorization': 'Bearer $token'},
    );
    return jsonDecode(response.body);
  }
}`,
    expectedRuleIds: ["SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-kotlin-insecure-prefs",
    description: "Kotlin Android app storing secrets in SharedPreferences",
    language: "kotlin",
    code: `class AuthManager(private val context: Context) {
    fun saveCredentials(username: String, password: String, token: String) {
        val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("username", username)
            .putString("password", password)
            .putString("auth_token", token)
            .putString("refresh_token", token)
            .apply()
    }

    fun getToken(): String? {
        val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
        return prefs.getString("auth_token", null)
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "lang-swift-force-unwrap-chain",
    description: "Swift code with excessive force unwrapping risking crashes",
    language: "swift",
    code: `func processResponse(_ data: Data?) -> UserProfile {
    let json = try! JSONSerialization.jsonObject(with: data!, options: []) as! [String: Any]
    let user = json["user"] as! [String: Any]
    let name = user["name"] as! String
    let age = user["age"] as! Int
    let address = user["address"] as! [String: Any]
    let city = address["city"] as! String
    let coords = address["coordinates"] as! [Double]
    return UserProfile(name: name, age: age, city: city, lat: coords[0], lon: coords[1])
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "lang-r-no-input-validation",
    description: "R Shiny application without input validation or sanitization",
    language: "r",
    code: `library(shiny)
library(DBI)

server <- function(input, output, session) {
  output$results <- renderTable({
    query <- paste0("SELECT * FROM patients WHERE name LIKE '%", input$search, "%'")
    dbGetQuery(con, query)
  })

  observeEvent(input$delete, {
    query <- paste0("DELETE FROM patients WHERE id = ", input$patient_id)
    dbExecute(con, query)
  })
}`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-elixir-atom-leak",
    description: "Elixir code converting user input to atoms risking atom table exhaustion",
    language: "elixir",
    code: `defmodule Router do
  def handle_request(conn) do
    action = conn.params["action"] |> String.to_atom()
    format = conn.params["format"] |> String.to_atom()

    case action do
      :index -> list_items(conn, format)
      :show -> show_item(conn, format)
      _ -> send_resp(conn, 404, "Not found")
    end
  end
end`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "lang-lua-global-pollution",
    description: "Lua code polluting global namespace and using loadstring",
    language: "lua",
    code: `-- No local declarations — all globals
function processInput(data)
    result = {}
    for i = 1, #data do
        item = data[i]
        transformed = transform(item)
        table.insert(result, transformed)
    end
    return result
end

function executeUserCode(code)
    local fn = loadstring(code)
    fn()
end`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "lang-clean-rust-error-handling",
    description: "Rust with proper error handling using Result and the ? operator",
    language: "rust",
    code: `use std::fs;
use std::io;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("Parse error: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub fn load_config(path: &str) -> Result<Config, AppError> {
    let content = fs::read_to_string(path)?;
    let config: Config = serde_json::from_str(&content)?;
    Ok(config)
}

pub fn get_user(id: &str) -> Result<User, AppError> {
    let users = load_config("users.json")?;
    users.find(id).ok_or_else(|| AppError::NotFound(id.to_string()))
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["ERR", "STRUCT", "MAINT"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "lang-clean-kotlin-coroutines",
    description: "Kotlin with proper coroutine structure and error handling",
    language: "kotlin",
    code: `import kotlinx.coroutines.*

class OrderService(
    private val orderRepo: OrderRepository,
    private val paymentClient: PaymentClient,
) {
    suspend fun processOrder(orderId: String): Result<Order> = coroutineScope {
        val order = orderRepo.findById(orderId)
            ?: return@coroutineScope Result.failure(OrderNotFoundException(orderId))

        val paymentResult = withTimeout(5000) {
            paymentClient.charge(order.total, order.paymentMethod)
        }

        if (paymentResult.isFailure) {
            return@coroutineScope Result.failure(paymentResult.exceptionOrNull()!!)
        }

        val updated = orderRepo.updateStatus(orderId, OrderStatus.PAID)
        Result.success(updated)
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CONC", "ERR", "REL"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "lang-clean-swift-optionals",
    description: "Swift code with safe optional handling",
    language: "swift",
    code: `struct UserProfile {
    let name: String
    let email: String
    let age: Int?
}

func parseProfile(from data: Data) -> Result<UserProfile, ParseError> {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return .failure(.invalidJSON)
    }
    guard let name = json["name"] as? String,
          let email = json["email"] as? String else {
        return .failure(.missingRequiredFields)
    }
    let age = json["age"] as? Int
    return .success(UserProfile(name: name, email: email, age: age))
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["ERR", "STRUCT"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "lang-powershell-hardcoded-creds",
    description: "PowerShell script with hardcoded credentials",
    language: "powershell",
    code: `$username = "admin"
$password = "P@ssw0rd123!"
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($username, $securePassword)

Invoke-Command -ComputerName "prod-server-01" -Credential $credential -ScriptBlock {
    Restart-Service "WebApp"
}

$connectionString = "Server=prod-db.example.com;Database=main;User Id=sa;Password=SuperSecret123;"
Invoke-Sqlcmd -ConnectionString $connectionString -Query "SELECT * FROM users"`,
    expectedRuleIds: ["AUTH-001", "CYBER-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "lang-bash-injection-vulnerables",
    description: "Bash script with command injection vulnerabilities",
    language: "bash",
    code: `#!/bin/bash
# Process user-provided filename
filename=$1
cat /data/$filename

# Execute user-provided command
user_cmd=$2
eval $user_cmd

# Cleanup using user input
rm -rf /tmp/$3

# Search with user input
grep "$4" /var/log/syslog | mail -s "Results" admin@example.com`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "lang-csharp-dispose-not-called",
    description: "C# code not disposing IDisposable resources properly",
    language: "csharp",
    code: `public class DataProcessor
{
    public string ReadFile(string path)
    {
        var stream = new FileStream(path, FileMode.Open);
        var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        return content;
        // stream and reader never disposed
    }

    public void ProcessDatabase(string connStr)
    {
        var connection = new SqlConnection(connStr);
        connection.Open();
        var command = new SqlCommand("SELECT * FROM data", connection);
        var reader = command.ExecuteReader();
        while (reader.Read()) { /* process */ }
        // connection, command, reader never disposed/closed
    }
}`,
    expectedRuleIds: ["COST-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "lang-clean-ruby-service",
    description: "Clean Ruby service class with proper error handling",
    language: "ruby",
    code: `class PaymentService
  class PaymentError < StandardError; end
  class InsufficientFundsError < PaymentError; end
  class InvalidCardError < PaymentError; end

  def initialize(gateway:, logger:)
    @gateway = gateway
    @logger = logger
  end

  def charge(amount:, card_token:)
    raise ArgumentError, "amount must be positive" unless amount.positive?
    raise ArgumentError, "card_token is required" if card_token.blank?

    result = @gateway.charge(amount: amount, token: card_token)
    @logger.info("Payment charged", amount: amount, transaction_id: result.id)
    result
  rescue Gateway::CardDeclined => e
    @logger.warn("Card declined", error: e.message)
    raise InvalidCardError, e.message
  rescue Gateway::InsufficientFunds => e
    @logger.warn("Insufficient funds", error: e.message)
    raise InsufficientFundsError, e.message
  end
end`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["ERR", "STRUCT", "DOC"],
    category: "clean",
    difficulty: "medium",
  },
];
