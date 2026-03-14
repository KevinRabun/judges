/**
 * Review-file-complexity — Analyze file complexity metrics.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplexityMetrics {
  filePath: string;
  lines: number;
  codeLines: number;
  blankLines: number;
  commentLines: number;
  functions: number;
  maxIndentDepth: number;
  avgLineLength: number;
  complexityScore: number;
  risk: "low" | "medium" | "high" | "critical";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function analyzeComplexity(filePath: string): ComplexityMetrics {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  let codeLines = 0;
  let blankLines = 0;
  let commentLines = 0;
  let functions = 0;
  let maxIndentDepth = 0;
  let totalLineLength = 0;

  const funcPatterns = [/\bfunction\b/, /=>\s*[{(]/, /\bdef\b/, /\bfunc\b/, /\bfn\b/];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      blankLines++;
      continue;
    }

    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      commentLines++;
      continue;
    }

    codeLines++;
    totalLineLength += trimmed.length;

    // calculate indent depth
    const indent = line.length - line.trimStart().length;
    const depth = Math.floor(indent / 2);
    if (depth > maxIndentDepth) maxIndentDepth = depth;

    // count functions
    for (const p of funcPatterns) {
      if (p.test(trimmed)) {
        functions++;
        break;
      }
    }
  }

  const avgLineLength = codeLines > 0 ? Math.round(totalLineLength / codeLines) : 0;

  // Compute complexity score (0-100)
  let score = 0;
  if (totalLines > 300) score += 15;
  else if (totalLines > 150) score += 8;
  if (functions > 20) score += 20;
  else if (functions > 10) score += 10;
  if (maxIndentDepth > 8) score += 25;
  else if (maxIndentDepth > 5) score += 15;
  else if (maxIndentDepth > 3) score += 5;
  if (avgLineLength > 100) score += 15;
  else if (avgLineLength > 80) score += 8;
  if (commentLines === 0 && codeLines > 50) score += 10;
  if (codeLines > 0 && blankLines / codeLines < 0.05) score += 5;

  const risk = score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  return {
    filePath,
    lines: totalLines,
    codeLines,
    blankLines,
    commentLines,
    functions,
    maxIndentDepth,
    avgLineLength,
    complexityScore: score,
    risk,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFileComplexity(argv: string[]): void {
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-file-complexity — Analyze file complexity

Usage:
  judges review-file-complexity <file1> [file2 ...] [--format table|json]

Options:
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const files = argv.filter(
    (a) => !a.startsWith("--") && (argv.indexOf(a) === 0 || argv[argv.indexOf(a) - 1] !== "--format"),
  );

  if (files.length === 0) {
    console.error("Error: provide one or more file paths");
    process.exitCode = 1;
    return;
  }

  const results: ComplexityMetrics[] = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(`Warning: not found: ${f}`);
      continue;
    }
    try {
      results.push(analyzeComplexity(f));
    } catch {
      console.error(`Warning: cannot read: ${f}`);
    }
  }

  if (results.length === 0) {
    console.error("Error: no valid files");
    process.exitCode = 1;
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nFile Complexity Analysis (${results.length} files)`);
  console.log("═".repeat(80));
  console.log(
    `${"File".padEnd(35)} ${"Lines".padEnd(7)} ${"Code".padEnd(7)} ${"Funcs".padEnd(7)} ${"Depth".padEnd(7)} ${"Score".padEnd(7)} Risk`,
  );
  console.log("─".repeat(80));

  for (const r of results.sort((a, b) => b.complexityScore - a.complexityScore)) {
    const name = r.filePath.length > 33 ? "…" + r.filePath.slice(-32) : r.filePath;
    console.log(
      `${name.padEnd(35)} ${String(r.lines).padEnd(7)} ${String(r.codeLines).padEnd(7)} ${String(r.functions).padEnd(7)} ${String(r.maxIndentDepth).padEnd(7)} ${String(r.complexityScore).padEnd(7)} ${r.risk}`,
    );
  }

  console.log("═".repeat(80));

  const avgScore = Math.round(results.reduce((s, r) => s + r.complexityScore, 0) / results.length);
  console.log(`\nAverage complexity score: ${avgScore}`);
}
