/**
 * Review-report-merge — Merge multiple verdict reports into one.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewReportMerge(argv: string[]): void {
  const outIdx = argv.indexOf("--out");
  const formatIdx = argv.indexOf("--format");
  const outFile = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "json";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-report-merge — Merge multiple verdict reports

Usage:
  judges review-report-merge <file1.json> <file2.json> [...]
        [--out <merged.json>] [--format json|summary]

Options:
  --out <path>       Output file for merged report (prints to stdout if omitted)
  --format <fmt>     Output format: json (default), summary
  --help, -h         Show this help
`);
    return;
  }

  const files = argv.filter(
    (a) =>
      !a.startsWith("--") &&
      (argv.indexOf(a) === 0 || (argv[argv.indexOf(a) - 1] !== "--out" && argv[argv.indexOf(a) - 1] !== "--format")),
  );

  if (files.length < 2) {
    console.error("Error: provide at least 2 verdict files");
    process.exitCode = 1;
    return;
  }

  const verdicts: TribunalVerdict[] = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(`Error: not found: ${f}`);
      process.exitCode = 1;
      return;
    }
    try {
      verdicts.push(JSON.parse(readFileSync(f, "utf-8")));
    } catch {
      console.error(`Error: invalid JSON: ${f}`);
      process.exitCode = 1;
      return;
    }
  }

  // Merge findings, dedup by ruleId + title
  const allFindings: Finding[] = [];
  const seen = new Set<string>();

  for (const v of verdicts) {
    for (const f of v.findings) {
      const key = `${f.ruleId}:${f.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(f);
      }
    }
  }

  const criticalCount = allFindings.filter((f) => (f.severity || "").toLowerCase() === "critical").length;
  const highCount = allFindings.filter((f) => (f.severity || "").toLowerCase() === "high").length;

  // Average scores
  const avgScore = Math.round(verdicts.reduce((s, v) => s + v.overallScore, 0) / verdicts.length);
  const overallVerdict = criticalCount > 0 ? "fail" : avgScore >= 70 ? "pass" : avgScore >= 40 ? "warning" : "fail";

  const merged: TribunalVerdict = {
    overallVerdict,
    overallScore: avgScore,
    summary: `Merged from ${verdicts.length} reports. ${allFindings.length} unique findings.`,
    findings: allFindings,
    evaluations: verdicts.flatMap((v) => v.evaluations || []),
    criticalCount,
    highCount,
    timestamp: new Date().toISOString(),
  };

  if (format === "summary") {
    console.log(`Merged ${verdicts.length} reports → ${allFindings.length} unique findings`);
    console.log(`Score: ${avgScore} | Verdict: ${overallVerdict}`);
    console.log(`Critical: ${criticalCount} | High: ${highCount}`);
    return;
  }

  const json = JSON.stringify(merged, null, 2);

  if (outFile) {
    writeFileSync(outFile, json);
    console.log(`Merged report written to: ${outFile}`);
  } else {
    console.log(json);
  }
}
