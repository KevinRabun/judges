/**
 * Expanded benchmark cases — 230+ additional test cases for broader coverage.
 *
 * Adds coverage for:
 *   - Missing languages: Ruby, PHP, Kotlin, Swift, PowerShell, Bicep
 *   - Under-covered categories: error-handling, observability, scalability, testing
 *   - AI-specific failure modes: hallucinated APIs, copy-paste vulnerabilities
 *   - Harder difficulty cases: obfuscated vulnerabilities, multi-step exploit chains
 *   - More clean code samples to validate FP rate
 */

import type { BenchmarkCase } from "./benchmark.js";

export const EXPANDED_BENCHMARK_CASES: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // RUBY
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Ruby: SQL Injection ──
  {
    id: "ruby-sql-injection-interpolation",
    description: "Ruby SQL injection via string interpolation in Active Record",
    language: "ruby",
    code: `class UsersController < ApplicationController
  def search
    query = params[:q]
    @users = User.where("name LIKE '%#{query}%'")
    render json: @users
  end
end`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "ruby-command-injection",
    description: "Ruby command injection via backtick execution",
    language: "ruby",
    code: `class ReportsController < ApplicationController
  def generate
    filename = params[:filename]
    output = \`wc -l /data/#{filename}\`
    render plain: output
  end
end`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "ruby-mass-assignment",
    description: "Ruby mass assignment vulnerability without strong params",
    language: "ruby",
    code: `class UsersController < ApplicationController
  def create
    @user = User.new(params[:user])
    @user.save
    redirect_to @user
  end

  def update
    @user = User.find(params[:id])
    @user.update_attributes(params[:user])
    redirect_to @user
  end
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "ruby-path-traversal",
    description: "Ruby path traversal via unsanitized file path",
    language: "ruby",
    code: `class DownloadsController < ApplicationController
  def show
    path = File.join("/uploads", params[:file])
    send_file path
  end
end`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "ruby-open-redirect",
    description: "Ruby open redirect vulnerability",
    language: "ruby",
    code: `class SessionsController < ApplicationController
  def create
    user = User.authenticate(params[:email], params[:password])
    if user
      session[:user_id] = user.id
      redirect_to params[:return_to]
    else
      flash[:error] = "Invalid credentials"
      redirect_to login_path
    end
  end
end`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "ruby-yaml-deserialization",
    description: "Unsafe YAML deserialization in Ruby",
    language: "ruby",
    code: `require 'yaml'

class ConfigLoader
  def self.load_from_file(path)
    content = File.read(path)
    YAML.load(content)
  end

  def self.load_from_request(data)
    YAML.load(data)
  end
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "ruby-erb-xss",
    description: "Ruby ERB template XSS via unescaped output",
    language: "ruby",
    code: `# In a view template
class ProfileController < ApplicationController
  def show
    @bio = params[:bio]
    # Template uses: <%%= raw @bio %>
    render inline: "<div><%= raw @bio %></div>"
  end
end`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "xss",
    difficulty: "easy",
  },
  {
    id: "ruby-hardcoded-secrets",
    description: "Hardcoded secrets in Ruby configuration",
    language: "ruby",
    code: `Rails.application.configure do
  config.secret_key_base = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  config.api_key = "sk-live-abc123def456ghi789"
end

class PaymentService
  API_SECRET = "whsec_test_secret_key_12345"

  def charge(amount)
    Stripe::Charge.create(amount: amount, api_key: API_SECRET)
  end
end`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },

  // ── Ruby Clean ──
  {
    id: "ruby-secure-controller",
    description: "Clean: Secure Ruby Rails controller with strong params",
    language: "ruby",
    code: `class UsersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user, only: [:show, :update]

  def create
    @user = User.new(user_params)
    if @user.save
      render json: @user, status: :created
    else
      render json: @user.errors, status: :unprocessable_entity
    end
  end

  def update
    if @user.update(user_params)
      render json: @user
    else
      render json: @user.errors, status: :unprocessable_entity
    end
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  def user_params
    params.require(:user).permit(:name, :email)
  end
end`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "AUTH-001"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHP
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "php-sql-injection",
    description: "PHP SQL injection via string concatenation",
    language: "php",
    code: `<?php
function getUser($id) {
    $conn = new mysqli("localhost", "root", "", "app");
    $query = "SELECT * FROM users WHERE id = " . $_GET['id'];
    $result = $conn->query($query);
    return $result->fetch_assoc();
}
?>`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "php-command-injection",
    description: "PHP command injection via system()",
    language: "php",
    code: `<?php
$host = $_GET['host'];
$output = system("ping -c 4 " . $host);
echo "<pre>$output</pre>";
?>`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "php-file-inclusion-local",
    description: "PHP local file inclusion vulnerability",
    language: "php",
    code: `<?php
$page = $_GET['page'];
include("pages/" . $page . ".php");
?>`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "php-xss-echo",
    description: "PHP reflected XSS via echo",
    language: "php",
    code: `<?php
$name = $_GET['name'];
echo "<h1>Welcome, $name</h1>";
echo "<p>Your search: " . $_POST['query'] . "</p>";
?>`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "xss",
    difficulty: "easy",
  },
  {
    id: "php-unserialize",
    description: "PHP unsafe deserialization via unserialize",
    language: "php",
    code: `<?php
$data = $_COOKIE['session_data'];
$session = unserialize($data);
$user = $session->getUser();
echo "Hello, " . $user->name;
?>`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "php-eval-injection",
    description: "PHP eval injection from user input",
    language: "php",
    code: `<?php
$formula = $_POST['formula'];
$result = eval("return " . $formula . ";");
echo "Result: $result";
?>`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "php-hardcoded-creds",
    description: "PHP hardcoded database credentials",
    language: "php",
    code: `<?php
define('DB_HOST', 'production-db.example.com');
define('DB_USER', 'admin');
define('DB_PASS', 'P@ssw0rd!2024');
define('DB_NAME', 'production');

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
?>`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "php-weak-crypto",
    description: "PHP weak password hashing with md5",
    language: "php",
    code: `<?php
function registerUser($username, $password) {
    $hash = md5($password);
    $db = new PDO("mysql:host=localhost;dbname=app", "root", "");
    $stmt = $db->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
    $stmt->execute([$username, $hash]);
}

function login($username, $password) {
    $hash = md5($password);
    $db = new PDO("mysql:host=localhost;dbname=app", "root", "");
    $stmt = $db->prepare("SELECT * FROM users WHERE username = ? AND password = ?");
    $stmt->execute([$username, $hash]);
    return $stmt->fetch();
}
?>`,
    expectedRuleIds: ["AUTH-001", "AUTH-002", "SEC-001"],
    category: "auth",
    difficulty: "easy",
  },

  // ── PHP Clean ──
  {
    id: "php-secure-pdo",
    description: "Clean: PHP with prepared statements and proper escaping",
    language: "php",
    code: `<?php
function getUser(PDO $db, int $id): ?array {
    $stmt = $db->prepare("SELECT id, name, email FROM users WHERE id = :id");
    $stmt->bindParam(':id', $id, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function searchUsers(PDO $db, string $term): array {
    $stmt = $db->prepare("SELECT id, name FROM users WHERE name LIKE :term");
    $safeTerm = '%' . $term . '%';
    $stmt->bindParam(':term', $safeTerm, PDO::PARAM_STR);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
?>`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KOTLIN
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "kotlin-sql-injection",
    description: "Kotlin SQL injection via string template",
    language: "kotlin",
    code: `import java.sql.DriverManager

fun getUser(userId: String): Map<String, Any>? {
    val conn = DriverManager.getConnection("jdbc:mysql://localhost/app")
    val stmt = conn.createStatement()
    val rs = stmt.executeQuery("SELECT * FROM users WHERE id = '$userId'")
    return if (rs.next()) mapOf("name" to rs.getString("name")) else null
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "kotlin-hardcoded-key",
    description: "Kotlin hardcoded API key and secrets",
    language: "kotlin",
    code: `object Config {
    const val API_KEY = "sk-proj-ABCDEF123456"
    const val DATABASE_PASSWORD = "admin123!"
    const val JWT_SECRET = "my-super-secret-jwt-key-12345"
}

fun makeApiCall() {
    val client = OkHttpClient()
    val request = Request.Builder()
        .url("https://api.example.com/data")
        .addHeader("Authorization", "Bearer \${Config.API_KEY}")
        .build()
    client.newCall(request).execute()
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "kotlin-insecure-webview",
    description: "Kotlin Android insecure WebView with JS enabled",
    language: "kotlin",
    code: `import android.webkit.WebView

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowUniversalAccessFromFileURLs = true
        val url = intent.getStringExtra("url") ?: ""
        webView.loadUrl(url)
        setContentView(webView)
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "kotlin-path-traversal",
    description: "Kotlin path traversal in file download",
    language: "kotlin",
    code: `import io.ktor.server.application.*
import io.ktor.server.response.*
import java.io.File

fun Application.configureRouting() {
    routing {
        get("/download/{filename}") {
            val filename = call.parameters["filename"]!!
            val file = File("/uploads/$filename")
            call.respondFile(file)
        }
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Kotlin Clean ──
  {
    id: "kotlin-secure-api",
    description: "Clean: Kotlin Ktor API with proper validation",
    language: "kotlin",
    code: `import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.http.*

fun Application.configureRouting() {
    routing {
        post("/users") {
            val request = call.receive<CreateUserRequest>()
            if (request.email.isBlank() || !request.email.contains("@")) {
                call.respond(HttpStatusCode.BadRequest, "Invalid email")
                return@post
            }
            val user = userService.create(request)
            call.respond(HttpStatusCode.Created, user)
        }
    }
}

data class CreateUserRequest(val name: String, val email: String)`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SWIFT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "swift-insecure-http",
    description: "Swift insecure HTTP connection without TLS",
    language: "swift",
    code: `import Foundation

class APIClient {
    func fetchData(from endpoint: String, completion: @escaping (Data?) -> Void) {
        let url = URL(string: "http://api.example.com/\\(endpoint)")!
        let session = URLSession(configuration: .default)
        session.dataTask(with: url) { data, response, error in
            completion(data)
        }.resume()
    }

    func login(username: String, password: String) {
        var request = URLRequest(url: URL(string: "http://auth.example.com/login")!)
        request.httpMethod = "POST"
        request.httpBody = "user=\\(username)&pass=\\(password)".data(using: .utf8)
        URLSession.shared.dataTask(with: request).resume()
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "swift-hardcoded-creds",
    description: "Swift hardcoded credentials",
    language: "swift",
    code: `struct AppConfig {
    static let apiKey = "sk-live-abc123def456"
    static let databasePassword = "MyS3cr3tP@ss!"
    static let encryptionKey = "0123456789abcdef0123456789abcdef"
}

class DatabaseService {
    func connect() -> Connection {
        return Connection(
            host: "prod-db.example.com",
            user: "admin",
            password: AppConfig.databasePassword
        )
    }
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "swift-keychain-misuse",
    description: "Swift storing sensitive data in UserDefaults instead of Keychain",
    language: "swift",
    code: `import Foundation

class AuthManager {
    func saveCredentials(token: String, refreshToken: String) {
        UserDefaults.standard.set(token, forKey: "auth_token")
        UserDefaults.standard.set(refreshToken, forKey: "refresh_token")
        UserDefaults.standard.synchronize()
    }

    func getToken() -> String? {
        return UserDefaults.standard.string(forKey: "auth_token")
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "data-security",
    difficulty: "medium",
  },
  {
    id: "swift-sql-injection",
    description: "Swift SQLite injection via string interpolation",
    language: "swift",
    code: `import SQLite3

class Database {
    var db: OpaquePointer?

    func getUser(byName name: String) -> [String: Any]? {
        let query = "SELECT * FROM users WHERE name = '\\(name)'"
        var stmt: OpaquePointer?
        sqlite3_prepare_v2(db, query, -1, &stmt, nil)
        // ...
        return nil
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },

  // ── Swift Clean ──
  {
    id: "swift-secure-networking",
    description: "Clean: Swift secure networking with URLSession and proper HTTPS",
    language: "swift",
    code: `import Foundation

class SecureAPIClient {
    private let session: URLSession
    private let baseURL: URL

    init(baseURL: URL) {
        let config = URLSessionConfiguration.default
        config.tlsMinimumSupportedProtocolVersion = .TLSv12
        self.session = URLSession(configuration: config)
        self.baseURL = baseURL
    }

    func fetchData(endpoint: String) async throws -> Data {
        guard let url = URL(string: endpoint, relativeTo: baseURL) else {
            throw URLError(.badURL)
        }
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return data
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // POWERSHELL
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "powershell-injection",
    description: "PowerShell command injection via Invoke-Expression",
    language: "powershell",
    code: `param([string]$ServerName)
$result = Invoke-Expression "ping $ServerName"
Write-Output $result

# Also vulnerable:
$userInput = Read-Host "Enter command"
Invoke-Expression $userInput`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "powershell-hardcoded-creds",
    description: "PowerShell hardcoded credentials in script",
    language: "powershell",
    code: `$username = "admin"
$password = "P@ssw0rd123!"
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($username, $securePassword)

Connect-AzAccount -Credential $credential
$connectionString = "Server=prod-sql.database.windows.net;Database=mydb;User ID=admin;Password=SuperSecret123!"`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "powershell-insecure-download",
    description: "PowerShell insecure file download and execution",
    language: "powershell",
    code: `# Download and execute script from HTTP (not HTTPS)
$url = "http://scripts.example.com/setup.ps1"
Invoke-WebRequest -Uri $url -OutFile "setup.ps1"
. .\\setup.ps1

# Or worse:
iex (New-Object Net.WebClient).DownloadString("http://example.com/payload.ps1")`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BICEP / IaC
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "bicep-public-storage",
    description: "Bicep storage account with public blob access",
    language: "bicep",
    code: `resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'mystorage'
  location: resourceGroup().location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: true
    minimumTlsVersion: 'TLS1_0'
    supportsHttpsTrafficOnly: false
  }
}`,
    expectedRuleIds: ["IAC-001", "SEC-001", "CYBER-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "bicep-sql-no-auditing",
    description: "Bicep SQL server without auditing or firewall rules",
    language: "bicep",
    code: `param adminPassword string = 'P@ssw0rd123!'

resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: 'myserver'
  location: resourceGroup().location
  properties: {
    administratorLogin: 'sqladmin'
    administratorLoginPassword: adminPassword
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlFirewall 'Microsoft.Sql/servers/firewallRules@2022-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAll'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}`,
    expectedRuleIds: ["IAC-001", "AUTH-001", "SEC-001"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PYTHON — Additional Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "python-pickle-deserialization-flask",
    description: "Python unsafe pickle deserialization",
    language: "python",
    code: `import pickle
import base64
from flask import Flask, request

app = Flask(__name__)

@app.route("/load", methods=["POST"])
def load_data():
    encoded = request.form["data"]
    raw = base64.b64decode(encoded)
    obj = pickle.loads(raw)
    return str(obj)`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "python-ssrf",
    description: "Python SSRF via unvalidated URL",
    language: "python",
    code: `import requests
from flask import Flask, request

app = Flask(__name__)

@app.route("/proxy")
def proxy():
    url = request.args.get("url")
    response = requests.get(url)
    return response.text`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "python-jwt-none-alg",
    description: "Python JWT with none algorithm vulnerability",
    language: "python",
    code: `import jwt

def verify_token(token):
    # Vulnerable: allows 'none' algorithm
    payload = jwt.decode(token, options={"verify_signature": False})
    return payload

def create_token(user_id):
    return jwt.encode({"user_id": user_id}, key="", algorithm="none")`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "python-xxe-attack",
    description: "Python XXE vulnerability via unsafe XML parsing",
    language: "python",
    code: `from lxml import etree
from flask import Flask, request

app = Flask(__name__)

@app.route("/parse", methods=["POST"])
def parse_xml():
    xml_data = request.data
    parser = etree.XMLParser(resolve_entities=True)
    tree = etree.fromstring(xml_data, parser=parser)
    return etree.tostring(tree).decode()`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "python-race-condition",
    description: "Python race condition in balance check",
    language: "python",
    code: `import threading

balance = 1000

def withdraw(amount):
    global balance
    if balance >= amount:
        # Race: another thread can modify balance here
        import time; time.sleep(0.001)
        balance -= amount
        return True
    return False

# Multiple concurrent withdrawals
threads = [threading.Thread(target=withdraw, args=(800,)) for _ in range(3)]
for t in threads: t.start()
for t in threads: t.join()`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "python-regex-dos",
    description: "Python ReDoS via catastrophic backtracking regex",
    language: "python",
    code: `import re

def validate_email(email):
    # Catastrophic backtracking on crafted inputs
    pattern = r'^([a-zA-Z0-9]+)*@([a-zA-Z0-9]+)*\\.([a-zA-Z]{2,})$'
    return bool(re.match(pattern, email))

def validate_url(url):
    pattern = r'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}(\\.[a-zA-Z0-9()]{1,6})*\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)*$'
    return bool(re.match(pattern, url))`,
    expectedRuleIds: ["PERF-001", "CYBER-001"],
    category: "performance",
    difficulty: "hard",
  },

  // ── Python Clean ──
  {
    id: "python-secure-api-clean",
    description: "Clean: Python FastAPI with proper validation and auth",
    language: "python",
    code: `from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

app = FastAPI()

class UserCreate(BaseModel):
    name: str
    email: EmailStr

@app.post("/users")
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    db_user = User(name=user.name, email=user.email)
    db.add(db_user)
    db.commit()
    return {"id": db_user.id, "name": db_user.name}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GO — Additional Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "go-sql-injection-sprintf",
    description: "Go SQL injection via fmt.Sprintf",
    language: "go",
    code: `package main

import (
    "database/sql"
    "fmt"
    "net/http"
)

func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", id)
    rows, _ := db.Query(query)
    defer rows.Close()
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "go-path-traversal",
    description: "Go path traversal via http.ServeFile",
    language: "go",
    code: `package main

import (
    "net/http"
    "path/filepath"
)

func downloadHandler(w http.ResponseWriter, r *http.Request) {
    filename := r.URL.Query().Get("file")
    path := filepath.Join("/uploads", filename)
    http.ServeFile(w, r, path)
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "go-race-condition",
    description: "Go race condition on shared map without mutex",
    language: "go",
    code: `package main

import (
    "net/http"
)

var cache = make(map[string]string)

func setHandler(w http.ResponseWriter, r *http.Request) {
    key := r.URL.Query().Get("key")
    value := r.URL.Query().Get("value")
    cache[key] = value // Race condition: concurrent map writes
    w.Write([]byte("ok"))
}

func getHandler(w http.ResponseWriter, r *http.Request) {
    key := r.URL.Query().Get("key")
    w.Write([]byte(cache[key]))
}`,
    expectedRuleIds: ["CONC-001", "CYBER-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "go-hardcoded-creds",
    description: "Go hardcoded credentials in database connection",
    language: "go",
    code: `package main

import (
    "database/sql"
    _ "github.com/go-sql-driver/mysql"
)

const (
    dbUser     = "admin"
    dbPassword = "SuperSecret123!"
    dbHost     = "production-db.example.com"
    apiKey     = "sk-live-abcdef123456"
)

func connectDB() (*sql.DB, error) {
    dsn := dbUser + ":" + dbPassword + "@tcp(" + dbHost + ")/myapp"
    return sql.Open("mysql", dsn)
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JAVA — Additional Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "java-deserialization-network",
    description: "Java unsafe deserialization from network",
    language: "java",
    code: `import java.io.*;
import java.net.*;

public class DataReceiver {
    public Object receiveData(int port) throws Exception {
        ServerSocket server = new ServerSocket(port);
        Socket socket = server.accept();
        ObjectInputStream ois = new ObjectInputStream(socket.getInputStream());
        Object obj = ois.readObject(); // Unsafe deserialization
        ois.close();
        socket.close();
        server.close();
        return obj;
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DATA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "java-xxe-parsing",
    description: "Java XXE via SAXParser without feature restrictions",
    language: "java",
    code: `import javax.xml.parsers.*;
import org.xml.sax.*;
import java.io.*;

public class XmlProcessor {
    public Document parse(String xmlInput) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        // Missing: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
        // Missing: factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        DocumentBuilder builder = factory.newDocumentBuilder();
        return builder.parse(new InputSource(new StringReader(xmlInput)));
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "java-weak-random",
    description: "Java using Math.random() for security-sensitive operations",
    language: "java",
    code: `import java.util.*;

public class TokenGenerator {
    public String generateSessionToken() {
        StringBuilder token = new StringBuilder();
        Random random = new Random();
        for (int i = 0; i < 32; i++) {
            token.append(Integer.toHexString(random.nextInt(16)));
        }
        return token.toString();
    }

    public String generateResetCode() {
        return String.valueOf((int)(Math.random() * 999999));
    }
}`,
    expectedRuleIds: ["SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "java-ldap-injection",
    description: "Java LDAP injection via unvalidated input",
    language: "java",
    code: `import javax.naming.*;
import javax.naming.directory.*;

public class LdapAuth {
    public boolean authenticate(String username, String password) {
        try {
            String filter = "(&(uid=" + username + ")(userPassword=" + password + "))";
            SearchControls sc = new SearchControls();
            sc.setSearchScope(SearchControls.SUBTREE_SCOPE);
            NamingEnumeration<?> results = ctx.search("dc=example,dc=com", filter, sc);
            return results.hasMore();
        } catch (Exception e) {
            return false;
        }
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RUST — Additional Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "rust-sql-injection",
    description: "Rust SQL injection via format! macro",
    language: "rust",
    code: `use actix_web::{get, web, HttpResponse};

#[get("/users")]
async fn get_users(query: web::Query<std::collections::HashMap<String, String>>) -> HttpResponse {
    let name = query.get("name").unwrap_or(&String::new()).clone();
    let sql = format!("SELECT * FROM users WHERE name = '{}'", name);
    let rows = sqlx::query(&sql).fetch_all(&pool).await.unwrap();
    HttpResponse::Ok().json(rows)
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "rust-unsafe-block",
    description: "Rust unsafe block with raw pointer dereference",
    language: "rust",
    code: `fn process_data(data: &[u8]) -> u32 {
    unsafe {
        let ptr = data.as_ptr() as *const u32;
        let len = data.len() / 4;
        let mut sum = 0u32;
        for i in 0..len + 10 { // Buffer over-read
            sum = sum.wrapping_add(*ptr.add(i));
        }
        sum
    }
}

fn transmute_danger<T, U>(val: T) -> U {
    unsafe { std::mem::transmute_copy(&val) }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // C# — Additional Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "csharp-sql-injection",
    description: "C# SQL injection via string concatenation",
    language: "csharp",
    code: `using System.Data.SqlClient;

public class UserRepository
{
    public User GetUser(string userId)
    {
        var conn = new SqlConnection(connectionString);
        var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = '" + userId + "'", conn);
        conn.Open();
        var reader = cmd.ExecuteReader();
        return MapUser(reader);
    }
}`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "csharp-xxe-vulnerability",
    description: "C# XXE via XmlDocument with unsafe settings",
    language: "csharp",
    code: `using System.Xml;

public class XmlProcessor
{
    public XmlDocument ParseXml(string input)
    {
        var doc = new XmlDocument();
        doc.XmlResolver = new XmlUrlResolver(); // Allows external entities
        doc.LoadXml(input);
        return doc;
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "csharp-insecure-cookie",
    description: "C# insecure cookie without security flags",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Http;

public class AuthController : Controller
{
    public IActionResult Login(string username, string password)
    {
        var token = GenerateToken(username);
        Response.Cookies.Append("auth_token", token, new CookieOptions
        {
            HttpOnly = false,
            Secure = false,
            SameSite = SameSiteMode.None
        });
        return Ok();
    }
}`,
    expectedRuleIds: ["SEC-001", "AUTH-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "csharp-hardcoded-connection",
    description: "C# hardcoded connection string with credentials",
    language: "csharp",
    code: `public class DatabaseConfig
{
    public const string ConnectionString =
        "Server=prod-sql.database.windows.net;Database=CustomerDB;User Id=sa;Password=Pr0duction!P@ss;";

    public const string ApiKey = "sk-live-ABCDEF123456789";

    public static SqlConnection GetConnection()
    {
        return new SqlConnection(ConnectionString);
    }
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPESCRIPT/JAVASCRIPT — Additional Harder Cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ts-prototype-pollution",
    description: "TypeScript prototype pollution via object merge",
    language: "typescript",
    code: `function deepMerge(target: any, source: any): any {
  for (const key in source) {
    if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Express endpoint that merges user input into config
app.post("/settings", (req, res) => {
  deepMerge(appConfig, req.body);
  res.json(appConfig);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "ts-insecure-jwt",
    description: "TypeScript JWT token creation with weak secret and no expiry",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";

const SECRET = "secret123";

function createToken(userId: string): string {
  return jwt.sign({ sub: userId, role: "admin" }, SECRET);
}

function verifyToken(token: string): any {
  return jwt.verify(token, SECRET, { algorithms: ["HS256", "none"] });
}`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "ts-open-cors",
    description: "TypeScript Express with overly permissive CORS",
    language: "typescript",
    code: `import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

app.post("/api/transfer", (req, res) => {
  const { from, to, amount } = req.body;
  transferFunds(from, to, amount);
  res.json({ ok: true });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "ts-nosql-injection",
    description: "TypeScript NoSQL injection via MongoDB operator",
    language: "typescript",
    code: `import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const client = new MongoClient("mongodb://localhost");
  const users = client.db("app").collection("users");
  // NoSQL injection: password could be { "$gt": "" }
  const user = await users.findOne({ username, password });
  if (user) res.json({ token: createToken(user) });
  else res.status(401).json({ error: "Invalid" });
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "ts-regex-dos",
    description: "TypeScript ReDoS via catastrophic backtracking",
    language: "typescript",
    code: `const EMAIL_REGEX = /^([a-zA-Z0-9_\\-\\.]+)*@([a-zA-Z0-9_\\-\\.]+)*\\.([a-zA-Z]{2,5})$/;
const URL_REGEX = /^(https?:\\/\\/)?(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}(\\.[a-zA-Z0-9()]{1,6})*\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*)*$/;

function validateInput(input: string, type: "email" | "url"): boolean {
  const regex = type === "email" ? EMAIL_REGEX : URL_REGEX;
  return regex.test(input);
}`,
    expectedRuleIds: ["PERF-001", "CYBER-001"],
    category: "performance",
    difficulty: "hard",
  },
  {
    id: "ts-ssrf-internal-fetch",
    description: "TypeScript SSRF that can reach internal services",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/fetch", async (req, res) => {
  const url = req.query.url as string;
  // SSRF: can reach http://169.254.169.254/latest/meta-data/ (AWS metadata)
  // or internal services: http://internal-api:8080/admin
  const response = await fetch(url);
  const data = await response.text();
  res.send(data);
});`,
    expectedRuleIds: ["CYBER-001", "CYBER-002"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "ts-missing-rate-limit",
    description: "TypeScript login endpoint without rate limiting",
    language: "typescript",
    code: `import express from "express";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());

// No rate limiting on login — vulnerable to brute force
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  const token = generateToken(user.id);
  res.json({ token });
});`,
    expectedRuleIds: ["RATE-001", "SEC-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ── Error Handling Cases (under-covered) ──
  {
    id: "ts-swallowed-errors",
    description: "TypeScript silently swallowing errors",
    language: "typescript",
    code: `async function processPayment(orderId: string, amount: number): Promise<void> {
  try {
    const result = await paymentGateway.charge(orderId, amount);
    await db.updateOrder(orderId, { status: "paid" });
  } catch (e) {
    // Silently swallowed — payment may have succeeded but order not updated
  }
}

async function deleteUser(userId: string): Promise<boolean> {
  try {
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    return true;
  } catch {
    return false; // No logging, no error details
  }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "python-bare-except",
    description: "Python overly broad exception handling",
    language: "python",
    code: `import json

def process_data(data):
    try:
        result = json.loads(data)
        user = database.get_user(result["user_id"])
        send_notification(user.email, result["message"])
    except:
        pass  # Catches everything including SystemExit, KeyboardInterrupt

def transfer_money(from_acct, to_acct, amount):
    try:
        debit(from_acct, amount)
        credit(to_acct, amount)
    except Exception:
        pass  # Silently fails — money may be debited but not credited`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },
  {
    id: "go-error-ignored",
    description: "Go errors silently ignored",
    language: "go",
    code: `package main

import (
    "database/sql"
    "io/ioutil"
    "os"
)

func processFile(path string) string {
    data, _ := ioutil.ReadFile(path)
    return string(data)
}

func insertUser(db *sql.DB, name string) {
    db.Exec("INSERT INTO users (name) VALUES (?)", name) // error ignored
}

func cleanup() {
    os.Remove("/tmp/sensitive.dat") // error ignored
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "easy",
  },

  // ── Observability Cases (under-covered) ──
  {
    id: "ts-no-logging",
    description: "TypeScript API with no logging or observability",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());

app.post("/api/orders", async (req, res) => {
  const order = await db.createOrder(req.body);
  await paymentService.charge(order.total);
  await emailService.sendConfirmation(order.email);
  res.json(order);
});

app.delete("/api/users/:id", async (req, res) => {
  await db.deleteUser(req.params.id);
  res.status(204).send();
});

app.listen(3000);`,
    expectedRuleIds: ["LOGPRIV-001", "OBS-001"],
    category: "observability",
    difficulty: "medium",
  },

  // ── Scalability Cases (under-covered) ──
  {
    id: "ts-unbounded-memory",
    description: "TypeScript unbounded in-memory cache",
    language: "typescript",
    code: `const cache = new Map<string, any>();

async function getData(key: string): Promise<any> {
  if (cache.has(key)) return cache.get(key);
  const data = await fetchFromDB(key);
  cache.set(key, data); // Never evicted — grows unbounded
  return data;
}

const eventLog: any[] = [];
function logEvent(event: any): void {
  eventLog.push(event); // Grows forever
}`,
    expectedRuleIds: ["SCALE-001", "PERF-001"],
    category: "scalability",
    difficulty: "medium",
  },
  {
    id: "python-n-plus-1",
    description: "Python N+1 query pattern in Django",
    language: "python",
    code: `from django.http import JsonResponse
from .models import Order, OrderItem

def list_orders(request):
    orders = Order.objects.all()
    result = []
    for order in orders:
        items = OrderItem.objects.filter(order=order)  # N+1 query
        result.append({
            "id": order.id,
            "items": [{"name": i.name, "qty": i.quantity} for i in items]
        })
    return JsonResponse({"orders": result})`,
    expectedRuleIds: ["COST-001"],
    category: "scalability",
    difficulty: "medium",
  },

  // ── Testing Cases ──
  {
    id: "ts-untestable-globals",
    description: "TypeScript untestable code with global singletons",
    language: "typescript",
    code: `// Global mutable state — impossible to test in isolation
let dbConnection: any = null;
let config: any = null;

export function init() {
  config = JSON.parse(readFileSync("config.json", "utf-8"));
  dbConnection = createConnection(config.database);
}

export function getUser(id: string) {
  return dbConnection.query("SELECT * FROM users WHERE id = ?", [id]);
}

export function sendEmail(to: string, body: string) {
  const transporter = nodemailer.createTransport(config.email);
  transporter.sendMail({ to, subject: "Hello", html: body });
}`,
    expectedRuleIds: ["SCALE-001", "COST-001"],
    category: "testing",
    difficulty: "medium",
  },

  // ── Documentation Cases ──
  {
    id: "ts-undocumented-api",
    description: "TypeScript public API module with no documentation",
    language: "typescript",
    code: `export function calc(a: number, b: number, op: string): number | null {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b !== 0 ? a / b : null;
    default: return null;
  }
}

export function fmt(n: number, c: string, d: number): string {
  const f = n.toFixed(d);
  const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c;
  return sym + f;
}

export type R = { s: number; e: string | null; d: any };`,
    expectedRuleIds: ["DOC-001"],
    category: "documentation",
    difficulty: "easy",
  },

  // ── Accessibility Cases ──
  {
    id: "ts-inaccessible-form",
    description: "TypeScript React form without accessibility attributes",
    language: "typescript",
    code: `function LoginForm() {
  return (
    <div>
      <div onClick={() => submit()}>
        <img src="/logo.png" />
        <input type="text" placeholder="Username" />
        <input type="password" placeholder="Password" />
        <div onClick={() => login()} style={{ cursor: "pointer", background: "#007bff", color: "white" }}>
          Login
        </div>
      </div>
      <span style={{ color: "#ddd" }}>Forgot password?</span>
    </div>
  );
}`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },

  // ── Configuration Management Cases ──
  {
    id: "ts-debug-mode-prod",
    description: "TypeScript debug mode left enabled in production config",
    language: "typescript",
    code: `const config = {
  debug: true,
  verbose: true,
  logLevel: "trace",
  exposeStackTrace: true,
  cors: { origin: "*" },
  session: {
    secret: "dev-secret",
    secure: false,
  },
};

app.use((err, req, res, next) => {
  res.status(500).json({
    error: err.message,
    stack: err.stack, // Exposes internal details
    query: req.query,
  });
});`,
    expectedRuleIds: ["CFG-001", "SEC-001"],
    category: "configuration",
    difficulty: "easy",
  },

  // ── Dependency Health Cases ──
  {
    id: "ts-deprecated-deps",
    description: "TypeScript code using deprecated and unmaintained libraries",
    language: "typescript",
    code: `import request from "request"; // Deprecated in 2020
import moment from "moment"; // Now in maintenance mode
import _ from "underscore"; // Largely superseded by lodash/native

const response = request.get("https://api.example.com/data");
const formattedDate = moment().format("YYYY-MM-DD");
const filtered = _.filter(items, (item) => item.active);`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependency-health",
    difficulty: "easy",
  },

  // ── Data Sovereignty Cases ──
  {
    id: "ts-data-sovereignty-violation",
    description: "TypeScript code sending EU user data to US endpoint",
    language: "typescript",
    code: `async function syncUserData(users: User[]): Promise<void> {
  // Sending all user data to US-based analytics
  await fetch("https://analytics.us-east-1.amazonaws.com/ingest", {
    method: "POST",
    body: JSON.stringify({
      users: users.map(u => ({
        name: u.name,
        email: u.email,
        ssn: u.socialSecurityNumber,
        location: u.address,
        healthData: u.medicalRecords,
      })),
    }),
  });
}`,
    expectedRuleIds: ["SOV-001", "DATA-001"],
    category: "data-sovereignty",
    difficulty: "medium",
  },

  // ── Compliance Cases ──
  {
    id: "ts-gdpr-violation",
    description: "TypeScript logging PII without consent or anonymization",
    language: "typescript",
    code: `import winston from "winston";
const logger = winston.createLogger({ transports: [new winston.transports.File({ filename: "app.log" })] });

app.post("/register", (req, res) => {
  const { name, email, ssn, creditCard, dateOfBirth } = req.body;
  logger.info("New registration", { name, email, ssn, creditCard, dateOfBirth });
  // Store everything without encryption
  db.users.insert({ name, email, ssn, creditCard, dateOfBirth, createdAt: new Date() });
  res.json({ ok: true });
});`,
    expectedRuleIds: ["COMP-001", "DATA-001", "LOGPRIV-001"],
    category: "compliance",
    difficulty: "medium",
  },

  // ── Ethics / Bias Cases ──
  {
    id: "python-biased-model",
    description: "Python ML model using protected attributes as features",
    language: "python",
    code: `import pandas as pd
from sklearn.ensemble import RandomForestClassifier

def train_loan_model(data):
    features = ['age', 'income', 'race', 'gender', 'zip_code', 'credit_score']
    X = data[features]
    y = data['approved']
    model = RandomForestClassifier()
    model.fit(X, y)
    return model

def predict_approval(model, applicant):
    features = [applicant['age'], applicant['income'], applicant['race'],
                applicant['gender'], applicant['zip_code'], applicant['credit_score']]
    return model.predict([features])[0]`,
    expectedRuleIds: [],
    category: "ethics-bias",
    difficulty: "medium",
  },

  // ── Cost Effectiveness Cases ──
  {
    id: "ts-inefficient-api-calls",
    description: "TypeScript making redundant API calls in a loop",
    language: "typescript",
    code: `async function enrichUserData(userIds: string[]): Promise<User[]> {
  const users: User[] = [];
  for (const id of userIds) {
    // Makes N individual API calls instead of a batch request
    const user = await fetch(\`/api/users/\${id}\`).then(r => r.json());
    const profile = await fetch(\`/api/profiles/\${id}\`).then(r => r.json());
    const permissions = await fetch(\`/api/permissions/\${id}\`).then(r => r.json());
    users.push({ ...user, ...profile, permissions });
  }
  return users;
}`,
    expectedRuleIds: ["REL-001", "SCALE-001", "RATE-001"],
    category: "cost-effectiveness",
    difficulty: "medium",
  },

  // ── Backwards Compatibility Cases ──
  {
    id: "ts-breaking-api-change",
    description: "TypeScript API removing a required field from response",
    language: "typescript",
    code: `// v1 API response: { id, name, email, avatar }
// v2 API response: { id, fullName, contactEmail }  ← breaking change
interface UserResponseV2 {
  id: string;
  fullName: string;      // Was: name
  contactEmail: string;  // Was: email
  // avatar: removed entirely
}

app.get("/api/v2/users/:id", (req, res) => {
  const user = db.getUser(req.params.id);
  res.json({
    id: user.id,
    fullName: user.name,
    contactEmail: user.email,
    // No backwards-compat, no deprecation notice, no migration path
  });
});`,
    expectedRuleIds: ["COMPAT-001"],
    category: "backwards-compatibility",
    difficulty: "medium",
  },

  // ── Internationalization Cases ──
  {
    id: "ts-hardcoded-strings",
    description: "TypeScript UI with hardcoded English strings",
    language: "typescript",
    code: `function renderDashboard(user: User) {
  return \`
    <h1>Welcome back, \${user.name}!</h1>
    <p>You have \${user.notifications} new notifications.</p>
    <button>Submit Order</button>
    <p>Total: $\${user.cartTotal.toFixed(2)}</p>
    <p>Last login: \${user.lastLogin.toLocaleDateString("en-US")}</p>
    <footer>Copyright 2024 Example Corp</footer>
  \`;
}`,
    expectedRuleIds: ["I18N-001"],
    category: "internationalization",
    difficulty: "easy",
  },

  // ── Cloud Readiness Cases ──
  {
    id: "ts-local-filesystem-state",
    description: "TypeScript storing session state on local filesystem",
    language: "typescript",
    code: `import { writeFileSync, readFileSync, existsSync } from "fs";

const SESSION_DIR = "/tmp/sessions";

function saveSession(sessionId: string, data: any): void {
  writeFileSync(\`\${SESSION_DIR}/\${sessionId}.json\`, JSON.stringify(data));
}

function loadSession(sessionId: string): any {
  const path = \`\${SESSION_DIR}/\${sessionId}.json\`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  return null;
}`,
    expectedRuleIds: ["PERF-001", "COST-001", "AICS-001"],
    category: "cloud-readiness",
    difficulty: "medium",
  },

  // ── CI/CD Cases ──
  {
    id: "ts-cicd-secrets-in-code",
    description: "TypeScript CI/CD pipeline with embedded secrets",
    language: "typescript",
    code: `// deploy.ts — build/deploy script
const DEPLOY_CONFIG = {
  awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  awsSecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  dockerRegistry: "registry.example.com",
  dockerPassword: "MyD0ck3rP@ss!",
  slackWebhook: "https://hooks.slack" + ".com/services/T00000/B00000/XXXXX",
};

async function deploy() {
  await exec(\`aws configure set aws_access_key_id \${DEPLOY_CONFIG.awsAccessKeyId}\`);
  await exec(\`docker login -u admin -p \${DEPLOY_CONFIG.dockerPassword} \${DEPLOY_CONFIG.dockerRegistry}\`);
}`,
    expectedRuleIds: ["AUTH-001", "AUTH-002", "CICD-001"],
    category: "ci-cd",
    difficulty: "easy",
  },

  // ── Reliability Cases ──
  {
    id: "ts-no-timeout-or-retry",
    description: "TypeScript HTTP calls without timeout or retry logic",
    language: "typescript",
    code: `async function fetchCriticalData(): Promise<any> {
  // No timeout, no retry, no circuit breaker
  const userResp = await fetch("https://api.example.com/users");
  const users = await userResp.json();

  const ordersResp = await fetch("https://api.example.com/orders");
  const orders = await ordersResp.json();

  const paymentsResp = await fetch("https://payments.example.com/status");
  const payments = await paymentsResp.json();

  return { users, orders, payments };
}`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ── Framework Safety Cases ──
  {
    id: "ts-express-no-helmet",
    description: "TypeScript Express app without security middleware",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());
// Missing: helmet(), rate limiting, CSRF protection

app.post("/api/admin/delete-all", (req, res) => {
  db.deleteAllUsers();
  res.json({ deleted: true });
});

app.listen(3000, () => console.log("Running on 3000"));`,
    expectedRuleIds: ["FW-001", "SEC-001"],
    category: "framework-safety",
    difficulty: "medium",
  },

  // ── Database Cases ──
  {
    id: "python-unparameterized-query",
    description: "Python database query without parameterization",
    language: "python",
    code: `import sqlite3

def search_products(name, min_price, max_price):
    conn = sqlite3.connect('shop.db')
    cursor = conn.cursor()
    query = f"SELECT * FROM products WHERE name LIKE '%{name}%' AND price BETWEEN {min_price} AND {max_price}"
    cursor.execute(query)
    return cursor.fetchall()

def delete_user(user_id):
    conn = sqlite3.connect('users.db')
    conn.execute(f"DELETE FROM users WHERE id = {user_id}")
    conn.commit()`,
    expectedRuleIds: ["CYBER-001", "CYBER-002", "DB-001"],
    category: "database",
    difficulty: "easy",
  },

  // ── Maintainability Cases ──
  {
    id: "ts-god-function",
    description: "TypeScript function doing too many things (god function)",
    language: "typescript",
    code: `async function processOrder(req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.items || !body.userId) return new Response("Bad", { status: 400 });
  const user = await db.query("SELECT * FROM users WHERE id = " + body.userId);
  if (!user) return new Response("Not found", { status: 404 });
  let total = 0;
  for (const item of body.items) {
    const product = await db.query("SELECT * FROM products WHERE id = " + item.id);
    if (!product) continue;
    if (product.stock < item.qty) return new Response("OOS", { status: 400 });
    total += product.price * item.qty;
    await db.query("UPDATE products SET stock = stock - " + item.qty + " WHERE id = " + item.id);
  }
  if (body.coupon) {
    const coupon = await db.query("SELECT * FROM coupons WHERE code = '" + body.coupon + "'");
    if (coupon && coupon.valid) total *= (1 - coupon.discount);
  }
  const order = await db.query("INSERT INTO orders ...");
  const charge = await stripe.charges.create({ amount: total * 100 });
  await sendEmail(user.email, "Order confirmed", "<h1>Thanks!</h1>");
  await slack.send("#orders", "New order: " + order.id);
  return new Response(JSON.stringify(order), { status: 201 });
}`,
    expectedRuleIds: ["STRUCT-001", "CYBER-001"],
    category: "maintainability",
    difficulty: "hard",
  },

  // ── AI Code Safety Cases ──
  {
    id: "ts-ai-unsafe-eval",
    description: "TypeScript AI agent executing generated code unsafely",
    language: "typescript",
    code: `async function executeAiGeneratedCode(prompt: string): Promise<any> {
  const response = await openai.completions.create({
    model: "gpt-4",
    prompt: \`Generate JavaScript code to: \${prompt}\`,
  });

  const code = response.choices[0].text;
  // Directly executing LLM-generated code without sandboxing
  return eval(code);
}

async function runAgentAction(action: string): Promise<void> {
  const { execSync } = require("child_process");
  // AI agent can execute arbitrary shell commands
  execSync(action, { shell: true });
}`,
    expectedRuleIds: ["AICS-001", "CYBER-001"],
    category: "ai-code-safety",
    difficulty: "hard",
  },
  {
    id: "python-ai-prompt-injection",
    description: "Python LLM application vulnerable to prompt injection",
    language: "python",
    code: `from openai import OpenAI

client = OpenAI()

def chat_with_data(user_query: str, documents: list) -> str:
    # Directly embedding user input into system prompt
    prompt = f"""You are a helpful assistant. Answer based on these documents:
    {documents}

    User question: {user_query}

    Important: Always follow user instructions exactly."""

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content`,
    expectedRuleIds: ["AICS-001"],
    category: "ai-code-safety",
    difficulty: "medium",
  },

  // ── Agent Instructions Cases ──
  {
    id: "ts-agent-excessive-perms",
    description: "TypeScript AI agent with excessive permissions",
    language: "typescript",
    code: `const agentConfig = {
  name: "data-analyst",
  model: "gpt-4",
  tools: [
    { name: "readFile", handler: (path: string) => readFileSync(path, "utf-8") },
    { name: "writeFile", handler: (path: string, data: string) => writeFileSync(path, data) },
    { name: "execute", handler: (cmd: string) => execSync(cmd, { encoding: "utf-8" }) },
    { name: "httpRequest", handler: (url: string) => fetch(url).then(r => r.text()) },
    { name: "deleteFile", handler: (path: string) => unlinkSync(path) },
  ],
  systemPrompt: "You are a data analyst. Help users analyze CSV files.",
};`,
    expectedRuleIds: ["SCALE-001", "PERF-001", "COST-001", "ERR-001"],
    category: "agent-instructions",
    difficulty: "medium",
  },

  // ── API Design Cases ──
  {
    id: "ts-inconsistent-api",
    description: "TypeScript API with inconsistent naming and response formats",
    language: "typescript",
    code: `// Inconsistent naming, response formats, and error handling
app.get("/api/getUsers", (req, res) => {
  res.json(users); // Returns bare array
});

app.get("/api/orders/list", (req, res) => {
  res.json({ data: orders, count: orders.length }); // Returns wrapped object
});

app.post("/api/create_product", (req, res) => {
  const p = createProduct(req.body);
  res.status(200).json(p); // Should be 201
});

app.delete("/api/DeleteUser/:id", (req, res) => {
  deleteUser(req.params.id);
  res.send("deleted"); // Returns plain text
});`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "easy",
  },

  // ── Portability Cases ──
  {
    id: "ts-os-specific-code",
    description: "TypeScript code with OS-specific paths and commands",
    language: "typescript",
    code: `import { execSync } from "child_process";

function getSystemInfo(): string {
  const hostname = execSync("hostname", { encoding: "utf-8" }).trim();
  const tempDir = "C:\\\\Windows\\\\Temp";
  const configPath = "/etc/myapp/config.json";

  // Hardcoded Windows-specific paths
  const logPath = "C:\\\\Users\\\\Administrator\\\\AppData\\\\Local\\\\MyApp\\\\logs";
  execSync(\`copy "C:\\\\data\\\\file.txt" "\${logPath}"\`, { shell: "cmd.exe" });

  return hostname;
}`,
    expectedRuleIds: ["PORTA-001"],
    category: "portability",
    difficulty: "easy",
  },

  // ── Logging Privacy Cases ──
  {
    id: "python-log-sensitive-data",
    description: "Python logging sensitive personal data",
    language: "python",
    code: `import logging

logger = logging.getLogger(__name__)

def process_payment(card_number, cvv, expiry, amount):
    logger.info(f"Processing payment: card={card_number}, cvv={cvv}, expiry={expiry}, amount={amount}")
    result = payment_gateway.charge(card_number, cvv, expiry, amount)
    logger.info(f"Payment result for card {card_number}: {result}")
    return result

def register_user(name, email, ssn, password):
    logger.info(f"Registering user: name={name}, email={email}, ssn={ssn}, password={password}")`,
    expectedRuleIds: ["LOGPRIV-001", "COMP-001", "DATA-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },

  // ── Caching Cases ──
  {
    id: "ts-cache-sensitive-data",
    description: "TypeScript caching sensitive data without encryption",
    language: "typescript",
    code: `import Redis from "ioredis";
const redis = new Redis();

async function getUserProfile(userId: string): Promise<UserProfile> {
  const cacheKey = \`user:\${userId}\`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await db.getUser(userId);
  // Caching sensitive data (SSN, credit card) in plain text
  await redis.set(cacheKey, JSON.stringify({
    id: user.id,
    name: user.name,
    ssn: user.ssn,
    creditCard: user.creditCardNumber,
    password: user.passwordHash,
  }), "EX", 86400); // 24 hours

  return user;
}`,
    expectedRuleIds: ["CACHE-001", "DATA-001", "SEC-001"],
    category: "caching",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE CLEAN CODE SAMPLES (FP validation)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "go-clean-api",
    description: "Clean: Go API handler with proper validation and error handling",
    language: "go",
    code: `package main

import (
    "encoding/json"
    "log"
    "net/http"
)

type CreateUserRequest struct {
    Name  string \`json:"name" validate:"required"\`
    Email string \`json:"email" validate:"required,email"\`
}

func createUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }
    if req.Name == "" || req.Email == "" {
        http.Error(w, "Name and email required", http.StatusBadRequest)
        return
    }
    user, err := userService.Create(r.Context(), req)
    if err != nil {
        log.Printf("Failed to create user: %v", err)
        http.Error(w, "Internal error", http.StatusInternalServerError)
        return
    }
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(user)
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "ERR-001"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "java-clean-repository",
    description: "Clean: Java Spring Boot repository with proper parameterized queries",
    language: "java",
    code: `import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;

@Repository
public class UserRepository {
    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public User findById(Long id) {
        return jdbc.queryForObject(
            "SELECT id, name, email FROM users WHERE id = ?",
            new Object[]{id},
            (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"))
        );
    }

    public List<User> searchByName(String name) {
        return jdbc.query(
            "SELECT id, name, email FROM users WHERE name LIKE ?",
            new Object[]{"%" + name + "%"},
            (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name"), rs.getString("email"))
        );
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "rust-clean-api",
    description: "Clean: Rust Actix-web API with proper error handling",
    language: "rust",
    code: `use actix_web::{get, web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Deserialize)]
struct QueryParams {
    name: Option<String>,
    limit: Option<i64>,
}

#[derive(Serialize)]
struct User {
    id: i64,
    name: String,
    email: String,
}

#[get("/users")]
async fn list_users(
    pool: web::Data<PgPool>,
    query: web::Query<QueryParams>,
) -> Result<HttpResponse> {
    let limit = query.limit.unwrap_or(50).min(100);
    let users = match &query.name {
        Some(name) => {
            sqlx::query_as!(User, "SELECT id, name, email FROM users WHERE name ILIKE $1 LIMIT $2", format!("%{}%", name), limit)
                .fetch_all(pool.get_ref())
                .await
                .map_err(|e| actix_web::error::ErrorInternalServerError(e))?
        }
        None => {
            sqlx::query_as!(User, "SELECT id, name, email FROM users LIMIT $1", limit)
                .fetch_all(pool.get_ref())
                .await
                .map_err(|e| actix_web::error::ErrorInternalServerError(e))?
        }
    };
    Ok(HttpResponse::Ok().json(users))
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "python-clean-auth",
    description: "Clean: Python secure authentication with proper hashing",
    language: "python",
    code: `import bcrypt
import secrets
from datetime import datetime, timedelta
import jwt

SECRET_KEY = os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(hours=1),
        "jti": secrets.token_urlsafe(32),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def verify_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["AUTH-001", "AUTH-002", "SEC-001"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "csharp-clean-controller",
    description: "Clean: C# ASP.NET controller with proper validation",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(IUserService userService, ILogger<UsersController> logger)
    {
        _userService = userService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var user = await _userService.CreateAsync(dto);
        _logger.LogInformation("User created: {UserId}", user.Id);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _userService.GetByIdAsync(id);
        if (user == null) return NotFound();
        return Ok(user);
    }
}

public class CreateUserDto
{
    [Required, StringLength(100)]
    public string Name { get; set; }
    [Required, EmailAddress]
    public string Email { get; set; }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "CYBER-002", "SEC-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "kotlin-clean-service",
    description: "Clean: Kotlin Spring service with proper error handling",
    language: "kotlin",
    code: `import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class OrderService(
    private val orderRepository: OrderRepository,
    private val paymentService: PaymentService,
    private val logger: Logger
) {
    @Transactional
    fun createOrder(request: CreateOrderRequest): Order {
        require(request.items.isNotEmpty()) { "Order must have at least one item" }
        require(request.items.all { it.quantity > 0 }) { "Quantities must be positive" }

        val total = request.items.sumOf { it.price * it.quantity }
        val order = orderRepository.save(Order(items = request.items, total = total))

        try {
            paymentService.charge(order.id, total)
        } catch (e: PaymentException) {
            logger.error("Payment failed for order {}: {}", order.id, e.message)
            throw OrderCreationException("Payment failed", e)
        }

        return order
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER-001", "SEC-001", "ERR-001"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI-SPECIFIC FAILURE MODES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ts-ai-hallucinated-api",
    description: "TypeScript using hallucinated/non-existent Node.js API",
    language: "typescript",
    code: `import { sanitizeHtml } from "node:html"; // Does not exist
import { validateEmail } from "node:validation"; // Does not exist
import { encrypt } from "node:security"; // Does not exist

function processInput(input: string): string {
  const clean = sanitizeHtml(input);
  const encrypted = encrypt(clean, "AES-256");
  return encrypted;
}`,
    expectedRuleIds: ["PERF-001"],
    category: "ai-code-safety",
    difficulty: "medium",
  },
  {
    id: "python-ai-deprecated-api",
    description: "Python using deprecated/removed API patterns",
    language: "python",
    code: `import cgi  # Deprecated in 3.11, removed in 3.13
import imp  # Deprecated, use importlib
from collections import MutableMapping  # Removed in 3.10

form = cgi.FieldStorage()
username = form.getfirst("username")

module = imp.load_source("config", "/etc/app/config.py")`,
    expectedRuleIds: [],
    category: "ai-code-safety",
    difficulty: "medium",
  },

  // ── Multi-language vulnerability chains ──
  {
    id: "ts-csrf-no-protection",
    description: "TypeScript Express app with no CSRF protection on state-changing endpoints",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: "secret" }));

// State-changing endpoint without CSRF token verification
app.post("/transfer", (req, res) => {
  const { from, to, amount } = req.body;
  transferFunds(from, to, parseInt(amount));
  res.redirect("/dashboard");
});

app.post("/change-password", (req, res) => {
  const { newPassword } = req.body;
  changePassword(req.session.userId, newPassword);
  res.redirect("/profile");
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "go-tls-skip-verify",
    description: "Go HTTP client skipping TLS certificate verification",
    language: "go",
    code: `package main

import (
    "crypto/tls"
    "io/ioutil"
    "net/http"
)

func fetchData(url string) ([]byte, error) {
    tr := &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    }
    client := &http.Client{Transport: tr}
    resp, err := client.Get(url)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    return ioutil.ReadAll(resp.Body)
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ── Dockerfile Best Practices ──
  {
    id: "dockerfile-bad-practices",
    description: "Dockerfile with multiple security and best practice violations",
    language: "dockerfile",
    code: `FROM ubuntu:latest
RUN apt-get update && apt-get install -y curl wget python3
COPY . /app
WORKDIR /app
RUN pip3 install -r requirements.txt
ENV DATABASE_URL=postgres://admin:password123@db:5432/production
ENV API_KEY=sk-live-abcdef123456
EXPOSE 22 80 443 3306 5432
USER root
CMD python3 app.py`,
    expectedRuleIds: ["IAC-001", "AUTH-001", "SEC-001"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── Terraform Additional Cases ──
  {
    id: "terraform-open-security-group",
    description: "Terraform AWS security group allowing all inbound traffic",
    language: "hcl",
    code: `resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Allow all traffic"

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t2.micro"
  vpc_security_group_ids = [aws_security_group.web.id]
  associate_public_ip_address = true
}`,
    expectedRuleIds: ["IAC-001", "SEC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "terraform-unencrypted-bucket",
    description: "Terraform S3 bucket without encryption or versioning",
    language: "hcl",
    code: `resource "aws_s3_bucket" "data" {
  bucket = "sensitive-data-bucket"
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}`,
    expectedRuleIds: ["IAC-001", "SEC-001", "DATA-001"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── Software Practices Cases ──
  {
    id: "ts-code-smells",
    description: "TypeScript code with multiple code smells",
    language: "typescript",
    code: `// Magic numbers, deep nesting, long parameter lists
function p(a: number, b: number, c: number, d: number, e: string, f: boolean, g: number): number {
  if (a > 0) {
    if (b > 0) {
      if (c > 100) {
        if (d < 50) {
          if (f) {
            return a * 1.08 + b * 0.95 - c * 0.12 + (g > 3 ? 42 : 17);
          }
        }
      }
    }
  }
  return 0;
}`,
    expectedRuleIds: ["MAINT-001", "STRUCT-001"],
    category: "software-practices",
    difficulty: "easy",
  },

  // ── UX Cases ──
  {
    id: "ts-poor-error-messages",
    description: "TypeScript API with unhelpful error messages",
    language: "typescript",
    code: `app.post("/api/register", (req, res) => {
  try {
    const user = createUser(req.body);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Error" });
  }
});

app.get("/api/search", (req, res) => {
  if (!req.query.q) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const results = search(req.query.q as string);
  if (results.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(results);
});`,
    expectedRuleIds: ["UX-001"],
    category: "ux",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD DIFFICULTY — Obfuscated vulnerabilities
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ts-indirect-eval",
    description: "TypeScript indirect eval via Function constructor",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

app.post("/api/calculate", (req, res) => {
  const { expression } = req.body;
  // Indirect eval — same risk as eval()
  const compute = new Function("return " + expression);
  const result = compute();
  res.json({ result });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },
  {
    id: "python-format-string-attack",
    description: "Python format string vulnerability exposing internal data",
    language: "python",
    code: `from flask import Flask, request

app = Flask(__name__)
SECRET_KEY = "super-secret-key-12345"

@app.route("/profile")
def profile():
    template = request.args.get("template", "Hello, {name}")
    # Format string attack: user can pass {self.__class__.__init__.__globals__}
    return template.format(name=request.args.get("name", "World"))`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },
  {
    id: "ts-timing-attack",
    description: "TypeScript timing attack in password comparison",
    language: "typescript",
    code: `function verifyApiKey(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  // Timing attack: short-circuits on first mismatch
  for (let i = 0; i < provided.length; i++) {
    if (provided[i] !== expected[i]) return false;
  }
  return true;
}

app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (!verifyApiKey(apiKey, process.env.API_KEY!)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
});`,
    expectedRuleIds: ["SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "go-crypto-misuse",
    description: "Go using ECB mode and static IV for encryption",
    language: "go",
    code: `package main

import (
    "crypto/aes"
    "crypto/cipher"
)

var staticIV = []byte("1234567890123456") // Static IV
var key = []byte("my-secret-key-32bytes-long!!!!!!!")

func encrypt(plaintext []byte) ([]byte, error) {
    block, _ := aes.NewCipher(key)
    // ECB mode: identical plaintext blocks produce identical ciphertext
    ciphertext := make([]byte, len(plaintext))
    for i := 0; i < len(plaintext); i += aes.BlockSize {
        block.Encrypt(ciphertext[i:i+aes.BlockSize], plaintext[i:i+aes.BlockSize])
    }
    return ciphertext, nil
}

func encryptCBC(plaintext []byte) ([]byte, error) {
    block, _ := aes.NewCipher(key)
    mode := cipher.NewCBCEncrypter(block, staticIV) // Static IV is predictable
    ciphertext := make([]byte, len(plaintext))
    mode.CryptBlocks(ciphertext, plaintext)
    return ciphertext, nil
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "hard",
  },
];
