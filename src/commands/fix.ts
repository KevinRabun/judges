/**
 * `judges fix` — Apply auto-fix patches from findings.
 *
 * Evaluates code with the full tribunal, collects findings with patches,
 * and either previews or applies the fixes.
 *
 * Usage:
 *   judges fix src/app.ts                 # Preview fixes (dry-run)
 *   judges fix src/app.ts --apply         # Apply fixes in-place
 *   judges fix src/app.ts --judge cyber   # Fixes from one judge only
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, extname, relative } from "path";

import { evaluateWithTribunal, evaluateWithJudge } from "../evaluators/index.js";
import { getJudge } from "../judges/index.js";
import type { Finding, Patch } from "../types.js";

// ─── Language Detection (shared with cli.ts) ────────────────────────────────

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
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

function detectLanguage(filePath: string): string {
  const base = filePath.toLowerCase();
  if (base.endsWith("dockerfile") || base.includes("dockerfile.")) return "dockerfile";
  const ext = extname(base);
  return EXT_TO_LANG[ext] || "typescript";
}

// ─── Patch Application Engine ───────────────────────────────────────────────

export interface PatchCandidate {
  ruleId: string;
  title: string;
  severity: string;
  patch: Patch;
  lineNumbers?: number[];
}

/** Selective-fix filter criteria. */
export interface PatchFilter {
  /** Only apply patches whose ruleId matches (case-insensitive substring). */
  rule?: string;
  /** Only apply patches at or above this severity (critical > high > medium > low > info). */
  severity?: string;
  /** Only apply patches whose startLine falls within [start, end]. */
  lineRange?: { start: number; end: number };
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/**
 * Filter patches by rule, severity, or line range.
 */
export function filterPatches(patches: PatchCandidate[], filter: PatchFilter): PatchCandidate[] {
  return patches.filter((p) => {
    if (filter.rule && !p.ruleId.toLowerCase().includes(filter.rule.toLowerCase())) {
      return false;
    }
    if (filter.severity) {
      const minRank = SEVERITY_RANK[filter.severity.toLowerCase()] ?? 0;
      const patchRank = SEVERITY_RANK[p.severity.toLowerCase()] ?? 0;
      if (patchRank < minRank) return false;
    }
    if (filter.lineRange) {
      const patchStart = p.patch.startLine;
      if (patchStart < filter.lineRange.start || patchStart > filter.lineRange.end) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Detect overlapping patches (patches whose line ranges intersect).
 * Returns indices of patches that overlap with at least one other patch.
 */
export function detectOverlaps(patches: PatchCandidate[]): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const a = patches[i].patch;
      const b = patches[j].patch;
      // Ranges overlap if one starts before the other ends
      if (a.startLine <= b.endLine && b.startLine <= a.endLine) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }
  return overlapping;
}

/**
 * Sort patches bottom-to-top (by startLine descending) to avoid line offsets.
 */
export function sortPatchesBottomUp(patches: PatchCandidate[]): PatchCandidate[] {
  return [...patches].sort((a, b) => b.patch.startLine - a.patch.startLine);
}

/**
 * Apply patches to source code. Patches are applied bottom-to-top so that
 * earlier line numbers remain stable. Overlapping patches are skipped to
 * prevent corrupted output.
 */
export function applyPatches(
  code: string,
  patches: PatchCandidate[],
): { result: string; applied: number; skipped: number; overlapped: number } {
  const lines = code.split("\n");
  const overlaps = detectOverlaps(patches);
  const sorted = sortPatchesBottomUp(patches);
  let applied = 0;
  let skipped = 0;
  let overlapped = 0;

  // Build index lookup so we can detect overlap membership on sorted entries
  const originalIndices = new Map<PatchCandidate, number>();
  patches.forEach((p, i) => originalIndices.set(p, i));

  for (const p of sorted) {
    const origIdx = originalIndices.get(p) ?? -1;
    if (overlaps.has(origIdx)) {
      overlapped++;
      continue;
    }

    const { patch } = p;
    // Validate the old text matches what we expect
    const regionLines = lines.slice(patch.startLine - 1, patch.endLine);
    const regionText = regionLines.join("\n");

    if (regionText.includes(patch.oldText) || regionText.trim() === patch.oldText.trim()) {
      // Apply the replacement
      const newRegionText = regionText.replace(patch.oldText, patch.newText);
      const newLines = newRegionText.split("\n");
      lines.splice(patch.startLine - 1, patch.endLine - patch.startLine + 1, ...newLines);
      applied++;
    } else {
      skipped++;
    }
  }

  return { result: lines.join("\n"), applied, skipped, overlapped };
}

// ─── Multi-File Patch Coordination ──────────────────────────────────────────

/** A group of patches scoped to a single file within a cross-file fix set. */
export interface FilePatchGroup {
  /** Absolute or relative file path. */
  filePath: string;
  /** Patches to apply to this file. */
  patches: PatchCandidate[];
}

/** A coordinated set of patches across multiple files. */
export type PatchSet = FilePatchGroup[];

/** Result of applying a multi-file patch set. */
export interface PatchSetResult {
  /** Per-file results. */
  files: Array<{
    filePath: string;
    applied: number;
    skipped: number;
    overlapped: number;
  }>;
  /** Aggregate totals. */
  totalApplied: number;
  totalSkipped: number;
  totalOverlapped: number;
  totalFiles: number;
}

/**
 * Collect patches from findings across multiple files into a PatchSet.
 * Groups findings by their associated file path.
 * `fileMap` provides a finding-to-path lookup; unmatched findings use `defaultPath`.
 */
export function collectPatchSet(findings: Finding[], defaultPath: string, fileMap?: Map<Finding, string>): PatchSet {
  const groups = new Map<string, PatchCandidate[]>();

  for (const f of findings) {
    if (!f.patch) continue;
    const fp = fileMap?.get(f) ?? defaultPath;
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp)!.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      patch: f.patch,
      lineNumbers: f.lineNumbers,
    });
  }

