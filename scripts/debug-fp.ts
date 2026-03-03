/**
 * Cross-language FP sweep — Tests all evaluators against clean, idiomatic code
 * for every supported application language: Python, Rust, C#, Java, Go, C++.
 *
 * Usage:  npx tsx scripts/debug-fp.ts
 */

import { analyzeAuthentication } from "../src/evaluators/authentication.js";
import { analyzeCybersecurity } from "../src/evaluators/cybersecurity.js";
import { analyzeDataSecurity } from "../src/evaluators/data-security.js";
import { analyzeDataSovereignty } from "../src/evaluators/data-sovereignty.js";
import { analyzeDatabase } from "../src/evaluators/database.js";
import { analyzeDocumentation } from "../src/evaluators/documentation.js";
import { analyzeErrorHandling } from "../src/evaluators/error-handling.js";
import { analyzeCloudReadiness } from "../src/evaluators/cloud-readiness.js";
import { analyzeCostEffectiveness } from "../src/evaluators/cost-effectiveness.js";
import { analyzeScalability } from "../src/evaluators/scalability.js";
import { analyzePerformance } from "../src/evaluators/performance.js";
import { analyzeReliability } from "../src/evaluators/reliability.js";
import { analyzeCompliance } from "../src/evaluators/compliance.js";
import { analyzePortability } from "../src/evaluators/portability.js";
import { analyzeAccessibility } from "../src/evaluators/accessibility.js";
import { analyzeInternationalization } from "../src/evaluators/internationalization.js";
import { analyzeCaching } from "../src/evaluators/caching.js";
import { analyzeAiCodeSafety } from "../src/evaluators/ai-code-safety.js";
import { analyzeConfigurationManagement } from "../src/evaluators/configuration-management.js";
import { analyzeCiCd } from "../src/evaluators/ci-cd.js";
import { analyzeTesting } from "../src/evaluators/testing.js";
import { analyzeSoftwarePractices } from "../src/evaluators/software-practices.js";
import { analyzeUx } from "../src/evaluators/ux.js";
import { analyzeRateLimiting } from "../src/evaluators/rate-limiting.js";
import { analyzeObservability } from "../src/evaluators/observability.js";
import { analyzeLoggingPrivacy } from "../src/evaluators/logging-privacy.js";
import { analyzeConcurrency } from "../src/evaluators/concurrency.js";
import { analyzeMaintainability } from "../src/evaluators/maintainability.js";
import { analyzeCodeStructure } from "../src/evaluators/code-structure.js";
import { analyzeApiDesign } from "../src/evaluators/api-design.js";
import { analyzeBackwardsCompatibility } from "../src/evaluators/backwards-compatibility.js";
import { analyzeAgentInstructions } from "../src/evaluators/agent-instructions.js";
import { analyzeEthicsBias } from "../src/evaluators/ethics-bias.js";
import { analyzeDependencyHealth } from "../src/evaluators/dependency-health.js";
import { analyzeFrameworkSafety } from "../src/evaluators/framework-safety.js";
import { analyzeIacSecurity } from "../src/evaluators/iac-security.js";
import type { Finding } from "../src/types.js";

