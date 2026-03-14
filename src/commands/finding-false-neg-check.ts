/**
 * Finding-false-neg-check — Check for potential false negatives.
 *
 * Analyzes code for common vulnerability patterns that may have been
 * missed by the current judge panel. Uses keyword heuristics to flag
 * lines that warrant manual review.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FalseNegCandidate {
  lineNumber: number;
  lineContent: string;
  pattern: string;
  category: string;
  reason: string;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const SUSPICIOUS_PATTERNS: Array<{ regex: RegExp; category: string; reason: string }> = [
  { regex: /eval\s*\(/, category: "injection", reason: "Dynamic code evaluation" },
  { regex: /innerHTML\s*=/, category: "xss", reason: "Direct innerHTML assignment" },
  { regex: /dangerouslySetInnerHTML/, category: "xss", reason: "React dangerous HTML" },
  { regex: /document\.write\s*\(/, category: "xss", reason: "Document write usage" },
  { regex: /exec\s*\(/, category: "command-injection", reason: "Command execution" },
  { regex: /child_process/, category: "command-injection", reason: "Child process usage" },
  { regex: /SELECT\s.*FROM\s.*WHERE/i, category: "sql-injection", reason: "Raw SQL query" },
  { regex: /password\s*[:=]\s*['"]/, category: "hardcoded-secret", reason: "Hardcoded password" },
  { regex: /api[_-]?key\s*[:=]\s*['"]/, category: "hardcoded-secret", reason: "Hardcoded API key" },
  { regex: /secret\s*[:=]\s*['"]/, category: "hardcoded-secret", reason: "Hardcoded secret" },
  { regex: /Math\.random\s*\(/, category: "weak-crypto", reason: "Math.random for security" },
  { regex: /createHash\s*\(\s*['"]md5['"]/, category: "weak-crypto", reason: "MD5 hash usage" },
  { regex: /createHash\s*\(\s*['"]sha1['"]/, category: "weak-crypto", reason: "SHA1 hash usage" },
  {
    regex: /disable.*ssl|verify\s*=\s*false|rejectUnauthorized.*false/i,
    category: "tls",
    reason: "TLS verification disabled",
  },
  { regex: /cors\(\s*\)/, category: "cors", reason: "Permissive CORS" },
  { regex: /chmod\s+777/, category: "permissions", reason: "World-writable permissions" },
  { regex: /TODO.*security|FIXME.*vuln|HACK.*auth/i, category: "todo", reason: "Security-related TODO" },
  { regex: /console\.(log|debug)\s*\(.*password/i, category: "logging", reason: "Password in logs" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function scanFile(filePath: string): FalseNegCandidate[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const candidates: FalseNegCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of SUSPICIOUS_PATTERNS) {
      if (pat.regex.test(line)) {
        candidates.push({
          lineNumber: i + 1,
          lineContent: line.trim().slice(0, 120),
          pattern: pat.regex.source,
          category: pat.category,
          reason: pat.reason,
        });
      }
    }
  }
  return candidates;
}

function crossCheckVerdict(candidates: FalseNegCandidate[], verdict: TribunalVerdict): FalseNegCandidate[] {
  // Filter out candidates that already have findings for the same line/category
  const coveredLines = new Set<number>();
  for (const f of verdict.findings) {
    if (f.lineNumbers) {
      for (const ln of f.lineNumbers) coveredLines.add(ln);
    }
  }
  return candidates.filter((c) => !coveredLines.has(c.lineNumber));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFalseNegCheck(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const verdictIdx = argv.indexOf("--verdict");
  const formatIdx = argv.indexOf("--format");
  const categoryIdx = argv.indexOf("--category");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const verdictPath = verdictIdx >= 0 ? argv[verdictIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const filterCategory = categoryIdx >= 0 ? argv[categoryIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-false-neg-check — Check for potential false negatives

Usage:
  judges finding-false-neg-check --file <source> [--verdict <verdict.json>]
                                 [--format table|json] [--category <cat>]

Options:
  --file <path>       Source file to scan for suspicious patterns (required)
  --verdict <path>    Verdict JSON to cross-check (optional)
  --format <fmt>      Output format: table (default), json
  --category <cat>    Filter by category (injection, xss, hardcoded-secret, etc.)
  --help, -h          Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let candidates = scanFile(filePath);

  if (verdictPath && existsSync(verdictPath)) {
    try {
      const verdict: TribunalVerdict = JSON.parse(readFileSync(verdictPath, "utf-8"));
      candidates = crossCheckVerdict(candidates, verdict);
    } catch {
      /* skip cross-check */
    }
  }

  if (filterCategory) {
    candidates = candidates.filter((c) => c.category === filterCategory);
  }

  if (format === "json") {
    console.log(JSON.stringify(candidates, null, 2));
    return;
  }

  if (candidates.length === 0) {
    console.log("No potential false negatives detected.");
    return;
  }

  console.log(`\nPotential False Negatives in ${filePath}`);
  console.log("═".repeat(70));
  console.log(`${"Line".padEnd(7)} ${"Category".padEnd(20)} Reason`);
  console.log("─".repeat(70));

  for (const c of candidates) {
    console.log(`${String(c.lineNumber).padEnd(7)} ${c.category.padEnd(20)} ${c.reason}`);
    console.log(`  ${c.lineContent}`);
  }

  console.log("─".repeat(70));

  const categories = new Map<string, number>();
  for (const c of candidates) {
    categories.set(c.category, (categories.get(c.category) || 0) + 1);
  }
  console.log(`${candidates.length} suspicious patterns found across ${categories.size} categories`);
  console.log("═".repeat(70));
}
