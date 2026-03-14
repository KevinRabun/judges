/**
 * Design audit — detect AI-generated code that breaks project
 * conventions, introduces unnecessary abstractions, or creates
 * architectural deviation from the baseline.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DesignIssue {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface DesignMetric {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail?: string;
}

interface FileDesignResult {
  file: string;
  overallScore: number;
  grade: string;
  metrics: DesignMetric[];
  issues: DesignIssue[];
}

// ─── Analysers ──────────────────────────────────────────────────────────────

function analyzeDesignCoherence(
  content: string,
  _filePath: string,
  baselinePatterns: BaselinePatterns,
): { metrics: DesignMetric[]; issues: DesignIssue[] } {
  const lines = content.split("\n");
  const metrics: DesignMetric[] = [];
  const issues: DesignIssue[] = [];

  // 1. Convention adherence — does file follow project patterns?
  const usesProjectImportStyle =
    baselinePatterns.importStyle === "named" ? /import\s*{/.test(content) : /import\s+\w+\s+from/.test(content);
  const conventionScore = usesProjectImportStyle ? 80 : 40;
  metrics.push({ id: "convention", label: "Convention Adherence", score: conventionScore, weight: 20 });
  if (conventionScore < 60)
    issues.push({
      id: "import-style",
      label: "Import Style Deviation",
      severity: "low",
      detail: "Import style differs from project convention",
    });

  // 2. Unnecessary abstraction
  const classCount = (content.match(/\bclass\s+\w+/g) || []).length;
  const interfaceCount = (content.match(/\binterface\s+\w+/g) || []).length;
  const abstractCount = (content.match(/\babstract\s+class/g) || []).length;
  const singleMethodClasses = (
    content.match(/class\s+\w+[\s\S]*?{[\s\S]*?(\w+\s*\([\s\S]*?\)[\s\S]*?{[\s\S]*?})[\s\S]*?}/g) || []
  ).length;
  const overAbstraction = abstractCount > 1 || (classCount > 0 && singleMethodClasses === classCount);
  const abstractionScore = overAbstraction ? 30 : classCount + interfaceCount > 8 ? 50 : 100;
  metrics.push({
    id: "abstraction",
    label: "Abstraction Level",
    score: abstractionScore,
    weight: 20,
    detail: `${classCount} classes, ${interfaceCount} interfaces, ${abstractCount} abstract`,
  });
  if (overAbstraction) {
    issues.push({
      id: "over-abstraction",
      label: "Over-Abstraction",
      severity: "medium",
      detail: "Excessive abstraction layers — AI often creates unnecessary wrappers",
    });
  }

  // 3. Orphaned dependencies
  const imports = content.match(/import\s+(?:{[^}]+}|\w+)\s+from\s+["']([^"']+)["']/g) || [];
  const unusedImportCount = imports.filter((imp) => {
    const names =
      imp
        .match(/import\s+{([^}]+)}/)?.[1]
        ?.split(",")
        .map((s) =>
          s
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim(),
        ) || [];
    const defaultName = imp.match(/import\s+(\w+)\s+from/)?.[1];
    const allNames = [...names, defaultName].filter(Boolean) as string[];
    const afterImport = content.slice(content.indexOf(imp) + imp.length);
    return allNames.some((n) => !new RegExp(`\\b${n}\\b`).test(afterImport));
  }).length;
  const orphanScore = unusedImportCount === 0 ? 100 : unusedImportCount <= 2 ? 60 : 30;
  metrics.push({
    id: "orphaned-deps",
    label: "Dependency Hygiene",
    score: orphanScore,
    weight: 15,
    detail: `${unusedImportCount} potentially unused imports`,
  });
  if (unusedImportCount > 0) {
    issues.push({
      id: "unused-imports",
      label: "Orphaned Imports",
      severity: "low",
      detail: `${unusedImportCount} import(s) may be unused — common AI-generation artifact`,
    });
  }

  // 4. Pattern consistency
  const usesCallbacks = /\bcallback\b|\.then\(|function\s*\(err/.test(content);
  const usesAsync = /\basync\b.*\bawait\b/s.test(content);
  const usesPromise = /new\s+Promise/.test(content);
  const asyncPatterns = [usesCallbacks, usesAsync, usesPromise].filter(Boolean).length;
  const patternScore = asyncPatterns <= 1 ? 100 : asyncPatterns === 2 ? 60 : 30;
  metrics.push({ id: "pattern-consistency", label: "Pattern Consistency", score: patternScore, weight: 15 });
  if (asyncPatterns > 1) {
    issues.push({
      id: "mixed-async",
      label: "Mixed Async Patterns",
      severity: "medium",
      detail: "Mixes callbacks, async/await, and/or raw Promises — pick one style",
    });
  }

  // 5. Error handling consistency
  const tryCatchCount = (content.match(/\btry\s*{/g) || []).length;
  const catchSuppressCount = (content.match(/catch\s*\([^)]*\)\s*{\s*}/g) || []).length;
  const throwCount = (content.match(/\bthrow\s+/g) || []).length;
  const errorScore = catchSuppressCount === 0 ? 100 : catchSuppressCount <= 1 ? 70 : 30;
  metrics.push({
    id: "error-handling",
    label: "Error Handling",
    score: errorScore,
    weight: 15,
    detail: `${tryCatchCount} try/catch, ${catchSuppressCount} suppressed, ${throwCount} throws`,
  });
  if (catchSuppressCount > 0) {
    issues.push({
      id: "suppressed-errors",
      label: "Suppressed Errors",
      severity: "high",
      detail: `${catchSuppressCount} empty catch block(s) — errors silently swallowed`,
    });
  }

  // 6. Naming coherence
  const camelCase = (content.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*/g) || []).length;
  const snakeCase = (content.match(/\b[a-z]+_[a-z]+/g) || []).length;
  const mixedNaming = camelCase > 0 && snakeCase > 0;
  const namingScore = mixedNaming ? (Math.abs(camelCase - snakeCase) > 5 ? 50 : 30) : 100;
  metrics.push({ id: "naming-coherence", label: "Naming Coherence", score: namingScore, weight: 15 });
  if (mixedNaming) {
    issues.push({
      id: "mixed-naming",
      label: "Mixed Naming Convention",
      severity: "low",
      detail: `${camelCase} camelCase + ${snakeCase} snake_case identifiers`,
    });
  }

  void lines;
  return { metrics, issues };
}