  return Array.from(groups.entries()).map(([filePath, patches]) => ({
    filePath,
    patches,
  }));
}

/**
 * Apply a coordinated patch set across multiple files.
 * Each file's patches are applied independently using `applyPatches()`,
 * with optional `filter` applied per file.
 */
export function applyPatchSet(
  patchSet: PatchSet,
  options: { apply?: boolean; filter?: PatchFilter; basePath?: string } = {},
): PatchSetResult {
  const results: PatchSetResult = {
    files: [],
    totalApplied: 0,
    totalSkipped: 0,
    totalOverlapped: 0,
    totalFiles: patchSet.length,
  };

  for (const group of patchSet) {
    const absPath = options.basePath ? resolve(options.basePath, group.filePath) : resolve(group.filePath);

    if (!existsSync(absPath)) {
      results.files.push({
        filePath: group.filePath,
        applied: 0,
        skipped: group.patches.length,
        overlapped: 0,
      });
      results.totalSkipped += group.patches.length;
      continue;
    }

    let patches = group.patches;
    if (options.filter) {
      patches = filterPatches(patches, options.filter);
    }

    if (patches.length === 0) {
      results.files.push({ filePath: group.filePath, applied: 0, skipped: 0, overlapped: 0 });
      continue;
    }

    const code = readFileSync(absPath, "utf-8");
    const { result, applied, skipped, overlapped } = applyPatches(code, patches);

    if (options.apply && applied > 0) {
      writeFileSync(absPath, result, "utf-8");
    }

    results.files.push({ filePath: group.filePath, applied, skipped, overlapped });
    results.totalApplied += applied;
    results.totalSkipped += skipped;
    results.totalOverlapped += overlapped;
  }

  return results;
}

// ─── Fix Command Arguments ─────────────────────────────────────────────────

interface FixArgs {
  file: string | undefined;
  language: string | undefined;
  judge: string | undefined;
  rule: string | undefined;
  severity: string | undefined;
  lines: string | undefined;
  apply: boolean;
}

export function parseFixArgs(argv: string[]): FixArgs {
  const args: FixArgs = {
    file: undefined,
    language: undefined,
    judge: undefined,
    rule: undefined,
    severity: undefined,
    lines: undefined,
    apply: false,
  };

  for (let i = 3; i < argv.length; i++) {
    // skip node, script, "fix"
    const arg = argv[i];
    switch (arg) {
      case "--apply":
      case "-a":
        args.apply = true;
        break;
      case "--language":
      case "-l":
        args.language = argv[++i];
        break;
      case "--judge":
      case "-j":
        args.judge = argv[++i];
        break;
      case "--file":
      case "-f":
        args.file = argv[++i];
        break;
      case "--rule":
      case "-r":
        args.rule = argv[++i];
        break;
      case "--severity":
      case "-s":
        args.severity = argv[++i];
        break;
      case "--lines":
        args.lines = argv[++i];
        break;
      default:
        if (!arg.startsWith("-") && !args.file) {
          args.file = arg;
        }
        break;
    }
  }
  return args;
}

// ─── Main Fix Command ──────────────────────────────────────────────────────