// ─── All evaluators ──────────────────────────────────────────────────────────
const EVALUATORS: Array<{ name: string; fn: (code: string, lang: string) => Finding[] }> = [
  { name: "authentication", fn: analyzeAuthentication },
  { name: "cybersecurity", fn: analyzeCybersecurity },
  { name: "data-security", fn: analyzeDataSecurity },
  { name: "data-sovereignty", fn: analyzeDataSovereignty },
  { name: "database", fn: analyzeDatabase },
  { name: "documentation", fn: analyzeDocumentation },
  { name: "error-handling", fn: analyzeErrorHandling },
  { name: "cloud-readiness", fn: analyzeCloudReadiness },
  { name: "cost-effectiveness", fn: analyzeCostEffectiveness },
  { name: "scalability", fn: analyzeScalability },
  { name: "performance", fn: analyzePerformance },
  { name: "reliability", fn: analyzeReliability },
  { name: "compliance", fn: analyzeCompliance },
  { name: "portability", fn: analyzePortability },
  { name: "accessibility", fn: analyzeAccessibility },
  { name: "internationalization", fn: analyzeInternationalization },
  { name: "caching", fn: analyzeCaching },
  { name: "ai-code-safety", fn: analyzeAiCodeSafety },
  { name: "configuration-management", fn: analyzeConfigurationManagement },
  { name: "ci-cd", fn: analyzeCiCd },
  { name: "testing", fn: analyzeTesting },
  { name: "software-practices", fn: analyzeSoftwarePractices },
  { name: "ux", fn: analyzeUx },
  { name: "rate-limiting", fn: analyzeRateLimiting },
  { name: "observability", fn: analyzeObservability },
  { name: "logging-privacy", fn: analyzeLoggingPrivacy },
  { name: "concurrency", fn: analyzeConcurrency },
  { name: "maintainability", fn: analyzeMaintainability },
  { name: "code-structure", fn: analyzeCodeStructure },
  { name: "api-design", fn: analyzeApiDesign },
  { name: "backwards-compatibility", fn: analyzeBackwardsCompatibility },
  { name: "agent-instructions", fn: analyzeAgentInstructions },
  { name: "ethics-bias", fn: analyzeEthicsBias },
  { name: "dependency-health", fn: analyzeDependencyHealth },
  { name: "framework-safety", fn: analyzeFrameworkSafety },
  { name: "iac-security", fn: analyzeIacSecurity },
];

// ─── Clean, idiomatic code samples — these should produce ZERO false positives ─
// Each sample is a realistic, well-structured backend/library that follows best practices.

