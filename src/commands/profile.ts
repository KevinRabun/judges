/**
 * Performance profiling — track evaluation time per judge/evaluator.
 *
 * Wraps tribunal evaluation and reports timing data for each judge,
 * helping identify bottlenecks and optimize CI pipeline duration.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JudgeTiming {
  judgeId: string;
  durationMs: number;
  findingCount: number;
}

export interface ProfilingReport {
  totalMs: number;
  judges: JudgeTiming[];
  slowest: string;
  fastest: string;
  avgMs: number;
}

// ─── Profiling ──────────────────────────────────────────────────────────────

/**
 * Create a profiling wrapper around a function.
 */
export function profileFn<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  return { result, durationMs: Math.round(performance.now() - start) };
}

/**
 * Create a profiling wrapper around an async function.
 */
export async function profileAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, durationMs: Math.round(performance.now() - start) };
}

/**
 * Build a profiling report from timing data collected during evaluation.
 */
export function buildProfilingReport(timings: JudgeTiming[]): ProfilingReport {
  if (timings.length === 0) {
    return { totalMs: 0, judges: [], slowest: "N/A", fastest: "N/A", avgMs: 0 };
  }

  const sorted = [...timings].sort((a, b) => b.durationMs - a.durationMs);
  const totalMs = sorted.reduce((sum, t) => sum + t.durationMs, 0);

  return {
    totalMs,
    judges: sorted,
    slowest: sorted[0].judgeId,
    fastest: sorted[sorted.length - 1].judgeId,
    avgMs: Math.round(totalMs / sorted.length),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runProfile(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges profile — Performance profiling for judge evaluations

Usage:
  judges profile <file>               Profile evaluation of a file
  judges profile --report <path>      Display a saved profiling report

Options:
  --format json          JSON output
  --threshold <ms>       Highlight judges slower than threshold (default: 500)
  --help, -h             Show this help

Note: This command wraps the normal evaluation pipeline with timing
instrumentation. Each judge's execution time is measured individually.
`);
    return;
  }

  const { readFileSync, existsSync } = require("fs");

  const reportPath = argv.find((_a: string, i: number) => argv[i - 1] === "--report");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const thresholdStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
  const threshold = thresholdStr ? parseInt(thresholdStr, 10) : 500;

  if (reportPath && existsSync(reportPath)) {
    const report: ProfilingReport = JSON.parse(readFileSync(reportPath, "utf-8"));
    printReport(report, format, threshold);
    return;
  }

  // Without a saved report, show instructions
  console.log(`
  Profiling requires running an evaluation first.

  Run with JUDGES_PROFILE=1 to enable profiling during eval:

    JUDGES_PROFILE=1 judges eval --file src/app.ts --format json > results.json

  Then view the profiling data:

    judges profile --report .judges-profile.json

  The profiling data is saved to .judges-profile.json automatically
  when JUDGES_PROFILE=1 is set.
`);
}

function printReport(report: ProfilingReport, format: string, threshold: number): void {
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  ⏱️  Judges Evaluation Profile\n`);
  console.log(`  Total: ${report.totalMs}ms | Avg: ${report.avgMs}ms | Judges: ${report.judges.length}\n`);

  const maxLen = Math.max(...report.judges.map((j) => j.judgeId.length));

  for (const j of report.judges) {
    const bar = "█".repeat(Math.max(1, Math.round((j.durationMs / report.totalMs) * 40)));
    const warn = j.durationMs > threshold ? " ⚠️ SLOW" : "";
    console.log(
      `  ${j.judgeId.padEnd(maxLen)}  ${String(j.durationMs).padStart(6)}ms  ${bar}  (${j.findingCount} findings)${warn}`,
    );
  }

  console.log(`\n  Slowest: ${report.slowest} | Fastest: ${report.fastest}\n`);
}
