/**
 * Test quality — score test suites for assertion density, boundary coverage,
 * flakiness patterns, and mutation-testing readiness.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TestFileReport {
  file: string;
  tests: number;
  assertions: number;
  assertionDensity: number;
  issues: string[];
}

// ─── File Collection ────────────────────────────────────────────────────────

const TEST_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"]);
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

function analyzeTestFile(filepath: string): TestFileReport {
  const issues: string[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return { file: filepath, tests: 0, assertions: 0, assertionDensity: 0, issues: ["Could not read file"] };
  }

  // Count tests
  const testMatches = content.match(/(?:it|test|specify)\s*\(|def\s+test_|@Test|func\s+Test/g) || [];
  const tests = testMatches.length;

  // Count assertions
  const assertionPatterns =
    /assert|expect|should|toBe|toEqual|toMatch|toThrow|toContain|toHaveLength|toHaveBeenCalled|assertEqual|assertIn|assertRaises|assert_eq!|require\./g;
  const assertions = (content.match(assertionPatterns) || []).length;

  const assertionDensity = tests > 0 ? assertions / tests : 0;

  // Zero-assertion tests
  if (tests > 0 && assertions === 0) {
    issues.push("No assertions found — tests that never assert prove nothing");
  } else if (assertionDensity < 1 && tests > 0) {
    issues.push(`Low assertion density (${assertionDensity.toFixed(1)}/test) — some tests may lack assertions`);
  }

  // setTimeout / sleep (flakiness)
  if (/setTimeout|sleep|time\.sleep|Thread\.sleep|time\.After/i.test(content)) {
    issues.push("Timer-based waits detected — flakiness risk");
  }

  // Snapshot auto-update
  if (/toMatchSnapshot|toMatchInlineSnapshot/i.test(content)) {
    issues.push("Snapshot tests found — check for auto-update masking regressions");
  }

  // Mock overuse
  const mockCount = (content.match(/mock|jest\.fn|sinon\.stub|patch\(|@Mock|gomock/gi) || []).length;
  if (mockCount > 10) {
    issues.push(`Heavy mocking (${mockCount} mocks) — test may not reflect real behavior`);
  }

  // Missing edge cases
  const hasNullCheck = /null|undefined|nil|None|empty|boundary|edge/i.test(content);
  const hasErrorCheck = /error|exception|throw|reject|fail|panic/i.test(content);
  if (!hasNullCheck && !hasErrorCheck && tests > 0) {
    issues.push("No null/error/boundary test cases — missing edge coverage");
  }

  // Hardcoded values only
  const hasParameterized = /\.each|@parameterized|@pytest\.mark\.parametrize|testCases|table.?driven/i.test(content);
  if (tests >= 5 && !hasParameterized) {
    issues.push("No parameterized tests — consider table-driven testing for broader coverage");
  }

  // Commented-out tests
  const commentedTests = (content.match(/\/\/\s*(it|test|describe)\s*\(|#\s*def\s+test_/g) || []).length;
  if (commentedTests > 0) {
    issues.push(`${commentedTests} commented-out test(s) — remove or restore`);
  }

  return { file: filepath, tests, assertions, assertionDensity, issues };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTestQuality(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges test-quality — Score test suites beyond coverage percentage

Usage:
  judges test-quality [dir]
  judges test-quality tests/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: assertion density, zero-assertion tests, timer-based waits, snapshot abuse,
mock overuse, missing edge cases, parameterized tests, commented-out tests.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectTestFiles(dir);
  const reports = files.map(analyzeTestFile);
  const totalTests = reports.reduce((s, r) => s + r.tests, 0);
  const totalAssertions = reports.reduce((s, r) => s + r.assertions, 0);
  const totalIssues = reports.reduce((s, r) => s + r.issues.length, 0);
  const avgDensity = totalTests > 0 ? totalAssertions / totalTests : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - totalIssues * 5)));

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          reports,
          score,
          summary: {
            files: files.length,
            tests: totalTests,
            assertions: totalAssertions,
            avgDensity: +avgDensity.toFixed(2),
            issues: totalIssues,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ GOOD" : score >= 50 ? "⚠️  FAIR" : "❌ POOR";
    console.log(`\n  Test Quality: ${badge} (${score}/100)\n  ──────────────────────────`);
    console.log(
      `    Files: ${files.length} | Tests: ${totalTests} | Assertions: ${totalAssertions} | Avg density: ${avgDensity.toFixed(1)}/test\n`,
    );

    const problematic = reports.filter((r) => r.issues.length > 0);
    if (problematic.length === 0) {
      console.log("    No quality issues detected.\n");
      return;
    }

    for (const r of problematic) {
      console.log(`    📄 ${r.file} (${r.tests} tests, ${r.assertions} assertions)`);
      for (const issue of r.issues) {
        console.log(`       ⚠️  ${issue}`);
      }
    }

    console.log(`\n    Total issues: ${totalIssues} | Score: ${score}/100\n`);
  }
}
