/**
 * External Benchmark Registry
 *
 * Provides a unified framework for running third-party benchmarks against
 * Judges and producing comparable, per-suite scoring reports.
 *
 * Each benchmark registers as a named suite with its own adapter that knows
 * how to load data, run evaluations, and produce a standardised result.
 * Results are stored per-suite so they can be compared individually or
 * aggregated into a composite scorecard.
 *
 * Usage:
 *   judges external-benchmark run                       # Run all registered suites
 *   judges external-benchmark run --suite openssf-cve   # Run one suite
 *   judges external-benchmark list                      # List available suites
 *   judges external-benchmark report                    # Composite report from saved results
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

// ─── Shared Types ───────────────────────────────────────────────────────────

/**
 * Standardised result format that every external benchmark adapter must produce.
 * This makes results comparable across benchmarks and enables composite reports.
 */
export interface ExternalBenchmarkResult {
  /** Unique suite identifier (e.g. "openssf-cve", "martian-code-review") */
  suiteId: string;
  /** Human-readable name */
  suiteName: string;
  /** URL to the benchmark's public repo / site */
  suiteUrl: string;
  /** ISO-8601 timestamp of this run */
  timestamp: string;
  /** Judges version used */
  judgesVersion: string;

  // ── Core metrics (all benchmarks must fill these) ──

  /** Total items evaluated (CVEs, PRs, test cases, etc.) */
  totalItems: number;
  /** Items successfully evaluated (excludes skipped/errored) */
  evaluatedItems: number;
  /** Items that could not be evaluated */
  skippedItems: number;

  /** Precision (0–1) */
  precision: number;
  /** Recall (0–1) */
  recall: number;
  /** F1 score (0–1) */
  f1Score: number;
  /** Detection / match rate (0–1) */
  detectionRate: number;

  // ── Optional breakdown (benchmarks fill whatever is relevant) ──

  /** True positives count */
  truePositives?: number;
  /** False positives count */
  falsePositives?: number;
  /** False negatives count */
  falseNegatives?: number;

  /** Per-category breakdown (CWE, severity, language, etc.) */
  perCategory?: Record<
    string,
    {
      total: number;
      detected: number;
      rate: number;
    }
  >;

  /** Suite-specific raw data (varies per benchmark) */
  rawData?: unknown;
}

/**
 * Configuration for a benchmark run.
 */
export interface BenchmarkRunConfig {
  /** Path to the benchmark repo / data directory */
  repoPath: string;
  /** Restrict to a single item (CVE ID, PR URL, etc.) */
  singleItem?: string;
  /** Output format */
  format?: "text" | "json" | "markdown";
  /** Output file path */
  outputPath?: string;
}

/**
 * Adapter interface that every external benchmark must implement.
 */
export interface ExternalBenchmarkAdapter {
  /** Unique suite identifier */
  readonly suiteId: string;
  /** Human-readable name */
  readonly suiteName: string;
  /** URL to the benchmark's public repo / site */
  readonly suiteUrl: string;
  /** Default path to look for the benchmark data */
  readonly defaultRepoPath: string;
  /** Short description shown in `list` command */
  readonly description: string;

  /**
   * Validate that the benchmark repo/data exists at the given path.
   * Return an error message if not, or undefined if OK.
   */
  validate(repoPath: string): string | undefined;

