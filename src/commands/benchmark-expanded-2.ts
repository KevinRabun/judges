/**
 * Expanded benchmark cases — batch 2.
 * 120+ additional cases for comprehensive 300+ total coverage.
 *
 * Focus areas:
 *   - More clean-code samples across all languages (FP validation)
 *   - Under-covered judges: AUTH, CONC, DB, CFG, API, REL, CICD, OBS, DEPS
 *   - Multi-language vulnerability parity (same vuln in different langs)
 *   - Edge cases: minified code, generated code, config files
 */

import type { BenchmarkCase } from "./benchmark.js";

export const EXPANDED_BENCHMARK_CASES_2: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAN CODE — language-diverse FP validation
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-ruby-rails-controller",
    description: "Clean Ruby on Rails controller with proper auth and params",
    language: "ruby",
    code: `class ArticlesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_article, only: [:show, :update, :destroy]

  def index
    @articles = current_user.articles.page(params[:page]).per(25)
    render json: @articles, status: :ok
  end

  def show
    render json: @article, status: :ok
  end

  def create
    @article = current_user.articles.build(article_params)
    if @article.save
      render json: @article, status: :created
    else
      render json: { errors: @article.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @article.destroy
    head :no_content
  end

  private

  def set_article
    @article = current_user.articles.find(params[:id])
  end

  def article_params
    params.require(:article).permit(:title, :body, :published)
  end
end`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-php-laravel-controller",
    description: "Clean PHP Laravel controller with validation and auth",
    language: "php",
    code: `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Post;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Auth;
use Illuminate\\Support\\Facades\\Gate;

class PostController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $posts = Auth::user()->posts()
            ->when($request->search, fn ($q, $s) => $q->where('title', 'like', "%{$s}%"))
            ->paginate(20);

        return response()->json($posts);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string',
            'tags' => 'array|max:10',
            'tags.*' => 'string|max:50',
        ]);

        $post = Auth::user()->posts()->create($validated);
        return response()->json($post, 201);
    }

    public function destroy(Post $post)
    {
        Gate::authorize('delete', $post);
        $post->delete();
        return response()->noContent();
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-kotlin-spring-service",
    description: "Clean Kotlin Spring Boot service with proper patterns",
    language: "kotlin",
    code: `package com.example.service

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.slf4j.LoggerFactory

@Service
class OrderService(
    private val orderRepository: OrderRepository,
    private val paymentGateway: PaymentGateway,
    private val notificationService: NotificationService,
) {
    private val logger = LoggerFactory.getLogger(OrderService::class.java)

    @Transactional
    fun placeOrder(request: OrderRequest): OrderResponse {
        require(request.items.isNotEmpty()) { "Order must have at least one item" }
        require(request.items.all { it.quantity > 0 }) { "Quantity must be positive" }

        val order = Order(
            userId = request.userId,
            items = request.items.map { it.toOrderItem() },
            status = OrderStatus.PENDING,
        )

        val savedOrder = orderRepository.save(order)
        logger.info("Order created: id={}, userId={}", savedOrder.id, request.userId)

        try {
            paymentGateway.charge(savedOrder.totalAmount, request.paymentMethod)
            savedOrder.status = OrderStatus.CONFIRMED
            orderRepository.save(savedOrder)
            notificationService.sendOrderConfirmation(savedOrder)
        } catch (e: PaymentException) {
            logger.error("Payment failed for order {}: {}", savedOrder.id, e.message)
            savedOrder.status = OrderStatus.PAYMENT_FAILED
            orderRepository.save(savedOrder)
            throw OrderProcessingException("Payment failed", e)
        }

        return savedOrder.toResponse()
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-swift-api-client",
    description: "Clean Swift API client with proper error handling",
    language: "swift",
    code: `import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case networkError(Error)
    case decodingError(Error)
    case httpError(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .networkError(let error): return "Network error: \\(error.localizedDescription)"
        case .decodingError(let error): return "Decoding error: \\(error.localizedDescription)"
        case .httpError(let code, let msg): return "HTTP \\(code): \\(msg)"
        }
    }
}

actor APIClient {
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let baseURL: URL

    init(baseURL: URL, configuration: URLSessionConfiguration = .default) {
        configuration.timeoutIntervalForRequest = 30
        configuration.waitsForConnectivity = true
        self.session = URLSession(configuration: configuration)
        self.baseURL = baseURL
        decoder.dateDecodingStrategy = .iso8601
    }

    func fetch<T: Decodable>(_ path: String, type: T.Type) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        let (data, response) = try await session.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        return try decoder.decode(T.self, from: data)
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-java-repository",
    description: "Clean Java Spring Data repository with proper queries",
    language: "java",
    code: `package com.example.repository;

import com.example.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    Page<Product> findByCategory(String category, Pageable pageable);

    @Query("SELECT p FROM Product p WHERE p.price BETWEEN :minPrice AND :maxPrice")
    List<Product> findByPriceRange(
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice
    );

    @Query("SELECT p FROM Product p WHERE LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%'))")
    Page<Product> searchByName(@Param("search") String search, Pageable pageable);

    boolean existsBySku(String sku);

    long countByCategory(String category);
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DB"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-python-dataclass",
    description: "Clean Python dataclass with validation",
    language: "python",
    code: `from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
import re


class Currency(Enum):
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"


@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: Currency

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError(f"Amount must be non-negative, got {self.amount}")

    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {self.currency.value} and {other.currency.value}")
        return Money(self.amount + other.amount, self.currency)


@dataclass
class Address:
    street: str
    city: str
    state: str
    zip_code: str
    country: str = "US"

    def __post_init__(self):
        if not re.match(r"^\\d{5}(-\\d{4})?$", self.zip_code):
            raise ValueError(f"Invalid ZIP code: {self.zip_code}")


@dataclass
class Customer:
    id: str
    name: str
    email: str
    address: Address
    created_at: datetime = field(default_factory=datetime.utcnow)
    loyalty_points: int = 0

    def __post_init__(self):
        if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$", self.email):
            raise ValueError(f"Invalid email: {self.email}")
`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA"],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-go-http-middleware",
    description: "Clean Go HTTP middleware chain with proper patterns",
    language: "go",
    code: `package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

type contextKey string

const requestIDKey contextKey = "requestID"

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				stack := debug.Stack()
				slog.Error("panic recovered",
					"error", err,
					"stack", string(stack),
					"path", r.URL.Path,
				)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.statusCode,
			"duration", time.Since(start),
		)
	})
}

func Timeout(d time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), d)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR", "CONC"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — Authentication vulnerabilities
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "auth-jwt-none-algorithm",
    description: "JWT verification accepting 'none' algorithm",
    language: "javascript",
    code: `const jwt = require('jsonwebtoken');

function verifyToken(token) {
  // Accepts any algorithm including 'none'
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256', 'none']
  });
  return decoded;
}

function decodeWithoutVerify(token) {
  // Dangerously decoding without verification
  const payload = jwt.decode(token);
  return payload;
}

module.exports = { verifyToken, decodeWithoutVerify };`,
    expectedRuleIds: ["AUTH-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "auth-hardcoded-api-key",
    description: "Hardcoded API key in Python source",
    language: "python",
    code: `import requests

API_KEY = "sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234"
API_URL = "https://api.openai.com/v1/chat/completions"

def call_openai(prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4",
        "messages": [{"role": "user", "content": prompt}],
    }
    response = requests.post(API_URL, json=payload, headers=headers)
    return response.json()["choices"][0]["message"]["content"]
`,
    expectedRuleIds: ["DATA-001", "AUTH-001"],
    category: "data-security",
    difficulty: "easy",
  },
  {
    id: "auth-timing-attack-comparison",
    description: "Timing-unsafe secret comparison in Node.js",
    language: "javascript",
    code: `const express = require('express');
const app = express();

const API_SECRET = process.env.API_SECRET;

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  // Timing-unsafe comparison - vulnerable to timing attacks
  if (signature === API_SECRET) {
    processWebhook(req.body);
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});

function processWebhook(data) {
  console.log('Processing webhook:', JSON.stringify(data));
}

app.listen(3000);`,
    expectedRuleIds: ["AUTH-001"],
    category: "auth",
    difficulty: "hard",
  },
  {
    id: "auth-session-no-expiry",
    description: "Session configuration without expiry or rotation",
    language: "javascript",
    code: `const express = require('express');
const session = require('express-session');

const app = express();

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }  // Not secure, no maxAge, no httpOnly
}));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password123') {
    req.session.user = username;
    req.session.isAdmin = true;
    res.json({ message: 'Logged in' });
  }
});

app.get('/admin', (req, res) => {
  if (req.session.user) {
    res.json({ admin: true });
  }
});

app.listen(3000);`,
    expectedRuleIds: ["AUTH-001", "DATA-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "conc-go-race-condition",
    description: "Go goroutine accessing shared map without synchronization",
    language: "go",
    code: `package main

import (
	"fmt"
	"net/http"
)

var sessions = map[string]string{}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	user := r.URL.Query().Get("user")
	sessions[token] = user  // Race condition: concurrent map write
	fmt.Fprintf(w, "Logged in: %s", user)
}

func checkHandler(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	user := sessions[token]  // Race condition: concurrent map read
	if user == "" {
		http.Error(w, "Unauthorized", 401)
		return
	}
	fmt.Fprintf(w, "Hello, %s", user)
}

