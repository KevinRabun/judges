/**
 * Finding-line-blame — Map findings to git blame information.
 *
 * Shows who last modified lines associated with findings,
 * helping attribute findings to specific changes/authors.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BlameInfo {
  line: number;
  author: string;
  date: string;
  commit: string;
}

interface FindingBlame {
  ruleId: string;
  title: string;
  severity: string;
  blameLines: BlameInfo[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBlameForLines(file: string, lines: number[]): BlameInfo[] {
  const results: BlameInfo[] = [];

  for (const line of lines) {
    try {
      const output = execSync(`git blame -L ${line},${line} --porcelain "${file}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      let author = "unknown";
      let date = "";
      let commit = "";

      for (const blameLine of output.split("\n")) {
        if (blameLine.startsWith("author ")) author = blameLine.slice(7);
        else if (blameLine.startsWith("author-time ")) {
          const ts = parseInt(blameLine.slice(12), 10);
          date = new Date(ts * 1000).toISOString().split("T")[0];
        } else if (/^[0-9a-f]{40}/.test(blameLine)) {
          commit = blameLine.split(" ")[0].slice(0, 8);
        }
      }

      results.push({ line, author, date, commit });
    } catch {
      /* skip lines that can't be blamed */
    }
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingLineBlame(argv: string[]): void {
  const verdictIdx = argv.indexOf("--verdict");
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const verdictPath = verdictIdx >= 0 ? argv[verdictIdx + 1] : undefined;
  const sourceFile = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-line-blame — Map findings to git blame

Usage:
  judges finding-line-blame --verdict <verdict.json> --file <source>
                             [--format table|json]

Options:
  --verdict <path>   Path to verdict JSON file (required)
  --file <path>      Source file to blame (required)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!verdictPath || !sourceFile) {
    console.error("Error: --verdict and --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(verdictPath)) {
    console.error(`Error: verdict not found: ${verdictPath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(sourceFile)) {
    console.error(`Error: file not found: ${sourceFile}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(verdictPath, "utf-8"));
  } catch {
    console.error("Error: invalid verdict JSON");
    process.exitCode = 1;
    return;
  }

  const results: FindingBlame[] = [];

  for (const f of verdict.findings) {
    if (!f.lineNumbers || f.lineNumbers.length === 0) continue;
    const blameLines = getBlameForLines(sourceFile, f.lineNumbers);
    if (blameLines.length > 0) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity || "medium",
        blameLines,
      });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log("No blame data available for findings.");
    return;
  }

  console.log(`\nFinding Line Blame — ${sourceFile}`);
  console.log("═".repeat(70));

  for (const r of results) {
    console.log(`\n  [${r.severity.toUpperCase()}] ${r.title}`);
    console.log(`  Rule: ${r.ruleId}`);
    for (const b of r.blameLines) {
      console.log(`    L${b.line}: ${b.author} (${b.date}) ${b.commit}`);
    }
  }

  // Author summary
  const authorCounts = new Map<string, number>();
  for (const r of results) {
    for (const b of r.blameLines) {
      authorCounts.set(b.author, (authorCounts.get(b.author) || 0) + 1);
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log("Author Summary:");
  for (const [author, count] of [...authorCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${author}: ${count} finding line(s)`);
  }
  console.log("═".repeat(70));
}
