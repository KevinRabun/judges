/**
 * Finding-dedup-cross — Deduplicate findings across multiple review files.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DedupResult {
  unique: number;
  duplicates: number;
  findings: Array<Finding & { seenIn: string[] }>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDedupCross(argv: string[]): void {
  const filesIdx = argv.indexOf("--files");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dedup-cross — Deduplicate findings across reviews

Usage:
  judges finding-dedup-cross --files <file1.json> <file2.json> ...
                             [--format table|json]

Options:
  --files <paths>   Review JSON files (space-separated)
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (filesIdx < 0) {
    console.error("Error: --files is required");
    process.exitCode = 1;
    return;
  }

  // Collect file paths (everything after --files until next flag)
  const filePaths: string[] = [];
  for (let i = filesIdx + 1; i < argv.length; i++) {
    if (argv[i].startsWith("--")) break;
    filePaths.push(argv[i]);
  }

  if (filePaths.length === 0) {
    console.error("Error: no files specified after --files");
    process.exitCode = 1;
    return;
  }

  const seen = new Map<string, Finding & { seenIn: string[] }>();
  let totalDuplicates = 0;

  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`Warning: file not found, skipping: ${fp}`);
      continue;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(fp, "utf-8")) as TribunalVerdict;
    } catch {
      console.error(`Warning: failed to parse, skipping: ${fp}`);
      continue;
    }

    for (const f of verdict.findings) {
      const key = `${f.ruleId}|${f.title}|${f.severity}`;
      const existing = seen.get(key);
      if (existing !== undefined) {
        if (!existing.seenIn.includes(fp)) {
          existing.seenIn.push(fp);
        }
        totalDuplicates++;
      } else {
        seen.set(key, { ...f, seenIn: [fp] });
      }
    }
  }

  const result: DedupResult = {
    unique: seen.size,
    duplicates: totalDuplicates,
    findings: [...seen.values()],
  };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nCross-Review Deduplication`);
  console.log(`  Files analyzed: ${filePaths.length}`);
  console.log(`  Unique findings: ${result.unique}`);
  console.log(`  Duplicates removed: ${result.duplicates}`);
  console.log("═".repeat(65));

  for (const f of result.findings) {
    const dupLabel = f.seenIn.length > 1 ? ` (in ${f.seenIn.length} files)` : "";
    console.log(`  [${f.severity}] ${f.ruleId}: ${f.title}${dupLabel}`);
  }

  console.log("═".repeat(65));
}
