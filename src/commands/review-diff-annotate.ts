/**
 * Review-diff-annotate — Annotate diff hunks with review findings.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDiffAnnotate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-diff-annotate — Annotate diff hunks with review findings

Usage:
  judges review-diff-annotate --diff changes.diff --results results.json

Options:
  --diff <path>         Path to unified diff file
  --results <path>      Path to review result JSON
  --format json         JSON output
  --help, -h            Show this help

Overlays review findings onto diff output, showing which changed
lines have associated findings.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const diffPath = argv.find((_a: string, i: number) => argv[i - 1] === "--diff") || "";
  const resultsPath = argv.find((_a: string, i: number) => argv[i - 1] === "--results") || "";

  if (!diffPath || !resultsPath) {
    console.log("Specify --diff and --results paths.");
    return;
  }

  if (!existsSync(diffPath)) {
    console.log(`Diff file not found: ${diffPath}`);
    return;
  }
  if (!existsSync(resultsPath)) {
    console.log(`Results file not found: ${resultsPath}`);
    return;
  }

  const diffContent = readFileSync(diffPath, "utf-8");

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(readFileSync(resultsPath, "utf-8")) as Record<string, unknown>;
  } catch {
    console.log(`Failed to parse results: ${resultsPath}`);
    return;
  }

  const findings = Array.isArray(data.findings) ? data.findings : [];

  // Build line-number to finding map
  interface FindingLike {
    lineNumbers?: number[];
    ruleId?: string;
    title?: string;
    severity?: string;
  }
  const lineMap = new Map<number, FindingLike[]>();
  for (const f of findings as FindingLike[]) {
    if (Array.isArray(f.lineNumbers)) {
      for (const ln of f.lineNumbers) {
        const existing = lineMap.get(ln) || [];
        existing.push(f);
        lineMap.set(ln, existing);
      }
    }
  }

  // Parse diff and annotate
  const diffLines = diffContent.split("\n");
  const annotated: Array<{ line: string; findings: FindingLike[] }> = [];
  let currentLine = 0;

  for (const line of diffLines) {
    // Parse hunk header for line numbers
    const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentLine++;
      const matched = lineMap.get(currentLine) || [];
      annotated.push({ line, findings: matched });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      annotated.push({ line, findings: [] });
    } else {
      if (!line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("@@")) {
        currentLine++;
      }
      annotated.push({ line, findings: [] });
    }
  }

  const annotatedCount = annotated.filter((a) => a.findings.length > 0).length;

  if (format === "json") {
    console.log(
      JSON.stringify(
        { totalLines: diffLines.length, annotatedLines: annotatedCount, findings: findings.length },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nAnnotated Diff (${annotatedCount} lines with findings):`);
  console.log("═".repeat(70));

  for (const a of annotated) {
    if (a.findings.length > 0) {
      console.log(a.line);
      for (const f of a.findings) {
        console.log(`  >>> [${String(f.severity || "?").toUpperCase()}] ${f.ruleId || ""}: ${f.title || ""}`);
      }
    } else {
      console.log(a.line);
    }
  }

  console.log("═".repeat(70));
}
