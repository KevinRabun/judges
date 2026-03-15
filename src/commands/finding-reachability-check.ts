/**
 * Finding-reachability-check — Check if findings affect reachable code paths.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReachabilityResult {
  ruleId: string;
  title: string;
  severity: string;
  reachable: boolean;
  reason: string;
  lineNumbers: number[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingReachabilityCheck(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const sourceIdx = argv.indexOf("--source");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-reachability-check — Check finding reachability

Usage:
  judges finding-reachability-check --report <path> [--source <path>]
                                    [--format table|json]

Options:
  --report <path>   Report file with findings
  --source <path>   Source file to check reachability against
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help

Checks if findings reference code that is reachable in the source.
`);
    return;
  }

  if (reportIdx < 0) {
    console.error("Missing --report <path>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = report.findings ?? [];

  let sourceLines: string[] = [];
  if (sourceIdx >= 0) {
    const sourcePath = argv[sourceIdx + 1];
    if (existsSync(sourcePath)) {
      sourceLines = readFileSync(sourcePath, "utf-8").split("\n");
    }
  }

  const results: ReachabilityResult[] = findings.map((f) => {
    const lines = f.lineNumbers ?? [];
    let reachable = true;
    let reason = "assumed reachable";

    if (sourceLines.length > 0 && lines.length > 0) {
      // Check if the referenced lines exist and are not commented out
      const referencedLine = lines[0] - 1;
      if (referencedLine >= 0 && referencedLine < sourceLines.length) {
        const line = sourceLines[referencedLine].trim();
        if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("#") || line.startsWith("*")) {
          reachable = false;
          reason = "line is commented out";
        } else if (line.length === 0) {
          reachable = false;
          reason = "line is empty";
        } else {
          reason = "line exists and is active code";
        }
      } else {
        reachable = false;
        reason = "line number out of range";
      }
    } else if (lines.length === 0) {
      reason = "no line reference — assumed reachable";
    }

    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      reachable,
      reason,
      lineNumbers: lines,
    };
  });

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nReachability Check`);
  console.log("═".repeat(70));

  const reachableCount = results.filter((r) => r.reachable).length;
  const unreachableCount = results.filter((r) => !r.reachable).length;

  for (const r of results) {
    const status = r.reachable ? "REACHABLE" : "UNREACHABLE";
    const lineRef = r.lineNumbers.length > 0 ? `L${r.lineNumbers[0]}` : "N/A";
    console.log(`  [${status.padEnd(11)}] ${r.ruleId.padEnd(25)} ${lineRef.padEnd(8)} ${r.reason}`);
  }

  console.log(`\n  Reachable: ${reachableCount} | Unreachable: ${unreachableCount} | Total: ${results.length}`);
  console.log("═".repeat(70));
}
