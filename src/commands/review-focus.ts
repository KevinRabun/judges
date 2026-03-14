/**
 * Review focus — prioritize review attention for AI-generated changes.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FocusItem {
  file: string;
  priority: "critical" | "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cs"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Risk Analysis ──────────────────────────────────────────────────────────

function analyzeFileRisk(filepath: string): FocusItem {
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return { file: filepath, priority: "low", score: 0, reasons: ["Could not read file"] };
  }

  const reasons: string[] = [];
  let riskScore = 0;
  const fname = basename(filepath).toLowerCase();

  // Security-sensitive patterns
  if (/(?:auth|login|session|token|jwt|oauth|password|credential|secret|crypto|encrypt|decrypt|hash)/i.test(fname)) {
    riskScore += 30;
    reasons.push("Security-sensitive filename");
  }
  if (/(?:sql|exec|spawn|eval|innerHTML|dangerouslySetInnerHTML)/.test(content)) {
    riskScore += 25;
    reasons.push("Contains dangerous operations (sql/exec/eval/innerHTML)");
  }

  // Data mutation
  if (/(?:DELETE|INSERT|UPDATE|DROP|TRUNCATE)\s/i.test(content)) {
    riskScore += 20;
    reasons.push("Contains data mutation SQL statements");
  }

  // Payment/financial
  if (/(?:payment|billing|invoice|charge|refund|stripe|paypal|transaction)/i.test(content)) {
    riskScore += 25;
    reasons.push("Payment/financial logic");
  }

  // External API calls
  const apiCallCount = (content.match(/(?:fetch|axios|http\.(?:get|post|put|delete)|request\()/g) || []).length;
  if (apiCallCount > 0) {
    riskScore += apiCallCount * 5;
    reasons.push(`${apiCallCount} external API calls`);
  }

  // Complexity indicators
  const lines = content.split("\n");
  const lineCount = lines.length;
  if (lineCount > 300) {
    riskScore += 10;
    reasons.push(`Large file (${lineCount} lines)`);
  }

  // Deep nesting
  let maxDepth = 0;
  let depth = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      if (depth > maxDepth) maxDepth = depth;
    }
  }
  if (maxDepth > 5) {
    riskScore += 10;
    reasons.push(`Deep nesting (${maxDepth} levels)`);
  }

  // Error handling density
  const tryCatchCount = (content.match(/try\s*\{/g) || []).length;
  const funcCount = (content.match(/(?:function|=>)\s*[({]/g) || []).length;
  if (funcCount > 3 && tryCatchCount < funcCount * 0.2) {
    riskScore += 5;
    reasons.push("Low error handling coverage");
  }

  // State management
  if (/(?:useState|useReducer|createStore|createSlice|vuex|pinia)/i.test(content)) {
    riskScore += 10;
    reasons.push("Contains state management logic");
  }

  // Database operations
  if (/(?:prisma|sequelize|typeorm|mongoose|knex|drizzle|\.query\(|\.execute\()/i.test(content)) {
    riskScore += 15;
    reasons.push("Database operations");
  }

  // Middleware / interceptors
  if (/(?:middleware|interceptor|guard|pipe|filter)/i.test(fname)) {
    riskScore += 15;
    reasons.push("Middleware/interceptor (cross-cutting concern)");
  }

  // Route definitions
  const routeCount = (content.match(/\.(get|post|put|patch|delete|use)\s*\(\s*['"]?\//g) || []).length;
  if (routeCount > 0) {
    riskScore += routeCount * 3;
    reasons.push(`${routeCount} route definitions`);
  }

  // Configuration / environment
  if (/(?:config|env|settings|options)/i.test(fname)) {
    riskScore += 10;
    reasons.push("Configuration file");
  }

  const priority: FocusItem["priority"] =
    riskScore >= 50 ? "critical" : riskScore >= 30 ? "high" : riskScore >= 15 ? "medium" : "low";

  return { file: filepath, priority, score: Math.min(100, riskScore), reasons };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFocus(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-focus — Prioritize review attention for AI-generated changes

Usage:
  judges review-focus [dir]
  judges review-focus src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --top N               Show only top N files (default: 15)
  --help, -h            Show this help

Risk signals: security-sensitive files, dangerous operations, data mutation,
payment logic, external APIs, deep nesting, state management, database ops,
middleware, route definitions, configuration.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "15", 10);

  const files = collectFiles(dir);
  const allItems: FocusItem[] = files
    .map((f) => analyzeFileRisk(f))
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          items: allItems.slice(0, topN),
          totalFiles: files.length,
          scoredFiles: allItems.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n  Review Focus — Top ${Math.min(topN, allItems.length)} of ${files.length} files\n  ─────────────────────────────`,
    );
    if (allItems.length === 0) {
      console.log("    No high-risk files detected.\n");
      return;
    }
    for (const item of allItems.slice(0, topN)) {
      const icon =
        item.priority === "critical"
          ? "🔴"
          : item.priority === "high"
            ? "🟠"
            : item.priority === "medium"
              ? "🟡"
              : "🔵";
      console.log(`    ${icon} [${item.score}] ${item.file}`);
      console.log(`        ${item.reasons.join(" | ")}`);
    }
    const critCount = allItems.filter((i) => i.priority === "critical").length;
    const highCount = allItems.filter((i) => i.priority === "high").length;
    console.log(
      `\n    Critical: ${critCount} | High: ${highCount} | Total scored: ${allItems.length}/${files.length}\n`,
    );
  }
}