const SAMPLES: Array<{ name: string; language: string; code: string }> = [
  // ── Python / FastAPI ───────────────────────────────────────────────────────
  {
    name: "Python FastAPI service",
    language: "python",
    code: `"""
User management API built with FastAPI.

This module provides REST endpoints for managing users with
proper authentication, validation, and error handling.
"""
import os
import logging
from typing import Optional
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field, validator
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import Session, sessionmaker, declarative_base
import bcrypt
import jwt

# Configuration from environment
DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")

logger = logging.getLogger(__name__)
app = FastAPI(title="User Service", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Database setup with connection pooling
engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_recycle=3600)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class User(Base):
    """SQLAlchemy model for the users table."""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=12, max_length=128)

    @validator("password")
    def password_complexity(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain digit")
        return v


class UserResponse(BaseModel):
    """Schema for user API responses."""
    id: int
    email: str
    role: str


# Auth dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def get_db():
    """Yield a database session with proper cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Decode JWT token and return the current user."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def require_role(required: str):
    """Role-based access control decorator."""
    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role != required:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return dependency


@app.post("/api/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user with bcrypt-hashed password."""
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed = bcrypt.hashpw(user_data.password.encode(), bcrypt.gensalt(rounds=12))
    user = User(email=user_data.email, hashed_password=hashed.decode())
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("User created: id=%d", user.id)
    return user


@app.get("/api/users/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@app.get("/api/admin/users", response_model=list[UserResponse])
def list_users(admin: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    """List all users (admin only)."""
    return db.query(User).all()


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
`,
  },

  // ── Rust / Actix-web ───────────────────────────────────────────────────────
  {
    name: "Rust Actix-web service",
    language: "rust",
    code: `//! Product catalog API built with Actix-web.
//!
//! This module exposes REST endpoints for a product catalog
//! with authentication, database access, and structured error handling.

use actix_web::{web, App, HttpServer, HttpResponse, middleware, guard};
use actix_web::web::{Data, Json, Path, Query};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, postgres::PgPoolOptions, FromRow};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use std::env;
use tracing::{info, error, instrument};
use uuid::Uuid;
use bcrypt::{hash, verify, DEFAULT_COST};

/// Application configuration loaded from environment variables.
#[derive(Clone)]
struct AppConfig {
    database_url: String,
    jwt_secret: String,
    listen_addr: String,
}

impl AppConfig {
    /// Load configuration from environment variables.
    fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")?,
            jwt_secret: env::var("JWT_SECRET")?,
            listen_addr: env::var("LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
        })
    }
}

/// A product in the catalog.
#[derive(Debug, Serialize, Deserialize, FromRow)]
struct Product {
    id: Uuid,
    name: String,
    description: String,
    price_cents: i64,
    category: String,
}

/// Request body for creating a product.
#[derive(Debug, Deserialize)]
struct CreateProductRequest {
    name: String,
    description: String,
    price_cents: i64,
    category: String,
}

/// Query parameters for listing products.
#[derive(Debug, Deserialize)]
struct ListParams {
    page: Option<i64>,
    per_page: Option<i64>,
    category: Option<String>,
}

/// JWT claims structure.
#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    role: String,
    exp: usize,
}

/// Custom error type with proper HTTP mapping.
#[derive(Debug)]
enum ApiError {
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    Internal(String),
    BadRequest(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::NotFound(msg) => write!(f, "Not found: {}", msg),
            ApiError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            ApiError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            ApiError::Internal(msg) => write!(f, "Internal error: {}", msg),
            ApiError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
        }
    }
}

impl actix_web::ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        match self {
            ApiError::NotFound(msg) => HttpResponse::NotFound().json(serde_json::json!({"error": msg})),
            ApiError::Unauthorized(msg) => HttpResponse::Unauthorized().json(serde_json::json!({"error": msg})),
            ApiError::Forbidden(msg) => HttpResponse::Forbidden().json(serde_json::json!({"error": msg})),
            ApiError::Internal(msg) => {
                error!("Internal error: {}", msg);
                HttpResponse::InternalServerError().json(serde_json::json!({"error": "Internal server error"}))
            }
            ApiError::BadRequest(msg) => HttpResponse::BadRequest().json(serde_json::json!({"error": msg})),
        }
    }
}

/// Extract and validate JWT from the Authorization header.
fn authenticate(req: &actix_web::HttpRequest, secret: &str) -> Result<Claims, ApiError> {
    let header = req.headers().get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| ApiError::Unauthorized("Missing Authorization header".into()))?;

    let token = header.strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::Unauthorized("Invalid Bearer format".into()))?;

    let key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);
    let data = decode::<Claims>(token, &key, &validation)
        .map_err(|e| ApiError::Unauthorized(format!("Invalid token: {}", e)))?;

    Ok(data.claims)
}

/// List products with optional category filter and pagination.
#[instrument(skip(pool))]
async fn list_products(
    pool: Data<PgPool>,
    params: Query<ListParams>,
) -> Result<Json<Vec<Product>>, ApiError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let products = match &params.category {
        Some(cat) => {
            sqlx::query_as::<_, Product>(
                "SELECT id, name, description, price_cents, category FROM products WHERE category = $1 ORDER BY name LIMIT $2 OFFSET $3"
            )
            .bind(cat)
            .bind(per_page)
            .bind(offset)
            .fetch_all(pool.get_ref())
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?
        }
        None => {
            sqlx::query_as::<_, Product>(
                "SELECT id, name, description, price_cents, category FROM products ORDER BY name LIMIT $1 OFFSET $2"
            )
            .bind(per_page)
            .bind(offset)
            .fetch_all(pool.get_ref())
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?
        }
    };

    Ok(Json(products))
}

/// Create a new product (requires admin role).
#[instrument(skip(pool, req, config))]
async fn create_product(
    pool: Data<PgPool>,
    req: actix_web::HttpRequest,
    config: Data<AppConfig>,
    body: Json<CreateProductRequest>,
) -> Result<Json<Product>, ApiError> {
    let claims = authenticate(&req, &config.jwt_secret)?;
    if claims.role != "admin" {
        return Err(ApiError::Forbidden("Admin role required".into()));
    }

    if body.name.is_empty() || body.price_cents < 0 {
        return Err(ApiError::BadRequest("Invalid product data".into()));
    }

    let id = Uuid::new_v4();
    let product = sqlx::query_as::<_, Product>(
        "INSERT INTO products (id, name, description, price_cents, category) VALUES ($1, $2, $3, $4, $5) RETURNING *"
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(body.price_cents)
    .bind(&body.category)
    .fetch_one(pool.get_ref())
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    info!("Product created: {}", id);
    Ok(Json(product))
}

/// Get a single product by ID.
#[instrument(skip(pool))]
async fn get_product(
    pool: Data<PgPool>,
    path: Path<Uuid>,
) -> Result<Json<Product>, ApiError> {
    let id = path.into_inner();
    let product = sqlx::query_as::<_, Product>(
        "SELECT id, name, description, price_cents, category FROM products WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?
    .ok_or_else(|| ApiError::NotFound(format!("Product {} not found", id)))?;

    Ok(Json(product))
}

/// Health check endpoint.
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "healthy"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::init();
    let config = AppConfig::from_env().expect("Failed to load config");

    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    let config_data = Data::new(config.clone());

    info!("Starting server on {}", config.listen_addr);
    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(pool.clone()))
            .app_data(config_data.clone())
            .wrap(middleware::Logger::default())
            .wrap(middleware::Compress::default())
            .route("/health", web::get().to(health))
            .route("/api/products", web::get().to(list_products))
            .route("/api/products", web::post().to(create_product))
            .route("/api/products/{id}", web::get().to(get_product))
    })
    .bind(&config.listen_addr)?
    .run()
    .await
}
`,
  },

  // ── C# / ASP.NET ──────────────────────────────────────────────────────────
  {
    name: "C# ASP.NET Core Web API",
    language: "csharp",
    code: `/// <summary>
/// Order management API built with ASP.NET Core.
/// Provides endpoints for creating and querying orders
/// with JWT authentication and role-based authorization.
/// </summary>
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace OrderService.Controllers
{
    /// <summary>
    /// Database context for order management.
    /// </summary>
    public class OrderDbContext : DbContext
    {
        public OrderDbContext(DbContextOptions<OrderDbContext> options) : base(options) { }
        public DbSet<Order> Orders { get; set; }
        public DbSet<OrderItem> OrderItems { get; set; }
    }

    /// <summary>
    /// Represents a customer order.
    /// </summary>
    public class Order
    {
        public int Id { get; set; }
        public string CustomerId { get; set; }
        public DateTime CreatedAt { get; set; }
        public string Status { get; set; }
        public decimal TotalAmount { get; set; }
        public List<OrderItem> Items { get; set; } = new();
    }

    /// <summary>
    /// Represents an item within an order.
    /// </summary>
    public class OrderItem
    {
        public int Id { get; set; }
        public int OrderId { get; set; }
        public string ProductId { get; set; }
        public int Quantity { get; set; }
        public decimal UnitPrice { get; set; }
    }

    /// <summary>
    /// DTO for creating a new order.
    /// </summary>
    public class CreateOrderRequest
    {
        [Required]
        [MinLength(1, ErrorMessage = "At least one item is required")]
        public List<OrderItemRequest> Items { get; set; }
    }

    /// <summary>
    /// DTO for an order item in a creation request.
    /// </summary>
    public class OrderItemRequest
    {
        [Required]
        public string ProductId { get; set; }

        [Range(1, 1000, ErrorMessage = "Quantity must be between 1 and 1000")]
        public int Quantity { get; set; }

        [Range(0.01, 999999.99, ErrorMessage = "Price must be positive")]
        public decimal UnitPrice { get; set; }
    }

    /// <summary>
    /// API controller for order management operations.
    /// All endpoints require authentication; admin endpoints require the "Admin" role.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class OrdersController : ControllerBase
    {
        private readonly OrderDbContext _context;
        private readonly ILogger<OrdersController> _logger;

        public OrdersController(OrderDbContext context, ILogger<OrdersController> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Get all orders for the authenticated user.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Order>>> GetMyOrders()
        {
            var userId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var orders = await _context.Orders
                .Include(o => o.Items)
                .Where(o => o.CustomerId == userId)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            return Ok(orders);
        }

        /// <summary>
        /// Get a specific order by ID.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<ActionResult<Order>> GetOrder(int id)
        {
            var userId = User.FindFirst("sub")?.Value;
            var order = await _context.Orders
                .Include(o => o.Items)
                .FirstOrDefaultAsync(o => o.Id == id);

            if (order == null)
                return NotFound(new { message = "Order not found" });

            if (order.CustomerId != userId && !User.IsInRole("Admin"))
                return Forbid();

            return Ok(order);
        }

        /// <summary>
        /// Create a new order.
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<Order>> CreateOrder([FromBody] CreateOrderRequest request)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var userId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var order = new Order
                {
                    CustomerId = userId,
                    CreatedAt = DateTime.UtcNow,
                    Status = "pending",
                    Items = request.Items.Select(i => new OrderItem
                    {
                        ProductId = i.ProductId,
                        Quantity = i.Quantity,
                        UnitPrice = i.UnitPrice
                    }).ToList(),
                    TotalAmount = request.Items.Sum(i => i.Quantity * i.UnitPrice)
                };

                _context.Orders.Add(order);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Order {OrderId} created for user {UserId}", order.Id, userId);
                return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, order);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to create order for user {UserId}", userId);
                return StatusCode(500, new { message = "Failed to create order" });
            }
        }

        /// <summary>
        /// List all orders (admin only).
        /// </summary>
        [HttpGet("admin/all")]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<IEnumerable<Order>>> GetAllOrders(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            var orders = await _context.Orders
                .Include(o => o.Items)
                .OrderByDescending(o => o.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(orders);
        }
    }
}
`,
  },

  // ── Java / Spring Boot ─────────────────────────────────────────────────────
  {
    name: "Java Spring Boot service",
    language: "java",
    code: `package com.example.inventory.controller;

import com.example.inventory.model.InventoryItem;
import com.example.inventory.repository.InventoryRepository;
import com.example.inventory.exception.ResourceNotFoundException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * REST controller for inventory management.
 *
 * <p>Provides CRUD operations for inventory items with
 * role-based access control and input validation.
 *
 * @author Inventory Team
 * @version 1.0
 */
@RestController
@RequestMapping("/api/inventory")
@Validated
public class InventoryController {

    private static final Logger logger = LoggerFactory.getLogger(InventoryController.class);

    private final InventoryRepository repository;

    @Autowired
    public InventoryController(InventoryRepository repository) {
        this.repository = repository;
    }

    /**
     * List all inventory items with pagination.
     *
     * @param page the page number (0-based)
     * @param size the page size
     * @return paginated list of inventory items
     */
    @GetMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<InventoryItem>> listItems(
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) int size) {

        size = Math.min(size, 100);
        List<InventoryItem> items = repository.findAll(page, size);
        return ResponseEntity.ok(items);
    }

    /**
     * Get a single inventory item by ID.
     *
     * @param id the item ID
     * @return the inventory item
     * @throws ResourceNotFoundException if not found
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<InventoryItem> getItem(@PathVariable UUID id) {
        InventoryItem item = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Item not found: " + id));
        return ResponseEntity.ok(item);
    }

    /**
     * Create a new inventory item.
     *
     * @param request the item creation request
     * @return the created item with 201 status
     */
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<InventoryItem> createItem(@Valid @RequestBody CreateItemRequest request) {
        InventoryItem item = new InventoryItem();
        item.setId(UUID.randomUUID());
        item.setName(request.getName());
        item.setSku(request.getSku());
        item.setQuantity(request.getQuantity());
        item.setCreatedAt(Instant.now());

        InventoryItem saved = repository.save(item);
        logger.info("Inventory item created: id={}, sku={}", saved.getId(), saved.getSku());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    /**
     * Update item quantity (stock adjustment).
     *
     * @param id the item ID
     * @param adjustment the quantity adjustment (positive or negative)
     * @return the updated item
     */
    @PatchMapping("/{id}/quantity")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<InventoryItem> adjustQuantity(
            @PathVariable UUID id,
            @Valid @RequestBody QuantityAdjustment adjustment) {

        InventoryItem item = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Item not found: " + id));

        int newQuantity = item.getQuantity() + adjustment.getDelta();
        if (newQuantity < 0) {
            return ResponseEntity.badRequest().build();
        }

        item.setQuantity(newQuantity);
        item.setUpdatedAt(Instant.now());
        repository.save(item);

        logger.info("Inventory adjusted: id={}, delta={}, new_qty={}", id, adjustment.getDelta(), newQuantity);
        return ResponseEntity.ok(item);
    }

    /**
     * Delete an inventory item.
     *
     * @param id the item ID
     * @return 204 No Content
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteItem(@PathVariable UUID id) {
        if (!repository.existsById(id)) {
            throw new ResourceNotFoundException("Item not found: " + id);
        }
        repository.deleteById(id);
        logger.info("Inventory item deleted: id={}", id);
        return ResponseEntity.noContent().build();
    }
}

/**
 * Request DTO for creating an inventory item.
 */
class CreateItemRequest {
    @NotBlank(message = "Name is required")
    @Size(min = 1, max = 200)
    private String name;

    @NotBlank(message = "SKU is required")
    private String sku;

    @NotNull
    @Min(value = 0, message = "Quantity must be non-negative")
    private Integer quantity;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
}

/**
 * Request DTO for quantity adjustments.
 */
class QuantityAdjustment {
    @NotNull(message = "Delta is required")
    private Integer delta;

    public Integer getDelta() { return delta; }
    public void setDelta(Integer delta) { this.delta = delta; }
}
`,
  },

  // ── Go / Standard Library ─────────────────────────────────────────────────
  {
    name: "Go HTTP service",
    language: "go",
    code: `// Package main implements a task management API.
//
// It provides REST endpoints for creating, reading, and completing tasks
// with JWT authentication and structured logging.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

// Config holds application configuration loaded from environment variables.
type Config struct {
	DatabaseURL string
	JWTSecret   string
	ListenAddr  string
}

// LoadConfig reads configuration from environment variables.
func LoadConfig() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	return &Config{DatabaseURL: dbURL, JWTSecret: secret, ListenAddr: addr}, nil
}

// Task represents a single task item.
type Task struct {
	ID          string    \`json:"id"\`
	Title       string    \`json:"title"\`
	Description string    \`json:"description"\`
	Completed   bool      \`json:"completed"\`
	CreatedAt   time.Time \`json:"created_at"\`
}

// CreateTaskRequest is the request body for creating a task.
type CreateTaskRequest struct {
	Title       string \`json:"title"\`
	Description string \`json:"description"\`
}

// validate checks that the request fields are valid.
func (r *CreateTaskRequest) validate() error {
	if strings.TrimSpace(r.Title) == "" {
		return errors.New("title is required")
	}
	if len(r.Title) > 200 {
		return errors.New("title must be 200 characters or less")
	}
	return nil
}

// Server holds dependencies for HTTP handlers.
type Server struct {
	db     *sql.DB
	config *Config
	logger *slog.Logger
}

// authMiddleware extracts and validates the JWT token.
func (s *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(s.config.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "invalid claims", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), "user_id", claims["sub"])
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// handleListTasks returns all tasks for the authenticated user.
func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value("user_id").(string)

	rows, err := s.db.QueryContext(r.Context(),
		"SELECT id, title, description, completed, created_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		s.logger.Error("failed to query tasks", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasks []Task
	for rows.Next() {
		var t Task
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.Completed, &t.CreatedAt); err != nil {
			s.logger.Error("failed to scan task", "error", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		s.logger.Error("row iteration error", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasks)
}

// handleCreateTask creates a new task for the authenticated user.
func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value("user_id").(string)

	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := req.validate(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	var task Task
	err := s.db.QueryRowContext(r.Context(),
		"INSERT INTO tasks (title, description, user_id) VALUES ($1, $2, $3) RETURNING id, title, description, completed, created_at",
		req.Title, req.Description, userID,
	).Scan(&task.ID, &task.Title, &task.Description, &task.Completed, &task.CreatedAt)
	if err != nil {
		s.logger.Error("failed to create task", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	s.logger.Info("task created", "id", task.ID, "user", userID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(task)
}

// handleHealth returns the service health status.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := s.db.PingContext(ctx); err != nil {
		http.Error(w, "database unhealthy", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	config, err := LoadConfig()
	if err != nil {
		logger.Error("configuration error", "error", err)
		os.Exit(1)
	}

	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	srv := &Server{db: db, config: config, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", srv.handleHealth)
	mux.HandleFunc("GET /api/tasks", srv.authMiddleware(srv.handleListTasks))
	mux.HandleFunc("POST /api/tasks", srv.authMiddleware(srv.handleCreateTask))

	httpSrv := &http.Server{
		Addr:         config.ListenAddr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		logger.Info("shutting down gracefully")
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		httpSrv.Shutdown(ctx)
	}()

	logger.Info("starting server", "addr", config.ListenAddr)
	if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("server error", "error", err)
		os.Exit(1)
	}
}
`,
  },

  // ── C++ / REST SDK ─────────────────────────────────────────────────────────
  {
    name: "C++ REST API service",
    language: "cpp",
    code: `/**
 * @file sensor_api.cpp
 * @brief IoT sensor data collection API.
 *
 * Provides REST endpoints for ingesting and querying
 * sensor telemetry data with input validation and
 * structured error handling.
 */

#include <iostream>
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <shared_mutex>
#include <memory>
#include <chrono>
#include <optional>
#include <stdexcept>
#include <algorithm>
#include <sstream>
#include <cstdlib>
#include <format>

// Forward declarations for external dependencies
namespace httplib {
    class Server;
    class Request;
    class Response;
}
namespace nlohmann { class json; }
namespace spdlog { void info(const char*, ...); void error(const char*, ...); }

/**
 * Represents a single sensor reading.
 */
struct SensorReading {
    std::string sensor_id;
    double value;
    std::string unit;
    std::chrono::system_clock::time_point timestamp;
};

/**
 * Validates a sensor ID string.
 *
 * @param id The sensor ID to validate.
 * @return true if the ID is valid (alphanumeric, 1-64 chars).
 */
bool validate_sensor_id(const std::string& id) {
    if (id.empty() || id.size() > 64) {
        return false;
    }
    return std::all_of(id.begin(), id.end(), [](char c) {
        return std::isalnum(c) || c == '-' || c == '_';
    });
}

/**
 * Validates a sensor reading value.
 *
 * @param value The reading value to validate.
 * @return true if the value is within acceptable range.
 */
bool validate_reading(double value) {
    return std::isfinite(value) && value >= -1e6 && value <= 1e6;
}

/**
 * Thread-safe in-memory storage for sensor readings.
 *
 * Uses a shared mutex for concurrent read access
 * with exclusive write locking.
 */
class SensorStore {
public:
    /**
     * Add a new sensor reading to the store.
     *
     * @param reading The sensor reading to store.
     * @throws std::invalid_argument if the reading is invalid.
     */
    void add_reading(const SensorReading& reading) {
        if (!validate_sensor_id(reading.sensor_id)) {
            throw std::invalid_argument("Invalid sensor ID");
        }
        if (!validate_reading(reading.value)) {
            throw std::invalid_argument("Reading value out of range");
        }

        std::unique_lock lock(mutex_);
        readings_[reading.sensor_id].push_back(reading);

        // Enforce per-sensor retention limit
        const size_t max_readings_per_sensor = 10000;
        auto& sensor_readings = readings_[reading.sensor_id];
        if (sensor_readings.size() > max_readings_per_sensor) {
            sensor_readings.erase(
                sensor_readings.begin(),
                sensor_readings.begin() + (sensor_readings.size() - max_readings_per_sensor)
            );
        }
    }

    /**
     * Retrieve readings for a specific sensor.
     *
     * @param sensor_id The sensor to query.
     * @param limit Maximum number of readings to return.
     * @return Vector of sensor readings, most recent first.
     */
    std::vector<SensorReading> get_readings(
        const std::string& sensor_id,
        size_t limit = 100
    ) const {
        std::shared_lock lock(mutex_);
        auto it = readings_.find(sensor_id);
        if (it == readings_.end()) {
            return {};
        }

        const auto& all = it->second;
        size_t count = std::min(limit, all.size());
        return std::vector<SensorReading>(all.end() - count, all.end());
    }

    /**
     * Get the list of all known sensor IDs.
     *
     * @return Vector of sensor ID strings.
     */
    std::vector<std::string> list_sensors() const {
        std::shared_lock lock(mutex_);
        std::vector<std::string> ids;
        ids.reserve(readings_.size());
        for (const auto& [id, _] : readings_) {
            ids.push_back(id);
        }
        return ids;
    }

    /**
     * Get the count of readings for a sensor.
     *
     * @param sensor_id The sensor to check.
     * @return Number of stored readings.
     */
    size_t count(const std::string& sensor_id) const {
        std::shared_lock lock(mutex_);
        auto it = readings_.find(sensor_id);
        return it != readings_.end() ? it->second.size() : 0;
    }

private:
    mutable std::shared_mutex mutex_;
    std::unordered_map<std::string, std::vector<SensorReading>> readings_;
};

/**
 * Application entry point.
 *
 * Configures and starts the HTTP server with endpoints for
 * sensor data ingestion and querying.
 */
int main() {
    // Load configuration from environment
    const char* port_str = std::getenv("PORT");
    int port = port_str ? std::stoi(port_str) : 8080;

    const char* api_key = std::getenv("API_KEY");
    if (!api_key) {
        std::cerr << "API_KEY environment variable is required" << std::endl;
        return 1;
    }
    std::string expected_key(api_key);

    auto store = std::make_shared<SensorStore>();

    spdlog::info("Starting sensor API on port {}", port);
    spdlog::info("Server running on port {}", port);

    return 0;
}
`,
  },
];

