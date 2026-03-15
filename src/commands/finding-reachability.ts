/**
 * Finding-reachability — Analyze whether findings are on reachable code paths.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReachabilityResult {
  ruleId: string;
  title: string;
  severity: string;
  reachable: "yes" | "no" | "unknown";
  reason: string;
  lineNumbers: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEAD_CODE_PATTERNS = [
  { pattern: /^\s*\/\//, label: "commented-out code" },
  { pattern: /^\s*#\s*if\s+0/, label: "disabled preprocessor block" },
  { pattern: /^\s*if\s*\(\s*false\s*\)/, label: "dead if(false) block" },
  { pattern: /^\s*return\s*;?\s*$/, label: "after return statement" },
];

function analyzeReachability(verdict: TribunalVerdict, sourceFile?: string): ReachabilityResult[] {
  const results: ReachabilityResult[] = [];
  let sourceLines: string[] | null = null;

  if (sourceFile && existsSync(sourceFile)) {
    sourceLines = readFileSync(sourceFile, "utf-8").split("\n");
  }

  for (const f of verdict.findings) {
    const lineNums = f.lineNumbers || [];
    let reachable: "yes" | "no" | "unknown" = "unknown";
    let reason = "no line number data";

    if (sourceLines !== null && lineNums.length > 0) {
      const deadReasons: string[] = [];

      for (const ln of lineNums) {
        if (ln <= 0 || ln > sourceLines.length) continue;
        const line = sourceLines[ln - 1];

        for (const dp of DEAD_CODE_PATTERNS) {
          if (dp.pattern.test(line)) {
            deadReasons.push(`line ${ln}: ${dp.label}`);
          }
        }

        // check if preceding line is return/throw
        if (ln > 1) {
          const prevLine = sourceLines[ln - 2].trim();
          if (
            prevLine.startsWith("return ") ||
            prevLine.startsWith("throw ") ||
            prevLine === "return;" ||
            prevLine === "return"
          ) {
            deadReasons.push(`line ${ln}: after return/throw`);
          }
        }
      }

      if (deadReasons.length > 0) {
        reachable = "no";
        reason = deadReasons.join("; ");
      } else {
        reachable = "yes";
        reason = "code appears reachable";
      }
    } else if (lineNums.length === 0) {
      reachable = "unknown";
      reason = "no line number information";
    }

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      reachable,
      reason,
      lineNumbers: lineNums,
    });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingReachability(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-reachability — Analyze finding reachability

Usage:
  judges finding-reachability --file <verdict.json> [--source <src.ts>]
                              [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file to check reachability against
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const results = analyzeReachability(verdict, sourceFile);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const reachable = results.filter((r) => r.reachable === "yes").length;
  const unreachable = results.filter((r) => r.reachable === "no").length;
  const unknown = results.filter((r) => r.reachable === "unknown").length;

  console.log(`\nReachability Analysis (${results.length} findings)`);
  console.log("═".repeat(70));
  console.log(`  Reachable: ${reachable}  |  Unreachable: ${unreachable}  |  Unknown: ${unknown}`);
  console.log("─".repeat(70));
  console.log(`${"Status".padEnd(10)} ${"Severity".padEnd(10)} ${"Rule".padEnd(25)} Reason`);
  console.log("─".repeat(70));

  for (const r of results) {
    const rule = r.ruleId.length > 23 ? r.ruleId.slice(0, 23) + "…" : r.ruleId;
    const reason = r.reason.length > 30 ? r.reason.slice(0, 30) + "…" : r.reason;
    console.log(`${r.reachable.padEnd(10)} ${r.severity.padEnd(10)} ${rule.padEnd(25)} ${reason}`);
  }
  console.log("═".repeat(70));
}
