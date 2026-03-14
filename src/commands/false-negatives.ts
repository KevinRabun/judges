/**
 * False-negative report — collect and analyze cases where Judges
 * missed a real vulnerability or bug that was later found manually.
 *
 * Builds a local feedback database (.judges-false-negatives.json)
 * that helps teams understand blind spots and request new rules.
 */

import { createHash } from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FalseNegativeEntry {
  id: string;
  timestamp: string;
  file: string;
  line?: number;
  category: string;
  description: string;
  severity: string;
  expectedRule?: string;
  language: string;
  codeSnippet?: string;
  reportedBy?: string;
  status: "open" | "rule-added" | "wont-fix" | "duplicate";
}

export interface FalseNegativeDb {
  entries: FalseNegativeEntry[];
  version: string;
}

// ─── Database ───────────────────────────────────────────────────────────────

const DB_FILE = ".judges-false-negatives.json";

function loadDb(): FalseNegativeDb {
  const { readFileSync, existsSync } = require("fs");
  if (existsSync(DB_FILE)) {
    try {
      return JSON.parse(readFileSync(DB_FILE, "utf-8"));
    } catch {
      /* corrupt */
    }
  }
  return { entries: [], version: "1.0" };
}

function saveDb(db: FalseNegativeDb): void {
  const { writeFileSync } = require("fs");
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export function addFalseNegative(entry: Omit<FalseNegativeEntry, "id" | "timestamp" | "status">): FalseNegativeEntry {
  const db = loadDb();
  const fn: FalseNegativeEntry = {
    ...entry,
    id: createHash("sha256")
      .update(Date.now().toString() + entry.file + entry.description)
      .digest("hex")
      .slice(0, 10),
    timestamp: new Date().toISOString(),
    status: "open",
  };
  db.entries.push(fn);
  saveDb(db);
  return fn;
}

export function getFalseNegativeStats(db: FalseNegativeDb): {
  total: number;
  open: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  byLanguage: Record<string, number>;
} {
  const open = db.entries.filter((e) => e.status === "open").length;
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};

  for (const e of db.entries) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    byLanguage[e.language] = (byLanguage[e.language] || 0) + 1;
  }

  return { total: db.entries.length, open, byCategory, bySeverity, byLanguage };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFalseNegativeReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges false-negatives — Report and track missed vulnerabilities

Usage:
  judges false-negatives                              Show report
  judges false-negatives --add --file src/app.ts \\
    --line 42 --category injection --severity high \\
    --description "SQL injection via user input"     Add a missed finding
  judges false-negatives --resolve <id>               Mark as resolved

Options:
  --add                  Add a new false-negative report
  --file <path>          File where the issue was found
  --line <n>             Line number
  --category <cat>       Category (injection, auth, crypto, xss, etc.)
  --severity <level>     Severity (critical, high, medium, low)
  --description <text>   Description of what was missed
  --language <lang>      Language (auto-detected from file)
  --resolve <id>         Mark entry as resolved
  --format json          JSON output
  --help, -h             Show this help

This builds a local feedback database that helps identify blind spots
in the current rule set, informing future rule development.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (argv.includes("--add")) {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const lineStr = argv.find((_a: string, i: number) => argv[i - 1] === "--line");
    const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category") || "unknown";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "medium";
    const description = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || "";
    const language = argv.find((_a: string, i: number) => argv[i - 1] === "--language") || detectLanguage(file);

    if (!file || !description) {
      console.error("Error: --file and --description required");
      process.exit(1);
    }

    const entry = addFalseNegative({
      file,
      line: lineStr ? parseInt(lineStr, 10) : undefined,
      category,
      severity,
      description,
      language,
    });

    console.log(`  ✅ Added false-negative report: ${entry.id}`);
    return;
  }

  const resolveId = argv.find((_a: string, i: number) => argv[i - 1] === "--resolve");
  if (resolveId) {
    const db = loadDb();
    const entry = db.entries.find((e) => e.id === resolveId);
    if (!entry) {
      console.error(`Error: entry ${resolveId} not found`);
      process.exit(1);
    }
    entry.status = "rule-added";
    saveDb(db);
    console.log(`  ✅ Resolved: ${resolveId}`);
    return;
  }

  // Show report
  const db = loadDb();
  if (db.entries.length === 0) {
    console.log("\n  No false-negative reports. Use --add to report a missed finding.\n");
    return;
  }

  const stats = getFalseNegativeStats(db);

  if (format === "json") {
    console.log(JSON.stringify({ stats, entries: db.entries }, null, 2));
    return;
  }

  console.log(`\n  False-Negative Analysis\n`);
  console.log(`  Total: ${stats.total} | Open: ${stats.open}\n`);

  console.log("  By Category:");
  for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat.padEnd(20)} ${count}`);
  }

  console.log("\n  By Severity:");
  for (const [sev, count] of Object.entries(stats.bySeverity).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${sev.padEnd(20)} ${count}`);
  }

  console.log("\n  Recent entries:");
  for (const e of db.entries.slice(-10)) {
    const status = e.status === "open" ? "🔴" : "✅";
    console.log(
      `    ${status} ${e.id}  ${e.severity.padEnd(8)} ${e.category.padEnd(15)} ${e.description.slice(0, 50)}`,
    );
  }
  console.log("");
}

function detectLanguage(file: string): string {
  const { extname } = require("path");
  const ext = extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
  };
  return map[ext] || "unknown";
}