func main() {
	http.HandleFunc("/login", loginHandler)
	http.HandleFunc("/check", checkHandler)
	http.ListenAndServe(":8080", nil)
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-python-shared-mutable-default",
    description: "Python mutable default argument shared across calls",
    language: "python",
    code: `from fastapi import FastAPI
import asyncio

app = FastAPI()

# Shared mutable state without locks
request_counts = {}

async def increment_counter(key: str):
    # Race condition: read-modify-write without lock
    current = request_counts.get(key, 0)
    await asyncio.sleep(0.001)  # Simulates I/O making race more likely
    request_counts[key] = current + 1

@app.get("/api/{resource}")
async def handle_request(resource: str):
    await increment_counter(resource)
    return {"resource": resource, "count": request_counts.get(resource, 0)}

@app.get("/stats")
async def get_stats():
    return request_counts  # Exposing internal state directly
`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "medium",
  },
  {
    id: "conc-java-unsynchronized-singleton",
    description: "Java double-checked locking without volatile",
    language: "java",
    code: `package com.example;

public class ConnectionPool {
    private static ConnectionPool instance; // Missing volatile!
    private final List<Connection> pool = new ArrayList<>();

    private ConnectionPool(int size) {
        for (int i = 0; i < size; i++) {
            pool.add(createConnection());
        }
    }

    // Broken double-checked locking
    public static ConnectionPool getInstance() {
        if (instance == null) {
            synchronized (ConnectionPool.class) {
                if (instance == null) {
                    instance = new ConnectionPool(10);
                }
            }
        }
        return instance;
    }

    public Connection getConnection() {
        // Not thread-safe: ArrayList without synchronization
        if (!pool.isEmpty()) {
            return pool.remove(0);
        }
        return createConnection();
    }

    public void returnConnection(Connection conn) {
        pool.add(conn); // Not thread-safe
    }

    private Connection createConnection() {
        return DriverManager.getConnection("jdbc:mysql://localhost/db", "root", "password");
    }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "db-nosql-injection",
    description: "MongoDB NoSQL injection via user input in query",
    language: "javascript",
    code: `const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
app.use(express.json());

let db;
MongoClient.connect('mongodb://localhost:27017').then(client => {
  db = client.db('myapp');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  // NoSQL injection: user can send { "$gt": "" } as password
  const user = await db.collection('users').findOne({
    username: username,
    password: password
  });
  if (user) {
    res.json({ token: 'authenticated' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/users', async (req, res) => {
  const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
  // Direct user input as MongoDB query - injection risk
  const users = await db.collection('users').find(filter).toArray();
  res.json(users);
});

app.listen(3000);`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "db-unparameterized-query-python",
    description: "Python SQL query built with f-string",
    language: "python",
    code: `import sqlite3
from flask import Flask, request, jsonify

app = Flask(__name__)

def get_db():
    conn = sqlite3.connect('app.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/users/search')
def search_users():
    name = request.args.get('name', '')
    role = request.args.get('role', '')

    db = get_db()
    query = f"SELECT * FROM users WHERE name LIKE '%{name}%'"
    if role:
        query += f" AND role = '{role}'"
    
    users = db.execute(query).fetchall()
    return jsonify([dict(u) for u in users])

@app.route('/users/<int:user_id>/orders')
def user_orders(user_id):
    db = get_db()
    # At least this one uses parameterization
    orders = db.execute("SELECT * FROM orders WHERE user_id = ?", (user_id,)).fetchall()
    return jsonify([dict(o) for o in orders])

if __name__ == '__main__':
    app.run(debug=True)
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "db-connection-leak",
    description: "Java database connection not closed in finally block",
    language: "java",
    code: `package com.example.dao;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class UserDao {
    private static final String DB_URL = "jdbc:mysql://localhost:3306/mydb";
    private static final String DB_USER = "root";
    private static final String DB_PASS = "admin123";

    public List<User> findAll() throws SQLException {
        // Connection leak: no try-with-resources or finally
        Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery("SELECT * FROM users");

        List<User> users = new ArrayList<>();
        while (rs.next()) {
            users.add(new User(rs.getInt("id"), rs.getString("name")));
        }
        return users; // conn, stmt, rs never closed if exception occurs
    }

    public User findById(int id) throws SQLException {
        Connection conn = DriverManager.getConnection(DB_URL, DB_USER, DB_PASS);
        String sql = "SELECT * FROM users WHERE id = " + id; // SQL injection too
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(sql);

        if (rs.next()) {
            return new User(rs.getInt("id"), rs.getString("name"));
        }
        conn.close(); // Only closes on happy path
        return null;
    }
}`,
    expectedRuleIds: ["DB-001", "DATA-001"],
    category: "database",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cfg-hardcoded-config",
    description: "Hardcoded configuration values instead of environment variables",
    language: "javascript",
    code: `const express = require('express');
const mysql = require('mysql2');

const app = express();

const pool = mysql.createPool({
  host: '192.168.1.100',
  port: 3306,
  user: 'app_user',
  password: 'SuperSecret!2024',
  database: 'production_db',
  connectionLimit: 10,
});

const REDIS_URL = 'redis://admin:r3d1s_p@ss@redis.internal:6379';
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PASSWORD = 'app-specific-password-here';

app.post('/send-email', (req, res) => {
  const { to, subject, body } = req.body;
  // ... send email
  res.json({ sent: true });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});`,
    expectedRuleIds: ["DATA-001", "CFG-001"],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "cfg-debug-enabled-production",
    description: "Debug mode enabled in production configuration",
    language: "python",
    code: `# Django settings.py
import os

SECRET_KEY = 'django-insecure-dev-key-do-not-use-in-production'

DEBUG = True  # Left enabled in production

ALLOWED_HOSTS = ['*']  # Too permissive

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'myapp',
        'USER': 'admin',
        'PASSWORD': 'admin123',  # Weak credentials
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

CORS_ALLOW_ALL_ORIGINS = True

# No CSRF protection
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SECURE = False
SECURE_SSL_REDIRECT = False

LOGGING = {
    'version': 1,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG',  # Verbose logging in production
    },
}
`,
    expectedRuleIds: ["CFG-001", "DATA-001"],
    category: "configuration",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // API DESIGN
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "api-no-versioning-no-pagination",
    description: "REST API without versioning, pagination, or error format",
    language: "javascript",
    code: `const express = require('express');
const app = express();
app.use(express.json());

let users = [];

// No versioning in path
app.get('/users', (req, res) => {
  // Returns ALL users - no pagination
  res.json(users);
});

// Inconsistent response format
app.post('/users', (req, res) => {
  const user = req.body;
  user.id = users.length + 1;  // Sequential IDs
  users.push(user);
  res.send('OK');  // Text instead of JSON
});

// DELETE returns different format
app.delete('/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id == req.params.id);
  if (idx >= 0) {
    users.splice(idx, 1);
    res.json({ deleted: true });
  } else {
    res.status(404).send('User not found');  // Text error
  }
});

// PUT does full replace but called 'update'
app.put('/update-user/:id', (req, res) => {
  const idx = users.findIndex(u => u.id == req.params.id);
  users[idx] = { ...req.body, id: parseInt(req.params.id) };
  res.json(users[idx]);
});

app.listen(3000);`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RELIABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "rel-no-graceful-shutdown",
    description: "Node.js server without graceful shutdown handling",
    language: "javascript",
    code: `const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/api/data', async (req, res) => {
  const result = await pool.query('SELECT * FROM data');
  res.json(result.rows);
});

app.post('/api/data', async (req, res) => {
  const { name, value } = req.body;
  await pool.query('INSERT INTO data (name, value) VALUES ($1, $2)', [name, value]);
  res.status(201).json({ created: true });
});

// No SIGTERM/SIGINT handler
// No connection draining
// No health check endpoint
const server = app.listen(3000, () => {
  console.log('Server running on port 3000');
});`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "rel-no-retry-no-circuit-breaker",
    description: "External API calls without retry or circuit breaker",
    language: "python",
    code: `import requests
from flask import Flask, jsonify

app = Flask(__name__)

PAYMENT_API = "https://api.payment-processor.com"
SHIPPING_API = "https://api.shipping-service.com"

@app.route("/checkout/<order_id>", methods=["POST"])
def checkout(order_id):
    # No retry, no timeout, no circuit breaker
    payment = requests.post(f"{PAYMENT_API}/charge", json={"order": order_id})

    if payment.status_code != 200:
        return jsonify({"error": "Payment failed"}), 500

    # If shipping fails, payment is already charged but not reversed
    shipping = requests.post(f"{SHIPPING_API}/ship", json={"order": order_id})

    if shipping.status_code != 200:
        return jsonify({"error": "Shipping failed"}), 500

    return jsonify({"status": "completed"})

@app.route("/health")
def health():
    # Health check doesn't verify dependencies
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run()
`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "err-swallowed-exceptions",
    description: "Python catching all exceptions and silently ignoring",
    language: "python",
    code: `import json
from typing import Any

def parse_config(filepath: str) -> dict:
    try:
        with open(filepath) as f:
            return json.load(f)
    except:  # Bare except
        pass  # Silently swallowed
    return {}

def process_payment(amount: float, card: str) -> bool:
    try:
        charge_card(card, amount)
        return True
    except Exception:
        return False  # Payment errors silently ignored

def fetch_user_data(user_id: int) -> Any:
    try:
        response = requests.get(f"/api/users/{user_id}")
        return response.json()
    except Exception as e:
        print(e)  # Log to stdout only
        return None  # Caller can't distinguish "not found" from "network error"

class DataProcessor:
    def process_batch(self, items: list) -> list:
        results = []
        for item in items:
            try:
                results.append(self.transform(item))
            except:  # Bare except again
                continue  # Skip failures silently
        return results
`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "err-go-ignored-errors",
    description: "Go code systematically ignoring error returns",
    language: "go",
    code: `package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
)

func saveUserData(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)  // Error ignored
	defer r.Body.Close()

	var user map[string]interface{}
	json.Unmarshal(body, &user)  // Error ignored

	f, _ := os.Create("/data/users.json")  // Error ignored
	json.NewEncoder(f).Encode(user)  // Error ignored
	f.Close()  // Error ignored

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("saved"))  // Error ignored
}

func loadConfig() map[string]string {
	data, _ := os.ReadFile("config.json")  // Error ignored
	var config map[string]string
	json.Unmarshal(data, &config)  // Error ignored
	return config
}

func main() {
	http.HandleFunc("/save", saveUserData)
	http.ListenAndServe(":8080", nil)  // Error ignored
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "obs-no-structured-logging",
    description: "Node.js API with console.log instead of structured logging",
    language: "javascript",
    code: `const express = require('express');
const app = express();

app.post('/api/orders', async (req, res) => {
  console.log('New order received');
  console.log('Body:', req.body);

  try {
    const order = await createOrder(req.body);
    console.log('Order created: ' + order.id);
    res.json(order);
  } catch (err) {
    console.log('Error creating order');
    console.log(err);  // Logging full error objects with stack traces
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  console.log(\`Fetching order \${req.params.id}\`);
  // No request ID, no correlation, no log levels
  const order = getOrder(req.params.id);
  if (!order) {
    console.log('Order not found: ' + req.params.id);
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(order);
});

// No health/readiness endpoints
// No metrics endpoint
// No request tracing

app.listen(3000, () => console.log('listening'));`,
    expectedRuleIds: ["OBS-001"],
    category: "observability",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "scale-in-memory-state",
    description: "Server storing session state in-memory",
    language: "javascript",
    code: `const express = require('express');
const app = express();
app.use(express.json());

// In-memory storage — lost on restart, not shared across instances
const sessions = {};
const cache = {};
const rateLimits = {};

app.post('/login', (req, res) => {
  const token = Math.random().toString(36);
  sessions[token] = { user: req.body.username, loginTime: Date.now() };
  res.json({ token });
});

app.get('/api/data', (req, res) => {
  const token = req.headers.authorization;
  if (!sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cacheKey = req.url;
  if (cache[cacheKey]) {
    return res.json(cache[cacheKey]);
  }

  const data = fetchExpensiveData();
  cache[cacheKey] = data;
  res.json(data);
});

// Rate limiting in memory — won't work across server instances
app.use((req, res, next) => {
  const ip = req.ip;
  rateLimits[ip] = (rateLimits[ip] || 0) + 1;
  if (rateLimits[ip] > 100) {
    return res.status(429).json({ error: 'Rate limited' });
  }
  next();
});

app.listen(3000);`,
    expectedRuleIds: ["SCALE-001"],
    category: "scalability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "test-no-tests-complex-logic",
    description: "Complex business logic with no test file present",
    language: "javascript",
    code: `/**
 * Pricing engine for subscription billing.
 * Handles prorations, discounts, tax calculations, and currency conversion.
 */

function calculateSubscriptionPrice(plan, user, coupon) {
  let basePrice = plan.price;

  // Apply volume discount
  if (user.seats > 100) {
    basePrice *= 0.8;
  } else if (user.seats > 50) {
    basePrice *= 0.85;
  } else if (user.seats > 10) {
    basePrice *= 0.9;
  }

  // Apply coupon
  if (coupon && coupon.valid) {
    if (coupon.type === 'percent') {
      basePrice *= (1 - coupon.amount / 100);
    } else if (coupon.type === 'fixed') {
      basePrice -= coupon.amount;
    }
  }

  // Prorate for mid-cycle start
  if (user.startDate) {
    const daysInMonth = new Date(Date.now()).getDate();
    const remainingDays = daysInMonth - new Date(user.startDate).getDate();
    basePrice = (basePrice / daysInMonth) * remainingDays;
  }

  // Tax calculation
  const taxRate = getTaxRate(user.country, user.state);
  const tax = basePrice * taxRate;

  return {
    subtotal: Math.round(basePrice * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round((basePrice + tax) * 100) / 100,
    currency: plan.currency,
  };
}

function getTaxRate(country, state) {
  if (country === 'US') {
    const rates = { CA: 0.0725, NY: 0.08, TX: 0.0625, WA: 0.065 };
    return rates[state] || 0.05;
  }
  if (country === 'GB') return 0.20;
  if (country === 'DE') return 0.19;
  return 0;
}

module.exports = { calculateSubscriptionPrice, getTaxRate };`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "deps-outdated-vulnerable",
    description: "Package.json with known vulnerable dependency patterns",
    language: "javascript",
    code: `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^3.21.2",
    "lodash": "4.17.15",
    "moment": "2.29.1",
    "request": "2.88.2",
    "js-yaml": "3.13.0",
    "minimist": "1.2.5",
    "node-fetch": "2.6.1",
    "axios": "0.21.1",
    "jsonwebtoken": "8.5.1",
    "helmet": "3.23.3"
  },
  "devDependencies": {
    "mocha": "*",
    "eslint": "latest"
  }
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "dependencies",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-SITE SCRIPTING (XSS)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "xss-react-dangerously-set",
    description: "React component using dangerouslySetInnerHTML with user input",
    language: "javascript",
    code: `import React, { useState, useEffect } from 'react';

function CommentSection({ postId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    fetch(\`/api/posts/\${postId}/comments\`)
      .then(res => res.json())
      .then(data => setComments(data));
  }, [postId]);

  const addComment = () => {
    fetch(\`/api/posts/\${postId}/comments\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newComment }),
    });
    setComments([...comments, { text: newComment, author: 'me' }]);
    setNewComment('');
  };

  return (
    <div>
      <h2>Comments</h2>
      {comments.map((c, i) => (
        <div key={i} className="comment">
          <strong>{c.author}</strong>
          {/* XSS: rendering user-submitted HTML directly */}
          <div dangerouslySetInnerHTML={{ __html: c.text }} />
        </div>
      ))}
      <textarea value={newComment} onChange={e => setNewComment(e.target.value)} />
      <button onClick={addComment}>Add Comment</button>
    </div>
  );
}

export default CommentSection;`,
    expectedRuleIds: ["CYBER-001"],
    category: "xss",
    difficulty: "medium",
  },
  {
    id: "xss-template-injection-python",
    description: "Python Flask rendering user input without escaping",
    language: "python",
    code: `from flask import Flask, request, render_template_string

app = Flask(__name__)

@app.route("/profile")
def profile():
    username = request.args.get("name", "Guest")
    # Server-side template injection: user controls template content
    template = f"""
    <html>
    <body>
        <h1>Welcome, {username}!</h1>
        <p>Your profile page</p>
    </body>
    </html>
    """
    return render_template_string(template)

@app.route("/search")
def search():
    query = request.args.get("q", "")
    # Reflected XSS: user input directly in HTML
    return f"<html><body><h2>Search results for: {query}</h2></body></html>"

if __name__ == "__main__":
    app.run(debug=True)
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "xss",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INJECTION — More languages
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "inject-command-injection-ruby",
    description: "Ruby command injection via system() with user input",
    language: "ruby",
    code: `require 'sinatra'

get '/convert' do
  filename = params[:file]
  format = params[:format]

  # Command injection: user controls filename and format
  output = \`convert #{filename} output.#{format}\`
  
  send_file "output.#{format}"
end

get '/ping' do
  host = params[:host]
  # Direct user input in system command
  result = system("ping -c 3 #{host}")
  result ? "Host reachable" : "Host unreachable"
end

post '/backup' do
  path = params[:path]
  # Backtick execution with user input
  \`tar czf /backups/archive.tar.gz #{path}\`
  "Backup complete"
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "inject-sql-csharp",
    description: "C# SQL injection via string concatenation",
    language: "csharp",
    code: `using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly string _connectionString;

    public UsersController(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("DefaultConnection");
    }

    [HttpGet("search")]
    public IActionResult SearchUsers(string name, string role)
    {
        using var connection = new SqlConnection(_connectionString);
        connection.Open();

        // SQL injection via string concatenation
        var sql = "SELECT * FROM Users WHERE Name LIKE '%" + name + "%'";
        if (!string.IsNullOrEmpty(role))
        {
            sql += " AND Role = '" + role + "'";
        }

        using var command = new SqlCommand(sql, connection);
        using var reader = command.ExecuteReader();

        var users = new List<object>();
        while (reader.Read())
        {
            users.Add(new { Id = reader["Id"], Name = reader["Name"] });
        }
        return Ok(users);
    }

    [HttpDelete("{id}")]
    public IActionResult DeleteUser(string id)
    {
        using var connection = new SqlConnection(_connectionString);
        connection.Open();
        // Another SQL injection
        var cmd = new SqlCommand($"DELETE FROM Users WHERE Id = '{id}'", connection);
        cmd.ExecuteNonQuery();
        return NoContent();
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "inject-path-traversal-go",
    description: "Go path traversal via unvalidated user file path",
    language: "go",
    code: `package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
)

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	// Path traversal: user can request ../../etc/passwd
	path := filepath.Join("/uploads", filename)

	file, err := os.Open(path)
	if err != nil {
		http.Error(w, "File not found", 404)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	io.Copy(w, file)
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(10 << 20)
	file, handler, _ := r.FormFile("upload")
	defer file.Close()

	// No filename sanitization — user controls destination name
	dst, _ := os.Create("/uploads/" + handler.Filename)
	defer dst.Close()
	io.Copy(dst, file)

	w.WriteHeader(http.StatusCreated)
}

func main() {
	http.HandleFunc("/download", downloadHandler)
	http.HandleFunc("/upload", uploadHandler)
	http.ListenAndServe(":8080", nil)
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "perf-n-plus-1-queries",
    description: "JavaScript N+1 query pattern with ORM",
    language: "javascript",
    code: `const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.get('/api/posts', async (req, res) => {
  // N+1: fetches all posts, then loops to get each author separately
  const posts = await prisma.post.findMany();

  const postsWithAuthors = [];
  for (const post of posts) {
    const author = await prisma.user.findUnique({
      where: { id: post.authorId },
    });
    const comments = await prisma.comment.findMany({
      where: { postId: post.id },
    });
    postsWithAuthors.push({ ...post, author, comments });
  }

  res.json(postsWithAuthors);
});

app.get('/api/dashboard', async (req, res) => {
  const users = await prisma.user.findMany();
  const stats = [];

  // Another N+1: one query per user
  for (const user of users) {
    const postCount = await prisma.post.count({ where: { authorId: user.id } });
    const commentCount = await prisma.comment.count({ where: { authorId: user.id } });
    stats.push({ user: user.name, postCount, commentCount });
  }

  res.json(stats);
});

app.listen(3000);`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "perf-synchronous-crypto",
    description: "Synchronous bcrypt and file I/O on main thread",
    language: "javascript",
    code: `const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
app.use(express.json());

app.post('/register', (req, res) => {
  const { email, password } = req.body;

  // Synchronous bcrypt on the event loop - blocks all requests
  const salt = bcrypt.genSaltSync(12);
  const hash = bcrypt.hashSync(password, salt);

  // Synchronous file write
  const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
  users.push({ email, password: hash });
  fs.writeFileSync('./users.json', JSON.stringify(users));

  res.json({ message: 'Registered' });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = JSON.parse(fs.readFileSync('./users.json', 'utf8'));
  const user = users.find(u => u.email === email);

  if (user && bcrypt.compareSync(password, user.password)) {
    res.json({ token: 'logged-in' });
  } else {
    res.status(401).json({ error: 'Invalid' });
  }
});

app.listen(3000);`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SECURITY — Additional patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "data-pii-logging",
    description: "Logging PII data in application logs",
    language: "javascript",
    code: `const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/users', (req, res) => {
  const { name, email, ssn, creditCard, password } = req.body;

  // Logging PII to stdout
  console.log('New user registration:', { name, email, ssn, creditCard, password });

  // Logging credit card number
  console.log(\`Processing payment for card: \${creditCard}\`);

  // Logging SSN
  console.log(\`Verifying identity for SSN: \${ssn}\`);

  res.json({ userId: Math.random().toString(36) });
});

app.post('/api/payment', (req, res) => {
  const { cardNumber, cvv, expiry } = req.body;
  console.log('Payment attempt:', JSON.stringify(req.body));
  res.json({ status: 'processed' });
});

app.listen(3000);`,
    expectedRuleIds: ["DATA-001", "LOGPRIV-001"],
    category: "data-security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IaC SECURITY — More Terraform/Bicep cases
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "iac-terraform-public-s3",
    description: "Terraform S3 bucket with public access enabled",
    language: "terraform",
    code: `resource "aws_s3_bucket" "data_bucket" {
  bucket = "company-data-uploads"
}

resource "aws_s3_bucket_public_access_block" "data_bucket" {
  bucket = aws_s3_bucket.data_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "data_bucket" {
  bucket = aws_s3_bucket.data_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "\${aws_s3_bucket.data_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_bucket" {
  bucket = aws_s3_bucket.data_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac",
    difficulty: "medium",
  },
  {
    id: "iac-terraform-overly-permissive-iam",
    description: "Terraform IAM policy with wildcard permissions",
    language: "terraform",
    code: `resource "aws_iam_role" "app_role" {
  name = "app-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "app_policy" {
  name = "app-policy"
  role = aws_iam_role.app_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      }
    ]
  })
}

resource "aws_security_group" "allow_all" {
  name = "allow-all"

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
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAN CODE — More FP validation (diverse patterns)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-python-pytest-suite",
    description: "Clean Python test file with pytest patterns",
    language: "python",
    code: `import pytest
from decimal import Decimal
from myapp.pricing import calculate_price, apply_discount, TaxCalculator


class TestCalculatePrice:
    def test_basic_price(self):
        result = calculate_price(quantity=1, unit_price=Decimal("10.00"))
        assert result == Decimal("10.00")

    def test_quantity_discount(self):
        result = calculate_price(quantity=100, unit_price=Decimal("10.00"))
        assert result == Decimal("900.00")  # 10% volume discount

    @pytest.mark.parametrize("qty,expected", [
        (1, Decimal("10.00")),
        (10, Decimal("95.00")),
        (100, Decimal("900.00")),
    ])
    def test_tiered_pricing(self, qty, expected):
        result = calculate_price(quantity=qty, unit_price=Decimal("10.00"))
        assert result == expected

    def test_zero_quantity_raises(self):
        with pytest.raises(ValueError, match="must be positive"):
            calculate_price(quantity=0, unit_price=Decimal("10.00"))

    def test_negative_price_raises(self):
        with pytest.raises(ValueError):
            calculate_price(quantity=1, unit_price=Decimal("-5.00"))


class TestApplyDiscount:
    def test_percentage_discount(self):
        result = apply_discount(Decimal("100.00"), discount_pct=10)
        assert result == Decimal("90.00")

    def test_no_discount(self):
        result = apply_discount(Decimal("100.00"), discount_pct=0)
        assert result == Decimal("100.00")

    def test_max_discount_cap(self):
        result = apply_discount(Decimal("100.00"), discount_pct=50)
        assert result == Decimal("70.00")  # Max 30% cap


@pytest.fixture
def tax_calculator():
    return TaxCalculator(default_rate=Decimal("0.08"))


class TestTaxCalculator:
    def test_us_tax(self, tax_calculator):
        tax = tax_calculator.calculate(Decimal("100.00"), country="US", state="CA")
        assert tax == Decimal("7.25")

    def test_eu_vat(self, tax_calculator):
        tax = tax_calculator.calculate(Decimal("100.00"), country="DE")
        assert tax == Decimal("19.00")
`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA", "ERR"],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-rust-cli-tool",
    description: "Clean Rust CLI tool with clap and proper error handling",
    language: "rust",
    code: `use clap::Parser;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "wordcount", about = "Count words in files")]
struct Args {
    /// Files to process
    #[arg(required = true)]
    files: Vec<PathBuf>,

    /// Count lines instead of words
    #[arg(short, long)]
    lines: bool,

    /// Output format
    #[arg(short, long, default_value = "text")]
    format: String,
}

fn count_file(path: &PathBuf, count_lines: bool) -> Result<(String, usize), io::Error> {
    let content = fs::read_to_string(path)?;
    let count = if count_lines {
        content.lines().count()
    } else {
        content.split_whitespace().count()
    };
    Ok((path.display().to_string(), count))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let mut total = 0usize;
    let mut results = Vec::new();

    for file in &args.files {
        match count_file(file, args.lines) {
            Ok((name, count)) => {
                total += count;
                results.push((name, count));
            }
            Err(e) => {
                eprintln!("Error reading {}: {}", file.display(), e);
            }
        }
    }

    let stdout = io::stdout();
    let mut out = stdout.lock();
    for (name, count) in &results {
        writeln!(out, "{:>8} {}", count, name)?;
    }
    if results.len() > 1 {
        writeln!(out, "{:>8} total", total)?;
    }

    Ok(())
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-csharp-controller",
    description: "Clean C# ASP.NET controller with proper patterns",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.ComponentModel.DataAnnotations;

namespace MyApp.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(IProductService productService, ILogger<ProductsController> logger)
    {
        _productService = productService;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ProductDto>), 200)]
    public async Task<IActionResult> GetProducts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? category = null)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
            return BadRequest("Invalid pagination parameters");

        var result = await _productService.GetProductsAsync(page, pageSize, category);
        return Ok(result);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ProductDto), 201)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> CreateProduct([FromBody] CreateProductRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var product = await _productService.CreateAsync(request);
        _logger.LogInformation("Product created: {ProductId}", product.Id);
        return CreatedAtAction(nameof(GetProducts), new { id = product.Id }, product);
    }
}

public class CreateProductRequest
{
    [Required]
    [StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    [Range(0.01, 999999.99)]
    public decimal Price { get; set; }

    [StringLength(50)]
    public string? Category { get; set; }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-go-grpc-server",
    description: "Clean Go gRPC server with interceptors",
    language: "go",
    code: `package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserService struct {
	repo UserRepository
	UnimplementedUserServiceServer
}

func NewUserService(repo UserRepository) *UserService {
	return &UserService{repo: repo}
}

func (s *UserService) GetUser(ctx context.Context, req *GetUserRequest) (*User, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "user id is required")
	}

	user, err := s.repo.FindByID(ctx, req.GetId())
	if err != nil {
		slog.Error("failed to find user", "id", req.GetId(), "error", err)
		return nil, status.Error(codes.Internal, "internal error")
	}
	if user == nil {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	return user, nil
}

func loggingInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	slog.Info("rpc",
		"method", info.FullMethod,
		"duration", time.Since(start),
		"error", err,
	)
	return resp, err
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		slog.Error("failed to listen", "error", err)
		os.Exit(1)
	}

	srv := grpc.NewServer(grpc.UnaryInterceptor(loggingInterceptor))

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		slog.Info("shutting down gracefully")
		srv.GracefulStop()
	}()

	slog.Info("server starting", "addr", ":50051")
	if err := srv.Serve(lis); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR", "REL"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY — More vulnerability patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "sec-ssrf-python",
    description: "Python SSRF via user-controlled URL",
    language: "python",
    code: `from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/proxy")
def proxy():
    # SSRF: user controls the URL being fetched server-side
    url = request.args.get("url")
    try:
        response = requests.get(url)
        return response.text
    except Exception as e:
        return str(e), 500

@app.route("/fetch-avatar")
def fetch_avatar():
    # SSRF: user provides avatar URL, server fetches it
    avatar_url = request.args.get("avatar_url")
    resp = requests.get(avatar_url, timeout=5)
    return resp.content, 200, {"Content-Type": resp.headers.get("Content-Type", "image/png")}

@app.route("/webhook")
def webhook():
    # SSRF via webhook callback URL
    callback = request.json.get("callback_url")
    data = {"status": "complete", "result": process_data()}
    requests.post(callback, json=data)
    return jsonify({"status": "sent"})
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-insecure-deserialization-java",
    description: "Java ObjectInputStream deserialization of untrusted data",
    language: "java",
    code: `package com.example;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;

public class DataReceiver {
    public static void main(String[] args) throws Exception {
        ServerSocket serverSocket = new ServerSocket(9999);
        System.out.println("Listening on port 9999...");

        while (true) {
            Socket socket = serverSocket.accept();
            new Thread(() -> {
                try {
                    // Unsafe deserialization of untrusted network data
                    ObjectInputStream ois = new ObjectInputStream(socket.getInputStream());
                    Object obj = ois.readObject();
                    processObject(obj);
                    ois.close();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }).start();
        }
    }

    private static void processObject(Object obj) {
        System.out.println("Received: " + obj.getClass().getName());
        if (obj instanceof Command) {
            ((Command) obj).execute();
        }
    }
}

interface Command extends Serializable {
    void execute();
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-weak-crypto-python",
    description: "Python using MD5 for password hashing and weak random",
    language: "python",
    code: `import hashlib
import random
import string
import sqlite3

def hash_password(password: str) -> str:
    # MD5 is cryptographically broken for passwords
    return hashlib.md5(password.encode()).hexdigest()

def generate_token() -> str:
    # random module is not cryptographically secure
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(32))

def generate_api_key() -> str:
    # Predictable: seeded with time
    random.seed()
    return ''.join(random.choices(string.hexdigits, k=40))

def create_user(username: str, password: str):
    db = sqlite3.connect('users.db')
    hashed = hash_password(password)
    token = generate_token()
    db.execute(
        f"INSERT INTO users (username, password_hash, token) VALUES ('{username}', '{hashed}', '{token}')"
    )
    db.commit()
    return token
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTATION
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "doc-no-docs-public-api",
    description: "Public API module with no documentation",
    language: "typescript",
    code: `export interface Config {
  host: string;
  port: number;
  retries: number;
  timeout: number;
  auth?: AuthConfig;
}

interface AuthConfig {
  apiKey: string;
  secret: string;
}

export class ApiClient {
  private config: Config;
  private baseUrl: string;

  constructor(config: Config) {
    this.config = config;
    this.baseUrl = \`https://\${config.host}:\${config.port}\`;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const resp = await fetch(url.toString(), { headers: this.getHeaders() });
    if (!resp.ok) throw new Error(\`HTTP \${resp.status}\`);
    return resp.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(new URL(path, this.baseUrl).toString(), {
      method: 'POST',
      headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(\`HTTP \${resp.status}\`);
    return resp.json();
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.auth) {
      headers['Authorization'] = \`Bearer \${this.config.auth.apiKey}\`;
    }
    return headers;
  }
}

export function createClient(config: Partial<Config>): ApiClient {
  return new ApiClient({
    host: 'localhost',
    port: 443,
    retries: 3,
    timeout: 30000,
    ...config,
  });
}`,
    expectedRuleIds: ["DOC-001"],
    category: "documentation",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CI/CD
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cicd-insecure-workflow",
    description: "GitHub Actions workflow with insecure patterns",
    language: "yaml",
    code: `name: CI
on:
  pull_request_target:  # Dangerous: runs with repo secrets on untrusted PRs
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2  # Outdated version
        with:
          ref: \${{ github.event.pull_request.head.sha }}  # Checking out untrusted code

      - name: Run tests
        run: |
          npm install
          npm test
        env:
          DATABASE_URL: \${{ secrets.PROD_DATABASE_URL }}  # Production secrets in CI
          AWS_ACCESS_KEY_ID: \${{ secrets.AWS_KEY }}
          AWS_SECRET_ACCESS_KEY: \${{ secrets.AWS_SECRET }}

      - name: Deploy
        if: github.event_name == 'push'
        run: |
          echo \${{ github.event.pull_request.title }}  # Script injection
          ./deploy.sh`,
    expectedRuleIds: ["CICD-001"],
    category: "ci-cd",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "rate-no-rate-limiting-auth",
    description: "Login endpoint without rate limiting",
    language: "javascript",
    code: `const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// No rate limiting on auth endpoints
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  res.json({ token });
});

// No rate limiting on password reset
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await findUserByEmail(email);
  if (user) {
    const resetToken = generateResetToken();
    await sendResetEmail(email, resetToken);
  }
  res.json({ message: 'If account exists, reset email sent' });
});

// No rate limiting on registration
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = await createUser({ email, passwordHash: hash, name });
  res.status(201).json({ userId: user.id });
});

app.listen(3000);`,
    expectedRuleIds: ["RATE-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD READINESS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cloud-local-filesystem-state",
    description: "Server storing uploads and state on local filesystem",
    language: "javascript",
    code: `const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();

// Storing uploads on local filesystem - not cloud-ready
const upload = multer({ dest: '/tmp/uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  const destPath = path.join('/var/data/uploads', req.file.originalname);
  fs.renameSync(req.file.path, destPath);
  res.json({ path: destPath });
});

// Reading config from local file
const config = JSON.parse(fs.readFileSync('/etc/myapp/config.json', 'utf8'));

// Writing logs to local file
const logStream = fs.createWriteStream('/var/log/myapp/app.log', { flags: 'a' });
app.use((req, res, next) => {
  logStream.write(\`\${new Date().toISOString()} \${req.method} \${req.path}\\n\`);
  next();
});

// Local file-based sessions
const sessions = {};
app.use((req, res, next) => {
  const sid = req.cookies?.sid;
  if (sid && sessions[sid]) {
    req.session = sessions[sid];
  }
  next();
});

app.listen(config.port || 3000);`,
    expectedRuleIds: ["CLOUD-001"],
    category: "cloud-readiness",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGING PRIVACY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "logpriv-sensitive-data-logged",
    description: "Logging passwords, tokens, and PII in application logs",
    language: "python",
    code: `import logging

logger = logging.getLogger(__name__)

def authenticate(username: str, password: str) -> bool:
    logger.info(f"Login attempt: username={username}, password={password}")

    user = find_user(username)
    if not user:
        logger.warning(f"User not found: {username}")
        return False

    if not verify_password(password, user.password_hash):
        logger.warning(f"Wrong password for {username}: {password}")
        return False

    token = generate_token(user)
    logger.info(f"Generated token for {username}: {token}")
    return True

def process_payment(card_number: str, cvv: str, amount: float):
    logger.info(f"Processing payment: card={card_number}, cvv={cvv}, amount={amount}")

    result = charge_card(card_number, cvv, amount)
    logger.info(f"Payment result: {result}")
    return result

def update_user_profile(user_id: int, data: dict):
    logger.debug(f"Updating user {user_id} with data: {data}")
    # data may contain SSN, address, phone, etc.
    save_user(user_id, data)
`,
    expectedRuleIds: ["LOGPRIV-001"],
    category: "logging-privacy",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COST EFFECTIVENESS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cost-unbounded-queries",
    description: "Unbounded database queries without pagination or limits",
    language: "javascript",
    code: `const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool();

// Returns ALL records - potentially millions
app.get('/api/logs', async (req, res) => {
  const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
  res.json(result.rows);
});

// Fetches all users then filters in memory
app.get('/api/users/search', async (req, res) => {
  const all = await pool.query('SELECT * FROM users');
  const filtered = all.rows.filter(u =>
    u.name.toLowerCase().includes(req.query.q?.toLowerCase() || '')
  );
  res.json(filtered);
});

// Recursive query without depth limit
app.get('/api/categories/:id/tree', async (req, res) => {
  async function getChildren(parentId) {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE parent_id = $1', [parentId]
    );
    for (const row of rows) {
      row.children = await getChildren(row.id);
    }
    return rows;
  }
  const tree = await getChildren(req.params.id);
  res.json(tree);
});

app.listen(3000);`,
    expectedRuleIds: ["COST-001", "PERF-001"],
    category: "cost",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAN CODE — Edge cases that should NOT trigger
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-terraform-module",
    description: "Clean Terraform module with proper security patterns",
    language: "terraform",
    code: `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod"
  }
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "VPC CIDR block"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "\${var.environment}-vpc"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "\${var.environment}-private-\${count.index}"
    Tier = "Private"
  }
}

resource "aws_security_group" "app" {
  name_prefix = "\${var.environment}-app-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["IAC", "SEC", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-dockerfile-best-practices",
    description: "Well-structured Dockerfile following best practices",
    language: "dockerfile",
    code: `# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:22-alpine AS production

RUN apk add --no-cache tini dumb-init
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server.js"]`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA"],
    category: "clean",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHP — Additional vulnerability patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "php-file-inclusion",
    description: "PHP local file inclusion via user input",
    language: "php",
    code: `<?php

// Local File Inclusion vulnerability
$page = $_GET['page'] ?? 'home';
include("pages/" . $page . ".php");

// Remote Code Execution via eval
$formula = $_POST['formula'];
$result = eval("return " . $formula . ";");
echo "Result: $result";

// Insecure file upload - no validation
if ($_FILES['upload']['error'] === UPLOAD_ERR_OK) {
    $dest = 'uploads/' . $_FILES['upload']['name'];
    move_uploaded_file($_FILES['upload']['tmp_name'], $dest);
    echo "Uploaded to: $dest";
}

// SQL Injection
$id = $_GET['id'];
$conn = new mysqli('localhost', 'root', '', 'mydb');
$result = $conn->query("SELECT * FROM products WHERE id = $id");

// XSS
echo "<h1>Welcome, " . $_GET['name'] . "</h1>";
?>`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KOTLIN — Vulnerability patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "kotlin-sql-injection-spring",
    description: "Kotlin Spring controller with SQL injection",
    language: "kotlin",
    code: `package com.example.controller

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/users")
class UserController(private val jdbc: JdbcTemplate) {

    @GetMapping("/search")
    fun searchUsers(@RequestParam name: String): List<Map<String, Any>> {
        // SQL injection via string interpolation
        val sql = "SELECT * FROM users WHERE name LIKE '%$name%'"
        return jdbc.queryForList(sql)
    }

    @DeleteMapping("/{id}")
    fun deleteUser(@PathVariable id: String) {
        // SQL injection
        jdbc.execute("DELETE FROM users WHERE id = '$id'")
    }

    @GetMapping("/by-role")
    fun getUsersByRole(@RequestParam role: String): List<Map<String, Any>> {
        // SQL injection via string concatenation
        return jdbc.queryForList("SELECT * FROM users WHERE role = '" + role + "'")
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SWIFT — Vulnerability patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "swift-insecure-transport",
    description: "Swift iOS app with insecure network and storage",
    language: "swift",
    code: `import Foundation
import UIKit

class AuthManager {
    // Storing credentials in UserDefaults (insecure)
    func saveCredentials(username: String, password: String) {
        UserDefaults.standard.set(username, forKey: "username")
        UserDefaults.standard.set(password, forKey: "password")  // Plaintext password!
    }

    func login(username: String, password: String, completion: @escaping (Bool) -> Void) {
        // HTTP instead of HTTPS
        let url = URL(string: "http://api.example.com/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = "username=\\(username)&password=\\(password)".data(using: .utf8)

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            guard let data = data else {
                completion(false)
                return
            }
            // Storing auth token insecurely
            let token = String(data: data, encoding: .utf8)
            UserDefaults.standard.set(token, forKey: "auth_token")
            completion(true)
        }
        task.resume()
    }

    // Hardcoded API key
    private let apiKey = "AIzaSyB4-example-key-do-not-use-in-production"
}`,
    expectedRuleIds: ["DATA-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL INJECTION PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "inject-ldap-injection-java",
    description: "Java LDAP injection via unsanitized user input",
    language: "java",
    code: `package com.example.auth;

import javax.naming.*;
import javax.naming.directory.*;
import java.util.Hashtable;

public class LdapAuthenticator {
    private static final String LDAP_URL = "ldap://ldap.company.com:389";
    private static final String BASE_DN = "dc=company,dc=com";

    public boolean authenticate(String username, String password) {
        try {
            Hashtable<String, String> env = new Hashtable<>();
            env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
            env.put(Context.PROVIDER_URL, LDAP_URL);

            DirContext ctx = new InitialDirContext(env);

            // LDAP injection: username not sanitized
            String filter = "(&(uid=" + username + ")(userPassword=" + password + "))";

            SearchControls sc = new SearchControls();
            sc.setSearchScope(SearchControls.SUBTREE_SCOPE);

            NamingEnumeration<?> results = ctx.search(BASE_DN, filter, sc);
            boolean found = results.hasMore();
            ctx.close();
            return found;
        } catch (NamingException e) {
            e.printStackTrace();
            return false;
        }
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MORE CLEAN CODE — Varied
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-typescript-utility-lib",
    description: "Clean TypeScript utility library with proper types",
    language: "typescript",
    code: `/**
 * Retry utility with exponential backoff and jitter.
 */
export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Whether to add jitter (default: true) */
  jitter?: boolean;
  /** Error predicate — only retry if returns true */
  retryIf?: (error: unknown) => boolean;
}

/**
 * Execute an async function with retry logic and exponential backoff.
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the successful function call
 * @throws The last error if all attempts fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30_000,
    jitter = true,
    retryIf = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !retryIf(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
      const actualDelay = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError;
}

/**
 * Create a debounced version of a function.
 * @param fn - The function to debounce
 * @param waitMs - The debounce wait time in milliseconds
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA", "ERR"],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-python-fastapi-crud",
    description: "Clean FastAPI CRUD with Pydantic validation and proper patterns",
    language: "python",
    code: `from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import uuid4

app = FastAPI(title="User Service", version="1.0.0")


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    role: str = Field(default="user", pattern="^(user|admin|editor)$")


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: datetime


# In-memory store for demo
users_db: dict[str, dict] = {}


@app.post("/api/v1/users", response_model=UserResponse, status_code=201)
async def create_user(user: UserCreate):
    user_id = str(uuid4())
    record = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "created_at": datetime.utcnow(),
    }
    users_db[user_id] = record
    return record


@app.get("/api/v1/users", response_model=list[UserResponse])
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    all_users = list(users_db.values())
    return all_users[skip : skip + limit]


@app.get("/api/v1/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    return users_db[user_id]


@app.delete("/api/v1/users/{user_id}", status_code=204)
async def delete_user(user_id: str):
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    del users_db[user_id]
`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-java-spring-service",
    description: "Clean Java Spring Boot service with proper patterns",
    language: "java",
    code: `package com.example.service;

import com.example.dto.CreateOrderRequest;
import com.example.dto.OrderResponse;
import com.example.entity.Order;
import com.example.entity.OrderStatus;
import com.example.exception.OrderNotFoundException;
import com.example.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;

    public OrderService(OrderRepository orderRepository, PaymentService paymentService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
    }

    @Transactional(readOnly = true)
    public Page<OrderResponse> getOrders(Pageable pageable) {
        return orderRepository.findAll(pageable).map(OrderResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));
        return OrderResponse.fromEntity(order);
    }

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request) {
        Order order = new Order();
        order.setItems(request.getItems());
        order.setStatus(OrderStatus.PENDING);
        order.setCustomerId(request.getCustomerId());

        Order saved = orderRepository.save(order);
        log.info("Order created: id={}, customer={}", saved.getId(), request.getCustomerId());

        return OrderResponse.fromEntity(saved);
    }

    @Transactional
    public void cancelOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId)
            .orElseThrow(() -> new OrderNotFoundException(orderId));

        if (order.getStatus() == OrderStatus.SHIPPED) {
            throw new IllegalStateException("Cannot cancel shipped order");
        }

        order.setStatus(OrderStatus.CANCELLED);
        orderRepository.save(order);
        log.info("Order cancelled: id={}", orderId);
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA", "DB"],
    category: "clean",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL SECURITY EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "sec-prototype-pollution-js",
    description: "JavaScript prototype pollution via recursive merge",
    language: "javascript",
    code: `function deepMerge(target, source) {
  for (const key in source) {
    // Prototype pollution: no __proto__ or constructor check
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const express = require('express');
const app = express();
app.use(express.json());

const defaultConfig = { role: 'user', theme: 'light' };

app.post('/api/settings', (req, res) => {
  // User controls the merge source entirely
  const userConfig = deepMerge({}, defaultConfig);
  deepMerge(userConfig, req.body);
  // Attacker sends: {"__proto__": {"isAdmin": true}}
  res.json(userConfig);
});

app.get('/api/admin', (req, res) => {
  const user = {};
  // After pollution, user.isAdmin is true
  if (user.isAdmin) {
    res.json({ admin: true, secrets: 'exposed' });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

app.listen(3000);`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "sec-xml-xxe-java",
    description: "Java XML External Entity (XXE) injection",
    language: "java",
    code: `package com.example;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import java.io.InputStream;
import javax.servlet.http.*;

public class XmlProcessor extends HttpServlet {

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        try {
            // XXE vulnerable: no external entity restriction
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            // Missing: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            DocumentBuilder builder = factory.newDocumentBuilder();

            InputStream xmlInput = req.getInputStream();
            Document doc = builder.parse(xmlInput);

            String name = doc.getElementsByTagName("name").item(0).getTextContent();
            resp.getWriter().write("Hello, " + name);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAINTAINABILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "maint-god-function",
    description: "Extremely long function handling too many responsibilities",
    language: "javascript",
    code: `function processOrder(orderData, user, paymentInfo, shippingAddress) {
  // Validate order
  if (!orderData.items || orderData.items.length === 0) throw new Error('No items');
  if (!user.id) throw new Error('No user');
  if (!paymentInfo.cardNumber) throw new Error('No card');
  if (!shippingAddress.street) throw new Error('No address');

  // Calculate totals
  let subtotal = 0;
  for (const item of orderData.items) {
    const price = getProductPrice(item.productId);
    const discount = getDiscount(item.productId, user.tier);
    subtotal += (price - discount) * item.quantity;
  }

  // Apply coupons
  if (orderData.couponCode) {
    const coupon = validateCoupon(orderData.couponCode);
    if (coupon.type === 'percent') subtotal *= (1 - coupon.value / 100);
    else subtotal -= coupon.value;
  }

  // Calculate tax
  const taxRate = getTaxRate(shippingAddress.state, shippingAddress.country);
  const tax = subtotal * taxRate;

  // Calculate shipping
  let shipping = 0;
  const totalWeight = orderData.items.reduce((sum, i) => sum + i.weight * i.quantity, 0);
  if (totalWeight > 50) shipping = 25.99;
  else if (totalWeight > 20) shipping = 15.99;
  else if (totalWeight > 5) shipping = 9.99;
  else shipping = 4.99;
  if (user.tier === 'premium') shipping = 0;

  // Process payment
  const total = subtotal + tax + shipping;
  const chargeResult = chargeCard(paymentInfo.cardNumber, paymentInfo.cvv, total);
  if (!chargeResult.success) throw new Error('Payment failed: ' + chargeResult.error);

  // Create order record
  const order = {
    id: generateOrderId(),
    userId: user.id,
    items: orderData.items,
    subtotal, tax, shipping, total,
    paymentId: chargeResult.transactionId,
    status: 'confirmed',
    createdAt: new Date(),
  };
  saveOrder(order);

  // Send notifications
  sendOrderConfirmationEmail(user.email, order);
  if (user.phone) sendSmsNotification(user.phone, 'Order confirmed: ' + order.id);
  updateInventory(orderData.items);
  trackAnalytics('order_placed', { orderId: order.id, total });

  return order;
}`,
    expectedRuleIds: ["MAINT-001"],
    category: "maintainability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL CLEAN CODE — Ensuring low FP across patterns
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "clean-node-express-middleware",
    description: "Clean Express.js middleware with proper security headers",
    language: "javascript",
    code: `const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || [] }));
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Input validation middleware
const validateUser = [
  body('email').isEmail().normalizeEmail(),
  body('name').trim().isLength({ min: 1, max: 100 }).escape(),
  body('age').optional().isInt({ min: 0, max: 150 }),
];

app.post('/api/users', validateUser, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // ... create user
  res.status(201).json({ message: 'Created' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const port = process.env.PORT || 3000;
app.listen(port);`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "RATE"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-go-database-repo",
    description: "Clean Go database repository with proper patterns",
    language: "go",
    code: `package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type User struct {
	ID        int64
	Email     string
	Name      string
	CreatedAt time.Time
}

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) FindByID(ctx context.Context, id int64) (*User, error) {
	var user User
	err := r.db.QueryRowContext(ctx,
		"SELECT id, email, name, created_at FROM users WHERE id = $1", id,
	).Scan(&user.ID, &user.Email, &user.Name, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return &user, nil
}

func (r *UserRepository) Create(ctx context.Context, user *User) error {
	err := r.db.QueryRowContext(ctx,
		"INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, created_at",
		user.Email, user.Name,
	).Scan(&user.ID, &user.CreatedAt)

	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *UserRepository) List(ctx context.Context, limit, offset int) ([]User, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT id, email, name, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2",
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DB", "ERR"],
    category: "clean",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNATIONALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "i18n-hardcoded-user-strings",
    description: "UI component with hardcoded English strings",
    language: "javascript",
    code: `import React from 'react';

function CheckoutPage({ cart, user }) {
  return (
    <div className="checkout">
      <h1>Shopping Cart</h1>
      <p>Hello, {user.name}! You have {cart.items.length} items in your cart.</p>

      {cart.items.map(item => (
        <div key={item.id}>
          <span>{item.name}</span>
          <span>Price: $\{item.price.toFixed(2)}</span>
          <span>Quantity: {item.quantity}</span>
          <button>Remove</button>
        </div>
      ))}

      <div className="summary">
        <p>Subtotal: $\{cart.subtotal.toFixed(2)}</p>
        <p>Shipping: Free</p>
        <p>Tax: $\{cart.tax.toFixed(2)}</p>
        <h2>Total: $\{cart.total.toFixed(2)}</h2>
      </div>

      <button className="primary">Proceed to Payment</button>
      <button className="secondary">Continue Shopping</button>

      <p className="disclaimer">
        By completing this purchase, you agree to our Terms of Service
        and Privacy Policy.
      </p>
    </div>
  );
}

export default CheckoutPage;`,
    expectedRuleIds: ["I18N-001"],
    category: "i18n",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "a11y-missing-alt-labels",
    description: "React component with accessibility issues",
    language: "javascript",
    code: `import React from 'react';

function ProductCard({ product, onBuy }) {
  return (
    <div onClick={() => onBuy(product.id)} style={{ cursor: 'pointer' }}>
      <img src={product.image} />
      <div style={{ color: '#ccc', backgroundColor: '#eee' }}>
        {product.name}
      </div>
      <span onClick={(e) => { e.stopPropagation(); alert('Added to wishlist'); }}>
        ♥
      </span>
      <div onClick={() => onBuy(product.id)}>Buy Now</div>
      <input type="text" placeholder="Enter quantity" />
    </div>
  );
}

function Gallery({ images }) {
  return (
    <div>
      {images.map((src, i) => (
        <img key={i} src={src} />
      ))}
    </div>
  );
}

export { ProductCard, Gallery };`,
    expectedRuleIds: ["A11Y-001"],
    category: "accessibility",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARDS COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "compat-breaking-api-change",
    description: "API with breaking changes in response format",
    language: "typescript",
    code: `// API response types — breaking changes from v1 to v2
// Was: { user: string, age: number }
// Now: { name: string, birthYear: number }
interface UserResponse {
  name: string; // Was: user
  birthYear: number; // Was: age (changed semantics too)
  metadata: UserMetadata; // New required field
}

// Was: string[]
// Now: Tag[]   (changed from primitive to object array)
interface Tag {
  id: string;
  label: string;
}

// Was: getUser(id: string): UserResponse
// Now: getUser(id: number): UserResponse  (changed param type)
export async function getUser(id: number): Promise<UserResponse> {
  const resp = await fetch(\`/api/v2/users/\${id}\`);
  return resp.json();
}

// Was: createUser(name: string, email: string): User
// Now: createUser(data: CreateUserInput): User  (changed from positional to object)
export async function createUser(data: CreateUserInput): Promise<UserResponse> {
  const resp = await fetch('/api/v2/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return resp.json();
}

// Removed endpoint (breaking)
// Was: export async function deleteUser(id: string): Promise<void>
// Now: removed entirely

interface CreateUserInput {
  name: string;
  email: string;
  role: string; // Was optional, now required
}`,
    expectedRuleIds: ["COMPAT-001"],
    category: "backwards-compatibility",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "comp-gdpr-data-retention",
    description: "User data stored without retention policy or deletion",
    language: "javascript",
    code: `const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool();

app.post('/api/users', async (req, res) => {
  const { name, email, ssn, dateOfBirth, medicalHistory } = req.body;

  // Storing sensitive PII without retention policy
  await pool.query(
    'INSERT INTO users (name, email, ssn, dob, medical_history) VALUES ($1, $2, $3, $4, $5)',
    [name, email, ssn, dateOfBirth, JSON.stringify(medicalHistory)]
  );

  // No data minimization - storing everything
  // No consent tracking
  // No deletion mechanism
  // No data export capability (GDPR right to portability)

  res.status(201).json({ message: 'User created' });
});

// No endpoint for users to request data deletion (GDPR right to be forgotten)
// No endpoint for users to download their data (GDPR right to portability)
// No consent management

app.get('/api/analytics', async (req, res) => {
  // Tracking without consent
  const analytics = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    referrer: req.headers.referer,
    timestamp: new Date(),
  };
  await pool.query('INSERT INTO analytics (data) VALUES ($1)', [JSON.stringify(analytics)]);
  res.json({ tracked: true });
});

app.listen(3000);`,
    expectedRuleIds: ["COMP-001"],
    category: "compliance",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL CASES — Reaching 300+ total
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "sec-regex-dos",
    description: "Vulnerable regex pattern susceptible to ReDoS",
    language: "javascript",
    code: `const express = require('express');
const app = express();

// Evil regex — exponential backtracking
const EMAIL_REGEX = /^([a-zA-Z0-9_\\-\\.]+)@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.)|(([a-zA-Z0-9\\-]+\\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\\]?)$/;
const URL_REGEX = /^(https?:\\/\\/)?(([\\da-z\\.-]+)\\.)*([a-z\\.]{2,6})([\\/\\w \\.-]*)*\\/?$/;

app.post('/validate', (req, res) => {
  const { email, url } = req.body;
  // These can hang with crafted input
  const emailValid = EMAIL_REGEX.test(email);
  const urlValid = URL_REGEX.test(url);
  res.json({ emailValid, urlValid });
});

app.listen(3000);`,
    expectedRuleIds: ["PERF-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "sec-open-redirect",
    description: "Open redirect vulnerability in login flow",
    language: "javascript",
    code: `const express = require('express');
const app = express();

app.get('/login', (req, res) => {
  const returnUrl = req.query.return || '/';
  // Open redirect: no validation of returnUrl
  if (isAuthenticated(req)) {
    return res.redirect(returnUrl);
  }
  res.render('login', { returnUrl });
});

app.post('/login', (req, res) => {
  const { username, password, returnUrl } = req.body;
  if (authenticate(username, password)) {
    req.session.user = username;
    // Attacker: /login?return=https://evil.com
    res.redirect(returnUrl || '/dashboard');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  const next = req.query.next || '/';
  res.redirect(next); // Another open redirect
});

app.listen(3000);`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-cors-wildcard",
    description: "CORS misconfiguration allowing any origin with credentials",
    language: "javascript",
    code: `const express = require('express');
const app = express();

// Dangerous CORS: reflects any origin with credentials
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', '*');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get('/api/profile', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: req.session.user, ssn: req.session.user.ssn });
});

app.listen(3000);`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-insecure-cookie",
    description: "Cookie set without security flags",
    language: "javascript",
    code: `const express = require('express');
const app = express();

app.post('/login', (req, res) => {
  const token = generateToken(req.body.username);

  // Insecure cookie settings
  res.cookie('session', token, {
    httpOnly: false,     // Accessible to JavaScript (XSS)
    secure: false,       // Sent over HTTP
    sameSite: 'none',    // CSRF vulnerable
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year - too long
  });

  res.cookie('preferences', JSON.stringify(req.body.prefs)); // No flags at all

  res.json({ message: 'Logged in' });
});

app.listen(3000);`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "python-pickle-deserialization",
    description: "Python loading pickle from untrusted source",
    language: "python",
    code: `import pickle
import base64
from flask import Flask, request

app = Flask(__name__)

@app.route("/load-model", methods=["POST"])
def load_model():
    # Unsafe: deserializing untrusted pickle data
    model_data = base64.b64decode(request.data)
    model = pickle.loads(model_data)  # RCE via pickle
    return str(model.predict([1, 2, 3]))

@app.route("/restore-session", methods=["POST"])
def restore_session():
    # Unsafe: loading user-supplied pickle
    session_data = request.files["session"].read()
    session = pickle.loads(session_data)
    return f"Welcome back, {session.get('username')}"

if __name__ == "__main__":
    app.run()
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "python-django-orm-injection",
    description: "Django ORM raw SQL with user input",
    language: "python",
    code: `from django.http import JsonResponse
from django.db import connection

def search_products(request):
    category = request.GET.get("category", "")
    min_price = request.GET.get("min_price", "0")
    sort_by = request.GET.get("sort", "name")

    # Raw SQL with user input
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT * FROM products WHERE category = '{category}' "
            f"AND price >= {min_price} "
            f"ORDER BY {sort_by}"
        )
        rows = cursor.fetchall()

    return JsonResponse({"products": rows}, safe=False)

def get_user_stats(request):
    user_id = request.GET.get("id")
    with connection.cursor() as cursor:
        # SQL injection
        cursor.execute(f"SELECT * FROM user_stats WHERE user_id = {user_id}")
        stats = cursor.fetchone()
    return JsonResponse({"stats": stats})
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "go-command-injection",
    description: "Go command injection via os/exec with user input",
    language: "go",
    code: `package main

import (
	"fmt"
	"net/http"
	"os/exec"
)

func pingHandler(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	// Command injection: user controls command arguments
	cmd := exec.Command("sh", "-c", "ping -c 4 "+host)
	output, err := cmd.CombinedOutput()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	fmt.Fprintf(w, "%s", output)
}

func convertHandler(w http.ResponseWriter, r *http.Request) {
	input := r.URL.Query().Get("file")
	format := r.URL.Query().Get("format")
	// Command injection via string concatenation
	cmd := exec.Command("bash", "-c", fmt.Sprintf("convert %s output.%s", input, format))
	cmd.Run()
	w.WriteHeader(200)
}

func main() {
	http.HandleFunc("/ping", pingHandler)
	http.HandleFunc("/convert", convertHandler)
	http.ListenAndServe(":8080", nil)
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "java-xxe-sax-parser",
    description: "Java SAX parser vulnerable to XXE",
    language: "java",
    code: `package com.example;

import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.helpers.DefaultHandler;
import org.xml.sax.Attributes;
import java.io.InputStream;

public class ConfigParser extends DefaultHandler {
    private StringBuilder currentValue = new StringBuilder();
    private String currentElement;

    public void parseConfig(InputStream input) throws Exception {
        SAXParserFactory factory = SAXParserFactory.newInstance();
        // Missing: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        // Missing: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        SAXParser parser = factory.newSAXParser();
        parser.parse(input, this);
    }

    @Override
    public void startElement(String uri, String localName, String qName, Attributes attributes) {
        currentElement = qName;
        currentValue.setLength(0);
    }

    @Override
    public void characters(char[] ch, int start, int length) {
        currentValue.append(ch, start, length);
    }

    @Override
    public void endElement(String uri, String localName, String qName) {
        System.out.println(qName + ": " + currentValue.toString().trim());
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "clean-python-async-service",
    description: "Clean Python async service with proper error handling",
    language: "python",
    code: `import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class WeatherData:
    city: str
    temperature: float
    humidity: float
    description: str


class WeatherService:
    def __init__(self, api_key: str, base_url: str = "https://api.weather.com/v1"):
        self._api_key = api_key
        self._base_url = base_url
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10),
            headers={"X-API-Key": self._api_key},
        )
        return self

    async def __aexit__(self, *args):
        if self._session:
            await self._session.close()

    async def get_weather(self, city: str) -> WeatherData:
        if not self._session:
            raise RuntimeError("Service not initialized. Use async with.")

        url = f"{self._base_url}/weather"
        params = {"city": city, "units": "metric"}

        async with self._session.get(url, params=params) as resp:
            resp.raise_for_status()
            data = await resp.json()

        return WeatherData(
            city=data["name"],
            temperature=data["main"]["temp"],
            humidity=data["main"]["humidity"],
            description=data["weather"][0]["description"],
        )

    async def get_forecast(self, city: str, days: int = 5) -> list[WeatherData]:
        if days < 1 or days > 14:
            raise ValueError("Days must be between 1 and 14")

        url = f"{self._base_url}/forecast"
        params = {"city": city, "days": days, "units": "metric"}

        async with self._session.get(url, params=params) as resp:
            resp.raise_for_status()
            data = await resp.json()

        return [
            WeatherData(
                city=data["city"]["name"],
                temperature=item["main"]["temp"],
                humidity=item["main"]["humidity"],
                description=item["weather"][0]["description"],
            )
            for item in data["list"]
        ]
`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "DATA", "ERR"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-kotlin-coroutine-service",
    description: "Clean Kotlin coroutine-based service",
    language: "kotlin",
    code: `package com.example.service

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.slf4j.LoggerFactory

data class Notification(
    val userId: String,
    val type: NotificationType,
    val message: String,
)

enum class NotificationType { EMAIL, SMS, PUSH }

interface NotificationSender {
    suspend fun send(notification: Notification): Result<Unit>
}

class NotificationService(
    private val senders: Map<NotificationType, NotificationSender>,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val logger = LoggerFactory.getLogger(NotificationService::class.java)

    suspend fun sendNotification(notification: Notification): Result<Unit> {
        val sender = senders[notification.type]
            ?: return Result.failure(IllegalArgumentException("No sender for \${notification.type}"))

        return withContext(dispatcher) {
            sender.send(notification).also { result ->
                result.onSuccess {
                    logger.info("Sent {} to user {}", notification.type, notification.userId)
                }.onFailure { e ->
                    logger.error("Failed to send {} to user {}: {}", notification.type, notification.userId, e.message)
                }
            }
        }
    }

    suspend fun sendBatch(notifications: List<Notification>): List<Result<Unit>> {
        return coroutineScope {
            notifications.map { notification ->
                async { sendNotification(notification) }
            }.awaitAll()
        }
    }

    fun notificationStream(userId: String): Flow<Notification> = flow {
        // Simulates a notification stream
        while (currentCoroutineContext().isActive) {
            val notifications = fetchPendingNotifications(userId)
            notifications.forEach { emit(it) }
            delay(5000)
        }
    }.flowOn(dispatcher)

    private suspend fun fetchPendingNotifications(userId: String): List<Notification> {
        return withContext(dispatcher) { emptyList() }
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "CONC", "ERR"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "inject-eval-python",
    description: "Python eval with user input",
    language: "python",
    code: `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/calculate")
def calculate():
    expression = request.args.get("expr", "0")
    # eval with user input - RCE vulnerability
    try:
        result = eval(expression)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/template")
def template():
    name = request.args.get("name", "World")
    greeting = request.args.get("greeting", "Hello")
    # exec with user input
    exec(f"output = f'{greeting}, {name}!'")
    return locals().get("output", "")
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "inject-ssti-jinja",
    description: "Python Jinja2 server-side template injection",
    language: "python",
    code: `from flask import Flask, request
from jinja2 import Environment

app = Flask(__name__)
env = Environment()

@app.route("/render")
def render_page():
    user_template = request.args.get("template", "Hello!")
    # SSTI: user controls the template string
    template = env.from_string(user_template)
    return template.render()

@app.route("/email-preview")
def email_preview():
    subject_template = request.form.get("subject")
    body_template = request.form.get("body")
    # SSTI in both subject and body
    subject = env.from_string(subject_template).render()
    body = env.from_string(body_template).render()
    return f"<h1>{subject}</h1><div>{body}</div>"
`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "err-java-catch-throwable",
    description: "Java catching Throwable including OutOfMemoryError",
    language: "java",
    code: `package com.example;

import java.util.List;
import java.util.ArrayList;

public class DataProcessor {

    public List<String> processRecords(List<Record> records) {
        List<String> results = new ArrayList<>();
        for (Record record : records) {
            try {
                results.add(transform(record));
            } catch (Throwable t) {
                // Catching Throwable swallows OOM, StackOverflow, etc.
                System.out.println("Error: " + t.getMessage());
                continue;
            }
        }
        return results;
    }

    public void importData(String source) {
        try {
            loadFromSource(source);
        } catch (Throwable t) {
            // Silently catches all errors including JVM errors
            System.err.println("Import failed");
        }
    }

    private String transform(Record r) { return r.toString(); }
    private void loadFromSource(String s) throws Exception { }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "db-orm-mass-assignment",
    description: "ORM mass assignment vulnerability",
    language: "javascript",
    code: `const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('sqlite::memory:');
const User = sequelize.define('User', {
  name: DataTypes.STRING,
  email: DataTypes.STRING,
  role: { type: DataTypes.STRING, defaultValue: 'user' },
  isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  balance: { type: DataTypes.DECIMAL, defaultValue: 0 },
});

const app = express();
app.use(express.json());

app.post('/api/register', async (req, res) => {
  // Mass assignment: user can set role, isAdmin, balance
  const user = await User.create(req.body);
  res.json(user);
});

app.put('/api/users/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Mass assignment: user can modify any field
  await user.update(req.body);
  res.json(user);
});

app.listen(3000);`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "clean-ruby-service-object",
    description: "Clean Ruby service object with validation",
    language: "ruby",
    code: `# frozen_string_literal: true

class CreateOrderService
  class Error < StandardError; end
  class ValidationError < Error; end
  class PaymentError < Error; end

  def initialize(order_repo:, payment_gateway:, notification_service:)
    @order_repo = order_repo
    @payment_gateway = payment_gateway
    @notification_service = notification_service
  end

  def call(user:, items:, payment_method:)
    validate!(items)

    order = @order_repo.create(
      user_id: user.id,
      items: items.map { |i| { product_id: i[:product_id], quantity: i[:quantity] } },
      status: :pending
    )

    begin
      charge = @payment_gateway.charge(
        amount: order.total_amount,
        payment_method: payment_method,
        idempotency_key: "order-#{order.id}"
      )
      @order_repo.update(order, status: :confirmed, payment_id: charge.id)
      @notification_service.send_confirmation(order)
      order
    rescue PaymentGateway::DeclinedError => e
      @order_repo.update(order, status: :payment_failed)
      raise PaymentError, "Payment declined: #{e.message}"
    end
  end

  private

  def validate!(items)
    raise ValidationError, "No items provided" if items.empty?
    raise ValidationError, "Too many items" if items.length > 100

    items.each do |item|
      raise ValidationError, "Invalid quantity" unless item[:quantity]&.positive?
    end
  end
end`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "iac-docker-privileged",
    description: "Docker Compose with privileged containers and host mounts",
    language: "yaml",
    code: `version: '3.8'

services:
  app:
    image: myapp:latest
    privileged: true  # Full host access
    user: root
    network_mode: host
    volumes:
      - /:/host  # Mounting entire host filesystem
      - /var/run/docker.sock:/var/run/docker.sock  # Docker socket access
    environment:
      - DATABASE_PASSWORD=SuperSecret123
      - API_KEY=sk-prod-key-12345
      - DEBUG=true
    ports:
      - "0.0.0.0:3000:3000"

  db:
    image: mysql:5.7
    ports:
      - "0.0.0.0:3306:3306"  # Database exposed publicly
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: production
    volumes:
      - ./data:/var/lib/mysql  # No named volume

  redis:
    image: redis:latest
    command: redis-server  # No password
    ports:
      - "0.0.0.0:6379:6379"  # Redis exposed publicly`,
    expectedRuleIds: ["IAC-001", "DATA-001"],
    category: "iac",
    difficulty: "medium",
  },
  {
    id: "iac-k8s-insecure-pod",
    description: "Kubernetes pod spec with security issues",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: app
        image: myapp:latest  # No specific tag, uses mutable latest
        securityContext:
          privileged: true  # Privileged container
          runAsRoot: true
          allowPrivilegeEscalation: true
        ports:
        - containerPort: 3000
        env:
        - name: DB_PASSWORD
          value: "plaintext-password"  # Secret in plaintext
        - name: API_KEY
          value: "sk-123456789"
        # No resource limits
        # No readiness/liveness probes
        # No security context constraints`,
    expectedRuleIds: ["IAC-001", "DATA-001"],
    category: "iac",
    difficulty: "medium",
  },
  {
    id: "conc-ts-async-race",
    description: "TypeScript async race condition with shared state",
    language: "typescript",
    code: `class InventoryManager {
  private stock: Map<string, number> = new Map();

  async reserveItem(itemId: string, quantity: number): Promise<boolean> {
    const current = this.stock.get(itemId) ?? 0;

    // Race condition: another request can read the same value
    // before this one writes the updated value
    if (current >= quantity) {
      // Simulates async database call
      await this.updateDatabase(itemId, current - quantity);
      this.stock.set(itemId, current - quantity);
      return true;
    }
    return false;
  }

  async processOrder(items: Array<{ id: string; qty: number }>): Promise<void> {
    // No transactional guarantee: partial orders possible
    for (const item of items) {
      const reserved = await this.reserveItem(item.id, item.qty);
      if (!reserved) {
        // Previous items already reserved but not rolled back
        throw new Error(\`Insufficient stock for \${item.id}\`);
      }
    }
  }

  private async updateDatabase(itemId: string, newQty: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}`,
    expectedRuleIds: ["CONC-001"],
    category: "concurrency",
    difficulty: "hard",
  },
  {
    id: "sec-mass-assignment-python",
    description: "Python FastAPI mass assignment via dict unpacking",
    language: "python",
    code: `from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session

app = FastAPI()

@app.put("/users/{user_id}")
async def update_user(user_id: int, body: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404)

    # Mass assignment: user can set is_admin, role, balance, etc.
    for key, value in body.items():
        setattr(user, key, value)

    db.commit()
    return user

@app.post("/users")
async def create_user(body: dict, db: Session = Depends(get_db)):
    # Mass assignment via dict unpacking
    user = User(**body)  # User can set any model field
    db.add(user)
    db.commit()
    return user
`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "clean-php-middleware-stack",
    description: "Clean PHP PSR-15 middleware with proper patterns",
    language: "php",
    code: `<?php

declare(strict_types=1);

namespace App\\Middleware;

use Psr\\Http\\Message\\ResponseInterface;
use Psr\\Http\\Message\\ServerRequestInterface;
use Psr\\Http\\Server\\MiddlewareInterface;
use Psr\\Http\\Server\\RequestHandlerInterface;
use Psr\\Log\\LoggerInterface;

final class AuthenticationMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly TokenValidator $tokenValidator,
        private readonly LoggerInterface $logger,
    ) {}

    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler,
    ): ResponseInterface {
        $authHeader = $request->getHeaderLine('Authorization');

        if (!str_starts_with($authHeader, 'Bearer ')) {
            return new JsonResponse(['error' => 'Missing token'], 401);
        }

        $token = substr($authHeader, 7);

        try {
            $claims = $this->tokenValidator->validate($token);
            $request = $request->withAttribute('user', $claims);
        } catch (InvalidTokenException $e) {
            $this->logger->warning('Invalid token', ['error' => $e->getMessage()]);
            return new JsonResponse(['error' => 'Invalid token'], 401);
        } catch (ExpiredTokenException $e) {
            return new JsonResponse(['error' => 'Token expired'], 401);
        }

        return $handler->handle($request);
    }
}

final class RateLimitMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly RateLimiter $limiter,
        private readonly int $maxRequests = 100,
        private readonly int $windowSeconds = 60,
    ) {}

    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler,
    ): ResponseInterface {
        $clientIp = $request->getServerParams()['REMOTE_ADDR'] ?? 'unknown';
        $key = sprintf('rate_limit:%s', $clientIp);

        if (!$this->limiter->attempt($key, $this->maxRequests, $this->windowSeconds)) {
            return new JsonResponse(
                ['error' => 'Rate limit exceeded'],
                429,
                ['Retry-After' => (string) $this->limiter->retryAfter($key)]
            );
        }

        return $handler->handle($request);
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "RATE"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "err-kotlin-unchecked-null",
    description: "Kotlin using !! operator and ignoring nullability",
    language: "kotlin",
    code: `package com.example

import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/orders")
class OrderController(
    private val orderService: OrderService,
    private val userService: UserService,
) {
    @GetMapping("/{id}")
    fun getOrder(@PathVariable id: String): OrderResponse {
        // Force unwrap - crashes with NPE if not found
        val order = orderService.findById(id)!!
        val user = userService.findById(order.userId)!!

        return OrderResponse(
            id = order.id!!,
            userName = user.name!!,
            items = order.items!!.map { it.name!! },
            total = order.total!!.toDouble(),
        )
    }

    @PostMapping
    fun createOrder(@RequestBody body: Map<String, Any>): OrderResponse {
        val userId = body["userId"] as String  // ClassCastException if not String
        val items = body["items"] as List<Map<String, Any>>  // Unsafe cast

        val order = orderService.create(userId, items)
        return OrderResponse(
            id = order.id!!,
            userName = userService.findById(userId)!!.name!!,
            items = order.items!!.map { it.name!! },
            total = order.total!!.toDouble(),
        )
    }
}`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "clean-swift-result-builder",
    description: "Clean Swift code with proper Result type usage",
    language: "swift",
    code: `import Foundation

enum ServiceError: Error {
    case notFound
    case unauthorized
    case networkError(Error)
    case decodingError(Error)
}

struct UserProfile: Codable {
    let id: String
    let name: String
    let email: String
}

protocol UserServiceProtocol {
    func fetchUser(id: String) async -> Result<UserProfile, ServiceError>
    func updateUser(id: String, name: String) async -> Result<UserProfile, ServiceError>
}

final class UserService: UserServiceProtocol {
    private let session: URLSession
    private let baseURL: URL
    private let decoder: JSONDecoder

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func fetchUser(id: String) async -> Result<UserProfile, ServiceError> {
        let url = baseURL.appendingPathComponent("users/\\(id)")

        do {
            let (data, response) = try await session.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse else {
                return .failure(.networkError(URLError(.badServerResponse)))
            }
            switch httpResponse.statusCode {
            case 200:
                let user = try decoder.decode(UserProfile.self, from: data)
                return .success(user)
            case 401:
                return .failure(.unauthorized)
            case 404:
                return .failure(.notFound)
            default:
                return .failure(.networkError(URLError(.badServerResponse)))
            }
        } catch let error as DecodingError {
            return .failure(.decodingError(error))
        } catch {
            return .failure(.networkError(error))
        }
    }

    func updateUser(id: String, name: String) async -> Result<UserProfile, ServiceError> {
        var request = URLRequest(url: baseURL.appendingPathComponent("users/\\(id)"))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["name": name])

        do {
            let (data, _) = try await session.data(for: request)
            let user = try decoder.decode(UserProfile.self, from: data)
            return .success(user)
        } catch {
            return .failure(.networkError(error))
        }
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "perf-unbounded-memory-js",
    description: "Node.js unbounded in-memory cache without eviction",
    language: "javascript",
    code: `const express = require('express');
const app = express();

// Unbounded cache - will grow forever and eventually OOM
const cache = {};

app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  if (cache[id]) {
    return res.json(cache[id]);
  }

  const product = await fetchProductFromDB(id);
  cache[id] = product;  // Never evicted
  res.json(product);
});

// Storing all request history in memory
const requestLog = [];
app.use((req, res, next) => {
  requestLog.push({
    method: req.method,
    path: req.path,
    timestamp: Date.now(),
    headers: req.headers,  // Storing full headers for every request
    body: req.body,
  });
  next();
});

// Loading entire dataset into memory
let allProducts = null;
app.get('/api/products', async (req, res) => {
  if (!allProducts) {
    allProducts = await fetchAllProducts(); // Could be millions of records
  }
  const filtered = allProducts.filter(p => p.category === req.query.cat);
  res.json(filtered);
});

app.listen(3000);`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "sec-unvalidated-redirect-python",
    description: "Python Flask open redirect and header injection",
    language: "python",
    code: `from flask import Flask, request, redirect, make_response

app = Flask(__name__)

@app.route("/redirect")
def do_redirect():
    url = request.args.get("url", "/")
    # Open redirect - no validation
    return redirect(url)

@app.route("/set-header")
def set_header():
    name = request.args.get("name")
    value = request.args.get("value")
    # Header injection
    resp = make_response("OK")
    resp.headers[name] = value
    return resp

@app.route("/download")
def download():
    filename = request.args.get("file")
    # No path validation
    return send_file(f"/uploads/{filename}")
`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "clean-typescript-event-emitter",
    description: "Clean TypeScript typed event emitter",
    language: "typescript",
    code: `/**
 * Type-safe event emitter with proper resource cleanup.
 */
export type EventMap = Record<string, unknown[]>;

export class TypedEmitter<E extends EventMap> {
  private listeners = new Map<keyof E, Set<(...args: unknown[]) => void>>();

  /**
   * Register an event listener.
   * @returns An unsubscribe function for cleanup.
   */
  on<K extends keyof E>(event: K, listener: (...args: E[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as (...args: unknown[]) => void);

    return () => {
      set.delete(listener as (...args: unknown[]) => void);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /** Register a one-time event listener. */
  once<K extends keyof E>(event: K, listener: (...args: E[K]) => void): () => void {
    const unsubscribe = this.on(event, (...args: E[K]) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  /** Emit an event to all registered listeners. */
  emit<K extends keyof E>(event: K, ...args: E[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(...args);
      }
    }
  }

  /** Remove all listeners for a specific event or all events. */
  removeAll(event?: keyof E): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Get the number of listeners for an event. */
  listenerCount(event: keyof E): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "sec-ruby-yaml-load",
    description: "Ruby unsafe YAML.load with user input",
    language: "ruby",
    code: `require 'sinatra'
require 'yaml'

post '/api/config' do
  content_type :json

  # Unsafe: YAML.load can execute arbitrary Ruby code
  config = YAML.load(request.body.read)

  # Should use YAML.safe_load instead
  { status: 'loaded', keys: config.keys }.to_json
end

post '/api/import' do
  file = params[:file][:tempfile]
  # Unsafe YAML deserialization from uploaded file
  data = YAML.load(file.read)
  process_import(data)
  'Import complete'
end

get '/api/template/:name' do
  template_path = "templates/#{params[:name]}.yml"
  # Path traversal + unsafe YAML load
  template = YAML.load(File.read(template_path))
  template.to_json
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "clean-java-stream-processing",
    description: "Clean Java stream-based data processing",
    language: "java",
    code: `package com.example.analytics;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

public record SalesRecord(
    String productId,
    String category,
    double amount,
    int quantity,
    LocalDate date,
    String region
) {}

public class SalesAnalytics {

    /**
     * Calculate total revenue by category for a date range.
     */
    public Map<String, Double> revenueByCategory(
            List<SalesRecord> records,
            LocalDate start,
            LocalDate end) {
        return records.stream()
            .filter(r -> !r.date().isBefore(start) && !r.date().isAfter(end))
            .collect(Collectors.groupingBy(
                SalesRecord::category,
                Collectors.summingDouble(SalesRecord::amount)
            ));
    }

    /**
     * Find top N products by total quantity sold.
     */
    public List<Map.Entry<String, Long>> topProducts(List<SalesRecord> records, int n) {
        return records.stream()
            .collect(Collectors.groupingBy(
                SalesRecord::productId,
                Collectors.summingLong(SalesRecord::quantity)
            ))
            .entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(n)
            .toList();
    }

    /**
     * Calculate month-over-month growth rates.
     */
    public Map<String, Double> monthlyGrowthRates(List<SalesRecord> records) {
        var monthlySales = records.stream()
            .collect(Collectors.groupingBy(
                r -> r.date().withDayOfMonth(1).toString(),
                TreeMap::new,
                Collectors.summingDouble(SalesRecord::amount)
            ));

        var result = new LinkedHashMap<String, Double>();
        var months = new ArrayList<>(monthlySales.entrySet());

        for (int i = 1; i < months.size(); i++) {
            double prev = months.get(i - 1).getValue();
            double curr = months.get(i).getValue();
            double growth = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
            result.put(months.get(i).getKey(), Math.round(growth * 100.0) / 100.0);
        }

        return result;
    }
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "PERF"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "sec-csharp-insecure-crypto",
    description: "C# using deprecated crypto algorithms",
    language: "csharp",
    code: `using System;
using System.Security.Cryptography;
using System.Text;

public class CryptoHelper
{
    // Using deprecated MD5 for password hashing
    public static string HashPassword(string password)
    {
        using var md5 = MD5.Create();
        var bytes = md5.ComputeHash(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(bytes);
    }

    // Using DES - broken cipher
    public static byte[] Encrypt(string data, string key)
    {
        using var des = DES.Create();
        des.Key = Encoding.UTF8.GetBytes(key.PadRight(8).Substring(0, 8));
        des.IV = new byte[8]; // Static IV
        des.Mode = CipherMode.ECB; // ECB mode
        
        using var encryptor = des.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(data);
        return encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
    }

    // Using SHA1 for digital signatures
    public static string Sign(string data)
    {
        using var sha1 = SHA1.Create();
        var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hash);
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "auth-hardcoded-credentials-go",
    description: "Go hardcoded database credentials and API keys",
    language: "go",
    code: `package main

import (
	"database/sql"
	"fmt"
	"net/http"

	_ "github.com/go-sql-driver/mysql"
)

const (
	dbUser     = "admin"
	dbPassword = "P@ssw0rd!2024"
	dbHost     = "prod-db.internal.company.com"
	dbName     = "production"
	apiKey     = "sk-live-51A2bC3dE4fG5hI6jK7lM8nO9pQ0rS1tU2vW3xY4z"
	jwtSecret  = "my-super-secret-jwt-signing-key-do-not-share"
)

func main() {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:3306)/%s", dbUser, dbPassword, dbHost, dbName)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}

	http.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != apiKey {
			http.Error(w, "Unauthorized", 401)
			return
		}
		rows, _ := db.Query("SELECT * FROM sensitive_data")
		defer rows.Close()
		fmt.Fprintf(w, "data")
	})

	http.ListenAndServe(":8080", nil)
}`,
    expectedRuleIds: ["DATA-001"],
    category: "data-security",
    difficulty: "easy",
  },
  {
    id: "test-flaky-test-patterns",
    description: "Test file with flaky test patterns",
    language: "javascript",
    code: `const assert = require('assert');

describe('Order Processing', () => {
  // Flaky: depends on current time
  it('should create order with correct timestamp', () => {
    const order = createOrder({ item: 'widget', qty: 1 });
    assert.strictEqual(order.createdAt, new Date().toISOString());
  });

  // Flaky: depends on execution speed
  it('should process within 100ms', () => {
    const start = Date.now();
    processOrder({ item: 'widget', qty: 1 });
    const elapsed = Date.now() - start;
    assert(elapsed < 100, \`Took \${elapsed}ms\`);
  });

  // Flaky: depends on external service
  it('should fetch real pricing', async () => {
    const price = await fetch('https://api.pricing.com/widget').then(r => r.json());
    assert(price.amount > 0);
  });

  // Flaky: depends on test execution order
  let sharedState = [];
  it('should add to list', () => {
    sharedState.push('item1');
    assert.strictEqual(sharedState.length, 1);
  });
  it('should have one item', () => {
    assert.strictEqual(sharedState.length, 1); // Depends on previous test
  });

  // Flaky: random data without seed
  it('should sort random array', () => {
    const arr = Array.from({ length: 100 }, () => Math.random());
    const sorted = arr.sort((a, b) => a - b);
    assert(sorted[0] < sorted[99]);
  });
});`,
    expectedRuleIds: ["TEST-001"],
    category: "testing",
    difficulty: "medium",
  },
  {
    id: "clean-python-django-view",
    description: "Clean Django class-based views with proper patterns",
    language: "python",
    code: `from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.views.generic import ListView, CreateView, DetailView
from django.urls import reverse_lazy
from django.db.models import Q
from django.core.paginator import Paginator

from .models import Article
from .forms import ArticleForm


class ArticleListView(LoginRequiredMixin, ListView):
    model = Article
    template_name = "articles/list.html"
    context_object_name = "articles"
    paginate_by = 20
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = super().get_queryset().select_related("author")
        search = self.request.GET.get("q")
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(body__icontains=search)
            )
        return queryset


class ArticleCreateView(LoginRequiredMixin, PermissionRequiredMixin, CreateView):
    model = Article
    form_class = ArticleForm
    template_name = "articles/create.html"
    success_url = reverse_lazy("article-list")
    permission_required = "articles.add_article"

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)


class ArticleDetailView(LoginRequiredMixin, DetailView):
    model = Article
    template_name = "articles/detail.html"
    context_object_name = "article"

    def get_queryset(self):
        return super().get_queryset().select_related("author").prefetch_related("comments")
`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "AUTH", "DATA"],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "cloud-hardcoded-endpoints",
    description: "Service with hardcoded hostnames and no health checks",
    language: "javascript",
    code: `const express = require('express');
const axios = require('axios');

const app = express();

// Hardcoded internal hostnames - not portable
const SERVICES = {
  users: 'http://10.0.1.50:3001',
  orders: 'http://10.0.1.51:3002',
  payments: 'http://10.0.1.52:3003',
};

app.get('/api/checkout/:userId', async (req, res) => {
  const user = await axios.get(\`\${SERVICES.users}/users/\${req.params.userId}\`);
  const orders = await axios.get(\`\${SERVICES.orders}/orders?user=\${req.params.userId}\`);
  const balance = await axios.get(\`\${SERVICES.payments}/balance/\${req.params.userId}\`);

  res.json({
    user: user.data,
    orders: orders.data,
    balance: balance.data,
  });
});

// Writing to local log file instead of stdout
const fs = require('fs');
app.use((req, res, next) => {
  fs.appendFileSync('/var/log/app.log',
    \`\${new Date().toISOString()} \${req.method} \${req.path}\\n\`
  );
  next();
});

app.listen(3000);`,
    expectedRuleIds: ["CLOUD-001"],
    category: "cloud-readiness",
    difficulty: "easy",
  },
  {
    id: "sec-go-tls-skip-verify",
    description: "Go HTTP client skipping TLS certificate verification",
    language: "go",
    code: `package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
)

func fetchData(apiURL string) (map[string]interface{}, error) {
	// Insecure: skipping TLS certificate verification
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
	}

	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func main() {
	data, _ := fetchData("https://api.internal.com/data")
	fmt.Println(data)
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "err-ts-unhandled-promise",
    description: "TypeScript unhandled promise rejections",
    language: "typescript",
    code: `import express from 'express';

const app = express();

app.get('/api/data', (req, res) => {
  // Unhandled promise rejection - no .catch() or try/catch
  fetchDataFromAPI().then(data => {
    res.json(data);
  });
  // If fetchDataFromAPI rejects, the error is unhandled
});

app.post('/api/process', (req, res) => {
  // Fire and forget - errors silently lost
  processInBackground(req.body);
  notifyWebhook(req.body.callbackUrl);
  res.json({ status: 'accepted' });
});

async function fetchDataFromAPI(): Promise<unknown> {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}

async function processInBackground(data: unknown): Promise<void> {
  // This can throw but nobody catches it
  await heavyComputation(data);
  await saveResults(data);
}

async function notifyWebhook(url: string): Promise<void> {
  await fetch(url, { method: 'POST' });
}

function heavyComputation(data: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('Timeout')), 5000);
  });
}

function saveResults(data: unknown): Promise<void> {
  throw new Error('Not implemented');
}

app.listen(3000);`,
    expectedRuleIds: ["ERR-001"],
    category: "error-handling",
    difficulty: "medium",
  },
  {
    id: "clean-go-worker-pool",
    description: "Clean Go worker pool with proper shutdown",
    language: "go",
    code: `package worker

import (
	"context"
	"log/slog"
	"sync"
)

// Task represents a unit of work.
type Task struct {
	ID      string
	Payload interface{}
}

// Result represents the outcome of processing a task.
type Result struct {
	TaskID string
	Output interface{}
	Err    error
}

// Pool manages a pool of worker goroutines.
type Pool struct {
	workers int
	tasks   chan Task
	results chan Result
	wg      sync.WaitGroup
}

// New creates a new worker pool with the specified number of workers.
func New(workers int, bufferSize int) *Pool {
	return &Pool{
		workers: workers,
		tasks:   make(chan Task, bufferSize),
		results: make(chan Result, bufferSize),
	}
}

// Start launches the worker goroutines.
func (p *Pool) Start(ctx context.Context, process func(context.Context, Task) (interface{}, error)) {
	for i := 0; i < p.workers; i++ {
		p.wg.Add(1)
		go func(id int) {
			defer p.wg.Done()
			slog.Info("worker started", "id", id)

			for {
				select {
				case <-ctx.Done():
					slog.Info("worker stopping", "id", id)
					return
				case task, ok := <-p.tasks:
					if !ok {
						return
					}
					output, err := process(ctx, task)
					p.results <- Result{
						TaskID: task.ID,
						Output: output,
						Err:    err,
					}
				}
			}
		}(i)
	}
}

// Submit adds a task to the pool.
func (p *Pool) Submit(task Task) {
	p.tasks <- task
}

// Results returns the results channel.
func (p *Pool) Results() <-chan Result {
	return p.results
}

// Shutdown gracefully shuts down the pool.
func (p *Pool) Shutdown() {
	close(p.tasks)
	p.wg.Wait()
	close(p.results)
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "CONC", "ERR"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "api-graphql-no-depth-limit",
    description: "GraphQL API without query depth or complexity limits",
    language: "javascript",
    code: `const { ApolloServer, gql } = require('apollo-server-express');
const express = require('express');

const typeDefs = gql\`
  type User {
    id: ID!
    name: String!
    friends: [User!]!   # Recursive type - allows infinite depth queries
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    author: User!       # Circular reference
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    text: String!
    author: User!       # Circular reference
    replies: [Comment!]! # Self-referencing
  }

  type Query {
    users: [User!]!     # No pagination
    user(id: ID!): User
    posts: [Post!]!     # No pagination
  }

  type Mutation {
    createUser(name: String!, email: String!): User
    deleteAllUsers: Boolean  # Dangerous mutation, no auth
  }
\`;

// No query depth limiting
// No query complexity analysis
// No rate limiting
// No authentication on mutations
const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,   // Enabled in production
  playground: true,       // Enabled in production
});

const app = express();
server.applyMiddleware({ app });
app.listen(4000);`,
    expectedRuleIds: ["API-001"],
    category: "api-design",
    difficulty: "hard",
  },
  {
    id: "sec-csharp-path-traversal",
    description: "C# file download with path traversal vulnerability",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/files")]
public class FileController : ControllerBase
{
    private readonly string _basePath = "/uploads";

    [HttpGet("{filename}")]
    public IActionResult Download(string filename)
    {
        // Path traversal: ../../../etc/passwd
        var path = Path.Combine(_basePath, filename);
        if (!System.IO.File.Exists(path))
            return NotFound();
        return PhysicalFile(path, "application/octet-stream");
    }

    [HttpDelete("{filename}")]
    public IActionResult Delete(string filename)
    {
        // Path traversal in delete operation
        var path = Path.Combine(_basePath, filename);
        System.IO.File.Delete(path);
        return NoContent();
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "perf-python-synchronous-io",
    description: "Python sync I/O in async FastAPI endpoint",
    language: "python",
    code: `from fastapi import FastAPI
import requests
import time

app = FastAPI()

@app.get("/dashboard")
async def dashboard():
    # Blocking sync calls in async context - blocks event loop
    users = requests.get("http://user-service/api/users").json()
    orders = requests.get("http://order-service/api/orders").json()
    stats = requests.get("http://stats-service/api/stats").json()
    
    # Blocking sleep
    time.sleep(0.1)
    
    # Blocking file I/O
    with open("/var/log/access.log", "r") as f:
        recent_logs = f.readlines()[-100:]
    
    return {
        "users": len(users),
        "orders": len(orders),
        "stats": stats,
        "recent_logs": recent_logs,
    }
`,
    expectedRuleIds: ["PERF-001"],
    category: "performance",
    difficulty: "medium",
  },
  {
    id: "dep-outdated-crypto-npm",
    description: "Package.json with known-vulnerable crypto dependencies",
    language: "json",
    code: `{
  "name": "auth-service",
  "version": "1.0.0",
  "dependencies": {
    "bcrypt": "1.0.3",
    "jsonwebtoken": "7.4.1",
    "node-forge": "0.9.0",
    "crypto-js": "3.1.9-1",
    "express": "4.16.0",
    "mongoose": "5.2.0",
    "lodash": "4.17.4",
    "minimist": "0.0.8",
    "passport": "0.3.0",
    "request": "2.79.0"
  }
}`,
    expectedRuleIds: ["DEP-001"],
    category: "dependencies",
    difficulty: "easy",
  },
  {
    id: "clean-rust-error-handling",
    description: "Clean Rust error handling with custom error types",
    language: "rust",
    code: `use std::fmt;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    Internal(String),
    Database(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "Not found: {}", msg),
            Self::Unauthorized => write!(f, "Unauthorized"),
            Self::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            Self::Internal(msg) => write!(f, "Internal error: {}", msg),
            Self::Database(msg) => write!(f, "Database error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Record not found".into()),
            _ => AppError::Database(err.to_string()),
        }
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

pub async fn get_user(pool: &sqlx::PgPool, user_id: i64) -> Result<User> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    Ok(user)
}

pub async fn create_user(pool: &sqlx::PgPool, name: &str, email: &str) -> Result<User> {
    if name.is_empty() {
        return Err(AppError::BadRequest("Name cannot be empty".into()));
    }
    if !email.contains('@') {
        return Err(AppError::BadRequest("Invalid email".into()));
    }
    
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *"
    )
        .bind(name)
        .bind(email)
        .fetch_one(pool)
        .await?;
    Ok(user)
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "sec-jwt-weak-validation",
    description: "JWT validation with multiple weaknesses",
    language: "javascript",
    code: `const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();
const SECRET = 'secret123';  // Weak secret

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    // No algorithm restriction - vulnerable to algorithm confusion
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
  } catch (e) {
    // Silently ignores invalid tokens - should return 401
  }
  next();
});

app.get('/api/admin', (req, res) => {
  // Only checks if user exists, not their role
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  // No role check: any valid token gets admin access
  res.json({ secrets: 'admin data' });
});

app.post('/api/token', (req, res) => {
  // No expiration set on token
  const token = jwt.sign(
    { userId: req.body.userId, role: req.body.role }, // User controls their role claim
    SECRET
  );
  res.json({ token });
});

app.listen(3000);`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "authentication",
    difficulty: "medium",
  },
  {
    id: "clean-csharp-repository-pattern",
    description: "Clean C# repository pattern with unit of work",
    language: "csharp",
    code: `using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<IReadOnlyList<T>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task AddAsync(T entity, CancellationToken ct = default);
    void Update(T entity);
    void Remove(T entity);
}

public class Repository<T> : IRepository<T> where T : class
{
    protected readonly DbContext Context;
    protected readonly DbSet<T> DbSet;

    public Repository(DbContext context)
    {
        Context = context ?? throw new ArgumentNullException(nameof(context));
        DbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(int id, CancellationToken ct = default)
        => await DbSet.FindAsync(new object[] { id }, ct);

    public async Task<IReadOnlyList<T>> GetAllAsync(CancellationToken ct = default)
        => await DbSet.AsNoTracking().ToListAsync(ct);

    public async Task<IReadOnlyList<T>> FindAsync(
        Expression<Func<T, bool>> predicate, CancellationToken ct = default)
        => await DbSet.AsNoTracking().Where(predicate).ToListAsync(ct);

    public async Task AddAsync(T entity, CancellationToken ct = default)
        => await DbSet.AddAsync(entity, ct);

    public void Update(T entity) => DbSet.Update(entity);
    public void Remove(T entity) => DbSet.Remove(entity);
}

public interface IUnitOfWork : IDisposable
{
    IRepository<Order> Orders { get; }
    IRepository<Customer> Customers { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

public class UnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _context;

    public UnitOfWork(AppDbContext context)
    {
        _context = context;
        Orders = new Repository<Order>(context);
        Customers = new Repository<Customer>(context);
    }

    public IRepository<Order> Orders { get; }
    public IRepository<Customer> Customers { get; }

    public Task<int> SaveChangesAsync(CancellationToken ct = default)
        => _context.SaveChangesAsync(ct);

    public void Dispose() => _context.Dispose();
}`,
    expectedRuleIds: [],
    unexpectedRuleIds: ["CYBER", "SEC", "ERR", "DATA"],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "cache-no-invalidation",
    description: "Caching without invalidation or TTL strategy",
    language: "javascript",
    code: `const express = require('express');
const app = express();

const cache = new Map();

function getFromCache(key) {
  return cache.get(key);  // No TTL check, no staleness check
}

function setInCache(key, value) {
  cache.set(key, value);  // No TTL, no max size, no eviction policy
}

app.put('/api/users/:id', async (req, res) => {
  const user = await db.updateUser(req.params.id, req.body);
  // BUG: updates DB but doesn't invalidate cache
  // Stale data served until restart
  res.json(user);
});

app.get('/api/users/:id', async (req, res) => {
  const cached = getFromCache(\`user:\${req.params.id}\`);
  if (cached) return res.json(cached);  // May be stale

  const user = await db.getUser(req.params.id);
  setInCache(\`user:\${req.params.id}\`, user);
  res.json(user);
});

app.get('/api/users', async (req, res) => {
  // Caches entire user list - unbounded
  const cached = getFromCache('all-users');
  if (cached) return res.json(cached);

  const users = await db.getAllUsers();
  setInCache('all-users', users);
  res.json(users);
});

app.listen(3000);`,
    expectedRuleIds: ["CACHE-001"],
    category: "caching",
    difficulty: "medium",
  },
];