// ─── Baseline ───────────────────────────────────────────────────────────────

interface BaselinePatterns {
  importStyle: "named" | "default";
  avgFileLength: number;
  primaryAsyncPattern: string;
}

function detectBaseline(files: string[]): BaselinePatterns {
  let namedCount = 0;
  let defaultCount = 0;
  let totalLength = 0;
  let asyncCount = 0;
  let callbackCount = 0;

  for (const f of files.slice(0, 20)) {
    try {
      const content = readFileSync(f, "utf-8");
      totalLength += content.split("\n").length;
      namedCount += (content.match(/import\s*{/g) || []).length;
      defaultCount += (content.match(/import\s+\w+\s+from/g) || []).length;
      if (/\basync\b/.test(content)) asyncCount++;
      if (/\.then\(/.test(content)) callbackCount++;
    } catch {
      /* skip */
    }
  }

  return {
    importStyle: namedCount >= defaultCount ? "named" : "default",
    avgFileLength: files.length > 0 ? Math.round(totalLength / Math.min(files.length, 20)) : 0,
    primaryAsyncPattern: asyncCount >= callbackCount ? "async/await" : "callbacks",
  };
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

function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function computeOverall(metrics: DesignMetric[]): number {
  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  const weighted = metrics.reduce((s, m) => s + m.score * m.weight, 0);
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDesignAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges design-audit — Detect code that breaks project conventions

Usage:
  judges design-audit <file-or-dir>
  judges design-audit src/ --min-grade C

Options:
  --min-grade <A-F>   Only show files at or below this grade
  --format json       JSON output
  --help, -h          Show this help

Checks:
  • Convention adherence (import style, project patterns)
  • Abstraction level (over-engineering, unnecessary wrappers)
  • Dependency hygiene (orphaned/unused imports)
  • Pattern consistency (mixed async styles)
  • Error handling (suppressed errors, empty catch blocks)
  • Naming coherence (mixed camelCase/snake_case)
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

  const baseline = detectBaseline(files);

  const results: FileDesignResult[] = [];
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const { metrics, issues } = analyzeDesignCoherence(content, f, baseline);
    const overall = computeOverall(metrics);
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
      JSON.stringify(
        { files: filtered, baseline, scannedFiles: files.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
  } else {
    const avgScore =
      results.length > 0 ? Math.round(results.reduce((s, r) => s + r.overallScore, 0) / results.length) : 0;
    console.log(`\n  Design Coherence Audit — ${files.length} files`);
    console.log(`  Average: ${avgScore}/100 (${gradeFor(avgScore)})`);
    console.log(
      `  Baseline: ${baseline.importStyle} imports, ${baseline.primaryAsyncPattern}, ~${baseline.avgFileLength} lines/file\n  ──────────────────────────`,
    );

    if (filtered.length === 0) {
      console.log(`    ✅ All files meet design coherence threshold\n`);
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
        for (const iss of r.issues) {
          const sev = iss.severity === "high" ? "🔴" : iss.severity === "medium" ? "🟠" : "🟡";
          console.log(`        ${sev} ${iss.detail}`);
        }
      }
    }

    if (filtered.length > 20) console.log(`    ... and ${filtered.length - 20} more files`);

    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const r of results) dist[r.grade]++;
    console.log(`\n    Distribution: A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D} F:${dist.F}\n`);
  }
}
