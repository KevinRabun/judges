/**
 * Stale-pattern — identify outdated idioms when modern alternatives exist.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StaleIssue {
  file: string;
  line: number;
  pattern: string;
  severity: "high" | "medium" | "low";
  detail: string;
  modernAlternative: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

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

// ─── Stale Patterns ─────────────────────────────────────────────────────────

interface PatternDef {
  regex: RegExp;
  name: string;
  severity: "high" | "medium" | "low";
  modern: string;
  detail: string;
}

const STALE_PATTERNS: PatternDef[] = [
  // Node.js deprecated APIs
  {
    regex: /new\s+Buffer\s*\(/,
    name: "new Buffer()",
    severity: "high",
    modern: "Buffer.from() / Buffer.alloc()",
    detail: "new Buffer() is deprecated due to security issues (uninitialized memory)",
  },
  {
    regex: /url\.parse\s*\(/,
    name: "url.parse()",
    severity: "medium",
    modern: "new URL()",
    detail: "url.parse() is deprecated — use the WHATWG URL API",
  },
  {
    regex: /require\s*\(\s*['"]domain['"]/,
    name: "domain module",
    severity: "medium",
    modern: "AsyncLocalStorage or structured error handling",
    detail: "The domain module is deprecated and should not be used for error handling",
  },
  {
    regex: /require\s*\(\s*['"]punycode['"]/,
    name: "punycode module",
    severity: "low",
    modern: "url.domainToASCII() / url.domainToUnicode()",
    detail: "Built-in punycode module is deprecated",
  },
  {
    regex: /fs\.exists\s*\(/,
    name: "fs.exists()",
    severity: "medium",
    modern: "fs.access() or fs.stat()",
    detail: "fs.exists() is deprecated — use fs.access() for existence checks",
  },
  {
    regex: /path\._makeLong\s*\(/,
    name: "path._makeLong()",
    severity: "low",
    modern: "path.toNamespacedPath()",
    detail: "path._makeLong() is an internal API — use toNamespacedPath()",
  },

  // Callback patterns vs async/await
  {
    regex: /(\w+)\s*\(\s*(?:function\s*\(|[(]\s*)\s*(?:err|error)\s*,\s*(?:data|result|res|body|response)/,
    name: "Error-first callback",
    severity: "medium",
    modern: "async/await with promises",
    detail: "Error-first callbacks should be replaced with async/await for readability and error handling",
  },
  {
    regex: /\.then\s*\(\s*(?:function|[(])\s*\w*\s*[)]*\s*\{[^}]*\.then\s*\(/,
    name: "Nested .then() chains",
    severity: "medium",
    modern: "async/await",
    detail: "Nested promise chains are hard to read — use async/await",
  },

  // Old JavaScript patterns
  {
    regex: /var\s+\w+\s*=/,
    name: "var declaration",
    severity: "low",
    modern: "const / let",
    detail: "var has function scoping issues — use const or let for block scoping",
  },
  {
    regex: /typeof\s+\w+\s*[!=]==?\s*['"]undefined['"]/,
    name: "typeof undefined check",
    severity: "low",
    modern: "Optional chaining (?.) or nullish coalescing (??)",
    detail: "typeof undefined checks can often be replaced with optional chaining",
  },
  {
    regex: /\.apply\s*\(\s*(?:null|this)\s*,\s*arguments\s*\)/,
    name: ".apply(null, arguments)",
    severity: "low",
    modern: "...rest parameters and spread",
    detail: "Use rest parameters and spread syntax instead of arguments object",
  },
  {
    regex: /arguments\s*\[\s*\d+\s*\]/,
    name: "arguments[] indexing",
    severity: "low",
    modern: "Named parameters or rest (...args)",
    detail: "The arguments object is a legacy feature — use named or rest parameters",
  },

  // Old testing patterns
  {
    regex: /(?:it|test)\s*\(\s*['"][^'"]+['"]\s*,\s*function\s*\(\s*done\s*\)/,
    name: "done() callback test",
    severity: "medium",
    modern: "async test functions",
    detail: "Test done() callbacks are error-prone — use async/await in tests",
  },
  {
    regex: /\.should\.\w+/,
    name: "should-style assertions",
    severity: "low",
    modern: "expect() or assert()",
    detail: "Should-style assertions modify Object.prototype — use expect() or assert()",
  },

  // React class components
  {
    regex: /class\s+\w+\s+extends\s+(?:React\.)?(?:Component|PureComponent)\s*[<{]/,
    name: "React class component",
    severity: "medium",
    modern: "Function components with hooks",
    detail: "React class components are legacy — prefer function components with hooks",
  },
  {
    regex: /componentWillMount\s*\(/,
    name: "componentWillMount",
    severity: "high",
    modern: "useEffect hook",
    detail: "componentWillMount is removed in React 18 — use useEffect",
  },
  {
    regex: /componentWillReceiveProps\s*\(/,
    name: "componentWillReceiveProps",
    severity: "high",
    modern: "getDerivedStateFromProps or useEffect",
    detail: "componentWillReceiveProps is removed in React 18",
  },

  // Promise constructor anti-pattern
  {
    regex: /new\s+Promise\s*\(\s*(?:async|[(]\s*(?:resolve|reject))/,
    name: "Async executor in Promise",
    severity: "medium",
    modern: "Direct async function",
    detail: "async function inside Promise executor is an anti-pattern — errors won't reject the promise",
  },

  // Old module patterns
  {
    regex: /module\.exports\s*=/,
    name: "CommonJS module.exports",
    severity: "low",
    modern: "ES module export",
    detail: "CommonJS is legacy in TypeScript — use ES module exports",
  },
  {
    regex: /exports\.\w+\s*=/,
    name: "CommonJS exports.x",
    severity: "low",
    modern: "ES module named export",
    detail: "CommonJS exports are legacy in TypeScript — use ES module named exports",
  },

  // Deprecated string methods
  {
    regex: /\.substr\s*\(/,
    name: ".substr()",
    severity: "low",
    modern: ".substring() or .slice()",
    detail: ".substr() is deprecated in favor of .substring() or .slice()",
  },

  // Old error handling
  {
    regex: /process\.on\s*\(\s*['"]uncaughtException['"]/,
    name: "uncaughtException handler",
    severity: "medium",
    modern: "Structured error handling or process.on('unhandledRejection')",
    detail: "Catching uncaughtException and continuing is dangerous — fix the root cause or exit",
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): StaleIssue[] {
  const issues: StaleIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    for (const pattern of STALE_PATTERNS) {
      if (pattern.regex.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          pattern: pattern.name,
          severity: pattern.severity,
          detail: pattern.detail,
          modernAlternative: pattern.modern,
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runStalePattern(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges stale-pattern — Identify outdated idioms when modern alternatives exist

Usage:
  judges stale-pattern [dir]
  judges stale-pattern src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: deprecated Node APIs (new Buffer, url.parse, fs.exists), callback patterns,
var declarations, old testing patterns, React class components, Promise anti-patterns,
CommonJS modules, deprecated string methods, old error handling.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: StaleIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(
    0,
    100 - highCount * 10 - medCount * 5 - allIssues.filter((i) => i.severity === "low").length * 2,
  );

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ MODERN" : score >= 50 ? "⚠️  DATED" : "❌ STALE";
    console.log(`\n  Stale-Pattern: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No stale patterns detected.\n");
      return;
    }
    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.pattern}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
      console.log(`        ↳ Use: ${issue.modernAlternative}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);
    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
