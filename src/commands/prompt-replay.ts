/**
 * Prompt replay — reverse-engineer the probable AI prompt that generated
 * flagged code and suggest improved prompts that produce compliant output.
 *
 * Turns Judges into a prompt engineering coach.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PromptSuggestion {
  findingPattern: string;
  probablePrompt: string;
  improvedPrompt: string;
  rationale: string;
}

// ─── Pattern → Prompt Map ───────────────────────────────────────────────────

const PATTERN_PROMPTS: Array<{
  pattern: RegExp;
  category: string;
  probablePrompt: string;
  improvedPrompt: string;
  rationale: string;
}> = [
  {
    pattern: /sql.?inject|string\s+concat.*query|`\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i,
    category: "SQL Injection",
    probablePrompt: "Generate a function to query the database for user records",
    improvedPrompt:
      "Generate a function to query the database for user records using parameterized queries. Use prepared statements, never string concatenation for SQL. Include input validation.",
    rationale: "AI models default to string interpolation for SQL unless explicitly told to use parameterized queries",
  },
  {
    pattern: /innerHTML|dangerouslySetInnerHTML|document\.write/i,
    category: "XSS Vulnerability",
    probablePrompt: "Create a component that renders user content",
    improvedPrompt:
      "Create a component that renders user content. Sanitize all user inputs using DOMPurify before rendering. Never use innerHTML or dangerouslySetInnerHTML with unsanitized data.",
    rationale: "AI models use innerHTML for simplicity unless instructed to sanitize",
  },
  {
    pattern: /hardcoded.?(secret|password|key|token)|['"][A-Za-z0-9+/]{20,}['"]/i,
    category: "Hardcoded Secrets",
    probablePrompt: "Set up API authentication with the service",
    improvedPrompt:
      "Set up API authentication with the service. Read all secrets from environment variables or a secrets manager. Never hardcode API keys, passwords, or tokens in source code.",
    rationale: "AI models often embed placeholder credentials that developers forget to replace",
  },
  {
    pattern: /eval\s*\(|new\s+Function\s*\(/i,
    category: "Code Injection via eval",
    probablePrompt: "Create a dynamic expression evaluator",
    improvedPrompt:
      "Create a dynamic expression evaluator. Do NOT use eval() or new Function(). Use a safe expression parser library (e.g., mathjs, expr-eval) or a whitelist-based approach.",
    rationale: "AI models reach for eval() as the shortest path to dynamic execution",
  },
  {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    category: "Empty Catch Blocks",
    probablePrompt: "Add error handling to this function",
    improvedPrompt:
      "Add error handling to this function. Every catch block must either log the error, re-throw it, or return a meaningful error response. Never swallow exceptions silently.",
    rationale: "AI models often add empty try/catch to 'handle errors' without actual handling",
  },
  {
    pattern: /console\.(log|debug)\s*\(.*(?:password|token|secret|key|credential)/i,
    category: "Sensitive Data Logging",
    probablePrompt: "Add logging to track authentication flow",
    improvedPrompt:
      "Add logging to track authentication flow. Never log passwords, tokens, secrets, or PII. Use structured logging with severity levels. Redact sensitive fields.",
    rationale: "AI models log everything requested without considering data sensitivity",
  },
  {
    pattern: /(?:http:\/\/|fetch\s*\(['"]http:)/i,
    category: "Insecure HTTP",
    probablePrompt: "Fetch data from the API endpoint",
    improvedPrompt:
      "Fetch data from the API endpoint using HTTPS. Never use plain HTTP for API calls. Validate SSL certificates. Set appropriate timeouts.",
    rationale: "AI models sometimes use http:// in examples without upgrading to https://",
  },
  {
    pattern: /Math\.random\s*\(\)|crypto\.createHash\s*\(\s*['"]md5['"]\)/i,
    category: "Weak Cryptography",
    probablePrompt: "Generate a unique token/hash for the user session",
    improvedPrompt:
      "Generate a unique token for the user session using crypto.randomUUID() or crypto.randomBytes(). For hashing, use SHA-256 or bcrypt. Never use Math.random() for security or MD5 for hashing.",
    rationale: "AI models default to Math.random() or MD5 which are cryptographically insecure",
  },
  {
    pattern: /\.exec\s*\(|child_process|spawn\s*\(.*\$|execSync\s*\(.*\+/i,
    category: "Command Injection",
    probablePrompt: "Execute a system command with user-provided parameters",
    improvedPrompt:
      "Execute a system command with user-provided parameters. Use an allowlist of permitted commands. Pass arguments as an array (spawn), never via string concatenation. Validate and sanitize all inputs.",
    rationale: "AI models concatenate user input into shell commands without sanitization",
  },
  {
    pattern: /cors\(\s*\)|Access-Control-Allow-Origin.*\*/i,
    category: "Permissive CORS",
    probablePrompt: "Enable CORS for the API",
    improvedPrompt:
      "Enable CORS for the API. Specify allowed origins explicitly (never use '*' in production). Set appropriate methods, headers, and credentials options.",
    rationale: "AI models default to permissive CORS (allow all) for simplicity",
  },
  {
    pattern: /(?:app|router)\.(get|post|put|delete)\s*\([^)]*(?!.*(?:auth|middleware|protect|guard))/i,
    category: "Missing Auth Middleware",
    probablePrompt: "Create REST API endpoints for the resource",
    improvedPrompt:
      "Create REST API endpoints for the resource. Apply authentication middleware to all routes. Use authorization checks for role-based access. Apply rate limiting to prevent abuse.",
    rationale: "AI models create routes without auth middleware unless explicitly instructed",
  },
  {
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\*\s+FROM/i,
    category: "SELECT * Usage",
    probablePrompt: "Query all records from the table",
    improvedPrompt:
      "Query records from the table. Select only the specific columns needed, never use SELECT *. Add pagination with LIMIT/OFFSET. Include proper WHERE clauses.",
    rationale: "AI models use SELECT * for convenience, which exposes unnecessary data and hurts performance",
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeCode(content: string): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = [];
  const seen = new Set<string>();

  for (const entry of PATTERN_PROMPTS) {
    if (entry.pattern.test(content) && !seen.has(entry.category)) {
      seen.add(entry.category);
      suggestions.push({
        findingPattern: entry.category,
        probablePrompt: entry.probablePrompt,
        improvedPrompt: entry.improvedPrompt,
        rationale: entry.rationale,
      });
    }
  }

  return suggestions;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPromptReplay(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges prompt-replay — Reverse-engineer AI prompts and suggest improvements

Usage:
  judges prompt-replay <file>
  judges prompt-replay src/api.ts --format json
  judges prompt-replay --demo

Options:
  <file>               File to analyze for AI-generated anti-patterns
  --demo               Run with built-in demo code
  --format json        JSON output
  --help, -h           Show this help

Detects AI-generated anti-patterns and suggests improved prompts that
would produce compliant code on the first try.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isDemo = argv.includes("--demo");

  let content: string;

  if (isDemo) {
    content = `
const query = "SELECT * FROM users WHERE id = " + userId;
document.innerHTML = userInput;
const apiKey = "sk-1234567890abcdef";
try { riskyOperation(); } catch (e) {}
console.log("Auth token: " + token);
fetch("http://api.example.com/data");
const sessionId = Math.random().toString(36);
app.get("/admin/users", (req, res) => { res.json(users); });
`;
  } else {
    const file = argv.find((a) => !a.startsWith("-")) || "";
    if (!file || !existsSync(file)) {
      console.error("  Specify a file to analyze or use --demo");
      return;
    }
    content = readFileSync(file, "utf-8");
  }

  const suggestions = analyzeCode(content);

  if (format === "json") {
    console.log(
      JSON.stringify({ suggestions, total: suggestions.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(
      `\n  Prompt Replay — ${suggestions.length} AI prompt improvement(s) found\n  ──────────────────────────`,
    );

    if (suggestions.length === 0) {
      console.log("  ✅ No common AI anti-patterns detected");
    } else {
      for (const s of suggestions) {
        console.log(`\n    🔍 ${s.findingPattern}`);
        console.log(`        Probable AI prompt: "${s.probablePrompt}"`);
        console.log(`        💡 Improved prompt:  "${s.improvedPrompt}"`);
        console.log(`        📝 ${s.rationale}`);
      }
    }
    console.log("");
  }
}
