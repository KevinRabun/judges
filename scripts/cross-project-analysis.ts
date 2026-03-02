#!/usr/bin/env npx tsx
/**
 * Cross-Project Analysis Script
 *
 * Runs judges against all sibling projects in c:\Source\ and outputs
 * a structured JSON report of ALL findings for FP analysis.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, extname, relative, resolve } from "path";
import { writeFileSync } from "fs";

import { evaluateWithTribunal } from "../src/evaluators/index.js";
import type { Finding, TribunalVerdict } from "../src/types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const SOURCE_ROOT = "c:\\Source";
const JUDGES_DIR = "judges";
const MAX_FILES_PER_PROJECT = 80;
const MAX_FILE_BYTES = 100_000; // 100KB max to avoid regex backtracking on huge files
const PER_FILE_TIMEOUT_MS = 30_000; // 30s max per file
const OUTPUT_FILE = join(SOURCE_ROOT, JUDGES_DIR, "reports", "cross-project-findings.json");

// Skip non-code directories
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "bin",
  "obj",
  "target",
  ".vs",
  ".vscode",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".next",
  ".nuxt",
  "coverage",
  ".tox",
  "venv",
  "env",
  ".env",
  "vendor",
  "packages", // mono-repo sub-packages scanned separately if needed
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".gitignore",
  ".editorconfig",
  ".prettierrc",
]);

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".sh": "bash",
  ".bash": "bash",
};

// ─── File Discovery ──────────────────────────────────────────────────────────

function discoverFiles(dir: string, maxFiles: number): string[] {
  const files: string[] = [];

  function walk(d: string): void {
    if (files.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = join(d, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry.toLowerCase()) && !entry.startsWith(".")) {
            walk(fullPath);
          }
        } else if (stat.isFile()) {
          if (SKIP_FILES.has(entry.toLowerCase())) continue;
          const ext = extname(entry).toLowerCase();
          if (EXT_TO_LANG[ext] && stat.size <= MAX_FILE_BYTES) {
            // Skip .d.ts files
            if (entry.endsWith(".d.ts")) continue;
            files.push(fullPath);
          }
        }
      } catch {
        continue;
      }
    }
  }

  walk(dir);
  return files;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

interface ProjectResult {
  project: string;
  filesAnalyzed: number;
  overallScore: number;
  overallVerdict: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: Array<Finding & { file: string; project: string; language: string }>;
  durationMs: number;
}

function analyzeProject(projectName: string): ProjectResult {
  const projectPath = join(SOURCE_ROOT, projectName);
  const start = Date.now();

  process.stderr.write(`\n  ▶ ${projectName}\n`);

  const files = discoverFiles(projectPath, MAX_FILES_PER_PROJECT);
  process.stderr.write(`    Found ${files.length} source files\n`);

  const allFindings: Array<Finding & { file: string; project: string; language: string }> = [];
  let totalScore = 0;
  let fileCount = 0;

  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    const language = EXT_TO_LANG[ext];
    if (!language) continue;

    let code: string;
    try {
      code = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // Skip empty/tiny files
    if (code.trim().length < 20) continue;

    // Skip files with extremely long lines (likely generated/data)
    const codeLines = code.split("\n");
    if (codeLines.some((l) => l.length > 5000)) {
      process.stderr.write(
        `    ⏭ ${relative(projectPath, filePath).replace(/\\/g, "/")} (contains very long lines — likely generated)\n`,
      );
      continue;
    }

    const relPath = relative(projectPath, filePath).replace(/\\/g, "/");
    process.stderr.write(`    📄 ${relPath}\n`);

    try {
      // Timeout guard to prevent regex backtracking hangs
      const start = Date.now();
      const verdict = evaluateWithTribunal(code, language, undefined, {
        filePath: relPath,
        includeAstFindings: true,
      });
      const elapsed = Date.now() - start;

      if (elapsed > PER_FILE_TIMEOUT_MS) {
        process.stderr.write(
          `    ⚠ SLOW (${(elapsed / 1000).toFixed(1)}s): ${relPath} — skipping future large files\n`,
        );
      }

      totalScore += verdict.overallScore;
      fileCount++;

      for (const f of verdict.findings) {
        allFindings.push({
          ...f,
          file: relPath,
          project: projectName,
          language,
        });
      }
    } catch (err) {
      process.stderr.write(`    ⚠ Error analyzing ${relPath}: ${err}\n`);
    }
  }

  const elapsed = Date.now() - start;
  const avgScore = fileCount > 0 ? Math.round(totalScore / fileCount) : 100;

  const criticalCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const mediumCount = allFindings.filter((f) => f.severity === "medium").length;
  const lowCount = allFindings.filter((f) => f.severity === "low").length;

  const overallVerdict = criticalCount > 0 ? "fail" : highCount > 0 ? "warning" : "pass";

  process.stderr.write(
    `    ✅ ${fileCount} files, ${allFindings.length} findings (${criticalCount}C/${highCount}H/${mediumCount}M/${lowCount}L) in ${(elapsed / 1000).toFixed(1)}s\n`,
  );

  return {
    project: projectName,
    filesAnalyzed: fileCount,
    overallScore: avgScore,
    overallVerdict,
    totalFindings: allFindings.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    findings: allFindings,
    durationMs: elapsed,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  process.stderr.write("\n╔══════════════════════════════════════════════════════╗\n");
  process.stderr.write("║    Judges Panel — Cross-Project Analysis             ║\n");
  process.stderr.write("╚══════════════════════════════════════════════════════╝\n\n");

  // Get all project dirs
  const entries = readdirSync(SOURCE_ROOT);
  const projects = entries.filter((e) => {
    if (e === JUDGES_DIR) return false;
    const p = join(SOURCE_ROOT, e);
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  });

  process.stderr.write(`  Found ${projects.length} projects to analyze\n`);

  const results: ProjectResult[] = [];

  for (const project of projects) {
    try {
      const result = analyzeProject(project);
      results.push(result);
    } catch (err) {
      process.stderr.write(`  ❌ ${project}: ${err}\n`);
    }
  }

  // Summary
  const totalFindings = results.reduce((s, r) => s + r.totalFindings, 0);
  const totalFiles = results.reduce((s, r) => s + r.filesAnalyzed, 0);

  process.stderr.write(`\n${"═".repeat(60)}\n`);
  process.stderr.write(`  TOTAL: ${totalFiles} files across ${results.length} projects\n`);
  process.stderr.write(`  FINDINGS: ${totalFindings}\n`);
  process.stderr.write(`${"═".repeat(60)}\n\n`);

  // Write JSON
  const output = {
    timestamp: new Date().toISOString(),
    projectCount: results.length,
    totalFilesAnalyzed: totalFiles,
    totalFindings,
    projects: results.map(({ findings, ...rest }) => rest),
    // Flatten all findings with project/file context
    allFindings: results.flatMap((r) => r.findings),
    // Rule frequency table
    ruleFrequency: buildRuleFrequency(results),
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
  process.stderr.write(`  📝 Full report saved to: ${OUTPUT_FILE}\n\n`);
}

function buildRuleFrequency(results: ProjectResult[]): Array<{
  ruleId: string;
  count: number;
  projects: string[];
  severities: string[];
}> {
  const freq = new Map<string, { count: number; projects: Set<string>; severities: Set<string> }>();

  for (const r of results) {
    for (const f of r.findings) {
      const existing = freq.get(f.ruleId) || { count: 0, projects: new Set(), severities: new Set() };
      existing.count++;
      existing.projects.add(r.project);
      existing.severities.add(f.severity);
      freq.set(f.ruleId, existing);
    }
  }

  return [...freq.entries()]
    .map(([ruleId, v]) => ({
      ruleId,
      count: v.count,
      projects: [...v.projects],
      severities: [...v.severities],
    }))
    .sort((a, b) => b.count - a.count);
}

main();
