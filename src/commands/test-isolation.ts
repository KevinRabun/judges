/**
 * Test isolation — detect shared mutable state, ordering dependencies,
 * and resource leaks between test cases.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IsolationIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const TEST_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);
const TEST_PATTERNS = [/\.test\./i, /\.spec\./i, /test_/i, /_test\./i];

function isTestFile(name: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(name));
}

function collectTestFiles(dir: string, max = 300): string[] {
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
        else if (TEST_EXTS.has(extname(full)) && isTestFile(basename(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): IsolationIssue[] {
  const issues: IsolationIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  // Track scope context
  let inDescribe = false;
  let describeDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/\b(?:describe|context|suite)\s*\(/.test(line)) {
      inDescribe = true;
      describeDepth++;
    }
    if (inDescribe && /^\s*\}\s*\)\s*;?\s*$/.test(line)) {
      describeDepth--;
      if (describeDepth <= 0) inDescribe = false;
    }

    // Global mutable state
    if (/^\s*(?:let|var)\s+\w+\s*=/.test(line) && !inDescribe) {
      const varName = line.match(/(?:let|var)\s+(\w+)/)?.[1];
      if (varName && /\b(?:state|data|count|result|output|db|conn|client|server)\b/i.test(varName)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Mutable global test state",
          severity: "high",
          detail: `Global \`${varName}\` — tests sharing mutable state cause order-dependent failures`,
        });
      }
    }

    // Module-level side effects in test files
    if (/^\s*(?:fs\.|writeFileSync|mkdirSync|execSync|spawn|createServer)/.test(line) && !inDescribe) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Module-level side effect",
        severity: "high",
        detail: "Side effects outside test blocks affect all tests in the file",
      });
    }

    // Shared fixtures without reset
    if (/\b(?:beforeAll|before)\s*\(\s*(?:async\s+)?(?:function|\(|=>)/.test(line)) {
      const beforeBlock = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      const hasAfter = /\b(?:afterAll|afterEach|after)\s*\(/.test(content);
      if (!hasAfter && /(?:create|setup|init|connect|insert|write)/i.test(beforeBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Setup without teardown",
          severity: "high",
          detail: "beforeAll creates resources but no afterAll/afterEach cleans them — leaked state",
        });
      }
    }

    // File system operations without cleanup
    if (/(?:writeFileSync|mkdirSync|writeFile|mkdir)\s*\(/.test(line)) {
      const hasCleanup = /(?:unlinkSync|rmdirSync|rimraf|rm\s*\(|removeSync|afterEach.*unlink|afterAll.*unlink)/i.test(
        content,
      );
      if (!hasCleanup) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "File system write without cleanup",
          severity: "medium",
          detail: "Test creates files but never cleans up — pollutes workspace",
        });
      }
    }

    // Network listeners without close
    if (/(?:createServer|listen)\s*\(/.test(line)) {
      const hasClose = /(?:\.close\s*\(|server\.close|afterAll.*close|afterEach.*close)/i.test(content);
      if (!hasClose) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Server started without closing",
          severity: "high",
          detail: "Test starts a server but never closes it — port conflicts in parallel runs",
        });
      }
    }

    // setTimeout in tests (flakiness)
    if (/setTimeout\s*\(\s*(?:resolve|done|callback|cb)\s*,\s*\d+/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "setTimeout for async coordination",
        severity: "medium",
        detail: "Timer-based waits are flaky — use event-based or polling patterns",
      });
    }

    // Order-dependent assertions (relying on previous test state)
    if (/\.toBe\(.*\+\+|\.toEqual\(.*count/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Assertion relies on accumulated state",
        severity: "medium",
        detail: "Tests should be independently runnable — avoid cross-test counters",
      });
    }

    // Shared database connections
    if (/(?:mongoose\.connect|createConnection|pg\.Pool|knex|prisma\.\$connect|sequelize)/i.test(line) && !inDescribe) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Shared database connection",
        severity: "medium",
        detail: "Use per-test or per-suite DB connections with transaction rollback",
      });
    }

    // Environment variable mutation
    if (/process\.env\.\w+\s*=/.test(line)) {
      const hasRestore = /process\.env\.\w+\s*=.*original|delete\s+process\.env|afterEach.*env/i.test(content);
      if (!hasRestore) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Environment mutation without restore",
          severity: "high",
          detail: "Setting process.env leaks to other tests — restore in afterEach",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTestIsolation(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges test-isolation — Detect test isolation violations

Usage:
  judges test-isolation [dir]
  judges test-isolation tests/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: shared mutable state, missing teardown, file system leaks, unclosed servers,
setTimeout waits, environment mutations, shared DB connections.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectTestFiles(dir);
  const allIssues: IsolationIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { files: files.length, high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ ISOLATED" : score >= 50 ? "⚠️  LEAKY" : "❌ COUPLED";
    console.log(`\n  Test Isolation: ${badge} (${score}/100)\n  ─────────────────────────`);
    console.log(`    Test files: ${files.length}\n`);

    if (allIssues.length === 0) {
      console.log("    No isolation issues detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
