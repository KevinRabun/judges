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
import { resolve, extname } from "path";

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

/**
 * Sort patches bottom-to-top (by startLine descending) to avoid line offsets.
 */
export function sortPatchesBottomUp(patches: PatchCandidate[]): PatchCandidate[] {
  return [...patches].sort((a, b) => b.patch.startLine - a.patch.startLine);
}

/**
 * Apply patches to source code. Patches are applied bottom-to-top so that
 * earlier line numbers remain stable.
 */
export function applyPatches(
  code: string,
  patches: PatchCandidate[],
): { result: string; applied: number; skipped: number } {
  const lines = code.split("\n");
  const sorted = sortPatchesBottomUp(patches);
  let applied = 0;
  let skipped = 0;

  for (const p of sorted) {
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

  return { result: lines.join("\n"), applied, skipped };
}

// ─── Fix Command Arguments ─────────────────────────────────────────────────

interface FixArgs {
  file: string | undefined;
  language: string | undefined;
  judge: string | undefined;
  apply: boolean;
}

export function parseFixArgs(argv: string[]): FixArgs {
  const args: FixArgs = {
    file: undefined,
    language: undefined,
    judge: undefined,
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
    console.error("Usage: judges fix <file> [--apply]");
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
  const fixable: PatchCandidate[] = findings
    .filter((f) => f.patch)
    .map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      patch: f.patch!,
      lineNumbers: f.lineNumbers,
    }));

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — Auto-Fix                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  File     : ${args.file}`);
  console.log(`  Language : ${language}`);
  console.log(`  Findings : ${findings.length} total, ${fixable.length} auto-fixable`);
  console.log("");

  if (fixable.length === 0) {
    console.log("  No auto-fixable findings. Nothing to do.\n");
    process.exit(0);
  }

  // Show preview
  console.log("  Fixes available:");
  console.log("  " + "─".repeat(60));
  for (const p of fixable) {
    const line = p.lineNumbers?.[0] ?? p.patch.startLine;
    console.log(`  [${p.severity.toUpperCase().padEnd(8)}] ${p.ruleId}: ${p.title}`);
    console.log(`             Line ${line}: "${p.patch.oldText.slice(0, 50)}" → "${p.patch.newText.slice(0, 50)}"`);
  }
  console.log("");

  if (!args.apply) {
    console.log("  Dry run — no changes made.");
    console.log("  Run with --apply to write fixes:\n");
    console.log(`    judges fix ${args.file} --apply\n`);
    process.exit(0);
  }

  // Apply patches
  const { result, applied, skipped } = applyPatches(code, fixable);
  writeFileSync(filePath, result, "utf-8");

  console.log(`  ✅ Applied ${applied} fix(es) to ${args.file}`);
  if (skipped > 0) {
    console.log(`  ⏭  Skipped ${skipped} fix(es) (source text changed)`);
  }
  console.log("");
  console.log("  Run 'judges eval' to verify the remaining findings.\n");
}
