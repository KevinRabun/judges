/**
 * Finding-groupby-file — Group findings by source file path.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileGroup {
  file: string;
  findings: Array<{
    ruleId: string;
    severity: string;
    title: string;
    lineNumbers: number[];
  }>;
  count: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferFile(f: Finding): string {
  // Use provenance if available, otherwise group by rule prefix
  if (f.provenance !== undefined && typeof f.provenance === "string" && f.provenance.length > 0) {
    return f.provenance;
  }
  const prefix = f.ruleId.split("-")[0];
  return `[${prefix}]`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingGroupbyFile(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const sortIdx = argv.indexOf("--sort");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const sortBy = sortIdx >= 0 ? argv[sortIdx + 1] : "count";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-groupby-file — Group findings by source file

Usage:
  judges finding-groupby-file --file <review.json> [--sort count|name]
                              [--format table|json]

Options:
  --file <path>    Review result JSON file
  --sort <by>      Sort by: count (default), name
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file is required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const groupMap = new Map<string, FileGroup>();

  for (const f of verdict.findings) {
    const fileName = inferFile(f);
    let group = groupMap.get(fileName);
    if (group === undefined) {
      group = { file: fileName, findings: [], count: 0 };
      groupMap.set(fileName, group);
    }
    group.findings.push({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      lineNumbers: f.lineNumbers !== undefined ? f.lineNumbers : [],
    });
    group.count++;
  }

  const groups = [...groupMap.values()];
  if (sortBy === "name") {
    groups.sort((a, b) => a.file.localeCompare(b.file));
  } else {
    groups.sort((a, b) => b.count - a.count);
  }

  if (format === "json") {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  console.log(`\nFindings by File: ${groups.length} group(s), ${verdict.findings.length} total`);
  console.log("═".repeat(65));

  for (const g of groups) {
    console.log(`\n  ${g.file} (${g.count} finding${g.count !== 1 ? "s" : ""})`);
    for (const f of g.findings) {
      const lines = f.lineNumbers.length > 0 ? ` L${f.lineNumbers.join(",")}` : "";
      console.log(`    [${f.severity}] ${f.ruleId}${lines}: ${f.title}`);
    }
  }

  console.log("\n" + "═".repeat(65));
}
