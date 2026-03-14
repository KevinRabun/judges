/**
 * Developer learning path — personalized, structured learning
 * based on a developer's finding history.
 *
 * Uses .judges-scores/ and .judges-learn/ for progress.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LearningModule {
  id: string;
  title: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  concepts: string[];
  exercises: string[];
  completed: boolean;
  completedAt?: string;
}

interface LearningPath {
  author: string;
  modules: LearningModule[];
  progress: number; // 0-100
  streak: number;
  lastActivity: string;
}

const LEARN_DIR = ".judges-learn";

// ─── Module library ─────────────────────────────────────────────────────────

const MODULE_LIBRARY: Omit<LearningModule, "completed" | "completedAt">[] = [
  {
    id: "sec-input-validation",
    title: "Input Validation Fundamentals",
    category: "SEC",
    difficulty: "beginner",
    concepts: [
      "All user input is untrusted",
      "Validate on the server side, not just client",
      "Use allowlists over denylists",
      "Sanitize before use, not after",
    ],
    exercises: [
      "Write a function that validates email format using regex",
      "Create a middleware that rejects requests with unexpected Content-Type",
      "Implement parameter validation for a REST API endpoint",
    ],
  },
  {
    id: "sec-injection-prevention",
    title: "Injection Attack Prevention",
    category: "INJECT",
    difficulty: "intermediate",
    concepts: [
      "Parameterized queries prevent SQL injection",
      "Template literals in queries are dangerous",
      "Context-aware output encoding for XSS",
      "Command injection via child_process",
    ],
    exercises: [
      "Refactor a string-concatenation query to use parameterized queries",
      "Identify injection vectors in a sample Express handler",
      "Write a safe exec() wrapper with argument allowlisting",
    ],
  },
  {
    id: "auth-session-management",
    title: "Authentication & Session Management",
    category: "AUTH",
    difficulty: "intermediate",
    concepts: [
      "Never store passwords in plaintext",
      "Use bcrypt/argon2 with proper salt rounds",
      "Session tokens must be cryptographically random",
      "Implement token rotation and expiry",
    ],
    exercises: [
      "Implement password hashing with bcrypt",
      "Create a session management module with expiry",
      "Build a JWT refresh token rotation flow",
    ],
  },
  {
    id: "crypto-fundamentals",
    title: "Cryptography Best Practices",
    category: "CRYPTO",
    difficulty: "advanced",
    concepts: [
      "AES-256-GCM for symmetric encryption",
      "RSA-2048+ or ECDSA for asymmetric",
      "Never reuse IVs/nonces",
      "Key derivation with PBKDF2 or scrypt",
    ],
    exercises: [
      "Replace MD5 hash with SHA-256 in a codebase",
      "Implement AES-256-GCM encryption/decryption",
      "Create a key rotation mechanism",
    ],
  },
  {
    id: "error-handling",
    title: "Error Handling & Information Leakage",
    category: "ERR",
    difficulty: "beginner",
    concepts: [
      "Never expose stack traces to users",
      "Log errors server-side with context",
      "Use error boundaries in frontend code",
      "Return safe, generic error messages",
    ],
    exercises: [
      "Implement a centralized error handler with safe responses",
      "Add structured logging to an existing error flow",
      "Create error boundaries for a React component tree",
    ],
  },
  {
    id: "perf-database",
    title: "Database Performance Patterns",
    category: "PERF",
    difficulty: "intermediate",
    concepts: [
      "N+1 queries waste resources",
      "Use eager loading or batch queries",
      "Index frequently queried columns",
      "Paginate large result sets",
    ],
    exercises: [
      "Identify and fix N+1 queries in an ORM-based app",
      "Add pagination to an API endpoint",
      "Profile and add missing database indexes",
    ],
  },
  {
    id: "ssrf-prevention",
    title: "Server-Side Request Forgery Prevention",
    category: "SSRF",
    difficulty: "advanced",
    concepts: [
      "Validate and restrict outbound URLs",
      "Block requests to internal/private IP ranges",
      "Use URL allowlists for external integrations",
      "DNS rebinding attacks bypass naive checks",
    ],
    exercises: [
      "Implement URL validation with private IP blocking",
      "Create an HTTP client wrapper with domain allowlisting",
      "Write tests for SSRF edge cases (DNS rebinding, redirects)",
    ],
  },
  {
    id: "secure-config",
    title: "Secure Configuration Management",
    category: "SEC",
    difficulty: "beginner",
    concepts: [
      "Never commit secrets to version control",
      "Use environment variables for configuration",
      "Principle of least privilege for service accounts",
      "Review default configurations for security",
    ],
    exercises: [
      "Set up dotenv with proper .gitignore rules",
      "Audit a project for hardcoded credentials",
      "Create a secrets management checklist",
    ],
  },
];

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(LEARN_DIR)) mkdirSync(LEARN_DIR, { recursive: true });
}

function sanitizeFilename(author: string): string {
  return author.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

function loadPath(author: string): LearningPath {
  ensureDir();
  const file = join(LEARN_DIR, `${sanitizeFilename(author)}.json`);
  if (!existsSync(file)) {
    return {
      author,
      modules: MODULE_LIBRARY.map((m) => ({ ...m, completed: false })),
      progress: 0,
      streak: 0,
      lastActivity: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(file, "utf-8"));
}

function savePath(path: LearningPath): void {
  ensureDir();
  const file = join(LEARN_DIR, `${sanitizeFilename(path.author)}.json`);
  writeFileSync(file, JSON.stringify(path, null, 2));
}

export function completeModule(author: string, moduleId: string): LearningPath {
  const path = loadPath(author);
  const mod = path.modules.find((m) => m.id === moduleId);
  if (mod && !mod.completed) {
    mod.completed = true;
    mod.completedAt = new Date().toISOString();
    path.streak++;
  }
  path.progress = Math.round((path.modules.filter((m) => m.completed).length / path.modules.length) * 100);
  path.lastActivity = new Date().toISOString();
  savePath(path);
  return path;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runLearn(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges learn — Personalized developer learning paths

Usage:
  judges learn --author "jane@company.com"
  judges learn --author "jane@company.com" --module sec-input-validation
  judges learn --author "jane@company.com" --complete sec-input-validation
  judges learn --catalog

Options:
  --author <email>       Developer email/identifier
  --module <id>          Show a specific module
  --complete <id>        Mark a module as completed
  --catalog              Show full module catalog
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Catalog
  if (argv.includes("--catalog")) {
    if (format === "json") {
      console.log(JSON.stringify(MODULE_LIBRARY, null, 2));
    } else {
      console.log(`\n  Learning Module Catalog (${MODULE_LIBRARY.length})\n  ──────────────────────────`);
      for (const m of MODULE_LIBRARY) {
        console.log(`    [${m.difficulty.padEnd(12)}] ${m.id.padEnd(25)} ${m.title}`);
      }
      console.log("");
    }
    return;
  }

  const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
  if (!author) {
    console.error("  Use --author <email> or --catalog. --help for usage.");
    return;
  }

  // Complete module
  const completeId = argv.find((_a: string, i: number) => argv[i - 1] === "--complete");
  if (completeId) {
    const path = completeModule(author, completeId);
    const mod = path.modules.find((m) => m.id === completeId);
    if (!mod) {
      console.error(`  ❌ Module not found: ${completeId}`);
      return;
    }
    console.log(`  ✅ Completed: ${mod.title}`);
    console.log(
      `     Progress: ${path.progress}% (${path.modules.filter((m) => m.completed).length}/${path.modules.length})`,
    );
    return;
  }

  // Show specific module
  const moduleId = argv.find((_a: string, i: number) => argv[i - 1] === "--module");
  if (moduleId) {
    const mod = MODULE_LIBRARY.find((m) => m.id === moduleId);
    if (!mod) {
      console.error(`  ❌ Module not found: ${moduleId}`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(mod, null, 2));
    } else {
      console.log(`\n  Module: ${mod.title}`);
      console.log(`  Category: ${mod.category} | Difficulty: ${mod.difficulty}`);
      console.log(`  ──────────────────────────────`);
      console.log("\n  Concepts:");
      for (const c of mod.concepts) console.log(`    • ${c}`);
      console.log("\n  Exercises:");
      mod.exercises.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
      console.log("");
    }
    return;
  }

  // Show learning path
  const path = loadPath(author);
  if (format === "json") {
    console.log(JSON.stringify(path, null, 2));
  } else {
    console.log(`\n  Learning Path — ${author}`);
    console.log(`  Progress: ${path.progress}% | Streak: ${path.streak} modules`);
    console.log(`  ──────────────────────────────`);
    for (const m of path.modules) {
      const icon = m.completed ? "✅" : "⬜";
      console.log(`    ${icon} [${m.difficulty.padEnd(12)}] ${m.id.padEnd(25)} ${m.title}`);
    }
    const next = path.modules.find((m) => !m.completed);
    if (next) {
      console.log(`\n  Next up: ${next.title} (${next.difficulty})`);
      console.log(`  Run: judges learn --author "${author}" --module ${next.id}`);
    }
    console.log("");
  }
}
