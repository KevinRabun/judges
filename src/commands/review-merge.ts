/**
 * Review-merge — Merge multiple review results into a consolidated report.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MergedReport {
  sources: string[];
  mergedAt: string;
  totalFindings: number;
  uniqueFindings: number;
  deduplicatedCount: number;
  overallScore: number;
  findings: Finding[];
  summary: string;
}

// ─── Deduplication ──────────────────────────────────────────────────────────

function fingerprintFinding(f: Finding): string {
  const parts = [f.ruleId || "", f.title || "", String(f.severity || "")];
  if (f.lineNumbers && f.lineNumbers.length > 0) {
    parts.push(f.lineNumbers.join(","));
  }
  return parts.join("|").toLowerCase();
}

function deduplicateFindings(allFindings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const f of allFindings) {
    const fp = fingerprintFinding(f);
    if (!seen.has(fp)) {
      seen.add(fp);
      unique.push(f);
    }
  }
  return unique;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMerge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-merge — Merge multiple review results

Usage:
  judges review-merge --files a.json b.json c.json   Merge verdict files
  judges review-merge --dir ./results                 Merge all .json in dir
  judges review-merge --output merged.json            Write merged output
  judges review-merge --format json                   JSON output

Options:
  --files <paths...>     Verdict JSON files to merge
  --dir <directory>      Directory containing verdict files
  --output <file>        Write merged results to file
  --format json          JSON output
  --help, -h             Show this help

Merges multiple review results into a single consolidated
report, deduplicating findings and averaging scores.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  // Collect input files
  const files: string[] = [];
  const filesIdx = argv.indexOf("--files");
  if (filesIdx !== -1) {
    for (let i = filesIdx + 1; i < argv.length; i++) {
      if (argv[i].startsWith("--")) break;
      files.push(argv[i]);
    }
  }

  const dirArg = argv.find((_a: string, i: number) => argv[i - 1] === "--dir");
  if (dirArg && existsSync(dirArg)) {
    try {
      const entries = readdirSync(dirArg) as unknown as string[];
      for (const entry of entries) {
        if (typeof entry === "string" && entry.endsWith(".json")) {
          files.push(join(dirArg, entry));
        }
      }
    } catch {
      // skip unreadable directory
    }
  }

  if (files.length === 0) {
    console.error("Error: No input files. Use --files or --dir.");
    process.exitCode = 1;
    return;
  }

  // Load verdicts
  const allFindings: Finding[] = [];
  const scores: number[] = [];
  const loadedFiles: string[] = [];

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`Warning: File not found: ${file}`);
      continue;
    }
    try {
      const raw = readFileSync(file, "utf-8");
      const data = JSON.parse(raw) as Partial<TribunalVerdict>;
      if (data.findings) allFindings.push(...data.findings);
      if (typeof data.overallScore === "number") scores.push(data.overallScore);
      loadedFiles.push(file);
    } catch {
      console.error(`Warning: Could not parse: ${file}`);
    }
  }

  if (loadedFiles.length === 0) {
    console.error("Error: No valid verdict files found.");
    process.exitCode = 1;
    return;
  }

  const unique = deduplicateFindings(allFindings);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const report: MergedReport = {
    sources: loadedFiles,
    mergedAt: new Date().toISOString(),
    totalFindings: allFindings.length,
    uniqueFindings: unique.length,
    deduplicatedCount: allFindings.length - unique.length,
    overallScore: avgScore,
    findings: unique,
    summary: `Merged ${loadedFiles.length} verdict files. ${unique.length} unique findings from ${allFindings.length} total (${allFindings.length - unique.length} duplicates removed). Average score: ${avgScore}/100.`,
  };

  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify(report, null, 2), "utf-8");
    console.log(`Merged results written to ${outputFile}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Merged Review Results\n  ─────────────────────────────`);
  console.log(`    Sources: ${loadedFiles.length} files`);
  console.log(`    Total findings: ${allFindings.length}`);
  console.log(`    Unique findings: ${unique.length}`);
  console.log(`    Duplicates removed: ${allFindings.length - unique.length}`);
  console.log(`    Average score: ${avgScore}/100`);
  console.log();

  const bySeverity = new Map<string, number>();
  for (const f of unique) {
    const sev = f.severity || "unknown";
    bySeverity.set(sev, (bySeverity.get(sev) || 0) + 1);
  }
  console.log("    By severity:");
  for (const [sev, count] of bySeverity) {
    console.log(`      ${sev}: ${count}`);
  }

  console.log();
}
