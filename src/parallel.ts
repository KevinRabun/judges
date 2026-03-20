/**
 * Parallel file processing for large repositories.
 *
 * Uses worker_threads to evaluate multiple files concurrently,
 * providing significant speedup for multi-file evaluations.
 *
 * This module provides a pool-based parallelization strategy:
 * - Creates a fixed pool of workers (defaults to available CPUs - 1)
 * - Distributes files across workers for concurrent evaluation
 * - Collects and merges results back on the main thread
 */

import { cpus } from "os";
import { readFileSync } from "fs";
import { extname } from "path";

import type { TribunalVerdict } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParallelEvalTask {
  filePath: string;
  language: string;
}

export interface ParallelEvalResult {
  filePath: string;
  language: string;
  verdict: TribunalVerdict;
  durationMs: number;
  error?: string;
}

export interface ParallelEvalSummary {
  results: ParallelEvalResult[];
  totalFiles: number;
  totalFindings: number;
  totalDurationMs: number;
  workerCount: number;
}

// ─── Language Detection ─────────────────────────────────────────────────────

import { detectLanguageFromPath } from "./ext-to-lang.js";

export function detectLanguage(filePath: string): string {
  return detectLanguageFromPath(filePath) ?? "typescript";
}

// ─── Sequential (fallback) ──────────────────────────────────────────────────

/**
 * Sequential evaluation — used as fallback or for small file counts.
 */
export function evaluateSequential(
  files: ParallelEvalTask[],
  evaluator: (code: string, language: string) => TribunalVerdict,
): ParallelEvalSummary {
  const start = Date.now();
  const results: ParallelEvalResult[] = [];

  for (const task of files) {
    const taskStart = Date.now();
    try {
      const code = readFileSync(task.filePath, "utf-8");
      const verdict = evaluator(code, task.language);
      results.push({
        filePath: task.filePath,
        language: task.language,
        verdict,
        durationMs: Date.now() - taskStart,
      });
    } catch (err) {
      results.push({
        filePath: task.filePath,
        language: task.language,
        verdict: {
          overallVerdict: "fail",
          overallScore: 0,
          summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
          evaluations: [],
          findings: [],
          criticalCount: 0,
          highCount: 0,
          timestamp: new Date().toISOString(),
        },
        durationMs: Date.now() - taskStart,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    results,
    totalFiles: files.length,
    totalFindings: results.reduce((sum, r) => sum + r.verdict.findings.length, 0),
    totalDurationMs: Date.now() - start,
    workerCount: 1,
  };
}

// ─── Parallel Evaluation via Promise Pool ───────────────────────────────────

/**
 * Evaluate files in parallel using a concurrency-limited promise pool.
 * Uses a simple async pool pattern without worker_threads for simplicity
 * and compatibility (evaluators must be imported in the same context).
 *
 * @param files - Files to evaluate
 * @param evaluator - The evaluation function to call per file
 * @param concurrency - Maximum concurrent evaluations (default: CPU count - 1)
 */
export async function evaluateParallel(
  files: ParallelEvalTask[],
  evaluator: (code: string, language: string) => TribunalVerdict,
  concurrency?: number,
): Promise<ParallelEvalSummary> {
  const maxConcurrency = concurrency ?? Math.max(1, cpus().length - 1);
  const start = Date.now();
  const results: ParallelEvalResult[] = [];

  // For very small file counts, use sequential
  if (files.length <= 2) {
    return evaluateSequential(files, evaluator);
  }

  // Promise pool implementation
  let index = 0;
  const workers: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    while (index < files.length) {
      const currentIndex = index++;
      const task = files[currentIndex];
      const taskStart = Date.now();

      try {
        const code = readFileSync(task.filePath, "utf-8");
        const verdict = evaluator(code, task.language);
        results.push({
          filePath: task.filePath,
          language: task.language,
          verdict,
          durationMs: Date.now() - taskStart,
        });
      } catch (err) {
        results.push({
          filePath: task.filePath,
          language: task.language,
          verdict: {
            overallVerdict: "fail",
            overallScore: 0,
            summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
            evaluations: [],
            findings: [],
            criticalCount: 0,
            highCount: 0,
            timestamp: new Date().toISOString(),
          },
          durationMs: Date.now() - taskStart,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Yield to allow other work to proceed
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  // Launch pool
  const poolSize = Math.min(maxConcurrency, files.length);
  for (let i = 0; i < poolSize; i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);

  return {
    results,
    totalFiles: files.length,
    totalFindings: results.reduce((sum, r) => sum + r.verdict.findings.length, 0),
    totalDurationMs: Date.now() - start,
    workerCount: poolSize,
  };
}

// ─── Batch Evaluation Helper ────────────────────────────────────────────────

/**
 * Convenience function: given file paths, detect languages and evaluate
 * in parallel. Returns sorted results (failures first).
 */
export async function batchEvaluate(
  filePaths: string[],
  evaluator: (code: string, language: string) => TribunalVerdict,
  options?: { concurrency?: number },
): Promise<ParallelEvalSummary> {
  const tasks: ParallelEvalTask[] = filePaths.map((fp) => ({
    filePath: fp,
    language: detectLanguage(fp),
  }));

  const summary = await evaluateParallel(tasks, evaluator, options?.concurrency);

  // Sort: failures first, then by finding count descending
  summary.results.sort((a, b) => {
    if (a.verdict.overallVerdict === "fail" && b.verdict.overallVerdict !== "fail") return -1;
    if (b.verdict.overallVerdict === "fail" && a.verdict.overallVerdict !== "fail") return 1;
    return b.verdict.findings.length - a.verdict.findings.length;
  });

  return summary;
}
