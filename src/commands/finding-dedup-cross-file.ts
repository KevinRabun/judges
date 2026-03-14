/**
 * Finding-dedup-cross-file — Deduplicate findings across multiple result files.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeduplicatedFinding {
  ruleId: string;
  title: string;
  severity: string;
  occurrences: number;
  sources: string[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDedupCrossFile(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dedup-cross-file — Deduplicate findings across result files

Usage:
  judges finding-dedup-cross-file --files <f1,f2,...> [options]

Options:
  --files <list>      Comma-separated result files (required)
  --key <field>       Dedup key: ruleId, title, ruleId+title (default: ruleId)
  --format json       JSON output
  --help, -h          Show this help

Merges and deduplicates findings from multiple review runs.
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
  const key = argv.find((_a: string, i: number) => argv[i - 1] === "--key") || "ruleId";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const allFindings: Array<{ ruleId?: string; severity?: string; title?: string; source: string }> = [];

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`Warning: file not found: ${file}`);
      continue;
    }
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      const findings = Array.isArray(data) ? data : data.findings || [];
      for (const f of findings) {
        allFindings.push({ ...f, source: file });
      }
    } catch {
      console.error(`Warning: could not parse: ${file}`);
    }
  }

  // Deduplicate
  const groups = new Map<string, DeduplicatedFinding>();
  for (const f of allFindings) {
    let dedupKey: string;
    if (key === "title") dedupKey = f.title || "unknown";
    else if (key === "ruleId+title") dedupKey = `${f.ruleId || ""}:${f.title || ""}`;
    else dedupKey = f.ruleId || "unknown";

    if (!groups.has(dedupKey)) {
      groups.set(dedupKey, {
        ruleId: f.ruleId || "unknown",
        title: f.title || "",
        severity: f.severity || "medium",
        occurrences: 0,
        sources: [],
      });
    }
    const g = groups.get(dedupKey)!;
    g.occurrences++;
    if (!g.sources.includes(f.source)) g.sources.push(f.source);
  }

  const deduped = [...groups.values()].sort((a, b) => b.occurrences - a.occurrences);
  const duplicatesRemoved = allFindings.length - deduped.length;

  if (format === "json") {
    console.log(
      JSON.stringify(
        { totalInput: allFindings.length, uniqueFindings: deduped.length, duplicatesRemoved, findings: deduped },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nCross-File Deduplication:`);
  console.log("═".repeat(65));
  console.log(`  Input: ${allFindings.length} findings from ${files.length} files`);
  console.log(`  Unique: ${deduped.length} (${duplicatesRemoved} duplicates removed)`);
  console.log("─".repeat(65));

  for (const d of deduped.slice(0, 20)) {
    const srcCount = d.sources.length > 1 ? ` (${d.sources.length} files)` : "";
    console.log(`  ${d.ruleId.padEnd(25)} x${d.occurrences}${srcCount}  [${d.severity.toUpperCase()}]`);
  }
  if (deduped.length > 20) console.log(`  ... and ${deduped.length - 20} more`);
  console.log("═".repeat(65));
}
