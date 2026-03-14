/**
 * Severity-tune — Auto-calibrate severity levels based on project patterns.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PatternFrequency {
  pattern: string;
  currentSeverity: string;
  occurrences: number;
  filesAffected: number;
  suggestedSeverity: string;
  reason: string;
}

interface SeverityTuneResult {
  filesScanned: number;
  patternsAnalyzed: number;
  tuningRecommendations: PatternFrequency[];
  summary: string;
}

// ─── Patterns with default severity ────────────────────────────────────────

const TUNE_PATTERNS: { name: string; severity: string; regex: RegExp }[] = [
  {
    name: "hardcoded-secret",
    severity: "critical",
    regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}/i,
  },
  { name: "eval-usage", severity: "critical", regex: /\beval\s*\(/ },
  { name: "sql-concat", severity: "critical", regex: /(?:query|execute)\s*\(\s*["'`].*\+/ },
  { name: "xss-risk", severity: "high", regex: /innerHTML\s*=|document\.write\s*\(/ },
  { name: "command-injection", severity: "critical", regex: /exec(?:Sync)?\s*\(\s*`[^`]*\$\{/ },
  { name: "empty-catch", severity: "medium", regex: /catch\s*\([^)]*\)\s*\{\s*\}/ },
  { name: "any-type", severity: "medium", regex: /:\s*any\b/ },
  { name: "unsafe-regex", severity: "high", regex: /new\s+RegExp\s*\([^)]*\+/ },
  { name: "deprecated-api", severity: "medium", regex: /new\s+Buffer\s*\(|\.substr\s*\(/ },
  { name: "console-log", severity: "low", regex: /console\.log\s*\(/ },
  { name: "todo-fixme", severity: "low", regex: /\/\/\s*(?:TODO|FIXME|HACK)\b/i },
  { name: "magic-number", severity: "low", regex: /(?:if|return|===?)\s*(?<!\w)\d{3,}(?!\w)/ },
  { name: "long-line", severity: "low", regex: /^.{200,}$/ },
  { name: "nested-ternary", severity: "medium", regex: /[?][^:]*[?]/ },
  { name: "god-function", severity: "medium", regex: /^(?:export\s+)?(?:async\s+)?function\s+\w+/ },
];

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

function analyzeSeverity(files: string[]): SeverityTuneResult {
  const patternData = new Map<string, { occurrences: number; files: Set<string>; severity: string }>();

  for (const pat of TUNE_PATTERNS) {
    patternData.set(pat.name, { occurrences: 0, files: new Set(), severity: pat.severity });
  }

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (const pat of TUNE_PATTERNS) {
      // Special handling for god-function: count functions > 80 lines
      if (pat.name === "god-function") {
        let funcCount = 0;
        let inFunc = false;
        let braceDepth = 0;
        let funcLines = 0;
        for (const line of lines) {
          if (pat.regex.test(line) && !inFunc) {
            inFunc = true;
            braceDepth = 0;
            funcLines = 0;
          }
          if (inFunc) {
            funcLines++;
            braceDepth += (line.match(/\{/g) || []).length;
            braceDepth -= (line.match(/\}/g) || []).length;
            if (braceDepth <= 0 && funcLines > 1) {
              if (funcLines > 80) funcCount++;
              inFunc = false;
            }
          }
        }
        if (funcCount > 0) {
          const data = patternData.get(pat.name)!;
          data.occurrences += funcCount;
          data.files.add(filePath);
        }
        continue;
      }

      let hitCount = 0;
      for (const line of lines) {
        if (pat.regex.test(line)) hitCount++;
      }
      if (hitCount > 0) {
        const data = patternData.get(pat.name)!;
        data.occurrences += hitCount;
        data.files.add(filePath);
      }
    }
  }

  // Generate tuning recommendations
  const recommendations: PatternFrequency[] = [];
  const fileCount = files.length;

  for (const [name, data] of patternData) {
    if (data.occurrences === 0) continue;

    const filePercent = fileCount > 0 ? (data.files.size / fileCount) * 100 : 0;
    let suggestedSeverity = data.severity;
    let reason = "Current severity is appropriate";

    // If a pattern appears in >50% of files, it may be a team convention — consider lowering severity
    if (filePercent > 50 && data.severity !== "low") {
      suggestedSeverity = data.severity === "critical" ? "high" : data.severity === "high" ? "medium" : "low";
      reason = `Appears in ${Math.round(filePercent)}% of files — may be a project norm. Consider lowering severity.`;
    }
    // If a critical/high pattern appears very rarely, keep it — it's genuinely concerning
    else if (data.occurrences <= 2 && (data.severity === "critical" || data.severity === "high")) {
      reason = "Rare occurrence — keep current severity to catch regressions";
    }
    // If low-severity pattern is pervasive, suggest ignoring
    else if (data.severity === "low" && data.occurrences > 100) {
      suggestedSeverity = "info";
      reason = `${data.occurrences} occurrences — consider ignoring to reduce noise`;
    }

    if (suggestedSeverity !== data.severity) {
      recommendations.push({
        pattern: name,
        currentSeverity: data.severity,
        occurrences: data.occurrences,
        filesAffected: data.files.size,
        suggestedSeverity,
        reason,
      });
    }
  }

  recommendations.sort((a, b) => b.occurrences - a.occurrences);

  const summary =
    recommendations.length === 0
      ? "All severity levels appear well-calibrated for this project."
      : `${recommendations.length} severity adjustments recommended to reduce noise and improve signal.`;

  return {
    filesScanned: files.length,
    patternsAnalyzed: TUNE_PATTERNS.length,
    tuningRecommendations: recommendations,
    summary,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSeverityTune(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges severity-tune — Auto-calibrate severity levels for your project

Usage:
  judges severity-tune [dir]                  Analyze and recommend adjustments
  judges severity-tune --format json          JSON output

Options:
  [dir]                   Target directory (default: .)
  --format json           JSON output
  --help, -h              Show this help

Analyzes your codebase to determine if default severity levels match your
project's patterns. Recommends adjustments to reduce alert fatigue for
pervasive patterns while maintaining sensitivity for genuine issues.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir =
    argv.find((a) => !a.startsWith("-") && a !== "severity-tune" && argv[argv.indexOf(a) - 1] !== "--format") || ".";

  const files = collectSourceFiles(dir);
  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  const result = analyzeSeverity(files);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Severity Tune\n  ─────────────────────────────`);
  console.log(`    Files scanned: ${result.filesScanned}`);
  console.log(`    Patterns analyzed: ${result.patternsAnalyzed}`);
  console.log(`\n    💡 ${result.summary}`);

  if (result.tuningRecommendations.length > 0) {
    console.log("\n    Recommendations:");
    for (const rec of result.tuningRecommendations) {
      console.log(`\n      ${rec.pattern}: ${rec.currentSeverity} → ${rec.suggestedSeverity}`);
      console.log(`        ${rec.occurrences} occurrences in ${rec.filesAffected} files`);
      console.log(`        ${rec.reason}`);
    }
  }

  console.log();
}
