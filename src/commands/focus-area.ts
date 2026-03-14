/**
 * Focus-area — Identify high-risk areas that need the most review attention
 * based on code complexity and pattern density.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileRisk {
  file: string;
  riskScore: number;
  complexity: number;
  patternDensity: number;
  lineCount: number;
  findingCount: number;
  topPatterns: string[];
}

interface FocusAreaResult {
  filesAnalyzed: number;
  highRiskFiles: FileRisk[];
  riskDistribution: { high: number; medium: number; low: number };
  summary: string;
}

// ─── Patterns ──────────────────────────────────────────────────────────────

const RISK_PATTERNS: { name: string; weight: number; regex: RegExp }[] = [
  { name: "hardcoded-secret", weight: 10, regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}/i },
  { name: "eval-usage", weight: 10, regex: /\beval\s*\(/ },
  { name: "sql-concat", weight: 10, regex: /(?:query|execute)\s*\(\s*["'`].*\+/ },
  { name: "xss-risk", weight: 8, regex: /innerHTML\s*=|document\.write\s*\(/ },
  { name: "command-injection", weight: 10, regex: /exec(?:Sync)?\s*\(\s*`[^`]*\$\{/ },
  { name: "empty-catch", weight: 3, regex: /catch\s*\([^)]*\)\s*\{\s*\}/ },
  { name: "any-type", weight: 2, regex: /:\s*any\b/ },
  { name: "unsafe-regex", weight: 7, regex: /new\s+RegExp\s*\([^)]*\+/ },
  { name: "nested-callback", weight: 4, regex: /\)\s*=>\s*\{[^}]*\)\s*=>\s*\{/ },
  { name: "deep-nesting", weight: 5, regex: /^\s{16,}\S/ },
  { name: "deprecated-api", weight: 3, regex: /new\s+Buffer\s*\(|\.substr\s*\(/ },
];

// ─── Complexity estimation ─────────────────────────────────────────────────

function estimateComplexity(content: string): number {
  const lines = content.split("\n");
  let complexity = 0;

  for (const line of lines) {
    // Control flow
    if (/\b(?:if|else if|switch|case|while|for|catch)\b/.test(line)) complexity++;
    // Logical operators
    if (/&&|\|\|/.test(line)) complexity++;
    // Ternary
    if (/[^?][?][^?]/.test(line)) complexity += 0.5;
    // Nested functions
    if (/(?:function\s+\w+|=>\s*\{)/.test(line)) complexity += 0.5;
  }

  return Math.round(complexity);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectSourceFiles(dir: string): string[] {
  const exts = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cs"]);
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (exts.has(extname(name))) files.push(full);
      } catch {
        // skip
      }
    }
  }
  walk(dir);
  return files;
}

function analyzeRisk(files: string[], baseDir: string): FocusAreaResult {
  const fileRisks: FileRisk[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const lineCount = lines.length;
    const complexity = estimateComplexity(content);
    const patternHits = new Map<string, number>();
    let totalWeight = 0;

    for (const line of lines) {
      for (const pat of RISK_PATTERNS) {
        if (pat.regex.test(line)) {
          totalWeight += pat.weight;
          patternHits.set(pat.name, (patternHits.get(pat.name) || 0) + 1);
        }
      }
    }

    const findingCount = [...patternHits.values()].reduce((a, b) => a + b, 0);
    const patternDensity = lineCount > 0 ? Math.round((findingCount / lineCount) * 1000) / 10 : 0;

    // Risk score: weighted sum of complexity, pattern weight, and density
    const riskScore = Math.round(complexity * 0.3 + totalWeight * 2 + patternDensity * 10);

    if (riskScore > 0) {
      const topPatterns = [...patternHits.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      fileRisks.push({
        file: relative(baseDir, filePath),
        riskScore,
        complexity,
        patternDensity,
        lineCount,
        findingCount,
        topPatterns,
      });
    }
  }

  fileRisks.sort((a, b) => b.riskScore - a.riskScore);

  const distribution = { high: 0, medium: 0, low: 0 };
  for (const fr of fileRisks) {
    if (fr.riskScore >= 50) distribution.high++;
    else if (fr.riskScore >= 20) distribution.medium++;
    else distribution.low++;
  }

  const summary =
    distribution.high > 0
      ? `${distribution.high} high-risk file(s) need immediate review attention.`
      : fileRisks.length > 0
        ? `No critical risk areas. ${fileRisks.length} files have minor improvements available.`
        : "No risk areas detected in scanned files.";

  return {
    filesAnalyzed: files.length,
    highRiskFiles: fileRisks.slice(0, 20),
    riskDistribution: distribution,
    summary,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFocusArea(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges focus-area — Identify high-risk areas needing review attention

Usage:
  judges focus-area [dir]                   Analyze risk areas
  judges focus-area --top 10                Show top N files
  judges focus-area --format json           JSON output

Options:
  [dir]                   Target directory (default: .)
  --top <n>               Number of files to show (default: 20)
  --format json           JSON output
  --help, -h              Show this help

Combines code complexity and security pattern density to rank files by
risk. Use this to prioritize review effort where it matters most.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        a !== "focus-area" &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--top",
    ) || ".";
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "20", 10);

  const files = collectSourceFiles(dir);
  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const result = analyzeRisk(files, dir);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Focus Area Analysis\n  ─────────────────────────────`);
  console.log(`    Files analyzed: ${result.filesAnalyzed}`);
  console.log(
    `    Risk distribution: 🔴 ${result.riskDistribution.high} high  🟡 ${result.riskDistribution.medium} medium  🟢 ${result.riskDistribution.low} low`,
  );
  console.log(`\n    ${result.summary}`);

  const display = result.highRiskFiles.slice(0, topN);
  if (display.length > 0) {
    console.log("\n    Highest risk files:");
    for (const fr of display) {
      const icon = fr.riskScore >= 50 ? "🔴" : fr.riskScore >= 20 ? "🟡" : "🟢";
      console.log(
        `      ${icon} [${fr.riskScore}] ${fr.file} (${fr.lineCount} lines, ${fr.findingCount} findings, complexity: ${fr.complexity})`,
      );
      if (fr.topPatterns.length > 0) {
        console.log(`           Top patterns: ${fr.topPatterns.join(", ")}`);
      }
    }
  }

  console.log();
}