export function runFix(argv: string[]): void {
  const args = parseFixArgs(argv);

  if (!args.file) {
    console.error("Error: No file specified.");
    console.error("Usage: judges fix <file> [--apply] [--rule <id>] [--severity <level>] [--lines <start>-<end>]");
    process.exit(1);
  }

  const filePath = resolve(args.file);
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const code = readFileSync(filePath, "utf-8");
  const language = args.language || detectLanguage(filePath);

  // Run evaluation
  let findings: Finding[];
  if (args.judge) {
    const judge = getJudge(args.judge);
    if (!judge) {
      console.error(`Error: Unknown judge "${args.judge}"`);
      process.exit(1);
    }
    const evaluation = evaluateWithJudge(judge, code, language);
    findings = evaluation.findings;
  } else {
    const verdict = evaluateWithTribunal(code, language);
    findings = verdict.evaluations.flatMap((e) => e.findings);
  }

  // Collect fixable findings (those with patches)
  let fixable: PatchCandidate[] = findings
    .filter((f) => f.patch)
    .map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      patch: f.patch!,
      lineNumbers: f.lineNumbers,
    }));

  const totalFixable = fixable.length;

  // Apply selective filters
  const filter: PatchFilter = {};
  if (args.rule) filter.rule = args.rule;
  if (args.severity) filter.severity = args.severity;
  if (args.lines) {
    const m = args.lines.match(/^(\d+)-(\d+)$/);
    if (m) {
      filter.lineRange = { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
    } else {
      console.error(`Error: Invalid --lines format. Expected start-end (e.g. 10-50).`);
      process.exit(1);
    }
  }

  if (filter.rule || filter.severity || filter.lineRange) {
    fixable = filterPatches(fixable, filter);
  }

  // Detect overlaps
  const overlaps = detectOverlaps(fixable);
  const hasOverlaps = overlaps.size > 0;

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — Auto-Fix                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  File     : ${args.file}`);
  console.log(`  Language : ${language}`);
  console.log(`  Findings : ${findings.length} total, ${totalFixable} auto-fixable`);
  if (fixable.length !== totalFixable) {
    console.log(`  Selected : ${fixable.length} (after filters)`);
  }
  if (hasOverlaps) {
    console.log(`  Overlaps : ${overlaps.size} patch(es) in overlapping regions (will be skipped)`);
  }
  console.log("");

  if (fixable.length === 0) {
    console.log("  No auto-fixable findings match the criteria. Nothing to do.\n");
    process.exit(0);
  }

  // Show preview with block context
  const codeLines = code.split("\n");
  console.log("  Fixes available:");
  console.log("  " + "─".repeat(60));
  for (let idx = 0; idx < fixable.length; idx++) {
    const p = fixable[idx];
    const _line = p.lineNumbers?.[0] ?? p.patch.startLine;
    const overlapTag = overlaps.has(idx) ? " [OVERLAP — will skip]" : "";
    console.log(`  [${p.severity.toUpperCase().padEnd(8)}] ${p.ruleId}: ${p.title}${overlapTag}`);

    // Show block context: 1 line before, affected lines, 1 line after
    const ctxStart = Math.max(0, p.patch.startLine - 2);
    const ctxEnd = Math.min(codeLines.length - 1, p.patch.endLine);
    for (let ln = ctxStart; ln <= ctxEnd; ln++) {
      const marker = ln >= p.patch.startLine - 1 && ln < p.patch.endLine ? ">" : " ";
      const lineNum = String(ln + 1).padStart(4);
      console.log(`      ${marker} ${lineNum} │ ${codeLines[ln]}`);
    }
    console.log(`             Fix: "${p.patch.oldText.slice(0, 60)}" → "${p.patch.newText.slice(0, 60)}"`);
    console.log("");
  }

  if (!args.apply) {
    console.log("  Dry run — no changes made.");
    console.log("  Run with --apply to write fixes:\n");
    let cmd = `    judges fix ${args.file} --apply`;
    if (args.rule) cmd += ` --rule ${args.rule}`;
    if (args.severity) cmd += ` --severity ${args.severity}`;
    if (args.lines) cmd += ` --lines ${args.lines}`;
    console.log(cmd + "\n");
    process.exit(0);
  }

  // Apply patches
  const { result, applied, skipped, overlapped } = applyPatches(code, fixable);
  writeFileSync(filePath, result, "utf-8");

  console.log(`  ✅ Applied ${applied} fix(es) to ${args.file}`);
  if (skipped > 0) {
    console.log(`  ⏭  Skipped ${skipped} fix(es) (source text changed)`);
  }
  if (overlapped > 0) {
    console.log(`  ⚠  Skipped ${overlapped} fix(es) (overlapping regions — re-run to apply individually)`);
  }
  console.log("");
  console.log("  Run 'judges eval' to verify the remaining findings.\n");
}