// ─── Run sweep ───────────────────────────────────────────────────────────────

interface FPFinding {
  sample: string;
  language: string;
  evaluator: string;
  ruleId: string;
  title: string;
  confidence: number;
  isAbsenceBased?: boolean;
}

const allFPs: FPFinding[] = [];

for (const sample of SAMPLES) {
  for (const evaluator of EVALUATORS) {
    try {
      const findings = evaluator.fn(sample.code, sample.language);
      for (const f of findings) {
        allFPs.push({
          sample: sample.name,
          language: sample.language,
          evaluator: evaluator.name,
          ruleId: f.ruleId,
          title: f.title,
          confidence: f.confidence ?? 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          isAbsenceBased: (f as any).isAbsenceBased,
        });
      }
    } catch {
      // Evaluator threw an error (e.g. iac-security on app code) — skip
    }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(80)}`);
console.log(`CROSS-LANGUAGE FP SWEEP — ${allFPs.length} total findings`);
console.log(`${"═".repeat(80)}\n`);

// Group by language
const byLang = new Map<string, FPFinding[]>();
for (const fp of allFPs) {
  const arr = byLang.get(fp.language) || [];
  arr.push(fp);
  byLang.set(fp.language, arr);
}

for (const [lang, fps] of byLang) {
  console.log(`\n── ${lang.toUpperCase()} (${fps.length} findings) ──`);
  for (const fp of fps) {
    const absence = fp.isAbsenceBased ? " [ABSENCE]" : "";
    console.log(`  ${fp.ruleId} (${fp.evaluator}) — ${fp.title} [conf=${fp.confidence}]${absence}`);
  }
}

// Summary by rule
console.log(`\n${"─".repeat(80)}`);
console.log("SUMMARY BY RULE:");
const byRule = new Map<string, { count: number; title: string; languages: Set<string> }>();
for (const fp of allFPs) {
  const key = `${fp.ruleId}`;
  const entry = byRule.get(key) || { count: 0, title: fp.title, languages: new Set() };
  entry.count++;
  entry.languages.add(fp.language);
  byRule.set(key, entry);
}
const sorted = [...byRule.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [ruleId, info] of sorted) {
  console.log(`  ${ruleId} × ${info.count} — ${info.title} — langs: ${[...info.languages].join(", ")}`);
}
console.log();
