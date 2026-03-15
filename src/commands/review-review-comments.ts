/**
 * Review-review-comments — Generate structured review comments from findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewComment {
  ruleId: string;
  severity: string;
  title: string;
  body: string;
  lineRef: string;
  suggestion: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewReviewComments(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const styleIdx = argv.indexOf("--style");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const style = styleIdx >= 0 ? argv[styleIdx + 1] : "detailed";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-review-comments — Generate structured review comments

Usage:
  judges review-review-comments --report <path> [--style <style>]
                                [--format table|json]

Options:
  --report <path>   Report file with findings
  --style <style>   Comment style: detailed (default), concise, inline
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
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

  if (findings.length === 0) {
    console.log("No findings to generate comments for.");
    return;
  }

  const comments: ReviewComment[] = findings.map((f) => {
    const lineRef =
      f.lineNumbers !== undefined && f.lineNumbers.length > 0
        ? `L${f.lineNumbers[0]}${f.lineNumbers.length > 1 ? `-L${f.lineNumbers[f.lineNumbers.length - 1]}` : ""}`
        : "N/A";

    let body: string;
    if (style === "concise") {
      body = `[${f.severity.toUpperCase()}] ${f.title}`;
    } else if (style === "inline") {
      body = `// ${f.severity.toUpperCase()}: ${f.title} — ${f.recommendation}`;
    } else {
      body = `**${f.severity.toUpperCase()}**: ${f.title}\n\n${f.description}\n\n**Recommendation**: ${f.recommendation}`;
    }

    return {
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      body,
      lineRef,
      suggestion: f.recommendation,
    };
  });

  if (format === "json") {
    console.log(JSON.stringify(comments, null, 2));
    return;
  }

  console.log(`\nReview Comments (${style})`);
  console.log("═".repeat(70));

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    console.log(`\n  Comment ${i + 1} [${c.lineRef}]:`);
    console.log("  " + "─".repeat(60));
    for (const line of c.body.split("\n")) {
      console.log(`  ${line}`);
    }
  }

  console.log(`\n  Total comments: ${comments.length}`);
  console.log("═".repeat(70));
}
