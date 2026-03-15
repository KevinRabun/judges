/**
 * Review-batch-mode — Run reviews on multiple files in batch.
 */

import { readFileSync, existsSync, readdirSync, writeFileSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BatchEntry {
  file: string;
  score: number;
  verdict: string;
  findingCount: number;
  criticalCount: number;
}

interface BatchResult {
  totalFiles: number;
  processedFiles: number;
  avgScore: number;
  passRate: number;
  entries: BatchEntry[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function processBatch(dir: string, pattern: string): BatchResult {
  const files = (readdirSync(dir) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const filtered = pattern ? files.filter((f) => f.includes(pattern)) : files;

  const entries: BatchEntry[] = [];
  let totalScore = 0;
  let passCount = 0;

  for (const file of filtered) {
    try {
      const content = readFileSync(`${dir}/${file}`, "utf-8");
      const verdict = JSON.parse(content) as TribunalVerdict;
      entries.push({
        file,
        score: verdict.overallScore,
        verdict: verdict.overallVerdict,
        findingCount: verdict.findings.length,
        criticalCount: verdict.criticalCount,
      });
      totalScore += verdict.overallScore;
      if (verdict.overallVerdict === "pass") passCount++;
    } catch {
      // skip invalid files
    }
  }

  return {
    totalFiles: filtered.length,
    processedFiles: entries.length,
    avgScore: entries.length > 0 ? Math.round(totalScore / entries.length) : 0,
    passRate: entries.length > 0 ? Math.round((passCount / entries.length) * 100) : 0,
    entries: entries.sort((a, b) => a.score - b.score),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBatchMode(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const patternIdx = argv.indexOf("--pattern");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const pattern = patternIdx >= 0 ? argv[patternIdx + 1] : "";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-batch-mode — Batch review processing

Usage:
  judges review-batch-mode --dir <verdicts-dir> [--pattern <filter>]
                           [--output <file>] [--format table|json]

Options:
  --dir <path>       Directory of verdict JSON files (required)
  --pattern <str>    Filter filenames containing this string
  --output <path>    Write results to file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const result = processBatch(dirPath, pattern);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Batch results written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nBatch Review Results`);
  console.log("═".repeat(70));
  console.log(
    `  Files: ${result.processedFiles}/${result.totalFiles}  |  Avg Score: ${result.avgScore}  |  Pass Rate: ${result.passRate}%`,
  );
  console.log("─".repeat(70));
  console.log(`${"File".padEnd(30)} ${"Score".padEnd(8)} ${"Verdict".padEnd(10)} ${"Findings".padEnd(10)} Critical`);
  console.log("─".repeat(70));

  for (const e of result.entries) {
    const name = e.file.length > 28 ? e.file.slice(0, 28) + "…" : e.file;
    console.log(
      `${name.padEnd(30)} ${String(e.score).padEnd(8)} ${e.verdict.padEnd(10)} ${String(e.findingCount).padEnd(10)} ${e.criticalCount}`,
    );
  }
  console.log("═".repeat(70));
}
