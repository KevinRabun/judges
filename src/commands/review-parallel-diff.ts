/**
 * Review-parallel-diff — Run reviews on multiple diff hunks in parallel.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiffHunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

interface HunkResult {
  file: string;
  startLine: number;
  endLine: number;
  findingCount: number;
  findings: Array<{ ruleId: string; severity: string; title: string }>;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parseDiff(diffContent: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffContent.split("\n");
  let currentFile = "";
  let hunkStart = 0;
  let hunkLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      if (hunkLines.length > 0 && currentFile) {
        hunks.push({
          file: currentFile,
          startLine: hunkStart,
          endLine: hunkStart + hunkLines.length - 1,
          content: hunkLines.join("\n"),
        });
        hunkLines = [];
      }
      currentFile = line.slice(6);
    } else if (line.startsWith("@@ ")) {
      if (hunkLines.length > 0 && currentFile) {
        hunks.push({
          file: currentFile,
          startLine: hunkStart,
          endLine: hunkStart + hunkLines.length - 1,
          content: hunkLines.join("\n"),
        });
        hunkLines = [];
      }
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      hunkStart = match ? parseInt(match[1], 10) : 0;
    } else if (currentFile && !line.startsWith("---") && !line.startsWith("diff ")) {
      hunkLines.push(line);
    }
  }

  if (hunkLines.length > 0 && currentFile) {
    hunks.push({
      file: currentFile,
      startLine: hunkStart,
      endLine: hunkStart + hunkLines.length - 1,
      content: hunkLines.join("\n"),
    });
  }

  return hunks;
}

function analyzeHunk(
  hunk: DiffHunk,
  results: Array<{ ruleId?: string; severity?: string; title?: string; lineNumbers?: number[] }>,
): HunkResult {
  const hunkFindings = results.filter((f) => {
    const lines = f.lineNumbers || [];
    return lines.some((l: number) => l >= hunk.startLine && l <= hunk.endLine);
  });

  return {
    file: hunk.file,
    startLine: hunk.startLine,
    endLine: hunk.endLine,
    findingCount: hunkFindings.length,
    findings: hunkFindings.map((f) => ({
      ruleId: f.ruleId || "unknown",
      severity: f.severity || "medium",
      title: f.title || "",
    })),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewParallelDiff(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-parallel-diff — Review multiple diff hunks

Usage:
  judges review-parallel-diff --diff <file> --results <file> [options]

Options:
  --diff <path>       Diff file (unified format)
  --results <path>    Results file with findings
  --min-severity <s>  Filter by minimum severity
  --format json       JSON output
  --help, -h          Show this help

Parses diff hunks and maps findings to specific changed regions.
`);
    return;
  }

  const diffFile = argv.find((_a: string, i: number) => argv[i - 1] === "--diff");
  const resultsFile = argv.find((_a: string, i: number) => argv[i - 1] === "--results");

  if (!diffFile || !resultsFile) {
    console.error("Error: --diff and --results required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(diffFile)) {
    console.error(`Error: diff file not found: ${diffFile}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(resultsFile)) {
    console.error(`Error: results file not found: ${resultsFile}`);
    process.exitCode = 1;
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity");
  const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const minSevLevel = minSeverity ? sevOrder[minSeverity.toLowerCase()] || 0 : 0;

  const diffContent = readFileSync(diffFile, "utf-8");
  const hunks = parseDiff(diffContent);

  let results: Array<{ ruleId?: string; severity?: string; title?: string; lineNumbers?: number[] }>;
  try {
    const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
    results = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  if (minSeverity) {
    results = results.filter((f) => (sevOrder[(f.severity || "medium").toLowerCase()] || 0) >= minSevLevel);
  }

  const hunkResults = hunks.map((h) => analyzeHunk(h, results));
  const withFindings = hunkResults.filter((h) => h.findingCount > 0);
  const totalFindings = withFindings.reduce((sum, h) => sum + h.findingCount, 0);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { totalHunks: hunks.length, hunksWithFindings: withFindings.length, totalFindings, hunkResults },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `\nParallel Diff Review: ${hunks.length} hunks, ${totalFindings} findings in ${withFindings.length} hunks`,
  );
  console.log("═".repeat(70));

  for (const hr of hunkResults) {
    if (hr.findingCount === 0) continue;
    console.log(`\n  ${hr.file} (lines ${hr.startLine}-${hr.endLine}): ${hr.findingCount} finding(s)`);
    for (const f of hr.findings) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
  }

  if (withFindings.length === 0) {
    console.log("  No findings in changed regions.");
  }
  console.log("═".repeat(70));
}
