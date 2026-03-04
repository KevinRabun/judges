// ─── Baseline Command ────────────────────────────────────────────────────────
// Create and update baseline files for suppressing known findings.
//
// Usage:
//   judges baseline create --file src/app.ts          # baseline one file
//   judges baseline create --dir .                    # baseline entire project
//   judges baseline update --dir .                    # re-scan & merge
//   judges baseline create --file src/app.ts -o .judges-baseline.json
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";
import { evaluateWithTribunal } from "../evaluators/index.js";
import { collectFiles } from "../cli.js";
import type { Finding } from "../types.js";

// ─── Language Detection ─────────────────────────────────────────────────────

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
  ".json": "json",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

function detectLanguage(filePath: string): string | undefined {
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  const ext = extname(filePath.toLowerCase());
  return EXT_TO_LANG[ext];
}

// ─── Fingerprinting ────────────────────────────────────────────────────────
// Hash ruleId + title + normalized surrounding source context so that findings
// survive line-number shifts caused by unrelated edits.

const DEFAULT_CONTEXT_RADIUS = 3;

export function computeFindingFingerprint(
  ruleId: string,
  title: string,
  sourceCode: string,
  lineNumber: number,
  contextRadius: number = DEFAULT_CONTEXT_RADIUS,
): string {
  const lines = sourceCode.split("\n");
  const startIdx = Math.max(0, lineNumber - 1 - contextRadius);
  const endIdx = Math.min(lines.length, lineNumber + contextRadius);
  const contextSlice = lines
    .slice(startIdx, endIdx)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");

  const raw = `${ruleId}::${title}::${contextSlice}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// ─── Baseline Data Types ────────────────────────────────────────────────────

/** V1 baseline format — single-file, exact line matching */
interface _BaselineV1 {
  version: 1;
  createdAt: string;
  sourceFile: string;
  findings: Array<{
    ruleId: string;
    title: string;
    lineNumbers?: number[];
    severity: string;
  }>;
  totalFindings: number;
  score: number;
}

/** V2 baseline finding stored per-file */
export interface BaselineFinding {
  ruleId: string;
  title: string;
  fingerprint: string;
  severity: string;
  lineNumbers: number[];
  status: "active" | "resolved";
}

/** V2 baseline format — project-wide, fingerprint-based matching */
export interface BaselineV2 {
  version: 2;
  createdAt: string;
  updatedAt: string;
  files: Record<string, BaselineFinding[]>;
  totalFindings: number;
  resolvedFindings: number;
}

/** Loaded baseline ready for matching */
export interface LoadedBaseline {
  version: number;
  /** v1 legacy keys: ruleId::line::title */
  keys: Set<string>;
  /** v2 fingerprints */
  fingerprints: Set<string>;
  /** v2 per-file fingerprint map for faster lookups */
  fileFingerprints: Map<string, Set<string>>;
}

// ─── Load / Match Baseline ──────────────────────────────────────────────────

/** Build a legacy v1 key (ruleId::firstLine::title) */
function v1Key(f: { ruleId: string; title: string; lineNumbers?: number[] }): string {
  const line = f.lineNumbers?.[0] ?? 0;
  return `${f.ruleId}::${line}::${f.title}`;
}

/**
 * Load a baseline file (v1 or v2) into a unified lookup structure.
 */
export function loadBaselineData(baselinePath: string): LoadedBaseline {
  const abs = resolve(baselinePath);
  if (!existsSync(abs)) {
    return { version: 0, keys: new Set(), fingerprints: new Set(), fileFingerprints: new Map() };
  }

  try {
    const raw = readFileSync(abs, "utf-8");
    const data = JSON.parse(raw);

    if (data.version === 2) {
      const fingerprints = new Set<string>();
      const fileFingerprints = new Map<string, Set<string>>();
      for (const [filePath, findings] of Object.entries(data.files || {})) {
        const set = new Set<string>();
        for (const f of findings as BaselineFinding[]) {
          if (f.status === "active") {
            fingerprints.add(f.fingerprint);
            set.add(f.fingerprint);
          }
        }
        fileFingerprints.set(filePath, set);
      }
      return { version: 2, keys: new Set(), fingerprints, fileFingerprints };
    }

    // V1 fallback
    const keys = new Set<string>();
    if (Array.isArray(data.findings)) {
      for (const f of data.findings) {
        keys.add(v1Key(f));
      }
    }
    return { version: 1, keys, fingerprints: new Set(), fileFingerprints: new Map() };
  } catch {
    console.error(`Warning: Could not parse baseline file: ${baselinePath}`);
    return { version: 0, keys: new Set(), fingerprints: new Set(), fileFingerprints: new Map() };
  }
}

/**
 * Check whether a finding is suppressed by the loaded baseline.
 *
 * For v1 baselines, uses exact ruleId::line::title matching.
 * For v2 baselines, uses fingerprint matching against source code context.
 *
 * @param filePath - Relative path of the file being evaluated (for v2 per-file lookup)
 */
export function isBaselined(
  finding: { ruleId: string; title: string; lineNumbers?: number[] },
  baseline: LoadedBaseline,
  sourceCode: string,
  filePath?: string,
): boolean {
  // V1 matching — exact key lookup
  if (baseline.keys.size > 0) {
    if (baseline.keys.has(v1Key(finding))) return true;
  }

  // V2 matching — fingerprint-based
  if (baseline.fingerprints.size > 0) {
    const targetSet =
      filePath && baseline.fileFingerprints.has(filePath)
        ? baseline.fileFingerprints.get(filePath)!
        : baseline.fingerprints;

    for (const line of finding.lineNumbers ?? [0]) {
      const fp = computeFindingFingerprint(finding.ruleId, finding.title, sourceCode, line);
      if (targetSet.has(fp)) return true;
    }
  }

  return false;
}

// ─── Baseline Creation Helpers ──────────────────────────────────────────────

function buildV2Findings(findings: Finding[], sourceCode: string): BaselineFinding[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    title: f.title,
    fingerprint: computeFindingFingerprint(f.ruleId, f.title, sourceCode, f.lineNumbers?.[0] ?? 1),
    severity: f.severity,
    lineNumbers: f.lineNumbers ?? [],
    status: "active" as const,
  }));
}

function createSingleFileBaseline(filePath: string, code: string, language: string): BaselineV2 {
  const verdict = evaluateWithTribunal(code, language);
  const relPath = relative(resolve("."), resolve(filePath));
  const now = new Date().toISOString();

  return {
    version: 2,
    createdAt: now,
    updatedAt: now,
    files: {
      [relPath]: buildV2Findings(verdict.findings, code),
    },
    totalFindings: verdict.findings.length,
    resolvedFindings: 0,
  };
}

function createProjectBaseline(
  dir: string,
  excludePatterns: string[],
  includePatterns: string[],
  maxFiles?: number,
  language?: string,
): BaselineV2 {
  const files = collectFiles(dir, {
    exclude: excludePatterns,
    include: includePatterns,
    maxFiles,
  });

  if (files.length === 0) {
    console.error(`No supported source files found in: ${dir}`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const baseline: BaselineV2 = {
    version: 2,
    createdAt: now,
    updatedAt: now,
    files: {},
    totalFindings: 0,
    resolvedFindings: 0,
  };

  console.log(`Scanning ${files.length} file(s) for baseline…`);

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const relPath = relative(resolve("."), filePath);
    process.stderr.write(`  [${i + 1}/${files.length}] ${relPath}…`);

    try {
      const code = readFileSync(filePath, "utf-8");
      const lang = language || detectLanguage(filePath) || "typescript";
      const verdict = evaluateWithTribunal(code, lang);

      if (verdict.findings.length > 0) {
        baseline.files[relPath] = buildV2Findings(verdict.findings, code);
        baseline.totalFindings += verdict.findings.length;
      }

      process.stderr.write(` ${verdict.findings.length} finding(s)\n`);
    } catch (err) {
      process.stderr.write(` error: ${(err as Error).message}\n`);
    }
  }

  return baseline;
}

// ─── Baseline Update (Merge) ────────────────────────────────────────────────

function updateBaseline(
  existingPath: string,
  dir: string,
  excludePatterns: string[],
  includePatterns: string[],
  maxFiles?: number,
  language?: string,
): BaselineV2 {
  // Load existing baseline
  const abs = resolve(existingPath);
  let existing: BaselineV2 | undefined;
  if (existsSync(abs)) {
    try {
      const data = JSON.parse(readFileSync(abs, "utf-8"));
      if (data.version === 2) existing = data as BaselineV2;
    } catch {
      console.error(`Warning: Could not parse existing baseline, creating fresh.`);
    }
  }

  // Scan project
  const fresh = createProjectBaseline(dir, excludePatterns, includePatterns, maxFiles, language);

  if (!existing) return fresh;

  // Merge: keep resolved status for fingerprints that no longer appear
  let resolvedCount = 0;
  const merged: BaselineV2 = {
    version: 2,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    files: {},
    totalFindings: 0,
    resolvedFindings: 0,
  };

  // Build set of all fresh fingerprints
  const freshFingerprints = new Set<string>();
  for (const findings of Object.values(fresh.files)) {
    for (const f of findings) freshFingerprints.add(f.fingerprint);
  }

  // Process existing files — mark resolved findings
  for (const [_filePath, existingFindings] of Object.entries(existing.files)) {
    for (const ef of existingFindings) {
      if (ef.status === "active" && !freshFingerprints.has(ef.fingerprint)) {
        ef.status = "resolved";
        resolvedCount++;
      }
    }
  }

  // Merge: start with fresh findings, inherit resolved from existing
  const existingFingerprints = new Set<string>();
  for (const findings of Object.values(existing.files)) {
    for (const f of findings) existingFingerprints.add(f.fingerprint);
  }

  // Add all fresh file findings
  for (const [filePath, freshFindings] of Object.entries(fresh.files)) {
    merged.files[filePath] = freshFindings;
    merged.totalFindings += freshFindings.length;
  }

  // Carry over resolved findings from files that still exist
  for (const [filePath, existingFindings] of Object.entries(existing.files)) {
    const resolved = existingFindings.filter((f) => f.status === "resolved");
    if (resolved.length > 0) {
      if (!merged.files[filePath]) merged.files[filePath] = [];
      merged.files[filePath].push(...resolved);
    }
  }

  merged.resolvedFindings =
    resolvedCount +
    Object.values(merged.files).reduce(
      (sum, findings) => sum + findings.filter((f) => f.status === "resolved").length,
      0,
    );

  // Deduplicate resolved count (we added resolvedCount + counted resolved again)
  merged.resolvedFindings = Object.values(merged.files).reduce(
    (sum, findings) => sum + findings.filter((f) => f.status === "resolved").length,
    0,
  );

  const newFindings = merged.totalFindings - [...freshFingerprints].filter((fp) => existingFingerprints.has(fp)).length;

  console.log(
    `\n  Merge summary: ${merged.totalFindings} active, ${merged.resolvedFindings} resolved` +
      (newFindings > 0 ? `, ${newFindings} new` : ""),
  );

  return merged;
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function runBaseline(argv: string[]): void {
  const subcommand = argv[3]; // "create" | "update"

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(`
Judges Panel — Baseline Management

USAGE:
  judges baseline create --file <path>                     Baseline one file (v2)
  judges baseline create --dir .                           Baseline entire project (v2)
  judges baseline update --dir .                           Re-scan & merge (mark resolved)
  judges baseline create --file <path> -o baseline.json    Custom output path

OPTIONS:
  --file, -f <path>       File to evaluate for baseline
  --dir, -d <path>        Directory to scan for project-wide baseline
  --output, -o <path>     Output baseline file (default: .judges-baseline.json)
  --language, -l <lang>   Language override (auto-detected if omitted)
  --exclude <pattern>     Glob patterns to exclude (repeatable)
  --include <pattern>     Glob patterns to include (repeatable)
  --max-files <n>         Maximum files to scan
`);
    process.exit(0);
  }

  if (subcommand !== "create" && subcommand !== "update") {
    console.error(`Unknown baseline subcommand: ${subcommand}`);
    console.error('Use "judges baseline create" or "judges baseline update"');
    process.exit(1);
  }

  let file: string | undefined;
  let dir: string | undefined;
  let output = ".judges-baseline.json";
  let language: string | undefined;
  const exclude: string[] = [];
  const include: string[] = [];
  let maxFiles: number | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        file = argv[++i];
        break;
      case "--dir":
      case "-d":
        dir = argv[++i];
        break;
      case "--output":
      case "-o":
        output = argv[++i];
        break;
      case "--language":
      case "-l":
        language = argv[++i];
        break;
      case "--exclude":
        exclude.push(argv[++i]);
        break;
      case "--include":
        include.push(argv[++i]);
        break;
      case "--max-files":
        maxFiles = parseInt(argv[++i], 10);
        break;
      default:
        if (!arg.startsWith("-") && !file && !dir) file = arg;
        break;
    }
  }

  // ── Update subcommand ──────────────────────────────────────────────────
  if (subcommand === "update") {
    const targetDir = dir || ".";
    console.log(`Updating baseline from ${targetDir}…`);
    const baseline = updateBaseline(output, targetDir, exclude, include, maxFiles, language);
    const outPath = resolve(output);
    writeFileSync(outPath, JSON.stringify(baseline, null, 2), "utf-8");
    console.log(
      `✅ Baseline updated: ${outPath} (${baseline.totalFindings} active, ${baseline.resolvedFindings} resolved)`,
    );
    process.exit(0);
  }

  // ── Create subcommand ──────────────────────────────────────────────────

  // Project-wide mode
  if (dir) {
    console.log(`Creating project-wide baseline from ${dir}…`);
    const baseline = createProjectBaseline(dir, exclude, include, maxFiles, language);
    const outPath = resolve(output);
    writeFileSync(outPath, JSON.stringify(baseline, null, 2), "utf-8");
    console.log(
      `✅ Baseline created: ${outPath} (${baseline.totalFindings} findings across ${Object.keys(baseline.files).length} file(s))`,
    );
    process.exit(0);
  }

  // Single-file mode
  if (!file) {
    console.error("Error: --file or --dir is required for baseline create");
    process.exit(1);
  }

  const abs = resolve(file);
  if (!existsSync(abs)) {
    console.error(`Error: File not found: ${abs}`);
    process.exit(1);
  }

  const code = readFileSync(abs, "utf-8");
  const lang = language || detectLanguage(file) || "typescript";

  console.log(`Evaluating ${file} to create baseline...`);
  const baseline = createSingleFileBaseline(file, code, lang);

  const outPath = resolve(output);
  writeFileSync(outPath, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`✅ Baseline created: ${outPath} (${baseline.totalFindings} finding(s) captured)`);
  process.exit(0);
}
