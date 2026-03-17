/**
 * Review-blame-map — Map findings to git blame authors for accountability.
 */

import type { TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";
import { runGit } from "../tools/command-safety.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBlameMap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges review-blame-map — Map findings to git blame authors

Usage:
  judges review-blame-map --file <results.json> --source <path> [options]

Options:
  --file <path>      Result file (required)
  --source <path>    Source file for blame lookup (required)
  --format json      JSON output
  --help, -h         Show this help

Associates findings with the author who wrote the related code via git blame.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const source = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!source) {
    console.error("Error: --source required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(source)) {
    console.error(`Error: source not found: ${source}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  // Parse git blame
  const authorMap = new Map<number, string>();
  try {
    const blame = runGit(["blame", "--porcelain", "--", source], { trim: false });
    let currentLine = 0;
    for (const line of blame.split("\n")) {
      const lineMatch = /^[0-9a-f]{40}\s+\d+\s+(\d+)/.exec(line);
      if (lineMatch) currentLine = parseInt(lineMatch[1], 10);
      if (line.startsWith("author ") && currentLine > 0) {
        authorMap.set(currentLine, line.slice(7));
      }
    }
  } catch {
    console.error("Warning: could not run git blame on source file");
  }

  const findings = verdict.findings || [];
  const authorFindings = new Map<string, number>();

  for (const f of findings) {
    const lines = f.lineNumbers || [];
    for (const ln of lines) {
      const author = authorMap.get(ln) || "unknown";
      authorFindings.set(author, (authorFindings.get(author) || 0) + 1);
    }
  }

  const sorted = [...authorFindings.entries()].sort((a, b) => b[1] - a[1]);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          totalFindings: findings.length,
          authors: sorted.map(([author, count]) => ({ author, findingCount: count })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nBlame Map:`);
  console.log("═".repeat(55));
  console.log(`  ${findings.length} findings mapped across ${sorted.length} authors`);
  console.log("─".repeat(55));
  for (const [author, count] of sorted) {
    const bar = "█".repeat(Math.min(count, 30));
    console.log(`  ${author.padEnd(25)} ${String(count).padStart(4)}  ${bar}`);
  }
  console.log("═".repeat(55));
}
