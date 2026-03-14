/**
 * Finding-hotfix-suggest — Suggest quick hotfixes for common findings.
 *
 * Provides targeted one-liner or small code snippets to address
 * frequently-encountered security and quality issues.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HotfixSuggestion {
  ruleId: string;
  title: string;
  severity: string;
  hotfix: string;
  category: string;
}

// ─── Hotfix Database ────────────────────────────────────────────────────────

const HOTFIX_PATTERNS: Array<{ keywords: string[]; category: string; hotfix: string }> = [
  {
    keywords: ["sql injection", "sql"],
    category: "injection",
    hotfix: "Use parameterized queries instead of string concatenation",
  },
  {
    keywords: ["xss", "cross-site scripting", "innerhtml"],
    category: "xss",
    hotfix: "Sanitize user input with DOMPurify or use textContent instead of innerHTML",
  },
  {
    keywords: ["eval", "code injection"],
    category: "injection",
    hotfix: "Replace eval() with JSON.parse() or a safe alternative",
  },
  {
    keywords: ["hardcoded", "password", "secret", "api key"],
    category: "secrets",
    hotfix: "Move secrets to environment variables or a secrets manager",
  },
  { keywords: ["csrf", "cross-site request"], category: "csrf", hotfix: "Add CSRF token validation middleware" },
  {
    keywords: ["cors", "permissive"],
    category: "cors",
    hotfix: "Configure CORS with specific allowed origins instead of wildcard",
  },
  {
    keywords: ["md5", "sha1", "weak hash", "weak crypto"],
    category: "crypto",
    hotfix: "Use SHA-256 or bcrypt for password hashing",
  },
  {
    keywords: ["math.random", "insecure random"],
    category: "crypto",
    hotfix: "Use crypto.randomBytes() or crypto.getRandomValues() instead",
  },
  {
    keywords: ["path traversal", "directory traversal"],
    category: "path",
    hotfix: "Validate and sanitize file paths; use path.resolve() and check against base directory",
  },
  {
    keywords: ["command injection", "exec", "child_process"],
    category: "injection",
    hotfix: "Use execFile() with argument arrays instead of exec() with string interpolation",
  },
  {
    keywords: ["missing auth", "authentication", "unauthorized"],
    category: "auth",
    hotfix: "Add authentication middleware to protect the endpoint",
  },
  {
    keywords: ["missing rate limit", "rate limit"],
    category: "availability",
    hotfix: "Add express-rate-limit or similar middleware",
  },
  {
    keywords: ["information disclosure", "stack trace", "verbose error"],
    category: "info-disclosure",
    hotfix: "Use generic error messages in production; log details server-side only",
  },
  {
    keywords: ["insecure cookie", "cookie"],
    category: "session",
    hotfix: "Set cookie flags: httpOnly, secure, sameSite='strict'",
  },
  {
    keywords: ["tls", "ssl", "certificate", "rejectunauthorized"],
    category: "transport",
    hotfix: "Never disable TLS certificate verification in production",
  },
  {
    keywords: ["unused", "dead code"],
    category: "quality",
    hotfix: "Remove unused code to reduce attack surface and maintenance burden",
  },
  {
    keywords: ["logging sensitive", "log password"],
    category: "logging",
    hotfix: "Remove sensitive data from log statements; use structured logging with redaction",
  },
];

function findHotfix(title: string, description: string): { category: string; hotfix: string } | null {
  const combined = `${title} ${description}`.toLowerCase();
  for (const p of HOTFIX_PATTERNS) {
    if (p.keywords.some((kw) => combined.includes(kw))) {
      return { category: p.category, hotfix: p.hotfix };
    }
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingHotfixSuggest(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-hotfix-suggest — Suggest quick hotfixes for findings

Usage:
  judges finding-hotfix-suggest --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const suggestions: HotfixSuggestion[] = [];
  for (const f of verdict.findings) {
    const hotfix = findHotfix(f.title, f.description);
    if (hotfix) {
      suggestions.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity || "medium",
        hotfix: hotfix.hotfix,
        category: hotfix.category,
      });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  if (suggestions.length === 0) {
    console.log("No hotfix suggestions available for current findings.");
    return;
  }

  console.log(`\nHotfix Suggestions (${suggestions.length})`);
  console.log("═".repeat(70));

  for (const s of suggestions) {
    console.log(`\n  [${s.severity.toUpperCase()}] ${s.title}`);
    console.log(`  Category: ${s.category}`);
    console.log(`  Hotfix: ${s.hotfix}`);
  }

  console.log("\n" + "═".repeat(70));
  console.log(`${suggestions.length} of ${verdict.findings.length} findings have suggested hotfixes`);
}
