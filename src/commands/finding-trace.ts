/**
 * Finding-trace — Trace findings to their origin commit.
 */

import type { TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingTrace(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-trace — Trace findings to origin commits

Usage:
  judges finding-trace --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --source <path>    Source file to trace against (for git blame)
  --top <n>          Show top N findings (default: 10)
  --format json      JSON output
  --help, -h         Show this help

Uses git blame to associate findings with the commits that introduced them.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const sourcePath = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const topStr = argv.find((_a: string, i: number) => argv[i - 1] === "--top");
  const top = topStr ? parseInt(topStr, 10) : 10;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];

  interface TracedFinding {
    ruleId: string;
    title: string;
    severity: string;
    lineNumbers: number[];
    commitInfo: string[];
  }

  const traced: TracedFinding[] = [];

  // Get blame info for source if provided
  let blameLines: string[] = [];
  if (sourcePath && existsSync(sourcePath)) {
    try {
      blameLines = execSync(`git blame --porcelain "${sourcePath}"`, { encoding: "utf-8" }).split("\n");
    } catch {
      // Not in a git repo or file not tracked
    }
  }

  // Parse blame data into commit map
  const lineCommits = new Map<number, string>();
  if (blameLines.length > 0) {
    let currentLine = 0;
    for (const line of blameLines) {
      const match = /^[0-9a-f]{40}\s+\d+\s+(\d+)/.exec(line);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
      if (line.startsWith("summary ") && currentLine > 0) {
        lineCommits.set(currentLine, line.slice(8));
      }
    }
  }

  for (const f of findings) {
    const lines = f.lineNumbers || [];
    const commits: string[] = [];

    for (const ln of lines) {
      const commit = lineCommits.get(ln);
      if (commit && !commits.includes(commit)) commits.push(commit);
    }

    traced.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      lineNumbers: lines,
      commitInfo: commits,
    });
  }

  const display = traced.slice(0, top);

  if (format === "json") {
    console.log(JSON.stringify({ totalFindings: findings.length, traced: display.length, findings: display }, null, 2));
    return;
  }

  console.log(`\nFinding Trace:`);
  console.log("═".repeat(70));
  console.log(`  ${findings.length} findings, showing top ${display.length}`);
  if (sourcePath) console.log(`  Source: ${sourcePath}`);
  console.log("─".repeat(70));

  for (const t of display) {
    console.log(`\n  ${t.ruleId || "unknown"} [${t.severity.toUpperCase()}]`);
    console.log(`    ${t.title}`);
    if (t.lineNumbers.length > 0) console.log(`    Lines: ${t.lineNumbers.join(", ")}`);
    if (t.commitInfo.length > 0) {
      console.log(`    Commits:`);
      for (const c of t.commitInfo.slice(0, 3)) console.log(`      → ${c}`);
    } else {
      console.log(`    (no commit trace available)`);
    }
  }
  console.log("\n" + "═".repeat(70));
}
