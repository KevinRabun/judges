/**
 * Secure code template generator — pre-hardened templates
 * for common patterns with Judges findings pre-mitigated.
 *
 * All output is generated locally — no data transmitted.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface CodeTemplate {
  id: string;
  title: string;
  framework: string;
  language: string;
  description: string;
  mitigations: string[];
  code: string;
}

// ─── Template library ───────────────────────────────────────────────────────

const TEMPLATE_LIBRARY: CodeTemplate[] = [
  {
    id: "express-api-route",
    title: "Express API Route (Secure)",
    framework: "express",
    language: "typescript",
    description: "Express REST endpoint with input validation, error handling, and rate limiting",
    mitigations: [
      "Input validation with schema check",
      "Error handler hides internal details",
      "Parameterized DB queries",
      "Rate limiting per IP",
    ],
    code: `import { Router, Request, Response, NextFunction } from "express";

const router = Router();

// Simple in-memory rate limiter
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (entry.count >= limit) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    entry.count++;
    next();
  };
}

// Input validation
function validateBody(body: unknown): body is { name: string; email: string } {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b.name === "string" && b.name.length <= 200
      && typeof b.email === "string" && /^[^@]+@[^@]+$/.test(b.email);
}

router.post("/api/users", rateLimit(100, 60_000), (req: Request, res: Response) => {
  if (!validateBody(req.body)) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  // Use parameterized queries — never interpolate user input
  // db.query("INSERT INTO users (name, email) VALUES ($1, $2)", [req.body.name, req.body.email]);
  res.status(201).json({ ok: true });
});

// Centralized error handler — hides internals
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err); // log server-side only
  res.status(500).json({ error: "Internal server error" });
});

export default router;`,
  },
  {
    id: "react-auth-component",
    title: "React Auth Component (Secure)",
    framework: "react",
    language: "typescript",
    description: "React authentication form with CSRF protection and secure state management",
    mitigations: [
      "CSRF token included in form submission",
      "Password field never logged or serialized",
      "AuthN errors are generic — no user enumeration",
      "State cleared on unmount",
    ],
    code: `import React, { useState, useCallback, useEffect } from "react";

interface LoginFormProps {
  csrfToken: string;
  onLogin: (token: string) => void;
}

export function LoginForm({ csrfToken, onLogin }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Clear sensitive state on unmount
  useEffect(() => {
    return () => {
      setPassword("");
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const resp = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ email, password }),
          credentials: "same-origin",
        });
        if (!resp.ok) {
          // Generic error — prevents user enumeration
          setError("Invalid email or password");
          return;
        }
        const data = await resp.json();
        onLogin(data.token);
      } catch {
        setError("Login failed. Please try again.");
      } finally {
        setLoading(false);
        setPassword(""); // clear password from memory
      }
    },
    [email, password, csrfToken, onLogin],
  );

  return (
    <form onSubmit={handleSubmit}>
      <label>Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? "Logging in…" : "Log In"}</button>
    </form>
  );
}`,
  },
  {
    id: "node-file-upload",
    title: "Node.js File Upload (Secure)",
    framework: "node",
    language: "typescript",
    description: "File upload handler with type checking, size limits, and path traversal prevention",
    mitigations: [
      "File type allowlist — rejects unexpected MIME types",
      "Size limit enforced before writing",
      "Sanitized filename prevents path traversal",
      "Upload directory is outside web root",
    ],
    code: `import { randomUUID } from "crypto";
import { join, extname } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const UPLOAD_DIR = "/var/uploads"; // outside web root
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "application/pdf"]);
const ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".pdf"]);

interface UploadResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function handleUpload(
  filename: string,
  contentType: string,
  data: Buffer,
): UploadResult {
  // 1. Size check
  if (data.length > MAX_SIZE) return { ok: false, error: "File too large" };

  // 2. MIME type check
  if (!ALLOWED_TYPES.has(contentType)) return { ok: false, error: "File type not allowed" };

  // 3. Extension check (defense in depth)
  const ext = extname(filename).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return { ok: false, error: "File extension not allowed" };

  // 4. Generate safe filename — never use user-supplied name directly
  const id = randomUUID();
  const safeName = id + ext;
  const dest = join(UPLOAD_DIR, safeName);

  // 5. Ensure directory exists
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

  // 6. Write file
  writeFileSync(dest, data);
  return { ok: true, id };
}`,
  },
  {
    id: "python-flask-api",
    title: "Flask API Endpoint (Secure)",
    framework: "flask",
    language: "python",
    description: "Flask REST endpoint with CORS, input validation, and secure error responses",
    mitigations: [
      "CORS restricted to allowed origins",
      "Input validated before processing",
      "Errors return generic messages",
      "SQL parameterized via SQLAlchemy",
    ],
    code: `from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=["https://app.example.com"])  # restrict origins

@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    name = data.get("name", "")
    if not isinstance(name, str) or len(name) > 200:
        return jsonify({"error": "Invalid input"}), 400

    # Use parameterized queries — never f-strings with user input
    # db.session.execute(text("INSERT INTO items (name) VALUES (:name)"), {"name": name})
    return jsonify({"ok": True}), 201

@app.errorhandler(Exception)
def handle_error(e):
    app.logger.exception("Request error")  # log server-side
    return jsonify({"error": "Internal server error"}), 500
`,
  },
  {
    id: "go-http-handler",
    title: "Go HTTP Handler (Secure)",
    framework: "net/http",
    language: "go",
    description: "Go HTTP handler with timeout, input validation, and secure headers",
    mitigations: [
      "Read/write timeouts prevent slowloris",
      "Request body size limited",
      "Security headers set on every response",
      "Input validation before processing",
    ],
    code: `package main

import (
\t"encoding/json"
\t"log"
\t"net/http"
\t"time"
)

type CreateRequest struct {
\tName  string \`json:"name"\`
\tEmail string \`json:"email"\`
}

func securityHeaders(next http.Handler) http.Handler {
\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("X-Content-Type-Options", "nosniff")
\t\tw.Header().Set("X-Frame-Options", "DENY")
\t\tw.Header().Set("Content-Security-Policy", "default-src 'self'")
\t\tnext.ServeHTTP(w, r)
\t})
}

func createHandler(w http.ResponseWriter, r *http.Request) {
\tif r.Method != http.MethodPost {
\t\thttp.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
\t\treturn
\t}

\t// Limit request body size
\tr.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB

\tvar req CreateRequest
\tif err := json.NewDecoder(r.Body).Decode(&req); err != nil {
\t\thttp.Error(w, "Invalid input", http.StatusBadRequest)
\t\treturn
\t}

\tif len(req.Name) == 0 || len(req.Name) > 200 {
\t\thttp.Error(w, "Invalid name", http.StatusBadRequest)
\t\treturn
\t}

\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func main() {
\tmux := http.NewServeMux()
\tmux.HandleFunc("/api/create", createHandler)

\tsrv := &http.Server{
\t\tAddr:         ":8080",
\t\tHandler:      securityHeaders(mux),
\t\tReadTimeout:  5 * time.Second,
\t\tWriteTimeout: 10 * time.Second,
\t\tIdleTimeout:  120 * time.Second,
\t}
\tlog.Fatal(srv.ListenAndServe())
}
`,
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runGenerate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges generate — Secure code template generator

Usage:
  judges generate --list
  judges generate --template express-api-route
  judges generate --template express-api-route --out ./src/routes/users.ts
  judges generate --lang typescript
  judges generate --framework flask

Options:
  --list                  List all available templates
  --template <id>         Generate a specific template
  --lang <language>       Filter templates by language
  --framework <name>      Filter templates by framework
  --out <path>            Write template to file (stdout if omitted)
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang");
  const framework = argv.find((_a: string, i: number) => argv[i - 1] === "--framework");

  // Filter
  let templates = TEMPLATE_LIBRARY;
  if (lang) templates = templates.filter((t) => t.language === lang.toLowerCase());
  if (framework) templates = templates.filter((t) => t.framework === framework.toLowerCase());

  // List
  if (argv.includes("--list") || !argv.find((_a: string, i: number) => argv[i - 1] === "--template")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          templates.map(({ code: _c, ...rest }) => rest),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Secure Code Templates (${templates.length})\n  ──────────────────────────`);
      for (const t of templates) {
        console.log(`    ${t.id.padEnd(25)} ${t.language.padEnd(12)} ${t.framework.padEnd(10)} ${t.title}`);
      }
      console.log(`\n  Use: judges generate --template <id>\n`);
    }
    return;
  }

  // Specific template
  const templateId = argv.find((_a: string, i: number) => argv[i - 1] === "--template");
  if (!templateId) return;

  const tmpl = TEMPLATE_LIBRARY.find((t) => t.id === templateId);
  if (!tmpl) {
    console.error(`  Template not found: ${templateId}`);
    console.error(`  Use --list to see available templates.`);
    return;
  }

  // Output path
  const outPath = argv.find((_a: string, i: number) => argv[i - 1] === "--out");

  if (format === "json") {
    console.log(JSON.stringify(tmpl, null, 2));
    return;
  }

  const header = [
    `// ═══════════════════════════════════════════════════`,
    `// ${tmpl.title}`,
    `// Framework: ${tmpl.framework} | Language: ${tmpl.language}`,
    `// ${tmpl.description}`,
    `//`,
    `// Security mitigations applied:`,
    ...tmpl.mitigations.map((m) => `//   ✓ ${m}`),
    `//`,
    `// Generated by: judges generate --template ${tmpl.id}`,
    `// ═══════════════════════════════════════════════════`,
    ``,
  ].join("\n");

  const output = header + tmpl.code;

  if (outPath) {
    const { writeFileSync: wfs } = require("fs");
    wfs(outPath, output);
    console.log(`  ✅ Written to ${outPath}`);
    console.log(`     Template: ${tmpl.title}`);
  } else {
    console.log(output);
  }
}
