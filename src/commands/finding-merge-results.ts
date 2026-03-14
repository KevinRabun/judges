/**
 * Finding-merge-results — Merge findings from multiple review result files.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingMergeResults(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-merge-results — Merge results from multiple review runs

Usage:
  judges finding-merge-results --files <f1,f2,...> [options]

Options:
  --files <list>     Comma-separated result files (required)
  --output <path>    Output file for merged results (optional)
  --dedup            Deduplicate findings by ruleId (default: false)
  --format json      JSON output
  --help, -h         Show this help

Merges findings from multiple result files into a single consolidated result.
`);
    return;
  }

  const filesStr = argv.find((_a: string, i: number) => argv[i - 1] === "--files");
  if (!filesStr) {
    console.error("Error: --files required");
    process.exitCode = 1;
    return;
  }

  const files = filesStr
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const output = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
  const dedup = argv.includes("--dedup");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  interface MergedFinding {
    ruleId: string;
    severity: string;
    title: string;
    description: string;
    source: string;
  }

  const allFindings: MergedFinding[] = [];
  const loadedFiles: string[] = [];

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`Warning: file not found: ${file}`);
      continue;
    }
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      const findings = data.findings || (Array.isArray(data) ? data : []);
      for (const f of findings) {
        allFindings.push({
          ruleId: f.ruleId || "unknown",
          severity: f.severity || "medium",
          title: f.title || "",
          description: f.description || "",
          source: file,
        });
      }
      loadedFiles.push(file);
    } catch {
      console.error(`Warning: could not parse: ${file}`);
    }
  }

  let merged = allFindings;
  let duplicatesRemoved = 0;

  if (dedup) {
    const seen = new Set<string>();
    const deduped: MergedFinding[] = [];
    for (const f of merged) {
      const key = `${f.ruleId}:${f.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(f);
      }
    }
    duplicatesRemoved = merged.length - deduped.length;
    merged = deduped;
  }

  // Write output if requested
  if (output) {
    const result = {
      mergedAt: new Date().toISOString(),
      sources: loadedFiles,
      totalFindings: merged.length,
      duplicatesRemoved,
      findings: merged,
    };
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(`Merged results written to: ${output}`);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        { sources: loadedFiles.length, total: allFindings.length, merged: merged.length, duplicatesRemoved },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nMerged Results:`);
  console.log("═".repeat(60));
  console.log(`  Sources: ${loadedFiles.length} files`);
  console.log(`  Total findings: ${allFindings.length}`);
  if (dedup) console.log(`  After dedup: ${merged.length} (${duplicatesRemoved} removed)`);
  console.log("─".repeat(60));

  // Summary by severity
  const bySev = new Map<string, number>();
  for (const f of merged) {
    bySev.set(f.severity, (bySev.get(f.severity) || 0) + 1);
  }
  for (const [sev, count] of [...bySev.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sev.toUpperCase().padEnd(12)} ${count}`);
  }
  console.log("═".repeat(60));
}
