import type { Finding } from "../types.js";
import { execSync } from "node:child_process";

export interface ApplyPatchOptions {
  dryRun?: boolean;
  cwd?: string;
}

export interface ApplyPatchResult {
  applied: number;
  skipped: number;
  errors: string[];
}

/**
 * Minimal safe apply pipeline. For now, uses `git apply --3way` when available.
 * This is intentionally conservative; if anything fails, it records an error and continues.
 */
export function applyPatchesFromFindings(findings: Finding[], opts: ApplyPatchOptions = {}): ApplyPatchResult {
  const errors: string[] = [];
  let applied = 0;
  let skipped = 0;
  const cwd = opts.cwd ?? process.cwd();
  for (const f of findings) {
    const patchText = f.patch?.newText ?? f.suggestedFix;
    if (!patchText) {
      skipped++;
      continue;
    }
    try {
      if (opts.dryRun) {
        // simulate success
        applied++;
        continue;
      }
      const fileLike = f as { _file?: string; filePath?: string };
      const filePath = fileLike.filePath ?? fileLike._file ?? "file";
      const patchWithHeader = patchText.startsWith("diff --git")
        ? patchText
        : `diff --git a/${filePath} b/${filePath}\n${patchText}`;
      execSync("git apply --3way -", { cwd, input: patchWithHeader, stdio: "pipe" });
      applied++;
    } catch (err) {
      errors.push(String((err as Error).message ?? err));
      skipped++;
    }
  }
  return { applied, skipped, errors };
}
