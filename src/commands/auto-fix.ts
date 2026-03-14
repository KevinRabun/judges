/**
 * Auto-fix — generates safe, automated fix suggestions for
 * common finding patterns. All processing is local.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FixTemplate {
  rulePattern: string;
  title: string;
  description: string;
  before: string;
  after: string;
  language: string;
}

interface FixSuggestion {
  ruleId: string;
  title: string;
  file: string;
  line: number;
  before: string;
  after: string;
  confidence: number;
  timestamp: string;
}

interface FixStore {
  suggestions: FixSuggestion[];
  applied: number;
  updatedAt: string;
}

const FIX_DIR = ".judges-auto-fix";
const FIX_FILE = join(FIX_DIR, "fix-history.json");

// ─── Fix template library ───────────────────────────────────────────────────

const FIX_TEMPLATES: FixTemplate[] = [
  {
    rulePattern: "SQL-",
    title: "Use parameterized queries",
    description: "Replace string concatenation in SQL with parameterized queries",
    before: 'db.query("SELECT * FROM users WHERE id = " + userId)',
    after: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
    language: "typescript",
  },
  {
    rulePattern: "XSS-",
    title: "Use textContent instead of innerHTML",
    description: "Replace innerHTML with textContent to prevent XSS",
    before: "element.innerHTML = userInput",
    after: "element.textContent = userInput",
    language: "typescript",
  },
  {
    rulePattern: "CMD-",
    title: "Use execFile with argument array",
    description: "Replace exec with execFile and separate arguments",
    before: 'exec("git " + command)',
    after: 'execFile("git", [command])',
    language: "typescript",
  },
  {
    rulePattern: "CRYPTO-",
    title: "Replace MD5 with SHA-256",
    description: "Use cryptographically secure hash function",
    before: "crypto.createHash('md5').update(data).digest('hex')",
    after: "crypto.createHash('sha256').update(data).digest('hex')",
    language: "typescript",
  },
  {
    rulePattern: "AUTH-",
    title: "Add bcrypt password hashing",
    description: "Hash passwords with bcrypt instead of plaintext storage",
    before: "user.password = password",
    after: "user.password = await bcrypt.hash(password, 12)",
    language: "typescript",
  },
  {
    rulePattern: "SEC-",
    title: "Validate input before use",
    description: "Add input validation before processing user data",
    before: "const data = req.body",
    after: "const data = validateInput(req.body, schema)",
    language: "typescript",
  },
  {
    rulePattern: "SSRF-",
    title: "Validate URL against allowlist",
    description: "Check URL against trusted domains before requesting",
    before: "await fetch(userUrl)",
    after: "if (isAllowedUrl(userUrl)) await fetch(userUrl)",
    language: "typescript",
  },
  {
    rulePattern: "PATH-",
    title: "Sanitize file path",
    description: "Resolve and validate file path within allowed directory",
    before: 'readFileSync(userPath, "utf-8")',
    after: 'readFileSync(path.resolve(SAFE_DIR, path.basename(userPath)), "utf-8")',
    language: "typescript",
  },
  {
    rulePattern: "ERR-",
    title: "Use safe error response",
    description: "Return generic error message instead of stack trace",
    before: "res.status(500).json({ error: err.stack })",
    after: 'res.status(500).json({ error: "Internal server error" })',
    language: "typescript",
  },
  {
    rulePattern: "CORS-",
    title: "Restrict CORS origins",
    description: "Replace wildcard CORS with specific trusted origins",
    before: 'cors({ origin: "*" })',
    after: 'cors({ origin: ["https://app.example.com"] })',
    language: "typescript",
  },
];

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(FIX_DIR)) mkdirSync(FIX_DIR, { recursive: true });
}

function loadStore(): FixStore {
  if (!existsSync(FIX_FILE)) return { suggestions: [], applied: 0, updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(FIX_FILE, "utf-8"));
  } catch {
    return { suggestions: [], applied: 0, updatedAt: new Date().toISOString() };
  }
}

function saveStore(store: FixStore): void {
  ensureDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(FIX_FILE, JSON.stringify(store, null, 2));
}

export function suggestFix(ruleId: string, file: string, line: number): FixSuggestion | null {
  const template = FIX_TEMPLATES.find((t) => ruleId.startsWith(t.rulePattern));
  if (!template) return null;

  const suggestion: FixSuggestion = {
    ruleId,
    title: template.title,
    file,
    line,
    before: template.before,
    after: template.after,
    confidence: 75,
    timestamp: new Date().toISOString(),
  };

  const store = loadStore();
  store.suggestions.push(suggestion);
  if (store.suggestions.length > 500) store.suggestions = store.suggestions.slice(-500);
  saveStore(store);

  return suggestion;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAutoFix(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges auto-fix — Automated fix suggestions for findings

Usage:
  judges auto-fix --rule SQL-001 --file src/db.ts --line 42
  judges auto-fix --catalog
  judges auto-fix --history
  judges auto-fix --stats

Options:
  --rule <id>             Rule ID to generate fix for
  --file <path>           File containing the finding
  --line <n>              Line number of the finding
  --catalog               Show all available fix templates
  --history               Show past fix suggestions
  --stats                 Show fix statistics
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Catalog
  if (argv.includes("--catalog")) {
    if (format === "json") {
      console.log(JSON.stringify(FIX_TEMPLATES, null, 2));
    } else {
      console.log(`\n  Fix Template Catalog (${FIX_TEMPLATES.length})\n  ──────────────────────────`);
      for (const t of FIX_TEMPLATES) {
        console.log(`    [${t.rulePattern.padEnd(8)}] ${t.title}`);
        console.log(`            Before: ${t.before}`);
        console.log(`            After:  ${t.after}`);
        console.log("");
      }
    }
    return;
  }

  // History
  if (argv.includes("--history")) {
    const store = loadStore();
    if (format === "json") {
      console.log(JSON.stringify(store.suggestions.slice(-20), null, 2));
    } else {
      console.log(`\n  Fix History (${store.suggestions.length} suggestions)\n  ──────────────────────────`);
      for (const s of store.suggestions.slice(-15)) {
        console.log(`    ${s.timestamp.slice(0, 16)}  ${s.ruleId.padEnd(10)} ${s.title}  ${s.file}:${s.line}`);
      }
      console.log("");
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const store = loadStore();
    const byRule = new Map<string, number>();
    for (const s of store.suggestions) {
      const prefix = s.ruleId.split("-")[0] + "-";
      byRule.set(prefix, (byRule.get(prefix) || 0) + 1);
    }
    if (format === "json") {
      console.log(
        JSON.stringify(
          { total: store.suggestions.length, applied: store.applied, byRule: Object.fromEntries(byRule) },
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Fix Statistics\n  ──────────────────────────`);
      console.log(`  Total suggestions: ${store.suggestions.length}`);
      console.log(`  Applied:           ${store.applied}`);
      if (byRule.size > 0) {
        console.log(`\n  By category:`);
        for (const [rule, count] of byRule) {
          console.log(`    ${rule.padEnd(10)} ${count} suggestions`);
        }
      }
      console.log("");
    }
    return;
  }

  // Suggest fix
  const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const line = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--line") || "1", 10);

  if (!ruleId) {
    console.error("  Use --rule <id>, --catalog, --history, or --stats. --help for usage.");
    return;
  }

  const suggestion = suggestFix(ruleId, file || "unknown", line);
  if (!suggestion) {
    console.log(`  No fix template for rule: ${ruleId}`);
    console.log(`  Available patterns: ${FIX_TEMPLATES.map((t) => t.rulePattern).join(", ")}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(suggestion, null, 2));
  } else {
    console.log(`\n  Fix Suggestion — ${suggestion.ruleId}`);
    console.log(`  ──────────────────────────`);
    console.log(`  Title: ${suggestion.title}`);
    console.log(`  File:  ${suggestion.file}:${suggestion.line}`);
    console.log(`\n  Before: ${suggestion.before}`);
    console.log(`  After:  ${suggestion.after}`);
    console.log(`\n  Confidence: ${suggestion.confidence}%\n`);
  }
}
