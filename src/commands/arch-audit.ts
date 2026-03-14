/**
 * Architecture audit — evaluate architectural implications of
 * AI-generated code: coupling, separation of concerns, dependency
 * injection, testability, scalability.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchIssue {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface ArchMetric {
  id: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail?: string;
}

interface FileArchResult {
  file: string;
  overallScore: number;
  grade: string;
  metrics: ArchMetric[];
  issues: ArchIssue[];
}

// ─── Analysers ──────────────────────────────────────────────────────────────

function analyzeArchitecture(content: string, filePath: string): { metrics: ArchMetric[]; issues: ArchIssue[] } {
  const lines = content.split("\n");
  const metrics: ArchMetric[] = [];
  const issues: ArchIssue[] = [];

  // 1. Coupling — count imports / dependencies
  const importLines = lines.filter((l) => /^\s*import\s/.test(l) || /require\s*\(/.test(l));
  const importCount = importLines.length;
  const couplingScore =
    importCount <= 5 ? 100 : importCount <= 10 ? 75 : importCount <= 20 ? 50 : importCount <= 30 ? 25 : 10;
  metrics.push({
    id: "coupling",
    label: "Loose Coupling",
    score: couplingScore,
    weight: 20,
    detail: `${importCount} imports`,
  });
  if (importCount > 15) {
    issues.push({
      id: "high-coupling",
      label: "High Coupling",
      severity: "high",
      detail: `${importCount} imports — consider splitting this module`,
    });
  }

  // 2. Separation of concerns — detect mixed responsibilities
  const hasDom = /document\.|querySelector|innerHTML|addEventListener/.test(content);
  const hasDB = /createConnection|query\(|findOne|findMany|prisma\.|mongoose\.|sequelize/.test(content);
  const hasHTTP = /fetch\(|axios\.|http\.|https\.|request\(/.test(content);
  const hasFS = /readFileSync|writeFileSync|createReadStream|createWriteStream/.test(content);
  const concernCount = [hasDom, hasDB, hasHTTP, hasFS].filter(Boolean).length;
  const socScore = concernCount <= 1 ? 100 : concernCount === 2 ? 60 : 30;
  metrics.push({
    id: "soc",
    label: "Separation of Concerns",
    score: socScore,
    weight: 20,
    detail: `${concernCount} concern(s) detected`,
  });
  if (concernCount > 1) {
    const mixed = [hasDom && "DOM", hasDB && "Database", hasHTTP && "HTTP", hasFS && "File I/O"]
      .filter(Boolean)
      .join(", ");
    issues.push({ id: "mixed-concerns", label: "Mixed Concerns", severity: "medium", detail: `File mixes: ${mixed}` });
  }

  // 3. Dependency injection / hardcoded dependencies
  const hardcodedNew = (content.match(/new\s+\w+\(/g) || []).length;
  const hasConstructorInjection = /constructor\s*\([^)]*\b(?:private|public|readonly)\b/.test(content);
  const hasParameterInjection =
    /function\s+\w+\s*\([^)]*:\s*\w+Interface\b/.test(content) || /\w+:\s*\w+Service\b/.test(content);
  const diScore =
    hardcodedNew <= 2 || hasConstructorInjection || hasParameterInjection ? 100 : hardcodedNew <= 5 ? 60 : 30;
  metrics.push({
    id: "dependency-injection",
    label: "Dependency Injection",
    score: diScore,
    weight: 15,
    detail: `${hardcodedNew} direct instantiations`,
  });
  if (hardcodedNew > 5 && !hasConstructorInjection) {
    issues.push({
      id: "no-di",
      label: "No Dependency Injection",
      severity: "medium",
      detail: `${hardcodedNew} hardcoded instantiations without constructor injection`,
    });
  }

  // 4. Testability
  const exportCount = (content.match(/\bexport\s+(?:function|class|const|interface|type|enum)\b/g) || []).length;
  const hasDefault = /\bexport\s+default\b/.test(content);
  const hasGlobalState = /\blet\s+\w+\s*=/.test(content) && !/\bfunction\b/.test(content.split(/\blet\b/)[0] || "");
  const sideEffects = (content.match(/console\.\w+|process\.exit|process\.env/g) || []).length;
  const testabilityScore =
    (exportCount > 0 || hasDefault ? 30 : 0) +
    (hasGlobalState ? 0 : 25) +
    (hardcodedNew <= 3 ? 25 : 0) +
    (sideEffects <= 3 ? 20 : sideEffects <= 8 ? 10 : 0);
  metrics.push({ id: "testability", label: "Testability", score: Math.min(100, testabilityScore), weight: 15 });
  if (testabilityScore < 50) {
    issues.push({
      id: "low-testability",
      label: "Low Testability",
      severity: "medium",
      detail: "Module has global state, side effects, or no exports — hard to unit-test",
    });
  }

  // 5. Single Responsibility — file length & export count
  const fileLength = lines.length;
  const srScore = fileLength <= 200 ? 100 : fileLength <= 400 ? 70 : fileLength <= 600 ? 40 : 10;
  metrics.push({
    id: "srp",
    label: "Single Responsibility",
    score: srScore,
    weight: 15,
    detail: `${fileLength} lines, ${exportCount} exports`,
  });
  if (fileLength > 400) {
    issues.push({
      id: "large-file",
      label: "Large File",
      severity: "low",
      detail: `${fileLength} lines — consider splitting into focused modules`,
    });
  }

  // 6. Scalability patterns
  const hasAsync = /\basync\b/.test(content);
  const hasErrorHandling = /\btry\s*{/.test(content) || /\.catch\(/.test(content);
  const hasStreaming = /\bStream\b|createReadStream|pipeline\(/.test(content);
  const _hasPooling = /pool\.|Pool\(|createPool/.test(content);
  let scalabilityScore = 50;
  if (hasAsync) scalabilityScore += 20;
  if (hasErrorHandling) scalabilityScore += 15;
  if (hasStreaming) scalabilityScore += 15;
  metrics.push({
    id: "scalability",
    label: "Scalability Patterns",
    score: Math.min(100, scalabilityScore),
    weight: 15,
  });

  void filePath;
  return { metrics, issues };
}

function computeOverallScore(metrics: ArchMetric[]): number {
  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  const weighted = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

function gradeFor(score: number): string {
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

export function runArchAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges arch-audit — Evaluate architectural quality of code

Usage:
  judges arch-audit <file-or-dir>
  judges arch-audit src/ --min-grade C

Options:
  --min-grade <A-F>   Only show files at or below this grade
  --format json       JSON output
  --help, -h          Show this help

Metrics:
  • Loose Coupling (import count)
  • Separation of Concerns (DOM/DB/HTTP/FS mixing)
  • Dependency Injection (hardcoded vs. injected)
  • Testability (exports, global state, side effects)
  • Single Responsibility (file size, export count)
  • Scalability Patterns (async, error handling, streaming)
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

  const results: FileArchResult[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const { metrics, issues } = analyzeArchitecture(content, f);
    const overall = computeOverallScore(metrics);
    results.push({ file: relative(target, f) || f, overallScore: overall, grade: gradeFor(overall), metrics, issues });
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
    console.log(`\n  Architecture Audit — ${files.length} files`);
    console.log(`  Average: ${avgScore}/100 (${gradeFor(avgScore)})\n  ──────────────────────────`);

    if (filtered.length === 0) {
      console.log(`    ✅ All files meet architecture threshold\n`);
      return;
    }

    for (const r of filtered.slice(0, 20)) {
      const icon = r.grade === "A" || r.grade === "B" ? "🟢" : r.grade === "C" ? "🟡" : r.grade === "D" ? "🟠" : "🔴";
      console.log(`\n    ${icon} ${r.file} — ${r.overallScore}/100 (${r.grade})`);
      for (const m of r.metrics) {
        const mIcon = m.score >= 70 ? "✓" : m.score >= 40 ? "~" : "✗";
        console.log(`        ${mIcon} ${m.label.padEnd(24)} ${String(m.score).padEnd(4)} ${m.detail || ""}`);
      }
      if (r.issues.length > 0) {
        console.log(`      Issues:`);
        for (const issue of r.issues) {
          const sev = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟠" : "🟡";
          console.log(`        ${sev} ${issue.label}: ${issue.detail}`);
        }
      }
    }

    if (filtered.length > 20) console.log(`    ... and ${filtered.length - 20} more files`);

    // Grade distribution
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of results) dist[r.grade]++;
    console.log(`\n    Distribution: A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D} F:${dist.F}`);

    // Top issues
    const allIssues = results.flatMap((r) => r.issues.map((iss) => ({ file: r.file, ...iss })));
    const highIssues = allIssues.filter((i) => i.severity === "high");
    if (highIssues.length > 0) {
      console.log(`\n    ⚠ ${highIssues.length} high-severity architecture issue(s):`);
      for (const iss of highIssues.slice(0, 10)) {
        console.log(`        ${iss.file}: ${iss.detail}`);
      }
    }
    console.log("");
  }
}