  /**
   * Run the benchmark and return a standardised result.
   */
  run(config: BenchmarkRunConfig): ExternalBenchmarkResult;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const _adapters = new Map<string, ExternalBenchmarkAdapter>();

export function registerBenchmarkAdapter(adapter: ExternalBenchmarkAdapter): void {
  _adapters.set(adapter.suiteId, adapter);
}

export function getAdapter(suiteId: string): ExternalBenchmarkAdapter | undefined {
  return _adapters.get(suiteId);
}

export function listAdapters(): ExternalBenchmarkAdapter[] {
  return [..._adapters.values()];
}

// ─── Composite Report ───────────────────────────────────────────────────────

export interface CompositeReport {
  timestamp: string;
  suites: ExternalBenchmarkResult[];
  aggregate: {
    totalItems: number;
    evaluatedItems: number;
    weightedPrecision: number;
    weightedRecall: number;
    weightedF1: number;
  };
}

export function computeCompositeReport(results: ExternalBenchmarkResult[]): CompositeReport {
  let totalItems = 0;
  let evaluatedItems = 0;
  let weightedPrecSum = 0;
  let weightedRecSum = 0;

  for (const r of results) {
    totalItems += r.totalItems;
    evaluatedItems += r.evaluatedItems;
    weightedPrecSum += r.precision * r.evaluatedItems;
    weightedRecSum += r.recall * r.evaluatedItems;
  }

  const weightedPrecision = evaluatedItems > 0 ? weightedPrecSum / evaluatedItems : 0;
  const weightedRecall = evaluatedItems > 0 ? weightedRecSum / evaluatedItems : 0;
  const weightedF1 =
    weightedPrecision + weightedRecall > 0
      ? (2 * weightedPrecision * weightedRecall) / (weightedPrecision + weightedRecall)
      : 0;

  return {
    timestamp: new Date().toISOString(),
    suites: results,
    aggregate: { totalItems, evaluatedItems, weightedPrecision, weightedRecall, weightedF1 },
  };
}

export function formatCompositeReport(report: CompositeReport): string {
  const lines: string[] = [];

  lines.push("# External Benchmark Scorecard");
  lines.push("");
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push("");

  // Aggregate summary
  lines.push("## Aggregate");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Total Items | ${report.aggregate.totalItems} |`);
  lines.push(`| Evaluated | ${report.aggregate.evaluatedItems} |`);
  lines.push(`| Weighted Precision | ${(report.aggregate.weightedPrecision * 100).toFixed(1)}% |`);
  lines.push(`| Weighted Recall | ${(report.aggregate.weightedRecall * 100).toFixed(1)}% |`);
  lines.push(`| Weighted F1 | ${(report.aggregate.weightedF1 * 100).toFixed(1)}% |`);
  lines.push("");

  // Per-suite table
  lines.push("## Per-Suite Results");
  lines.push("");
  lines.push("| Suite | Items | Detection Rate | Precision | Recall | F1 |");
  lines.push("|-------|-------|---------------|-----------|--------|-----|");
  for (const s of report.suites) {
    lines.push(
      `| [${s.suiteName}](${s.suiteUrl}) | ${s.evaluatedItems}/${s.totalItems} ` +
        `| ${(s.detectionRate * 100).toFixed(1)}% ` +
        `| ${(s.precision * 100).toFixed(1)}% ` +
        `| ${(s.recall * 100).toFixed(1)}% ` +
        `| ${(s.f1Score * 100).toFixed(1)}% |`,
    );
  }
  lines.push("");

  // Per-suite detail sections
  for (const s of report.suites) {
    lines.push(`## ${s.suiteName}`);
    lines.push("");
    lines.push(`**Source:** ${s.suiteUrl}`);
    lines.push(`**Items:** ${s.evaluatedItems} evaluated, ${s.skippedItems} skipped`);
    lines.push("");

    if (s.perCategory && Object.keys(s.perCategory).length > 0) {
      lines.push("| Category | Total | Detected | Rate |");
      lines.push("|----------|-------|----------|------|");
      const entries = Object.entries(s.perCategory).sort((a, b) => b[1].total - a[1].total);
      for (const [cat, data] of entries) {
        lines.push(`| ${cat} | ${data.total} | ${data.detected} | ${(data.rate * 100).toFixed(0)}% |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Result Persistence ─────────────────────────────────────────────────────

const RESULTS_DIR = "benchmarks/external";

function ensureResultsDir(): string {
  const dir = resolve(RESULTS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveResult(result: ExternalBenchmarkResult): string {
  const dir = ensureResultsDir();
  const fileName = `${result.suiteId}-${result.timestamp.replace(/[:.]/g, "-")}.json`;
  const filePath = join(dir, fileName);
  writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");

  // Also write a "latest" symlink-style file
  const latestPath = join(dir, `${result.suiteId}-latest.json`);
  writeFileSync(latestPath, JSON.stringify(result, null, 2), "utf-8");

  return filePath;
}

export function loadLatestResult(suiteId: string): ExternalBenchmarkResult | undefined {
  const latestPath = resolve(RESULTS_DIR, `${suiteId}-latest.json`);
  if (!existsSync(latestPath)) return undefined;
  return JSON.parse(readFileSync(latestPath, "utf-8"));
}

export function loadAllLatestResults(): ExternalBenchmarkResult[] {
  const results: ExternalBenchmarkResult[] = [];
  for (const adapter of listAdapters()) {
    const r = loadLatestResult(adapter.suiteId);
    if (r) results.push(r);
  }
  return results;
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

// Ensure adapters are registered when the CLI entry point is called.
// Each adapter file calls registerBenchmarkAdapter() at module scope.
let _adaptersLoaded = false;
async function ensureAdaptersLoaded(): Promise<void> {
  if (_adaptersLoaded) return;
  _adaptersLoaded = true;
  try {
    await import("./openssf-cve-benchmark.js");
  } catch {
    /* adapter unavailable */
  }
  try {
    await import("./martian-code-review-benchmark.js");
  } catch {
    /* adapter unavailable */
  }
}

export async function runExternalBenchmark(argv: string[]): Promise<void> {
  await ensureAdaptersLoaded();
  const subcommand = argv[3] || "run";

  if (subcommand === "--help" || subcommand === "-h") {
    console.log(`
Judges Panel — External Benchmark Runner

Run third-party benchmarks to demonstrate Judges' capabilities and produce
comparable, per-suite scoring reports.

USAGE:
  judges external-benchmark run [options]     Run benchmark suite(s)
  judges external-benchmark list              List available suites
  judges external-benchmark report [options]  Composite report from saved results

OPTIONS:
  --suite, -s <id>       Run a specific suite (default: all)
  --repo, -r <path>      Override the benchmark repo path
  --item <id>            Evaluate a single item (CVE ID, PR URL, etc.)
  --output, -o <path>    Save results to file
  --format <fmt>         Output: text, json, markdown (default: text)

AVAILABLE SUITES:`);
    for (const a of listAdapters()) {
      console.log(`  ${a.suiteId.padEnd(24)} ${a.description}`);
    }
    console.log("");
    process.exit(0);
  }

  if (subcommand === "list") {
    console.log("\nAvailable external benchmark suites:\n");
    for (const a of listAdapters()) {
      console.log(`  ${a.suiteId.padEnd(24)} ${a.suiteName}`);
      console.log(`  ${"".padEnd(24)} ${a.description}`);
      console.log(`  ${"".padEnd(24)} ${a.suiteUrl}`);
      console.log(`  ${"".padEnd(24)} Default path: ${a.defaultRepoPath}`);
      console.log("");
    }
    return;
  }

  if (subcommand === "report") {
    const results = loadAllLatestResults();
    if (results.length === 0) {
      console.error("No saved results found. Run benchmarks first with: judges external-benchmark run");
      process.exit(1);
    }
    const report = computeCompositeReport(results);
    let reportFormat = "markdown" as string;
    let outputPath: string | undefined;
    for (let i = 4; i < argv.length; i++) {
      if (argv[i] === "--format") reportFormat = argv[++i];
      else if (argv[i] === "--output" || argv[i] === "-o") outputPath = argv[++i];
    }
    const output = reportFormat === "json" ? JSON.stringify(report, null, 2) : formatCompositeReport(report);
    if (outputPath) {
      writeFileSync(outputPath, output, "utf-8");
      console.log(`Report saved to ${outputPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  // ── "run" subcommand ──

  let suiteId: string | undefined;
  let repoPath: string | undefined;
  let singleItem: string | undefined;
  let format = "text" as string;
  let outputPath: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--suite" || arg === "-s") suiteId = argv[++i];
    else if (arg === "--repo" || arg === "-r") repoPath = argv[++i];
    else if (arg === "--item") singleItem = argv[++i];
    else if (arg === "--output" || arg === "-o") outputPath = argv[++i];
    else if (arg === "--format") format = argv[++i] as typeof format;
  }

  const adapters = suiteId ? ([getAdapter(suiteId)].filter(Boolean) as ExternalBenchmarkAdapter[]) : listAdapters();

  if (adapters.length === 0) {
    if (suiteId) {
      console.error(`Unknown suite: ${suiteId}. Use 'judges external-benchmark list' to see available suites.`);
    } else {
      console.error("No benchmark adapters registered.");
    }
    process.exit(1);
  }

  const allResults: ExternalBenchmarkResult[] = [];

  for (const adapter of adapters) {
    const effectiveRepo = repoPath ? resolve(repoPath) : resolve(adapter.defaultRepoPath);

    console.log(`\n━━━ ${adapter.suiteName} ━━━`);
    console.log(`Suite: ${adapter.suiteId}`);
    console.log(`Repo:  ${effectiveRepo}`);

    const validationError = adapter.validate(effectiveRepo);
    if (validationError) {
      console.error(`  ⚠️  ${validationError}`);
      console.error(`  Skipping ${adapter.suiteId}.\n`);
      continue;
    }

    const result = adapter.run({
      repoPath: effectiveRepo,
      singleItem,
      format: format as BenchmarkRunConfig["format"],
      outputPath,
    });

    allResults.push(result);

    // Save per-suite result
    const savedPath = saveResult(result);
    console.log(`\n  Results saved to ${savedPath}`);

    // Print per-suite summary
    console.log(`\n  Detection Rate: ${(result.detectionRate * 100).toFixed(1)}%`);
    console.log(`  Precision:      ${(result.precision * 100).toFixed(1)}%`);
    console.log(`  Recall:         ${(result.recall * 100).toFixed(1)}%`);
    console.log(`  F1 Score:       ${(result.f1Score * 100).toFixed(1)}%`);
  }

  // Composite summary if multiple suites ran
  if (allResults.length > 1) {
    const report = computeCompositeReport(allResults);
    console.log("\n━━━ Composite Scorecard ━━━");
    console.log(`  Weighted Precision: ${(report.aggregate.weightedPrecision * 100).toFixed(1)}%`);
    console.log(`  Weighted Recall:    ${(report.aggregate.weightedRecall * 100).toFixed(1)}%`);
    console.log(`  Weighted F1:        ${(report.aggregate.weightedF1 * 100).toFixed(1)}%`);
  }

  if (outputPath && allResults.length > 0) {
    const finalOutput =
      format === "json"
        ? JSON.stringify(allResults.length === 1 ? allResults[0] : computeCompositeReport(allResults), null, 2)
        : format === "markdown"
          ? formatCompositeReport(computeCompositeReport(allResults))
          : allResults.map((r) => `${r.suiteName}: F1=${(r.f1Score * 100).toFixed(1)}%`).join("\n");
    writeFileSync(outputPath, finalOutput, "utf-8");
    console.log(`\nResults saved to ${outputPath}`);
  }
}
