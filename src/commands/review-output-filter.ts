/**
 * Review-output-filter — Filter and transform review output.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOutputFilter(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sevIdx = argv.indexOf("--severity");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const limitIdx = argv.indexOf("--limit");
  const excludeIdx = argv.indexOf("--exclude-rule");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const severity = sevIdx >= 0 ? argv[sevIdx + 1] : undefined;
  const rule = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : 0;
  const excludeRule = excludeIdx >= 0 ? argv[excludeIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-output-filter — Filter review output

Usage:
  judges review-output-filter --file <verdict.json>
        [--severity critical|high|medium|low]
        [--rule <ruleId>] [--exclude-rule <ruleId>]
        [--limit <n>] [--format table|json|summary]

Options:
  --file <path>          Path to verdict JSON file (required)
  --severity <sev>       Filter by minimum severity
  --rule <ruleId>        Show only this rule
  --exclude-rule <id>    Exclude this rule from output
  --limit <n>            Limit number of findings shown
  --format <fmt>         Output format: table (default), json, summary
  --help, -h             Show this help
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

  let filtered = [...verdict.findings];

  // severity filter
  if (severity) {
    const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    const minLevel = sevOrder[severity.toLowerCase()] || 0;
    filtered = filtered.filter((f) => (sevOrder[(f.severity || "medium").toLowerCase()] || 0) >= minLevel);
  }

  // rule filter
  if (rule) {
    filtered = filtered.filter((f) => f.ruleId === rule);
  }

  // exclude filter
  if (excludeRule) {
    filtered = filtered.filter((f) => f.ruleId !== excludeRule);
  }

  // limit
  if (limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          verdict: verdict.overallVerdict,
          score: verdict.overallScore,
          totalFindings: verdict.findings.length,
          filteredCount: filtered.length,
          findings: filtered,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (format === "summary") {
    const bySev = new Map<string, number>();
    for (const f of filtered) {
      const sev = (f.severity || "medium").toLowerCase();
      bySev.set(sev, (bySev.get(sev) || 0) + 1);
    }
    console.log(
      `Verdict: ${verdict.overallVerdict} | Score: ${verdict.overallScore} | Showing: ${filtered.length}/${verdict.findings.length}`,
    );
    for (const [sev, count] of bySev) {
      console.log(`  ${sev}: ${count}`);
    }
    return;
  }

  console.log(`\nFiltered Review Output (${filtered.length}/${verdict.findings.length} findings)`);
  console.log("═".repeat(75));
  console.log(`${"#".padEnd(4)} ${"Severity".padEnd(10)} ${"Rule".padEnd(25)} Title`);
  console.log("─".repeat(75));

  for (let i = 0; i < filtered.length; i++) {
    const f = filtered[i];
    const sev = (f.severity || "medium").toLowerCase();
    const rule = f.ruleId.length > 23 ? f.ruleId.slice(0, 23) + "…" : f.ruleId;
    const title = f.title.length > 30 ? f.title.slice(0, 30) + "…" : f.title;
    console.log(`${String(i + 1).padEnd(4)} ${sev.padEnd(10)} ${rule.padEnd(25)} ${title}`);
  }

  console.log("═".repeat(75));
}
