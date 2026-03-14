/**
 * Pattern registry — team knowledge sharing via a local
 * repository of security patterns and anti-patterns.
 *
 * All data stays in .judges-patterns/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SecurityPattern {
  id: string;
  title: string;
  category: string;
  type: "pattern" | "anti-pattern";
  language: string;
  description: string;
  example: string;
  fix?: string;
  author: string;
  tags: string[];
  createdAt: string;
}

const PATTERN_DIR = ".judges-patterns";

// ─── Built-in patterns ─────────────────────────────────────────────────────

const BUILTIN_PATTERNS: SecurityPattern[] = [
  {
    id: "sql-parameterized",
    title: "Parameterized SQL Queries",
    category: "injection",
    type: "pattern",
    language: "typescript",
    description: "Always use parameterized queries to prevent SQL injection",
    example: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
    author: "judges",
    tags: ["sql", "injection", "security"],
    createdAt: "2025-01-01",
  },
  {
    id: "sql-concat-antipattern",
    title: "String Concatenation in SQL",
    category: "injection",
    type: "anti-pattern",
    language: "typescript",
    description: "Never concatenate user input into SQL queries",
    example: 'db.query("SELECT * FROM users WHERE id = " + userId)',
    fix: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
    author: "judges",
    tags: ["sql", "injection", "security"],
    createdAt: "2025-01-01",
  },
  {
    id: "input-validation",
    title: "Input Validation Pattern",
    category: "validation",
    type: "pattern",
    language: "typescript",
    description: "Validate all user input at system boundaries",
    example: 'if (!schema.safeParse(req.body).success) return res.status(400).json({ error: "Invalid input" })',
    author: "judges",
    tags: ["validation", "input", "security"],
    createdAt: "2025-01-01",
  },
  {
    id: "error-exposure-antipattern",
    title: "Stack Trace Exposure",
    category: "error-handling",
    type: "anti-pattern",
    language: "typescript",
    description: "Never expose stack traces or internal errors to users",
    example: "res.status(500).json({ error: err.stack })",
    fix: 'res.status(500).json({ error: "Internal server error" })',
    author: "judges",
    tags: ["error", "information-leak", "security"],
    createdAt: "2025-01-01",
  },
];

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(PATTERN_DIR)) mkdirSync(PATTERN_DIR, { recursive: true });
}

function loadPatterns(): SecurityPattern[] {
  ensureDir();
  const files = readdirSync(PATTERN_DIR).filter((f) => f.endsWith(".json"));
  const custom: SecurityPattern[] = [];
  for (const f of files) {
    try {
      custom.push(JSON.parse(readFileSync(join(PATTERN_DIR, f), "utf-8")));
    } catch {
      /* skip invalid files */
    }
  }
  return [...BUILTIN_PATTERNS, ...custom];
}

function sanitizeId(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase()
    .slice(0, 50);
}

export function addPattern(pattern: Omit<SecurityPattern, "id" | "createdAt">): SecurityPattern {
  ensureDir();
  const id = sanitizeId(pattern.title);
  const full: SecurityPattern = {
    ...pattern,
    id,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(join(PATTERN_DIR, `${id}.json`), JSON.stringify(full, null, 2));
  return full;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPatternRegistry(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges pattern-registry — Team security pattern knowledge repository

Usage:
  judges pattern-registry --list
  judges pattern-registry --show sql-parameterized
  judges pattern-registry --add --title "CSRF Token Check" --category csrf --type pattern --lang typescript --desc "Always verify CSRF tokens" --example "verifyCSRF(req.headers['x-csrf-token'])" --author "alice@co.com"
  judges pattern-registry --search injection
  judges pattern-registry --anti-patterns

Options:
  --list                  List all patterns
  --show <id>             Show pattern details
  --add                   Add a new pattern
  --title <text>          Pattern title
  --category <name>       Category (injection, validation, auth, etc.)
  --type <kind>           pattern or anti-pattern
  --lang <language>       Programming language
  --desc <text>           Description
  --example <code>        Code example
  --fix <code>            Fix for anti-patterns
  --author <name>         Author name
  --search <term>         Search patterns by keyword
  --anti-patterns         Show only anti-patterns
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const patterns = loadPatterns();

  // Anti-patterns only
  if (argv.includes("--anti-patterns")) {
    const antiPatterns = patterns.filter((p) => p.type === "anti-pattern");
    if (format === "json") {
      console.log(JSON.stringify(antiPatterns, null, 2));
    } else {
      console.log(`\n  Anti-Patterns (${antiPatterns.length})\n  ──────────────────────────`);
      for (const p of antiPatterns) {
        console.log(`    ❌ ${p.id.padEnd(30)} ${p.title}`);
        console.log(`       ${p.description}`);
        if (p.fix) console.log(`       Fix: ${p.fix}`);
        console.log("");
      }
    }
    return;
  }

  // Search
  const searchTerm = argv.find((_a: string, i: number) => argv[i - 1] === "--search");
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    const matches = patterns.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.tags.some((t) => t.includes(term)) ||
        p.category.includes(term),
    );
    if (format === "json") {
      console.log(JSON.stringify(matches, null, 2));
    } else {
      console.log(`\n  Search: "${searchTerm}" (${matches.length} matches)\n  ──────────────────────────`);
      for (const p of matches) {
        const icon = p.type === "pattern" ? "✅" : "❌";
        console.log(`    ${icon} ${p.id.padEnd(30)} ${p.title}`);
      }
      console.log("");
    }
    return;
  }

  // Show specific
  const showId = argv.find((_a: string, i: number) => argv[i - 1] === "--show");
  if (showId) {
    const p = patterns.find((pat) => pat.id === showId);
    if (!p) {
      console.error(`  Pattern not found: ${showId}`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(p, null, 2));
    } else {
      const icon = p.type === "pattern" ? "✅" : "❌";
      console.log(`\n  ${icon} ${p.title}`);
      console.log(`  ──────────────────────────`);
      console.log(`  Category:    ${p.category}`);
      console.log(`  Type:        ${p.type}`);
      console.log(`  Language:    ${p.language}`);
      console.log(`  Author:      ${p.author}`);
      console.log(`  Tags:        ${p.tags.join(", ")}`);
      console.log(`\n  ${p.description}`);
      console.log(`\n  Example: ${p.example}`);
      if (p.fix) console.log(`  Fix:     ${p.fix}`);
      console.log("");
    }
    return;
  }

  // Add pattern
  if (argv.includes("--add")) {
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || "Untitled";
    const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category") || "general";
    const type = (argv.find((_a: string, i: number) => argv[i - 1] === "--type") || "pattern") as
      | "pattern"
      | "anti-pattern";
    const language = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "typescript";
    const description = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "";
    const example = argv.find((_a: string, i: number) => argv[i - 1] === "--example") || "";
    const fix = argv.find((_a: string, i: number) => argv[i - 1] === "--fix");
    const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author") || "anonymous";

    const p = addPattern({ title, category, type, language, description, example, fix, author, tags: [category] });
    console.log(`  ✅ Pattern added: ${p.id}`);
    return;
  }

  // List all
  if (format === "json") {
    console.log(JSON.stringify(patterns, null, 2));
  } else {
    console.log(`\n  Pattern Registry (${patterns.length} patterns)\n  ──────────────────────────`);
    for (const p of patterns) {
      const icon = p.type === "pattern" ? "✅" : "❌";
      console.log(`    ${icon} ${p.id.padEnd(30)} ${p.category.padEnd(15)} ${p.title}`);
    }
    console.log(`\n  Use: judges pattern-registry --show <id>\n`);
  }
}
