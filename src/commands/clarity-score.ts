/**
 * Clarity score — measure code readability and self-documentation
 * specifically for AI-generated code. Flags "correct but cryptic"
 * patterns that need documentation investment.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClarityMetric {
  id: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail?: string;
}

interface FileClarityResult {
  file: string;
  overallScore: number;
  grade: string;
  metrics: ClarityMetric[];
  suggestions: string[];
}

// ─── Analysers ──────────────────────────────────────────────────────────────

function analyzeClarity(content: string): { metrics: ClarityMetric[]; suggestions: string[] } {
  const lines = content.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const metrics: ClarityMetric[] = [];
  const suggestions: string[] = [];

  // 1. Naming quality
  const identifiers = content.match(/(?:const|let|var|function)\s+(\w+)/g) || [];
  const shortNames = identifiers.filter((id) => {
    const name = id.replace(/^(?:const|let|var|function)\s+/, "");
    return name.length <= 2 && !["i", "j", "k", "x", "y", "id"].includes(name);
  });
  const namingScore = identifiers.length > 0 ? Math.max(0, 100 - (shortNames.length / identifiers.length) * 200) : 100;
  metrics.push({ id: "naming", label: "Naming Quality", score: Math.round(namingScore), weight: 25 });
  if (namingScore < 60) suggestions.push("Use descriptive variable names — single-letter names reduce readability");

  // 2. Comment coverage
  const commentLines = lines.filter((l) => /^\s*(?:\/\/|\/?\*|#)/.test(l)).length;
  const commentRatio = nonEmpty.length > 0 ? commentLines / nonEmpty.length : 0;
  const commentScore = commentRatio >= 0.15 ? 100 : commentRatio >= 0.08 ? 70 : commentRatio >= 0.03 ? 40 : 10;
  metrics.push({
    id: "comments",
    label: "Comment Coverage",
    score: commentScore,
    weight: 20,
    detail: `${Math.round(commentRatio * 100)}% of lines`,
  });
  if (commentScore < 50) suggestions.push("Add comments explaining the 'why' — not the 'what'");

  // 3. Function length
  const fnBodies: number[] = [];
  let braceDepth = 0;
  let fnStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\bfunction\b|=>\s*{/.test(lines[i]) && fnStart === -1) fnStart = i;
    braceDepth += (lines[i].match(/{/g) || []).length;
    braceDepth -= (lines[i].match(/}/g) || []).length;
    if (fnStart >= 0 && braceDepth <= 0) {
      fnBodies.push(i - fnStart + 1);
      fnStart = -1;
    }
  }
  const avgFnLength = fnBodies.length > 0 ? fnBodies.reduce((a, b) => a + b, 0) / fnBodies.length : 0;
  const fnLengthScore = avgFnLength <= 15 ? 100 : avgFnLength <= 30 ? 70 : avgFnLength <= 50 ? 40 : 10;
  metrics.push({
    id: "function-length",
    label: "Function Length",
    score: fnLengthScore,
    weight: 15,
    detail: `avg ${Math.round(avgFnLength)} lines`,
  });
  if (fnLengthScore < 50) suggestions.push("Break long functions into smaller, focused functions");

  // 4. Line complexity
  const longLines = nonEmpty.filter((l) => l.length > 100).length;
  const longLineRatio = nonEmpty.length > 0 ? longLines / nonEmpty.length : 0;
  const lineComplexityScore = longLineRatio <= 0.05 ? 100 : longLineRatio <= 0.15 ? 70 : longLineRatio <= 0.3 ? 40 : 10;
  metrics.push({
    id: "line-length",
    label: "Line Length",
    score: lineComplexityScore,
    weight: 10,
    detail: `${longLines} lines > 100 chars`,
  });
  if (lineComplexityScore < 50) suggestions.push("Break long lines for readability");

  // 5. Nesting depth
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    currentNesting += (line.match(/{/g) || []).length;
    maxNesting = Math.max(maxNesting, currentNesting);
    currentNesting -= (line.match(/}/g) || []).length;
  }
  const nestingScore = maxNesting <= 3 ? 100 : maxNesting <= 5 ? 70 : maxNesting <= 7 ? 40 : 10;
  metrics.push({
    id: "nesting",
    label: "Nesting Depth",
    score: nestingScore,
    weight: 15,
    detail: `max ${maxNesting} levels`,
  });
  if (nestingScore < 50) suggestions.push("Reduce nesting depth with early returns and guard clauses");

  // 6. Magic numbers/strings
  const magicNumbers = content.match(/(?<!\w)\d{3,}(?!\w)/g) || [];
  const inlineStrings = content.match(/["'][^"']{20,}["']/g) || [];
  const magicCount = magicNumbers.length + inlineStrings.length;
  const magicScore = magicCount <= 2 ? 100 : magicCount <= 5 ? 70 : magicCount <= 10 ? 40 : 10;
  metrics.push({
    id: "magic-values",
    label: "Named Constants",
    score: magicScore,
    weight: 10,
    detail: `${magicCount} magic values`,
  });
  if (magicScore < 50) suggestions.push("Extract magic numbers and long strings into named constants");

  // 7. Consistent style
  const semicolons = (content.match(/;\s*$/gm) || []).length;
  const noSemicolons = nonEmpty.length - semicolons;
  const semiRatio = nonEmpty.length > 0 ? Math.max(semicolons, noSemicolons) / nonEmpty.length : 1;
  const styleScore = semiRatio >= 0.8 ? 100 : semiRatio >= 0.6 ? 60 : 30;
  metrics.push({ id: "style-consistency", label: "Style Consistency", score: styleScore, weight: 5 });
  if (styleScore < 60) suggestions.push("Use consistent code style (semicolons, quotes, indentation)");

  return { metrics, suggestions };
}

function computeOverallScore(metrics: ClarityMetric[]): number {
  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  const weighted = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runClarityScore(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges clarity-score — Measure code readability and self-documentation

Usage:
  judges clarity-score <file-or-dir>
  judges clarity-score src/ --min-grade C

Options:
  --min-grade <A-F>   Only show files at or below this grade
  --format json       JSON output
  --help, -h          Show this help

Metrics:
  • Naming quality (descriptive vs. short names)
  • Comment coverage (ratio of comment lines)
  • Function length (average lines per function)
  • Line length (lines exceeding 100 characters)
  • Nesting depth (maximum brace depth)
  • Named constants (magic numbers/strings)
  • Style consistency (semicolon/formatting uniformity)
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minGrade = argv.find((_a: string, i: number) => argv[i - 1] === "--min-grade");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  const results: FileClarityResult[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const { metrics, suggestions } = analyzeClarity(content);
    const overall = computeOverallScore(metrics);
    results.push({ file: f, overallScore: overall, grade: grade(overall), metrics, suggestions });
  }

  let filtered = results;
  if (minGrade) {
    const gradeOrder = ["A", "B", "C", "D", "F"];
    const minIdx = gradeOrder.indexOf(minGrade.toUpperCase());
    if (minIdx >= 0) filtered = results.filter((r) => gradeOrder.indexOf(r.grade) >= minIdx);
  }

  filtered.sort((a, b) => a.overallScore - b.overallScore);

  if (format === "json") {
    console.log(
      JSON.stringify({ files: filtered, scannedFiles: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    const avgScore =
      results.length > 0 ? Math.round(results.reduce((s, r) => s + r.overallScore, 0) / results.length) : 0;
    console.log(`\n  Clarity Score — ${files.length} files`);
    console.log(`  Average: ${avgScore}/100 (${grade(avgScore)})\n  ──────────────────────────`);

    if (filtered.length === 0) {
      console.log(`    ✅ All files meet clarity threshold\n`);
      return;
    }

    for (const r of filtered.slice(0, 20)) {
      const icon =
        r.grade === "A" ? "🟢" : r.grade === "B" ? "🟢" : r.grade === "C" ? "🟡" : r.grade === "D" ? "🟠" : "🔴";
      console.log(`\n    ${icon} ${r.file} — ${r.overallScore}/100 (${r.grade})`);
      for (const m of r.metrics) {
        const mIcon = m.score >= 70 ? "✓" : m.score >= 40 ? "~" : "✗";
        console.log(`        ${mIcon} ${m.label.padEnd(20)} ${String(m.score).padEnd(4)} ${m.detail || ""}`);
      }
      if (r.suggestions.length > 0) {
        console.log(`      Suggestions:`);
        for (const s of r.suggestions) console.log(`        → ${s}`);
      }
    }

    if (filtered.length > 20) console.log(`    ... and ${filtered.length - 20} more files`);

    // Grade distribution
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of results) dist[r.grade]++;
    console.log(`\n    Distribution: A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D} F:${dist.F}\n`);
  }
}
